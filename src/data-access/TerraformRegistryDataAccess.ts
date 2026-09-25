import { IFetchService } from "./IFetchService";
import { RegistryTarget } from "../types/RegistryTarget";

const API_ROOT = "https://registry.terraform.io/v1";
const CACHE_MODE: RequestCache = "force-cache";

/** This api's own spelling of a target. */
const API_ROUTES: Record<RegistryTarget, string> = { module: "modules", provider: "providers" };

/** What the registry answers with at `/v1/{route}/{address}`. */
type TerraformVersionsResponse = { versions?: string[] };

/** The version list endpoint of registry.terraform.io. */
export class TerraformRegistryDataAccess {
    constructor(private readonly fetchService: IFetchService) {}

    /**
     * @param address module or provider address ex: hashicorp/aws
     * @param target whether the address names a module or a provider
     * @returns every version the registry publishes for the address
     * @throws when the registry answers with a non ok status
     * @throws when the registry publishes no versions for the address
     */
    public async getVersionsAsync(address: string, target: RegistryTarget): Promise<string[]> {
        const response = await this.fetchService.fetchDataAsync<TerraformVersionsResponse>(
            `${API_ROOT}/${API_ROUTES[target]}/${address}`,
            CACHE_MODE,
        );
        if (!response.ok) {
            throw new Error(`could not reach the terraform registry for ${address}`);
        }

        const versions = response.data?.versions ?? [];
        if (versions.length === 0) {
            throw new Error(`the terraform registry publishes no versions for ${address}`);
        }
        return versions;
    }
}
