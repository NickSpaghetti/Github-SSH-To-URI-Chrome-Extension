import { test, expect, FIXTURES } from "../extension";
import { settle } from "./Harness";
import { CachedModules } from "../../../src/types/CachedModules";
import { SourceTypes } from "../../../src/types/SourceTypes";

const FIXTURE = `${FIXTURES}/blob/main/benchmarks/scrolling/large.tf`;

/**
 * A filler entry, typed as the thing the extension writes so the compiler
 * keeps it in step. A hand shaped literal would drift the day `DisplayModule`
 * gains a field, and the ceiling this fills to would stop being the ceiling
 * real use meets.
 */
const FILLER: CachedModules = {
    sha: "49e180c0aa11bb22cc33dd44ee55ff6677889900",
    lastCommitDateTimeISO: "2026-01-01T00:00:00.000Z",
    modules: Array.from({ length: 16 }, () => ({
        source: "terraform-aws-modules/vpc/aws",
        moduleName: "some_module_name",
        sourceType: SourceTypes.registry,
        resolvedUrl: "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3",
        versionConstraint: ">= 6.0, < 7.0",
        resolvedVersion: "6.7.3",
    })),
};

/**
 * Fills session storage until it refuses, so the next real write meets a full
 * quota.
 *
 * The entry is passed in rather than built in the page: `SourceTypes` is an
 * enum, so a reference to it inside the evaluated function would be undefined
 * in the browser.
 * @param worker The extension's service worker.
 * @param filler The entry to write repeatedly.
 * @returns How many entries were accepted before one was refused.
 */
const fillToCeilingAsync = async (
    worker: import("@playwright/test").Worker,
    filler: CachedModules,
) =>
    (await worker.evaluate(async (entry) => {
        let written = 0;
        for (let i = 0; i < 5000; i += 1) {
            try {
                // Prefixed, because in use it is this cache's own entries that
                // fill the quota, and only those are reset.
                await chrome.storage.session.set({
                    [`modules:filler.invalid:/pad/${i}.tf`]: entry,
                });
                written += 1;
            } catch {
                return written;
            }
        }
        return written;
    }, filler)) as number;

/**
 * The assertions are that a write attempted at the ceiling succeeds, and that
 * the reset is what made room. Entry count staying under a cap would also
 * pass on an empty cache, which is what a broken cache looks like.
 */
test("a page browsed after the cache fills is still cached", async ({ context }) => {
    // Arrange
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());
    const filled = await fillToCeilingAsync(worker, FILLER);

    // Act
    const page = await context.newPage();
    await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
    await settle(page);

    const stored = (await worker.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const mine = Object.keys(all).filter((key) => key.includes("iac-module-linker-fixtures"));
        return { keys: Object.keys(all).length, mine: mine.length };
    })) as { keys: number; mine: number };

    console.log(
        `BENCH cache ceiling: filled with ${filled} entries, then the page ${stored.mine === 1 ? "was" : "was NOT"} cached (${stored.keys} keys held)`,
    );

    // Assert
    expect(filled).toBeGreaterThan(100);
    expect(stored.mine).toBe(1);

    // The reset is the mechanism. Without this the test also passes if the
    // write merely happened to fit while eviction quietly stopped working.
    expect(stored.keys).toBeLessThan(filled);
});
