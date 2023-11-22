import {RunTimeFetchResponse} from "../services/IFetchService";

export interface ITerraformDataAccess {
    getTerraformVersionsAsync(providerSource: string, providerType: string): Promise<RunTimeFetchResponse<any>>;
    verifyTerraformVersionAsync(providerSource: string, providerType: string, version: string): Promise<RunTimeFetchResponse<any>>;
}