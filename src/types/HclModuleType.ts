/** A body of a `module` block, parsed from HCL. */
export type HclModule = {
    [input: string]: unknown;
    source: string;
    version?: unknown;
};

/**
 * @param value The value to test.
 * @returns true if value is an HclModule; otherwise, false.
 */
export const isHclModule = (value: unknown): value is HclModule =>
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "string";
