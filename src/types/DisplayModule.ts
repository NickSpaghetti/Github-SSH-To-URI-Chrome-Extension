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
});
