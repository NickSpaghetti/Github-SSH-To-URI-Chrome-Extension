import { test, expect } from "../extension";
import { GITHUB, GITLAB } from "./BenchHost";
import { CallCounts } from "./CallCounts";
import { settle, scrollThrough } from "./Harness";
import { record, recordFor } from "./Recorder";
import baseline from "./baseline.json";

const HOST = GITHUB;
const START = HOST.fileUrl("benchmarks/parse/small.tf");

/**
 * The synchronous step of an injection. `injectHyperLinksToPageAsync` wraps
 * it and awaits, and v8 counts a resumption as another entry, so counting the
 * wrapper would not give a number of injections.
 */
const INJECTOR = "linkSources";

/** Breadcrumb, directory, then a file. Each is a `tabs.onUpdated` completion. */
const SOFT_NAVIGATIONS = HOST.browseToLargeParse.length;

/**
 * Clicks the first visible match and waits for the soft navigation to land.
 * @param page The page to click on.
 * @param selector The link to click.
 */
const clickVisible = async (page: import("@playwright/test").Page, selector: string) => {
    await page.locator(`${selector}:visible`).first().click({ timeout: 20_000 });
    await page.waitForTimeout(3_500);
};

/**
 * `backgroundscript.ts` re-injects `contentscript.js` on every
 * `chrome.tabs.onUpdated` completion, and github navigates between files
 * without reloading the document, so a second set of listeners would be added
 * per file visited. The guard in `contentscript.ts` is what keeps this at one,
 * and it has to live on the isolated world's global: module scope is a fresh
 * binding on every injection.
 */
test("browsing between files does not multiply what a scroll pause costs", async ({ context }) => {
    // Arrange
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    // Act
    await page.goto(START, { waitUntil: "domcontentloaded" });
    await settle(page, HOST);
    // Survives a soft navigation, dies on a reload. If this is gone the test
    // measured four page loads rather than four injections into one document.
    await page.evaluate(() => ((globalThis as unknown as { s: string }).s = "same document"));
    await CallCounts.takeAsync(send);

    await scrollThrough(page, 1, HOST);
    const onFreshLoad = (await CallCounts.takeAsync(send)).callsTo(INJECTOR);

    for (const link of HOST.browseToLargeParse) {
        await clickVisible(page, link);
    }
    await page.waitForTimeout(3_000);

    const sameDocument = await page.evaluate(
        () => (globalThis as unknown as { s?: string }).s ?? "reloaded",
    );
    await CallCounts.takeAsync(send);
    await scrollThrough(page, 1, HOST);
    const afterBrowsing = (await CallCounts.takeAsync(send)).callsTo(INJECTOR);

    console.log(
        `BENCH soft nav: ${onFreshLoad} injection per pause on load, ${afterBrowsing} after ${SOFT_NAVIGATIONS} navigations, document ${sameDocument}`,
    );

    record("softNavigation", {
        navigations: SOFT_NAVIGATIONS,
        injectionsPerPauseOnLoad: onFreshLoad,
        injectionsPerPauseAfterBrowsing: afterBrowsing,
    });

    // Assert
    // Without this the test measures page loads rather than injections into
    // one document, and would pass for the wrong reason.
    expect(sameDocument).toBe("same document");

    expect(onFreshLoad).toBe(baseline.softNavigation.injectionsPerPauseOnLoad);

    // The assertion the guard exists for. Unguarded this was one listener per
    // file visited, so this read 4 after three navigations.
    expect(afterBrowsing).toBe(baseline.softNavigation.injectionsPerPauseAfterBrowsing);
});

// GitLab scrolls inside its code panel, so the content script's scroll
// listener never fires there. A second set of listeners shows on arrival
// instead, as a second answer to the background script's refresh.
test.describe(GITLAB.name, () => {
    test.use({ grantOptionalHosts: GITLAB.grantOptionalHosts });

    test("browsing between files links each file once on arrival", async ({ context }) => {
        // Arrange
        await context
            .serviceWorkers()[0]
            .evaluate(async () => await chrome.storage.session.clear());
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        const send = (method: string, params?: Record<string, unknown>) =>
            cdp.send(method as never, params as never);
        await CallCounts.startAsync(send);
        const [toLarge, ...before] = [...GITLAB.browseToLargeParse].reverse();

        // Act
        await page.goto(GITLAB.fileUrl("benchmarks/parse/small.tf"), {
            waitUntil: "domcontentloaded",
        });
        await settle(page, GITLAB);
        const onLoad = (await CallCounts.takeAsync(send)).callsTo(INJECTOR);
        await page.evaluate(() => ((globalThis as unknown as { s: string }).s = "same document"));

        for (const link of before.reverse()) {
            await clickVisible(page, link);
        }
        await CallCounts.takeAsync(send);
        await clickVisible(page, toLarge);
        await settle(page, GITLAB);
        const onArrival = (await CallCounts.takeAsync(send)).callsTo(INJECTOR);
        const anchors = await page.locator(GITLAB.anchor).count();
        const sameDocument = await page.evaluate(
            () => (globalThis as unknown as { s?: string }).s ?? "reloaded",
        );

        console.log(
            `BENCH gitlab soft nav: ${onLoad} link run on load, ${onArrival} on arriving after ${GITLAB.browseToLargeParse.length} navigations, ${anchors} anchors, document ${sameDocument}`,
        );
        recordFor(GITLAB, "softNavigation", {
            navigations: GITLAB.browseToLargeParse.length,
            linkRunsOnLoad: onLoad,
            linkRunsOnArrival: onArrival,
        });

        // Assert
        // One document throughout, or this measured page loads.
        expect(sameDocument).toBe("same document");
        expect(anchors).toBeGreaterThan(0);

        // One run per file; a second set of listeners makes it one per set.
        expect(onLoad).toBe(1);
        expect(onArrival).toBe(1);
    });
});
