import { expect } from "@jest/globals";
import { isSafeHttpUrl } from "../../../src/util/UrlSafety";

describe("Given a URL", () => {
    describe("When the URL uses http or https", () => {
        test("Then I expect isSafeHttpUrl to be true", () => {
            // Arrange
            const urls = ["https://x.com", "http://x.com"];

            // Act
            const safe = urls.map(isSafeHttpUrl);

            // Assert
            expect<boolean[]>(safe).toEqual([true, true]);
        });
    });

    describe("When the URL uses a javascript: scheme", () => {
        test("Then I expect isSafeHttpUrl to be false", () => {
            // Arrange
            const urls = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)"];

            // Act
            const safe = urls.map(isSafeHttpUrl);

            // Assert
            expect<boolean[]>(safe).toEqual([false, false, false]);
        });
    });

    describe("When the URL uses a data: scheme", () => {
        test("Then I expect isSafeHttpUrl to be false", () => {
            // Arrange
            const url = "data:text/html,<script>alert(1)</script>";

            // Act
            const safe = isSafeHttpUrl(url);

            // Assert
            expect<boolean>(safe).toBe(false);
        });
    });

    describe("When the URL is not a valid URL", () => {
        test("Then I expect isSafeHttpUrl to be false", () => {
            // Arrange
            const urls = ["not a url", ""];

            // Act
            const safe = urls.map(isSafeHttpUrl);

            // Assert
            expect<boolean[]>(safe).toEqual([false, false]);
        });
    });
});
