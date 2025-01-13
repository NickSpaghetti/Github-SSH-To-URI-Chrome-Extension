import { DisplayHlcModule } from "../../models/DisplayHclModule";
import { ISourceControlUiDisplayer } from "./ISourceControlUiDisplayer";

export class BitBucketSourceControlUiDisplayer implements ISourceControlUiDisplayer {
    AddHyperLinksToModuleSource(modules: DisplayHlcModule[]): void {
       this.AddHyperLinksToModuleSourcePrivateBitBucket(modules)
    }

    private AddHyperLinksToModuleSourcePrivateBitBucket(modules: DisplayHlcModule[]): void {
        //all content on private bitbucket are a span with the role presentation
        const codeElements =  Array.from(document.querySelectorAll(`span[role="presentation"]`))
        
        for (let module of modules){
            for(let element of codeElements){
                if(element.textContent != null && element.textContent.includes(module.source) && module.modifiedSourceType != null) {                
                    let a = document.createElement('a');
                    a.id=`BitbucketTerraformSourceUrl-${crypto.randomUUID()}`
                    a.href = module.modifiedSourceType
                    a.rel = "noreferrer";
                    a.target = "_blank";
                    //we have to replace the text inside the code line since private repos don't split out source = "" like other source control html does
                    a.innerText = element.textContent.replace(module.source,module.modifiedSourceType)
                    a.style.setProperty("pointer-events", "all", "important")
                    element.replaceWith(a)
                }
            }
        }
    }

    private AddHyperLinksToModuleSourcePublicBitBucket(modules: DisplayHlcModule[]): void {
        //all content on public bitbucket are a span with the class cm-string
        const codeElements =  Array.from(document.querySelectorAll(`span[class="cm-string"]`))
        
        for (let module of modules){
            for(let element of codeElements){
                if(element.textContent != null && element.textContent.includes(module.source) && module.modifiedSourceType != null) {                
                    let a = document.createElement('a');
                    a.id=`BitbucketTerraformSourceUrl-${crypto.randomUUID()}`
                    a.href = module.modifiedSourceType
                    a.rel = "noreferrer";
                    a.target = "_blank";
                    a.innerText = `"${module.source,module.modifiedSourceType}"`
                    a.style.setProperty("pointer-events", "all", "important")
                    element.replaceWith(a)
                }
            }
        }
    }
    
}