import { Nullable } from "../types/Nullable";
import { GITHUB_HOST, GITLAB_HOST } from "./Constants";

/** The hosts whose file pages the content script reads and links. */
export const SUPPORTED_PAGE_HOSTS = [GITHUB_HOST, GITLAB_HOST] as const;

/** A host whose file pages the content script reads and links. */
export type SupportedPageHost = (typeof SUPPORTED_PAGE_HOSTS)[number];

/**
 * The match pattern each page host's access is granted for at runtime, from
 * `optional_host_permissions` in `public/manifest.json`. Null for a host
 * granted at install.
 */
export const OPT_IN_ORIGINS: Record<SupportedPageHost, Nullable<string>> = {
    [GITHUB_HOST]: null,
    [GITLAB_HOST]: "https://gitlab.com/*",
};

/**
 * @param hostname The hostname to test.
 * @returns true if hostname is a supported page host exactly; otherwise, false.
 */
export const isSupportedPageHost = (hostname: string): hostname is SupportedPageHost =>
    (SUPPORTED_PAGE_HOSTS as readonly string[]).includes(hostname);

/**
 * Returns the match pattern a page host's access must be granted for.
 * @param hostname The page's hostname.
 * @returns The pattern, or null when the host is granted at install or is not supported.
 */
export const optInOriginOf = (hostname: string): Nullable<string> =>
    isSupportedPageHost(hostname) ? OPT_IN_ORIGINS[hostname] : null;
