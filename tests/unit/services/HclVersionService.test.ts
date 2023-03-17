import {expect} from "@jest/globals";
import {HclVersionService} from "../../../src/services/HclVersionService";
let hclVersionService: HclVersionService;
beforeAll(() => {
    hclVersionService = new HclVersionService();
});

describe("Given a version", () => {
    describe("When the version is 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is ~= 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("~> 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is = 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is >= 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion(">= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is <= 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("<= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is < 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("< 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is >= 3.0.0, < 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion(">= 3.0.0, < 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is >= 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion(">= 3.0.0, <= 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is > 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be 4.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("> 3.0.0, <= 4.0.0")).toBe("4.0.0");
        });
    });

    describe("When the version is > 3.0.0, < 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("> 3.0.0, < 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is ~= 3.0.0, < 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("~> 3.0.0, < 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is ~= 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.getMinimalTerraformVersion("~> 3.0.0, <= 4.0.0")).toBe("4.0.0");
        });
    });
})