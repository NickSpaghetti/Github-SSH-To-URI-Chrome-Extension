import { expect } from "@jest/globals";
import {
    shouldHandleMessage,
    isBackgroundRefresh,
    readTabUrl,
    isGithubTabUrl,
} from "../../src/TabMessageGuards";
import { SENDERS } from "../../src/types/TabMessage";
import { Nullable } from "../../src/types/Nullable";

/**
 * Builds a message shaped the way the popup sends one.
 * @param tabUrl The tab the popup is asking about.
 * @returns A message from the popup naming that tab.
 */
const fromPopup = (tabUrl: string) => ({ sender: SENDERS.POPUP, tabId: 1, tabUrl: tabUrl });

describe("Given a runtime message", () => {
    describe("When the background asks for a refresh", () => {
        test("Then I expect it handled, because it carries no tab", () => {
            // Arrange
            const message = { sender: SENDERS.BACKGROUND };

            // Act
            const handled = shouldHandleMessage(message);

            // Assert
            expect<boolean>(handled).toBe(true);
        });
    });

    describe("When the popup names a GitHub tab", () => {
        test("Then I expect it handled", () => {
            // Arrange
            const message = fromPopup("https://github.com/owner/repo/blob/main/main.tf");

            // Act
            const handled = shouldHandleMessage(message);

            // Assert
            expect<boolean>(handled).toBe(true);
        });
    });

    describe("When the popup names a tab on another host", () => {
        test("Then I expect it rejected", () => {
            // Arrange
            const tabUrls = ["https://evil.com/owner/repo", "https://gitlab.com/owner/repo"];

            // Act
            const handled = tabUrls.map((tabUrl) => shouldHandleMessage(fromPopup(tabUrl)));

            // Assert
            expect<boolean[]>(handled).toEqual(tabUrls.map(() => false));
        });
    });

    describe("When the host only looks like GitHub", () => {
        test("Then I expect it rejected", () => {
            // Arrange
            const tabUrls = ["https://github.com.evil.com/x", "https://notgithub.com/x"];

            // Act
            const handled = tabUrls.map((tabUrl) => shouldHandleMessage(fromPopup(tabUrl)));

            // Assert
            expect<boolean[]>(handled).toEqual(tabUrls.map(() => false));
        });
    });

    describe("When the tab url is empty or malformed", () => {
        test("Then I expect it rejected", () => {
            // Arrange
            const tabUrls = ["", "not a url"];

            // Act
            const handled = tabUrls.map((tabUrl) => shouldHandleMessage(fromPopup(tabUrl)));

            // Assert
            expect<boolean[]>(handled).toEqual(tabUrls.map(() => false));
        });
    });

    describe("When no sender is named", () => {
        test("Then I expect it rejected, even carrying a GitHub tab url", () => {
            // Arrange
            const message = { tabUrl: "https://github.com/owner/repo" };

            // Act
            const handled = shouldHandleMessage(message);

            // Assert
            expect<boolean>(handled).toBe(false);
        });

        test("Then I expect the bare sentinel no longer accepted", () => {
            // Act
            const handled = shouldHandleMessage(SENDERS.BACKGROUND);

            // Assert
            expect<boolean>(handled).toBe(false);
        });
    });

    describe("When the sender is not one this extension sends", () => {
        test("Then I expect it rejected", () => {
            // Arrange
            const senders: unknown[] = ["someone-else", 42];

            // Act
            const handled = senders.map((sender) =>
                shouldHandleMessage({ sender, tabUrl: "https://github.com/x" }),
            );

            // Assert
            expect<boolean[]>(handled).toEqual(senders.map(() => false));
        });
    });

    describe("When the message is null or undefined", () => {
        test("Then I expect it rejected rather than throwing", () => {
            // Arrange
            const messages = [null, undefined];

            // Act
            const handled = messages.map(shouldHandleMessage);

            // Assert
            expect<boolean[]>(handled).toEqual(messages.map(() => false));
        });
    });

    describe("When the message is an object with no tabUrl", () => {
        test("Then I expect it rejected", () => {
            // Arrange
            const messages = [{}, { sender: SENDERS.POPUP, tabUrl: 42 }];

            // Act
            const handled = messages.map(shouldHandleMessage);

            // Assert
            expect<boolean[]>(handled).toEqual(messages.map(() => false));
        });
    });
});

describe("Given a message to tell a refresh from a request", () => {
    describe("When the background sent it", () => {
        test("Then I expect a refresh", () => {
            // Arrange
            const message = { sender: SENDERS.BACKGROUND };

            // Act
            const refresh = isBackgroundRefresh(message);

            // Assert
            expect<boolean>(refresh).toBe(true);
        });
    });

    describe("When the popup sent it", () => {
        test("Then I expect not a refresh", () => {
            // Arrange
            const messages = [fromPopup("https://github.com/x"), SENDERS.BACKGROUND];

            // Act
            const refresh = messages.map(isBackgroundRefresh);

            // Assert
            expect<boolean[]>(refresh).toEqual(messages.map(() => false));
        });
    });
});

describe("Given a message to read a tab url from", () => {
    describe("When the message is not an object", () => {
        test("Then I expect null", () => {
            // Arrange
            const messages = [null, "background"];

            // Act
            const read = messages.map(readTabUrl);

            // Assert
            expect<Nullable<string>[]>(read).toEqual(messages.map(() => null));
        });
    });

    describe("When the message carries a string tabUrl", () => {
        test("Then I expect that string", () => {
            // Arrange
            const message = fromPopup("https://github.com/x");

            // Act
            const read = readTabUrl(message);

            // Assert
            expect<Nullable<string>>(read).toBe("https://github.com/x");
        });
    });
});

describe("Given a tab url to check the host of", () => {
    describe("When the url is not parseable", () => {
        test("Then I expect false rather than a throw", () => {
            // Arrange
            const tabUrls = ["", "javascript:alert(1)"];

            // Act
            const github = tabUrls.map(isGithubTabUrl);

            // Assert
            expect<boolean[]>(github).toEqual(tabUrls.map(() => false));
        });
    });
});
