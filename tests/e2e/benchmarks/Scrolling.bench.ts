import { test, expect } from "../extension";
import { GITHUB, GITLAB } from "./BenchHost";
import { CallCounts } from "./CallCounts";
import { readFingerprint, scrollThrough, settle } from "./Harness";
import { record, recordFor } from "./Recorder";
import baseline from "./baseline.json";

const HOST = GITHUB;
const FIXTURE = HOST.fileUrl("benchmarks/scrolling/large.tf");

/** Every module block plus every entry in `required_providers`. */
const DECLARATIONS = baseline.scrolling.fingerprint.declarations;

/** Enough steps to bring the bottom of the fixture into view. */
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

    // The total comes from what was stored rather than from a call count. V8
    // counts a resumption of an async function as another entry to it, so a
    // count off the resolver is not a total.
    const cached = (await worker.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const entry = Object.values(all)[0] as { modules?: unknown[] } | undefined;
        return entry?.modules?.length ?? 0;
    })) as number;

    // Resets the counters, so what follows is what scrolling costs rather
    // than what the first render cost.
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
    // Every declaration resolved once, read off the entry the page wrote.
    expect(cached).toBe(DECLARATIONS);

    // The cache assertion. Scrolling causes no resolution at all, and zero is
    // the one thing a resumption cannot inflate.
    expect(resolutions).toBe(0);

    // Injection still has to be happening, or the rest measures nothing.
    expect(injections).toBeGreaterThan(0);

    // The fixture is in another repository and can grow without this one
    // knowing, which would leave the counts describing a different file.
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

    /** @returns The one cache entry, its module count, and the store's size. */
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
    // One entry per file, so browsing does not accumulate a history of every
    // file opened.
    expect(onLoad.modules).toBe(DECLARATIONS);

    // The whole file resolved again, read off the entry rather than counted.
    expect(afterLoss.modules).toBe(DECLARATIONS);

    // And it was the resolver that rebuilt it, not a stale entry reappearing.
    expect(entries).toBeGreaterThan(0);
});

/** Scroll steps a GitLab run may take to bring the file's last line into view. */
const MAX_GITLAB_STEPS = 40;

/**
 * GitLab renders the file in chunks as they scroll into view and never
 * removes one, and its scroll stays inside its code panel, so the content
 * script's scroll listener never fires there. The observer is what links each
 * new chunk, from the links already made, and that is what this measures.
 */
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

        // Every chunk rendered, or the rest measured part of the file.
        expect(await lastLine.count()).toBe(1);

        // Scrolling resolves nothing; the observer links from what it has.
        expect(resolutions).toBe(0);
        expect(observerRuns).toBeGreaterThan(0);

        // Each source with a link is linked exactly once: a chunk left
        // unlinked reads low, a chunk linked twice reads high.
        expect(anchors).toBe(linkable);
    });
});
