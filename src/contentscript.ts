import { PageModuleService } from "./services/PageModuleService";
import { GitHubPageDataAccess } from "./data-access/GitHubPageDataAccess";
import { GitHubPageWriter } from "./data-access/GitHubPageWriter";
import { toSourceLinks } from "./domain/SourceLinks";
import { logRecovered } from "./util/Log";
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
import { pollUntilAsync } from "./util/Poll";
import { isBackgroundRefresh, shouldHandleMessage } from "./TabMessageGuards";

const fetchService = new ChromeRuntimeFetchService();
const githubPage = new GitHubPageDataAccess();
const githubPageWriter = new GitHubPageWriter();
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
        githubPageWriter.linkSources(toSourceLinks(modules));
        await cacheAsync();
    } catch (error) {
        logRecovered("could not link this page's modules", error);
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
                logRecovered("could not answer a tab message", err);
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
