import { expect } from "@jest/globals";
import { hasPageAccessAsync, syncOptInContentScriptsAsync } from "../../../src/services/PageAccess";

type Registered = { id: string; matches?: string[]; js?: string[] };

/**
 * Installs a stand in for the parts of `chrome.permissions` and
 * `chrome.scripting` the access service uses.
 * @param granted The origins the user has granted.
 * @param registered The content scripts already registered.
 * @returns The registrations, as the stand in holds them after each call.
 */
const stubChrome = (granted: string[], registered: Registered[] = []) => {
    const scripts = [...registered];
    (globalThis as unknown as { chrome: unknown }).chrome = {
        permissions: {
            contains: ({ origins }: { origins: string[] }) =>
                Promise.resolve(origins.every((origin) => granted.includes(origin))),
        },
        scripting: {
            getRegisteredContentScripts: ({ ids }: { ids: string[] }) =>
                Promise.resolve(scripts.filter((script) => ids.includes(script.id))),
            registerContentScripts: (added: Registered[]) => {
                for (const script of added) {
                    if (scripts.some((existing) => existing.id === script.id)) {
                        return Promise.reject(new Error(`Duplicate script ID '${script.id}'`));
                    }
                }
                scripts.push(...added);
                return Promise.resolve();
            },
            unregisterContentScripts: ({ ids }: { ids: string[] }) => {
                scripts.splice(
                    0,
                    scripts.length,
                    ...scripts.filter((script) => !ids.includes(script.id)),
                );
                return Promise.resolve();
            },
        },
    };
    return scripts;
};

const GITLAB = "https://gitlab.com/*";
const GITLAB_SCRIPT = "iac-module-linker-gitlab.com";

afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("Given a page host", () => {
    describe("When it is granted at install", () => {
        test("Then I expect access without a grant", async () => {
            // Arrange
            stubChrome([]);

            // Act
            const access = await hasPageAccessAsync("github.com");

            // Assert
            expect<boolean>(access).toBe(true);
        });
    });

    describe("When it is opt-in", () => {
        test("Then I expect access only once the user has granted it", async () => {
            // Arrange
            stubChrome([]);
            const before = await hasPageAccessAsync("gitlab.com");
            stubChrome([GITLAB]);

            // Act
            const after = await hasPageAccessAsync("gitlab.com");

            // Assert
            expect<boolean[]>([before, after]).toEqual([false, true]);
        });
    });

    describe("When it is not supported", () => {
        test("Then I expect no access", async () => {
            // Arrange
            stubChrome([GITLAB]);

            // Act
            const access = await hasPageAccessAsync("gitlab.example.com");

            // Assert
            expect<boolean>(access).toBe(false);
        });
    });
});

describe("Given the content script registrations", () => {
    describe("When GitLab is granted and nothing is registered", () => {
        test("Then I expect the content script registered on GitLab", async () => {
            // Arrange
            const scripts = stubChrome([GITLAB]);

            // Act
            await syncOptInContentScriptsAsync();

            // Assert
            expect(scripts).toEqual([
                {
                    id: GITLAB_SCRIPT,
                    matches: [GITLAB],
                    js: ["contentscript.js"],
                    runAt: "document_end",
                },
            ]);
        });
    });

    describe("When GitLab is revoked and its script is registered", () => {
        test("Then I expect it unregistered", async () => {
            // Arrange
            const scripts = stubChrome([], [{ id: GITLAB_SCRIPT }]);

            // Act
            await syncOptInContentScriptsAsync();

            // Assert
            expect(scripts).toEqual([]);
        });
    });

    describe("When two syncs start at once", () => {
        test("Then I expect one registration and no duplicate id error", async () => {
            // Arrange
            const scripts = stubChrome([GITLAB]);

            // Act
            await Promise.all([syncOptInContentScriptsAsync(), syncOptInContentScriptsAsync()]);

            // Assert
            expect<string[]>(scripts.map((script) => script.id)).toEqual([GITLAB_SCRIPT]);
        });
    });
});
