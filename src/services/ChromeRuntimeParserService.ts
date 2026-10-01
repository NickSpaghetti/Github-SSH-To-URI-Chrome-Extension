import { ParseRequest, WORKER_QUERIES } from "../types/WorkerRequest";
import { TerraformModule } from "../types/Terraform";
import { readModuleDeclarations } from "../domain/ModuleDeclarationReader";

/** What the service worker answers a parse request with. */
export type ParseResponse = { ok: boolean; declarations?: unknown; error?: string };

/**
 * Parses HCL in the service worker, because wasm cannot be compiled in a
 * content script on github.com: the page's CSP has no `wasm-unsafe-eval` and
 * the isolated world does not escape it.
 */
export class ChromeRuntimeParserService {
    /**
     * @param contents The raw text of the file being viewed.
     * @param fileName The file's name. One ending in `.json` is read as JSON syntax.
     * @returns Each well-formed declaration in the file, in the order the file writes them.
     * @throws When the service worker reports a parse error, or does not respond.
     */
    public async parseAsync(contents: string, fileName: string): Promise<TerraformModule[]> {
        const request: ParseRequest = {
            contentScriptQuery: WORKER_QUERIES.PARSE,
            contents: contents,
            fileName: fileName,
        };
        const response: ParseResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage(request, (callback: ParseResponse) => {
                resolve(callback ?? { ok: false, error: "the parser did not respond" });
            });
        });

        if (!response.ok || response.declarations === undefined) {
            throw new Error(response.error ?? "the parser did not respond");
        }
        return readModuleDeclarations(response.declarations);
    }
}
