import { Nullable } from "../types/Nullable";
import { TerraformModule } from "../types/Terraform";

/** The block names declarations are read from, and the prefix the popup shows for a provider. */
export const TERRAFORM_SYNTAX = {
    TERRAFORM: "terraform",
    REQUIRED_PROVIDERS: "required_providers",
    MODULE: "module",
};

const BLOCK_TYPES: readonly string[] = Object.values(TERRAFORM_SYNTAX);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const readDeclaration = (value: unknown): Nullable<TerraformModule> => {
    if (
        !isRecord(value) ||
        typeof value.name !== "string" ||
        value.name === "" ||
        typeof value.block !== "string" ||
        !BLOCK_TYPES.includes(value.block) ||
        typeof value.source !== "string"
    ) {
        return null;
    }
    return {
        moduleName: value.name,
        terraformProperty: value.block,
        provider: {
            source: value.source,
            version: typeof value.version === "string" ? value.version : "",
        },
        sourceLine: typeof value.line === "number" ? value.line : null,
        sourceColumn: typeof value.column === "number" ? value.column : null,
        writtenSource: typeof value.written === "string" ? value.written : value.source,
        sourceResolved: value.resolved === true,
    };
};

/**
 * Reads the declarations the parser emitted.
 * @param value The declarations as the parser emits them.
 * @returns Each declaration that has a name, a known block type and a source, in the
 * order the file writes them. Empty when `value` is not a list.
 */
export const readModuleDeclarations = (value: unknown): TerraformModule[] =>
    Array.isArray(value)
        ? value.map(readDeclaration).filter((module): module is TerraformModule => module !== null)
        : [];
