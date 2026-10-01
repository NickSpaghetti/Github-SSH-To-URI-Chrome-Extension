import { Page } from "@playwright/test";

/** Longer than the content script's 100ms scroll debounce. */
const DEBOUNCE_MS = 400;

/** How long the first render, parse and resolution are given to finish. */
const FIRST_RENDER_MS = 10_000;

/** Past the scroll debounce, so nothing the first render began is in flight. */
const TAIL_MS = 500;

/** How often a wait re-reads what it is waiting on. */
const POLL_MS = 100;

/** The id `contentscript.ts` gives every anchor it injects. */
const INJECTED = 'a[id^="GithubTerraformSourceUrl-"]';

/**
 * Waits for the extension to finish the work a page load costs it.
 *
 * An injected anchor is the end of the whole pipeline: the page parsed, its
 * sources resolved, and the links written. Waiting for one costs what the
 * page costs on the machine running it. A page with nothing to link waits the
 * full deadline, which is what this did for every page before.
 * @param page The page to wait on.
 */
export const settle = async (page: Page): Promise<void> => {
    await page
        .locator(INJECTED)
        .first()
        .waitFor({ state: "attached", timeout: FIRST_RENDER_MS })
        .catch(() => undefined);
    await page.waitForTimeout(TAIL_MS);
};

/**
 * Waits for a running count to stop moving.
 *
 * A benchmark that counts requests has to know they have all arrived, and the
 * only evidence of the last one is that no further one followed it.
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
 * @param page The page to scroll.
 * @param steps How many viewport heights to scroll, pausing past the debounce.
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
 * @param page The page to read from.
 * @returns The shape of the file being measured.
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
 * @param page Any page in the context whose cache should be emptied.
 */
export const clearHttpCacheAsync = async (page: Page): Promise<void> => {
    const session = await page.context().newCDPSession(page);
    await session.send("Network.clearBrowserCache");
    await session.detach();
};

/**
 * The popup renders from the cache the content script writes, which lands
 * after parsing and after every module is resolved.
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

export type Interval = { start: number; end: number };

/**
 * How many of these ran at once.
 *
 * Work taken one at a time never overlaps, so the answer is 1. Anything
 * concurrent answers higher. This is a count rather than a duration, so it
 * says nothing about how fast the machine is.
 * @param intervals When each recording started and ended.
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
