import { SourceTypes } from "../types/SourceTypes";

const LOCAL_PATH = "local path";

/**
 * Converts a source type to the name the popup shows.
 *
 * Only a relative path is renamed. "path" reads as a field name where the
 * rest already read as what they are.
 * @param sourceType The kind of source the module declared.
 * @returns The name to show.
 */
export const toSourceLabel = (sourceType: SourceTypes): string =>
    sourceType === SourceTypes.path ? LOCAL_PATH : sourceType;
