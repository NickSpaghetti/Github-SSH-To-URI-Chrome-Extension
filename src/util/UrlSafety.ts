/**
 * Determines whether an address is safe to write into an href.
 *
 * Both link sinks make this check, which is why a builder that returns a
 * non-url cannot produce a clickable link.
 * @param url The address a link would carry.
 * @returns true if it parses and its scheme is http or https; otherwise, false.
 */
export const isSafeHttpUrl = (url: string): boolean => {
    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
};
