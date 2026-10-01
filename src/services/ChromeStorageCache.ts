import { Nullable } from "../types/Nullable";

/**
 * Reads and writes `chrome.storage.session`, which every script in the
 * extension shares and which the browser empties when it closes. Content
 * scripts can only reach it once the worker has raised its access level.
 */
export class ChromeStorageCache {
    /**
     * @param key The entry to write.
     * @param value Anything JSON can hold; a URL flattens to its href.
     * @throws When the write is refused, which a full quota does.
     */
    async setAsync<T>(key: string, value: T): Promise<void> {
        await chrome.storage.session.set({ [key]: value });
    }

    /**
     * Returns `unknown` on purpose. Anything can be in storage, and a type
     * parameter here would be an assertion the caller cannot back. Pass what
     * this returns through a reader that checks it.
     * @param key The entry to read.
     * @returns The stored value, or null when the key was never written.
     */
    async getAsync(key: string): Promise<Nullable<unknown>> {
        const result = await chrome.storage.session.get([key]);
        const val = result[key];
        if (val === undefined) {
            return null;
        }
        return val;
    }

    /** Drops every entry this extension has in session storage. */
    async clearAsync(): Promise<void> {
        await chrome.storage.session.clear();
    }

    /**
     * Drops the entries whose key starts with a prefix.
     *
     * Session storage is one namespace shared by everything in the extension,
     * so a caller that owns part of it can only reset its own part this way.
     * @param prefix The prefix marking the entries to drop.
     * @returns How many entries were dropped.
     */
    async clearPrefixAsync(prefix: string): Promise<number> {
        // `get(null)` returns every value as well as every key, so this reads
        // the whole cache to build a list of strings, and it runs when that
        // cache is at its largest. `getKeys` would avoid it and arrived in
        // Chrome 130, above the 112 in `public/manifest.json`. Revisit if that
        // floor rises. The cost is paid once per reset, not once per write.
        const all = await chrome.storage.session.get(null);
        const mine = Object.keys(all).filter((key) => key.startsWith(prefix));
        if (mine.length > 0) {
            await chrome.storage.session.remove(mine);
        }
        return mine.length;
    }
}
