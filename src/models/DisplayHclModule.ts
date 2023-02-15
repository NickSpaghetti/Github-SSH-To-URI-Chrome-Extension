import {IDisplayHlcModule} from "./IDisplayHclModule";
import {SourceTypes} from "../types/SourceTypes";
import {Nullable} from "../types/Nullable";

export class DisplayHlcModule implements IDisplayHlcModule{
    hostUri: URL;
    source: string = '';
    moduleName: string = '';
    sourceType: Nullable<SourceTypes> = null;
    modifiedSourceType: Nullable<string> = ''
    constructor(uri: string, source: string, moduleName: string){
        this.hostUri = new URL(uri);
        this.source = source;
        this.moduleName = moduleName;
        this.sourceType = GetSourceType(source);
        this.modifiedSourceType = ResolveSource(this.sourceType,source);
    }

}

function GetSourceType(source: string): Nullable<SourceTypes> {
    if(IsHost(source)){
        return SourceTypes.url;
    }
    if(IsFilePath(source)){
        return SourceTypes.path;
    }
    if(IsSSH(source)){
        return SourceTypes.ssh;
    }
    if(IsPrivateRegistry(source)){
        return SourceTypes.privateRegistry;
    }
    if(IsRegistry(source)){
        return SourceTypes.path;
    }
    return null;
}

function ResolveSource(sourceType: Nullable<SourceTypes>, source: string): Nullable<string> {
    if(sourceType === null){
        return null;
    }

    switch (sourceType) {
        case SourceTypes.url:
            return source;
        case SourceTypes.ssh:
            return sshToUrl(source);
        case SourceTypes.path:
            return source;
        case SourceTypes.registry:
            return registryToUrl(source);
        case SourceTypes.privateRegistry:
            return source;
        default:
            return null;
    }
}
//git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6
//https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules
//https://github.com/gruntwork-io/terraform-aws-lambda/blob/v0.21.6/modules/keep-warm/main.tf
function sshToUrl(source: string): string{
    if(!IsSSH(source)){
        return source;
    }

    let hostName = source.substring(source.indexOf("@") + 1).replace(":","/");
    try{
        let uri = new URL(source);
        let isRef = uri.searchParams.get("ref") !== null
        let branchTag = uri.searchParams.get("ref") ?? "main";
        let dirName = uri.pathname.lastIndexOf(".tf") !== -1 || uri.pathname.lastIndexOf(".hcl") !== -1 ? "blob" : "tree";
        let fullName = hostName
            .replace("//",`/${dirName}/${branchTag}/`)
            .replace(".git","");
        if(isRef){
            fullName = fullName.replace(`?ref=${branchTag}`,"")
        }
        return "https://"+fullName;
    }catch (ex){
        return source;
    }
}

function registryToUrl(source: string){
    return `registry.terraform.io/providers/${source}`
}

function IsHost (source: string): boolean  {
    try {
        let url = new URL(source);
        const position = url.toString().lastIndexOf(url.protocol);
        const domainExtensionPosition = url.toString().lastIndexOf('.');
        return (
            position === 0 && ['http:', 'https:'].indexOf(url.protocol) !== -1 && url.toString().length - domainExtensionPosition > 2
        );
    }
    catch($error){
        return false;
    }
}

function IsPrivateRegistry(source: string): boolean {
    let privateRegistryHostNames = source.substring(0,source.indexOf('/')).split(".");
    return privateRegistryHostNames.length === 3 && privateRegistryHostNames[1] === 'terraform' && privateRegistryHostNames[2] === "io";

}

function IsRegistry(source: string): boolean{
    //public registry are only allowed /
    return source.indexOf(".") === -1 && source.indexOf("//") === -1 && source.indexOf("@") === -1 && source.indexOf(":") === -1;

}

function IsFilePath(source: string): boolean {
    return source.startsWith("./") || source.startsWith("../")
}

function IsSSH(source: string): boolean{
    let startIndex = source.indexOf("::");
    let startHostNameIndex = source.indexOf("@");
    let endHostNameIndex = source.indexOf(":");

    return startIndex !== -1 && startHostNameIndex !== -1 && endHostNameIndex !== -1;
}
