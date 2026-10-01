import { DisplayModule } from "../types/DisplayModule";
import { PlacedSourceLink, SourceLinks } from "../types/SourceLinks";

/**
 * Places each module source that has a url on its line.
 * @param modules The modules declared on the page.
 * @returns Each source whose url, line and column are known, by line, in module order.
 */
export const toSourceLinks = (modules: readonly DisplayModule[]): SourceLinks => {
    const placed = new Map<number, PlacedSourceLink[]>();
    for (const module of modules) {
        if (
            module.resolvedUrl === null ||
            module.sourceLine === null ||
            module.sourceColumn === null
        ) {
            continue;
        }
        const onLine = placed.get(module.sourceLine) ?? [];
        onLine.push({
            column: module.sourceColumn,
            written: module.writtenSource,
            url: module.resolvedUrl,
        });
        placed.set(module.sourceLine, onLine);
    }
    return placed;
};
