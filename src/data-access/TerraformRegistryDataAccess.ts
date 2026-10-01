import { IFetchService } from "./IFetchService";
import { RegistryTarget } from "../types/RegistryTarget";

const API_ROOT = "https://registry.terraform.io/v1";
const CACHE_MODE: RequestCache = "force-cache";

/** This api's own spelling of a target. */
const API_ROUTES: Record<RegistryTarget, string> = { module: "modules", provider: "providers" };

/** What the registry answers with at `/v1/{route}/{address}`. */
type VersionsResponse = { versions: string[] };

const isVersionsResponse = (data: unknown): data is VersionsResponse =>
    typeof data === "object" &&
    data !== null &&
    "versions" in data &&
    Array.isArray(data.versions) &&
    data.versions.every((version: unknown) => typeof version === "string");

/** The version list endpoint of registry.terraform.io. */
export class TerraformRegistryDataAccess {
    constructor(private readonly fetchService: IFetchService) {}

    /**
     * @param address Module or provider address ex: hashicorp/aws.
     * @param target Whether the address names a module or a provider.
     * @returns Every version the registry publishes for the address, which may be none.
     * @throws When the registry answers with a non ok status.
     */
    public async getVersionsAsync(address: string, target: RegistryTarget): Promise<string[]> {
        const response = await this.fetchService.fetchDataAsync(
            `${API_ROOT}/${API_ROUTES[target]}/${address}`,
            CACHE_MODE,
        );
        if (!response.ok) {
            throw new Error(`could not reach the terraform registry for ${address}`);
        }

        return isVersionsResponse(response.data) ? response.data.versions : [];
    }
}
