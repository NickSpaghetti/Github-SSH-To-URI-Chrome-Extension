import "../vendor/wasm_exec.js";
import { IHclFile } from "../types/IHclFile";
import { Nullable } from "../types/Nullable";
import { parseJsonConfig } from "../domain/TerraformJsonParser";

const WASM_FILE = "main.wasm.gz";
const JSON_SUFFIX = ".json";
const COMPRESSION_FORMAT = "gzip";

type ParseResult = { json?: string; error?: string };
type GoRuntime = { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => void };

/**
 * Parses HCL by way of tmccombs/hcl2json compiled to wasm. The binary is
 * fetched and inflated on first use rather than bundled.
 *
 * The twin of `TerraformJsonParser`, which this delegates to for `.json`.
 * That one stays in `domain/` because it is pure; this one reaches chrome,
 * so it cannot.
 */
export class HclParser {
    private static starting: Nullable<Promise<void>> = null;

    /**
     * @param contents The raw text of the file being viewed.
     * @param fileName Used to pick the JSON reader, and for parse error positions.
     * @returns The parsed config.
     * @throws When the wasm binary cannot be read, or never registers itself.
     * @throws When the parser reports an error or returns nothing.
     * @throws When the parser's output, or a `.json` file, is not valid JSON.
     */
    public static async parseAsync(contents: string, fileName: string): Promise<IHclFile> {
        if (fileName.toLowerCase().endsWith(JSON_SUFFIX)) {
            return parseJsonConfig(contents);
        }

        await HclParser.startAsync();
        const parse = (globalThis as unknown as Record<string, unknown>)["tofuParseToString"] as (
            hcl: string,
            name: string,
        ) => ParseResult;

        const result = parse(contents, fileName);
        if (result.error !== undefined || result.json === undefined) {
            throw new Error(result.error ?? "the parser returned nothing");
        }
        return JSON.parse(result.json) as IHclFile;
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
