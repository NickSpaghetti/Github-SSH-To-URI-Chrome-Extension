import { IFetchService } from "./IFetchService";
import { RegistryTarget } from "../types/RegistryTarget";

const API_ROOT = "https://registry.opentofu.org/v1";
const VERSIONS_ROUTE = "versions";
const CACHE_MODE: RequestCache = "force-cache";

/** This api's own spelling of a target. Its browse pages use the singular. */
const API_ROUTES: Record<RegistryTarget, string> = { module: "modules", provider: "providers" };

/** Modules nest the list under the matched module. Providers do not. */
type OpenTofuVersionsResponse = {
    versions?: Array<{ version: string }>;
    modules?: Array<{ versions?: Array<{ version: string }> }>;
};

/** The version list endpoint of registry.opentofu.org. */
export class OpenTofuRegistryDataAccess {
    constructor(private readonly fetchService: IFetchService) {}

    /**
     * @param address Module or provider address ex: terraform-aws-modules/vpc/aws.
     * @param target Whether the address names a module or a provider.
     * @returns Every version the registry publishes for the address, which may be none.
     * @throws When the registry answers with a non ok status.
     */
    public async getVersionsAsync(address: string, target: RegistryTarget): Promise<string[]> {
        const response = await this.fetchService.fetchDataAsync<OpenTofuVersionsResponse>(
            `${API_ROOT}/${API_ROUTES[target]}/${address}/${VERSIONS_ROUTE}`,
            CACHE_MODE,
        );
        if (!response.ok) {
            throw new Error(`could not reach the opentofu registry for ${address}`);
        }

        const entries = response.data?.modules?.[0]?.versions ?? response.data?.versions ?? [];
        return entries.map((entry) => entry.version);
    }
}
