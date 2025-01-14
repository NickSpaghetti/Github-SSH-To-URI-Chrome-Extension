import {Nullable} from "../types/Nullable";

export class InMemoryCache {
    private readonly _cache: Map<string,any>;
    constructor() {
        this._cache = new Map<string,any>();
    }

    Set<T>(key: string, value: T){
        if(this._cache.has(key)){
            this._cache.delete(key);
            this._cache.set(key,value);
        }
        this._cache.set(key,value)
    }
    Get<T>(key: string) : Nullable<T> {
        if(this._cache.has(key)){
            return this._cache.get(key) as T;
        }
        return null;
    }

    Clear() {
        this._cache.clear()
    }
}