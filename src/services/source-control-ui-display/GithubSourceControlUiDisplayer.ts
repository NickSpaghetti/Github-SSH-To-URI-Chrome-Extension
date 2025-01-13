import { DisplayHlcModule } from "../../models/DisplayHclModule";
import { Nullable } from "../../types/Nullable";
import { ISourceControlUiDisplayer } from "./ISourceControlUiDisplayer";

export class GithubSourceControlUiDisplayer implements ISourceControlUiDisplayer {

   AddHyperLinksToModuleSource(modules: DisplayHlcModule[]): void {
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
                    this.replaceSourceTag(childTextNodes[i], module.modifiedSourceType, text, parent?.parentElement?.id)
                }
            })
        }
    
       }
    
   private replaceSourceTag(childNode: HTMLElement | ChildNode, modifiedSourceType: Nullable<string>, innerText: string, lineCount: string | undefined) {
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
}