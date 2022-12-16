import { Url } from "url";
import { DisplayHlcModule } from "./models/DisplayHclModule";
import { IDisplayHlcModule } from "./models/IDisplayHclModule";
import { HclFileTypes } from "./types/HclFileTypes";
import  {HclModule}  from "./types/HclModuleType";

var hcl2Parser = require("hcl2-parser")

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
    console.log(innerText);
    const fileType = innerText.split('.');
    if(fileType.length !== 2){
        return ''
    }

    return fileType[1];

}

const findModuleSources = ():IDisplayHlcModule[] => {
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
   
    let sources: IDisplayHlcModule[] = [];
    for (let [moduleName,source] of foundModules){
        sources.push(new DisplayHlcModule(source,moduleName));
    }
    
    return sources;
}
const getSourceUri = ():URL => {
    const uri = ""
    return new URL(uri);
}

chrome.runtime.onMessage.addListener((message, sender,):IDisplayHlcModule[] => {

    console.log("hi!");
    let currentTab = message;
    console.log(currentTab);
    const currentUrl = new URL(currentTab.tabUrl ?? '');
    console.log(currentUrl.hostname)
    if(currentUrl.hostname !== "github.com" ){
        return [];
    }
    let fileType = getFileType();
    if(!(fileType in HclFileTypes)){
        return [];
    }
    let sources :IDisplayHlcModule[] = findModuleSources();
    console.log(sources);
    chrome.runtime.lastError ;
    return sources;
});

