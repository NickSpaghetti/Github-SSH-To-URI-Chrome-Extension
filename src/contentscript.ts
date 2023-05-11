import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {GITHUB_ROUTES, SENDERS} from "./util/constants";
import {IsSignedIn} from "./services/GitHubElementService";

const hclService = new HclService();
const IsSignedIntoGitHub = IsSignedIn();
console.log(IsSignedIntoGitHub);
const InjectHyperLinksToPage = () => {
        if(window.location.host !== GITHUB_ROUTES.HOST){
            return;
        }

        let fileType = hclService.getFileType(IsSignedIntoGitHub);
        if(fileType === null){
            return;
        }
        let modules :DisplayHlcModule[] = hclService.findSources(IsSignedIntoGitHub);

        if(IsSignedIntoGitHub){
            addHyperLinksToModuleSourceSignedIn(modules);
        }
        else {
            addHyperLinksToModuleSourceSignedOut(modules)
        }
    }


function addHyperLinksToModuleSourceSignedOut(modules: DisplayHlcModule[]) {
    //all strings are stored in class 'pl-s'
    let stringSpans = document.getElementsByClassName('pl-s') as HTMLCollection;
    modules.forEach(module => {
        for(let i : number = 0; i < stringSpans.length; i++){
            const spanElement = stringSpans[i] as HTMLElement;
            const innerText = spanElement.innerText as string;
            if(innerText === `"${module.source}"` && module.modifiedSourceType !== null){
                let a = document.createElement('a');
                a.href = module.modifiedSourceType;
                a.rel = "noreferrer"
                a.target = "_blank";
                a.text = innerText;
                spanElement.replaceWith(a);
            }
        }
    });
}

function addHyperLinksToModuleSourceSignedIn(modules: DisplayHlcModule[]) {
    //all strings are stored in class 'pl-s'
    let stringSpans = document.getElementsByClassName('pl-s') as HTMLCollection;
    modules.forEach(module => {
         for(let i : number = 0; i < stringSpans.length; i++){
             stringSpans[i].querySelectorAll('span').forEach((span) => {
                 if(span.dataset['codeText'] === module.source && module.modifiedSourceType !== null){
                     const innerText = span.dataset['codeText'] as string;
                     if(innerText === `${module.source}` && module.modifiedSourceType !== null){
                         let a = document.createElement('a');
                         a.href = module.modifiedSourceType;
                         a.rel = "noreferrer";
                         a.target = "_blank";
                         a.innerText = `"${innerText}"`
                         stringSpans[i].replaceWith(a)
                     }
                 }
             })
         }
    });

    const dataTargetElement = document.getElementById('read-only-cursor-text-area') as HTMLTextAreaElement
    let nextSibling = dataTargetElement.nextElementSibling;
    while(nextSibling !== null){
        if(nextSibling.tagName === "DIV"){
            //we want to remove the class name since it is preventing the user to click <a/> tag
            nextSibling.className = '';
        }
        nextSibling = nextSibling.nextElementSibling;
    }
}


//return false to tell chrome that this is not an async method
chrome.runtime.onMessage.addListener((message, sender,sendResponse): boolean=> {
    if(message === SENDERS.BACKGROUND){
        InjectHyperLinksToPage();
        return false;
    }
    let currentTab = message;
    if(currentTab == null || currentTab?.tabUrl === ''){
        sendResponse([])
        return false;
    }
    const currentUrl = new URL(currentTab.tabUrl);
    console.log(currentUrl.hostname)
    if(currentUrl.hostname !== GITHUB_ROUTES.HOST ){
        sendResponse([])
        return false;
    }
    let fileType = hclService.getFileType(IsSignedIntoGitHub);
    console.log(fileType);
    if(fileType === null){
        console.log("was not found in HCLFileTypes")
        sendResponse([])
       return false;
    }
    console.log("looking for modules")
    let modules :DisplayHlcModule[] = hclService.findSources(IsSignedIntoGitHub);
    console.log(JSON.stringify(modules))

    sendResponse(modules);
    return false;
});
