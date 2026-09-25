import { expect } from "@jest/globals";
import { ChromeRuntimeParserService } from "../../../src/services/ChromeRuntimeParserService";
import { IHclFile } from "../../../src/types/IHclFile";
import { WORKER_QUERIES } from "../../../src/types/WorkerRequest";
import { clearChromeRuntime, stubChromeRuntime } from "./ChromeRuntimeStub";

const parsed = { module: { vpc: [{ source: "./modules/vpc" }] } } as unknown as IHclFile;

const service = new ChromeRuntimeParserService();
const CONTENTS = 'module "vpc" { source = "./modules/vpc" }';
const FILE_NAME = "main.tf";

afterEach(() => clearChromeRuntime());

describe("Given the service worker parses the file", () => {
    describe("When a file is parsed", () => {
        test("Then I expect the parsed config returned", async () => {
            stubChromeRuntime(() => ({ ok: true, hclFile: parsed }));

            expect<IHclFile>(await service.parseAsync(CONTENTS, FILE_NAME)).toEqual(parsed);
        });
    });

    describe("When the message is sent", () => {
        test("Then I expect the contents and file name carried with the query", async () => {
            const stub = stubChromeRuntime(() => ({ ok: true, hclFile: parsed }));
            await service.parseAsync(CONTENTS, FILE_NAME);

            expect<unknown>(stub.sent[0]).toEqual({
                contentScriptQuery: WORKER_QUERIES.PARSE,
                contents: CONTENTS,
                fileName: FILE_NAME,
            });
        });
    });
});

describe("Given the service worker reports a parse error", () => {
    describe("When a file is parsed", () => {
        test("Then I expect the error surfaced, not swallowed", async () => {
            stubChromeRuntime(() => ({
                ok: false,
                error: "main.tf:3,1-2: Argument or block definition required",
            }));

            await expect(service.parseAsync(CONTENTS, FILE_NAME)).rejects.toThrow(
                "Argument or block definition required",
            );
        });
    });
});

describe("Given the service worker goes away before answering", () => {
    describe("When a file is parsed", () => {
        test("Then I expect a throw naming the silence", async () => {
            stubChromeRuntime(() => undefined);

            await expect(service.parseAsync(CONTENTS, FILE_NAME)).rejects.toThrow(
                "the parser did not respond",
            );
        });
    });
});

describe("Given the service worker answers ok but sends no file", () => {
    describe("When a file is parsed", () => {
        test("Then I expect a throw rather than an undefined config", async () => {
            stubChromeRuntime(() => ({ ok: true }));

            await expect(service.parseAsync(CONTENTS, FILE_NAME)).rejects.toThrow();
        });
    });
});
