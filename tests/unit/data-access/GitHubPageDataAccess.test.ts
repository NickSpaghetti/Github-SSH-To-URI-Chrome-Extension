/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://github.com/owner/repo/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitHubPageDataAccess } from "../../../src/data-access/GitHubPageDataAccess";
import { HclFileTypes } from "../../../src/types/HclFileTypes";
import { Nullable } from "../../../src/types/Nullable";

const page = new GitHubPageDataAccess();

/**
 * Puts the window on a path and reads the file type off it.
 * @param path The path to put the window on.
 * @returns The type that path names, or null where it names no HCL file.
 */
const onPath = (path: string): Nullable<HclFileTypes> => {
    window.history.replaceState({}, "", path);
    return page.getFileType();
};

describe("Given a GitHub file path", () => {
    describe("When the file is a .tf", () => {
        test("Then I expect the tf file type", () => {
            // Arrange
            const path = "/owner/repo/blob/main/main.tf";

            // Act
            const fileType = onPath(path);

            // Assert
            expect<Nullable<HclFileTypes>>(fileType).toBe(HclFileTypes.tf);
        });
    });

    describe("When the file is a .hcl", () => {
        test("Then I expect the hcl file type", () => {
            // Arrange
            const path = "/owner/repo/blob/main/config.hcl";

            // Act
            const fileType = onPath(path);

            // Assert
            expect<Nullable<HclFileTypes>>(fileType).toBe(HclFileTypes.hcl);
        });
    });

    describe("When the file is not an HCL file", () => {
        test("Then I expect null", () => {
            // Arrange
            const paths = ["/owner/repo/blob/main/README.md", "/owner/repo/tree/main/modules"];

            // Act
            const fileTypes = paths.map(onPath);

            // Assert
            expect<Nullable<HclFileTypes>[]>(fileTypes).toEqual(paths.map(() => null));
        });
    });

    describe("When the file is a .tofu", () => {
        test("Then I expect the tofu file type", () => {
            // Arrange
            const path = "/owner/repo/blob/main/main.tofu";

            // Act
            const fileType = onPath(path);

            // Assert
            expect<Nullable<HclFileTypes>>(fileType).toBe(HclFileTypes.tofu);
        });
    });

    describe("When the file is a JSON variant", () => {
        test("Then I expect both extensions to be read, not just the last", () => {
            // Arrange
            const cases = [
                { path: "/owner/repo/blob/main/main.tf.json", fileType: HclFileTypes.tfJson },
                { path: "/owner/repo/blob/main/main.tofu.json", fileType: HclFileTypes.tofuJson },
            ];

            // Act
            const read = cases.map(({ path }) => ({ path, fileType: onPath(path) }));

            // Assert
            expect(read).toEqual(cases);
        });
    });

    describe("When the extension is uppercase", () => {
        test("Then I expect it still recognized", () => {
            // Arrange
            const path = "/owner/repo/blob/main/MAIN.TF";

            // Act
            const fileType = onPath(path);

            // Assert
            expect<Nullable<HclFileTypes>>(fileType).toBe(HclFileTypes.tf);
        });
    });

    describe("When the path merely contains tf", () => {
        test("Then I expect null", () => {
            // Arrange
            const paths = [
                "/owner/repo/blob/main/tf/README.md",
                "/owner/repo/blob/main/notes.tfvars",
            ];

            // Act
            const fileTypes = paths.map(onPath);

            // Assert
            expect<Nullable<HclFileTypes>[]>(fileTypes).toEqual(paths.map(() => null));
        });
    });
});
