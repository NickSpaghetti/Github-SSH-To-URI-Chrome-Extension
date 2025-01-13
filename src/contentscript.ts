import {HclService} from "./services/HclService";
import {DisplayHlcModule} from "./models/DisplayHclModule";
import {BITBUCKET_ROUTES, CacheKeys, GITHUB_ROUTES, SENDERS} from "./util/constants";
import {Nullable} from "./types/Nullable";
import {InMemoryCache} from "./services/InMemoryCache";
import {TerraformFetchService} from "./services/TerraformFetchService";
import {TerraformDataAccess} from "./data-access/TerraformDataAccess";
import {ChromeRuntimeFetchService} from "./services/ChromeRuntimeFetchService";
import {ITerraformDataAccess} from "./data-access/ITerraformDataAccess";
import {IFetchService} from "./services/IFetchService";
import {ITerraformFetchService} from "./services/ITerraformFetchService";
import { SourceControlUiDisplayer } from "./services/source-control-ui-display/SourceControlUiDisplayer";

const fetchService: IFetchService = new ChromeRuntimeFetchService();
const terraformDataAccess: ITerraformDataAccess = new TerraformDataAccess(fetchService);
const terraformFetchService: ITerraformFetchService = new TerraformFetchService(terraformDataAccess);
const hclService = new HclService(terraformFetchService);
const inMemoryCache = new InMemoryCache();

const InjectHyperLinksToPageAsync =  async () => {
    const sourceUiDisplay = new SourceControlUiDisplayer(window.location.host)

    let fileType = hclService.getFileType();
    if (fileType === null) {
        return;
    }
    //we cache the modules because we do not want to parse the TF evey time we scroll if the page is long
    let modules = await hydrateModulesAsync();

    sourceUiDisplay.AddHyperLinksToModuleSource(modules ?? new Array<DisplayHlcModule>());
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
    //gets all the TextNodes that contain the values between .pl-pds which are ".
    let childTextNodes = Array.from(document.querySelectorAll(`div[id^="LC"] > span.pl-s > span.pl-pds`))
        .map((element) => element.parentElement)
        .filter((htmlElement, index, self) => htmlElement != null && self != null && self.indexOf(htmlElement) === index)
        .map(htmlElement => {
            const text: ChildNode[] = []
            const childNodes = htmlElement?.childNodes
            if(childNodes != null){
                for (let i = 0; i < childNodes.length; i++){
                    const node = childNodes[i];
                    if(node.nodeType === Node.TEXT_NODE){
                        text.push(node);
                    }
                }
            }
            return text
        })
        .flat()

    for (let i: number = 0; i < childTextNodes.length; i++) {
        const parent = childTextNodes[i]?.parentElement;
        if (parent == null || parent.textContent == null){
            continue;
        }
        const text = parent.textContent.trim().replace(/"/g,'');
        modules.forEach(module => {
            if(module.source === text && module.modifiedSourceType != null){
                replaceSourceTag(childTextNodes[i], module.modifiedSourceType, text, parent?.parentElement?.id)
            }
        })
    }

   }

function replaceSourceTag(childNode: HTMLElement | ChildNode, modifiedSourceType: Nullable<string>, innerText: string, lineCount: string | undefined) {
    if(modifiedSourceType === null){
        return;
    }

    let a = document.createElement('a');
    a.id=`GithubTerraformSourceUrl-${lineCount === undefined ? crypto.randomUUID() : lineCount}`
    a.href = modifiedSourceType
    a.rel = "noreferrer";
    a.target = "_blank";
    a.innerText = innerText
    a.style.setProperty("pointer-events", "all", "important")
    childNode.replaceWith(a)
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
    if (currentUrl.hostname !== GITHUB_ROUTES.HOST || currentUrl.hostname != BITBUCKET_ROUTES.HOST) {
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
