import { ChromeStorageCache } from "../services/ChromeStorageCache";
import { readCachedModules } from "../types/CachedModules";
import { DisplayModule } from "../types/DisplayModule";
import { Nullable } from "../types/Nullable";
import { moduleCacheKey } from "../services/ModuleCacheKey";
import { pollUntilAsync } from "../util/Poll";
import { SENDERS } from "../types/TabMessage";
import { logRecovered } from "../util/Log";
import { hasPageAccessAsync } from "../services/PageAccess";

const TAB_WAIT_MS = 3_000;
const TAB_POLL_MS = 100;
const BLANK_PREFIX = "about:";

const storageCache = new ChromeStorageCache();

/** A tab the popup can act on: chrome has told us its id and its address. */
export type ActiveTab = chrome.tabs.Tab & { id: number; url: string };

const isReady = (tab: chrome.tabs.Tab | undefined): tab is ActiveTab =>
    tab?.id !== undefined &&
    tab.url !== undefined &&
    tab.url !== "" &&
    !tab.url.startsWith(BLANK_PREFIX);

/**
 * Waits for the active tab to report an id and an address.
 *
 * The popup opens before chrome has finished telling it which tab is active,
 * and reading too early gives a tab with no url.
 *
 * Null means the wait ran out, which is different from a tab that is ready.
 * Returning the unready tab instead would hand the caller the very value this
 * exists to avoid, and nothing in its type would say so.
 */
export const readyActiveTabAsync = async (): Promise<Nullable<ActiveTab>> =>
    await pollUntilAsync(
        async () => {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            return isReady(tab) ? tab : null;
        },
        TAB_WAIT_MS,
        TAB_POLL_MS,
    );

/**
 * @param tab The tab the popup was opened over, or null when chrome never said.
 * @returns The modules on the tab, from the cache when the page has already
 * resolved them and from the content script when it has not. Empty when the
 * tab is not a file this extension reads. Nothing runs on a tab whose host
 * the user has not granted.
 */
export const readTabModulesAsync = async (tab: Nullable<ActiveTab>): Promise<DisplayModule[]> => {
    if (tab === null) {
        logRecovered("the popup could not tell which tab it was opened over");
        return [];
    }

    const cached = readCachedModules(await storageCache.getAsync(moduleCacheKey(tab.url)));
    if (cached !== null) {
        return cached.modules;
    }

    // Opening the popup grants activeTab, which would let the script below
    // run on an opt-in host the user has not allowed.
    if (!(await hasPageAccessAsync(new URL(tab.url).hostname))) {
        return [];
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ["contentscript.js"],
        });
        const answered: unknown = await chrome.tabs.sendMessage(tab.id, {
            sender: SENDERS.POPUP,
            tabId: tab.id,
            tabUrl: tab.url,
        });
        return Array.isArray(answered) ? (answered as DisplayModule[]) : [];
    } catch (error) {
        logRecovered("could not read the modules on this tab", error);
        return [];
    }
};
