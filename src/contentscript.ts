import { HclService } from "./services/HclService";
import { DisplayHlcModule } from "./models/DisplayHclModule";
import { CACHE_KEYS, GITHUB_ROUTES, SENDERS } from "./util/constants";
import { Nullable } from "./types/Nullable";
import { TerraformFetchService } from "./services/TerraformFetchService";
import { TerraformDataAccess } from "./data-access/TerraformDataAccess";
import { ChromeRuntimeFetchService } from "./services/ChromeRuntimeFetchService";
import { ITerraformDataAccess } from "./data-access/ITerraformDataAccess";
import { IFetchService } from "./services/IFetchService";
import { ITerraformFetchService } from "./services/ITerraformFetchService";
import { ChromeStorageCache } from "./services/ChromeStorageCache";

const fetchService: IFetchService = new ChromeRuntimeFetchService();
const terraformDataAccess: ITerraformDataAccess = new TerraformDataAccess(fetchService);
const terraformFetchService: ITerraformFetchService = new TerraformFetchService(
    terraformDataAccess,
);
const hclService = new HclService(terraformFetchService);
const chromeStroageCache = new ChromeStorageCache();

const injectHyperLinksToPageAsync = async () => {
    if (window.location.host !== GITHUB_ROUTES.HOST) {
        return;
    }

    const fileType = hclService.getFileType();
    if (fileType === null) {
        return;
    }
    //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
    const modules = await hydrateModulesAsync();
    addHyperLinksToModuleSource(modules ?? new Array<DisplayHlcModule>());
};

async function hydrateModulesAsync(): Promise<Array<DisplayHlcModule>> {
    let modules = await chromeStroageCache.getAsync<Array<DisplayHlcModule>>(CACHE_KEYS.MODULES);
    if (modules == null) {
        modules = await hclService.findSourcesAsync();
        await chromeStroageCache.setAsync(CACHE_KEYS.MODULES, modules);
    }
    return modules ?? [];
}

async function shouldModelsRehydrateAsync(): Promise<boolean> {
    const models = await chromeStroageCache.getAsync<Array<DisplayHlcModule>>(CACHE_KEYS.MODULES);
    const url = await chromeStroageCache.getAsync<URL>(CACHE_KEYS.CURRENT_TAB_URL);
    return models == null || url == null;
}

function addHyperLinksToModuleSource(modules: DisplayHlcModule[]) {
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
        const text = parent.textContent.trim().replace(/"/g, "");
        modules.forEach((module) => {
            if (module.source === text && module.modifiedSourceType != null) {
                //Removes the attribute that prevents our a tag from being clicked on
                const grandParent = parent.closest("[inert]");
                grandParent?.removeAttribute("inert");
                replaceSourceTag(
                    childTextNodes[i],
                    module.modifiedSourceType,
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
    modifiedSourceType: Nullable<string>,
    innerText: string,
    lineCount: string | undefined,
) {
    if (modifiedSourceType === null) {
        return;
    }

    const a = document.createElement("a");
    a.id = `GithubTerraformSourceUrl-${lineCount === undefined ? crypto.randomUUID() : lineCount}`;
    a.href = modifiedSourceType;
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
    const currentTab = message;
    if (
        (currentTab == null || currentTab?.tabUrl === "") &&
        currentTab.tabUrl.hostname !== GITHUB_ROUTES.HOST
    ) {
        sendResponse([]);
        return false;
    }

    const fileType = hclService.getFileType();
    //console.log(fileType);
    if (fileType === null) {
        console.log("was not found in HCLFileTypes");
        sendResponse([]);
        return false;
    }

    const handleMessage = (async () => {
        if (message === SENDERS.BACKGROUND) {
            await chromeStroageCache.clearAsync();
            await injectHyperLinksToPageAsync();
            sendResponse([]);
            return true;
        }

        let isRehydrateNeeded = false;
        const currentUrl = new URL(currentTab.tabUrl);
        const cachedCurrentUrl = await chromeStroageCache.getAsync<URL>(CACHE_KEYS.CURRENT_TAB_URL);
        if (cachedCurrentUrl?.href !== currentUrl.href) {
            await chromeStroageCache.setAsync(CACHE_KEYS.CURRENT_TAB_URL, currentUrl);
            isRehydrateNeeded = await shouldModelsRehydrateAsync();
        }

        //console.log(currentUrl.hostname)
        //console.log("looking for modules")
        // we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
        let modules = await chromeStroageCache.getAsync<Array<DisplayHlcModule>>(
            CACHE_KEYS.MODULES,
        );
        if (isRehydrateNeeded) {
            await chromeStroageCache.setAsync(
                CACHE_KEYS.MODULES,
                await hclService.findSourcesAsync(),
            );
            modules = await chromeStroageCache.getAsync<Array<DisplayHlcModule>>(
                CACHE_KEYS.MODULES,
            );
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
    if (document.hidden && documentURL.hostname === GITHUB_ROUTES.HOST) {
        await chromeStroageCache.clearAsync();
    }
});
