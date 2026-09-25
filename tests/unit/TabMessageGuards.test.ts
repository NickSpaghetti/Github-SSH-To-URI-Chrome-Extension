import { expect } from "@jest/globals";
import {
    shouldHandleMessage,
    isBackgroundRefresh,
    readTabUrl,
    isGithubTabUrl,
} from "../../src/TabMessageGuards";
import { SENDERS } from "../../src/types/TabMessage";
import { Nullable } from "../../src/types/Nullable";

const fromPopup = (tabUrl: string) => ({ sender: SENDERS.POPUP, tabId: 1, tabUrl: tabUrl });

describe("Given a runtime message", () => {
    describe("When the background asks for a refresh", () => {
        test("Then I expect it handled, because it carries no tab", () => {
            expect<boolean>(shouldHandleMessage({ sender: SENDERS.BACKGROUND })).toBe(true);
        });
    });

    describe("When the popup names a GitHub tab", () => {
        test("Then I expect it handled", () => {
            expect<boolean>(
                shouldHandleMessage(fromPopup("https://github.com/owner/repo/blob/main/main.tf")),
            ).toBe(true);
        });
    });

    describe("When the popup names a tab on another host", () => {
        test("Then I expect it rejected", () => {
            expect<boolean>(shouldHandleMessage(fromPopup("https://evil.com/owner/repo"))).toBe(
                false,
            );
            expect<boolean>(shouldHandleMessage(fromPopup("https://gitlab.com/owner/repo"))).toBe(
                false,
            );
        });
    });

    describe("When the host only looks like GitHub", () => {
        test("Then I expect it rejected", () => {
            expect<boolean>(shouldHandleMessage(fromPopup("https://github.com.evil.com/x"))).toBe(
                false,
            );
            expect<boolean>(shouldHandleMessage(fromPopup("https://notgithub.com/x"))).toBe(false);
        });
    });

    describe("When the tab url is empty or malformed", () => {
        test("Then I expect it rejected", () => {
            expect<boolean>(shouldHandleMessage(fromPopup(""))).toBe(false);
            expect<boolean>(shouldHandleMessage(fromPopup("not a url"))).toBe(false);
        });
    });

    describe("When no sender is named", () => {
        test("Then I expect it rejected, even carrying a GitHub tab url", () => {
            expect<boolean>(shouldHandleMessage({ tabUrl: "https://github.com/owner/repo" })).toBe(
                false,
            );
        });

        test("Then I expect the bare sentinel no longer accepted", () => {
            expect<boolean>(shouldHandleMessage(SENDERS.BACKGROUND)).toBe(false);
        });
    });

    describe("When the sender is not one this extension sends", () => {
        test("Then I expect it rejected", () => {
            expect<boolean>(
                shouldHandleMessage({ sender: "someone-else", tabUrl: "https://github.com/x" }),
            ).toBe(false);
            expect<boolean>(
                shouldHandleMessage({ sender: 42, tabUrl: "https://github.com/x" }),
            ).toBe(false);
        });
    });

    describe("When the message is null or undefined", () => {
        test("Then I expect it rejected rather than throwing", () => {
            expect<boolean>(shouldHandleMessage(null)).toBe(false);
            expect<boolean>(shouldHandleMessage(undefined)).toBe(false);
        });
    });

    describe("When the message is an object with no tabUrl", () => {
        test("Then I expect it rejected", () => {
            expect<boolean>(shouldHandleMessage({})).toBe(false);
            expect<boolean>(shouldHandleMessage({ sender: SENDERS.POPUP, tabUrl: 42 })).toBe(false);
        });
    });
});

describe("Given a message to tell a refresh from a request", () => {
    describe("When the background sent it", () => {
        test("Then I expect a refresh", () => {
            expect<boolean>(isBackgroundRefresh({ sender: SENDERS.BACKGROUND })).toBe(true);
        });
    });

    describe("When the popup sent it", () => {
        test("Then I expect not a refresh", () => {
            expect<boolean>(isBackgroundRefresh(fromPopup("https://github.com/x"))).toBe(false);
            expect<boolean>(isBackgroundRefresh(SENDERS.BACKGROUND)).toBe(false);
        });
    });
});

describe("Given a message to read a tab url from", () => {
    describe("When the message is not an object", () => {
        test("Then I expect null", () => {
            expect<Nullable<string>>(readTabUrl(null)).toBeNull();
            expect<Nullable<string>>(readTabUrl("background")).toBeNull();
        });
    });

    describe("When the message carries a string tabUrl", () => {
        test("Then I expect that string", () => {
            expect<Nullable<string>>(readTabUrl(fromPopup("https://github.com/x"))).toBe(
                "https://github.com/x",
            );
        });
    });
});

describe("Given a tab url to check the host of", () => {
    describe("When the url is not parseable", () => {
        test("Then I expect false rather than a throw", () => {
            expect<boolean>(isGithubTabUrl("")).toBe(false);
            expect<boolean>(isGithubTabUrl("javascript:alert(1)")).toBe(false);
        });
    });
});
