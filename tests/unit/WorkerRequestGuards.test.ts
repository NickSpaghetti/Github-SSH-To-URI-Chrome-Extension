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

/** A parse request exactly as the content script sends one. */
const parse = { contentScriptQuery: WORKER_QUERIES.PARSE, contents: "x", fileName: "main.tf" };

/** A fetch request exactly as the content script sends one. */
const fetch = {
    contentScriptQuery: WORKER_QUERIES.FETCH,
    url: "https://x/y",
    cache: "force-cache",
};

describe("Given a message sent to the service worker", () => {
    describe("When it is a well formed request", () => {
        test("Then I expect its own guard to accept it", () => {
            // Act
            const accepted = [isParseRequest(parse), isFetchRequest(fetch)];

            // Assert
            expect<boolean[]>(accepted).toEqual([true, true]);
        });

        test("Then I expect the other guard to reject it", () => {
            // Act
            const accepted = [isFetchRequest(parse), isParseRequest(fetch)];

            // Assert
            expect<boolean[]>(accepted).toEqual([false, false]);
        });
    });

    describe("When a field is missing or the wrong type", () => {
        test("Then I expect it rejected rather than read off anyway", () => {
            // Arrange
            const messages = [
                { guard: isParseRequest, message: { ...parse, contents: undefined } },
                { guard: isParseRequest, message: { ...parse, fileName: 42 } },
                { guard: isFetchRequest, message: { ...fetch, url: null } },
            ];

            // Act
            const accepted = messages.map(({ guard, message }) => guard(message));

            // Assert
            expect<boolean[]>(accepted).toEqual(messages.map(() => false));
        });
    });

    describe("When the cache mode is not one fetch accepts", () => {
        test("Then I expect it rejected, because it reaches fetch unchecked otherwise", () => {
            // Arrange
            const modes = ["sometimes", undefined];

            // Act
            const accepted = modes.map((cache) => isFetchRequest({ ...fetch, cache }));

            // Assert
            expect<boolean[]>(accepted).toEqual(modes.map(() => false));
        });
    });

    describe("When the message names no query", () => {
        test("Then I expect both guards to reject it", () => {
            // Arrange
            const messages = [null, undefined, {}, "parseHcl", { contentScriptQuery: 1 }];

            // Act
            const accepted = messages.flatMap((message) => [
                isParseRequest(message),
                isFetchRequest(message),
            ]);

            // Assert
            expect<boolean[]>(accepted).toEqual(messages.flatMap(() => [false, false]));
        });
    });
});

describe("Given a url the service worker was asked to fetch", () => {
    describe("When the host is one the manifest permits", () => {
        test("Then I expect it allowed", () => {
            // Arrange
            const urls = [
                "https://registry.terraform.io/v1/x",
                "https://registry.opentofu.org/v1/x",
            ];

            // Act
            const allowed = urls.map(isAllowedFetchHost);

            // Assert
            expect<boolean[]>(allowed).toEqual(urls.map(() => true));
        });
    });

    describe("When the host merely contains a permitted host", () => {
        test("Then I expect it refused", () => {
            // Arrange
            const urls = [
                "https://registry.terraform.io.evil.com/x",
                "https://evil.com/registry.terraform.io",
            ];

            // Act
            const allowed = urls.map(isAllowedFetchHost);

            // Assert
            expect<boolean[]>(allowed).toEqual(urls.map(() => false));
        });
    });

    describe("When the url is not a url", () => {
        test("Then I expect it refused rather than throwing", () => {
            // Arrange
            const urls = ["not a url", ""];

            // Act
            const allowed = urls.map(isAllowedFetchHost);

            // Assert
            expect<boolean[]>(allowed).toEqual(urls.map(() => false));
        });
    });

    describe("When the policy is compared with the manifest", () => {
        test("Then I expect every allowed host to be one chrome permits", () => {
            // Arrange
            const manifestFile = path.resolve(__dirname, "../../public/manifest.json");
            const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
                host_permissions: string[];
            };
            const permitted = manifest.host_permissions.map(
                (pattern) => new URL(pattern.replace("/*", "")).hostname,
            );

            // Act
            const covered = ALLOWED_FETCH_HOSTS.map(
                (host) => `${host}: ${String(permitted.includes(host))}`,
            );

            // Assert
            expect<string[]>(covered).toEqual(ALLOWED_FETCH_HOSTS.map((host) => `${host}: true`));
        });
    });
});
