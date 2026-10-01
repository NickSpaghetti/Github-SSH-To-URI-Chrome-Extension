import { RunTimeFetchResponse } from "../types/RunTimeFetchResponse";

export interface IFetchService {
    fetchDataAsync(url: string, cacheMethod: RequestCache): Promise<RunTimeFetchResponse<unknown>>;
}
