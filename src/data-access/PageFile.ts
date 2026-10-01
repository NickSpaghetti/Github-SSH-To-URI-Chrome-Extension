import { HCL_FILE_SUFFIXES, HclFileTypes } from "../types/HclFileTypes";
import { Nullable } from "../types/Nullable";
import { lastSegment } from "../util/PathHelpers";

const DEFAULT_FILE_NAME = "main.tf";

/**
 * Returns the kind of HCL file a page url names.
 * @param pageUrl The url of the page.
 * @returns The file type, or null when the url names no HCL file.
 */
export const fileTypeOf = (pageUrl: string): Nullable<HclFileTypes> => {
    const pathname = new URL(pageUrl).pathname.toLowerCase();
    for (const [suffix, fileType] of HCL_FILE_SUFFIXES) {
        if (pathname.endsWith(suffix)) {
            return fileType;
        }
    }
    return null;
};

/**
 * Returns the name of the file a page url names.
 * @param pageUrl The url of the page.
 * @returns The file name, or main.tf when the url ends without one.
 */
export const fileNameOf = (pageUrl: string): string => {
    const segment = lastSegment(new URL(pageUrl).pathname);
    return segment === "" ? DEFAULT_FILE_NAME : segment;
};
