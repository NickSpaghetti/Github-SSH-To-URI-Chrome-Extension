import { IHclFile } from "../types/IHclFile";
import { isHclModule } from "../types/HclModuleType";
import { TerraformModule } from "../types/Terraform";
/** The block names this reads, and the prefix the popup shows for a provider. */
export const TERRAFORM_SYNTAX = {
    TERRAFORM: "terraform",
    REQUIRED_PROVIDERS: "required_providers",
    MODULE: "module",
};

/**
 * Reads the module and provider declarations out of a parsed config.
 *
 * Pure, and it never throws: a block it does not recognise is one it leaves
 * out, so a half understood file still yields the rest of its modules.
 * @param hclFile A config as the HCL parser emits it.
 * @returns Every declaration found, keyed by the name shown in the popup.
 */
export const readModuleDeclarations = (hclFile: IHclFile): Map<string, TerraformModule> => {
    const declarations = new Map<string, TerraformModule>();
    readTerraformBlocks(hclFile, declarations);
    readModuleBlocks(hclFile, declarations);
    return declarations;
};

/** An entry of a `required_providers` block. */
type RequiredProvider = { source: string; version?: unknown };

/** A `terraform` block with a `source`. */
type SourcedTerraformBlock = { source: string };

/** A `terraform` block with `required_providers`. */
type ProviderBlocks = { required_providers: unknown[] };

/** A `required_providers` block, keyed by provider name. */
type RequiredProviders = { [name: string]: unknown };

const isRequiredProvider = (value: unknown): value is RequiredProvider =>
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "string";

const hasTerraformSource = (value: unknown): value is SourcedTerraformBlock =>
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "string";

const hasProviderBlocks = (value: unknown): value is ProviderBlocks =>
    typeof value === "object" &&
    value !== null &&
    "required_providers" in value &&
    Array.isArray(value.required_providers);

const isRequiredProviders = (value: unknown): value is RequiredProviders =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const versionOf = (declared: { version?: unknown }): string =>
    typeof declared.version === "string" ? declared.version : "";

/** The `terraform {}` block: its own `source`, and each `required_providers` entry. */
const readTerraformBlocks = (hclFile: IHclFile, into: Map<string, TerraformModule>): void => {
    for (const block of hclFile.terraform ?? []) {
        const terraform: unknown = block;
        if (hasTerraformSource(terraform)) {
            into.set(TERRAFORM_SYNTAX.TERRAFORM, {
                moduleName: TERRAFORM_SYNTAX.TERRAFORM,
                terraformProperty: TERRAFORM_SYNTAX.TERRAFORM,
                provider: { source: terraform.source, version: "" },
            });
        }

        const providers = hasProviderBlocks(terraform)
            ? terraform.required_providers[0]
            : undefined;
        if (!isRequiredProviders(providers)) {
            continue;
        }
        for (const [name, provider] of Object.entries(providers)) {
            if (!isRequiredProvider(provider)) {
                continue;
            }
            const moduleName = `${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.${name}`;
            into.set(moduleName, {
                moduleName: moduleName,
                terraformProperty: TERRAFORM_SYNTAX.REQUIRED_PROVIDERS,
                provider: { source: provider.source, version: versionOf(provider) },
            });
        }
    }
};

/** `module "name" { source = ... }`, which the parser emits as an array of bodies. */
const readModuleBlocks = (hclFile: IHclFile, into: Map<string, TerraformModule>): void => {
    for (const [moduleName, bodies] of Object.entries(hclFile.module ?? {})) {
        const body: unknown = Array.isArray(bodies) ? bodies[0] : undefined;
        if (!isHclModule(body)) {
            continue;
        }
        into.set(moduleName, {
            moduleName: moduleName,
            terraformProperty: TERRAFORM_SYNTAX.MODULE,
            provider: { source: body.source, version: versionOf(body) },
        });
    }
};
