import { HCL_FILE_SUFFIXES, HclFileTypes } from "../types/HclFileTypes";
import { Nullable } from "../types/Nullable";
import { lastSegment } from "../util/PathHelpers";

const DEFAULT_FILE_NAME = "main.tf";
const SOURCE_TEXT_AREA_ID = "read-only-cursor-text-area";

/**
 * Reading the rendered GitHub page. Substituted in tests of anything above it,
 * so that a service can be handed file text without building a DOM.
 */
export interface IGitHubPageDataAccess {
    getFileType(): Nullable<HclFileTypes>;
    getFileName(): string;
    readSourceText(): Nullable<string>;
}

/** The live implementation, reading the DOM GitHub rendered. */
export class GitHubPageDataAccess implements IGitHubPageDataAccess {
    /** @returns the kind of HCL file being viewed, or null when it is not one */
    public getFileType(): Nullable<HclFileTypes> {
        const pathname = new URL(document.URL).pathname.toLowerCase();
        for (const [suffix, fileType] of HCL_FILE_SUFFIXES) {
            if (pathname.endsWith(suffix)) {
                return fileType;
            }
        }
        return null;
    }

    /** @returns the file being viewed, used for parse error positions */
    public getFileName(): string {
        const segment = lastSegment(new URL(document.URL).pathname);
        return segment === "" ? DEFAULT_FILE_NAME : segment;
    }

    /**
     * @returns the file's text, or null when GitHub has not rendered it yet.
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
