import { Nullable } from "./Nullable";
import { RegistryTarget } from "./RegistryTarget";

export type VersionLookup = (
    address: string,
    target: RegistryTarget,
    versionConstraint: string,
) => Promise<Nullable<string>>;

/** What a link builder needs beyond the source itself. */
export type LinkContext = {
    readonly moduleName: string;
    readonly versionConstraint: string;
    readonly pageUrl: URL;
    readonly resolveVersionAsync: VersionLookup;
    readonly resolveOpenTofuVersionAsync: VersionLookup;
};
