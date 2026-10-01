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
};
