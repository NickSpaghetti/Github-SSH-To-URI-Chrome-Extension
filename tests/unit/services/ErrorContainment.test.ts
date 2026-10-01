import { expect, jest } from "@jest/globals";
import { split } from "../../../src/domain/moduleSource/Split";
import { detect } from "../../../src/domain/moduleSource/Detect";
import { classify } from "../../../src/domain/moduleSource/Classify";
import { stubModuleSourceLinker } from "./RegistryStubs";
import { buildDisplayModuleAsync } from "../../../src/services/DisplayModuleBuilder";
import { TerraformModule } from "../../../src/types/Terraform";
import { Nullable } from "../../../src/types/Nullable";
import { SourceTypes } from "../../../src/types/SourceTypes";

const linker = stubModuleSourceLinker();
const PAGE = new URL("https://github.com/owner/repo/blob/main/main.tf");

// Not in the recorded fixtures, so the fetch layer throws. That is the same
// shape as a renamed module, a typo, or a registry outage.
const UNKNOWN_MODULE = "some-namespace/not-a-real-module/aws";

beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Given a registry lookup that fails", () => {
    describe("When the linker builds the url", () => {
        test("Then I expect null rather than a throw", async () => {
            // Arrange
            const source = classify(detect(split(UNKNOWN_MODULE)));

            // Act
            const link = await linker.linkAsync(source, "m", "", PAGE);

            // Assert
            expect<Nullable<string>>(link.url).toBeNull();
        });
    });

    describe("When a display module is built", () => {
        test("Then I expect the row to survive with its label and no link", async () => {
            // Arrange
            const module: TerraformModule = {
                moduleName: "broken",
                terraformProperty: "module",
                sourceLine: null,
                provider: { source: UNKNOWN_MODULE, version: "" },
                writtenSource: UNKNOWN_MODULE,
                sourceResolved: true,
            };

            // Act
            const display = await buildDisplayModuleAsync(PAGE.href, module, linker);

            // Assert
            expect<string>(display.moduleName).toBe("broken");
            expect<string>(display.source).toBe(UNKNOWN_MODULE);
            expect<Nullable<SourceTypes>>(display.sourceType).not.toBeNull();
            expect<Nullable<string>>(display.resolvedUrl).toBeNull();
        });
    });
});

describe("Given a page with one broken module among good ones", () => {
    describe("When each module is built in turn", () => {
        test("Then I expect the good ones to keep their links", async () => {
            // Arrange
            const modules: TerraformModule[] = [
                {
                    moduleName: "good_git",
                    terraformProperty: "module",
                    sourceLine: null,
                    provider: { source: "git::https://github.com/a/b.git?ref=v1.0.0", version: "" },
                    writtenSource: "git::https://github.com/a/b.git?ref=v1.0.0",
                    sourceResolved: true,
                },
                {
                    moduleName: "broken",
                    terraformProperty: "module",
                    sourceLine: null,
                    provider: { source: UNKNOWN_MODULE, version: "" },
                    writtenSource: UNKNOWN_MODULE,
                    sourceResolved: true,
                },
                {
                    moduleName: "good_path",
                    terraformProperty: "module",
                    sourceLine: null,
                    provider: { source: "./modules/vpc", version: "" },
                    writtenSource: "./modules/vpc",
                    sourceResolved: true,
                },
            ];

            // Act
            const built = [];
            for (const module of modules) {
                built.push(await buildDisplayModuleAsync(PAGE.href, module, linker));
            }

            // Assert
            expect<number>(built.length).toBe(3);
            expect<Nullable<string>>(built[0].resolvedUrl).not.toBeNull();
            expect<Nullable<string>>(built[1].resolvedUrl).toBeNull();
            expect<Nullable<string>>(built[2].resolvedUrl).not.toBeNull();
        });
    });
});
