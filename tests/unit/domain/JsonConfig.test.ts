import { expect } from "@jest/globals";
import { parseJsonConfig } from "../../../src/domain/TerraformJsonParser";

describe("Given Terraform JSON syntax", () => {
    describe("When a module block is written once as an object", () => {
        test("Then I expect it normalized to an array", () => {
            // Arrange
            const file = JSON.stringify({
                module: { vpc: { source: "a/b/c", version: "1.0.0" } },
            });

            // Act
            const config = parseJsonConfig(file);

            // Assert
            expect<unknown>(config.module).toStrictEqual({
                vpc: [{ source: "a/b/c", version: "1.0.0" }],
            });
        });
    });

    describe("When a module block is already an array", () => {
        test("Then I expect it left alone", () => {
            // Arrange
            const file = JSON.stringify({ module: { vpc: [{ source: "a/b/c" }] } });

            // Act
            const config = parseJsonConfig(file);

            // Assert
            expect<unknown>(config.module).toStrictEqual({ vpc: [{ source: "a/b/c" }] });
        });
    });

    describe("When required_providers is written as an object", () => {
        test("Then I expect the terraform block and providers normalized", () => {
            // Arrange
            const file = JSON.stringify({
                terraform: { required_providers: { aws: { source: "hashicorp/aws" } } },
            });

            // Act
            const config = parseJsonConfig(file);

            // Assert
            expect<unknown>(config.terraform).toStrictEqual([
                { required_providers: [{ aws: { source: "hashicorp/aws" } }] },
            ]);
        });
    });

    describe("When the file holds neither block", () => {
        test("Then I expect an empty config rather than a throw", () => {
            // Arrange
            const file = JSON.stringify({ variable: { x: {} } });

            // Act
            const config = parseJsonConfig(file);

            // Assert
            expect<unknown>(config).toStrictEqual({});
        });
    });

    describe("When the file is not a JSON object", () => {
        test("Then I expect a throw the caller can report", () => {
            // Arrange
            const files = ["null", "not json"];

            // Act
            const parse = files.map((file) => () => parseJsonConfig(file));

            // Assert
            expect(() => parseJsonConfig("[]")).not.toThrow();
            for (const attempt of parse) {
                expect(attempt).toThrow();
            }
        });
    });
});
