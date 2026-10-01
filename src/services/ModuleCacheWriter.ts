import { CachedModules } from "../types/CachedModules";
import { MODULE_CACHE_PREFIX } from "./ModuleCacheKey";
import { isQuotaRefusal } from "./StorageRefusal";
import { logRecovered } from "../util/Log";

/** The part of the cache this writer needs, so a test can stand in for it. */
export type ModuleCacheStore = {
    setAsync(key: string, value: CachedModules): Promise<void>;
    clearPrefixAsync(prefix: string): Promise<number>;
};

/**
 * Writes an entry, resetting the cache once if the write is refused.
 *
 * A refusal that is not recovered from means nothing is cached again for the
 * rest of the browser session, and every page reparses and re-resolves.
 * Dropping the generation is cheaper than tracking per entry lifetimes, and
 * the lifetime is bounded twice over, by the quota and by the session.
 *
 * Any refusal resets, not only one recognised as the quota. Chrome offers no
 * error code, so `isQuotaRefusal` reads a message, and a reset conditional on
 * that would go back to caching nothing the day the wording changes. An
 * unnecessary reset costs one generation, rebuilt lazily.
 *
 * Retried once and not in a loop. A second refusal straight after a reset is
 * something other than room, and a loop would turn it into a hang.
 * @param store Where the entry is written.
 * @param key The entry to write.
 * @param entry The modules found on that page.
 * @throws When the reset itself fails, which the caller's boundary catches.
 */
export const cacheModulesAsync = async (
    store: ModuleCacheStore,
    key: string,
    entry: CachedModules,
): Promise<void> => {
    try {
        await store.setAsync(key, entry);
        return;
    } catch (error) {
        const dropped = await store.clearPrefixAsync(MODULE_CACHE_PREFIX);
        if (isQuotaRefusal(error)) {
            logRecovered(`session storage was full, dropped ${dropped} cached files`);
        } else {
            logRecovered(`caching was refused, dropped ${dropped} cached files`, error);
        }
    }

    await store
        .setAsync(key, entry)
        .catch((error) => logRecovered("could not cache modules after a reset", error));
};
