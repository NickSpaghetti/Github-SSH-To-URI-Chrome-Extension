import { DisplayModule } from "../types/DisplayModule";
import { SourceLinks } from "../types/SourceLinks";

/**
 * Maps each module source, as the page shows it, to the url it links to.
 * @param modules The modules declared on the page.
 * @returns The url of each source that has one, by line where the line is known
 * and by source alone for every module.
 */
export const toSourceLinks = (modules: readonly DisplayModule[]): SourceLinks => {
    const atLine = new Map<number, Map<string, string>>();
    const bySource = new Map<string, string>();
    for (const module of modules) {
        if (module.resolvedUrl === null) {
            continue;
        }
        if (!bySource.has(module.writtenSource)) {
            bySource.set(module.writtenSource, module.resolvedUrl);
        }
        if (module.sourceLine === null) {
            continue;
        }
        const line = atLine.get(module.sourceLine) ?? new Map<string, string>();
        if (!line.has(module.writtenSource)) {
            line.set(module.writtenSource, module.resolvedUrl);
        }
        atLine.set(module.sourceLine, line);
    }
    return { atLine, bySource };
};
