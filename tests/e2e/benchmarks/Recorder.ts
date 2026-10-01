import * as fs from "fs";
import * as path from "path";

export const RECORDED_DIR = path.resolve(__dirname, ".recorded");

type Recorded = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Recorded =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param into The values already recorded for an axis.
 * @param from The values being added.
 * @returns The two merged, with nested objects combined instead of replaced.
 */
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
 * Writes what a benchmark measured, for `record-baseline` to assemble.
 *
 * Call this at measurement time, before asserting. A run that fails its
 * assertions is exactly the run whose numbers someone needs to look at, so
 * the measurement must survive the failure.
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
