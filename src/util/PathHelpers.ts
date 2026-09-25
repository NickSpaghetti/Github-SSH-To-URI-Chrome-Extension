/** Generic path handling: no domain knowledge, no I/O. */
export const PATH_SEPARATOR = "/";

/**
 * @param path a path, with or without a trailing separator
 * @returns the last non-empty segment, or "" when there is none
 */
export const lastSegment = (path: string): string =>
    path.split(PATH_SEPARATOR).filter(Boolean).pop() ?? "";

/**
 * A dot in the final segment means a file. Directories rarely carry one.
 * @param path a path to classify
 * @returns whether it names a file rather than a directory
 */
export const isFilePath = (path: string): boolean => lastSegment(path).includes(".");
