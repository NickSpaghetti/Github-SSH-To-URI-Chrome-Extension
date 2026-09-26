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

test("scrolling a long file resolves its modules once", async ({ context }) => {
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await CallCounts.startAsync((method, params) => cdp.send(method as never, params as never));

    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page);
    await scrollThrough(page, SCROLL_STEPS);

    const counts = await CallCounts.takeAsync((method, params) =>
        cdp.send(method as never, params as never),
    );
    const injections = counts.callsTo("injectHyperLinksToPageAsync");
    const resolutions = counts.callsTo("buildDisplayModuleAsync");
    const fingerprint = await readFingerprint(page);
    console.log(`BENCH scrolling: injections ${injections}, resolutions ${resolutions}`);
    record("scrolling", { counts: { injections, resolutions }, fingerprint });

    // Every count the harness reads must be real. Zero means the name moved
    // and the benchmark is measuring nothing, which reads like a pass.
    expect(injections).toBeGreaterThan(0);

    // The cache assertion. Each declaration is resolved once for the whole
    // scroll, not once per pause.
    expect(resolutions).toBe(DECLARATIONS);

    // One injection per scroll pause, plus the one on first render. Ranged
    // because injection is debounce driven and a loaded machine can coalesce
    // two pauses or fire an extra. The upper bound is the one that matters.
    expect(injections).toBeGreaterThanOrEqual(SCROLL_STEPS);
    expect(injections).toBeLessThanOrEqual(SCROLL_STEPS + 2);

    // The fixture is in another repository and can grow without this one
    // knowing, which would leave the counts describing a different file.
    expect(fingerprint.lines).toBe(baseline.scrolling.fingerprint.lines);
    expect(fingerprint.bytes).toBe(baseline.scrolling.fingerprint.bytes);
});

test("a lost cache makes the next scroll pay for everything again", async ({ context }) => {
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.local.clear());

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page);
    // Taking the counts resets them, so this both reads the first round and
    // starts a fresh window for what the lost cache causes.
    const firstRound = (await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync");
    expect(firstRound).toBe(DECLARATIONS);

    // Stands in for tabbing away. `contentscript.ts` empties the cache on
    // visibilitychange, and the harness cannot hide a tab: the content script
    // runs in an isolated world, so an override of `document.hidden` in the
    // page is not visible to it.
    await worker.evaluate(async () => await chrome.storage.local.clear());
    await scrollThrough(page, 1);

    const afterLoss = (await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync");
    console.log(
        `BENCH lost cache: ${firstRound} resolutions on load, ${afterLoss} more after losing it`,
    );
    record("scrolling", { lostCacheResolutions: afterLoss });

    // Every declaration resolved a second time. This documents the cost of
    // the visibilitychange defect and should drop to zero when it is fixed.
    expect(afterLoss).toBe(DECLARATIONS);
});
