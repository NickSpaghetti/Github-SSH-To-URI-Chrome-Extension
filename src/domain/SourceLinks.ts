import { DisplayModule } from "../types/DisplayModule";

/**
 * Maps each module source to the url it links to.
 * @param modules The modules declared on the page.
 * @returns Each source that has a url, mapped to it. When two modules share a
 * source, the first one with a url is used.
 */
export const toSourceLinks = (modules: readonly DisplayModule[]): Map<string, string> => {
    const links = new Map<string, string>();
    for (const module of modules) {
        if (module.resolvedUrl !== null && !links.has(module.source)) {
            links.set(module.source, module.resolvedUrl);
        }
    }
    return links;
};
