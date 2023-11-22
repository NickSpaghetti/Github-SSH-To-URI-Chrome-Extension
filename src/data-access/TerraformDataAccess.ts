import {IFetchService, RunTimeFetchResponse} from "../services/IFetchService";

export class TerraformDataAccess {

    constructor(private readonly runtimeFetchService: IFetchService ) {}

    /**
     * Gets a list of all current provider versions from registry.terraform.
     * @param providerSource provider full name ex: okta/okta
     * @param providerType provider type found in TERRAFORM_REGISTRY_ROUTES
     */
    public async getTerraformVersionsAsync(providerSource: string, providerType: string): Promise<RunTimeFetchResponse<any>> {
        const providerMetaEndpoint = `https://registry.terraform.io/v1/${providerType}/${providerSource}`;
        return await this.runtimeFetchService.fetchDataAsync<any>(providerMetaEndpoint,"force-cache");
    }

    public async verifyTerraformVersionAsync(providerSource: string, providerType: string, version: string): Promise<RunTimeFetchResponse<any>> {
        const providerVersionEndpoint = `https://registry.terraform.io/v1/${providerType}/${providerSource}/${version}`;
        return this.runtimeFetchService.fetchDataAsync<any>(providerVersionEndpoint, "force-cache");
    }
}