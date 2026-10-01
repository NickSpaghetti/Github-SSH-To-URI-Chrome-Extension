type Range = { count: number };
type Fn = { functionName: string; ranges: Range[] };
type Script = { url: string; functions: Fn[] };

/** Either Playwright's session or the browser level client. */
export type Send = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const EXTENSION = "chrome-extension://";

/**
 * Call counts taken from V8 rather than from anything added to the extension.
 * `Profiler.startPreciseCoverage` with `callCount` instruments at compile
 * time, so nothing in `src` knows this is happening.
 *
 * Exact only for synchronous functions. V8 counts every resumption of an
 * async function as an entry to its top level range, so a function that
 * awaits reports roughly one plus the number of awaits it suspended on.
 * Measured: `buildDisplayModuleAsync` reads 20 for ten modules that made ten
 * requests, and `hydrateModulesAsync` reads 4 for one call.
 *
 * So an exact count of work needs a synchronous function, or the network, as
 * `Resolution.bench.ts` does. A count off an async function is a signal that
 * something ran and roughly how often, not a total.
 */
export class CallCounts {
    private constructor(private readonly scripts: Script[]) {}

    /**
     * @param send A cdp session on the target to count in.
     */
    public static async startAsync(send: Send): Promise<void> {
        await send("Profiler.enable");
        await send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    }

    /**
     * Resets the counters, so each take reports what happened since the last
     * one rather than since the start.
     * @param send The same session `startAsync` was given.
     * @returns What the extension's own scripts did since the previous take.
     */
    public static async takeAsync(send: Send): Promise<CallCounts> {
        const taken = (await send("Profiler.takePreciseCoverage")) as { result: Script[] };
        return new CallCounts(taken.result.filter((script) => script.url.includes(EXTENSION)));
    }

    /**
     * Summed over every function of that name, in every script declaring one.
     * A content script injected more than once into the same document is
     * several scripts to v8, and one script can declare the name more than
     * once: each page writer has a `linkSources`, and only one runs on a page.
     * Reading only the first of either reports part of the work as the total.
     * @param functionName The function as it is named in a readable build.
     * @returns How many times it was entered, 0 when it never was.
     */
    public callsTo(functionName: string): number {
        return this.declaring(functionName).reduce(
            // The first range spans the whole function. Later ranges are
            // inner blocks, and a loop body's count is not a call count.
            (total, fn) => total + (fn.ranges[0]?.count ?? 0),
            0,
        );
    }

    /**
     * @param functionName The function as it is named in a readable build.
     * @returns How many separately compiled copies of it v8 is holding.
     */
    public copiesOf(functionName: string): number {
        return this.declaring(functionName).length;
    }

    private declaring(functionName: string): Fn[] {
        return this.scripts.flatMap((script) =>
            script.functions.filter((entry) => entry.functionName === functionName),
        );
    }
}
