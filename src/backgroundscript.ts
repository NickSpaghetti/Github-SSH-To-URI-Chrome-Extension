import { BackgroundRefresh } from "./types/TabMessage";
import { hasPageAccessAsync, syncOptInContentScriptsAsync } from "./services/PageAccess";
import { isAllowedFetchHost, isFetchRequest, isParseRequest } from "./WorkerRequestGuards";
import { SENDERS } from "./types/TabMessage";
import { HclParser } from "./services/HclParser";
import { RunTimeFetchResponse } from "./types/RunTimeFetchResponse";
import { logRecovered } from "./util/Log";

// Session storage is closed to content scripts until the worker opens it.
chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
    .catch((error) => logRecovered("could not open session storage", error));

/**
 * Injects the content script into a tab and asks it to link the page.
 * @param tabId The tab to inject into.
 */
const injectAndRefreshAsync = async (tabId: number): Promise<void> => {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ["contentscript.js"],
        });
        const refresh: BackgroundRefresh = { sender: SENDERS.BACKGROUND };
        await chrome.tabs.sendMessage(tabId, refresh);
    } catch (error) {
        logRecovered("could not link the page in a tab", error);
    }
};

syncOptInContentScriptsAsync().catch((error) =>
    logRecovered("could not register the content script on granted hosts", error),
);

chrome.permissions.onAdded.addListener(async (permissions) => {
    try {
        await syncOptInContentScriptsAsync();
        const origins = permissions.origins ?? [];
        const tabs = origins.length === 0 ? [] : await chrome.tabs.query({ url: origins });
        for (const tab of tabs) {
            if (tab.id !== undefined) {
                await injectAndRefreshAsync(tab.id);
            }
        }
    } catch (error) {
        logRecovered("could not link pages on a newly granted host", error);
    }
});

chrome.permissions.onRemoved.addListener(() => {
    syncOptInContentScriptsAsync().catch((error) =>
        logRecovered("could not unregister the content script from a revoked host", error),
    );
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || tab.url === undefined) {
        return;
    }
    if (await hasPageAccessAsync(new URL(tab.url).hostname)) {
        await injectAndRefreshAsync(tabId);
    }
});

chrome.runtime.onMessage.addListener((request: unknown, sender, sendResponse) => {
    if (isParseRequest(request)) {
        HclParser.parseAsync(request.contents, request.fileName)
            .then((declarations) => sendResponse({ ok: true, declarations: declarations }))
            .catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
    }
    if (isFetchRequest(request)) {
        if (!isAllowedFetchHost(request.url)) {
            sendResponse({ ok: false, error: "Host not allowed" });
            return true;
        }
        fetch(request.url, { cache: request.cache })
            .then((response) => {
                response
                    .json()
                    .then((data: unknown) => {
                        sendResponse({
                            ok: response.ok,
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                            data: data,
                        } satisfies RunTimeFetchResponse<unknown>);
                    })
                    .catch((err) => sendResponse({ ok: false, error: String(err) }));
            })
            .catch((err) => sendResponse({ ok: false, error: String(err) }));
    }
    return true;
});
