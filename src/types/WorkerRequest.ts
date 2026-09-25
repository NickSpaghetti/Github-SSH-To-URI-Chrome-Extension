/** The two jobs the service worker does on behalf of a content script. */
export const WORKER_QUERIES = {
    PARSE: "parseHcl",
    FETCH: "fetchData",
} as const;

/** Parse HCL, which only the worker can do: wasm cannot compile in the page. */
export type ParseRequest = {
    readonly contentScriptQuery: typeof WORKER_QUERIES.PARSE;
    readonly contents: string;
    readonly fileName: string;
};

/** Fetch a registry url, which only the worker is permitted to reach. */
export type FetchRequest = {
    readonly contentScriptQuery: typeof WORKER_QUERIES.FETCH;
    readonly url: string;
    readonly cache: RequestCache;
};

/**
 * What a content script may send the service worker. Both senders are typed
 * against it and the guards in `WorkerRequestGuards` narrow back to it, so
 * the contract is checked at both ends rather than only on arrival.
 */
export type WorkerRequest = ParseRequest | FetchRequest;
