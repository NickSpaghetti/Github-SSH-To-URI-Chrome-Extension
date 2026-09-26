type Range = { count: number };
type Fn = { functionName: string; ranges: Range[] };
type Script = { url: string; functions: Fn[] };

/** Either Playwright's session or the browser level client. */
export type Send = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const EXTENSION = "chrome-extension://";

/**
 * Exact call counts, taken from V8 rather than from anything added to the
 * extension. `Profiler.startPreciseCoverage` with `callCount` instruments at
 * compile time, so nothing in `src` knows this is happening.
 */
export class CallCounts {
    private constructor(private readonly scripts: Script[]) {}

    /**
     * @param send a cdp session on the target to count in
     */
    public static async startAsync(send: Send): Promise<void> {
        await send("Profiler.enable");
        await send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    }

    /**
     * Resets the counters, so each take reports what happened since the last
     * one rather than since the start.
     * @param send the same session `startAsync` was given
     * @returns what the extension's own scripts did since the previous take
     */
    public static async takeAsync(send: Send): Promise<CallCounts> {
        const taken = (await send("Profiler.takePreciseCoverage")) as { result: Script[] };
        return new CallCounts(taken.result.filter((script) => script.url.includes(EXTENSION)));
    }

    /**
     * @param functionName the function as it is named in a readable build
     * @returns how many times it was entered, 0 when it never was
     */
    public callsTo(functionName: string): number {
        for (const script of this.scripts) {
            const fn = script.functions.find((entry) => entry.functionName === functionName);
            // The first range spans the whole function. Later ranges are
            // inner blocks, and a loop body's count is not a call count.
            if (fn !== undefined) {
                return fn.ranges[0]?.count ?? 0;
            }
        }
        return 0;
    }
}
