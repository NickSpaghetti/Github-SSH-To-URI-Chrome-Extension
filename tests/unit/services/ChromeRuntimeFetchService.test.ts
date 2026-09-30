import { expect } from "@jest/globals";
import { WORKER_QUERIES } from "../../../src/types/WorkerRequest";
import { ChromeRuntimeFetchService } from "../../../src/data-access/ChromeRuntimeFetchService";
import { RunTimeFetchResponse } from "../../../src/types/RunTimeFetchResponse";
import { clearChromeRuntime, stubChromeRuntime } from "./ChromeRuntimeStub";

type Versions = { versions: string[] };

/** What a background script answers with when the fetch succeeded. */
const answered: RunTimeFetchResponse<Versions> = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    data: { versions: ["1.0.0"] },
};

const service = new ChromeRuntimeFetchService();
const URL_UNDER_TEST = "https://registry.terraform.io/v1/providers/hashicorp/aws";

afterEach(() => clearChromeRuntime());

describe("Given the background script answers", () => {
    describe("When data is fetched", () => {
        test("Then I expect the response passed through", async () => {
            // Arrange
            stubChromeRuntime(() => answered);

            // Act
            const response = await service.fetchDataAsync<Versions>(URL_UNDER_TEST);

            // Assert
            expect<boolean>(response.ok).toBe(true);
            expect<string[]>(response.data.versions).toEqual(["1.0.0"]);
        });
    });

    describe("When a cache mode is named", () => {
        test("Then I expect the url and the mode carried in the message", async () => {
            // Arrange
            const stub = stubChromeRuntime(() => answered);

            // Act
            await service.fetchDataAsync<Versions>(URL_UNDER_TEST, "force-cache");

            // Assert
            expect<unknown>(stub.sent[0]).toEqual({
                contentScriptQuery: WORKER_QUERIES.FETCH,
                url: URL_UNDER_TEST,
                cache: "force-cache",
            });
        });
    });
});

describe("Given the background script goes away before answering", () => {
    describe("When data is fetched", () => {
        test("Then I expect a failed response rather than undefined", async () => {
            // Arrange
            stubChromeRuntime(() => undefined);

            // Act
            const response = await service.fetchDataAsync<Versions>(URL_UNDER_TEST);

            // Assert
            // The caller reads `ok` first. Before the guard this was undefined,
            // and reading `ok` off it threw a TypeError inside the service above.
            expect<RunTimeFetchResponse<Versions> | undefined>(response).toBeDefined();
            expect<boolean>(response.ok).toBe(false);
            expect<string>(response.statusText).toBe("the background script did not respond");
        });
    });
});
