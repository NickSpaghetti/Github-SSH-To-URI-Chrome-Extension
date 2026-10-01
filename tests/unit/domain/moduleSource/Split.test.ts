import { expect } from "@jest/globals";
import { split } from "../../../../src/domain/moduleSource/Split";
import { MODULE_SOURCE_FLAGS, describeFlags, hasFlag } from "../../../../src/types/ModuleSource";
import { MODULE_SOURCE_CORPUS } from "../../fixtures/module-sources";

describe("Given a prefix", () => {
    describe("When the source is git::https://github.com/a/b.git", () => {
        test("Then I expect the type to be git and the locator to be the url", () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.prefix).toBe("git");
            expect<string>(source.locator).toBe("https://github.com/a/b.git");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasPrefix)).toBe(true);
        });
    });

    describe("When the source is hg::http://example.com/vpc.hg", () => {
        test("Then I expect the type to be hg", () => {
            // Arrange
            const raw = "hg::http://example.com/vpc.hg";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.prefix).toBe("hg");
        });
    });

    describe("When the source is s3::https://s3.amazonaws.com/bucket/vpc.zip", () => {
        test("Then I expect the type to be s3", () => {
            // Arrange
            const raw = "s3::https://s3.amazonaws.com/bucket/vpc.zip";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.prefix).toBe("s3");
        });
    });

    describe("When the source is gcs::https://www.googleapis.com/storage/v1/x.zip", () => {
        test("Then I expect the type to be gcs", () => {
            // Arrange
            const raw = "gcs::https://www.googleapis.com/storage/v1/x.zip";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.prefix).toBe("gcs");
        });
    });

    describe("When the source is git::git@github.com:a/b.git", () => {
        test("Then I expect the type to be git and the locator to keep the scp form", () => {
            // Arrange
            const raw = "git::git@github.com:a/b.git";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.prefix).toBe("git");
            expect<string>(source.locator).toBe("git@github.com:a/b.git");
        });
    });
});

describe("Given a source with no prefix", () => {
    describe("When the source is oci://example.com/repo", () => {
        test("Then I expect no prefix, because :// is a scheme", () => {
            // Arrange
            const raw = "oci://example.com/repo";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.prefix).toBe("");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasPrefix)).toBe(false);
        });
    });

    describe("When the source is a bare registry address", () => {
        test("Then I expect the locator to be unchanged", () => {
            // Arrange
            const raw = "terraform-aws-modules/vpc/aws";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.locator).toBe("terraform-aws-modules/vpc/aws");
            expect<string>(describeFlags(source)).toBe("None");
        });
    });

    describe("When the source is a local path", () => {
        test("Then I expect the locator to be unchanged", () => {
            // Arrange
            const raws = ["./modules/vpc", "../../modules/vpc"];

            // Act
            const locators = raws.map((raw) => split(raw).locator);

            // Assert
            expect<string[]>(locators).toEqual(raws);
        });
    });
});

describe("Given a subdirectory", () => {
    describe("When the source is a registry address with a subdir", () => {
        test("Then I expect the subdir to be split from the locator", () => {
            // Arrange
            const raw = "terraform-aws-modules/vpc/aws//modules/vpc-endpoints";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.locator).toBe("terraform-aws-modules/vpc/aws");
            expect<string>(source.subDirectory).toBe("modules/vpc-endpoints");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasSubDirectory)).toBe(true);
        });
    });

    describe("When the source has a scheme and a subdir", () => {
        test("Then I expect the scheme's own slashes to be left alone", () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git//modules/vpc";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.locator).toBe("https://github.com/a/b.git");
            expect<string>(source.subDirectory).toBe("modules/vpc");
        });
    });

    describe("When the source is scp style with a subdir", () => {
        test("Then I expect the subdir to be split", () => {
            // Arrange
            const raw = "git@github.com:a/b.git//modules/vpc";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.locator).toBe("git@github.com:a/b.git");
            expect<string>(source.subDirectory).toBe("modules/vpc");
        });
    });

    describe("When the source has no subdir", () => {
        test("Then I expect an empty subdir and no flag", () => {
            // Arrange
            const raw = "https://example.com/vpc.zip";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.subDirectory).toBe("");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasSubDirectory)).toBe(false);
        });
    });
});

describe("Given a revision selector", () => {
    describe("When the query is ?ref=v1.0.0", () => {
        test("Then I expect the ref to be v1.0.0", () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git?ref=v1.0.0";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.ref).toBe("v1.0.0");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasRef)).toBe(true);
        });
    });

    describe("When the query is ?tag=v1.0.0", () => {
        test("Then I expect tag to be read as the ref", () => {
            // Arrange
            const raw = "oci://example.com/repo?tag=v1.0.0";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.ref).toBe("v1.0.0");
        });
    });

    describe("When the query is ?ref=v1.0.0&depth=1", () => {
        test("Then I expect depth not to be mistaken for the ref", () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git?ref=v1.0.0&depth=1";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.ref).toBe("v1.0.0");
        });
    });

    describe("When the query is ?digest=sha256:abc123", () => {
        test("Then I expect no ref, and the colon not to break the split", () => {
            // Arrange
            const raw = "oci://example.com/repo?digest=sha256:abc123";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.ref).toBe("");
            expect<string>(source.locator).toBe("oci://example.com/repo");
        });
    });

    describe("When the query comes after a subdir", () => {
        test("Then I expect both to be split correctly", () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git//modules/vpc?ref=v1.0.0";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.locator).toBe("https://github.com/a/b.git");
            expect<string>(source.subDirectory).toBe("modules/vpc");
            expect<string>(source.ref).toBe("v1.0.0");
        });
    });
});

describe("Given an empty source", () => {
    describe("When the source is an empty string", () => {
        test("Then I expect the inert zero value", () => {
            // Arrange
            const raw = "";

            // Act
            const source = split(raw);

            // Assert
            expect<string>(source.locator).toBe("");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When each one is split", () => {
        test("Then I expect no throw and the raw value to be preserved", () => {
            // Act
            const raws = MODULE_SOURCE_CORPUS.map((row) => split(row.source).raw);

            // Assert
            expect<string[]>(raws).toEqual(MODULE_SOURCE_CORPUS.map((row) => row.source));
        });

        test("Then I expect the parts to reassemble into the original", () => {
            // Act
            const rebuilt = MODULE_SOURCE_CORPUS.map((row) => {
                const source = split(row.source);
                const prefix = source.prefix === "" ? "" : `${source.prefix}::`;
                const subDirectory = source.subDirectory === "" ? "" : `//${source.subDirectory}`;
                const parts = `${prefix}${source.locator}${subDirectory}`;
                return { source: row.source, leads: row.source.startsWith(parts) };
            });

            // Assert
            expect(rebuilt).toEqual(
                MODULE_SOURCE_CORPUS.map((row) => ({ source: row.source, leads: true })),
            );
        });
    });
});
