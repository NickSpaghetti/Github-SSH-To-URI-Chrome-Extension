import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {CacheKeys, GITHUB_ROUTES, SENDERS} from "./util/constants";
import {IsSignedIn} from "./services/GitHubElementService";
import {Nullable} from "./types/Nullable";
import {InMemoryCache} from "./services/InMemoryCache";

const hclService = new HclService();
const IsSignedIntoGitHub = IsSignedIn();
const inMemoryCache = new InMemoryCache()
//console.log(IsSignedIntoGitHub);
const InjectHyperLinksToPage = () => {
        if(window.location.host !== GITHUB_ROUTES.HOST){
            return;
        }

        let fileType = hclService.getFileType(IsSignedIntoGitHub);
        if(fileType === null){
            return;
        }
        //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
        let modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
        if( modules == null){
            inMemoryCache.Set(CacheKeys.MODULES,hclService.findSources(IsSignedIntoGitHub));
            modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
        }

        if(IsSignedIntoGitHub){
            addHyperLinksToModuleSourceSignedIn(modules ?? new Array<DisplayHlcModule>());
        }
        else {
            addHyperLinksToModuleSourceSignedOut(modules ?? new Array<DisplayHlcModule>())
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
    // all text on page values are stored in data-code-text
    modules.forEach(module => {
        let stringSpans = document.querySelectorAll(`span[data-code-text="${CSS.escape(module.source)}"]`)
        for (let i: number = 0; i < stringSpans.length; i++) {
                let dataCodeText = stringSpans[i].attributes.getNamedItem('data-code-text')?.value
                if(dataCodeText != null){
                    modules.forEach(module => {
                        if(module.source === dataCodeText && module.modifiedSourceType != null){
                            replaceSourceSpanTag(stringSpans[i] as HTMLElement, module.modifiedSourceType, dataCodeText);
                        }
                    })
                }
        }
    })

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

function replaceSourceSpanTag(span: HTMLElement, modifiedSourceType: Nullable<string>, innerText: string) {
    if(modifiedSourceType === null){
        return;
    }

    let a = document.createElement('a');
    a.href = modifiedSourceType
    a.rel = "noreferrer";
    a.target = "_blank";
    a.innerText = innerText
    span.replaceWith(a)
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
    //console.log(currentUrl.hostname)
    if(currentUrl.hostname !== GITHUB_ROUTES.HOST ){
        sendResponse([])
        return false;
    }
    let fileType = hclService.getFileType(IsSignedIntoGitHub);
    //console.log(fileType);
    if(fileType === null){
        console.log("was not found in HCLFileTypes")
        sendResponse([])
       return false;
    }
    //console.log("looking for modules")
    //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
    let modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    //console.log(modules)
    if( modules == null){
        inMemoryCache.Set(CacheKeys.MODULES,hclService.findSources(IsSignedIntoGitHub));
        modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    }

    //console.log(JSON.stringify(modules))
    sendResponse(modules);
    return false;
});

document.addEventListener("scroll", () => {
    InjectHyperLinksToPage();
})
