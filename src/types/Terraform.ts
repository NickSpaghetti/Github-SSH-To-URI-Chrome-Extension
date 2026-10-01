import { Nullable } from "./Nullable";

export type Terraform = {
    source?: string;
    /** One entry per block, each a map of provider name to its declaration. */
    required_providers?: Array<Record<string, ProviderType>>;
};

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
};
