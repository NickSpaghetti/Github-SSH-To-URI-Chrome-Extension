import { expect } from "@jest/globals";
import { readModuleDeclarations } from "../../../src/domain/ModuleDeclarationReader";
import { IHclFile } from "../../../src/types/IHclFile";

/**
 * @param config A parsed config, in any shape.
 * @returns The source and version of each declaration, by name.
 */
const read = (config: unknown): Record<string, { source?: string; version?: string }> =>
    Object.fromEntries(
        [...readModuleDeclarations(config as IHclFile)].map(([name, module]) => [
            name,
            module.provider,
        ]),
    );

describe("Given a module block", () => {
    describe("When its source and version are strings", () => {
        test("Then I expect both read", () => {
            // Arrange
            const config = { module: { vpc: [{ source: "a/b/c", version: "~> 6.0", cidr: "x" }] } };

            // Act
            const declarations = read(config);

            // Assert
            expect(declarations).toEqual({ vpc: { source: "a/b/c", version: "~> 6.0" } });
        });
    });

    describe("When its version is not a string", () => {
        test("Then I expect the module kept with no version", () => {
            // Arrange
            const config = { module: { vpc: [{ source: "a/b/c", version: 5 }] } };

            // Act
            const declarations = read(config);

            // Assert
            expect(declarations).toEqual({ vpc: { source: "a/b/c", version: "" } });
        });
    });

    describe("When its source is not a string, or is spelled `Source`", () => {
        test("Then I expect the module left out", () => {
            // Arrange
            const config = { module: { a: [{ source: { ref: "x" } }], b: [{ Source: "a/b/c" }] } };

            // Act
            const declarations = read(config);

            // Assert
            expect(declarations).toEqual({});
        });
    });

    describe("When it is not a list of bodies", () => {
        test("Then I expect it left out", () => {
            // Arrange
            const config = { module: { a: "x", b: [], c: [null], d: [{ cidr: "x" }] } };

            // Act
            const declarations = read(config);

            // Assert
            expect(declarations).toEqual({});
        });
    });
});

describe("Given a terraform block", () => {
    describe("When a required provider has a string source", () => {
        test("Then I expect it read with its version", () => {
            // Arrange
            const config = {
                terraform: [
                    {
                        required_providers: [
                            { aws: { source: "hashicorp/aws", version: ">= 5.0" } },
                        ],
                    },
                ],
            };

            // Act
            const declarations = read(config);

            // Assert
            expect(declarations).toEqual({
                "required_providers.aws": { source: "hashicorp/aws", version: ">= 5.0" },
            });
        });
    });

    describe("When its parts are not the shapes they should be", () => {
        test("Then I expect each bad part left out and the rest read", () => {
            // Arrange
            const config = {
                terraform: [
                    null,
                    "x",
                    { source: 42, required_providers: "x" },
                    {
                        required_providers: [
                            {
                                aws: { source: 1 },
                                google: "x",
                                azurerm: { source: "hashicorp/azurerm", version: 4 },
                            },
                        ],
                    },
                ],
            };

            // Act
            const declarations = read(config);

            // Assert
            expect(declarations).toEqual({
                "required_providers.azurerm": { source: "hashicorp/azurerm", version: "" },
            });
        });
    });
});

describe("Given a config with source lines", () => {
    describe("When a declaration's line is known", () => {
        test("Then I expect it read under the declaration's name", () => {
            // Arrange
            const config = {
                terraform: [{ required_providers: [{ aws: { source: "hashicorp/aws" } }] }],
                module: { vpc: [{ source: "a/b/c" }] },
                sourceLines: { vpc: 12, "required_providers.aws": 4 },
            };

            // Act
            const declarations = readModuleDeclarations(config as unknown as IHclFile);

            // Assert
            expect(declarations.get("vpc")?.sourceLine).toBe(12);
            expect(declarations.get("required_providers.aws")?.sourceLine).toBe(4);
        });
    });

    describe("When a declaration's line is missing or not a number", () => {
        test("Then I expect null", () => {
            // Arrange
            const config = {
                module: { vpc: [{ source: "a/b/c" }], constructor: [{ source: "d/e/f" }] },
                sourceLines: { vpc: "12" },
            };

            // Act
            const declarations = readModuleDeclarations(config as unknown as IHclFile);

            // Assert
            expect(declarations.get("vpc")?.sourceLine).toBeNull();
            expect(declarations.get("constructor")?.sourceLine).toBeNull();
        });
    });
});
