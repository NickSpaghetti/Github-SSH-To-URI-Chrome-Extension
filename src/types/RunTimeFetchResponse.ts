export type RunTimeFetchResponse<T> = {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
    data: T;
};
