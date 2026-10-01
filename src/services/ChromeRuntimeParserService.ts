import { IHclFile } from "../types/IHclFile";
import { ParseRequest, WORKER_QUERIES } from "../types/WorkerRequest";

export type ParseHclResponse = { ok: boolean; hclFile?: IHclFile; error?: string };

/**
 * Parses HCL in the service worker, because wasm cannot be compiled in a
 * content script on github.com: the page's CSP has no `wasm-unsafe-eval` and
 * the isolated world does not escape it.
 */
export class ChromeRuntimeParserService {
    /**
     * @param contents The raw text of the file being viewed.
     * @param fileName Used to pick the JSON reader, and for parse error positions.
     * @returns The parsed config.
     * @throws When the service worker reports a parse error, or does not respond.
     */
    public async parseAsync(contents: string, fileName: string): Promise<IHclFile> {
        const request: ParseRequest = {
            contentScriptQuery: WORKER_QUERIES.PARSE,
            contents: contents,
            fileName: fileName,
        };
        const response: ParseHclResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage(request, (callback: ParseHclResponse) => {
                resolve(callback ?? { ok: false, error: "the parser did not respond" });
            });
        });

        if (!response.ok || response.hclFile === undefined) {
            throw new Error(response.error ?? "the parser did not respond");
        }
        return response.hclFile;
    }
}
