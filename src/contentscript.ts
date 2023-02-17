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
    let modules :DisplayHlcModule[] = hclService.findModuleSources();

    addHyperLinksToModuleSource(modules);
    sendResponse(modules);
    return false;
});

function addHyperLinksToModuleSource(modules: DisplayHlcModule[]) {
    //all strings are stored in class 'pl-s'
    let stringSpans = document.getElementsByClassName('pl-s') as HTMLCollection;
    modules.forEach(module => {
         for(let i : number = 0; i < stringSpans.length; i++){
             let spanElement = stringSpans[i] as HTMLElement;
             let innerText = spanElement.innerText as string;
             if(innerText.includes(module.source)){
                 //spanElement.innerText = `<a href="${module.modifiedSourceType}" on = "_blank" rel="noreferrer">${module.source}</a>`
             }
         }
    });
}

