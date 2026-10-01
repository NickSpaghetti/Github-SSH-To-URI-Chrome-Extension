import { Vcs, VCS_PREFIXES } from "../../types/ModuleSource";
import { GITHUB_HOST, GITLAB_HOST } from "../../util/Constants";
import { PATH_SEPARATOR, isFilePath } from "../../util/PathHelpers";

/**
 * A host we know how to browse, and what it runs. The vcs is declared rather
 * than defaulted, so adding a host that is not git has to say so.
 */
export type RepositoryHost = {
    readonly vcs: Vcs;
    /** Whether a source written as `host/owner/repo`, with no prefix, is a repository on this host. */
    readonly shorthand: boolean;
    /** The route a host puts between the repository and the ref when linking to a file. */
    readonly fileRoute: string;
    /** The route a host puts between the repository and the ref when linking to a directory. */
    readonly directoryRoute: string;
};

const BITBUCKET_HOST = "bitbucket.org";
const BITBUCKET_SOURCE_ROUTE = "src";

/**
 * The hosts this extension can browse: what each one runs, and where it puts
 * the ref. The detector reads `shorthand` and the link builder reads the
 * routes.
 */
export const BROWSE_LAYOUTS: Record<string, RepositoryHost | undefined> = {
    [GITHUB_HOST]: {
        vcs: VCS_PREFIXES.GIT,
        shorthand: true,
        fileRoute: "blob",
        directoryRoute: "tree",
    },
    [BITBUCKET_HOST]: {
        // Mercurial hosting ended here on 1 July 2020.
        vcs: VCS_PREFIXES.GIT,
        shorthand: true,
        fileRoute: BITBUCKET_SOURCE_ROUTE,
        directoryRoute: BITBUCKET_SOURCE_ROUTE,
    },
    [GITLAB_HOST]: {
        // go-getter has no gitlab.com shorthand. A prefixless gitlab.com
        // address is a module in GitLab's own Terraform registry.
        vcs: VCS_PREFIXES.GIT,
        shorthand: false,
        fileRoute: `-${PATH_SEPARATOR}blob`,
        directoryRoute: `-${PATH_SEPARATOR}tree`,
    },
};

/**
 * Returns the route a host uses to browse a path.
 * @param host The host's layout.
 * @param path The path being linked to.
 * @returns The file route when the path names a file; otherwise, the directory route.
 */
export const browseRoute = (host: RepositoryHost, path: string): string =>
    isFilePath(path) ? host.fileRoute : host.directoryRoute;
