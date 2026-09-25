import { IHclFile } from "../types/IHclFile";
import { HclModule } from "../types/HclModuleType";
import { ProviderType, TerraformModule } from "../types/Terraform";
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
 * @param hclFile a config as the HCL parser emits it
 * @returns every declaration found, keyed by the name shown in the popup
 */
export const readModuleDeclarations = (hclFile: IHclFile): Map<string, TerraformModule> => {
    const declarations = new Map<string, TerraformModule>();
    readTerraformBlocks(hclFile, declarations);
    readModuleBlocks(hclFile, declarations);
    return declarations;
};

/** The `terraform {}` block: its own `source`, and each `required_providers` entry. */
const readTerraformBlocks = (hclFile: IHclFile, into: Map<string, TerraformModule>): void => {
    for (const block of hclFile.terraform ?? []) {
        if (block?.source !== undefined) {
            into.set(TERRAFORM_SYNTAX.TERRAFORM, {
                moduleName: TERRAFORM_SYNTAX.TERRAFORM,
                terraformProperty: TERRAFORM_SYNTAX.TERRAFORM,
                provider: { source: block.source, version: "" },
            });
        }

        const providers = (block?.required_providers ?? [])[0] as
            Record<string, ProviderType> | undefined;
        for (const [name, provider] of Object.entries(providers ?? {})) {
            if (provider?.source === undefined) {
                continue;
            }
            const moduleName = `${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.${name}`;
            into.set(moduleName, {
                moduleName: moduleName,
                terraformProperty: TERRAFORM_SYNTAX.REQUIRED_PROVIDERS,
                provider: provider,
            });
        }
    }
};

/** `module "name" { source = ... }`, which the parser emits as an array of bodies. */
const readModuleBlocks = (hclFile: IHclFile, into: Map<string, TerraformModule>): void => {
    for (const [moduleName, bodies] of Object.entries(hclFile.module ?? {})) {
        if (!isHclModule(bodies)) {
            continue;
        }
        into.set(moduleName, {
            moduleName: moduleName,
            terraformProperty: TERRAFORM_SYNTAX.MODULE,
            provider: {
                source: bodies[0]?.source ?? "",
                version: bodies[0]?.version ?? "",
            },
        });
    }
};

const isHclModule = (bodies: unknown): bodies is HclModule[] => {
    if (!Array.isArray(bodies)) {
        return false;
    }
    const first: unknown = bodies[0];
    return typeof first === "object" && first !== null && ("source" in first || "Source" in first);
};
