import { test, expect, FIXTURES } from "../extension";
import { CallCounts } from "./CallCounts";
import { clearHttpCacheAsync, waitForCachedModulesAsync } from "./Harness";
import { record } from "./Recorder";
import baseline from "./baseline.json";

const fixture = (name: string) => `${FIXTURES}/blob/main/benchmarks/resolution/${name}`;
const RESOLVE_TIMEOUT_MS = 90_000;
const RENDER_TIMEOUT_MS = 20_000;
const POPUP_SETTLE_MS = 9_000;

/** What the popup's own page load cost, which is its bundle. */
const navigationTiming = async (popup: import("@playwright/test").Page) =>
    await popup.evaluate(() => {
        const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        return {
            domContentLoaded: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
            loadEnd: Math.round(entry.loadEventEnd - entry.startTime),
            transferred: Math.round(
                performance
                    .getEntriesByType("resource")
                    .reduce(
                        (total, r) => total + (r as PerformanceResourceTiming).encodedBodySize,
                        0,
                    ) / 1024,
            ),
        };
    });

test("opening the popup on a warm cache resolves nothing", async ({ context, extensionId }) => {
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());

    const page = await context.newPage();
    await clearHttpCacheAsync(page);
    await page.goto(fixture("small.tf"), { waitUntil: "domcontentloaded" });
    const worker = context.serviceWorkers()[0];
    expect(await waitForCachedModulesAsync(worker, RESOLVE_TIMEOUT_MS)).toBe(true);

    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    const popup = await context.newPage();
    const opened = Date.now();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    const toTable = Date.now() - opened;

    const timing = await navigationTiming(popup);
    const rows = await popup.locator("tbody tr").count();
    console.log(
        `BENCH popup warm: table in ${toTable}ms, bundle dcl ${timing.domContentLoaded}ms load ${timing.loadEnd}ms, ${timing.transferred}KB transferred, ${rows} rows`,
    );
    record("popup", {
        warmToTableMs: toTable,
        bundleLoadMs: timing.loadEnd,
        bundleKb: timing.transferred,
    });

    // The cache is warm, so the popup reads it and renders. Nothing is
    // resolved again: counting started after the page had already finished.
    expect((await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync")).toBe(0);
});

test("opening the popup with no cache pays for the work again", async ({
    context,
    extensionId,
}) => {
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());

    const page = await context.newPage();
    await clearHttpCacheAsync(page);
    await page.goto(fixture("small.tf"), { waitUntil: "domcontentloaded" });
    const worker = context.serviceWorkers()[0];
    expect(await waitForCachedModulesAsync(worker, RESOLVE_TIMEOUT_MS)).toBe(true);

    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);
    await CallCounts.takeAsync(send);

    // A real popup does not take the active tab. Opening the extension page
    // in a foreground tab does, and `queryChromeTab` then finds the popup
    // itself rather than the file, so the tab is parked and refocused.
    const popup = await context.newPage();
    await popup.goto("about:blank");
    await page.bringToFront();

    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());

    const opened = Date.now();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await popup.waitForTimeout(POPUP_SETTLE_MS);
    const elapsed = Date.now() - opened;

    const resolved = (await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync");
    const shown = (await popup.locator("body").innerText()).slice(0, 40).replace(/\s+/g, " ");
    console.log(
        `BENCH popup cold: ${elapsed}ms, resolutions ${resolved}, popup shows ${JSON.stringify(shown)}`,
    );
    record("popup", { coldMs: elapsed, coldResolutions: resolved });

    // The cost is real: opening the popup with no cache reparses the file and
    // resolves every module again, through the content script it injects.
    // Every declaration again, and sometimes twice over, when the popup's
    // request and the content script's own run overlap.
    expect(resolved).toBeGreaterThanOrEqual(baseline.resolution.small.modules);

    // What the popup then shows is a race: sometimes the rows, sometimes
    // "No Modules Found". Recorded, not asserted, because asserting either
    // outcome pins a race. The defect is queued for review.
});

test("the popup renders a bounded number of rows until asked for all", async ({
    context,
    extensionId,
}) => {
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());

    const page = await context.newPage();
    await clearHttpCacheAsync(page);
    await page.goto(fixture("large.tf"), { waitUntil: "domcontentloaded" });
    expect(await waitForCachedModulesAsync(context.serviceWorkers()[0], RESOLVE_TIMEOUT_MS)).toBe(
        true,
    );

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: RENDER_TIMEOUT_MS });

    const paged = await popup.locator("tbody tr").count();
    await popup.selectOption("select", "-1");
    await popup.waitForTimeout(500);
    const all = await popup.locator("tbody tr").count();

    console.log(`BENCH popup rows: ${paged} paged, ${all} with all selected`);
    record("popup", { pagedRows: paged, allRows: all });

    // Pagination is what keeps the render bounded regardless of module count.
    expect(paged).toBeLessThanOrEqual(baseline.popup.rowsPerPage);
    expect(all).toBeGreaterThan(paged);
});
