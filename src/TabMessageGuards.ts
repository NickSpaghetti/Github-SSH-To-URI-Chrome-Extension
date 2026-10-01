import { GITHUB_HOST } from "./util/Constants";
import { SENDERS } from "./types/TabMessage";
import { Nullable } from "./types/Nullable";

type Sender = (typeof SENDERS)[keyof typeof SENDERS];

/**
 * Decides whether the content script should act on a runtime message. Both
 * senders name themselves, so nothing is inferred from the shape.
 * @returns true for a refresh, or for a popup request naming a github tab.
 */
export const shouldHandleMessage = (message: unknown): boolean => {
    const sender = readSender(message);
    if (sender === SENDERS.BACKGROUND) {
        return true;
    }
    if (sender !== SENDERS.POPUP) {
        return false;
    }
    const tabUrl = readTabUrl(message);
    return tabUrl !== null && isGithubTabUrl(tabUrl);
};

/**
 * Determines whether the background script sent a message.
 * @returns true if it did, which means refresh; otherwise, false.
 */
export const isBackgroundRefresh = (message: unknown): boolean =>
    readSender(message) === SENDERS.BACKGROUND;

/**
 * Reads the tab url a message names.
 * @returns The tab url, or null when the message names none.
 */
export const readTabUrl = (message: unknown): Nullable<string> => {
    const tabUrl = readField(message, "tabUrl");
    return typeof tabUrl === "string" ? tabUrl : null;
};

/**
 * @param tabUrl The url the popup says it is asking about.
 * @returns true if its host is github.com exactly and not a lookalike; otherwise, false.
 */
export const isGithubTabUrl = (tabUrl: string): boolean => {
    try {
        return new URL(tabUrl).hostname === GITHUB_HOST;
    } catch {
        return false;
    }
};

/** "" rather than null: no sender and an unknown sender are handled alike. */
const readSender = (message: unknown): Sender | "" => {
    const sender = readField(message, "sender");
    return sender === SENDERS.BACKGROUND || sender === SENDERS.POPUP ? sender : "";
};

const readField = (message: unknown, field: string): unknown =>
    typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)[field]
        : undefined;
