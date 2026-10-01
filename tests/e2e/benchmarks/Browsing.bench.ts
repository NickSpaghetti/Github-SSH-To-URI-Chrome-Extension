import { test, expect, FIXTURES } from "../extension";
import { settle } from "./Harness";
import { record } from "./Recorder";
import { extensionRendererKb } from "./WorkerMemory";
import * as path from "path";
import { MODULE_SOURCE_CORPUS } from "../../unit/fixtures/module-sources";

type CpuNode = { callFrame: { functionName: string; url: string }; hitCount?: number };

const EXTENSION = "chrome-extension://";
const SAMPLE_INTERVAL_US = 50;
const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");

/** Every file the fixture repository holds, from the corpus that covers it. */
const FILES = [...new Set(MODULE_SOURCE_CORPUS.map((row) => row.file))].sort();

/**
 * One process, never a sum. Chrome shares large mappings between renderers, so
 * adding resident across them counts the shared pages once each.
 * @returns Resident kilobytes of the extension's own renderer.
 */
const residentKb = (): number => extensionRendererKb(DIST);

/**
 * Measures what the extension holds after browsing every file in the fixtures.
 *
 * Every other memory and cpu axis opens one file, so nothing said whether
 * resident memory is flat, steps once on the wasm load, or climbs per file.
 *
 * Each file is navigated to by url. That is what exercises the injection path:
 * the worker injects on `chrome.tabs.onUpdated` reaching `complete`, which a
 * navigation produces whether a reader clicked or a url was opened. Driving it
 * by clicking put github's own routing inside the cpu figure and measured
 * nothing extra. The same document case, where module scope survives and the
 * listener guard has to hold, is `SoftNavigation.bench.ts`.
 *
 * Recorded and not gated. The shape has to be known before a ceiling means
 * anything.
 */
test("browsing the whole fixture repository", async ({ context }) => {
    test.setTimeout(300_000);

    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    const readStored = async () =>
        (await worker.evaluate(async () => {
            const all = await chrome.storage.session.get(null);
            return { keys: Object.keys(all).length, bytes: JSON.stringify(all).length };
        })) as { keys: number; bytes: number };

    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: SAMPLE_INTERVAL_US });
    await cdp.send("Profiler.start");

    const baseKb = residentKb();
    const samples: { file: string; residentKb: number; keys: number; bytes: number }[] = [];

    // Act
    for (const file of FILES) {
        await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        const stored = await readStored();
        samples.push({ file, residentKb: residentKb(), ...stored });
    }

    const { profile } = await cdp.send("Profiler.stop");
    const nodes = profile.nodes as CpuNode[];
    const hits = (only: (node: CpuNode) => boolean) =>
        nodes.filter(only).reduce((sum, node) => sum + (node.hitCount ?? 0), 0);
    const ourCpuMs = (hits((n) => n.callFrame.url.includes(EXTENSION)) * SAMPLE_INTERVAL_US) / 1000;
    const totalCpuMs = (hits(() => true) * SAMPLE_INTERVAL_US) / 1000;

    const last = samples[samples.length - 1];
    const residents = samples.map((sample) => Math.round(sample.residentKb / 1024));

    for (const sample of samples) {
        console.log(
            `BENCH browsing ${sample.file.padEnd(26)} resident ${String(Math.round(sample.residentKb / 1024)).padStart(4)}MB  ${String(sample.keys).padStart(2)} keys  ${String(sample.bytes).padStart(6)}B stored`,
        );
    }
    console.log(
        `BENCH browsing: ${FILES.length} files, ${last.keys} cached, resident ${Math.round(baseKb / 1024)}MB before, ${Math.min(...residents)} to ${Math.max(...residents)}MB during, ${residents[residents.length - 1]}MB after, ${last.bytes}B stored (${Math.round(last.bytes / last.keys)}B an entry), cpu ${ourCpuMs.toFixed(1)}ms of ${totalCpuMs.toFixed(0)}ms (${((ourCpuMs / totalCpuMs) * 100).toFixed(2)}%)`,
    );

    // No growth rate is recorded. Resident is not monotonic across a browse:
    // the worker is killed and restarted, so the figure tracks process
    // lifecycle and a slope drawn through it would describe that, not the cache.
    record("browsing", {
        files: FILES.length,
        cachedFiles: last.keys,
        residentBeforeMb: Math.round(baseKb / 1024),
        residentLowMb: Math.min(...residents),
        residentHighMb: Math.max(...residents),
        residentAfterMb: residents[residents.length - 1],
        storedBytes: last.bytes,
        storedBytesPerEntry: Math.round(last.bytes / last.keys),
        cpuMs: Number(ourCpuMs.toFixed(1)),
        cpuSharePercent: Number(((ourCpuMs / totalCpuMs) * 100).toFixed(2)),
    });

    // Assert
    // One entry a file, so browsing leaves no duplicates behind.
    expect(last.keys).toBeLessThanOrEqual(FILES.length);

    // And nearly all of them cached. Polling for the commit identity took the
    // miss rate from about one file in seven to under two in a hundred, but
    // not to zero: a page whose header never arrives at all still caches
    // nothing. Asserting every file would flap about one run in five.
    // `cachedFiles` records the rate instead.
    expect(last.keys).toBeGreaterThan(FILES.length - 2);
});
