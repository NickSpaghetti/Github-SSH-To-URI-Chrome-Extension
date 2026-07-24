export const isSafeHttpUrl = (url: string): boolean => {
    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
};

export const isAllowedFetchHost = (url: string, allowedHosts: string[]): boolean => {
    try {
        return allowedHosts.includes(new URL(url).hostname);
    } catch {
        return false;
    }
};
