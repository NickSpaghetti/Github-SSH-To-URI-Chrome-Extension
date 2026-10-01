import { Nullable } from "../types/Nullable";
import { optInOriginOf } from "../util/PageHosts";

/** A host the active tab is on that the user has not granted access to yet. */
export type PendingAccess = {
    /** The host, as the popup names it. */
    readonly host: string;
    /**
     * Asks the user to grant the host. Called from a click, before anything
     * else is awaited, or chrome refuses the request.
     */
    readonly requestAsync: () => Promise<boolean>;
};

/**
 * Returns the access the user still has to grant for the page in a tab.
 * @param tabUrl The tab's url, or null when chrome never said.
 * @returns The pending access, or null when the host needs none or has it already.
 */
export const readPendingAccessAsync = async (
    tabUrl: Nullable<string>,
): Promise<Nullable<PendingAccess>> => {
    if (tabUrl === null) {
        return null;
    }
    const host = new URL(tabUrl).hostname;
    const origin = optInOriginOf(host);
    if (origin === null || (await chrome.permissions.contains({ origins: [origin] }))) {
        return null;
    }
    return { host, requestAsync: () => chrome.permissions.request({ origins: [origin] }) };
};
