import {HclModule} from "../types/HclModuleType";
import {DisplayHlcModule} from "../models/DisplayHclModule";
import { Nullable } from "../types/Nullable";
import { HclFileTypes } from "../types/HclFileTypes";
import { IHclFile } from "../models/IHclFile";
import {ProviderType, RequiredProvider, TerraformModule} from "../types/Terraform";
import {TERRAFORM_SYNTAX} from "../util/constants";
import * as hcl  from "hcl2-parser"

export class HclService {

    isHclModule(obj: any): obj is HclModule {
        return (
            typeof obj[0] === 'object'
            && obj[0] !== null
            && ('source' in obj[0] || 'Source' in obj[0])
        );
    }

    getFileType = ():Nullable<HclFileTypes> => {
        const pathname = new URL(document.URL).pathname;
        const fileType = pathname.substring(pathname.lastIndexOf('.')+1, pathname.length) || null
        if(fileType == null){
            return fileType;
        }
        if(!Object.values(HclFileTypes as unknown as string[]).includes(fileType)){
            return null;
        }

        return  fileType as unknown as HclFileTypes;
    }
    //regex to get source = "foo" ((source)\s*=\s*("(.*?)"))
    findTerraformSources = (hclFile: IHclFile[]):Nullable<Map<string,TerraformModule>> => {
        if(hclFile[0] === null || hclFile[0]?.terraform === undefined || hclFile[0]?.terraform[0] === undefined) {
            console.log('No terraform section found');
            return null;
        }

        let foundModules:  Map<string,TerraformModule> = new Map<string,TerraformModule>();
        try {
            hclFile[0]?.terraform.forEach(tf => {
                let requiredProvidersCount = 0;
                if(tf.source !== undefined){
                    foundModules.set(TERRAFORM_SYNTAX.TERRAFORM, {
                        moduleName: TERRAFORM_SYNTAX.TERRAFORM,
                        terraformProperty: TERRAFORM_SYNTAX.TERRAFORM,
                        provider: {
                            source: tf.source,
                            version: ''
                        }
                    })
                }
                if(tf.required_providers !== undefined){
                    let providers = tf.required_providers[requiredProvidersCount] ?? [];
                    Object.keys(providers).forEach(key => {
                        let providerType = providers[key as keyof RequiredProvider] as ProviderType;
                        if(providerType.source !== undefined){
                            foundModules.set(`${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.${key}`,  {
                                moduleName: `${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.${key}`,
                                terraformProperty: TERRAFORM_SYNTAX.REQUIRED_PROVIDERS,
                                provider: providerType
                            } as TerraformModule);
                        }
                    })
                }
                requiredProvidersCount++;
            });
        } catch (error) {
            console.log(`error parsing terraform section in hcl file: ${error}`)
            return null;
        }
        return foundModules
    }
    //((source)\s*=\s*("(.*?)"))
    //module\s+"(\w+)"\s+{[^}]
    //+version\s+=\s+"([\d\.]+)"[^}]+}
    findModuleSources = (hclFile: IHclFile[]):Nullable<Map<string,TerraformModule>> => {
        let foundModules: Map<string,TerraformModule> = new Map<string,TerraformModule>();
        try {
            if(hclFile[0] === null || hclFile[0].module === undefined) {
                console.log('No module found file');
                return null;
            }
            for (let [moduleName, modules] of Object.entries(hclFile[0].module)) {
                if(this.isHclModule(modules)){
                    foundModules.set(moduleName,{
                        moduleName: moduleName,
                        terraformProperty: TERRAFORM_SYNTAX.MODULE,
                        provider: {
                            source: modules[0]?.source ?? '',
                            version: modules[0]?.version ?? ''
                        }
                    } as TerraformModule)
                }
            }
        } catch (error) {
            console.log(`error parsing modules hcl file: ${error}`)
            return null;
        }
        return foundModules;
    }


    findSources = ():DisplayHlcModule[] => {

        let dataTargetElement = document.getElementById('read-only-cursor-text-area') as HTMLTextAreaElement;
        let innerText = dataTargetElement.value;

        if(innerText === ''){
            return [];
        }
        //const regex = new RegExp(/((source)\s*=\s*("(.*?)"))/g)
        let sources: DisplayHlcModule[] = [];
        try {
            let hclFile =  hcl.parseToObject(innerText) as IHclFile[];
            let terraformSources = this.findTerraformSources(hclFile);
            let moduleSources = this.findModuleSources(hclFile);
            const mergedSources = new Map<string,TerraformModule>(
                [...terraformSources?.entries() ?? new Map<string,TerraformModule>(),
                    ...moduleSources?.entries() ?? new Map<string,TerraformModule>() ]);
            for (let [_,module] of mergedSources){
                if(module.provider.source !== undefined){
                    sources.push(new DisplayHlcModule(window.location.href,module));
                }
            }

        } catch (error) {
            console.log(`error parsing hcl file: ${error}`)
            return [];
        }


        return sources;
    }
}