import "../vendor/wasm_exec.js";
import { Nullable } from "../types/Nullable";
import { ParsedDeclaration } from "../types/ParsedDeclaration";

const WASM_FILE = "main.wasm.gz";
const COMPRESSION_FORMAT = "gzip";

type ParseResult = { declarations?: string; error?: string };
type GoRuntime = { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => void };

/**
 * Reads the declarations in a Terraform or OpenTofu file, using HashiCorp's HCL
 * compiled to wasm. The binary is fetched and inflated on first use.
 */
export class HclParser {
    private static starting: Nullable<Promise<void>> = null;

    /**
     * Reads the module sources a file declares.
     * @param contents The raw text of the file being viewed.
     * @param fileName The file's name. One ending in `.json` is read as JSON syntax.
     * @returns The declarations in the file, in the order the file writes them.
     * @throws When the wasm binary cannot be read, or never registers itself.
     * @throws When the file does not parse, or the parser returns nothing.
     */
    public static async parseAsync(
        contents: string,
        fileName: string,
    ): Promise<ParsedDeclaration[]> {
        await HclParser.startAsync();
        const parse = (globalThis as unknown as Record<string, unknown>)["tofuParseToString"] as (
            contents: string,
            name: string,
        ) => ParseResult;

        const result = parse(contents, fileName);
        if (result.error !== undefined || result.declarations === undefined) {
            throw new Error(result.error ?? "the parser returned nothing");
        }
        return JSON.parse(result.declarations) as ParsedDeclaration[];
    }

    /**
     * Started once, and every later call waits on the same load. A failed load
     * is forgotten rather than kept: the promise is cached, so holding a
     * rejected one would leave the service worker unable to parse anything for
     * the rest of its life after a single fetch blip.
     */
    private static async startAsync(): Promise<void> {
        const loading = (HclParser.starting ??= HclParser.loadAsync());
        try {
            await loading;
        } catch (error) {
            // Only forget the load that failed. A call that arrived while this
            // one was rejecting may already have started a fresh one.
            if (HclParser.starting === loading) {
                HclParser.starting = null;
            }
            throw error;
        }
    }

    private static async loadAsync(): Promise<void> {
        const response = await fetch(chrome.runtime.getURL(WASM_FILE));
        if (response.body === null) {
            throw new Error(`could not read ${WASM_FILE}`);
        }
        const decompressed = response.body.pipeThrough(new DecompressionStream(COMPRESSION_FORMAT));
        const bytes = await new Response(decompressed).arrayBuffer();

        const runtime = new (globalThis as unknown as { Go: new () => GoRuntime }).Go();
        const wasm = await WebAssembly.instantiate(bytes, runtime.importObject);
        // The Go program blocks forever so its exports stay callable. Awaiting it would hang.
        runtime.run(wasm.instance);

        // One check is enough. `run` executes Go's main synchronously until it
        // parks on `select {}`, and main registers the parser before that, so
        // it is either there now or it never will be.
        if (
            typeof (globalThis as unknown as Record<string, unknown>).tofuParseToString !==
            "function"
        ) {
            throw new Error("the parser did not register itself");
        }
    }
}
