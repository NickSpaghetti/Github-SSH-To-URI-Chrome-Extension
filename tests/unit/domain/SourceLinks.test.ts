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
    describe("When its links are mapped", () => {
        test("Then I expect them keyed by the source as the page shows it", () => {
            // Arrange
            const module: DisplayModule = {
                ...displayModule("https://example.com/a", 7),
                source: "terraform-aws-modules/vpc/aws",
                writtenSource: "${local.registry}/vpc/aws",
            };

            // Act
            const links = toSourceLinks([module]);

            // Assert
            expect(links.atLine.get(7)?.get("${local.registry}/vpc/aws")).toBe(
                "https://example.com/a",
            );
            expect(links.bySource.get("${local.registry}/vpc/aws")).toBe("https://example.com/a");
            expect(links.bySource.has("terraform-aws-modules/vpc/aws")).toBe(false);
        });
    });
});

describe("Given modules declared on a page", () => {
    describe("When a module has a url and a line", () => {
        test("Then I expect its url by line and by source", () => {
            // Arrange
            const modules = [displayModule("https://example.com/a", 12)];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.atLine.get(12)?.get(SOURCE)).toBe("https://example.com/a");
            expect(links.bySource.get(SOURCE)).toBe("https://example.com/a");
        });
    });

    describe("When a module has a url and no line", () => {
        test("Then I expect its url by source only", () => {
            // Arrange
            const modules = [displayModule("https://example.com/a")];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.atLine.size).toBe(0);
            expect(links.bySource.get(SOURCE)).toBe("https://example.com/a");
        });
    });

    describe("When a module has no url", () => {
        test("Then I expect it left out", () => {
            // Arrange
            const modules = [displayModule(null, 12)];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.atLine.size).toBe(0);
            expect(links.bySource.size).toBe(0);
        });
    });

    describe("When two modules share a source on different lines", () => {
        test("Then I expect each line to keep its own url", () => {
            // Arrange
            const modules = [
                displayModule("https://example.com/0.1.0", 12),
                displayModule("https://example.com/0.12.0", 19),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.atLine.get(12)?.get(SOURCE)).toBe("https://example.com/0.1.0");
            expect(links.atLine.get(19)?.get(SOURCE)).toBe("https://example.com/0.12.0");
        });

        test("Then I expect the first url by source", () => {
            // Arrange
            const modules = [
                displayModule(null, 5),
                displayModule("https://example.com/0.1.0", 12),
                displayModule("https://example.com/0.12.0", 19),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.bySource.get(SOURCE)).toBe("https://example.com/0.1.0");
        });
    });
});

describe("Given modules the parser placed on a line and column", () => {
    describe("When two modules on one line each have a url", () => {
        test("Then I expect both placed on that line, in order", () => {
            // Arrange
            const modules = [
                displayModule("https://example.com/a", 3, 23),
                displayModule("https://example.com/b", 3, 55),
            ];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.placed.get(3)).toEqual([
                { column: 23, written: SOURCE, url: "https://example.com/a" },
                { column: 55, written: SOURCE, url: "https://example.com/b" },
            ]);
        });
    });

    describe("When a module has no column or no url", () => {
        test("Then I expect it left unplaced", () => {
            // Arrange
            const modules = [displayModule("https://example.com/a", 3), displayModule(null, 4, 12)];

            // Act
            const links = toSourceLinks(modules);

            // Assert
            expect(links.placed.size).toBe(0);
        });
    });
});
