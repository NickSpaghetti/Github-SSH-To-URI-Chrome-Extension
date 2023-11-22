export type RunTimeFetchResponse<T> = {ok: boolean,status: number, statusText:string, headers: Headers, data: T};

export interface IFetchService {
    fetchDataAsync<T>(url: string, cacheMethod: RequestCache): Promise<RunTimeFetchResponse<T>>
}