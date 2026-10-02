import { test, expect, FIXTURES } from "../extension";
import { settle } from "./Harness";
import { CachedModules } from "../../../src/types/CachedModules";
import { SourceTypes } from "../../../src/types/SourceTypes";

const FIXTURE = `${FIXTURES}/blob/main/benchmarks/scrolling/large.tf`;

const FILLER: CachedModules = {
    sha: "49e180c0aa11bb22cc33dd44ee55ff6677889900",
    modules: Array.from({ length: 16 }, () => ({
        source: "terraform-aws-modules/vpc/aws",
        moduleName: "some_module_name",
        sourceType: SourceTypes.registry,
        resolvedUrl: "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3",
        versionConstraint: ">= 6.0, < 7.0",
        resolvedVersion: "6.7.3",
        sourceLine: 120,
        sourceColumn: null,
        writtenSource: "terraform-aws-modules/vpc/aws",
    })),
};

// `SourceTypes` is undefined inside `worker.evaluate`, so the entry is built
// here and passed in.
const fillToCeilingAsync = async (
    worker: import("@playwright/test").Worker,
    filler: CachedModules,
) =>
    (await worker.evaluate(async (entry) => {
        let written = 0;
        for (let i = 0; i < 5000; i += 1) {
            try {
                // Under the cache's own prefix, the one a reset clears.
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

    // Fewer keys than were written, so the reset made the room.
    expect(stored.keys).toBeLessThan(filled);
});
