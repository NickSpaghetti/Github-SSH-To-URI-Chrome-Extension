import { OPT_IN_ORIGINS, isSupportedPageHost, optInOriginOf } from "../util/PageHosts";

const CONTENT_SCRIPT = "contentscript.js";
const SCRIPT_ID_PREFIX = "iac-module-linker-";

/**
 * Determines whether the extension may read and link pages on a host.
 * @param hostname The page's hostname.
 * @returns true if the host is supported and its access granted; otherwise, false.
 */
export const hasPageAccessAsync = async (hostname: string): Promise<boolean> => {
    if (!isSupportedPageHost(hostname)) {
        return false;
    }
    const origin = optInOriginOf(hostname);
    return origin === null || (await chrome.permissions.contains({ origins: [origin] }));
};

let syncing: Promise<void> = Promise.resolve();

/**
 * Registers the content script on each opt-in host the user has granted, and
 * unregisters it from the rest. Calls run one after another, never at once.
 * @returns When this call's sync is done.
 */
export const syncOptInContentScriptsAsync = (): Promise<void> => {
    const sync = syncing.then(syncOnceAsync, syncOnceAsync);
    syncing = sync.catch(() => undefined);
    return sync;
};

const syncOnceAsync = async (): Promise<void> => {
    for (const [host, origin] of Object.entries(OPT_IN_ORIGINS)) {
        if (origin === null) {
            continue;
        }
        const id = `${SCRIPT_ID_PREFIX}${host}`;
        const granted = await chrome.permissions.contains({ origins: [origin] });
        const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
        if (granted && registered.length === 0) {
            await chrome.scripting.registerContentScripts([
                { id, matches: [origin], js: [CONTENT_SCRIPT], runAt: "document_end" },
            ]);
        } else if (!granted && registered.length > 0) {
            await chrome.scripting.unregisterContentScripts({ ids: [id] });
        }
    }
};
