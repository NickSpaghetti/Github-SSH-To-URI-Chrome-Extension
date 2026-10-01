import { expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { OPT_IN_ORIGINS, isSupportedPageHost, optInOriginOf } from "../../../src/util/PageHosts";

describe("Given a hostname", () => {
    describe("When it is a supported page host", () => {
        test("Then I expect true", () => {
            // Arrange
            const hostnames = ["github.com", "gitlab.com"];

            // Act
            const supported = hostnames.map(isSupportedPageHost);

            // Assert
            expect<boolean[]>(supported).toEqual([true, true]);
        });
    });

    describe("When it only looks like one", () => {
        test("Then I expect false", () => {
            // Arrange
            const hostnames = [
                "github.com.evil.com",
                "notgithub.com",
                "gitlab.com.evil.com",
                "gitlab.example.com",
                "",
            ];

            // Act
            const supported = hostnames.map(isSupportedPageHost);

            // Assert
            expect<boolean[]>(supported).toEqual(hostnames.map(() => false));
        });
    });
});

describe("Given a page host's access", () => {
    describe("When the host is granted at install", () => {
        test("Then I expect no origin to ask for", () => {
            // Arrange
            const hostname = "github.com";

            // Act
            const origin = optInOriginOf(hostname);

            // Assert
            expect(origin).toBeNull();
        });
    });

    describe("When the host is granted at runtime", () => {
        test("Then I expect the origin to ask for", () => {
            // Arrange
            const hostname = "gitlab.com";

            // Act
            const origin = optInOriginOf(hostname);

            // Assert
            expect(origin).toBe("https://gitlab.com/*");
        });
    });

    describe("When the opt-in origins are compared with the manifest", () => {
        test("Then I expect each to be an optional host permission, and nothing else to be", () => {
            // Arrange
            const manifestFile = path.resolve(__dirname, "../../../public/manifest.json");
            const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
                optional_host_permissions: string[];
            };

            // Act
            const origins = Object.values(OPT_IN_ORIGINS).filter((origin) => origin !== null);

            // Assert
            expect<string[]>([...origins].sort()).toEqual(
                [...manifest.optional_host_permissions].sort(),
            );
        });
    });
});
