import { BackgroundRefresh } from "./types/TabMessage";
import { GITHUB_HOST } from "./util/Constants";
import { isAllowedFetchHost, isFetchRequest, isParseRequest } from "./WorkerRequestGuards";
import { SENDERS } from "./types/TabMessage";
import { HclParser } from "./services/HclParser";
import { RunTimeFetchResponse } from "./types/RunTimeFetchResponse";
import { logRecovered } from "./util/Log";

// Session storage is closed to content scripts until the worker opens it.
chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
    .catch((error) => logRecovered("could not open session storage", error));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.url === undefined) {
        return;
    }
    const currentUrl = new URL(tab.url);
    if (currentUrl.hostname === GITHUB_HOST) {
        if (changeInfo.status === "complete") {
            await chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ["contentscript.js"],
            });
            const refresh: BackgroundRefresh = { sender: SENDERS.BACKGROUND };
            await chrome.tabs.sendMessage(tabId, refresh);
        }
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
