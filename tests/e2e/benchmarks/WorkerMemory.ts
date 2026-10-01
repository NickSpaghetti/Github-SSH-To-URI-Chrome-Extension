import * as fs from "fs";

const DIGITS = "0123456789";

/**
 * Reports whether every character is a digit.
 * @param text The text to check.
 * @returns true if text is one or more digits and nothing else; otherwise, false.
 */
const isDigits = (text: string): boolean =>
    text !== "" && [...text].every((character) => DIGITS.includes(character));

/**
 * Reads the first run of digits out of a line.
 *
 * A `/proc/<pid>/status` line reads `VmRSS:\t   12345 kB`, so the number is
 * the only field that is digits alone.
 * @param line The line to read.
 * @returns That number, or 0 where the line carries none.
 */
const firstNumber = (line: string): number => {
    const field = line
        .split("\t")
        .join(" ")
        .split(" ")
        .find((part) => isDigits(part));
    return field === undefined ? 0 : Number(field);
};

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
        return line === undefined ? 0 : firstNumber(line);
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
 * @param pid The process to read.
 * @returns Its parent's pid, or 0 where it could not be read.
 */
const parentOf = (pid: number): number => {
    try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        // The comm field can hold spaces and brackets, so read past the last one.
        const after = stat
            .slice(stat.lastIndexOf(")") + 1)
            .trim()
            .split(" ");
        return Number(after[1]);
    } catch {
        return 0;
    }
};

/** @returns Every pid on the machine whose command line matches. */
const pidsMatching = (wanted: (command: string) => boolean): number[] =>
    fs
        .readdirSync("/proc")
        .filter((entry) => isDigits(entry))
        .map(Number)
        .filter((pid) => wanted(commandLine(pid)));

/**
 * Finds the renderers belonging to a browser this suite launched.
 *
 * A developer's own Chrome is running while these benchmarks are, and it is
 * very likely loading an unpacked extension of its own, so `--load-extension`
 * alone matches it too. The build path does not. The browser process is the
 * one carrying that path and no `--type=`, and every process it owns descends
 * from it.
 * @param distPath The build this suite loaded, as an absolute path.
 * @returns The pid of every renderer under a browser running that build.
 */
export const ourRendererPids = (distPath: string): number[] => {
    const browsers = pidsMatching(
        (command) =>
            command.includes(`--load-extension=${distPath}`) && !command.includes("--type="),
    );
    if (browsers.length === 0) {
        return [];
    }
    const descends = (pid: number): boolean => {
        for (let at = pid, hops = 0; at > 1 && hops < 8; at = parentOf(at), hops += 1) {
            if (browsers.includes(at)) {
                return true;
            }
        }
        return false;
    };
    return pidsMatching((command) => command.includes("--type=renderer")).filter(descends);
};

/**
 * Chrome shares large mappings between renderers, so resident kilobytes do
 * not add up across processes: a sum counts the shared pages once per process
 * and lands several times the real figure. Read one process, or read the same
 * process twice and take the difference.
 * @param distPath The build this suite loaded, as an absolute path.
 * @returns Resident kilobytes of the extension's own renderer, 0 if it is gone.
 */
export const extensionRendererKb = (distPath: string): number => {
    const [pid] = ourRendererPids(distPath).filter((candidate) =>
        commandLine(candidate).includes("--extension-process"),
    );
    return pid === undefined ? 0 : residentKb(pid);
};

/**
 * @param distPath The build this suite loaded, as an absolute path.
 * @returns Resident kilobytes of each renderer that is not the extension's.
 */
export const tabRendererKbs = (distPath: string): number[] =>
    ourRendererPids(distPath)
        .filter((pid) => !commandLine(pid).includes("--extension-process"))
        .map(residentKb);

/**
 * Chrome tags the renderer hosting an extension in its own command line, so
 * the process can be found without touching the browser.
 *
 * An earlier version had the worker allocate a slab and looked for the
 * process that grew by it. That understates the result by about a third:
 * freeing the slab leaves the allocator holding mapped pages, and the wasm
 * allocation reuses them without RSS growing.
 * @returns The pid of every renderer hosting an extension.
 */
export const extensionRendererPids = (): number[] =>
    fs
        .readdirSync("/proc")
        .filter((entry) => isDigits(entry))
        .map(Number)
        .filter((pid) => {
            const command = commandLine(pid);
            return command.includes("--type=renderer") && command.includes("--extension-process");
        });

/**
 * @param before Resident kilobytes per pid, taken before the work.
 * @param after Resident kilobytes per pid, taken after.
 * @returns The extension renderer that grew most, or null where none did.
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

/** @returns Resident kilobytes for every extension renderer, keyed by pid. */
export const residentByExtensionPid = (): Map<number, number> =>
    new Map(extensionRendererPids().map((pid) => [pid, residentKb(pid)]));
