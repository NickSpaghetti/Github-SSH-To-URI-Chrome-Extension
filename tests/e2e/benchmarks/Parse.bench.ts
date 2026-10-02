import { test, expect, chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BrowserCdp } from "./BrowserCdp";
import { readFingerprint } from "./Harness";
import { BenchHost, GITHUB, GITLAB } from "./BenchHost";
import { grantOptionalHosts } from "../extension";
import { record, recordFor } from "./Recorder";
import baseline from "./baseline.json";

const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");
const DEBUG_PORT = 9339;
const WORK_MS = 12_000;

const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

const measureAsync = async (
    name: string,
    host: BenchHost = GITHUB,
): Promise<{ toFirstLinkMs: number; lines: number; bytes: number }> => {
    const extension = host.grantOptionalHosts ? grantOptionalHosts(DIST) : DIST;
    const context = await chromium.launchPersistentContext("", {
        executablePath: findBrowser(),
        headless: false,
        args: [
            `--disable-extensions-except=${extension}`,
            `--load-extension=${extension}`,
            `--remote-debugging-port=${DEBUG_PORT}`,
        ],
    });
    try {
        const cdp = await BrowserCdp.connectAsync(DEBUG_PORT);
        const worker = (await cdp.targetsAsync()).find((t) => t.type === "service_worker");
        if (worker === undefined) {
            throw new Error("the extension's service worker is not running");
        }
        const session = await cdp.attachAsync(worker.targetId);
        const send = (method: string, params?: Record<string, unknown>) =>
            cdp.sendAsync(method, params ?? {}, session);

        const page = await context.newPage();
        const started = Date.now();
        await page.goto(host.fileUrl(`benchmarks/parse/${name}`), {
            waitUntil: "domcontentloaded",
        });
        // What a user waits for: the first link appearing on the page.
        await page.waitForSelector(host.anchor, { timeout: WORK_MS }).catch(() => undefined);
        const toFirstLinkMs = Date.now() - started;
        await page.waitForTimeout(1_000);
        const fingerprint = await readFingerprint(page, host);

        cdp.close();
        return { toFirstLinkMs, ...fingerprint };
    } finally {
        await context.close();
    }
};

test("a four times larger file is not four times slower to show links", async () => {
    // Act
    const small = await measureAsync("small.tf");
    const large = await measureAsync("large.tf");
    const ratio = Math.round((large.toFirstLinkMs / Math.max(small.toFirstLinkMs, 1)) * 100) / 100;

    console.log(
        `BENCH parse small ${small.toFirstLinkMs}ms to first link, large ${large.toFirstLinkMs}ms, ratio ${ratio} against ${baseline.parse.sizeRatio} the bytes`,
    );
    record("parse", {
        smallLines: small.lines,
        largeLines: large.lines,
        smallBytes: small.bytes,
        largeBytes: large.bytes,
        smallToFirstLinkMs: small.toFirstLinkMs,
        largeToFirstLinkMs: large.toFirstLinkMs,
        latencyRatio: ratio,
    });

    // Assert
    // A grown fixture fails here, not against the wrong size ratio.
    expect(small.lines).toBe(baseline.parse.smallLines);
    expect(large.lines).toBe(baseline.parse.largeLines);

    // Four times the file must not be four times the wait.
    expect(ratio).toBeLessThan(baseline.parse.sizeRatio);
    expect(small.toFirstLinkMs).toBeLessThan(WORK_MS);
    expect(large.toFirstLinkMs).toBeLessThan(WORK_MS);
});

test("OpenTofu sources and versions do not make a larger file slower to show links", async () => {
    // Act
    const small = await measureAsync("small.tofu");
    const large = await measureAsync("large.tofu");
    const ratio = Math.round((large.toFirstLinkMs / Math.max(small.toFirstLinkMs, 1)) * 100) / 100;

    console.log(
        `BENCH parse tofu small ${small.toFirstLinkMs}ms to first link, large ${large.toFirstLinkMs}ms, ratio ${ratio} against ${baseline.parse.tofu.sizeRatio} the bytes`,
    );
    record("parse", {
        tofu: {
            smallLines: small.lines,
            largeLines: large.lines,
            smallBytes: small.bytes,
            largeBytes: large.bytes,
            smallToFirstLinkMs: small.toFirstLinkMs,
            largeToFirstLinkMs: large.toFirstLinkMs,
            latencyRatio: ratio,
        },
    });

    // Assert
    expect(small.lines).toBe(baseline.parse.tofu.smallLines);
    expect(large.lines).toBe(baseline.parse.tofu.largeLines);

    // Evaluating every source and version must not scale with the file either.
    expect(ratio).toBeLessThan(baseline.parse.tofu.sizeRatio);
    expect(small.toFirstLinkMs).toBeLessThan(WORK_MS);
    expect(large.toFirstLinkMs).toBeLessThan(WORK_MS);
});

// GitLab never holds the whole file on the page, so the wait includes fetching it.
test("on GitLab, a four times larger file is not four times slower to show links", async () => {
    // Act
    const small = await measureAsync("small.tf", GITLAB);
    const large = await measureAsync("large.tf", GITLAB);
    const ratio = Math.round((large.toFirstLinkMs / Math.max(small.toFirstLinkMs, 1)) * 100) / 100;

    console.log(
        `BENCH gitlab parse small ${small.toFirstLinkMs}ms to first link, large ${large.toFirstLinkMs}ms, ratio ${ratio} against ${baseline.parse.sizeRatio} the bytes`,
    );
    recordFor(GITLAB, "parse", {
        smallToFirstLinkMs: small.toFirstLinkMs,
        largeToFirstLinkMs: large.toFirstLinkMs,
        latencyRatio: ratio,
    });

    // Assert
    // The same files as GitHub's, so the same shape.
    expect(small.lines).toBe(baseline.parse.smallLines);
    expect(large.lines).toBe(baseline.parse.largeLines);
    expect(small.bytes).toBe(baseline.parse.smallBytes);
    expect(large.bytes).toBe(baseline.parse.largeBytes);

    expect(ratio).toBeLessThan(baseline.parse.sizeRatio);
    expect(small.toFirstLinkMs).toBeLessThan(WORK_MS);
    expect(large.toFirstLinkMs).toBeLessThan(WORK_MS);
});
