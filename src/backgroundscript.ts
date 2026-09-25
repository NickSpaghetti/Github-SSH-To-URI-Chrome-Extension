import { BackgroundRefresh } from "./types/TabMessage";
import { GITHUB_HOST } from "./util/Constants";
import { isAllowedFetchHost, isFetchRequest, isParseRequest } from "./WorkerRequestGuards";
import { SENDERS } from "./types/TabMessage";
import { HclParser } from "./services/HclParser";
import { RunTimeFetchResponse } from "./types/RunTimeFetchResponse";

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
            .then((hclFile) => sendResponse({ ok: true, hclFile: hclFile }))
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
                    .then((data) => {
                        sendResponse({
                            ok: response.ok,
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                            data: data,
                        } as RunTimeFetchResponse<any>);
                    })
                    .catch((err) => sendResponse({ ok: false, error: JSON.stringify(err) }));
            })
            .catch((err) => sendResponse({ ok: false, error: JSON.stringify(err) }));
    }
    return true;
});
