import { url } from "inspector";
import { Url } from "url";

const fs = require('fs');
const parser = require('@evops/hcl-terraform-parser');

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
    const dataTargetElement = document.querySelector('.data-target') as HTMLElement
    const innerText = dataTargetElement?.innerText ?? '';
    if(innerText === ''){
        return [];
    } 

    const hlcFile = parser.parse(innerText);
    let sources: IDisplayModule[] = [];
    for (let value of hlcFile.module_calls.values()){
        sources.push(new DisplayModule(value.source,value.name))
    }
    
    return sources;
}

const getSourceUri = ():URL => {
    const uri = ""
    return new URL(uri);
}

chrome.runtime.onMessage.addListener((message, sender, callback) => {

    let fileType = getFileType();
    if(!(fileType in FileType)){
        return;
    }
    let sources :string[] = findModuleSources();
    let sourceUris :string[] = getSourceUri();
    callback(`uri: ${getSourceUri()}`);
});
