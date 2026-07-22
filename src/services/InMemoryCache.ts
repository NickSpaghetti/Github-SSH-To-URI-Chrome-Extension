import { Nullable } from "../types/Nullable";

export class InMemoryCache {
    private readonly _cache: Map<string, any>;
    constructor() {
        this._cache = new Map<string, any>();
    }

    set<T>(key: string, value: T) {
        if (this._cache.has(key)) {
            this._cache.delete(key);
            this._cache.set(key, value);
        }
        this._cache.set(key, value);
    }
    get<T>(key: string): Nullable<T> {
        if (this._cache.has(key)) {
            return this._cache.get(key) as T;
        }
        return null;
    }

    clear() {
        this._cache.clear();
    }
}
