import { expect } from "@jest/globals";
import { ChromeRuntimeParserService } from "../../../src/services/ChromeRuntimeParserService";
import { WORKER_QUERIES } from "../../../src/types/WorkerRequest";
import { TerraformModule } from "../../../src/types/Terraform";
import { clearChromeRuntime, stubChromeRuntime } from "./ChromeRuntimeStub";

/** The declarations a worker answers with when the parse succeeded. */
const parsed = [
    {
        name: "vpc",
        block: "module",
        source: "./modules/vpc",
        written: "./modules/vpc",
        resolved: true,
        version: "",
        line: 1,
    },
];

const service = new ChromeRuntimeParserService();
const CONTENTS = 'module "vpc" { source = "./modules/vpc" }';
const FILE_NAME = "main.tf";

afterEach(() => clearChromeRuntime());

describe("Given the service worker parses the file", () => {
    describe("When a file is parsed", () => {
        test("Then I expect the declarations read into modules", async () => {
            // Arrange
            stubChromeRuntime(() => ({ ok: true, declarations: parsed }));

            // Act
            const declarations = await service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
            expect<TerraformModule[]>(declarations).toEqual([
                {
                    moduleName: "vpc",
                    terraformProperty: "module",
                    provider: { source: "./modules/vpc", version: "" },
                    sourceLine: 1,
                    writtenSource: "./modules/vpc",
                    sourceResolved: true,
                },
            ]);
        });

        test("Then I expect a malformed declaration left out", async () => {
            // Arrange
            stubChromeRuntime(() => ({
                ok: true,
                declarations: [...parsed, { name: "bad", block: "resource", source: "x" }],
            }));

            // Act
            const declarations = await service.parseAsync(CONTENTS, FILE_NAME);

            // Assert
            expect<string[]>(declarations.map((module) => module.moduleName)).toEqual(["vpc"]);
        });
    });

    describe("When the message is sent", () => {
        test("Then I expect the contents and file name carried with the query", async () => {
            // Arrange
            const stub = stubChromeRuntime(() => ({ ok: true, declarations: parsed }));

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
