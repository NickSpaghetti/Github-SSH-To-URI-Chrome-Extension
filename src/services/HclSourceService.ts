import {Nullable} from "../types/Nullable";
import {SourceTypes} from "../types/SourceTypes";
import {FileExtensions, GITHUB_ROUTES, TERRAFORM_REGISTRY_ROUTES, TERRAFORM_SYNTAX} from "../util/constants";

export class HclSourceService {
    GetSourceType = (source: string): Nullable<SourceTypes> => {
        if(this.IsHost(source)){
            return SourceTypes.url;
        }
        if(this.IsFilePath(source)){
            return SourceTypes.path;
        }
        if(this.IsSSH(source)){
            return SourceTypes.ssh;
        }
        if(this.IsPrivateRegistry(source)){
            return SourceTypes.privateRegistry;
        }
        if(this.IsRegistry(source)){
            return SourceTypes.registry;
        }
        return null;
    }

    ResolveSource = (sourceType: Nullable<SourceTypes>, source: string, moduleName: string, sourceVersion: string): Nullable<string> => {
        if(sourceType === null){
            return null;
        }

        switch (sourceType) {
            case SourceTypes.url:
                return source;
            case SourceTypes.ssh:
                return this.sshToUrl(source);
            case SourceTypes.path:
                return source;
            case SourceTypes.registry:
                return this.registryToUrl(source, moduleName, sourceVersion);
            case SourceTypes.privateRegistry:
                return source;
            default:
                return null;
        }
    }
    //git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6
    //https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules
    //https://github.com/gruntwork-io/terraform-aws-lambda/blob/v0.21.6/modules/keep-warm/main.tf
    sshToUrl = (source: string): string => {
        if(!this.IsSSH(source)){
            return source;
        }

        let hostName = source.substring(source.indexOf("@") + 1).replace(":","/");
        try{
            let uri = new URL(source);
            let isRef = uri.searchParams.get("ref") !== null
            let branchTag = uri.searchParams.get("ref") ?? "main";
            let dirName =
                uri.pathname.lastIndexOf(FileExtensions.TF) !== -1 || uri.pathname.lastIndexOf(FileExtensions.HCL) !== -1
                    ? GITHUB_ROUTES.BLOB
                    : GITHUB_ROUTES.TREE;

            let fullName = hostName.replace(FileExtensions.GIT,"");
            if(isRef){
                fullName = fullName.replace(`?ref=${branchTag}`,"")
            }
            if(fullName.indexOf("//") === -1){
                fullName += `/${dirName}/${branchTag}/`
            }
            else{
                fullName = fullName.replace("//",`/${dirName}/${branchTag}/`)
            }

            return `https://${fullName}`;
        }catch (ex){
            return source;
        }
    }

    registryToUrl = (source: string, moduleName: string, sourceVersion: string):string => {
        let providerType = moduleName.includes(TERRAFORM_SYNTAX.REQUIRED_PROVIDERS)
            ? TERRAFORM_REGISTRY_ROUTES.PROVIDERS
            : TERRAFORM_REGISTRY_ROUTES.MODULES
        let version = this.computeVersion( sourceVersion?? '');

        return `https://registry.terraform.io/${providerType}/${source}/${version}`
    }

    //expects input in terraform version formats
    computeVersion = (version: string): string =>{
        if(version === ''){
            return version;
        }
        const [leftConstraint, rightConstraint] = version.split(', ');
        if(!rightConstraint){
            if(!isNaN(parseFloat(version))){
                return version.trim();
            }
            const [sign, versionConstraint] = leftConstraint.split(' ');
            return !parseFloat(sign) ? versionConstraint.trim() : sign.trim();
        }
        const [leftSign, leftVersion] = leftConstraint.split(' ');
        const [rightSign, rightVersion] = rightConstraint.split(' ');
        if(leftSign !== '>=' && (rightSign === '<=' || rightSign === '>=')){
            return rightVersion.trim();
        }
        if(leftSign === '>='){
            return leftVersion.trim();
        }
        if(rightSign === '<='){
            return rightVersion.trim();
        }
        return leftVersion.trim();
    };



    IsHost = (source: string): boolean =>  {
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

    IsPrivateRegistry = (source: string): boolean => {
        let stripedHttpSource = source.replace("https://","")
                                    .replace("http://","");

        let privateRegistryHostNames =  stripedHttpSource.substring(0,stripedHttpSource.indexOf('/'))
                                                        .split(".");
        return privateRegistryHostNames.length === 3 && privateRegistryHostNames[1] === 'terraform' && privateRegistryHostNames[2] === "io";

    }

    IsRegistry = (source: string): boolean => {
        //public registry are only allowed /
        return source !== "" && source.indexOf(".") === -1 && source.indexOf("//") === -1 && source.indexOf("@") === -1 && source.indexOf(":") === -1;

    }

    IsFilePath = (source: string): boolean => {
        return source.startsWith("./") || source.startsWith("../")
    }

    IsSSH = (source: string): boolean => {
        let startIndex = source.indexOf("::");
        let startHostNameIndex = source.indexOf("@");
        let endHostNameIndex = source.indexOf(":");

        return startIndex !== -1 && startHostNameIndex !== -1 && endHostNameIndex !== -1;
    }
}

