import { ModuleSource } from "../types/ModuleSource";
import { OpenTofuVersionService } from "./OpenTofuVersionService";
import { TerraformVersionService } from "./TerraformVersionService";
import { NO_LINK, resolverFor } from "../domain/moduleSource/ModuleSourceResolvers";
import { LinkContext, VersionLookup } from "../types/LinkContext";
import { ModuleLink } from "../types/ModuleLink";
import { logRecovered } from "../util/Log";

/**
 * Builds the browse url for a classified module source. Which builder runs is
 * decided by the shared resolver table, not by a second priority list.
 */
export class ModuleSourceLinker {
    constructor(
        private readonly terraformVersionService: TerraformVersionService,
        private readonly openTofuVersionService: OpenTofuVersionService,
    ) {}

    /**
     * Builds the browse link for a classified module source.
     *
     * A defect in a pure link builder is not caught here. It should surface.
     * @param source A classified module source.
     * @param moduleName The block name, which decides the provider or module route.
     * @param versionConstraint The block's version constraint, or "".
     * @param pageUrl The page the source was read from, for relative paths.
     * @returns The browse url and the version a registry resolved, if any.
     */
    public async linkAsync(
        source: ModuleSource,
        moduleName: string,
        versionConstraint: string,
        pageUrl: URL,
    ): Promise<ModuleLink> {
        const build = resolverFor(source).linkAsync;
        if (build === null) {
            return NO_LINK;
        }
        return await build(source, this.contextFor(moduleName, versionConstraint, pageUrl));
    }

    private contextFor(moduleName: string, versionConstraint: string, pageUrl: URL): LinkContext {
        return {
            moduleName: moduleName,
            versionConstraint: versionConstraint,
            pageUrl: pageUrl,
            resolveVersionAsync: contained((address, route, constraint) =>
                this.terraformVersionService.selectVersionAsync(address, route, constraint),
            ),
            resolveOpenTofuVersionAsync: contained((address, route, constraint) =>
                this.openTofuVersionService.selectVersionAsync(address, route, constraint),
            ),
        };
    }
}

/**
 * The registry is the only thing in a link build that fails legitimately, so
 * it is the only thing wrapped. An unreachable registry reads the same as one
 * that names no version: null, and the resolver row decides what that means.
 */
const contained =
    (lookup: VersionLookup): VersionLookup =>
    async (address, target, versionConstraint) => {
        try {
            return await lookup(address, target, versionConstraint);
        } catch (error) {
            logRecovered(`could not resolve a version for ${address}`, error);
            return null;
        }
    };
