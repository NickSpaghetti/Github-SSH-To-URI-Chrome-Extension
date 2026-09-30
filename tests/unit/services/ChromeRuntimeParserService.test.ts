import { expect } from "@jest/globals";
import { ChromeRuntimeParserService } from "../../../src/services/ChromeRuntimeParserService";
import { IHclFile } from "../../../src/types/IHclFile";
import { WORKER_QUERIES } from "../../../src/types/WorkerRequest";
import { clearChromeRuntime, stubChromeRuntime } from "./ChromeRuntimeStub";

/** The config a worker answers with when the parse succeeded. */
const parsed = { module: { vpc: [{ source: "./modules/vpc" }] } } as unknown as IHclFile;

const service = new ChromeRuntimeParserService();
const CONTENTS = 'module "vpc" { source = "./modules/vpc" }';
const FILE_NAME = "main.tf";

afterEach(() => clearChromeRuntime());

describe("Given the service worker parses the file", () => {
    describe("When a file is parsed", () => {
        test("Then I expect the parsed config returned", async () => {
            // Arrange
            stubChromeRuntime(() => ({ ok: true, hclFile: parsed }));

            // Act
            const config = await service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
            expect<IHclFile>(config).toEqual(parsed);
        });
    });

    describe("When the message is sent", () => {
        test("Then I expect the contents and file name carried with the query", async () => {
            // Arrange
            const stub = stubChromeRuntime(() => ({ ok: true, hclFile: parsed }));

            // Act
            await service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
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
            // Arrange
            stubChromeRuntime(() => ({
                ok: false,
                error: "main.tf:3,1-2: Argument or block definition required",
            }));

            // Act
            const parsing = service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
            await expect(parsing).rejects.toThrow("Argument or block definition required");
        });
    });
});

describe("Given the service worker goes away before answering", () => {
    describe("When a file is parsed", () => {
        test("Then I expect a throw naming the silence", async () => {
            // Arrange
            stubChromeRuntime(() => undefined);

            // Act
            const parsing = service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
            await expect(parsing).rejects.toThrow("the parser did not respond");
        });
    });
});

describe("Given the service worker answers ok but sends no file", () => {
    describe("When a file is parsed", () => {
        test("Then I expect a throw rather than an undefined config", async () => {
            // Arrange
            stubChromeRuntime(() => ({ ok: true }));

            // Act
            const parsing = service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
            await expect(parsing).rejects.toThrow();
        });
    });
});
