import * as fs from "fs";
import * as path from "path";

const BENCHMARK_DIR = path.resolve(__dirname, "../tests/e2e/benchmarks");
const RECORDED_DIR = path.resolve(__dirname, "../tests/e2e/benchmarks/.recorded");
const STALE_AFTER_MS = 30 * 60 * 1000;
const BASELINE = path.resolve(__dirname, "../tests/e2e/benchmarks/baseline.json");

/** Every axis a full run is expected to produce. */
const AXES = [
    "scrolling",
    "softNavigation",
    "worker",
    "resolution",
    "popup",
    "parse",
    "userExperience",
    "browsing",
    "tabs",
];

/**
 * Values a spec multiplies by `ceiling` to bound a measurement, rather than
 * comparing for equality. These are high water marks: re-recording on a quiet
 * run would otherwise tighten every gate until a normal run trips it, so a
 * lower measurement is reported and discarded. Lowering one deliberately
 * means editing the baseline by hand.
 */
const CEILINGS = ["worker.residentMb", "userExperience.cpuSharePercent"];

type Values = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Values =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param into The baseline as it stands.
 * @param from What the run measured.
 * @returns The two merged, with measured values winning.
 */
const merge = (into: Values, from: Values): Values => {
    const merged: Values = { ...into };
    for (const [key, value] of Object.entries(from)) {
        const existing = merged[key];
        merged[key] =
            isPlainObject(existing) && isPlainObject(value) ? merge(existing, value) : value;
    }
    return merged;
};

/**
 * @param values Any nested object.
 * @param prefix The path walked so far.
 * @returns One entry per leaf, keyed by dotted path.
 */
const leaves = (values: Values, prefix = ""): Map<string, unknown> => {
    const flat = new Map<string, unknown>();
    for (const [key, value] of Object.entries(values)) {
        const at = prefix === "" ? key : `${prefix}.${key}`;
        if (isPlainObject(value)) {
            for (const [deeper, leaf] of leaves(value, at)) {
                flat.set(deeper, leaf);
            }
        } else {
            flat.set(at, value);
        }
    }
    return flat;
};

const drift = (was: unknown, now: unknown): string => {
    if (typeof was !== "number" || typeof now !== "number" || was === 0) {
        return "";
    }
    const percent = Math.round(((now - was) / was) * 100);
    return percent === 0 ? "" : `  ${percent > 0 ? "+" : ""}${percent}%`;
};

/**
 * Prose next to a number goes stale the moment the number is re-recorded,
 * and nothing detects it. Anything worth saying about an axis belongs in the
 * spec, beside the assertion, where review sees it.
 * @param node Any part of the baseline.
 */
const stripNotes = (node: unknown): void => {
    if (!isPlainObject(node)) {
        return;
    }
    delete node.note;
    Object.values(node).forEach(stripNotes);
};

const at = (values: Values, path: string): unknown =>
    path
        .split(".")
        .reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), values);

/**
 * @param values The baseline being assembled.
 * @param path A dotted path into it.
 * @param value What to store there.
 */
const put = (values: Values, path: string, value: unknown): void => {
    const keys = path.split(".");
    const last = keys.pop()!;
    const parent = keys.reduce<Values>((node, key) => node[key] as Values, values);
    parent[last] = value;
};

/** Written by this script rather than by any axis, so never reported dead. */
const ASSEMBLER_KEYS = ["recorded"];

/**
 * Finds baseline entries no benchmark mentions.
 *
 * A key that nothing records and nothing asserts is dead weight that reads as
 * a measurement. They arrive when an axis is renamed and the old name is
 * carried forward, which this script does by design for everything it was not
 * given.
 * @param values The assembled baseline.
 * @param benchmarkSource Every benchmark and helper, concatenated.
 * @returns The dotted paths that appear nowhere in the benchmarks.
 */
const deadKeys = (values: Values, benchmarkSource: string): string[] =>
    [...leaves(values).keys()].filter((path) => {
        const leaf = path.split(".").pop() ?? path;
        return !ASSEMBLER_KEYS.includes(leaf) && !benchmarkSource.includes(leaf);
    });

const benchmarkSourceText = (): string =>
    fs
        .readdirSync(BENCHMARK_DIR)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => fs.readFileSync(path.join(BENCHMARK_DIR, name), "utf8"))
        .join("\n");

const read = (file: string): Values => JSON.parse(fs.readFileSync(file, "utf8")) as Values;

const main = (): void => {
    if (!fs.existsSync(RECORDED_DIR)) {
        console.error(
            "nothing recorded. run the benchmark suite first, or use `make record-baseline`.",
        );
        process.exit(1);
    }

    const age = Date.now() - fs.statSync(RECORDED_DIR).mtimeMs;
    if (age > STALE_AFTER_MS) {
        console.error(
            `.recorded is ${Math.round(age / 60000)} minutes old. Run \`make record-baseline\`, ` +
                "which clears it and runs the suite, rather than this script on its own.",
        );
        process.exit(1);
    }

    const current = read(BASELINE);
    const recorded: Values = {};
    const missing: string[] = [];
    for (const axis of AXES) {
        const file = path.join(RECORDED_DIR, `${axis}.json`);
        if (fs.existsSync(file)) {
            recorded[axis] = read(file);
        } else {
            missing.push(axis);
        }
    }

    const next = merge(current, recorded);
    stripNotes(next);

    const held: string[] = [];
    for (const path of CEILINGS) {
        const was = at(current, path);
        const now = at(next, path);
        if (typeof was !== "number" || typeof now !== "number") {
            console.error(
                `ceiling ${path} is missing or not a number. the spec or this list moved.`,
            );
            process.exit(1);
        }
        if (now < was) {
            put(next, path, was);
            held.push(`  ${path}: held at ${was}, this run measured ${now}`);
        }
    }
    next.recorded = new Date().toISOString().slice(0, 10);

    // Derived rather than measured: the fixtures are two files and their
    // ratio is a property of the pair, not of the machine.
    const parse = next.parse as Values;
    const smallBytes = parse.smallBytes as number | undefined;
    const largeBytes = parse.largeBytes as number | undefined;
    if (typeof smallBytes === "number" && typeof largeBytes === "number" && smallBytes > 0) {
        parse.sizeRatio = Math.round((largeBytes / smallBytes) * 100) / 100;
    }

    const before = leaves(current);
    const after = leaves(next);
    const changes: string[] = [];
    for (const [at, value] of after) {
        if (at === "recorded" || !before.has(at)) {
            changes.push(`  ${before.has(at) ? "" : "new "}${at}: ${JSON.stringify(value)}`);
            continue;
        }
        const was = before.get(at);
        if (JSON.stringify(was) !== JSON.stringify(value)) {
            changes.push(
                `  ${at}: ${JSON.stringify(was)} -> ${JSON.stringify(value)}${drift(was, value)}`,
            );
        }
    }

    const dead = deadKeys(next, benchmarkSourceText());

    fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 4)}\n`);

    console.log(`wrote ${path.relative(process.cwd(), BASELINE)}`);
    console.log(changes.length === 0 ? "  no change" : changes.join("\n"));
    if (dead.length > 0) {
        console.log("\nno benchmark mentions these, so nothing keeps them true:");
        dead.forEach((path) => console.log(`  ${path}`));
    }
    if (held.length > 0) {
        console.log("\nceilings held rather than tightened:");
        console.log(held.join("\n"));
    }
    if (missing.length > 0) {
        console.log(`\nNOT RECORDED, carried forward from the old baseline: ${missing.join(", ")}`);
        console.log("those axes did not reach their record() call, so their numbers are stale.");
    }
    console.log("\nreview the diff before committing. a ceiling that moved the wrong way");
    console.log("is a benchmark that stopped gating, and it looks exactly like a pass.");
};

main();
