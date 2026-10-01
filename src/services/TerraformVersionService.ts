import valid from "semver/functions/valid";
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
     * Returns the version a constraint selects from the Terraform registry.
     * @param address Module or provider address ex: hashicorp/aws.
     * @param target Whether the address names a module or a provider.
     * @param versionConstraint The block's version constraint, or "".
     * @returns The version the constraint selects, the newest published when
     * nothing satisfies it, or null when the registry published nothing usable.
     * @throws When the registry is unreachable.
     */
    public async selectVersionAsync(
        address: string,
        target: RegistryTarget,
        versionConstraint: string,
    ): Promise<Nullable<string>> {
        const allVersions = await this.registry.getVersionsAsync(address, target);
        const published = allVersions.filter((version) => valid(version) !== null);
        const selected = selectVersion(published, toVersionConstraint(versionConstraint));
        if (selected !== "") {
            return selected;
        }

        const newest = selectVersion(published, toVersionConstraint(""));
        return newest === "" ? null : newest;
    }
}
