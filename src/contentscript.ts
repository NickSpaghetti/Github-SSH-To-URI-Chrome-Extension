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
import { ChromeStorageCache } from "./services/ChromeStorageCache";
import { readCachedModules } from "./types/CachedModules";
import { moduleCacheKey } from "./services/ModuleCacheKey";
import { cacheModulesAsync } from "./services/ModuleCacheWriter";
import { isSafeHttpUrl } from "./util/UrlSafety";
import { pollUntilAsync } from "./util/Poll";
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

/**
 * Reads the page's modules and links them.
 *
 * Every caller starts this and walks away, one of them from inside a
 * `setTimeout`, so a rejection here has nowhere to surface. Session storage
 * is the likeliest source: the worker raises the access level content scripts
 * need, and that call is still in flight for a moment after a cold start.
 * A page with no links is the right outcome; an unhandled rejection is not.
 */
const injectHyperLinksToPageAsync = async () => {
    if (window.location.host !== GITHUB_HOST) {
        return;
    }

    const fileType = githubPage.getFileType();
    if (fileType === null) {
        return;
    }
    try {
        const { modules, cacheAsync } = await hydrateModulesAsync();
        // Linked before cached. The commit header hydrates on github's own
        // schedule and the write below waits for it. A reader should not.
        addHyperLinksToModuleSource(modules);
        await cacheAsync();
    } catch (error) {
        console.log(`could not link this page's modules: ${String(error)}`);
    }
};

const SOURCE_RENDER_TIMEOUT_MS = 5000;
const SOURCE_RENDER_POLL_MS = 250;

/**
 * The header and the file body hydrate independently, and on a warm renderer
 * the body can win. The sources poll then returns at around 50ms while the
 * header is not up until around 170ms, so a single read came back empty for
 * about one file in seven and that file cached nothing.
 *
 * Measured across the fixtures, the header appears 0 to 172ms after the
 * document is ready. The deadline is short on purpose: the write now happens
 * after the links are drawn, so every millisecond of it is a millisecond in
 * which navigating away loses the entry.
 */
const COMMIT_IDENTITY_TIMEOUT_MS = 500;
const COMMIT_IDENTITY_POLL_MS = 25;

/** What the page holds, and the write that has not happened yet. */
type Hydrated = { modules: DisplayModule[]; cacheAsync: () => Promise<void> };

const findSourcesWhenRenderedAsync = async (): Promise<Nullable<DisplayModule[]>> =>
    await pollUntilAsync(
        async () => await pageModuleService.findSourcesAsync(window.location.href),
        SOURCE_RENDER_TIMEOUT_MS,
        SOURCE_RENDER_POLL_MS,
    );

/**
 * Caches the modules once the page says which commit they came from.
 * @param key The entry to write.
 * @param modules What the page declared.
 */
const cacheWhenIdentifiedAsync = async (key: string, modules: DisplayModule[]): Promise<void> => {
    const identity = await pollUntilAsync(
        () => githubPage.readCommitIdentity(),
        COMMIT_IDENTITY_TIMEOUT_MS,
        COMMIT_IDENTITY_POLL_MS,
    );
    if (identity === null) {
        return;
    }
    await cacheModulesAsync(storageCache, key, {
        sha: identity.sha,
        lastCommitDateTimeISO: identity.lastCommitDateTime,
        modules,
    });
};

/**
 * Reads the page's modules, from the cache where it can.
 *
 * The write is handed back rather than done here, so a caller can show the
 * links first and pay for the cache afterwards.
 * @returns The modules, and the write that stores them.
 */
async function hydrateModulesAsync(): Promise<Hydrated> {
    const nothingToWrite = () => Promise.resolve();
    const key = moduleCacheKey(window.location.href);
    const onEntry = githubPage.readCommitIdentity();
    if (onEntry !== null) {
        const cached = readCachedModules(await storageCache.getAsync(key));
        if (cached !== null && cached.sha === onEntry.sha) {
            return { modules: cached.modules, cacheAsync: nothingToWrite };
        }
    }

    const modules = await findSourcesWhenRenderedAsync();
    if (modules === null) {
        return { modules: [], cacheAsync: nothingToWrite };
    }
    return { modules, cacheAsync: async () => await cacheWhenIdentifiedAsync(key, modules) };
}

const SOURCE_KEY = "source";

// GitHub gives the attribute name its own element before the value: a
// `span.pl-v` reading `source = ` in HCL, a `span.pl-ent` reading `"source"`
// in json. Both reduce to the name once quotes and the operator are dropped.
const NAME_PUNCTUATION = ['"', "=", ":"];

/**
 * @param value The `span.pl-s` holding a string literal.
 * @returns true if that string is the value of a `source` attribute; otherwise, false.
 */
const isSourceValue = (value: Element): boolean => {
    const label = value.previousElementSibling?.textContent ?? "";
    const name = NAME_PUNCTUATION.reduce((text, mark) => text.split(mark).join(""), label).trim();
    return name === SOURCE_KEY;
};

function addHyperLinksToModuleSource(modules: DisplayModule[]) {
    // GitHub tokenizes a string literal into a `span.pl-s` holding a
    // `span.pl-pds` for each of its two quotes. Taking each quote's parent
    // reaches the literal, and the pair collapses to one on the dedupe below.
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
        const line = parent?.parentElement;
        if (parent == null || parent.textContent == null || line == null) {
            continue;
        }

        // Without this a `description` or a `default` whose value happens to
        // equal a module source is linked too, because the only other test is
        // that the text matches.
        if (!isSourceValue(parent)) {
            continue;
        }

        const text = parent.textContent.trim().split('"').join("");
        const module = modules.find(
            (candidate) => candidate.source === text && candidate.resolvedUrl != null,
        );
        if (module === undefined) {
            continue;
        }

        // GitHub marks the rendered line inert so its own overlay takes the
        // click. The anchor below is unreachable until that is lifted.
        parent.closest("[inert]")?.removeAttribute("inert");
        replaceSourceTag(childTextNodes[i], module.resolvedUrl, text, anchorId(line, parent));
    }

    raiseCodeLinesAboveLineNumbers();
}

/**
 * Builds the DOM id for an injected anchor.
 *
 * Two sources on one line would otherwise be given the same id, since the
 * line is all that identified them. The span survives the replacement, so its
 * position in the line is stable across injections.
 * @param line The rendered line the source sits on.
 * @param span The element holding the string literal.
 * @returns An id unique to that literal.
 */
const anchorId = (line: Element, span: Element): string => {
    const position = Array.from(line.querySelectorAll("span.pl-s")).indexOf(span);
    const within = position === -1 ? crypto.randomUUID() : String(position);
    return `GithubTerraformSourceUrl-${line.id === "" ? crypto.randomUUID() : line.id}-${within}`;
};

/**
 * Raises the code lines above the line numbers.
 *
 * The injected anchor sits inside the code lines, which GitHub renders under
 * the line numbers. Without this the anchor is covered and cannot be clicked.
 */
const raiseCodeLinesAboveLineNumbers = (): void => {
    const lineNumbers = document.querySelector(".react-line-numbers") as Nullable<HTMLElement>;
    const codeLines = document.querySelector(".react-code-lines") as Nullable<HTMLElement>;
    if (codeLines === null) {
        return;
    }
    // Computed rather than inline, so whatever github declares counts whether
    // it ships it in a stylesheet or on the element. The value is a string, so
    // it is parsed rather than added to. "auto" parses to NaN and means the
    // line numbers are not stacked at all, which anything positive sits above.
    const declared =
        lineNumbers === null
            ? Number.NaN
            : Number.parseInt(getComputedStyle(lineNumbers).zIndex, 10);
    codeLines.style.zIndex = Number.isNaN(declared) ? "1" : String(declared + 1);
};

function replaceSourceTag(
    childNode: HTMLElement | ChildNode,
    resolvedUrl: Nullable<string>,
    innerText: string,
    id: string,
) {
    if (resolvedUrl === null || !isSafeHttpUrl(resolvedUrl)) {
        return;
    }

    const a = document.createElement("a");
    a.id = id;
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

const LISTENING = "iacModuleLinkerIsListening";

const isolatedWorld = globalThis as typeof globalThis & Record<string, true | undefined>;

let shouldKeepChannelOpen = true; // Keep message channel open initially
let scrollTimeout: NodeJS.Timeout;

function listenToTabAndPage(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!shouldHandleMessage(message)) {
            sendResponse([]);
            return false;
        }
        const fileType = githubPage.getFileType();
        if (fileType === null) {
            console.log("was not found in HCLFileTypes");
            sendResponse([]);
            return false;
        }

        const handleMessage = (async () => {
            if (isBackgroundRefresh(message)) {
                await injectHyperLinksToPageAsync();
                sendResponse([]);
                return true;
            }

            const { modules, cacheAsync } = await hydrateModulesAsync();
            sendResponse(modules);
            await cacheAsync();
            return false;
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

    document.addEventListener("scroll", () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(async () => {
            await injectHyperLinksToPageAsync();
        }, 100);
    });
}

if (isolatedWorld[LISTENING] !== true) {
    isolatedWorld[LISTENING] = true;
    listenToTabAndPage();
}
