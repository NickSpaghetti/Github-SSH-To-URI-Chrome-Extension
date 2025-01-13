import { DisplayHlcModule } from "../../models/DisplayHclModule";
import { Nullable } from "../../types/Nullable";
import { BITBUCKET_ROUTES, GITHUB_ROUTES } from "../../util/constants";
import { BitBucketSourceControlUiDisplayer } from "./BitbucketSourceControlUiDisplayer";
import { GithubSourceControlUiDisplayer } from "./GithubSourceControlUiDisplayer";
import { ISourceControlUiDisplayer } from "./ISourceControlUiDisplayer";


export class SourceControlUiDisplayer {

    private _sourceControlUiDisplayer: Nullable<ISourceControlUiDisplayer> = null;

    private readonly _sourceControlLookup = new Map<string, ISourceControlUiDisplayer> (
        [
            [GITHUB_ROUTES.HOST,new GithubSourceControlUiDisplayer()],
            [BITBUCKET_ROUTES.HOST,new BitBucketSourceControlUiDisplayer()],
        ]

    )

    constructor(source: string | ISourceControlUiDisplayer) {
        if(source == null){
            throw new Error("source cannot be null or undefined.")
        } else if(typeof(source) === "string"){
            this.setHost(source)
        } else if (this.isSourceControlDisplayer(source)){
            this._sourceControlUiDisplayer = source
        }
    }

    private isSourceControlDisplayer(source: string | ISourceControlUiDisplayer): source is ISourceControlUiDisplayer{
        return(source as ISourceControlUiDisplayer).AddHyperLinksToModuleSource !== undefined;
    }

    private setHost(domain: string) {
        let sourceControl = this._sourceControlLookup.get(domain)
        if(sourceControl === undefined){
            //since private bitbucket instances don't have a bitbucket hostname so we check for a bitbucket logo
            const bitbucketLogo = document.querySelector(`#logo`)?.classList.contains('bitbucket-header-logo')
            if(bitbucketLogo === true){
                this._sourceControlUiDisplayer = new BitBucketSourceControlUiDisplayer();
            }
            throw new Error(`Could not find a UiDisplay for ${domain}.`)
        }
        this._sourceControlUiDisplayer = sourceControl
    }

    public AddHyperLinksToModuleSource(modules: DisplayHlcModule[]): void {
        this._sourceControlUiDisplayer?.AddHyperLinksToModuleSource(modules);
    }
}