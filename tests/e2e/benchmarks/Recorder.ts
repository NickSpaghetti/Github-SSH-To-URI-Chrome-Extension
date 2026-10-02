import * as fs from "fs";
import * as path from "path";
import { BenchHost, GITHUB } from "./BenchHost";

/** The folder each axis's measurements are written to. */
export const RECORDED_DIR = path.resolve(__dirname, ".recorded");

type Recorded = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Recorded =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const merge = (into: Recorded, from: Recorded): Recorded => {
    const merged: Recorded = { ...into };
    for (const [key, value] of Object.entries(from)) {
        const existing = merged[key];
        merged[key] =
            isPlainObject(existing) && isPlainObject(value) ? merge(existing, value) : value;
    }
    return merged;
};

/**
 * Writes what a benchmark measured, for `record-baseline` to assemble. Call it
 * before asserting, so a failed run's numbers are kept.
 * @param axis The baseline key this belongs under, such as `scrolling`.
 * @param values What was measured.
 */
export const record = (axis: string, values: Recorded): void => {
    fs.mkdirSync(RECORDED_DIR, { recursive: true });
    const file = path.join(RECORDED_DIR, `${axis}.json`);
    const existing = fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, "utf8")) as Recorded)
        : {};
    fs.writeFileSync(file, `${JSON.stringify(merge(existing, values), null, 4)}\n`);
};

/**
 * Writes what a benchmark measured on a host, for `record-baseline` to assemble.
 * GitHub's numbers go under the axis, and another host's under the host's name.
 * @param host The host the page was on.
 * @param axis The baseline key this belongs under, such as `scrolling`.
 * @param values What was measured.
 */
export const recordFor = (host: BenchHost, axis: string, values: Recorded): void => {
    if (host === GITHUB) {
        record(axis, values);
        return;
    }
    record(host.name, { [axis]: values });
};
