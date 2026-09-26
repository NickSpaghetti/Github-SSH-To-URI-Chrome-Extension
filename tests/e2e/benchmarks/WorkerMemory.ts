import * as fs from "fs";

/**
 * Resident memory of the process hosting the extension's service worker.
 *
 * The js heap is not the number that matters. The parser is a Go wasm module
 * whose linear memory sits outside the heap, so `Runtime.getHeapUsage`
 * reports under a megabyte while the process holds tens.
 *
 * Linux only: it reads `/proc`. CI runs ubuntu.
 */
export const residentKb = (pid: number): number => {
    try {
        const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
        const line = status.split("\n").find((entry) => entry.startsWith("VmRSS:"));
        return line === undefined ? 0 : Number(line.replace(/[^0-9]/g, ""));
    } catch {
        return 0;
    }
};

const commandLine = (pid: number): string => {
    try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
    } catch {
        return "";
    }
};

/**
 * Chrome tags the renderer hosting an extension in its own command line, so
 * the process can be found without touching the browser.
 *
 * An earlier version had the worker allocate a slab and looked for the
 * process that grew by it. That understates the result by about a third:
 * freeing the slab leaves the allocator holding mapped pages, and the wasm
 * allocation reuses them without RSS growing.
 * @returns pids of every renderer hosting an extension
 */
export const extensionRendererPids = (): number[] =>
    fs
        .readdirSync("/proc")
        .filter((entry) => /^\d+$/.test(entry))
        .map(Number)
        .filter((pid) => {
            const command = commandLine(pid);
            return /--type=renderer/.test(command) && /--extension-process/.test(command);
        });

/**
 * @param before resident kilobytes per pid, taken before the work
 * @param after resident kilobytes per pid, taken after
 * @returns the extension renderer that grew most, or null when none did
 */
export const grewMost = (
    before: Map<number, number>,
    after: Map<number, number>,
): { pid: number; wasKb: number; nowKb: number; deltaKb: number } | null => {
    const [grown] = [...after.entries()]
        .filter(([pid]) => before.has(pid))
        .map(([pid, nowKb]) => ({
            pid,
            wasKb: before.get(pid) ?? 0,
            nowKb,
            deltaKb: nowKb - (before.get(pid) ?? 0),
        }))
        .sort((first, second) => second.deltaKb - first.deltaKb);
    return grown === undefined || grown.deltaKb <= 0 ? null : grown;
};

/** @returns resident kilobytes for every extension renderer */
export const residentByExtensionPid = (): Map<number, number> =>
    new Map(extensionRendererPids().map((pid) => [pid, residentKb(pid)]));
