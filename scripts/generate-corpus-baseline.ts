// Records what the classifier does with every corpus row.
//
// Before the switch this snapshotted the old implementation so the migration
// could be checked against it. It now snapshots the new pipeline and serves as
// the regression guard for it.
//
// Invoke via: make generate-baseline

import * as fs from "fs";
import * as path from "path";
import { split } from "../src/domain/moduleSource/Split";
import { detect } from "../src/domain/moduleSource/Detect";
import { classify } from "../src/domain/moduleSource/Classify";
import { MODULE_SOURCE_CORPUS } from "../tests/unit/fixtures/module-sources";
import { stubModuleSourceLinker } from "../tests/unit/services/RegistryStubs";

const OUT_FILE = path.resolve(__dirname, "../tests/unit/fixtures/corpus-baseline.json");

type BaselineRow = {
    sourceType: string | null;
    resolvedUrl: string | null;
    threw: string | null;
};

async function generateAsync(): Promise<void> {
    const linker = stubModuleSourceLinker();

    const rows: Record<string, BaselineRow> = {};
    const gaps: string[] = [];

    for (const row of MODULE_SOURCE_CORPUS) {
        const moduleSource = classify(detect(split(row.source)));
        const baseline: BaselineRow = {
            sourceType: moduleSource.sourceType,
            resolvedUrl: null,
            threw: null,
        };

        try {
            baseline.resolvedUrl = (
                await linker.linkAsync(
                    moduleSource,
                    row.moduleName,
                    row.version,
                    new URL(row.pageUrl),
                )
            ).url;
        } catch (error) {
            baseline.threw = error instanceof Error ? error.message : String(error);
        }

        rows[row.id] = baseline;

        const typeDiffers = baseline.sourceType !== row.expectedSourceType;
        const urlDiffers =
            row.pending === null &&
            row.match === "exact" &&
            baseline.resolvedUrl !== row.expectedResolvedUrl;
        if (typeDiffers || urlDiffers || baseline.threw !== null) {
            gaps.push(row.id);
        }
    }

    const classified = Object.values(rows).filter((r) => r.sourceType !== null).length;
    fs.writeFileSync(
        OUT_FILE,
        JSON.stringify({ total: MODULE_SOURCE_CORPUS.length, classified, gaps, rows }, null, 4) +
            "\n",
    );

    console.log(`${MODULE_SOURCE_CORPUS.length} rows, ${classified} classified`);
    console.log(`${gaps.length} gaps against the authored expectations`);
    console.log(`wrote ${OUT_FILE}`);
}

generateAsync().catch((error) => {
    console.error(error);
    process.exit(1);
});
