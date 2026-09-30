/**
 * A stand in for `chrome.runtime` in the unit suite. Only `sendMessage` is
 * modelled, because that is the whole surface the runtime services use.
 *
 * The responder decides what the callback receives. Returning `undefined` is
 * what the real api does when the background script goes away before it
 * answers, which is the case both services have to survive.
 */
export type RuntimeResponder = (message: unknown) => unknown;

/** What the stub recorded, so a test can assert on what was sent. */
export type RuntimeStub = { readonly sent: unknown[] };

type ChromeLike = {
    runtime: {
        sendMessage: (message: unknown, callback: (response: unknown) => void) => void;
        getURL: (path: string) => string;
    };
};

const globals = globalThis as unknown as { chrome?: ChromeLike };

/**
 * Installs the stand in on the global, replacing whatever is there.
 * @param respond Decides what the callback receives for each message sent.
 * @returns A record of every message the code under test sent.
 */
export const stubChromeRuntime = (respond: RuntimeResponder): RuntimeStub => {
    const sent: unknown[] = [];
    globals.chrome = {
        runtime: {
            sendMessage: (message, callback) => {
                sent.push(message);
                // The real callback never fires synchronously.
                queueMicrotask(() => callback(respond(message)));
            },
            getURL: (path) => `chrome-extension://stub/${path}`,
        },
    };
    return { sent: sent };
};

/** Removes the stand in, so the next suite does not inherit this one's. */
export const clearChromeRuntime = (): void => {
    delete globals.chrome;
};
