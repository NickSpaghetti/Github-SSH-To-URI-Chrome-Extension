import * as semver from "semver";
import { TerraformRegistryDataAccess } from "../data-access/TerraformRegistryDataAccess";
import { Nullable } from "../types/Nullable";
import { RegistryTarget } from "../types/RegistryTarget";
import { selectVersion, toVersionConstraint } from "../domain/VersionConstraint";

/**
 * Resolves a constraint against what registry.terraform.io publishes.
 *
 * Its fallback is the newest published version, because a Terraform browse url
 * has to name a concrete version and a live page for the wrong one beats no
 * link at all.
 */
export class TerraformVersionService {
    constructor(private readonly registry: TerraformRegistryDataAccess) {}

    /**
     * @param address module or provider address ex: hashicorp/aws
     * @param target whether the address names a module or a provider
     * @param versionConstraint the block's version constraint, or ""
     * @returns the version the constraint selects, the newest published when
     * nothing satisfies it, or null when the registry published nothing usable
     * @throws when the registry is unreachable or returns no version list
     */
    public async selectVersionAsync(
        address: string,
        target: RegistryTarget,
        versionConstraint: string,
    ): Promise<Nullable<string>> {
        const allVersions = await this.registry.getVersionsAsync(address, target);
        const published = allVersions.filter((version) => semver.valid(version) !== null);
        const selected = selectVersion(published, toVersionConstraint(versionConstraint));
        if (selected !== "") {
            return selected;
        }

        return semver.maxSatisfying(published, "*");
    }
}
