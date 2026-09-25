import { ModuleSource } from "../../types/ModuleSource";
import { resolverFor } from "./ModuleSourceResolvers";

/**
 * Sets the popup label from the same resolver table the linker builds from,
 * so a source cannot be labelled one thing and linked as another.
 * @param source a module source that has been through detect
 * @returns the same source with `sourceType` set
 */
export const classify = (source: ModuleSource): ModuleSource => {
    source.sourceType = resolverFor(source).label(source);
    return source;
};
