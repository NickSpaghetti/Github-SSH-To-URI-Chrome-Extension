import { BITBUCKET_ROUTES, FileExtensions } from "../../util/constants";
import { ISourceControlProvider } from "./ISourceControlProvider";

export class BitBucketSourceControlProvider implements ISourceControlProvider {
    public SshToUrl = (source: string): string => {
        //TODO:figure out what version of bitbucket the source comes from
        return this.privateBitBucketSSHToUrl(source)
    }

    private privateBitBucketSSHToUrl(source: string){
        let href = source.substring(source.indexOf("@") + 1).replace("::","/");
        //some private instances use a different port for ssh so in order to vew it on the browser we need to change it to 443
        if(!href.startsWith("https://")){
           let tempHostname = new URL(`https://${href}`);
           if(tempHostname.port != '443'){
            tempHostname.port = '443'
            href = tempHostname.href
           }
        }
        try{
            let uri = new URL(href)
            let paths = uri.pathname.split('/')
            let project = paths[1]
            let repo = paths[2].replace(FileExtensions.GIT,'')
            let isRef = uri.searchParams.get("ref") !== null
            let refName = uri.searchParams.get("ref") ?? "";
            let repoPath = ""
            //the repo path is after
            if(refName.includes('//')){
                const repoPathStart = refName.lastIndexOf('//')
                repoPath = refName.substring(repoPathStart + 1)
                refName = refName.substring(0,repoPathStart);
            }
            let fullName = `${uri.origin}/${BITBUCKET_ROUTES.PROJECTS}/${project}/${BITBUCKET_ROUTES.REPOS}/${repo}/${BITBUCKET_ROUTES.BROWSE}${repoPath}${isRef ? `?at=${refName}` : ""}`
            return fullName
        }catch (ex){
            console.log(ex);
            return source;
        }
    }
    
    //TODO fillout logic
    private publicBitbucketSSHToUrl(source: string){

    }
    
    //TODO fillout logic
    private workspaceBitBucketSSHToUrl(source: string) {

    }
    
}