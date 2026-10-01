import { HclFileTypes } from "../types/HclFileTypes";
import { Nullable } from "../types/Nullable";
import { IPageDataAccess } from "./IPageDataAccess";
import { fileNameOf, fileTypeOf } from "./PageFile";

const SOURCE_TEXT_AREA_ID = "read-only-cursor-text-area";

// GitHub puts the file's last commit in the blob header's history link. It
// tracks the file being shown rather than the branch head, and survives a
// soft navigation.
const COMMIT_LINK = "a[href*='/commit/']";
const COMMIT_SEPARATOR = "/commit/";

/** The live implementation, reading the DOM GitHub rendered. */
export class GitHubPageDataAccess implements IPageDataAccess {
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
     * @returns The file's text, or null when GitHub has not rendered it yet.
     * Null is not the same as "": the caller must not cache a page read before
     * it rendered, or it stays empty for as long as the cache lives.
     */
    public readSourceTextAsync(): Promise<Nullable<string>> {
        const element = document.getElementById(
            SOURCE_TEXT_AREA_ID,
        ) as Nullable<HTMLTextAreaElement>;
        const text = element?.value;
        return Promise.resolve(text === undefined || text === "" ? null : text);
    }
}
