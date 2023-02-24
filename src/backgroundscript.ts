import {GITHUB_ROUTES, SENDERS} from "./util/constants";

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