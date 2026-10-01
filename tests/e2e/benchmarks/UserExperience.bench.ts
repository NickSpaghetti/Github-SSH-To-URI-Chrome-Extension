import { test, expect } from "../extension";
import { GITHUB, GITLAB } from "./BenchHost";
import { scrollThrough, settle } from "./Harness";
import { recordFor } from "./Recorder";
import baseline from "./baseline.json";

type CpuNode = { callFrame: { functionName: string; url: string }; hitCount?: number };
type HeapNode = {
    callFrame: { functionName: string; url: string };
    selfSize: number;
    children: HeapNode[];
};

const EXTENSION = "chrome-extension://";
const SAMPLE_INTERVAL_US = 50;
const SCROLL_STEPS = 5;

/**
 * The sampling profiler is stochastic, so one reading is not a ceiling. The
 * cycle runs several times and the highest is what gets recorded.
 */
const CYCLES = 3;

/** Anything holding the main thread this long is a stall a user sees. */
const LONG_TASK_MS = 50;

/**
 * What a user feels is the main thread being held, not wall clock. An await
 * costs nothing: the injection path waits on a cross process storage read,
 * which is why its duration is two orders of magnitude above its cpu.
 */
for (const HOST of [GITHUB, GITLAB]) {
    test.describe(HOST.name, () => {
        test.use({ grantOptionalHosts: HOST.grantOptionalHosts });

        test("the extension is a rounding error on the page's cpu and allocations", async ({
            context,
        }) => {
            // Arrange
            await context
                .serviceWorkers()[0]
                .evaluate(async () => await chrome.storage.session.clear());
            const page = await context.newPage();
            const cdp = await context.newCDPSession(page);

            await page.addInitScript(() => {
                (globalThis as unknown as { __longTasks: number[] }).__longTasks = [];
                new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        (globalThis as unknown as { __longTasks: number[] }).__longTasks.push(
                            Math.round(entry.duration),
                        );
                    }
                }).observe({ entryTypes: ["longtask"] });
            });

            await page.goto(HOST.fileUrl("benchmarks/scrolling/large.tf"), {
                waitUntil: "domcontentloaded",
            });
            await settle(page, HOST);

            await cdp.send("Profiler.enable");
            await cdp.send("Profiler.setSamplingInterval", { interval: SAMPLE_INTERVAL_US });
            await cdp.send("HeapProfiler.enable");

            // Act
            const samples: {
                cpuShare: number;
                cpuMs: number;
                allocShare: number;
                allocKb: number;
            }[] = [];
            let totalCpuMs = 0;
            for (let cycle = 0; cycle < CYCLES; cycle += 1) {
                await cdp.send("HeapProfiler.startSampling", { samplingInterval: 4096 });
                await cdp.send("Profiler.start");

                await scrollThrough(page, SCROLL_STEPS, HOST);
                // A host that keeps what it rendered would make a cycle that
                // scrolls back over it measure nothing, so each cycle there
                // goes on to lines not rendered yet.
                if (!HOST.keepsRenderedLines) {
                    await HOST.scrollToTop(page);
                }

                const { profile } = await cdp.send("Profiler.stop");
                const { profile: heap } = await cdp.send("HeapProfiler.stopSampling");

                const nodes = profile.nodes as CpuNode[];
                const hitsOf = (only: (node: CpuNode) => boolean) =>
                    nodes.filter(only).reduce((sum, node) => sum + (node.hitCount ?? 0), 0);
                const totalHits = hitsOf(() => true);
                const ourHits = hitsOf((node) => node.callFrame.url.includes(EXTENSION));

                const flat: HeapNode[] = [];
                const walk = (node: HeapNode) => {
                    flat.push(node);
                    node.children?.forEach(walk);
                };
                walk(heap.head as HeapNode);
                const bytesOf = (only: (node: HeapNode) => boolean) =>
                    flat.filter(only).reduce((sum, node) => sum + node.selfSize, 0);
                const ourKb = bytesOf((node) => node.callFrame.url.includes(EXTENSION)) / 1024;
                const totalKb = bytesOf(() => true) / 1024;

                totalCpuMs += (totalHits * SAMPLE_INTERVAL_US) / 1000;
                samples.push({
                    cpuShare: (ourHits / totalHits) * 100,
                    cpuMs: (ourHits * SAMPLE_INTERVAL_US) / 1000,
                    allocShare: totalKb === 0 ? 0 : (ourKb / totalKb) * 100,
                    allocKb: ourKb,
                });
            }

            /**
             * Takes the highest reading of one measure across the cycles.
             * @param key The measure to read.
             * @returns Its highest value.
             */
            const peak = <K extends keyof (typeof samples)[number]>(key: K) =>
                Math.max(...samples.map((sample) => sample[key]));
            const cpuShare = peak("cpuShare");
            const ourCpuMs = peak("cpuMs");
            const allocShare = peak("allocShare");
            const ourKb = peak("allocKb");

            const longTasks = (await page.evaluate(
                () => (globalThis as unknown as { __longTasks: number[] }).__longTasks,
            )) as number[];

            console.log(
                `BENCH ux: peak of ${CYCLES} cycles, cpu ${ourCpuMs.toFixed(1)}ms of ${totalCpuMs.toFixed(0)}ms (${cpuShare.toFixed(2)}%), alloc ${ourKb.toFixed(0)}KB (${allocShare.toFixed(1)}%), long tasks ${longTasks.length} ${JSON.stringify(longTasks.slice(0, 6))}`,
            );

            recordFor(HOST, "userExperience", {
                cpuSharePercent: Number(cpuShare.toFixed(2)),
                cycles: CYCLES,
                allocSharePercent: Number(allocShare.toFixed(2)),
                allocKb: Number(ourKb.toFixed(1)),
                cpuMs: Number(ourCpuMs.toFixed(1)),
                longTasks: longTasks.length,
            });

            // Assert
            const expected =
                HOST === GITHUB ? baseline.userExperience : baseline.gitlab.userExperience;
            expect(cpuShare).toBeLessThan(expected.cpuSharePercent * baseline.ceiling);
            // Allocations are recorded and not gated. Both forms of the number were
            // tried as a ceiling and neither holds: the share moves with whatever
            // github allocated on that cycle, and the absolute has read 0.4KB and
            // 40KB on the same input, because at a 4096 byte sampling interval a few
            // kilobytes of our own allocation is mostly luck. A gate that flaky
            // trains people to ignore a red run.
            //
            // Cpu is what gates this axis, and it is the half a user feels.

            // The proof that no stall on this page is ours: the extension's whole cpu
            // cost across the scroll is below the threshold a single long task has to
            // cross. It cannot be responsible for one.
            expect(ourCpuMs).toBeLessThan(LONG_TASK_MS);
        });
    });
}
