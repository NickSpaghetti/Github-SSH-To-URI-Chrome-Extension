import {IDisplayHlcModule} from "./IDisplayHclModule";
import {SourceTypes} from "../types/SourceTypes";
import {Nullable} from "../types/Nullable";
import { TerraformModule } from "../types/Terraform";
import {HclSourceService} from "../services/HclSourceService";

export class DisplayHlcModule implements IDisplayHlcModule {
    hostUri: URL;
    source: string = '';
    moduleName: string = '';
    sourceType: Nullable<SourceTypes> = null;
    modifiedSourceType: Nullable<string> = '';
    private terraformModule: TerraformModule;
    private hclSourceService: HclSourceService = new HclSourceService();

    constructor(uri: string, terraformModule: TerraformModule) {
        this.hostUri = new URL(uri);
        this.terraformModule = terraformModule;
        this.moduleName = terraformModule.moduleName;
        if (terraformModule.provider.source !== undefined && terraformModule.provider.source !== '' && terraformModule.provider.version !== undefined) {
            this.source = terraformModule.provider.source
            this.sourceType = this.hclSourceService.GetSourceType(terraformModule.provider.source)
            this.modifiedSourceType = this.hclSourceService.ResolveSource(this.sourceType, terraformModule.provider.source, terraformModule.moduleName, terraformModule.provider.version, new URL(uri))
        }

    }
}