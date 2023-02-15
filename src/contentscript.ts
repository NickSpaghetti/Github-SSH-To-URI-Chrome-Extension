import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {HclFileTypes} from "./types/HclFileTypes";

const hclService = new HclService();
chrome.runtime.onMessage.addListener((message, sender,sendResponse): boolean=> {

    let currentTab = message;
    if(currentTab == null || currentTab?.tabUrl === ''){
        sendResponse([])
        return false;
    }
    const currentUrl = new URL(currentTab.tabUrl);
    console.log(currentUrl.hostname)
    if(currentUrl.hostname !== "github.com" ){
        sendResponse([])
        return false;
    }
    let fileType = hclService.getFileType();
    if(!(fileType in HclFileTypes)){
        sendResponse([])
       return false;
    }
    let sources :DisplayHlcModule[] = hclService.findModuleSources();
    sendResponse(sources);
    return false;
});

