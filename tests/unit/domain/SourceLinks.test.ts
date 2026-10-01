import { expect } from "@jest/globals";
import { toSourceLinks } from "../../../src/domain/SourceLinks";
import { DisplayModule } from "../../../src/types/DisplayModule";
import { Nullable } from "../../../src/types/Nullable";
import { SourceTypes } from "../../../src/types/SourceTypes";

const SOURCE = "hashicorp/consul/aws";

/**
 * Builds a display module.
 * @param source The module's source.
 * @param resolvedUrl The url it resolved to, or null.
 * @returns The module.
 */
const displayModule = (source: string, resolvedUrl: Nullable<string>): DisplayModule => ({
    source: source,
    moduleName: "consul",
    sourceType: SourceTypes.registry,
    resolvedUrl: resolvedUrl,
    versionConstraint: "",
    resolvedVersion: "",
});

describe("Given modules declared on a page", () => {
    describe("When a module has a url", () => {
        test("Then I expect its source mapped to the url", () => {
            // Arrange
            const modules = [displayModule(SOURCE, "https://example.com/a")];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect<Map<string, string>>(links).toEqual(
                new Map([[SOURCE, "https://example.com/a"]]),
            );
        });
    });

    describe("When a module has no url", () => {
        test("Then I expect its source left out", () => {
            // Arrange
            const modules = [displayModule(SOURCE, null)];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect<number>(links.size).toBe(0);
        });
    });

    describe("When two modules share a source", () => {
        test("Then I expect the first url used", () => {
            // Arrange
            const modules = [
                displayModule(SOURCE, null),
                displayModule(SOURCE, "https://example.com/first"),
                displayModule(SOURCE, "https://example.com/second"),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect<string | undefined>(links.get(SOURCE)).toBe("https://example.com/first");
        });
    });
});
