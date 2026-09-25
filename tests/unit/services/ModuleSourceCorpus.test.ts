import { expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { split } from "../../../src/domain/moduleSource/Split";
import { detect } from "../../../src/domain/moduleSource/Detect";
import { classify } from "../../../src/domain/moduleSource/Classify";
import { MODULE_SOURCE_CORPUS } from "../fixtures/module-sources";
import { stubModuleSourceLinker } from "./RegistryStubs";

type BaselineRow = {
    sourceType: string | null;
    resolvedUrl: string | null;
    threw: string | null;
};

type Baseline = {
    total: number;
    classified: number;
    gaps: string[];
    rows: Record<string, BaselineRow>;
};

const baseline = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../fixtures/corpus-baseline.json"), "utf8"),
) as Baseline;

const linker = stubModuleSourceLinker();

async function classifyAsync(row: (typeof MODULE_SOURCE_CORPUS)[number]): Promise<BaselineRow> {
    const moduleSource = classify(detect(split(row.source)));
    const result: BaselineRow = {
        sourceType: moduleSource.sourceType,
        resolvedUrl: null,
        threw: null,
    };
    try {
        result.resolvedUrl = (
            await linker.linkAsync(moduleSource, row.moduleName, row.version, new URL(row.pageUrl))
        ).url;
    } catch (error) {
        result.threw = error instanceof Error ? error.message : String(error);
    }
    return result;
}

describe("Given the module source corpus", () => {
    describe("When every row is classified by the current implementation", () => {
        test("Then I expect the result to match the recorded baseline", async () => {
            const actual: Record<string, BaselineRow> = {};
            for (const row of MODULE_SOURCE_CORPUS) {
                actual[row.id] = await classifyAsync(row);
            }
            expect(actual).toStrictEqual(baseline.rows);
        });
    });

    describe("When the corpus is compared against the authored expectations", () => {
        test("Then I expect the known gap count to be unchanged", () => {
            // Drops as each batch lands. Reaching 0 is the definition of done.
            expect<number>(baseline.gaps.length).toBe(0);
        });

        test("Then I expect every corpus row to have an expectation", () => {
            for (const row of MODULE_SOURCE_CORPUS) {
                expect<string>(row.expectedSourceType).not.toBe("");
            }
            expect<number>(MODULE_SOURCE_CORPUS.length).toBe(baseline.total);
        });
    });

    describe("When a row is marked as a correct rejection", () => {
        test("Then I expect it to expect unknown with no link", () => {
            const rejections = MODULE_SOURCE_CORPUS.filter(
                (row) => row.file === "14-security-cases.tf" && row.note === "must be rejected",
            );
            expect<number>(rejections.length).toBe(3);
            for (const row of rejections) {
                expect<string>(row.expectedSourceType).toBe("unknown");
                expect<string | null>(row.expectedResolvedUrl).toBeNull();
            }
        });
    });
});
