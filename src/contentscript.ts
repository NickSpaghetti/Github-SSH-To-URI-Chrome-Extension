import { PageModuleService } from "./services/PageModuleService";
import { GitHubPageDataAccess } from "./data-access/GitHubPageDataAccess";
import { ChromeRuntimeParserService } from "./services/ChromeRuntimeParserService";
import { DisplayModule } from "./types/DisplayModule";
import { GITHUB_HOST } from "./util/Constants";
import { Nullable } from "./types/Nullable";
import { ChromeRuntimeFetchService } from "./data-access/ChromeRuntimeFetchService";
import { TerraformRegistryDataAccess } from "./data-access/TerraformRegistryDataAccess";
import { OpenTofuRegistryDataAccess } from "./data-access/OpenTofuRegistryDataAccess";
import { TerraformVersionService } from "./services/TerraformVersionService";
import { OpenTofuVersionService } from "./services/OpenTofuVersionService";
import { ModuleSourceLinker } from "./services/ModuleSourceLinker";
import { CACHE_KEYS, ChromeStorageCache } from "./services/ChromeStorageCache";
import { isSafeHttpUrl } from "./util/UrlSafety";
import { isBackgroundRefresh, shouldHandleMessage } from "./TabMessageGuards";

const fetchService = new ChromeRuntimeFetchService();
const githubPage = new GitHubPageDataAccess();
const pageModuleService = new PageModuleService(
    githubPage,
    new ChromeRuntimeParserService(),
    new ModuleSourceLinker(
        new TerraformVersionService(new TerraformRegistryDataAccess(fetchService)),
        new OpenTofuVersionService(new OpenTofuRegistryDataAccess(fetchService)),
    ),
);
const storageCache = new ChromeStorageCache();

const injectHyperLinksToPageAsync = async () => {
    if (window.location.host !== GITHUB_HOST) {
        return;
    }

    const fileType = githubPage.getFileType();
    if (fileType === null) {
        return;
    }
    const modules = await hydrateModulesAsync();
    addHyperLinksToModuleSource(modules ?? new Array<DisplayModule>());
};

const SOURCE_RENDER_TIMEOUT_MS = 5000;
const SOURCE_RENDER_POLL_MS = 250;

async function findSourcesWhenRenderedAsync(): Promise<Nullable<DisplayModule[]>> {
    const deadline = Date.now() + SOURCE_RENDER_TIMEOUT_MS;
    for (;;) {
        const modules = await pageModuleService.findSourcesAsync(window.location.href);
        if (modules !== null) {
            return modules;
        }
        if (Date.now() >= deadline) {
            return null;
        }
        await new Promise((resolve) => setTimeout(resolve, SOURCE_RENDER_POLL_MS));
    }
}

async function hydrateModulesAsync(): Promise<Array<DisplayModule>> {
    const cached = await storageCache.getAsync<Array<DisplayModule>>(CACHE_KEYS.MODULES);
    if (cached != null) {
        return cached;
    }
    const modules = await findSourcesWhenRenderedAsync();
    if (modules === null) {
        return [];
    }
    await storageCache.setAsync(CACHE_KEYS.MODULES, modules);
    return modules;
}

async function shouldModelsRehydrateAsync(): Promise<boolean> {
    const models = await storageCache.getAsync<Array<DisplayModule>>(CACHE_KEYS.MODULES);
    const url = await storageCache.getAsync<string>(CACHE_KEYS.CURRENT_TAB_URL);
    return models == null || url == null;
}

function addHyperLinksToModuleSource(modules: DisplayModule[]) {
    //all strings are stored in class 'pl-s'
    //gets all the TextNodes that contain the values between .pl-pds which are ".
    const childTextNodes = Array.from(
        document.querySelectorAll(`div[id^="LC"] > span.pl-s > span.pl-pds`),
    )
        .map((element) => element.parentElement)
        .filter(
            (htmlElement, index, self) =>
                htmlElement != null && self != null && self.indexOf(htmlElement) === index,
        )
        .map((htmlElement) => {
            const text: ChildNode[] = [];
            const childNodes = htmlElement?.childNodes;
            if (childNodes != null) {
                for (let i = 0; i < childNodes.length; i++) {
                    const node = childNodes[i];
                    if (node.nodeType === Node.TEXT_NODE) {
                        text.push(node);
                    }
                }
            }
            return text;
        })
        .flat();

    for (let i: number = 0; i < childTextNodes.length; i++) {
        const parent = childTextNodes[i]?.parentElement;
        if (parent == null || parent.textContent == null) {
            continue;
        }
        const text = parent.textContent.trim().split('"').join("");
        modules.forEach((module) => {
            if (module.source === text && module.resolvedUrl != null) {
                //Removes the attribute that prevents our a tag from being clicked on
                const grandParent = parent.closest("[inert]");
                grandParent?.removeAttribute("inert");
                replaceSourceTag(
                    childTextNodes[i],
                    module.resolvedUrl,
                    text,
                    parent?.parentElement?.id,
                );
            }
        });
    }

    //Changes the Z index so our a tag can be clicked on
    const reactLineNumbers = document.querySelector(".react-line-numbers") as HTMLElement;
    const reactLineNumbersZIndex = reactLineNumbers?.style?.zIndex ?? "2";
    console.log(reactLineNumbersZIndex);
    const reactCodeLines = document.querySelector(".react-code-lines") as HTMLElement;
    if (reactCodeLines !== null) {
        reactCodeLines.style.zIndex = String(reactLineNumbersZIndex + 1);
    }
}

function replaceSourceTag(
    childNode: HTMLElement | ChildNode,
    resolvedUrl: Nullable<string>,
    innerText: string,
    lineCount: string | undefined,
) {
    if (resolvedUrl === null || !isSafeHttpUrl(resolvedUrl)) {
        return;
    }

    const a = document.createElement("a");
    a.id = `GithubTerraformSourceUrl-${lineCount === undefined ? crypto.randomUUID() : lineCount}`;
    a.href = resolvedUrl;
    a.rel = "noreferrer";
    a.target = "_blank";
    a.innerText = innerText;
    a.style.cssText = `
        pointer-events: all !important;
        text-decoration: underline !important;
        cursor: pointer !important;
        display: inline !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        z-index: 9999 !important;
    `;

    childNode.replaceWith(a);
}

let shouldKeepChannelOpen = true; // Keep message channel open initally
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!shouldHandleMessage(message)) {
        sendResponse([]);
        return false;
    }
    const currentTab = message;

    const fileType = githubPage.getFileType();
    if (fileType === null) {
        console.log("was not found in HCLFileTypes");
        sendResponse([]);
        return false;
    }

    const handleMessage = (async () => {
        if (isBackgroundRefresh(message)) {
            await storageCache.clearAsync();
            await injectHyperLinksToPageAsync();
            sendResponse([]);
            return true;
        }

        let isRehydrateNeeded = false;
        const currentUrl = new URL(currentTab.tabUrl);
        const cachedCurrentUrl = await storageCache.getAsync<string>(CACHE_KEYS.CURRENT_TAB_URL);
        if (cachedCurrentUrl !== currentUrl.href) {
            await storageCache.setAsync(CACHE_KEYS.CURRENT_TAB_URL, currentUrl.href);
            isRehydrateNeeded = await shouldModelsRehydrateAsync();
        }

        let modules = await storageCache.getAsync<Array<DisplayModule>>(CACHE_KEYS.MODULES);
        if (isRehydrateNeeded) {
            const parsed = await pageModuleService.findSourcesAsync(window.location.href);
            if (parsed !== null) {
                await storageCache.setAsync(CACHE_KEYS.MODULES, parsed);
            }
            modules = await storageCache.getAsync<Array<DisplayModule>>(CACHE_KEYS.MODULES);
        }
        if (modules != null) {
            sendResponse(modules);
            return false;
        }
    })();
    handleMessage
        .then((keepChannelOpen) => {
            if (!keepChannelOpen) {
                sendResponse([]); // Ensure a response is sent if we're closing the channel
            }
            shouldKeepChannelOpen = keepChannelOpen ?? false;
        })
        .catch((err) => {
            console.log(err);
            sendResponse([]);
        });
    return shouldKeepChannelOpen;
});

let scrollTimeout: NodeJS.Timeout;
document.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(async () => {
        await injectHyperLinksToPageAsync();
    }, 100);
});

document.addEventListener("visibilitychange", async function () {
    const documentURL = new URL(document.URL);
    if (document.hidden && documentURL.hostname === GITHUB_HOST) {
        await storageCache.clearAsync();
    }
});
