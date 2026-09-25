import { FetchRequest, ParseRequest, WORKER_QUERIES } from "./types/WorkerRequest";

/**
 * What the service worker will fetch. Read against `host_permissions` in
 * `public/manifest.json`; the two have to agree or a lookup fails silently.
 */
export const ALLOWED_FETCH_HOSTS = ["registry.terraform.io", "registry.opentofu.org"];

const CACHE_MODES: RequestCache[] = [
    "default",
    "no-store",
    "reload",
    "no-cache",
    "force-cache",
    "only-if-cached",
];

/**
 * @param message a runtime message, of any shape
 * @returns whether it is a well formed request to parse a file
 */
export const isParseRequest = (message: unknown): message is ParseRequest =>
    readQuery(message) === WORKER_QUERIES.PARSE &&
    isString(readField(message, "contents")) &&
    isString(readField(message, "fileName"));

/**
 * @param message a runtime message, of any shape
 * @returns whether it is a well formed request to fetch a url
 */
export const isFetchRequest = (message: unknown): message is FetchRequest =>
    readQuery(message) === WORKER_QUERIES.FETCH &&
    isString(readField(message, "url")) &&
    CACHE_MODES.includes(readField(message, "cache") as RequestCache);

const isString = (value: unknown): value is string => typeof value === "string";

const readQuery = (message: unknown): unknown => readField(message, "contentScriptQuery");

const readField = (message: unknown, field: string): unknown =>
    typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)[field]
        : undefined;

/**
 * @param url the address the service worker was asked to fetch
 * @returns whether its host is one this extension is permitted to reach
 */
export const isAllowedFetchHost = (url: string): boolean => {
    try {
        return ALLOWED_FETCH_HOSTS.includes(new URL(url).hostname);
    } catch {
        return false;
    }
};
