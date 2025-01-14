import { Nullable } from "../types/Nullable";

export class ChromeStorageCache {

    async SetAsync<T>(key: string, value: T): Promise<void> {
        await chrome.storage.local.set({ [key]:  value });
    }

    async GetAsync<T>(key: string): Promise<Nullable<T>> {
        const result = await chrome.storage.local.get([key]);
        const val = result[key];
        if(val == undefined){
            return null;
        }
        return val as Nullable<T>;
    }

    async ClearAsync(): Promise<void> {
        await chrome.storage.local.clear();
    }
}
