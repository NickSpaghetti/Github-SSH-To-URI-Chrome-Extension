import { expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { ParsedDeclaration } from "../../../src/types/ParsedDeclaration";
import { readModuleDeclarations } from "../../../src/domain/ModuleDeclarationReader";

/** What the Go tests pin the wasm parser's output to. */
const CONTRACT = path.resolve(__dirname, "../../../wasm/declarations/testdata/contract.json");

/** The type of each field. The compiler requires exactly the fields `ParsedDeclaration` has. */
const FIELD_TYPES: Record<keyof ParsedDeclaration, "string" | "number" | "boolean"> = {
    name: "string",
    block: "string",
    source: "string",
    written: "string",
    resolved: "boolean",
    version: "string",
    line: "number",
    column: "number",
};

/** The compiler requires exactly the block types `ParsedDeclaration` allows. */
const BLOCK_TYPES: Record<ParsedDeclaration["block"], true> = {
    module: true,
    terraform: true,
    required_providers: true,
};

const emitted = JSON.parse(fs.readFileSync(CONTRACT, "utf8")) as Record<string, unknown>[];

describe("Given the declarations the Go parser emits", () => {
    describe("When each is compared with ParsedDeclaration", () => {
        test("Then I expect the same fields", () => {
            // Arrange
            const expected = Object.keys(FIELD_TYPES).sort();

            // Act
            const fields = emitted.map((declaration) => Object.keys(declaration).sort());

            // Assert
            for (const actual of fields) {
                expect<string[]>(actual).toEqual(expected);
            }
        });

        test("Then I expect each field to have its type", () => {
            // Arrange
            const expected = emitted.map(() => FIELD_TYPES);

            // Act
            const types = emitted.map((declaration) =>
                Object.fromEntries(
                    Object.keys(FIELD_TYPES).map((field) => [field, typeof declaration[field]]),
                ),
            );

            // Assert
            expect(types).toEqual(expected);
        });

        test("Then I expect every block type to be one ParsedDeclaration allows", () => {
            // Arrange
            const allowed = Object.keys(BLOCK_TYPES);

            // Act
            const blocks = emitted.map((declaration) => declaration.block);

            // Assert
            for (const block of blocks) {
                expect<string[]>(allowed).toContain(block);
            }
        });
    });

    describe("When they are read", () => {
        test("Then I expect none dropped", () => {
            // Arrange
            const count = emitted.length;

            // Act
            const declarations = readModuleDeclarations(emitted);

            // Assert
            expect<number>(count).toBeGreaterThan(0);
            expect<number>(declarations.length).toBe(count);
        });
    });
});
