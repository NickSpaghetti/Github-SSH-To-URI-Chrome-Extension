import { IHclFile } from "../types/IHclFile";

/**
 * Reads Terraform's JSON syntax into the shape the HCL parser produces.
 * hcl2json cannot read it whatever filename it is given.
 *
 * The twin of `HclParser`, which delegates here for `.json`. They are in
 * different layers because that one fetches wasm through chrome and this one
 * is pure, which is the only reason they are not one file.
 * @param contents the raw text of a `.tf.json` or `.tofu.json` file
 * @returns the config with every block normalized to an array, as the HCL parser emits
 * @throws when the text is not valid JSON
 * @throws when the text parses to something other than an object
 */
export const parseJsonConfig = (contents: string): IHclFile => {
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed !== "object" || parsed === null) {
        throw new Error("the file is not a JSON object");
    }

    const config = parsed as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    if (config.module !== undefined) {
        result.module = normalizeBlocks(config.module);
    }
    if (config.terraform !== undefined) {
        result.terraform = toArray(config.terraform).map(normalizeTerraformBlock);
    }
    return result as unknown as IHclFile;
};

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

/** Each named block becomes an array of bodies, as the HCL parser emits. */
const normalizeBlocks = (blocks: unknown): Record<string, unknown[]> => {
    if (typeof blocks !== "object" || blocks === null) {
        return {};
    }
    const normalized: Record<string, unknown[]> = {};
    for (const [name, body] of Object.entries(blocks as Record<string, unknown>)) {
        normalized[name] = toArray(body);
    }
    return normalized;
};

const normalizeTerraformBlock = (block: unknown): unknown => {
    if (typeof block !== "object" || block === null) {
        return block;
    }
    const body = block as Record<string, unknown>;
    if (body.required_providers === undefined) {
        return body;
    }
    return { ...body, required_providers: toArray(body.required_providers) };
};
