import { expect } from "@jest/globals";
import { isAllowedFetchHost, isSafeHttpUrl } from "../../../src/util/urlSafety";

describe("Given a URL", () => {
    describe("When the URL uses http or https", () => {
        test("Then I expect isSafeHttpUrl to be true", () => {
            expect<boolean>(isSafeHttpUrl("https://x.com")).toBe(true);
            expect<boolean>(isSafeHttpUrl("http://x.com")).toBe(true);
        });
    });

    describe("When the URL uses a javascript: scheme", () => {
        test("Then I expect isSafeHttpUrl to be false", () => {
            expect<boolean>(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
            expect<boolean>(isSafeHttpUrl("JaVaScRiPt:alert(1)")).toBe(false);
            expect<boolean>(isSafeHttpUrl(" javascript:alert(1)")).toBe(false);
        });
    });

    describe("When the URL uses a data: scheme", () => {
        test("Then I expect isSafeHttpUrl to be false", () => {
            expect<boolean>(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
        });
    });

    describe("When the URL is not a valid URL", () => {
        test("Then I expect isSafeHttpUrl to be false", () => {
            expect<boolean>(isSafeHttpUrl("not a url")).toBe(false);
            expect<boolean>(isSafeHttpUrl("")).toBe(false);
        });
    });
});

describe("Given a fetch URL and an allowlist", () => {
    describe("When the URL's host is in the allowlist", () => {
        test("Then I expect isAllowedFetchHost to be true", () => {
            expect<boolean>(
                isAllowedFetchHost("https://registry.terraform.io/v1/x", ["registry.terraform.io"]),
            ).toBe(true);
        });
    });

    describe("When the URL's host merely contains the allowed host as a substring", () => {
        test("Then I expect isAllowedFetchHost to be false", () => {
            expect<boolean>(
                isAllowedFetchHost("https://registry.terraform.io.evil.com/x", [
                    "registry.terraform.io",
                ]),
            ).toBe(false);
            expect<boolean>(
                isAllowedFetchHost("https://evil.com/registry.terraform.io", [
                    "registry.terraform.io",
                ]),
            ).toBe(false);
        });
    });

    describe("When the URL is not a valid URL", () => {
        test("Then I expect isAllowedFetchHost to be false", () => {
            expect<boolean>(isAllowedFetchHost("not a url", ["registry.terraform.io"])).toBe(false);
        });
    });
});
