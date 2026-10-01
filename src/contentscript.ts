import { PageModuleService } from "./services/PageModuleService";
import { PageSite, pageSiteFor } from "./data-access/PageSites";
import { toSourceLinks } from "./domain/SourceLinks";
import { logRecovered } from "./util/Log";
import { ChromeRuntimeParserService } from "./services/ChromeRuntimeParserService";
import { DisplayModule } from "./types/DisplayModule";
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
import { pollUntilAsync } from "./util/Poll";
import { isBackgroundRefresh, shouldHandleMessage } from "./TabMessageGuards";

type Page = PageSite & { readonly modules: PageModuleService };

const fetchService = new ChromeRuntimeFetchService();
const storageCache = new ChromeStorageCache();

const openPage = (site: PageSite): Page => ({
    ...site,
    modules: new PageModuleService(
        site.reader,
        new ChromeRuntimeParserService(),
        new ModuleSourceLinker(
            new TerraformVersionService(new TerraformRegistryDataAccess(fetchService)),
            new OpenTofuVersionService(new OpenTofuRegistryDataAccess(fetchService)),
        ),
    ),
});

/** Links the page's modules and hands back the write that caches them. */
const linkModulesAsync = async (page: Page): Promise<() => Promise<void>> => {
    const nothingToWrite = () => Promise.resolve();
    if (page.reader.getFileType() === null) {
        return nothingToWrite;
    }
    try {
        const { modules, cacheAsync } = await hydrateModulesAsync(page);
        page.writer.linkSources(toSourceLinks(modules));
        return cacheAsync;
    } catch (error) {
        logRecovered("could not link this page's modules", error);
        return nothingToWrite;
    }
};

let linking: Nullable<{ url: string; run: Promise<() => Promise<void>> }> = null;

/** Links the page, sharing a run still linking the same url, then caches it. Never rejects. */
const linkPageAsync = async (page: Page): Promise<void> => {
    const url = window.location.href;
    if (linking !== null && linking.url === url) {
        await linking.run;
        return;
    }
    const run = linkModulesAsync(page);
    linking = { url, run };
    const cacheAsync = await run;
    // Shared only until the links are drawn. The write can wait up to
    // COMMIT_SHA_TIMEOUT_MS for the header, and a scroll in that wait has
    // lines of its own to link.
    if (linking?.run === run) {
        linking = null;
    }
    try {
        await cacheAsync();
    } catch (error) {
        logRecovered("could not cache this page's modules", error);
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
const COMMIT_SHA_TIMEOUT_MS = 500;
const COMMIT_SHA_POLL_MS = 25;

/** What the page holds, and the write that has not happened yet. */
type Hydrated = { modules: DisplayModule[]; cacheAsync: () => Promise<void> };

const findSourcesWhenRenderedAsync = async (page: Page): Promise<Nullable<DisplayModule[]>> =>
    await pollUntilAsync(
        async () => await page.modules.findSourcesAsync(window.location.href),
        SOURCE_RENDER_TIMEOUT_MS,
        SOURCE_RENDER_POLL_MS,
    );

/**
 * Caches the modules once the page says which commit they came from.
 * @param page The page the modules were read from.
 * @param key The entry to write.
 * @param modules What the page declared.
 */
const cacheWhenIdentifiedAsync = async (
    page: Page,
    key: string,
    modules: DisplayModule[],
): Promise<void> => {
    const sha = await pollUntilAsync(
        () => page.reader.readCommitSha(),
        COMMIT_SHA_TIMEOUT_MS,
        COMMIT_SHA_POLL_MS,
    );
    if (sha === null) {
        return;
    }
    await cacheModulesAsync(storageCache, key, { sha, modules });
};

/** Reads a cache entry, taking a refused read as a miss. */
const readCacheAsync = async (key: string): Promise<Nullable<unknown>> => {
    // Session storage stays closed to content scripts until the worker opens
    // it, which is still in flight for a moment after a cold start.
    try {
        return await storageCache.getAsync(key);
    } catch (error) {
        logRecovered("could not read the cache, so the page is read instead", error);
        return null;
    }
};

/**
 * Reads the page's modules, from the cache where it can.
 *
 * The write is handed back rather than done here, so a caller can show the
 * links first and pay for the cache afterwards.
 * @param page The page to read.
 * @returns The modules, and the write that stores them.
 */
async function hydrateModulesAsync(page: Page): Promise<Hydrated> {
    const nothingToWrite = () => Promise.resolve();
    const key = moduleCacheKey(window.location.href);
    const onEntry = page.reader.readCommitSha();
    if (onEntry !== null) {
        const cached = readCachedModules(await readCacheAsync(key));
        if (cached !== null && cached.sha === onEntry) {
            return { modules: cached.modules, cacheAsync: nothingToWrite };
        }
    }

    const modules = await findSourcesWhenRenderedAsync(page);
    if (modules === null) {
        return { modules: [], cacheAsync: nothingToWrite };
    }
    return {
        modules,
        cacheAsync: async () => await cacheWhenIdentifiedAsync(page, key, modules),
    };
}

const LISTENING = "iacModuleLinkerIsListening";

const isolatedWorld = globalThis as typeof globalThis & Record<string, true | undefined>;

let shouldKeepChannelOpen = true; // Keep message channel open initially
let scrollTimeout: NodeJS.Timeout;

function listenToTabAndPage(page: Page): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!shouldHandleMessage(message)) {
            sendResponse([]);
            return false;
        }
        const fileType = page.reader.getFileType();
        if (fileType === null) {
            sendResponse([]);
            return false;
        }

        const handleMessage = (async () => {
            if (isBackgroundRefresh(message)) {
                await linkPageAsync(page);
                sendResponse([]);
                return true;
            }

            const { modules, cacheAsync } = await hydrateModulesAsync(page);
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
                logRecovered("could not answer a tab message", err);
                sendResponse([]);
            });
        return shouldKeepChannelOpen;
    });

    document.addEventListener("scroll", () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(async () => {
            await linkPageAsync(page);
        }, 100);
    });
}

const site = pageSiteFor(window.location.hostname);
if (site !== null && isolatedWorld[LISTENING] !== true) {
    isolatedWorld[LISTENING] = true;
    const page = openPage(site);
    listenToTabAndPage(page);
    // The background script's refresh can be lost on a cold start, when the
    // tab finishes loading before the worker is listening.
    linkPageAsync(page).catch((error) => logRecovered("could not link this page", error));
}
