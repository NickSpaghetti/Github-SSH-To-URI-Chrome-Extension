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
const SETTLE_MS = 15_000;

const QUIET_MS = 1_500;

const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

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

// One browser at a time: two cannot bind the same debugging port.
const measureAsync = async (name: string) => {
    const { requests, fingerprint, closeAsync } = await watchAsync(name);
    try {
        return {
            count: requests.length,
            fingerprint,
            span: Math.round(
                Math.max(...requests.map((r) => r.end)) - Math.min(...requests.map((r) => r.start)),
            ),
        };
    } finally {
        await closeAsync();
    }
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
        // A throttled response fails here, not as a fast run.
        expect(rejected).toHaveLength(0);
        record("resolution", { large: { modules: requests.length, spanMs: span }, concurrency });

        expect(requests.length).toBe(baseline.resolution.large.modules);

        expect(fingerprint).toEqual(baseline.resolution.large.fingerprint);

        expect(concurrency).toBeGreaterThan(1);
        expect(concurrency).toBeLessThanOrEqual(baseline.resolution.concurrency);
    } finally {
        await closeAsync();
    }
});

test("resolution cost tracks module count", async () => {
    // Act
    const small = await measureAsync("small.tf");
    const large = await measureAsync("large.tf");
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
    // Act
    const small = await measureAsync("small.tofu");
    const large = await measureAsync("large.tofu");

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
    // The same modules as the .tf files; a source that did not evaluate makes no request.
    expect(small.count).toBe(baseline.resolution.small.modules);
    expect(large.count).toBe(baseline.resolution.large.modules);
    expect(small.fingerprint).toEqual(baseline.resolution.tofu.small.fingerprint);
    expect(large.fingerprint).toEqual(baseline.resolution.tofu.large.fingerprint);
});
