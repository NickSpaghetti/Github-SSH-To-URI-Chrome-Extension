/**
 * The check both link sinks make before writing an href, and the reason a
 * builder that returns a non-url cannot produce a clickable link.
 * @param url the address a link would carry
 * @returns whether it parses and its scheme is http or https
 */
export const isSafeHttpUrl = (url: string): boolean => {
    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
};
