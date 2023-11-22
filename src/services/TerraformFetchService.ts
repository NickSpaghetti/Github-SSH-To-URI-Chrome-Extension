import {ITerraformDataAccess} from "../data-access/ITerraformDataAccess";

export class TerraformFetchService {

    constructor(private readonly terraformDataAccess: ITerraformDataAccess) {}

    /**
     * Gets a list of all current provider versions from registry.terraform.
     * @param providerSource provider full name ex: okta/okta
     * @param providerType provider type found in TERRAFORM_REGISTRY_ROUTES
     */
    public async getTerraformVersionsAsync (providerSource: string,providerType: string): Promise<Array<string>> {
        const response = await this.terraformDataAccess.getTerraformVersionsAsync(providerSource,providerType);
        if(!response.ok){
            throw new Error(`Failed to get terraform provider data from ${providerSource}`);
        }
        const data = response.data;
        const versions = data.versions as Array<string>;
        if(versions == null || versions.length == 0) {
            throw new Error(`Could not find list of current versions from ${providerSource}`)
        }
        return versions;
    }

    /**
     * Gets a list of all current provider versions from registry.terraform.
     * @param providerSource provider full name ex: okta/okta
     * @param providerType provider type found in TERRAFORM_REGISTRY_ROUTES
     * @param version semantic version number ie: 1.0.0
     */
    public async verifyTerraformVersionAsync(providerSource: string, providerType: string, version: string): Promise<boolean> {
        try{
            const response = await this.terraformDataAccess.verifyTerraformVersionAsync(providerSource,providerType,version)
            if(response.ok){
                return true;
            }
        } catch (err){
            return false;
        }
        return false;
    }
}