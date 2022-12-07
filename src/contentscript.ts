import { Url } from "url";

var hcl2Parser = require("hcl2-parser")

enum FileType {
    tf = 'tf',
    hlc = 'hlc'
}

interface IDisplayModule {
    uri: URL;
    source: string;
}

class DisplayModule implements IDisplayModule{
    uri: URL =  new URL('')
    source: string = ''
    constructor(uri: string, source: string){
        this.uri = new URL(uri);
        this.source = source;
    }
}

type HclModule = {
    [key: string]: any;
    source: string
}

function isHclModule(obj: any): obj is HclModule {
 return (
     typeof obj[0] === 'object' 
     && obj[0] !== null 
     && ('source' in obj[0] || 'Source' in obj[0])
 );
}

const getFileType = ():string => {
    const finalPath = document.querySelector('.final-path') as HTMLElement
    const innerText = finalPath?.innerText ?? '';
    const fileType = innerText.split('.');
    if(fileType.length !== 2){
        return ''
    }

    return fileType[1];

}

const findModuleSources = ():IDisplayModule[] => {
    const dataTargetElement = document.querySelector('table') as HTMLElement
    const innerText = dataTargetElement?.innerText ?? '';
    if(innerText === ''){
        return [];
    } 

    let foundModules: Map<string,string> = new Map<string,string>();
    try {
        let hclFile = hcl2Parser.parseToObject(innerText);
        if(hclFile[0] === null || hclFile[0].module === undefined) {
            return [];
        }

        for (let [moduleName, value] of Object.entries(hclFile[0].module)) {
            if(isHclModule(value)){
                foundModules.set(moduleName,value[0].source ?? value[0].Source);
            }
          }

    } catch (error) {
        console.log("error parsing hcl file.")
        return [];
    }
   
    let sources: IDisplayModule[] = [];
    for (let [moduleName,source] of foundModules){
        sources.push(new DisplayModule(source,moduleName));
    }
    
    return sources;
}
const getSourceUri = ():URL => {
    const uri = ""
    return new URL(uri);
}

chrome.runtime.onMessage.addListener(async (tabId, sender, callback) => {

    let currentTab = await chrome.tabs.get(tabId);
    console.log(currentTab);
    const currentUrl = new URL(currentTab.url ?? '');
    console.log(currentUrl.hostname)
    if(currentUrl.hostname !== "github.com" ){
        return;
    }
    let fileType = getFileType();
    if(!(fileType in FileType)){
        return;
    }
    let sources :IDisplayModule[] = findModuleSources();
    console.log(sources);
    let sourceUris :URL = getSourceUri();
    callback(`uri: ${getSourceUri()}`);
    callback(`source: ${JSON.stringify(sources)}`);
});
