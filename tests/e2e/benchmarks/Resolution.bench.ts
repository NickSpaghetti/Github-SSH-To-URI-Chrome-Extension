import { test, expect, chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BrowserCdp } from "./BrowserCdp";
import { NetworkWatch, Request } from "./NetworkWatch";
import { maxConcurrent } from "./Harness";
import { record } from "./Recorder";
import baseline from "./baseline.json";

const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");
const DEBUG_PORT = 9338;
const REGISTRY = "registry.terraform.io";
const FIXTURES = "https://github.com/NickSpaghetti/iac-module-linker-fixtures";
const fixture = (name: string) => `${FIXTURES}/blob/main/benchmarks/resolution/${name}`;
const SETTLE_MS = 15_000;

const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

/**
 * Nothing in the extension is instrumented for this. Registry lookups are
 * requests, so they are counted where they happen.
 */
const watchAsync = async (
    name: string,
): Promise<{ requests: Request[]; closeAsync: () => Promise<void> }> => {
    const context = await chromium.launchPersistentContext("", {
        executablePath: findBrowser(),
        headless: false,
        args: [
            `--disable-extensions-except=${DIST}`,
            `--load-extension=${DIST}`,
            `--remote-debugging-port=${DEBUG_PORT}`,
        ],
    });
    const cdp = await BrowserCdp.connectAsync(DEBUG_PORT);
    const worker = (await cdp.targetsAsync()).find((target) => target.type === "service_worker");
    if (worker === undefined) {
        await context.close();
        throw new Error("the extension's service worker is not running");
    }
    const watch = await NetworkWatch.openAsync(cdp, await cdp.attachAsync(worker.targetId));

    const page = await context.newPage();
    await page.goto(fixture(name), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(SETTLE_MS);

    return {
        requests: watch.requestsTo(REGISTRY),
        // Awaited, or the next launch races the debugging port this one
        // still holds.
        closeAsync: async () => {
            cdp.close();
            await context.close();
        },
    };
};

test("registry lookups go out one at a time", async () => {
    const { requests, closeAsync } = await watchAsync("large.tf");
    try {
        const concurrency = maxConcurrent(requests);
        const span = Math.round(
            Math.max(...requests.map((r) => r.end)) - Math.min(...requests.map((r) => r.start)),
        );
        console.log(
            `BENCH resolution large: ${requests.length} requests, concurrency ${concurrency}, span ${span}ms`,
        );
        record("resolution", { large: { modules: requests.length, spanMs: span }, concurrency });

        expect(requests.length).toBe(baseline.resolution.large.modules);

        // A count taken at the network, so neither CI hardware nor the
        // extension's own accounting enters into it. One means serial, and
        // this is the assertion a concurrent resolver has to change.
        expect(concurrency).toBe(1);
    } finally {
        await closeAsync();
    }
});

test("resolution cost tracks module count", async () => {
    // One browser at a time: two cannot bind the same debugging port.
    const measure = async (name: string) => {
        const { requests, closeAsync } = await watchAsync(name);
        try {
            return {
                count: requests.length,
                span: Math.round(
                    Math.max(...requests.map((r) => r.end)) -
                        Math.min(...requests.map((r) => r.start)),
                ),
            };
        } finally {
            await closeAsync();
        }
    };

    const small = await measure("small.tf");
    const large = await measure("large.tf");
    const ratio = Math.round((large.span / Math.max(small.span, 1)) * 100) / 100;

    console.log(
        `BENCH resolution small ${small.count} requests ${small.span}ms, large ${large.count} requests ${large.span}ms, ratio ${ratio}`,
    );
    record("resolution", {
        small: { modules: small.count, spanMs: small.span },
        large: { modules: large.count, spanMs: large.span },
    });

    expect(small.count).toBe(baseline.resolution.small.modules);
    expect(large.count).toBe(baseline.resolution.large.modules);
});
