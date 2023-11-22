import {IDisplayHlcModule} from "./IDisplayHclModule";
import {SourceTypes} from "../types/SourceTypes";
import {Nullable} from "../types/Nullable";
import { TerraformModule } from "../types/Terraform";
import {HclSourceService} from "../services/HclSourceService";
import {ITerraformFetchService} from "../services/ITerraformFetchService";

export class DisplayHlcModule implements IDisplayHlcModule {
    public hostUri: URL;
    public source: string = '';
    public moduleName: string = '';
    public sourceType: Nullable<SourceTypes> = null;
    public modifiedSourceType: Nullable<string> = '';
    private readonly terraformModule: TerraformModule;

    private constructor(uri: string, terraformModule: TerraformModule) {
        this.hostUri = new URL(uri);
        this.terraformModule = terraformModule;
        this.moduleName = terraformModule.moduleName;
    }

    public static async build(uri: string, terraformModule: TerraformModule, terraformFetchService: ITerraformFetchService): Promise<DisplayHlcModule> {
        const hclSourceService: HclSourceService = new HclSourceService(terraformFetchService);
        let instance = new DisplayHlcModule(uri,terraformModule);
        if (terraformModule.provider.source !== undefined && terraformModule.provider.source !== '' && terraformModule.provider.version !== undefined) {
            instance.source = terraformModule.provider.source;
            instance.sourceType = hclSourceService.GetSourceType(terraformModule.provider.source)
            instance.modifiedSourceType = await hclSourceService.ResolveSource(instance.sourceType, terraformModule.provider.source, terraformModule.moduleName, terraformModule.provider.version, new URL(uri))
        }
        return instance;
    }
}