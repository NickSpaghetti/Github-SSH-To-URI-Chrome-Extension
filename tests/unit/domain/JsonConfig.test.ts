import { expect } from "@jest/globals";
import { parseJsonConfig } from "../../../src/domain/TerraformJsonParser";

describe("Given Terraform JSON syntax", () => {
    describe("When a module block is written once as an object", () => {
        test("Then I expect it normalized to an array", () => {
            const config = parseJsonConfig(
                JSON.stringify({ module: { vpc: { source: "a/b/c", version: "1.0.0" } } }),
            );
            expect<unknown>(config.module).toStrictEqual({
                vpc: [{ source: "a/b/c", version: "1.0.0" }],
            });
        });
    });

    describe("When a module block is already an array", () => {
        test("Then I expect it left alone", () => {
            const config = parseJsonConfig(
                JSON.stringify({ module: { vpc: [{ source: "a/b/c" }] } }),
            );
            expect<unknown>(config.module).toStrictEqual({ vpc: [{ source: "a/b/c" }] });
        });
    });

    describe("When required_providers is written as an object", () => {
        test("Then I expect the terraform block and providers normalized", () => {
            const config = parseJsonConfig(
                JSON.stringify({
                    terraform: { required_providers: { aws: { source: "hashicorp/aws" } } },
                }),
            );
            expect<unknown>(config.terraform).toStrictEqual([
                { required_providers: [{ aws: { source: "hashicorp/aws" } }] },
            ]);
        });
    });

    describe("When the file holds neither block", () => {
        test("Then I expect an empty config rather than a throw", () => {
            expect<unknown>(parseJsonConfig(JSON.stringify({ variable: { x: {} } }))).toStrictEqual(
                {},
            );
        });
    });

    describe("When the file is not a JSON object", () => {
        test("Then I expect a throw the caller can report", () => {
            expect(() => parseJsonConfig("[]")).not.toThrow();
            expect(() => parseJsonConfig("null")).toThrow();
            expect(() => parseJsonConfig("not json")).toThrow();
        });
    });
});
