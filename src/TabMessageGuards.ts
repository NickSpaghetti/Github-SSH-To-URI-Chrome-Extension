import { GITHUB_HOST } from "./util/Constants";
import { SENDERS } from "./types/TabMessage";
import { Nullable } from "./types/Nullable";

type Sender = (typeof SENDERS)[keyof typeof SENDERS];

/**
 * Decides whether the content script should act on a runtime message. Both
 * senders name themselves, so nothing is inferred from the shape.
 * @param message the runtime message
 * @returns true for a refresh, or for a popup request naming a github tab
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
 * @param message a runtime message
 * @returns whether the background script sent it, which means refresh
 */
export const isBackgroundRefresh = (message: unknown): boolean =>
    readSender(message) === SENDERS.BACKGROUND;

/**
 * @param message a runtime message, of any shape
 * @returns the tab url it names, or null when it names none
 */
export const readTabUrl = (message: unknown): Nullable<string> => {
    const tabUrl = readField(message, "tabUrl");
    return typeof tabUrl === "string" ? tabUrl : null;
};

/**
 * @param tabUrl the url the popup says it is asking about
 * @returns whether its host is github.com exactly, not a lookalike
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
