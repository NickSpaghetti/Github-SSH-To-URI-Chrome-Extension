import { Nullable } from "../types/Nullable";

/**
 * Reads until something is there, or the deadline passes.
 *
 * GitHub hydrates a blob page in pieces and on its own schedule, so more than
 * one thing this extension needs is absent for a moment after the script that
 * wants it has started. Each of those waits was its own loop.
 * @param read Called until it answers with something other than null.
 * @param timeoutMs How long to keep reading before giving up.
 * @param pollMs How long to wait between reads.
 * @returns The first non-null answer, or null if the deadline passed first.
 */
export const pollUntilAsync = async <T>(
    read: () => Nullable<T> | Promise<Nullable<T>>,
    timeoutMs: number,
    pollMs: number,
): Promise<Nullable<T>> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const answer = await read();
        if (answer !== null) {
            return answer;
        }
        if (Date.now() >= deadline) {
            return null;
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
};
