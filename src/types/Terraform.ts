export type Terraform ={
    source?: string
    required_providers?: []
}

export type RequiredProvider = {
    providerTypes: Map<string,ProviderType>
}

export type ProviderType ={
    source?: string
    version?: string
}

export type TerraformModule = {
    provider: ProviderType,
    moduleName: string,
    terraformProperty: string,
}