/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://github.com/owner/repo/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitHubPageDataAccess } from "../../../src/data-access/GitHubPageDataAccess";
import { HclFileTypes } from "../../../src/types/HclFileTypes";
import { Nullable } from "../../../src/types/Nullable";

const page = new GitHubPageDataAccess();

const onPath = (path: string): Nullable<HclFileTypes> => {
    window.history.replaceState({}, "", path);
    return page.getFileType();
};

describe("Given a GitHub file path", () => {
    describe("When the file is a .tf", () => {
        test("Then I expect the tf file type", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/main.tf")).toBe(
                HclFileTypes.tf,
            );
        });
    });

    describe("When the file is a .hcl", () => {
        test("Then I expect the hcl file type", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/config.hcl")).toBe(
                HclFileTypes.hcl,
            );
        });
    });

    describe("When the file is not an HCL file", () => {
        test("Then I expect null", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/README.md")).toBeNull();
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/tree/main/modules")).toBeNull();
        });
    });

    describe("When the file is a .tofu", () => {
        test("Then I expect the tofu file type", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/main.tofu")).toBe(
                HclFileTypes.tofu,
            );
        });
    });

    describe("When the file is a JSON variant", () => {
        test("Then I expect both extensions to be read, not just the last", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/main.tf.json")).toBe(
                HclFileTypes.tfJson,
            );
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/main.tofu.json")).toBe(
                HclFileTypes.tofuJson,
            );
        });
    });

    describe("When the extension is uppercase", () => {
        test("Then I expect it still recognized", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/MAIN.TF")).toBe(
                HclFileTypes.tf,
            );
        });
    });

    describe("When the path merely contains tf", () => {
        test("Then I expect null", () => {
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/tf/README.md")).toBeNull();
            expect<Nullable<HclFileTypes>>(onPath("/owner/repo/blob/main/notes.tfvars")).toBeNull();
        });
    });
});
