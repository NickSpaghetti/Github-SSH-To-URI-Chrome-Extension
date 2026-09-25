import { RunTimeFetchResponse } from "../types/RunTimeFetchResponse";

export interface IFetchService {
    fetchDataAsync<T>(url: string, cacheMethod: RequestCache): Promise<RunTimeFetchResponse<T>>;
}
