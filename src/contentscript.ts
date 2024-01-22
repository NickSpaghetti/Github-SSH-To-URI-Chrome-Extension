import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {CacheKeys, GITHUB_ROUTES, SENDERS} from "./util/constants";
import {Nullable} from "./types/Nullable";
import {InMemoryCache} from "./services/InMemoryCache";
import {TerraformFetchService} from "./services/TerraformFetchService";
import {TerraformDataAccess} from "./data-access/TerraformDataAccess";
import {ChromeRuntimeFetchService} from "./services/ChromeRuntimeFetchService";
import {ITerraformDataAccess} from "./data-access/ITerraformDataAccess";
import {IFetchService} from "./services/IFetchService";
import {ITerraformFetchService} from "./services/ITerraformFetchService";

const fetchService: IFetchService = new ChromeRuntimeFetchService();
const terraformDataAccess: ITerraformDataAccess = new TerraformDataAccess(fetchService);
const terraformFetchService: ITerraformFetchService = new TerraformFetchService(terraformDataAccess);
const hclService = new HclService(terraformFetchService);
const inMemoryCache = new InMemoryCache();

const InjectHyperLinksToPageAsync =  async () => {
    if (window.location.host !== GITHUB_ROUTES.HOST) {
        return;
    }

    let fileType = hclService.getFileType();
    if (fileType === null) {
        return;
    }
    //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
    let modules = await hydrateModulesAsync();

    addHyperLinksToModuleSource(modules ?? new Array<DisplayHlcModule>());
}

async function hydrateModulesAsync(): Promise<Array<DisplayHlcModule>> {
    let modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    if (modules == null) {
        modules =  await hclService.findSourcesAsync();
        inMemoryCache.Set(CacheKeys.MODULES, modules);
    }
    return modules ?? [];
}

function shouldModelsRehydrate(): boolean{
    const models = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    const url = inMemoryCache.Get<URL>(CacheKeys.CURRENT_TAB_URL);
    return models == null && url == null;

}

function addHyperLinksToModuleSource(modules: DisplayHlcModule[]) {
    //all strings are stored in class 'pl-s'
    // all text on page values are stored in data-code-text
    overrideZIndex();
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

    //<a href="https://registry.terraform.io/providers/hashicorp/aws/3.72.0" rel="noreferrer" target="_blank">hashicorp/aws</a>
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

function overrideZIndex(){
    // the text area read-only-cursor-text-area has a style zIndex = 1 which will block the anchor tag being clicked
    const textArea = document.querySelector(`#read-only-cursor-text-area`) as HTMLElement;
    if(textArea == null) {
        return;
    }
    textArea.style.zIndex = '-1';
}


//return false to tell chrome that this is not an async method
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse): Promise<boolean> => {
    if (message === SENDERS.BACKGROUND) {
        await InjectHyperLinksToPageAsync();
        return false;
    }
    let currentTab = message;
    if (currentTab == null || currentTab?.tabUrl === '') {
        sendResponse([])
        return false;
    }
    let isRehydrateNeeded = false;
    const currentUrl = new URL(currentTab.tabUrl);
    if (inMemoryCache.Get<URL>(CacheKeys.CURRENT_TAB_URL)?.href !== currentUrl.href) {
        inMemoryCache.Set(CacheKeys.CURRENT_TAB_URL, currentUrl);
        isRehydrateNeeded = shouldModelsRehydrate();
    }
    //console.log(currentUrl.hostname)
    if (currentUrl.hostname !== GITHUB_ROUTES.HOST) {
        sendResponse([])
        return false;
    }
    let fileType = hclService.getFileType();
    //console.log(fileType);
    if (fileType === null) {
        console.log("was not found in HCLFileTypes")
        sendResponse([])
        return false;
    }
    //console.log("looking for modules")
    //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
    let modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    if (isRehydrateNeeded) {
        inMemoryCache.Set(CacheKeys.MODULES, await hclService.findSourcesAsync());
        modules = inMemoryCache.Get<Array<DisplayHlcModule>>(CacheKeys.MODULES);
    }

    if(modules != null){
        sendResponse(modules);
    }
    return false;
});

document.addEventListener("scroll", async () => {
    await InjectHyperLinksToPageAsync();
})
