import {IFetchService, RunTimeFetchResponse} from "./IFetchService";

export class ChromeRuntimeFetchService implements IFetchService{
    async fetchDataAsync<T>(url: string, cacheMethod: RequestCache = "default"): Promise<RunTimeFetchResponse<T>> {
        const response: RunTimeFetchResponse<T> = await new Promise(resolve => {
            chrome.runtime.sendMessage({ contentScriptQuery: "fetchData", url: url, cache: cacheMethod }, rcb => {
                resolve(rcb);
            })
        });
        return response;
    }
}