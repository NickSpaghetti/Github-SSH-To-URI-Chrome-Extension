import { expect, jest } from "@jest/globals";
import { gzipSync } from "zlib";
import { HclParser } from "../../../src/services/HclParser";
import { IHclFile } from "../../../src/types/IHclFile";
import { clearChromeRuntime, stubChromeRuntime } from "./ChromeRuntimeStub";

/**
 * The wasm load is stubbed at its three boundaries: `chrome.runtime.getURL`,
 * `fetch`, and the Go runtime that `wasm_exec.js` installs on import. The gzip
 * stream is left real, because node has `DecompressionStream` and a fake one
 * would only test the fake.
 */

type Mutable = Record<string, unknown>;
type ParseResult = { json?: string; sourceLines?: Record<string, number>; error?: string };

const globals = globalThis as unknown as Mutable;
const realInstantiate = WebAssembly.instantiate;
const realGo = globals.Go;

/** `starting` is a private static, and a cached load would leak across tests. */
const resetParser = (): void => {
    (HclParser as unknown as { starting: unknown }).starting = null;
    delete globals.tofuParseToString;
};

/** Skips the wasm load entirely, for the tests about what the parser answers. */
const parserAnswers = (result: ParseResult): void => {
    (HclParser as unknown as { starting: Promise<void> }).starting = Promise.resolve();
    globals.tofuParseToString = () => result;
};

/** @returns A stream carrying a gzipped wasm header, as the fetch would. */
const gzippedStream = (): ReadableStream<Uint8Array> => {
    const compressed = new Uint8Array(gzipSync(Uint8Array.from([0, 97, 115, 109])));
    return new ReadableStream({
        start(controller) {
            controller.enqueue(compressed);
            controller.close();
        },
    });
};

/**
 * Replaces `fetch` with one that answers with a fixed body.
 * @param body The body to answer with, or null for a response carrying none.
 */
const stubFetch = (body: ReadableStream<Uint8Array> | null): void => {
    globals.fetch = () => Promise.resolve({ body: body });
};

beforeEach(() => {
    resetParser();
    stubChromeRuntime(() => undefined);
});

afterEach(() => {
    clearChromeRuntime();
    resetParser();
    delete globals.fetch;
    globals.Go = realGo;
    (WebAssembly as unknown as Mutable).instantiate = realInstantiate;
    jest.restoreAllMocks();
});

describe("Given a Terraform JSON file", () => {
    describe("When it is parsed", () => {
        test("Then I expect the JSON reader's config with the wasm's source lines", async () => {
            // Arrange
            parserAnswers({ sourceLines: { vpc: 1 } });

            // Act
            const parsed = await HclParser.parseAsync(
                '{"module":{"vpc":{"source":"./modules/vpc"}}}',
                "main.tf.json",
            );

            // Assert
            expect<IHclFile>(parsed).toEqual({
                module: { vpc: [{ source: "./modules/vpc" }] },
                sourceLines: { vpc: 1 },
            });
        });
    });

    describe("When the wasm cannot be loaded", () => {
        test("Then I expect the config without source lines", async () => {
            // Arrange
            jest.spyOn(console, "debug").mockImplementation(() => undefined);
            globals.fetch = () => Promise.reject(new Error("offline"));

            // Act
            const parsed = await HclParser.parseAsync(
                '{"module":{"vpc":{"source":"./modules/vpc"}}}',
                "main.tf.json",
            );

            // Assert
            expect<IHclFile>(parsed).toEqual({ module: { vpc: [{ source: "./modules/vpc" }] } });
            expect(parsed.sourceLines).toBeUndefined();
        });
    });
});

describe("Given the wasm parser is loaded", () => {
    describe("When it parses the file", () => {
        test("Then I expect the config it emitted", async () => {
            // Arrange
            parserAnswers({ json: '{"module":{"vpc":[{"source":"./modules/vpc"}]}}' });

            // Act
            const parsed = await HclParser.parseAsync("module {}", "main.tf");

            // Assert
            expect<IHclFile>(parsed).toEqual({ module: { vpc: [{ source: "./modules/vpc" }] } });
        });

        test("Then I expect the source lines it emitted", async () => {
            // Arrange
            parserAnswers({
                json: '{"module":{"vpc":[{"source":"./modules/vpc"}]}}',
                sourceLines: { vpc: 2 },
            });

            // Act
            const parsed = await HclParser.parseAsync("module {}", "main.tf");

            // Assert
            expect(parsed.sourceLines).toEqual({ vpc: 2 });
        });
    });

    describe("When it reports a parse error", () => {
        test("Then I expect that error surfaced", async () => {
            // Arrange
            parserAnswers({ error: "main.tf:3,1-2: Argument or block definition required" });

            // Act
            const parsing = HclParser.parseAsync("module {", "main.tf");

            // Assert
            await expect(parsing).rejects.toThrow("Argument or block definition required");
        });
    });

    describe("When it answers with neither json nor an error", () => {
        test("Then I expect a throw rather than an undefined config", async () => {
            // Arrange
            parserAnswers({});

            // Act
            const parsing = HclParser.parseAsync("module {}", "main.tf");

            // Assert
            await expect(parsing).rejects.toThrow("the parser returned nothing");
        });
    });

    describe("When its output is not valid JSON", () => {
        test("Then I expect a throw", async () => {
            // Arrange
            parserAnswers({ json: "{not json" });

            // Act
            const parsing = HclParser.parseAsync("module {}", "main.tf");

            // Assert
            await expect(parsing).rejects.toThrow();
        });
    });
});

describe("Given the wasm binary cannot be read", () => {
    describe("When a file is parsed", () => {
        test("Then I expect a throw naming the file", async () => {
            // Arrange
            stubFetch(null);

            // Act
            const parsing = HclParser.parseAsync("module {}", "main.tf");

            // Assert
            await expect(parsing).rejects.toThrow("could not read main.wasm.gz");
        });
    });
});

describe("Given the Go runtime registers the parser", () => {
    describe("When a file is parsed", () => {
        test("Then I expect the whole load to run and the config to come back", async () => {
            // Arrange
            stubFetch(gzippedStream());
            (WebAssembly as unknown as Mutable).instantiate = () =>
                Promise.resolve({ instance: {}, module: {} });
            globals.Go = class {
                importObject = {};
                run() {
                    // Before returning, as the real runtime does: Go's main
                    // registers the parser and then parks on `select {}`.
                    globals.tofuParseToString = () => ({ json: '{"module":{}}' });
                }
            };

            // Act
            const parsed = await HclParser.parseAsync("module {}", "main.tf");

            // Assert
            expect<IHclFile>(parsed).toEqual({ module: {} });
        });
    });
});

describe("Given a load that already failed once", () => {
    describe("When a file is parsed again", () => {
        test("Then I expect the load retried, not the failure cached", async () => {
            // Arrange
            stubFetch(null);
            await expect(HclParser.parseAsync("module {}", "main.tf")).rejects.toThrow(
                "could not read main.wasm.gz",
            );
            stubFetch(gzippedStream());
            (WebAssembly as unknown as Mutable).instantiate = () =>
                Promise.resolve({ instance: {}, module: {} });
            globals.Go = class {
                importObject = {};
                run() {
                    globals.tofuParseToString = () => ({ json: '{"module":{}}' });
                }
            };

            // Act
            const parsed = await HclParser.parseAsync("module {}", "main.tf");

            // Assert
            expect<IHclFile>(parsed).toEqual({ module: {} });
        });
    });
});

describe("Given the Go runtime never registers the parser", () => {
    describe("When a file is parsed", () => {
        test("Then I expect a throw", async () => {
            // Arrange
            stubFetch(gzippedStream());
            (WebAssembly as unknown as Mutable).instantiate = () =>
                Promise.resolve({ instance: {}, module: {} });
            globals.Go = class {
                importObject = {};
                run() {
                    // Registers nothing, which is what a wasm build mismatch looks like.
                }
            };

            // Act
            const parsing = HclParser.parseAsync("module {}", "main.tf");

            // Assert
            await expect(parsing).rejects.toThrow("the parser did not register itself");
        });
    });
});
