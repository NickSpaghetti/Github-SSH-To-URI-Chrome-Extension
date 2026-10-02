import { test, expect, FIXTURES } from "../extension";
import { settle } from "./Harness";
import { GITHUB } from "./BenchHost";
import { record } from "./Recorder";
import { extensionRendererKb, tabRendererKbs } from "./WorkerMemory";
import * as path from "path";
import { MODULE_SOURCE_CORPUS } from "../../unit/fixtures/module-sources";

const FILES = [
    ...[...new Set(MODULE_SOURCE_CORPUS.map((row) => row.file))].sort(),
    "benchmarks/parse/small.tf",
    "benchmarks/parse/large.tf",
    "benchmarks/scrolling/large.tf",
    "benchmarks/resolution/small.tf",
    "benchmarks/resolution/large.tf",
];

const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");

test("every benchmark file open at once", async ({ context }) => {
    test.setTimeout(240_000);

    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());
    const extensionBeforeKb = extensionRendererKb(DIST);

    // Act
    const pages: import("@playwright/test").Page[] = [];
    const samples: { open: number; extensionKb: number; biggestTabKb: number; anchors: number }[] =
        [];
    for (const file of FILES) {
        const page = await context.newPage();
        await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        pages.push(page);

        let anchors = 0;
        for (const open of pages) {
            anchors += await open.locator(GITHUB.anchor).count();
        }
        samples.push({
            open: pages.length,
            extensionKb: extensionRendererKb(DIST),
            biggestTabKb: Math.max(...tabRendererKbs(DIST), 0),
            anchors,
        });
    }

    const stored = (await worker.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        return { keys: Object.keys(all).length, bytes: JSON.stringify(all).length };
    })) as { keys: number; bytes: number };
    const last = samples[samples.length - 1];

    for (const sample of samples) {
        console.log(
            `BENCH tabs ${String(sample.open).padStart(2)} open  worker ${String(Math.round(sample.extensionKb / 1024)).padStart(4)}MB  largest tab renderer ${String(Math.round(sample.biggestTabKb / 1024)).padStart(4)}MB  ${String(sample.anchors).padStart(3)} anchors live`,
        );
    }
    console.log(
        `BENCH tabs: ${FILES.length} open, worker ${Math.round(extensionBeforeKb / 1024)} to ${Math.round(last.extensionKb / 1024)}MB, ${last.anchors} anchors across all tabs, ${stored.keys} cached entries in ${stored.bytes}B`,
    );

    record("tabs", {
        open: FILES.length,
        cachedFiles: stored.keys,
        workerBeforeMb: Math.round(extensionBeforeKb / 1024),
        workerAfterMb: Math.round(last.extensionKb / 1024),
        anchorsLive: last.anchors,
        storedKeys: stored.keys,
        storedBytes: stored.bytes,
    });

    // Assert
    // One entry a file, not a tab.
    expect(stored.keys).toBeLessThanOrEqual(FILES.length);

    // Most cached: a page whose commit header has not hydrated in time caches nothing.
    expect(stored.keys).toBeGreaterThan(FILES.length / 2);

    // Not in every tab: every source in `10-oci.tf` and `14-security-cases.tf` is unlinkable.
    expect(last.anchors).toBeGreaterThan(0);

    // No tab was closed to make room.
    for (const page of pages) {
        expect(page.isClosed()).toBe(false);
    }
});
