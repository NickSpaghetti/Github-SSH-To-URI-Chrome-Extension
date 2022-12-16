import { Url } from "url";
import { DisplayHlcModule } from "./models/DisplayHclModule";
import { IDisplayHlcModule } from "./models/IDisplayHclModule";
import { HclFileTypes } from "./types/HclFileTypes";
import  {HclModule}  from "./types/HclModuleType";
import { Nullable } from "./types/Nullable";

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
            console.log('No readable hcl file');
            return [];
        }
        console.log(hclFile)
        for (let [moduleName, value] of Object.entries(hclFile[0].module)) {
            console.log(moduleName);
            if(isHclModule(value)){
                foundModules.set(moduleName,value[0].source ?? value[0].Source);
            }
          }

    } catch (error) {
        console.log("error parsing hcl file.")
        return [];
    }
    let sources: IDisplayHlcModule[] = [];
    console.log('printing found moduals')
    console.log(foundModules);
    for (let [moduleName,source] of foundModules){
        console.log(`key:${moduleName}, value${source}`)
        //sources.push(new DisplayHlcModule(source,moduleName));
    }
    console.log('printing sources');
    console.log(sources);
    return sources;
}
const getSourceUri = (sourceInput: string):Nullable<URL> => {

    if(isValidUrl(sourceInput)){
        return new URL(sourceInput);
    }

    if(isVaidFilePath(sourceInput)){

    }

    if(isValidSSH(sourceInput)){

    }
    return null;
}

const isVaidFilePath = (input:string): boolean => {
    return false;
}

const isValidSSH = (input:string): boolean => {
    return false;
}

const isValidUrl = (input: string): boolean => {
    try {
        let url = new URL(input);
        const position = url.toString().lastIndexOf(url.protocol);
        const domainExtensionPosition = url.toString().lastIndexOf('.');
        let isValid =  (
            position === 0 && ['http:', 'https:'].indexOf(url.protocol) !== -1 &&  url.toString().length - domainExtensionPosition > 2
        )
        return isValid;
    }
    catch($error){
        return false;
    }
}

chrome.runtime.onMessage.addListener((message, sender,):IDisplayHlcModule[] => {

    let currentTab = message;
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
    console.log('im at the end');
    return sources;
});

