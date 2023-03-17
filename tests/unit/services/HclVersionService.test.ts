import {expect} from "@jest/globals";
import {HclVersionService} from "../../../src/services/HclVersionService";
import {TERRAFORM_VERSION_CONSTRAINTS} from "../../../src/util/constants";
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
});

describe("Given a version format", () => {
    describe("When the version is 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hclVersionService.formatTerraformVersion("3.0.0")).toBe("3.0.0");
        });
    });
    describe("When the version is 3.0", () => {
        test('Then I expect Version to be 3.0', () => {
            expect<string>(hclVersionService.formatTerraformVersion("3.0")).toBe("3.0");
        });
    });
    describe("When the version is 3", () => {
        test('Then I expect Version to be 3', () => {
            expect<string>(hclVersionService.formatTerraformVersion("3")).toBe("3");
        });
    });
    describe("When the version is ~= 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be ~= 3.0.0, <= 4.0.0', () => {
            expect<string>(hclVersionService.formatTerraformVersion("~> 3.0.0, <= 4.0.0")).toBe("~> 3.0.0, <= 4.0.0");
        });
    });
    for(let [_, signValue] of Object.entries(TERRAFORM_VERSION_CONSTRAINTS)){
        describe(`When the version is ${signValue}3.0.0`, () => {
            test(`Then I expect Version to be ${signValue} 3.0.0`, () => {
                expect<string>(hclVersionService.formatTerraformVersion(`${signValue}3.0.0`)).toBe(`${signValue} 3.0.0`);
            });
        });
        for(let [_, subSignValue] of Object.entries(TERRAFORM_VERSION_CONSTRAINTS)){
            describe(`When the version is ${signValue}3.0.0${subSignValue}4.0.0`, () => {
                test(`Then I expect Version to be ${signValue} 3.0.0, ${subSignValue} 4.0.0`, () => {
                    expect<string>(hclVersionService.formatTerraformVersion(`${signValue}3.0.0${subSignValue}4.0.0`)).toBe(`${signValue} 3.0.0, ${subSignValue} 4.0.0`);
                });
            });
        }
    }
    describe("When the version is ~>3.0.0,<=4.0.0", () => {
        test('Then I expect Version to be ~= 3.0.0, <= 4.0.0', () => {
            expect<string>(hclVersionService.formatTerraformVersion("~>3.0.0,<=4.0.0")).toBe("~> 3.0.0, <= 4.0.0");
        });
    });
    describe("When the version is ~>3.0.0<=4.0.0", () => {
        test('Then I expect Version to be ~= 3.0.0, <= 4.0.0', () => {
            expect<string>(hclVersionService.formatTerraformVersion("~>3.0.0<=4.0.0")).toBe("~> 3.0.0, <= 4.0.0");
        });
    });
})