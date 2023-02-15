import {HclModule} from "../types/HclModuleType";
import {DisplayHlcModule} from "../models/DisplayHclModule";

export class HclService {
    private hcl2Parser = require("hcl2-parser");

    isHclModule(obj: any): obj is HclModule {
        return (
            typeof obj[0] === 'object'
            && obj[0] !== null
            && ('source' in obj[0] || 'Source' in obj[0])
        );
    }

    getFileType = ():string => {
        const finalPath = document.querySelector('.final-path') as HTMLElement
        const innerText = finalPath?.innerText ?? '';
        const fileType = innerText.split('.');
        if(fileType.length !== 2){
            return ''
        }

        return fileType[1];

    }

    findModuleSources = ():DisplayHlcModule[] => {
        const dataTargetElement = document.querySelector('table') as HTMLElement
        const innerText = dataTargetElement?.innerText ?? '';
        if(innerText === ''){
            return [];
        }

        let foundModules: Map<string,string> = new Map<string,string>();
        try {
            let hclFile = this.hcl2Parser.parseToObject(innerText);
            if(hclFile[0] === null || hclFile[0].module === undefined) {
                console.log('No module found file');
                return [];
            }
            console.log(hclFile)
            for (let [moduleName, value] of Object.entries(hclFile[0].module)) {
                console.log(moduleName);
                if(this.isHclModule(value)){
                    foundModules.set(moduleName,value[0].source ?? value[0].Source);
                }
            }

        } catch (error) {
            console.log("error parsing hcl file.")
            return [];
        }
        let sources: DisplayHlcModule[] = [];
        for (let [moduleName,source] of foundModules){
            sources.push(new DisplayHlcModule(window.location.href,source,moduleName));
        }
        return sources;
    }
}

