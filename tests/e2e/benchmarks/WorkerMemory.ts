import * as fs from "fs";

const DIGITS = "0123456789";

const isDigits = (text: string): boolean =>
    text !== "" && [...text].every((character) => DIGITS.includes(character));

// A `/proc/<pid>/status` line reads `VmRSS:\t   12345 kB`, so the number is
// the only field that is digits alone.
const firstNumber = (line: string): number => {
    const field = line
        .split("\t")
        .join(" ")
        .split(" ")
        .find((part) => isDigits(part));
    return field === undefined ? 0 : Number(field);
};

/**
 * Returns a process's resident memory. Linux only: it reads `/proc`.
 * @param pid The process to read.
 * @returns Its resident kilobytes, or 0 where it could not be read.
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

const pidsMatching = (wanted: (command: string) => boolean): number[] =>
    fs
        .readdirSync("/proc")
        .filter((entry) => isDigits(entry))
        .map(Number)
        .filter((pid) => wanted(commandLine(pid)));

/**
 * Returns the renderers of the browser this suite launched with a build.
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
 * Returns the resident memory of the extension's own renderer.
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
 * Returns the resident memory of each tab's renderer.
 * @param distPath The build this suite loaded, as an absolute path.
 * @returns Resident kilobytes of each renderer that is not the extension's.
 */
export const tabRendererKbs = (distPath: string): number[] =>
    ourRendererPids(distPath)
        .filter((pid) => !commandLine(pid).includes("--extension-process"))
        .map(residentKb);

// Chrome tags the renderer hosting an extension with `--extension-process`.
/**
 * Returns every renderer on the machine hosting an extension.
 * @returns The pid of each.
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
 * Returns the extension renderer whose resident memory grew most.
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

/**
 * Returns the resident memory of every extension renderer.
 * @returns Resident kilobytes, keyed by pid.
 */
export const residentByExtensionPid = (): Map<number, number> =>
    new Map(extensionRendererPids().map((pid) => [pid, residentKb(pid)]));
