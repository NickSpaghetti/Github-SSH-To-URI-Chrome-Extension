type Range = { count: number };
type Fn = { functionName: string; ranges: Range[] };
type Script = { url: string; functions: Fn[] };

/** Sends a CDP command, through Playwright's session or the browser level client. */
export type Send = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const EXTENSION = "chrome-extension://";

/**
 * How many times the extension's functions are entered, read from V8's
 * precise coverage. A count for an async function includes every resumption
 * after an await, so it is not a call total.
 */
export class CallCounts {
    private constructor(private readonly scripts: Script[]) {}

    /**
     * Starts counting calls on a target.
     * @param send A CDP session on the target to count in.
     */
    public static async startAsync(send: Send): Promise<void> {
        await send("Profiler.enable");
        await send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    }

    /**
     * Returns the counts since the previous take, and resets them.
     * @param send The same session `startAsync` was given.
     * @returns What the extension's own scripts did since the previous take.
     */
    public static async takeAsync(send: Send): Promise<CallCounts> {
        const taken = (await send("Profiler.takePreciseCoverage")) as { result: Script[] };
        return new CallCounts(taken.result.filter((script) => script.url.includes(EXTENSION)));
    }

    /**
     * Returns how many times functions of a name were entered. Every function
     * of that name, in every one of the extension's scripts, counts toward the
     * total.
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
     * Returns how many separately compiled copies of a function V8 holds.
     * @param functionName The function as it is named in a readable build.
     * @returns The number of copies.
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
