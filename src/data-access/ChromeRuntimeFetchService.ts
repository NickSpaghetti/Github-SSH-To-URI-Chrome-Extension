import { IFetchService } from "./IFetchService";
import { RunTimeFetchResponse } from "../types/RunTimeFetchResponse";
import { FetchRequest, WORKER_QUERIES } from "../types/WorkerRequest";

/**
 * The background script can go away mid request, and `sendMessage` then fires
 * its callback with nothing. A missing answer is a failed one: every caller
 * reads `ok` first, so this keeps them from reading it off undefined. `data`
 * is never looked at on a failed response.
 */
const noResponse = <T>(): RunTimeFetchResponse<T> => ({
    ok: false,
    status: 0,
    statusText: "the background script did not respond",
    headers: new Headers(),
    data: undefined as T,
});

/** Fetches through the background script, the only context allowed to. */
export class ChromeRuntimeFetchService implements IFetchService {
    /**
     * @param url the address to fetch, checked against the manifest's hosts
     * @param cacheMethod how the browser cache should be used
     * @returns the response, or a failed one when the background script is gone
     */
    async fetchDataAsync<T>(
        url: string,
        cacheMethod: RequestCache = "default",
    ): Promise<RunTimeFetchResponse<T>> {
        const request: FetchRequest = {
            contentScriptQuery: WORKER_QUERIES.FETCH,
            url: url,
            cache: cacheMethod,
        };
        return await new Promise((resolve) => {
            chrome.runtime.sendMessage(request, (rcb: RunTimeFetchResponse<T> | undefined) => {
                resolve(rcb ?? noResponse<T>());
            });
        });
    }
}
