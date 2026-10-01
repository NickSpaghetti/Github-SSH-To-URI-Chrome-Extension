import { expect } from "@jest/globals";
import { readModuleDeclarations } from "../../../src/domain/ModuleDeclarationReader";
import { TerraformModule } from "../../../src/types/Terraform";

describe("Given declarations from the parser", () => {
    describe("When each has every field", () => {
        test("Then I expect them read in order", () => {
            // Arrange
            const emitted = [
                {
                    name: "vpc",
                    block: "module",
                    source: "a/b/c",
                    written: "a/b/c",
                    resolved: true,
                    version: "~> 6.0",
                    line: 2,
                    column: 12,
                },
                {
                    name: "required_providers.aws",
                    block: "required_providers",
                    source: "hashicorp/aws",
                    written: "hashicorp/aws",
                    resolved: true,
                    version: "",
                    line: 9,
                    column: 23,
                },
            ];

            // Act
            const declarations = readModuleDeclarations(emitted);

            // Assert
            expect<TerraformModule[]>(declarations).toEqual([
                {
                    moduleName: "vpc",
                    terraformProperty: "module",
                    provider: { source: "a/b/c", version: "~> 6.0" },
                    sourceLine: 2,
                    sourceColumn: 12,
                    writtenSource: "a/b/c",
                    sourceResolved: true,
                },
                {
                    moduleName: "required_providers.aws",
                    terraformProperty: "required_providers",
                    provider: { source: "hashicorp/aws", version: "" },
                    sourceLine: 9,
                    sourceColumn: 23,
                    writtenSource: "hashicorp/aws",
                    sourceResolved: true,
                },
            ]);
        });
    });

    describe("When a version, position, written source or resolution is missing or the wrong type", () => {
        test("Then I expect it read as unresolved, written as its source, with no version or position", () => {
            // Arrange
            const emitted = [
                {
                    name: "vpc",
                    block: "module",
                    source: "a/b/c",
                    version: 5,
                    line: "2",
                    column: "12",
                },
            ];

            // Act
            const declarations = readModuleDeclarations(emitted);

            // Assert
            expect<TerraformModule[]>(declarations).toEqual([
                {
                    moduleName: "vpc",
                    terraformProperty: "module",
                    provider: { source: "a/b/c", version: "" },
                    sourceLine: null,
                    sourceColumn: null,
                    writtenSource: "a/b/c",
                    sourceResolved: false,
                },
            ]);
        });
    });

    describe("When one lacks a name, a known block type or a source", () => {
        test("Then I expect it left out and the rest read", () => {
            // Arrange
            const emitted = [
                null,
                "vpc",
                { block: "module", source: "a/b/c" },
                { name: "", block: "module", source: "a/b/c" },
                { name: "a", block: "resource", source: "a/b/c" },
                { name: "b", block: "module", source: 1 },
                { name: "kept", block: "module", source: "a/b/c" },
            ];

            // Act
            const declarations = readModuleDeclarations(emitted);

            // Assert
            expect<string[]>(declarations.map((module) => module.moduleName)).toEqual(["kept"]);
        });
    });

    describe("When they are not a list", () => {
        test("Then I expect none", () => {
            // Arrange
            const emitted = [undefined, null, {}, "[]", { module: { vpc: [{ source: "a" }] } }];

            // Act
            const read = emitted.map(readModuleDeclarations);

            // Assert
            expect<TerraformModule[][]>(read).toEqual([[], [], [], [], []]);
        });
    });
});
