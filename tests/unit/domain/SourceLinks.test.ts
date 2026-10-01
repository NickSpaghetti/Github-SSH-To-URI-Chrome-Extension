import { expect } from "@jest/globals";
import { toSourceLinks } from "../../../src/domain/SourceLinks";
import { DisplayModule } from "../../../src/types/DisplayModule";
import { Nullable } from "../../../src/types/Nullable";
import { SourceTypes } from "../../../src/types/SourceTypes";

const SOURCE = "hashicorp/consul/aws";

/**
 * Builds a display module.
 * @param resolvedUrl The url it resolved to, or null.
 * @param sourceLine The line its source is written on, or null.
 * @param sourceColumn Where on that line its written source starts, or null.
 * @returns The module.
 */
const displayModule = (
    resolvedUrl: Nullable<string>,
    sourceLine: Nullable<number> = null,
    sourceColumn: Nullable<number> = null,
): DisplayModule => ({
    source: SOURCE,
    moduleName: "consul",
    sourceType: SourceTypes.registry,
    resolvedUrl: resolvedUrl,
    versionConstraint: "",
    resolvedVersion: "",
    sourceLine: sourceLine,
    sourceColumn: sourceColumn,
    writtenSource: SOURCE,
});

describe("Given a module whose source is a template", () => {
    describe("When it is placed", () => {
        test("Then I expect it placed with the source as the page shows it", () => {
            // Arrange
            const module: DisplayModule = {
                ...displayModule("https://example.com/a", 7, 12),
                source: "terraform-aws-modules/vpc/aws",
                writtenSource: "${local.registry}/vpc/aws",
            };

            // Act
            const links = toSourceLinks([module]);

            // Assert
            expect(links.get(7)).toEqual([
                { column: 12, written: "${local.registry}/vpc/aws", url: "https://example.com/a" },
            ]);
        });
    });
});

describe("Given modules the parser placed on a line and column", () => {
    describe("When two modules on one line each have a url", () => {
        test("Then I expect both placed on that line, in module order", () => {
            // Arrange
            const modules = [
                displayModule("https://example.com/a", 3, 23),
                displayModule("https://example.com/b", 3, 55),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.get(3)?.map((placed) => [placed.column, placed.url])).toEqual([
                [23, "https://example.com/a"],
                [55, "https://example.com/b"],
            ]);
        });
    });

    describe("When two modules share a source on different lines", () => {
        test("Then I expect each line to keep its own url", () => {
            // Arrange
            const modules = [
                displayModule("https://example.com/0.1.0", 12, 13),
                displayModule("https://example.com/0.11.0", 19, 13),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.get(12)?.[0].url).toBe("https://example.com/0.1.0");
            expect(links.get(19)?.[0].url).toBe("https://example.com/0.11.0");
        });
    });

    describe("When a module has no url, no line or no column", () => {
        test("Then I expect it left out", () => {
            // Arrange
            const modules = [
                displayModule(null, 3, 12),
                displayModule("https://example.com/a", null, 12),
                displayModule("https://example.com/b", 3, null),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.size).toBe(0);
        });
    });
});
