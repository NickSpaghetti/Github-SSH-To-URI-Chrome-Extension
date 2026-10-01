/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://gitlab.com/group/repo/-/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitLabPageDataAccess, PageFetch } from "../../../src/data-access/GitLabPageDataAccess";
import { HclFileTypes } from "../../../src/types/HclFileTypes";
import { Nullable } from "../../../src/types/Nullable";

const RAW_TEXT = 'module "vpc" {\n  source = "./modules/vpc"\n}\n';

/** A fetch that answers every url with one response, and records the urls it was asked for. */
const stubFetch = (response: Partial<Response> | Error) => {
    const urls: string[] = [];
    const fetchAsync: PageFetch = (url) => {
        urls.push(url);
        return response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response as Response);
    };
    return { urls, fetchAsync };
};

const answering = (text: string, status = 200): Partial<Response> => ({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
});

const onPath = (path: string): void => window.history.replaceState({}, "", path);

beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => {});
    onPath("/group/repo/-/blob/main/main.tf");
});

afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("Given a GitLab blob page", () => {
    describe("When its text is read", () => {
        test("Then I expect the raw file at the same ref and path", async () => {
            // Arrange
            onPath("/group/sub/repo/-/blob/feature/x/nested/deep/consumer.tf?ref_type=heads#L4");
            const { urls, fetchAsync } = stubFetch(answering(RAW_TEXT));
            const page = new GitLabPageDataAccess(fetchAsync);

            // Act
            const text = await page.readSourceTextAsync();

            // Assert
            expect<Nullable<string>>(text).toBe(RAW_TEXT);
            expect<string[]>(urls).toEqual([
                "https://gitlab.com/group/sub/repo/-/raw/feature/x/nested/deep/consumer.tf",
            ]);
        });
    });

    describe("When its text is read again on the same page", () => {
        test("Then I expect one fetch", async () => {
            // Arrange
            const { urls, fetchAsync } = stubFetch(answering(RAW_TEXT));
            const page = new GitLabPageDataAccess(fetchAsync);

            // Act
            await page.readSourceTextAsync();
            const text = await page.readSourceTextAsync();

            // Assert
            expect<Nullable<string>>(text).toBe(RAW_TEXT);
            expect<number>(urls.length).toBe(1);
        });
    });

    describe("When the page navigates to another file", () => {
        test("Then I expect that file fetched", async () => {
            // Arrange
            const { urls, fetchAsync } = stubFetch(answering(RAW_TEXT));
            const page = new GitLabPageDataAccess(fetchAsync);
            await page.readSourceTextAsync();

            // Act
            onPath("/group/repo/-/blob/main/other.tf");
            await page.readSourceTextAsync();

            // Assert
            expect<string[]>(urls).toEqual([
                "https://gitlab.com/group/repo/-/raw/main/main.tf",
                "https://gitlab.com/group/repo/-/raw/main/other.tf",
            ]);
        });
    });

    describe("When the raw file is not found", () => {
        test("Then I expect null", async () => {
            // Arrange
            const { fetchAsync } = stubFetch(answering("<html>", 404));
            const page = new GitLabPageDataAccess(fetchAsync);

            // Act
            const text = await page.readSourceTextAsync();

            // Assert
            expect<Nullable<string>>(text).toBeNull();
        });
    });

    describe("When the fetch fails", () => {
        test("Then I expect null rather than a rejection", async () => {
            // Arrange
            const { fetchAsync } = stubFetch(new TypeError("Failed to fetch"));
            const page = new GitLabPageDataAccess(fetchAsync);

            // Act
            const text = await page.readSourceTextAsync();

            // Assert
            expect<Nullable<string>>(text).toBeNull();
        });
    });

    describe("When the file is empty", () => {
        test("Then I expect null", async () => {
            // Arrange
            const { fetchAsync } = stubFetch(answering(""));
            const page = new GitLabPageDataAccess(fetchAsync);

            // Act
            const text = await page.readSourceTextAsync();

            // Assert
            expect<Nullable<string>>(text).toBeNull();
        });
    });
});

describe("Given a GitLab page that is not a blob", () => {
    describe("When its text is read", () => {
        test("Then I expect null and no fetch", async () => {
            // Arrange
            onPath("/group/repo/-/tree/main/modules");
            const { urls, fetchAsync } = stubFetch(answering(RAW_TEXT));
            const page = new GitLabPageDataAccess(fetchAsync);

            // Act
            const text = await page.readSourceTextAsync();

            // Assert
            expect<Nullable<string>>(text).toBeNull();
            expect<string[]>(urls).toEqual([]);
        });
    });
});

describe("Given a GitLab file path", () => {
    describe("When the file is a .tofu.json", () => {
        test("Then I expect the type and name read from the url", () => {
            // Arrange
            onPath("/group/repo/-/blob/v1.0.0/16-everything.tofu.json");
            const page = new GitLabPageDataAccess(stubFetch(answering("")).fetchAsync);

            // Act
            const fileType = page.getFileType();
            const fileName = page.getFileName();

            // Assert
            expect<Nullable<HclFileTypes>>(fileType).toBe(HclFileTypes.tofuJson);
            expect<string>(fileName).toBe("16-everything.tofu.json");
        });
    });
});

describe("Given a GitLab blob header", () => {
    describe("When it links the file's last commit", () => {
        test("Then I expect that commit's sha", () => {
            // Arrange
            document.body.innerHTML = `<a href="/group/repo/-/commit/20b3adc4">Fix</a>`;
            const page = new GitLabPageDataAccess(stubFetch(answering("")).fetchAsync);

            // Act
            const sha = page.readCommitSha();

            // Assert
            expect<Nullable<string>>(sha).toBe("20b3adc4");
        });
    });

    describe("When it has not rendered yet", () => {
        test("Then I expect null", () => {
            // Arrange
            document.body.innerHTML = `<div></div>`;
            const page = new GitLabPageDataAccess(stubFetch(answering("")).fetchAsync);

            // Act
            const sha = page.readCommitSha();

            // Assert
            expect<Nullable<string>>(sha).toBeNull();
        });
    });
});
