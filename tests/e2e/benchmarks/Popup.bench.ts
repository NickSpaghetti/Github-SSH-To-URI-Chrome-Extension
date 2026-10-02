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
const POPUP_SETTLE_MS = 9_000;

const QUIET_MS = 1_500;
const LIST = "ul.ml-list";
const ROW = "ul.ml-list > li";
const CHROME_POPUP_MAX_WIDTH = 800;
const DEBUG_PORT = 9341;
const REGISTRY = "registry.terraform.io";
const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");

// The browser runs the readable build; `make benchmark` builds the shipping one beside it.
const SHIPPED = path.resolve(__dirname, "../../..", "dist");

const BUNDLE_CEILING = 1.1;

const WHITESPACE = ["\n", "\r", "\t"];

const oneLine = (text: string): string =>
    WHITESPACE.reduce((flat, mark) => flat.split(mark).join(" "), text)
        .split(" ")
        .filter((word) => word !== "")
        .join(" ");

const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

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

    // Wall clock, so only a large regression shows here.
    expect(toTable).toBeLessThan(baseline.popup.warmToTableMs * baseline.ceiling);

    // The cache is warm, so nothing is resolved again.
    expect((await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync")).toBe(0);
});

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
        // A popup opened as a foreground tab would ask about itself, so the
        // file is brought back to the front first.
        const popup = await context.newPage();
        await popup.goto("about:blank");
        await page.bringToFront();
        await context
            .serviceWorkers()[0]
            .evaluate(async () => await chrome.storage.session.clear());

        await popup.goto(`chrome-extension://${extensionId}/index.html`);
        await untilQuietAsync(() => watch.requestsTo(REGISTRY).length, QUIET_MS, POPUP_SETTLE_MS);

        const onPopup = watch.requestsTo(REGISTRY).length - onLoad;
        const shown = oneLine((await popup.locator("body").innerText()).slice(0, 40));
        console.log(
            `BENCH popup cold: ${onLoad} registry requests on load, ${onPopup} more for the popup, popup shows ${JSON.stringify(shown)}`,
        );
        record("popup", { coldRequests: onPopup });

        // Assert
        // Every module resolved again, counted at the network.
        expect(onLoad).toBe(baseline.resolution.small.modules);
        expect(onPopup).toBe(baseline.resolution.small.modules);

        // Recorded, not asserted: whether the rows or "No Modules Found" show is a race.
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
    // Every module is in the DOM, and the list scrolls to keep the popup's height.
    expect(rendered).toBe(baseline.resolution.large.modules);
    expect(shape.scrolls).toBe(true);

    // The list scrolls instead of widening the popup.
    expect(shape.bodyWidth).toBeLessThanOrEqual(CHROME_POPUP_MAX_WIDTH);
});
