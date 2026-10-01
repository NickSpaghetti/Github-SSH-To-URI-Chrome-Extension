import { ModuleSource } from "../../types/ModuleSource";
import { resolverFor } from "./ModuleSourceResolvers";

/**
 * Sets the popup label from the same resolver table the linker builds from,
 * so a source cannot be labelled one thing and linked as another.
 * @param source A module source that has been through detect.
 * @returns The same source with `sourceType` set.
 */
export const classify = (source: ModuleSource): ModuleSource => {
    source.sourceType = resolverFor(source).label(source);
    return source;
};
