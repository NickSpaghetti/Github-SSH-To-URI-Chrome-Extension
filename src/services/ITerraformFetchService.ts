export interface ITerraformFetchService {
    getTerraformVersionsAsync (providerSource: string,providerType: string): Promise<Array<string>>;
    verifyTerraformVersionAsync(providerSource: string, providerType: string, version: string): Promise<boolean>;
}