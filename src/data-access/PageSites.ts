import { Nullable } from "../types/Nullable";
import { GITHUB_HOST, GITLAB_HOST } from "../util/Constants";
import { SupportedPageHost, isSupportedPageHost } from "../util/PageHosts";
import { GitHubPageDataAccess } from "./GitHubPageDataAccess";
import { GitHubPageWriter } from "./GitHubPageWriter";
import { GitLabPageDataAccess } from "./GitLabPageDataAccess";
import { GitLabPageWriter } from "./GitLabPageWriter";
import { IPageDataAccess } from "./IPageDataAccess";
import { IPageWriter } from "./IPageWriter";

/** The reader and writer for one host's file page. */
export type PageSite = {
    readonly reader: IPageDataAccess;
    readonly writer: IPageWriter;
};

const PAGE_SITES: Record<SupportedPageHost, () => PageSite> = {
    [GITHUB_HOST]: () => ({ reader: new GitHubPageDataAccess(), writer: new GitHubPageWriter() }),
    [GITLAB_HOST]: () => ({ reader: new GitLabPageDataAccess(), writer: new GitLabPageWriter() }),
};

/**
 * Returns the reader and writer for a host's file page.
 * @param hostname The hostname of the page.
 * @returns The host's reader and writer, or null when the host is not supported.
 */
export const pageSiteFor = (hostname: string): Nullable<PageSite> =>
    isSupportedPageHost(hostname) ? PAGE_SITES[hostname]() : null;
