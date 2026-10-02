import { Page } from "@playwright/test";
import { BenchHost, Fingerprint, GITHUB } from "./BenchHost";

// Both are past the content script's 100ms scroll debounce.
const DEBOUNCE_MS = 400;
const TAIL_MS = 500;

const FIRST_RENDER_MS = 10_000;
const POLL_MS = 100;

/**
 * Waits for the first link the extension injects, then past the scroll
 * debounce. A page with nothing to link waits the full deadline.
 * @param page The page to wait on.
 * @param host The host the page is on.
 */
export const settle = async (page: Page, host: BenchHost = GITHUB): Promise<void> => {
    await page
        .locator(host.anchor)
        .first()
        .waitFor({ state: "attached", timeout: FIRST_RENDER_MS })
        .catch(() => undefined);
    await page.waitForTimeout(TAIL_MS);
};

/**
 * Waits for a running count to stop moving.
 * @param count Reads the tally so far.
 * @param quietMs How long the tally must hold still to count as finished.
 * @param deadlineMs How long to wait in total, whether it settles or not.
 * @returns The tally as it stood when the wait ended.
 */
export const untilQuietAsync = async (
    count: () => number,
    quietMs: number,
    deadlineMs: number,
): Promise<number> => {
    const deadline = Date.now() + deadlineMs;
    let last = -1;
    let unchangedSince = Date.now();
    for (;;) {
        const now = count();
        if (now !== last) {
            last = now;
            unchangedSince = Date.now();
        }
        if ((now > 0 && Date.now() - unchangedSince >= quietMs) || Date.now() >= deadline) {
            return now;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
};

/**
 * Scrolls the code down one viewport at a time, pausing past the scroll debounce after each.
 * @param page The page to scroll.
 * @param steps How many viewports to scroll.
 * @param host The host the page is on.
 */
export const scrollThrough = async (
    page: Page,
    steps: number,
    host: BenchHost = GITHUB,
): Promise<void> => {
    for (let step = 0; step < steps; step += 1) {
        await host.scrollStep(page);
        await page.waitForTimeout(DEBOUNCE_MS);
    }
};

/**
 * Reads the shape of the file a page shows.
 * @param page The page to read from.
 * @param host The host the page is on.
 * @returns The shape of the file being measured.
 */
export const readFingerprint = async (page: Page, host: BenchHost = GITHUB): Promise<Fingerprint> =>
    await host.fingerprint(page);

/**
 * Empties the browser's HTTP cache.
 * @param page Any page in the context whose cache should be emptied.
 */
export const clearHttpCacheAsync = async (page: Page): Promise<void> => {
    const session = await page.context().newCDPSession(page);
    await session.send("Network.clearBrowserCache");
    await session.detach();
};

/**
 * Waits for the content script to cache a page's modules.
 * @param worker The extension's service worker.
 * @param timeoutMs How long to allow.
 * @returns true if the modules were cached in time; otherwise, false.
 */
export const waitForCachedModulesAsync = async (
    worker: import("@playwright/test").Worker,
    timeoutMs: number,
): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const cached = (await worker.evaluate(async () => {
            const all = await chrome.storage.session.get(null);
            const entry = Object.values(all)[0] as { modules?: unknown[] } | undefined;
            return entry?.modules?.length ?? 0;
        })) as number;
        if (cached > 0 || Date.now() >= deadline) {
            return cached > 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
};

/** When a piece of work started and ended. */
export type Interval = { start: number; end: number };

/**
 * Returns the largest number of intervals that overlap at one moment.
 * @param intervals When each piece of work started and ended.
 * @returns The largest number running at the same moment.
 */
export const maxConcurrent = (intervals: Interval[]): number => {
    const edges = intervals
        .flatMap((interval) => [
            { at: interval.start, change: 1 },
            { at: interval.end, change: -1 },
        ])
        .sort((first, second) => first.at - second.at || first.change - second.change);

    let running = 0;
    let peak = 0;
    for (const edge of edges) {
        running += edge.change;
        peak = Math.max(peak, running);
    }
    return peak;
};
