import {Nullable} from "../types/Nullable";

export class InMemoryCache {
    //private static readonly _cache: Map<string,any> = new Map<string, any>()
    private static readonly _cache: Map<string,any> = new Map<string, any>();

    Set<T>(key: string, value: T){
        if(InMemoryCache._cache.has(key)){
            InMemoryCache._cache.delete(key)
            InMemoryCache._cache.set(key,value)
        }
        InMemoryCache._cache.set(key,value)
    }
    Get<T>(key: string) : Nullable<T> {
        if(InMemoryCache._cache.has(key)){
            return InMemoryCache._cache.get(key) as T
        }
        return null;
    }
}