import { DisplayModule } from "./DisplayModule";
import { Nullable } from "./Nullable";
import { toSourceTypeLabel } from "./SourceTypes";

/** A file's modules, with the commit they were read from. */
export type CachedModules = {
    readonly sha: string;
    readonly lastCommitDateTimeISO: string;
    readonly modules: DisplayModule[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const readText = (value: unknown): string => (typeof value === "string" ? value : "");

const readModule = (value: unknown): Nullable<DisplayModule> => {
    if (!isRecord(value) || typeof value.moduleName !== "string" || value.moduleName === "") {
        return null;
    }
    return {
        source: readText(value.source),
        moduleName: value.moduleName,
        sourceType: toSourceTypeLabel(value.sourceType),
        resolvedUrl: typeof value.resolvedUrl === "string" ? value.resolvedUrl : null,
        versionConstraint: readText(value.versionConstraint),
        resolvedVersion: readText(value.resolvedVersion),
        sourceLine: typeof value.sourceLine === "number" ? value.sourceLine : null,
        writtenSource:
            typeof value.writtenSource === "string" ? value.writtenSource : readText(value.source),
    };
};

/**
 * Reads a cache entry back into the shape this build expects.
 *
 * Storage is the one boundary this extension does not control both ends of.
 * An entry can have been written by an older build: `SourceTypes` values have
 * changed twice, and a value this build does not know renders as itself, so
 * the popup shows a label no other row uses and nothing explains why.
 *
 * A row missing the one field that identifies it is dropped. Every other
 * field falls back, because a row with a name is still worth showing.
 * @param value Whatever came back from storage.
 * @returns The entry, or null when it is not one.
 */
export const readCachedModules = (value: unknown): Nullable<CachedModules> => {
    if (!isRecord(value) || typeof value.sha !== "string" || !Array.isArray(value.modules)) {
        return null;
    }
    return {
        sha: value.sha,
        lastCommitDateTimeISO: readText(value.lastCommitDateTimeISO),
        modules: value.modules
            .map(readModule)
            .filter((module): module is DisplayModule => module !== null),
    };
};
