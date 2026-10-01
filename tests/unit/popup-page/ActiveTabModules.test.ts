import { expect } from "@jest/globals";
import { readTabModulesAsync, ActiveTab } from "../../../src/popup-page/ActiveTabModules";

/**
 * Installs a stand in for the chrome apis the popup reads a tab through.
 * @param granted The opt-in origins the user has granted.
 * @returns The tabs the popup injected the content script into.
 */
const stubChrome = (granted: string[]) => {
    const injected: number[] = [];
    (globalThis as unknown as { chrome: unknown }).chrome = {
        permissions: {
            contains: ({ origins }: { origins: string[] }) =>
                Promise.resolve(origins.every((origin) => granted.includes(origin))),
        },
        storage: { session: { get: () => Promise.resolve({}) } },
        scripting: {
            executeScript: ({ target }: { target: { tabId: number } }) => {
                injected.push(target.tabId);
                return Promise.resolve([]);
            },
        },
        tabs: { sendMessage: () => Promise.resolve([]) },
    };
    return injected;
};

const tabOn = (url: string): ActiveTab => ({ id: 7, url }) as ActiveTab;

beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("Given the popup opened over a tab", () => {
    describe("When the tab is on gitlab.com and the user has not allowed it", () => {
        test("Then I expect no modules and nothing injected", async () => {
            // Arrange
            const injected = stubChrome([]);

            // Act
            const modules = await readTabModulesAsync(
                tabOn("https://gitlab.com/group/repo/-/blob/main/main.tf"),
            );

            // Assert
            expect(modules).toEqual([]);
            expect<number[]>(injected).toEqual([]);
        });
    });

    describe("When the tab is on gitlab.com and the user has allowed it", () => {
        test("Then I expect the content script asked", async () => {
            // Arrange
            const injected = stubChrome(["https://gitlab.com/*"]);

            // Act
            await readTabModulesAsync(tabOn("https://gitlab.com/group/repo/-/blob/main/main.tf"));

            // Assert
            expect<number[]>(injected).toEqual([7]);
        });
    });

    describe("When the tab is on github.com", () => {
        test("Then I expect the content script asked without a grant", async () => {
            // Arrange
            const injected = stubChrome([]);

            // Act
            await readTabModulesAsync(tabOn("https://github.com/owner/repo/blob/main/main.tf"));

            // Assert
            expect<number[]>(injected).toEqual([7]);
        });
    });

    describe("When the tab is on a host the extension does not read", () => {
        test("Then I expect nothing injected", async () => {
            // Arrange
            const injected = stubChrome(["https://gitlab.com/*"]);

            // Act
            await readTabModulesAsync(tabOn("https://example.com/main.tf"));

            // Assert
            expect<number[]>(injected).toEqual([]);
        });
    });
});
