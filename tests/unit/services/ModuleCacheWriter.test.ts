import { expect, jest } from "@jest/globals";
import { cacheModulesAsync, ModuleCacheStore } from "../../../src/services/ModuleCacheWriter";
import { MODULE_CACHE_PREFIX } from "../../../src/services/ModuleCacheKey";
import { CachedModules } from "../../../src/types/CachedModules";
import { SourceTypes } from "../../../src/types/SourceTypes";

const KEY = `${MODULE_CACHE_PREFIX}github.com:/owner/repo/blob/main/main.tf`;

/** An entry shaped the way the content script writes one. */
const ENTRY: CachedModules = {
    sha: "49e180c0",
    lastCommitDateTimeISO: "2026-01-01T00:00:00.000Z",
    modules: [
        {
            source: "terraform-aws-modules/vpc/aws",
            moduleName: "vpc",
            sourceType: SourceTypes.registry,
            resolvedUrl: "https://registry.terraform.io/x",
            versionConstraint: "~> 6.0",
            resolvedVersion: "6.7.3",
            sourceLine: 12,
            writtenSource: "terraform-aws-modules/vpc/aws",
        },
    ],
};

/**
 * Builds a store that refuses a given number of writes before accepting.
 * @param refusals What each write rejects with, in order. A missing entry accepts.
 *     Errors only; `StorageRefusal.test.ts` covers rejections that are not one.
 * @returns The store and a record of what it was asked to do.
 */
const storeRefusing = (refusals: Error[]) => {
    const writes: string[] = [];
    const resets: string[] = [];
    const store: ModuleCacheStore = {
        setAsync: (key) => {
            writes.push(key);
            const refusal = refusals[writes.length - 1];
            return refusal === undefined ? Promise.resolve() : Promise.reject(refusal);
        },
        clearPrefixAsync: (prefix) => {
            resets.push(prefix);
            return Promise.resolve(7);
        },
    };
    return { store, writes, resets };
};

beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Given a cache write", () => {
    describe("When storage accepts it", () => {
        test("Then I expect one write and nothing dropped", async () => {
            // Arrange
            const { store, writes, resets } = storeRefusing([]);

            // Act
            await cacheModulesAsync(store, KEY, ENTRY);

            // Assert
            expect<string[]>(writes).toEqual([KEY]);
            expect<string[]>(resets).toEqual([]);
        });
    });

    describe("When storage refuses it because it is full", () => {
        test("Then I expect the cache reset and the write retried", async () => {
            // Arrange
            const full = new Error("Session storage quota bytes exceeded.");
            const { store, writes, resets } = storeRefusing([full]);

            // Act
            await cacheModulesAsync(store, KEY, ENTRY);

            // Assert
            expect<string[]>(resets).toEqual([MODULE_CACHE_PREFIX]);
            expect<string[]>(writes).toEqual([KEY, KEY]);
        });
    });

    describe("When storage refuses it for a reason other than room", () => {
        test("Then I expect the cache reset anyway, because the wording is all there is", async () => {
            // Arrange
            const other = new Error("Extension context invalidated.");
            const { store, writes, resets } = storeRefusing([other]);

            // Act
            await cacheModulesAsync(store, KEY, ENTRY);

            // Assert
            expect<string[]>(resets).toEqual([MODULE_CACHE_PREFIX]);
            expect<string[]>(writes).toEqual([KEY, KEY]);
        });
    });

    describe("When the retry is refused as well", () => {
        test("Then I expect it reported and not retried again", async () => {
            // Arrange
            const full = new Error("Session storage quota bytes exceeded.");
            const { store, writes, resets } = storeRefusing([full, full]);

            // Act
            const writing = cacheModulesAsync(store, KEY, ENTRY);

            // Assert
            await expect(writing).resolves.toBeUndefined();
            expect<string[]>(resets).toEqual([MODULE_CACHE_PREFIX]);
            expect<string[]>(writes).toEqual([KEY, KEY]);
        });
    });

    describe("When the reset itself fails", () => {
        test("Then I expect it to reject, so the caller's boundary reports it", async () => {
            // Arrange
            const store: ModuleCacheStore = {
                setAsync: () => Promise.reject(new Error("Session storage quota bytes exceeded.")),
                clearPrefixAsync: () => Promise.reject(new Error("storage went away")),
            };

            // Act
            const writing = cacheModulesAsync(store, KEY, ENTRY);

            // Assert
            await expect(writing).rejects.toThrow("storage went away");
        });
    });
});
