import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {CacheKeys, GITHUB_ROUTES, SENDERS} from "./util/constants";
import {Nullable} from "./types/Nullable";
import {InMemoryCache} from "./services/InMemoryCache";

const hclService = new HclService();
const inMemoryCache = new InMemoryCache()
const InjectHyperLinksToPage = () => {
        if(window.location.host !== GITHUB_ROUTES.HOST){
            return;
        }

        let fileType = hclService.getFileType();
        if(fileType === null){
            return;
        }
        //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
        let modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
        if( modules == null) {
            inMemoryCache.Set(CacheKeys.MODULES, hclService.findSources());
            modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
        }

        addHyperLinksToModuleSource(modules ?? new Array<DisplayHlcModule>());

    }

function addHyperLinksToModuleSource(modules: DisplayHlcModule[]) {
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
    let shouldModelsReHydrate = false;
    if(inMemoryCache.Get(CacheKeys.CURRENT_TAB_URL) !== currentUrl){
        inMemoryCache.Set(CacheKeys.CURRENT_TAB_URL,currentUrl);
        shouldModelsReHydrate = true
    }
    //console.log(currentUrl.hostname)
    if(currentUrl.hostname !== GITHUB_ROUTES.HOST ){
        sendResponse([])
        return false;
    }
    let fileType = hclService.getFileType();
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
    if( modules == null || shouldModelsReHydrate){
        inMemoryCache.Set(CacheKeys.MODULES,hclService.findSources());
        modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    }

    //console.log(JSON.stringify(modules))
    sendResponse(modules);
    return false;
});

document.addEventListener("scroll", () => {
    InjectHyperLinksToPage();
})
