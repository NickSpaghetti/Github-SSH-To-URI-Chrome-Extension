import {HclModule} from "../types/HclModuleType";
import {DisplayHlcModule} from "../models/DisplayHclModule";
import { Nullable } from "../types/Nullable";
import { HclFileTypes } from "../types/HclFileTypes";
import { IHclFile } from "../models/IHclFile";
import {ProviderType, RequiredProvider} from "../types/Terraform";
import {TERRAFORM_SYNTAX} from "../util/constants";
import {Module} from "../types/Module";

export class HclService {
    private hcl2Parser = require("hcl2-parser");

    isHclModule(obj: any): obj is HclModule {
        return (
            typeof obj[0] === 'object'
            && obj[0] !== null
            && ('source' in obj[0] || 'Source' in obj[0])
        );
    }

    getFileType = ():Nullable<HclFileTypes> => {
        const finalPath = document.querySelector('.final-path') as HTMLElement
        const innerText = finalPath?.innerText ?? '';
        const fileType = innerText.split('.');
        if(fileType.length !== 2){
            return null;
        }
        const tempFileType = fileType[1].trim();
        console.log(tempFileType)
        if(!Object.values(HclFileTypes as unknown as string[]).includes(tempFileType)){
            return null;
        }

        return  tempFileType as unknown as HclFileTypes;

    }
    //regex to get source = "foo" ((source)\s*=\s*("(.*?)"))
    findTerraformSources = (hclFile: IHclFile[]):Nullable<Map<string,string>> => {
        if(hclFile[0] === null || hclFile[0]?.terraform === undefined || hclFile[0]?.terraform[0] === undefined) {
            console.log('No terraform section found');
            return null;
        }

        let foundModules: Map<string,string> = new Map<string,string>();
        let fc:  Map<string,Module> = new Map<string,Module>();
        try {
            hclFile[0]?.terraform.forEach(tf => {
                let requiredProvidersCount = 0;
                if(tf.source !== undefined){
                    foundModules.set(`terraform`,tf.source);
                }
                if(tf.required_providers !== undefined){
                    let providers = tf.required_providers[requiredProvidersCount] ?? [];
                    Object.keys(providers).forEach(key => {
                        let pt = providers[key as keyof RequiredProvider] as ProviderType;
                        if(pt.source !== undefined){
                            foundModules.set(`${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.${key}`,pt.source);
                            fc.set(`${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.${key}`,  {
                                source: pt.source,
                                version: pt.version,
                            } as Module);
                        }
                    })
                }
                requiredProvidersCount++;
            });
        } catch (error) {
            console.log("error parsing hcl file.")
            return null;
        }
        return foundModules
        
    }

    findModuleSources = (hclFile: IHclFile[]):Nullable<Map<string,string>> => {

        let foundModules: Map<string,string> = new Map<string,string>();
        try {
            if(hclFile[0] === null || hclFile[0].module === undefined) {
                console.log('No module found file');
                return null;
            }
            console.log(hclFile)
            for (let [moduleName, value] of Object.entries(hclFile[0].module)) {
                if(this.isHclModule(value)){
                    foundModules.set(moduleName,value[0].source ?? value[0].Source);
                }
            }

        } catch (error) {
            console.log("error parsing hcl file.")
            return null;
        }
        return foundModules;
    }


    findSources = ():DisplayHlcModule[] => {
        const dataTargetElement = document.querySelector('table') as HTMLElement
        const innerText = dataTargetElement?.innerText ?? '';
        if(innerText === ''){
            return [];
        }
        //const regex = new RegExp(/((source)\s*=\s*("(.*?)"))/g)
        let sources: DisplayHlcModule[] = [];
        try {
            let hclFile = this.hcl2Parser.parseToObject(innerText) as IHclFile[];
            console.log(hclFile)
            let terraformSources = this.findTerraformSources(hclFile);
            console.log(terraformSources)
            let moduleSources = this.findModuleSources(hclFile);
            console.log(moduleSources);
            const mergedSources = new Map<string,string>(
                [...terraformSources?.entries() ?? new Map<string,string>(),
                 ...moduleSources?.entries() ?? new Map<string,string>() ]);
        
            console.log(mergedSources)
            for (let [moduleName,source] of mergedSources){
                sources.push(new DisplayHlcModule(window.location.href,source,moduleName));
            }

        } catch (error) {
            console.log("error parsing hcl file.")
            return [];
        }


        return sources;
    }
}

