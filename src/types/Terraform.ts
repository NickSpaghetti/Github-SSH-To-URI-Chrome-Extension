import { Nullable } from "./Nullable";

export type ProviderType = {
    source?: string;
    version?: string;
};

export type TerraformModule = {
    provider: ProviderType;
    moduleName: string;
    terraformProperty: string;
    /** The 1-based line the source is written on, or null when the parser did not say. */
    sourceLine: Nullable<number>;
    /** The 0-based UTF-16 offset of the written source within its line, or null when the parser did not say. */
    sourceColumn: Nullable<number>;
    /** The source as the file writes it, which a template's resolved source differs from. */
    writtenSource: string;
    /** false when the source could not be evaluated from the file, so it cannot be linked. */
    sourceResolved: boolean;
};
