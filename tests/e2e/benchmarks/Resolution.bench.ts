import { test, expect, chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BrowserCdp } from "./BrowserCdp";
import { NetworkWatch, Request } from "./NetworkWatch";
import { maxConcurrent, readFingerprint, untilQuietAsync } from "./Harness";
import { record } from "./Recorder";
import baseline from "./baseline.json";

const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");
const DEBUG_PORT = 9338;
const REGISTRY = "registry.terraform.io";
const FIXTURES = "https://github.com/NickSpaghetti/iac-module-linker-fixtures";
const fixture = (name: string) => `${FIXTURES}/blob/main/benchmarks/resolution/${name}`;
/** The longest resolution is given, whether or not it has gone quiet. */
const SETTLE_MS = 15_000;

/** No further request in this long means the last one has been seen. */
const QUIET_MS = 1_500;

/** @returns The path to a full chromium build, which can load an extension. */
const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

/**
 * Opens a fixture and records every registry request it caused.
 *
 * Nothing in the extension is instrumented for this. Registry lookups are
 * requests, so they are counted where they happen.
 * @param name The fixture file to open.
 * @returns The requests, the ones refused, the file's shape, and a close.
 */
const watchAsync = async (
    name: string,
): Promise<{
    requests: Request[];
    rejected: Request[];
    fingerprint: { lines: number; bytes: number };
    closeAsync: () => Promise<void>;
}> => {
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
    await untilQuietAsync(() => watch.requestsTo(REGISTRY).length, QUIET_MS, SETTLE_MS);

    return {
        requests: watch.requestsTo(REGISTRY),
        rejected: watch.rejectedBy(REGISTRY),
        fingerprint: await readFingerprint(page),
        // Awaited, or the next launch races the debugging port this one
        // still holds.
        closeAsync: async () => {
            cdp.close();
            await context.close();
        },
    };
};

test("registry lookups go out several at a time, bounded", async () => {
    // Act
    const { requests, rejected, fingerprint, closeAsync } = await watchAsync("large.tf");
    try {
        const concurrency = maxConcurrent(requests);
        const span = Math.round(
            Math.max(...requests.map((r) => r.end)) - Math.min(...requests.map((r) => r.start)),
        );
        console.log(
            `BENCH resolution large: ${requests.length} requests, concurrency ${concurrency}, span ${span}ms, non-200 ${rejected.length} ${JSON.stringify(rejected.map((r) => r.status))}`,
        );

        // Assert
        // The bound exists to stay under the registry's rate limit, so a
        // throttled response has to fail here rather than read as a fast run.
        expect(rejected).toHaveLength(0);
        record("resolution", { large: { modules: requests.length, spanMs: span }, concurrency });

        expect(requests.length).toBe(baseline.resolution.large.modules);

        // These fixtures live in another repository and `Popup.bench.ts` reads
        // them too. A change there would move every figure on both axes.
        expect(fingerprint).toEqual(baseline.resolution.large.fingerprint);

        // A count taken at the network, so neither CI hardware nor the
        // extension's own accounting enters into it.
        expect(concurrency).toBeGreaterThan(1);
        expect(concurrency).toBeLessThanOrEqual(baseline.resolution.concurrency);
    } finally {
        await closeAsync();
    }
});

test("resolution cost tracks module count", async () => {
    // Arrange
    /**
     * Measures one fixture. One browser at a time: two cannot bind the same
     * debugging port.
     * @param name The fixture file to open.
     * @returns Its request count, its shape, and how long the requests spanned.
     */
    const measure = async (name: string) => {
        const { requests, fingerprint, closeAsync } = await watchAsync(name);
        try {
            return {
                count: requests.length,
                fingerprint,
                span: Math.round(
                    Math.max(...requests.map((r) => r.end)) -
                        Math.min(...requests.map((r) => r.start)),
                ),
            };
        } finally {
            await closeAsync();
        }
    };

    // Act
    const small = await measure("small.tf");
    const large = await measure("large.tf");
    const ratio = Math.round((large.span / Math.max(small.span, 1)) * 100) / 100;

    console.log(
        `BENCH resolution small ${small.count} requests ${small.span}ms, large ${large.count} requests ${large.span}ms, ratio ${ratio}`,
    );
    record("resolution", {
        small: { modules: small.count, spanMs: small.span, fingerprint: small.fingerprint },
        large: { modules: large.count, spanMs: large.span, fingerprint: large.fingerprint },
    });

    // Assert
    expect(small.count).toBe(baseline.resolution.small.modules);
    expect(large.count).toBe(baseline.resolution.large.modules);
    expect(small.fingerprint).toEqual(baseline.resolution.small.fingerprint);
    expect(large.fingerprint).toEqual(baseline.resolution.large.fingerprint);
});

test("OpenTofu sources and versions resolve every registry module", async () => {
    // Arrange
    /**
     * Measures one fixture. One browser at a time: two cannot bind the same
     * debugging port.
     * @param name The fixture file to open.
     * @returns Its request count, its shape, and how long the requests spanned.
     */
    const measure = async (name: string) => {
        const { requests, fingerprint, closeAsync } = await watchAsync(name);
        try {
            return {
                count: requests.length,
                fingerprint,
                span: Math.round(
                    Math.max(...requests.map((r) => r.end)) -
                        Math.min(...requests.map((r) => r.start)),
                ),
            };
        } finally {
            await closeAsync();
        }
    };

    // Act
    const small = await measure("small.tofu");
    const large = await measure("large.tofu");

    console.log(
        `BENCH resolution tofu small ${small.count} requests ${small.span}ms, large ${large.count} requests ${large.span}ms`,
    );
    record("resolution", {
        tofu: {
            small: { modules: small.count, spanMs: small.span, fingerprint: small.fingerprint },
            large: { modules: large.count, spanMs: large.span, fingerprint: large.fingerprint },
        },
    });

    // Assert
    // The same modules as the .tf files. One whose source did not evaluate
    // would make no request, so a count short of theirs is a module lost.
    expect(small.count).toBe(baseline.resolution.small.modules);
    expect(large.count).toBe(baseline.resolution.large.modules);
    expect(small.fingerprint).toEqual(baseline.resolution.tofu.small.fingerprint);
    expect(large.fingerprint).toEqual(baseline.resolution.tofu.large.fingerprint);
});
