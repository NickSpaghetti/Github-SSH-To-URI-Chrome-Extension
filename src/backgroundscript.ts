import {GITHUB_ROUTES, SENDERS} from "./util/constants";
import {RunTimeFetchResponse} from "./services/IFetchService";

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if(tab.url === undefined) {
        return;
    }
    let currentUrl = new URL(tab.url);
    if(currentUrl.hostname === GITHUB_ROUTES.HOST){
        if(changeInfo.status === "complete"){
            await chrome.scripting.executeScript({
                target: {tabId: tabId, allFrames: true},
                files: ['contentscript.js'],
            });
            await chrome.tabs.sendMessage(tabId, SENDERS.BACKGROUND);
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.contentScriptQuery === "fetchData") {
        fetch(request.url, {cache: request.cache})
            .then(response => {
                response.json().then(data => {
                    sendResponse({ok: response.ok, status: response.status, statusText: response.statusText, headers: response.headers, data: data} as RunTimeFetchResponse<any>);
                })
            }).catch(err => sendResponse({ok: false, error: JSON.stringify(err)}));
    }
    return true;
});