import { Nullable } from "../types/Nullable";

/** What this extension stores. Every key it writes is one of these. */
export const CACHE_KEYS = {
    MODULES: "MODULES",
    CURRENT_TAB_URL: "CurrentTabUrl",
} as const;

export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

/** Reads and writes `chrome.storage.local`, which every script shares. */
export class ChromeStorageCache {
    /**
     * @param key the entry to write
     * @param value anything JSON can hold; a URL flattens to its href
     */
    async setAsync<T>(key: CacheKey, value: T): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
    }

    /**
     * @param key the entry to read
     * @returns the stored value, or null when the key was never written
     */
    async getAsync<T>(key: CacheKey): Promise<Nullable<T>> {
        const result = await chrome.storage.local.get([key]);
        const val = result[key];
        if (val === undefined) {
            return null;
        }
        return val as Nullable<T>;
    }

    /** Drops every key/value in this extensions chrome storage */
    async clearAsync(): Promise<void> {
        await chrome.storage.local.clear();
    }
}
