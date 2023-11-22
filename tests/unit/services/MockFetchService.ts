import {IFetchService, RunTimeFetchResponse} from "../../../src/services/IFetchService";

export class MockFetchService implements IFetchService {
    async fetchDataAsync<T>(url: string): Promise<RunTimeFetchResponse<T>> {
        const response = await fetch(url);
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: await response.json() as T
        }
    }

}