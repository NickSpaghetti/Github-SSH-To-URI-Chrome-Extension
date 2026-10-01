import { HclFileTypes } from "../types/HclFileTypes";
import { Nullable } from "../types/Nullable";
import { logRecovered } from "../util/Log";
import { IPageDataAccess } from "./IPageDataAccess";
import { fileNameOf, fileTypeOf } from "./PageFile";

// GitLab serves the file a blob page shows at the same path with `/-/raw/` in
// place of `/-/blob/`, resolving the ref and the file path itself. The page
// renders lines in chunks as they scroll into view, so it never holds the
// whole file.
const BLOB_ROUTE = "/-/blob/";
const RAW_ROUTE = "/-/raw/";

// GitLab links the file's last commit from the blob header.
const COMMIT_LINK = "a[href*='/-/commit/']";
const COMMIT_SEPARATOR = "/-/commit/";

/** Fetches a url the way the page itself would. */
export type PageFetch = (url: string) => Promise<Response>;

const fetchAsPage: PageFetch = (url) => fetch(url, { credentials: "same-origin" });

/** The live implementation, reading the page GitLab rendered and its raw file. */
export class GitLabPageDataAccess implements IPageDataAccess {
    private fetchedUrl = "";
    private fetched: Promise<Nullable<string>> = Promise.resolve(null);

    /**
     * @param fetchAsync How the raw file is fetched. Same origin, so a private
     * project is read with the viewer's own session.
     */
    constructor(private readonly fetchAsync: PageFetch = fetchAsPage) {}

    /**
     * Returns the kind of HCL file being viewed.
     * @returns The file type, or null when the page is not one.
     */
    public getFileType(): Nullable<HclFileTypes> {
        return fileTypeOf(document.URL);
    }

    /**
     * Returns the name of the file being viewed, used for parse error positions.
     * @returns The file name.
     */
    public getFileName(): string {
        return fileNameOf(document.URL);
    }

    /**
     * Reads the sha of the commit the file being viewed was last changed by.
     * @returns The sha, or null when the page does not say. Null means the
     * caller must not cache: an entry written without it could not be told
     * apart from a stale one.
     */
    public readCommitSha(): Nullable<string> {
        const link = document.querySelector(COMMIT_LINK) as Nullable<HTMLAnchorElement>;
        const sha = link?.getAttribute("href")?.split(COMMIT_SEPARATOR)[1];
        return sha === undefined || sha === "" ? null : sha;
    }

    /**
     * Fetches the text of the file being viewed, once per page.
     * @returns The file's text, or null when the page is not a blob, the fetch
     * fails, or the file is empty. The caller must not cache on null.
     */
    public readSourceTextAsync(): Promise<Nullable<string>> {
        const rawUrl = rawUrlOf(document.URL);
        if (rawUrl === null) {
            return Promise.resolve(null);
        }
        if (rawUrl !== this.fetchedUrl) {
            this.fetchedUrl = rawUrl;
            this.fetched = this.fetchTextAsync(rawUrl);
        }
        return this.fetched;
    }

    private async fetchTextAsync(rawUrl: string): Promise<Nullable<string>> {
        try {
            const response = await this.fetchAsync(rawUrl);
            if (!response.ok) {
                logRecovered(`could not fetch the file being viewed: ${response.status}`);
                return null;
            }
            const text = await response.text();
            return text === "" ? null : text;
        } catch (error) {
            logRecovered("could not fetch the file being viewed", error);
            return null;
        }
    }
}

const rawUrlOf = (pageUrl: string): Nullable<string> => {
    const url = new URL(pageUrl);
    const routeAt = url.pathname.indexOf(BLOB_ROUTE);
    if (routeAt === -1) {
        return null;
    }
    const pathname =
        url.pathname.slice(0, routeAt) +
        RAW_ROUTE +
        url.pathname.slice(routeAt + BLOB_ROUTE.length);
    return `${url.origin}${pathname}`;
};
