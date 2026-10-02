import { test, expect } from "../extension";
import { GITHUB, GITLAB } from "./BenchHost";
import { CallCounts } from "./CallCounts";
import { readFingerprint, scrollThrough, settle } from "./Harness";
import { record, recordFor } from "./Recorder";
import baseline from "./baseline.json";

const HOST = GITHUB;
const FIXTURE = HOST.fileUrl("benchmarks/scrolling/large.tf");

const DECLARATIONS = baseline.scrolling.fingerprint.declarations;

const SCROLL_STEPS = 5;

test("scrolling a long file resolves nothing it already resolved", async ({ context }) => {
    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    // Act
    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page, HOST);

    // Read off the stored entry: a call count off the async resolver is not a total.
    const cached = (await worker.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const entry = Object.values(all)[0] as { modules?: unknown[] } | undefined;
        return entry?.modules?.length ?? 0;
    })) as number;

    // Resets the counters, so what follows is what scrolling costs.
    await CallCounts.takeAsync(send);
    await scrollThrough(page, SCROLL_STEPS, HOST);

    const counts = await CallCounts.takeAsync(send);
    const injections = counts.callsTo("linkSources");
    const resolutions = counts.callsTo("buildDisplayModuleAsync");
    const fingerprint = await readFingerprint(page, HOST);
    console.log(
        `BENCH scrolling: ${cached} cached on render, then ${injections} injections and ${resolutions} resolver entries across ${SCROLL_STEPS} pauses`,
    );
    record("scrolling", {
        cachedOnRender: cached,
        counts: { injections, resolutions },
        fingerprint,
    });

    // Assert
    expect(cached).toBe(DECLARATIONS);

    // Zero is the one count a resumption cannot inflate.
    expect(resolutions).toBe(0);

    expect(injections).toBeGreaterThan(0);

    expect(fingerprint.lines).toBe(baseline.scrolling.fingerprint.lines);
    expect(fingerprint.bytes).toBe(baseline.scrolling.fingerprint.bytes);
});

test("a lost cache makes the next scroll pay for everything again", async ({ context }) => {
    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const send = (method: string, params?: Record<string, unknown>) =>
        cdp.send(method as never, params as never);
    await CallCounts.startAsync(send);

    const readEntry = async () =>
        (await worker.evaluate(async () => {
            const all = await chrome.storage.session.get(null);
            const [key, entry] = (Object.entries(all)[0] ?? [null, undefined]) as [
                string | null,
                { modules?: unknown[] } | undefined,
            ];
            return { key, modules: entry?.modules?.length ?? 0, bytes: JSON.stringify(all).length };
        })) as { key: string | null; modules: number; bytes: number };

    // Act
    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page, HOST);
    const onLoad = await readEntry();

    // Resets the counters, so what follows is what the lost cache causes.
    await CallCounts.takeAsync(send);
    await worker.evaluate(async () => await chrome.storage.session.clear());
    await scrollThrough(page, 1, HOST);

    const afterLoss = await readEntry();
    const entries = (await CallCounts.takeAsync(send)).callsTo("buildDisplayModuleAsync");
    console.log(
        `BENCH lost cache: ${onLoad.bytes}B under ${JSON.stringify(onLoad.key)}, ${onLoad.modules} modules, rebuilt to ${afterLoss.modules} after losing it`,
    );
    record("scrolling", { lostCacheRebuiltModules: afterLoss.modules });

    // Assert
    // One entry per file.
    expect(onLoad.modules).toBe(DECLARATIONS);

    expect(afterLoss.modules).toBe(DECLARATIONS);

    // The resolver rebuilt it; a stale entry did not reappear.
    expect(entries).toBeGreaterThan(0);
});

const MAX_GITLAB_STEPS = 40;

// GitLab scrolls inside its code panel, so the content script's scroll
// listener never fires there. The observer links each chunk GitLab renders.
test.describe(GITLAB.name, () => {
    test.use({ grantOptionalHosts: GITLAB.grantOptionalHosts });

    test("scrolling a long file links each chunk once and resolves nothing again", async ({
        context,
    }) => {
        // Arrange
        const worker = context.serviceWorkers()[0];
        await worker.evaluate(async () => await chrome.storage.session.clear());

        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        const send = (method: string, params?: Record<string, unknown>) =>
            cdp.send(method as never, params as never);
        await CallCounts.startAsync(send);

        // Act
        await page.goto(GITLAB.fileUrl("benchmarks/scrolling/large.tf"), {
            waitUntil: "domcontentloaded",
        });
        await settle(page, GITLAB);
        const fingerprint = await readFingerprint(page, GITLAB);

        // The modules the page cached, and how many of them have a link to place.
        const { cached, linkable } = (await worker.evaluate(async () => {
            const all = await chrome.storage.session.get(null);
            const entry = Object.values(all)[0] as
                | { modules?: { resolvedUrl: string | null; sourceLine: number | null }[] }
                | undefined;
            const modules = entry?.modules ?? [];
            return {
                cached: modules.length,
                linkable: modules.filter(
                    (module) => module.resolvedUrl !== null && module.sourceLine !== null,
                ).length,
            };
        })) as { cached: number; linkable: number };

        // Resets the counters, so what follows is what scrolling costs.
        await CallCounts.takeAsync(send);
        const lastLine = page.locator(`.line[id="LC${fingerprint.lines}"]`);
        let steps = 0;
        while (steps < MAX_GITLAB_STEPS && (await lastLine.count()) === 0) {
            await scrollThrough(page, 1, GITLAB);
            steps += 1;
        }

        const counts = await CallCounts.takeAsync(send);
        const observerRuns = counts.callsTo("renderedLines");
        const resolutions = counts.callsTo("buildDisplayModuleAsync");
        const anchors = await page.locator(GITLAB.anchor).count();
        console.log(
            `BENCH gitlab scrolling: ${cached} cached on render, ${steps} steps to the last line, ${observerRuns} observer runs, ${resolutions} resolver entries, ${anchors} of ${linkable} sources linked`,
        );
        recordFor(GITLAB, "scrolling", {
            cachedOnRender: cached,
            stepsToLastLine: steps,
            counts: { observerRuns, resolutions },
            anchors,
        });

        // Assert
        // The same file as GitHub's, so the same shape.
        expect(fingerprint.lines).toBe(baseline.scrolling.fingerprint.lines);
        expect(fingerprint.bytes).toBe(baseline.scrolling.fingerprint.bytes);
        expect(cached).toBe(DECLARATIONS);

        // Every chunk rendered.
        expect(await lastLine.count()).toBe(1);

        expect(resolutions).toBe(0);
        expect(observerRuns).toBeGreaterThan(0);

        // Exactly once: a chunk left unlinked reads low, one linked twice reads high.
        expect(anchors).toBe(linkable);
    });
});
