import { HCL_FILE_SUFFIXES, HclFileTypes } from "../types/HclFileTypes";
import { CommitIdentity } from "../types/CommitIdentity";
import { Nullable } from "../types/Nullable";
import { lastSegment } from "../util/PathHelpers";
import { IGitHubPageDataAccess } from "./IGitHubPageDataAccess";

const DEFAULT_FILE_NAME = "main.tf";
const SOURCE_TEXT_AREA_ID = "read-only-cursor-text-area";

// GitHub puts the file's last commit in the blob header: the sha in the
// history link, the timestamp on a `relative time`. Both track the file being
// shown rather than the branch head, and both survive a soft navigation.
const COMMIT_LINK = "a[href*='/commit/']";
const COMMIT_SEPARATOR = "/commit/";
const COMMIT_TIME = "relative-time[datetime]";

/** The live implementation, reading the DOM GitHub rendered. */
export class GitHubPageDataAccess implements IGitHubPageDataAccess {
    /**
     * Returns the kind of HCL file being viewed.
     * @returns The file type, or null when the page is not one.
     */
    public getFileType(): Nullable<HclFileTypes> {
        const pathname = new URL(document.URL).pathname.toLowerCase();
        for (const [suffix, fileType] of HCL_FILE_SUFFIXES) {
            if (pathname.endsWith(suffix)) {
                return fileType;
            }
        }
        return null;
    }

    /**
     * Returns the name of the file being viewed, used for parse error positions.
     * @returns The file name.
     */
    public getFileName(): string {
        const segment = lastSegment(new URL(document.URL).pathname);
        return segment === "" ? DEFAULT_FILE_NAME : segment;
    }

    /**
     * Reads the commit the file being viewed was last changed by.
     * @returns The commit, or null when the page does not say. Null means the
     * caller must not cache: an entry written without it could not be told
     * apart from a stale one.
     */
    public readCommitIdentity(): Nullable<CommitIdentity> {
        const link = document.querySelector(COMMIT_LINK) as Nullable<HTMLAnchorElement>;
        const sha = link?.getAttribute("href")?.split(COMMIT_SEPARATOR)[1];
        const lastCommitDateTime = document.querySelector(COMMIT_TIME)?.getAttribute("datetime");
        if (
            sha === undefined ||
            sha === "" ||
            lastCommitDateTime === undefined ||
            lastCommitDateTime === null
        ) {
            return null;
        }
        return { sha: sha, lastCommitDateTime: lastCommitDateTime };
    }

    /**
     * @returns The file's text, or null when GitHub has not rendered it yet.
     * Null is not the same as "": the caller must not cache a page read before
     * it rendered, or it stays empty for as long as the cache lives.
     */
    public readSourceText(): Nullable<string> {
        const element = document.getElementById(
            SOURCE_TEXT_AREA_ID,
        ) as Nullable<HTMLTextAreaElement>;
        const text = element?.value;
        return text === undefined || text === "" ? null : text;
    }
}
