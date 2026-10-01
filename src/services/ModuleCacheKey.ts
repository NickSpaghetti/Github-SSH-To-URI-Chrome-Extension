/**
 * Marks the keys this cache owns.
 *
 * Session storage is one namespace and `clearAsync` empties all of it, so
 * resetting only these entries needs them to be identifiable.
 */
export const MODULE_CACHE_PREFIX = "modules:";

/**
 * Builds the storage key a page's modules are cached under.
 *
 * Host comes before path because it is from a known set. Path comes last
 * because it is the one part with no fixed shape and may itself contain a
 * colon.
 * @param pageUrl The page the modules were read from.
 * @returns The storage key holding that file's modules.
 */
export const moduleCacheKey = (pageUrl: string): string => {
    const url = new URL(pageUrl);
    return `${MODULE_CACHE_PREFIX}${url.hostname}:${url.pathname}`;
};
