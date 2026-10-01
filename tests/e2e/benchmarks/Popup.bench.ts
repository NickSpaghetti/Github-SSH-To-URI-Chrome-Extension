import { test, expect, FIXTURES } from "../extension";
import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BrowserCdp } from "./BrowserCdp";
import { NetworkWatch } from "./NetworkWatch";
import { CallCounts } from "./CallCounts";
import { clearHttpCacheAsync, untilQuietAsync, waitForCachedModulesAsync } from "./Harness";
import { record } from "./Recorder";
import baseline from "./baseline.json";

const fixture = (name: string) => `${FIXTURES}/blob/main/benchmarks/resolution/${name}`;
const RESOLVE_TIMEOUT_MS = 90_000;
const RENDER_TIMEOUT_MS = 20_000;
/** The longest the cold popup is given, whether or not it has gone quiet. */
const POPUP_SETTLE_MS = 9_000;

/** No further registry request in this long means the popup has finished. */
const QUIET_MS = 1_500;
const LIST = "ul.ml-list";
const ROW = "ul.ml-list > li";
const CHROME_POPUP_MAX_WIDTH = 800;
const DEBUG_PORT = 9341;
const REGISTRY = "registry.terraform.io";
const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");

/**
 * The benchmark browser runs the readable build, so the bytes a user downloads
 * are read off the shipping build beside it. `make benchmark` produces both.
 */
const SHIPPED = path.resolve(__dirname, "../../..", "dist");

/**
 * A byte count off a fixed build is exact, so its gate is tight enough to
 * notice a dependency arriving. Re-record the baseline when one is meant to.
 */
const BUNDLE_CEILING = 1.1;

const WHITESPACE = ["\n", "\r", "\t"];

/**
 * Collapses every run of whitespace to one space, for a one line log.
 * @param text The text to flatten.
 * @returns The same text on one line, with no run of spaces left.
 */
const oneLine = (text: string): string =>
    WHITESPACE.reduce((flat, mark) => flat.split(mark).join(" "), text)
        .split(" ")
        .filter((word) => word !== "")
        .join(" ");

/** @returns The path to a full chromium build, which can load an extension. */
const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

/**
 * Reads what the popup's own page load cost, which is its bundle.
 * @param popup The page the popup was opened on.
 * @returns The milliseconds to dom content loaded and to load.
 */
const navigationTiming = async (popup: import("@playwright/test").Page) =>
    await popup.evaluate(() => {
        const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        return {
            domContentLoaded: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
            loadEnd: Math.round(entry.loadEventEnd - entry.startTime),
        };
    });

test("opening the popup on a warm cache resolves nothing", async ({ context, extensionId }) => {
    // Arrange
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    const page = await context.newPage();
    await clearHttpCacheAsync(page);
    await page.goto(fixture("small.tf"), { waitUntil: "domcontentloaded" });
    const worker = context.serviceWorkers()[0];
    expect(await waitForCachedModulesAsync(worker, RESOLVE_TIMEOUT_MS)).toBe(true);

    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    // Act
    const popup = await context.newPage();
    await popup.goto("about:blank");
    await page.bringToFront();
    const opened = Date.now();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    const toTable = Date.now() - opened;

    const timing = await navigationTiming(popup);
    const rows = await popup.locator(ROW).count();
    const shippedBundleBytes = fs.statSync(path.join(SHIPPED, "index.js")).size;
    console.log(
        `BENCH popup warm: list in ${toTable}ms, bundle dcl ${timing.domContentLoaded}ms load ${timing.loadEnd}ms, ${shippedBundleBytes}B shipped, ${rows} rows`,
    );
    record("popup", {
        warmToTableMs: toTable,
        bundleLoadMs: timing.loadEnd,
        shippedBundleBytes,
    });

    // Assert
    expect(shippedBundleBytes).toBeLessThan(baseline.popup.shippedBundleBytes * BUNDLE_CEILING);

    // Wall clock on whatever machine is running, so this catches a framework
    // sized regression and nothing finer. The byte count above is the sharp one.
    expect(toTable).toBeLessThan(baseline.popup.warmToTableMs * baseline.ceiling);

    // The cache is warm, so the popup reads it and renders. Nothing is
    // resolved again: counting started after the page had already finished.
    expect((await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync")).toBe(0);
});

/**
 * Counted at the network rather than with `CallCounts`, because the question
 * is a total and a call count off an async function is not one. That needs a
 * session on the worker, which playwright cannot open, so this launches its
 * own browser on a debugging port.
 */
test("opening the popup with no cache pays for the work again", async () => {
    // Arrange
    const context = await chromium.launchPersistentContext("", {
        executablePath: findBrowser(),
        headless: false,
        args: [
            `--disable-extensions-except=${DIST}`,
            `--load-extension=${DIST}`,
            `--remote-debugging-port=${DEBUG_PORT}`,
        ],
    });
    try {
        const cdp = await BrowserCdp.connectAsync(DEBUG_PORT);
        const worker = (await cdp.targetsAsync()).find((t) => t.type === "service_worker");
        if (worker === undefined) {
            throw new Error("the extension's service worker is not running");
        }
        const watch = await NetworkWatch.openAsync(cdp, await cdp.attachAsync(worker.targetId));
        const extensionId = worker.url.split("/")[2];

        const page = await context.newPage();
        await clearHttpCacheAsync(page);
        await page.goto(fixture("small.tf"), { waitUntil: "domcontentloaded" });
        expect(
            await waitForCachedModulesAsync(context.serviceWorkers()[0], RESOLVE_TIMEOUT_MS),
        ).toBe(true);
        const onLoad = watch.requestsTo(REGISTRY).length;

        // Act
        // A real popup does not take the active tab. Opening the extension
        // page in a foreground tab does, and the popup then asks about itself,
        // so the tab is parked and the file refocused.
        const popup = await context.newPage();
        await popup.goto("about:blank");
        await page.bringToFront();
        await context
            .serviceWorkers()[0]
            .evaluate(async () => await chrome.storage.session.clear());

        await popup.goto(`chrome-extension://${extensionId}/index.html`);
        await untilQuietAsync(() => watch.requestsTo(REGISTRY).length, QUIET_MS, POPUP_SETTLE_MS);

        // No duration is recorded here. Cold names the extension's own cache,
        // which the line above empties. Chrome's http cache still holds every
        // registry response the file page just fetched, so a time measured
        // here would be ten cache hits wearing the name of ten round trips.
        const onPopup = watch.requestsTo(REGISTRY).length - onLoad;
        const shown = oneLine((await popup.locator("body").innerText()).slice(0, 40));
        console.log(
            `BENCH popup cold: ${onLoad} registry requests on load, ${onPopup} more for the popup, popup shows ${JSON.stringify(shown)}`,
        );
        record("popup", { coldRequests: onPopup });

        // Assert
        // Exact, because it is counted where the requests happen. Opening the
        // popup with no cache reparses the file and resolves every module
        // again through the content script it injects.
        expect(onLoad).toBe(baseline.resolution.small.modules);
        expect(onPopup).toBe(baseline.resolution.small.modules);

        // What the popup then shows is a race: sometimes the rows, sometimes
        // "No Modules Found". Recorded, not asserted, because asserting
        // either outcome pins a race. The defect is queued for review.
        cdp.close();
    } finally {
        await context.close();
    }
});

test("every module is rendered and the popup stays inside chrome's width", async ({
    context,
    extensionId,
}) => {
    // Arrange
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    const page = await context.newPage();
    await clearHttpCacheAsync(page);
    await page.goto(fixture("large.tf"), { waitUntil: "domcontentloaded" });
    expect(await waitForCachedModulesAsync(context.serviceWorkers()[0], RESOLVE_TIMEOUT_MS)).toBe(
        true,
    );

    // Act
    const popup = await context.newPage();
    await popup.goto("about:blank");
    await page.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: RENDER_TIMEOUT_MS });

    const rendered = await popup.locator(ROW).count();
    const shape = await popup.evaluate((selector) => {
        const list = document.querySelector(selector)!;
        return {
            bodyWidth: document.body.getBoundingClientRect().width,
            scrolls: list.scrollHeight > list.clientHeight + 1,
        };
    }, LIST);

    console.log(
        `BENCH popup rows: ${rendered} rendered of ${baseline.resolution.large.modules}, body ${shape.bodyWidth}px, list scrolls ${shape.scrolls}`,
    );
    record("popup", { renderedRows: rendered, bodyWidth: shape.bodyWidth });

    // Assert
    // Pagination is gone, so every module is in the dom and the scroll
    // container is what keeps the popup a sensible height.
    expect(rendered).toBe(baseline.resolution.large.modules);
    expect(shape.scrolls).toBe(true);

    // What pagination used to protect. The list scrolls rather than widening.
    expect(shape.bodyWidth).toBeLessThanOrEqual(CHROME_POPUP_MAX_WIDTH);
});
