import { SourceTypes } from "./SourceTypes";
import { Nullable } from "./Nullable";

/** One module declaration as the popup and the content script show it. */
export type DisplayModule = {
    source: string;
    moduleName: string;
    sourceType: SourceTypes;
    resolvedUrl: Nullable<string>;
    versionConstraint: string;
    resolvedVersion: string;
    /** The 1-based line the source is written on, or null when the parser did not say. */
    sourceLine: Nullable<number>;
    /** The 0-based UTF-16 offset of the written source within its line, or null when the parser did not say. */
    sourceColumn: Nullable<number>;
    /** The source as the file writes it, which is what the page shows. */
    writtenSource: string;
};

/**
 * @param moduleName The block name, the one field always known.
 * @returns A row with nothing resolved yet.
 */
export const emptyDisplayModule = (moduleName: string): DisplayModule => ({
    source: "",
    moduleName: moduleName,
    sourceType: SourceTypes.unknown,
    resolvedUrl: null,
    versionConstraint: "",
    resolvedVersion: "",
    sourceLine: null,
    sourceColumn: null,
    writtenSource: "",
});
