import { expect } from "@jest/globals";
import {
    ALLOWED_FETCH_HOSTS,
    isAllowedFetchHost,
    isFetchRequest,
    isParseRequest,
} from "../../src/WorkerRequestGuards";
import * as fs from "fs";
import * as path from "path";
import { WORKER_QUERIES } from "../../src/types/WorkerRequest";

const parse = { contentScriptQuery: WORKER_QUERIES.PARSE, contents: "x", fileName: "main.tf" };
const fetch = {
    contentScriptQuery: WORKER_QUERIES.FETCH,
    url: "https://x/y",
    cache: "force-cache",
};

describe("Given a message sent to the service worker", () => {
    describe("When it is a well formed request", () => {
        test("Then I expect its own guard to accept it", () => {
            expect<boolean>(isParseRequest(parse)).toBe(true);
            expect<boolean>(isFetchRequest(fetch)).toBe(true);
        });

        test("Then I expect the other guard to reject it", () => {
            expect<boolean>(isFetchRequest(parse)).toBe(false);
            expect<boolean>(isParseRequest(fetch)).toBe(false);
        });
    });

    describe("When a field is missing or the wrong type", () => {
        test("Then I expect it rejected rather than read off anyway", () => {
            expect<boolean>(isParseRequest({ ...parse, contents: undefined })).toBe(false);
            expect<boolean>(isParseRequest({ ...parse, fileName: 42 })).toBe(false);
            expect<boolean>(isFetchRequest({ ...fetch, url: null })).toBe(false);
        });
    });

    describe("When the cache mode is not one fetch accepts", () => {
        test("Then I expect it rejected, because it reaches fetch unchecked otherwise", () => {
            expect<boolean>(isFetchRequest({ ...fetch, cache: "sometimes" })).toBe(false);
            expect<boolean>(isFetchRequest({ ...fetch, cache: undefined })).toBe(false);
        });
    });

    describe("When the message names no query", () => {
        test("Then I expect both guards to reject it", () => {
            for (const message of [null, undefined, {}, "parseHcl", { contentScriptQuery: 1 }]) {
                expect<boolean>(isParseRequest(message)).toBe(false);
                expect<boolean>(isFetchRequest(message)).toBe(false);
            }
        });
    });
});

describe("Given a url the service worker was asked to fetch", () => {
    describe("When the host is one the manifest permits", () => {
        test("Then I expect it allowed", () => {
            expect<boolean>(isAllowedFetchHost("https://registry.terraform.io/v1/x")).toBe(true);
            expect<boolean>(isAllowedFetchHost("https://registry.opentofu.org/v1/x")).toBe(true);
        });
    });

    describe("When the host merely contains a permitted host", () => {
        test("Then I expect it refused", () => {
            expect<boolean>(isAllowedFetchHost("https://registry.terraform.io.evil.com/x")).toBe(
                false,
            );
            expect<boolean>(isAllowedFetchHost("https://evil.com/registry.terraform.io")).toBe(
                false,
            );
        });
    });

    describe("When the url is not a url", () => {
        test("Then I expect it refused rather than throwing", () => {
            expect<boolean>(isAllowedFetchHost("not a url")).toBe(false);
            expect<boolean>(isAllowedFetchHost("")).toBe(false);
        });
    });

    describe("When the policy is compared with the manifest", () => {
        test("Then I expect every allowed host to be one chrome permits", () => {
            const manifestFile = path.resolve(__dirname, "../../public/manifest.json");
            const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
                host_permissions: string[];
            };
            const permitted = manifest.host_permissions.map(
                (pattern) => new URL(pattern.replace("/*", "")).hostname,
            );
            for (const host of ALLOWED_FETCH_HOSTS) {
                expect<string>(`${host}: ${String(permitted.includes(host))}`).toBe(
                    `${host}: true`,
                );
            }
        });
    });
});
