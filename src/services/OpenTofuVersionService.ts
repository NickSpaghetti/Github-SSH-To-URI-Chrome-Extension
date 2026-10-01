import valid from "semver/functions/valid";
import { OpenTofuRegistryDataAccess } from "../data-access/OpenTofuRegistryDataAccess";
import { Nullable } from "../types/Nullable";
import { RegistryTarget } from "../types/RegistryTarget";
import { selectVersion, toVersionConstraint } from "../domain/VersionConstraint";

/**
 * Resolves a constraint against what registry.opentofu.org publishes.
 *
 * Its api takes a version rather than a constraint, so nothing is assumed: a
 * version is used only once the registry confirms it. There is no fallback,
 * because OpenTofu serves a `latest` route that is always a live page, and
 * choosing it is the caller's decision rather than this service's.
 */
export class OpenTofuVersionService {
    constructor(private readonly registry: OpenTofuRegistryDataAccess) {}

    /**
     * Returns the version a constraint selects from the OpenTofu registry.
     * @param address Module or provider address ex: terraform-aws-modules/vpc/aws.
     * @param target Whether the address names a module or a provider.
     * @param versionConstraint The block's version constraint, or "".
     * @returns The version the constraint selects, or null when nothing does.
     * @throws When the registry is unreachable.
     */
    public async selectVersionAsync(
        address: string,
        target: RegistryTarget,
        versionConstraint: string,
    ): Promise<Nullable<string>> {
        if (versionConstraint === "") {
            return null;
        }
        const published = await this.registry.getVersionsAsync(address, target);
        const selected = selectVersion(
            published.filter((version) => valid(version) !== null),
            toVersionConstraint(versionConstraint),
        );
        return selected === "" ? null : selected;
    }
}
