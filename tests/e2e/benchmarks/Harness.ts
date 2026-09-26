import { Page } from "@playwright/test";

/** Longer than the content script's 100ms scroll debounce. */
const DEBOUNCE_MS = 400;

/** How long the first render, parse and resolution are given to finish. */
const FIRST_RENDER_MS = 10_000;

export const settle = async (page: Page): Promise<void> => {
    await page.waitForTimeout(FIRST_RENDER_MS);
};

/**
 * @param page the page to scroll
 * @param steps how many viewport heights to scroll, pausing past the debounce
 */
export const scrollThrough = async (page: Page, steps: number): Promise<void> => {
    for (let step = 0; step < steps; step += 1) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(DEBOUNCE_MS);
    }
};

/**
 * The fixtures live in another repository and can change without this one
 * knowing, which would leave every count and duration describing a different
 * file. Each axis records this and asserts it.
 * @param page the page to read from
 * @returns the shape of the file being measured
 */
export const readFingerprint = async (page: Page): Promise<{ lines: number; bytes: number }> =>
    await page.evaluate(() => {
        const area = document.getElementById(
            "read-only-cursor-text-area",
        ) as HTMLTextAreaElement | null;
        if (area === null) {
            return { lines: 0, bytes: 0 };
        }
        return {
            lines: area.value.split("\n").length,
            bytes: new TextEncoder().encode(area.value).length,
        };
    });

/**
 * The registry data access fetches with `force-cache`, so a module resolved
 * once is nearly free afterwards. Without this the benchmark measures
 * chrome's http cache rather than the cost of resolving.
 * @param page any page in the context whose cache should be emptied
 */
export const clearHttpCacheAsync = async (page: Page): Promise<void> => {
    const session = await page.context().newCDPSession(page);
    await session.send("Network.clearBrowserCache");
    await session.detach();
};

/**
 * The popup renders from the cache the content script writes, which lands
 * after parsing and after every module is resolved.
 * @param worker the extension's service worker
 * @param timeoutMs how long to allow
 * @returns whether the modules were cached in time
 */
export const waitForCachedModulesAsync = async (
    worker: import("@playwright/test").Worker,
    timeoutMs: number,
): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const cached = (await worker.evaluate(async () => {
            const stored = (await chrome.storage.local.get("MODULES")) as { MODULES?: unknown[] };
            return stored.MODULES?.length ?? 0;
        })) as number;
        if (cached > 0 || Date.now() >= deadline) {
            return cached > 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
};

export type Interval = { start: number; end: number };

/**
 * How many of these ran at once.
 *
 * Work taken one at a time never overlaps, so the answer is 1. Anything
 * concurrent answers higher. This is a count rather than a duration, so it
 * says nothing about how fast the machine is.
 * @param intervals when each recording started and ended
 * @returns the largest number running at the same moment
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
