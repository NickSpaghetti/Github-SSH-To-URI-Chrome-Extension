import { ALLOWED_FETCH_HOSTS, GITHUB_ROUTES, SENDERS } from "./util/constants";
import { RunTimeFetchResponse } from "./services/IFetchService";
import { isAllowedFetchHost } from "./util/urlSafety";

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.url === undefined) {
        return;
    }
    const currentUrl = new URL(tab.url);
    if (currentUrl.hostname === GITHUB_ROUTES.HOST) {
        if (changeInfo.status === "complete") {
            await chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ["contentscript.js"],
            });
            await chrome.tabs.sendMessage(tabId, SENDERS.BACKGROUND);
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.contentScriptQuery === "fetchData") {
        if (!isAllowedFetchHost(request.url, ALLOWED_FETCH_HOSTS)) {
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
