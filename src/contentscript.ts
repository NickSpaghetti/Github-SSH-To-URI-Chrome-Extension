import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {HclFileTypes} from "./types/HclFileTypes";

const hclService = new HclService();
let init: number = 0;
if(init === 0){
    const run = () => {
        if(window.location.host !== "github.com"){
            return;
        }
    
        let fileType = hclService.getFileType();
        if(fileType === null){
            return;
        }
        let modules :DisplayHlcModule[] = hclService.findSources();
    
        addHyperLinksToModuleSource(modules);
    }
    run();
    init = 1;
}


function addHyperLinksToModuleSource(modules: DisplayHlcModule[]) {
    //all strings are stored in class 'pl-s'
    let stringSpans = document.getElementsByClassName('pl-s') as HTMLCollection;
    modules.forEach(module => {
         for(let i : number = 0; i < stringSpans.length; i++){
             let spanElement = stringSpans[i] as HTMLElement;
             let innerText = spanElement.innerText as string;
             if(innerText.includes(module.source) && module.modifiedSourceType !== null){
                 let a = document.createElement('a');
                 a.href = module.modifiedSourceType;
                 a.rel = "noreferrer"
                 a.target = "_blank";
                 a.text = `"${module.source}"`;
                 spanElement.replaceWith(a);
             }
         }
    });
}

//return false to tell chrome that this is not an async method
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
    console.log(fileType);
    if(fileType === null){
        console.log("was not found in HCLFileTypes")
        sendResponse([])
       return false;
    }
    console.log("looking for modules")
    let modules :DisplayHlcModule[] = hclService.findSources();

    sendResponse(modules);
    return false;
});
