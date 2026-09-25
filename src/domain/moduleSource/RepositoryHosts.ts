import { Vcs, VCS_PREFIXES } from "../../types/ModuleSource";
import { GITHUB_HOST } from "../../util/Constants";
import { isFilePath } from "../../util/PathHelpers";

/**
 * The route a host puts between the repository and the ref.
 * @param subdir the path being linked to, which GitHub needs in order to tell
 * a file from a directory
 */
type BrowseRoute = (subdir: string) => string;

/**
 * A host we know how to browse, and what it runs. The vcs is declared rather
 * than defaulted, so adding a host that is not git has to say so.
 */
export type RepositoryHost = {
    readonly vcs: Vcs;
    readonly route: BrowseRoute;
};

export const GITHUB_BLOB_ROUTE = "blob";
export const GITHUB_TREE_ROUTE = "tree";

const BITBUCKET_HOST = "bitbucket.org";
const BITBUCKET_SOURCE_ROUTE = "src";

/**
 * The hosts this extension can browse: what each one runs, and where it puts
 * the ref. The detector and the link builder both read it, so a host added
 * here is recognised and linked in one edit. go-getter ships detectors for
 * these; anything else dotted is treated as a registry host.
 */
export const BROWSE_LAYOUTS: Record<string, RepositoryHost | undefined> = {
    [GITHUB_HOST]: {
        vcs: VCS_PREFIXES.GIT,
        route: (subdir) => (isFilePath(subdir) ? GITHUB_BLOB_ROUTE : GITHUB_TREE_ROUTE),
    },
    [BITBUCKET_HOST]: {
        // Mercurial hosting ended here on 1 July 2020.
        vcs: VCS_PREFIXES.GIT,
        route: () => BITBUCKET_SOURCE_ROUTE,
    },
};
