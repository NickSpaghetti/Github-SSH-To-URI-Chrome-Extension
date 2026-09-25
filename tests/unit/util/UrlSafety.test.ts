import { expect } from "@jest/globals";
import { isSafeHttpUrl } from "../../../src/util/UrlSafety";

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
