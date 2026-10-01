import { test, expect, FIXTURES } from "../extension";
import { CallCounts } from "./CallCounts";
import { readFingerprint, scrollThrough, settle } from "./Harness";
import { record } from "./Recorder";
import baseline from "./baseline.json";

const FIXTURE = `${FIXTURES}/blob/main/benchmarks/scrolling/large.tf`;

/** Every module block plus every entry in `required_providers`. */
const DECLARATIONS = baseline.scrolling.fingerprint.declarations;

/** Enough steps to bring the bottom of the fixture into view. */
const SCROLL_STEPS = 5;

test("scrolling a long file resolves nothing it already resolved", async ({ context }) => {
    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    // Act
    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page);

    // The total comes from what was stored rather than from a call count. V8
    // counts a resumption of an async function as another entry to it, so a
    // count off the resolver is not a total.
    const cached = (await worker.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const entry = Object.values(all)[0] as { modules?: unknown[] } | undefined;
        return entry?.modules?.length ?? 0;
    })) as number;

    // Resets the counters, so what follows is what scrolling costs rather
    // than what the first render cost.
    await CallCounts.takeAsync(send);
    await scrollThrough(page, SCROLL_STEPS);

    const counts = await CallCounts.takeAsync(send);
    const injections = counts.callsTo("linkSources");
    const resolutions = counts.callsTo("buildDisplayModuleAsync");
    const fingerprint = await readFingerprint(page);
    console.log(
        `BENCH scrolling: ${cached} cached on render, then ${injections} injections and ${resolutions} resolver entries across ${SCROLL_STEPS} pauses`,
    );
    record("scrolling", {
        cachedOnRender: cached,
        counts: { injections, resolutions },
        fingerprint,
    });

    // Assert
    // Every declaration resolved once, read off the entry the page wrote.
    expect(cached).toBe(DECLARATIONS);

    // The cache assertion. Scrolling causes no resolution at all, and zero is
    // the one thing a resumption cannot inflate.
    expect(resolutions).toBe(0);

    // Injection still has to be happening, or the rest measures nothing.
    expect(injections).toBeGreaterThan(0);

    // The fixture is in another repository and can grow without this one
    // knowing, which would leave the counts describing a different file.
    expect(fingerprint.lines).toBe(baseline.scrolling.fingerprint.lines);
    expect(fingerprint.bytes).toBe(baseline.scrolling.fingerprint.bytes);
});

test("a lost cache makes the next scroll pay for everything again", async ({ context }) => {
    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    /** @returns The one cache entry, its module count, and the store's size. */
    const readEntry = async () =>
        (await worker.evaluate(async () => {
            const all = await chrome.storage.session.get(null);
            const [key, entry] = (Object.entries(all)[0] ?? [null, undefined]) as [
                string | null,
                { modules?: unknown[] } | undefined,
            ];
            return { key, modules: entry?.modules?.length ?? 0, bytes: JSON.stringify(all).length };
        })) as { key: string | null; modules: number; bytes: number };

    // Act
    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page);
    const onLoad = await readEntry();

    // Resets the counters, so what follows is what the lost cache causes.
    await CallCounts.takeAsync(send);
    await worker.evaluate(async () => await chrome.storage.session.clear());
    await scrollThrough(page, 1);

    const afterLoss = await readEntry();
    const entries = (await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync");
    console.log(
        `BENCH lost cache: ${onLoad.bytes}B under ${JSON.stringify(onLoad.key)}, ${onLoad.modules} modules, rebuilt to ${afterLoss.modules} after losing it`,
    );
    record("scrolling", { lostCacheRebuiltModules: afterLoss.modules });

    // Assert
    // One entry per file, so browsing does not accumulate a history of every
    // file opened.
    expect(onLoad.modules).toBe(DECLARATIONS);

    // The whole file resolved again, read off the entry rather than counted.
    expect(afterLoss.modules).toBe(DECLARATIONS);

    // And it was the resolver that rebuilt it, not a stale entry reappearing.
    expect(entries).toBeGreaterThan(0);
});
