import { expect } from "@jest/globals";
import { split } from "../../../../src/domain/moduleSource/Split";
import { MODULE_SOURCE_FLAGS, describeFlags, hasFlag } from "../../../../src/types/ModuleSource";
import { MODULE_SOURCE_CORPUS } from "../../fixtures/module-sources";

describe("Given a prefix", () => {
    describe("When the source is git::https://github.com/a/b.git", () => {
        test("Then I expect the type to be git and the locator to be the url", () => {
            const source = split("git::https://github.com/a/b.git");
            expect<string>(source.prefix).toBe("git");
            expect<string>(source.locator).toBe("https://github.com/a/b.git");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasPrefix)).toBe(true);
        });
    });

    describe("When the source is hg::http://example.com/vpc.hg", () => {
        test("Then I expect the type to be hg", () => {
            expect<string>(split("hg::http://example.com/vpc.hg").prefix).toBe("hg");
        });
    });

    describe("When the source is s3::https://s3.amazonaws.com/bucket/vpc.zip", () => {
        test("Then I expect the type to be s3", () => {
            expect<string>(split("s3::https://s3.amazonaws.com/bucket/vpc.zip").prefix).toBe("s3");
        });
    });

    describe("When the source is gcs::https://www.googleapis.com/storage/v1/x.zip", () => {
        test("Then I expect the type to be gcs", () => {
            expect<string>(split("gcs::https://www.googleapis.com/storage/v1/x.zip").prefix).toBe(
                "gcs",
            );
        });
    });

    describe("When the source is git::git@github.com:a/b.git", () => {
        test("Then I expect the type to be git and the locator to keep the scp form", () => {
            const source = split("git::git@github.com:a/b.git");
            expect<string>(source.prefix).toBe("git");
            expect<string>(source.locator).toBe("git@github.com:a/b.git");
        });
    });
});

describe("Given a source with no prefix", () => {
    describe("When the source is oci://example.com/repo", () => {
        test("Then I expect no prefix, because :// is a scheme", () => {
            const source = split("oci://example.com/repo");
            expect<string>(source.prefix).toBe("");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasPrefix)).toBe(false);
        });
    });

    describe("When the source is a bare registry address", () => {
        test("Then I expect the locator to be unchanged", () => {
            const source = split("terraform-aws-modules/vpc/aws");
            expect<string>(source.locator).toBe("terraform-aws-modules/vpc/aws");
            expect<string>(describeFlags(source)).toBe("None");
        });
    });

    describe("When the source is a local path", () => {
        test("Then I expect the locator to be unchanged", () => {
            expect<string>(split("./modules/vpc").locator).toBe("./modules/vpc");
            expect<string>(split("../../modules/vpc").locator).toBe("../../modules/vpc");
        });
    });
});

describe("Given a subdirectory", () => {
    describe("When the source is a registry address with a subdir", () => {
        test("Then I expect the subdir to be split from the locator", () => {
            const source = split("terraform-aws-modules/vpc/aws//modules/vpc-endpoints");
            expect<string>(source.locator).toBe("terraform-aws-modules/vpc/aws");
            expect<string>(source.subDirectory).toBe("modules/vpc-endpoints");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasSubDirectory)).toBe(true);
        });
    });

    describe("When the source has a scheme and a subdir", () => {
        test("Then I expect the scheme's own slashes to be left alone", () => {
            const source = split("git::https://github.com/a/b.git//modules/vpc");
            expect<string>(source.locator).toBe("https://github.com/a/b.git");
            expect<string>(source.subDirectory).toBe("modules/vpc");
        });
    });

    describe("When the source is scp style with a subdir", () => {
        test("Then I expect the subdir to be split", () => {
            const source = split("git@github.com:a/b.git//modules/vpc");
            expect<string>(source.locator).toBe("git@github.com:a/b.git");
            expect<string>(source.subDirectory).toBe("modules/vpc");
        });
    });

    describe("When the source has no subdir", () => {
        test("Then I expect an empty subdir and no flag", () => {
            const source = split("https://example.com/vpc.zip");
            expect<string>(source.subDirectory).toBe("");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasSubDirectory)).toBe(false);
        });
    });
});

describe("Given a revision selector", () => {
    describe("When the query is ?ref=v1.0.0", () => {
        test("Then I expect the ref to be v1.0.0", () => {
            const source = split("git::https://github.com/a/b.git?ref=v1.0.0");
            expect<string>(source.ref).toBe("v1.0.0");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.HasRef)).toBe(true);
        });
    });

    describe("When the query is ?tag=v1.0.0", () => {
        test("Then I expect tag to be read as the ref", () => {
            expect<string>(split("oci://example.com/repo?tag=v1.0.0").ref).toBe("v1.0.0");
        });
    });

    describe("When the query is ?ref=v1.0.0&depth=1", () => {
        test("Then I expect depth not to be mistaken for the ref", () => {
            expect<string>(split("git::https://github.com/a/b.git?ref=v1.0.0&depth=1").ref).toBe(
                "v1.0.0",
            );
        });
    });

    describe("When the query is ?digest=sha256:abc123", () => {
        test("Then I expect no ref, and the colon not to break the split", () => {
            const source = split("oci://example.com/repo?digest=sha256:abc123");
            expect<string>(source.ref).toBe("");
            expect<string>(source.locator).toBe("oci://example.com/repo");
        });
    });

    describe("When the query comes after a subdir", () => {
        test("Then I expect both to be split correctly", () => {
            const source = split("git::https://github.com/a/b.git//modules/vpc?ref=v1.0.0");
            expect<string>(source.locator).toBe("https://github.com/a/b.git");
            expect<string>(source.subDirectory).toBe("modules/vpc");
            expect<string>(source.ref).toBe("v1.0.0");
        });
    });
});

describe("Given an empty source", () => {
    describe("When the source is an empty string", () => {
        test("Then I expect the inert zero value", () => {
            const source = split("");
            expect<string>(source.locator).toBe("");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When each one is split", () => {
        test("Then I expect no throw and the raw value to be preserved", () => {
            for (const row of MODULE_SOURCE_CORPUS) {
                const source = split(row.source);
                expect<string>(source.raw).toBe(row.source);
            }
        });

        test("Then I expect the parts to reassemble into the original", () => {
            for (const row of MODULE_SOURCE_CORPUS) {
                const source = split(row.source);
                let rebuilt = source.prefix === "" ? "" : `${source.prefix}::`;
                rebuilt += source.locator;
                rebuilt += source.subDirectory === "" ? "" : `//${source.subDirectory}`;
                expect<boolean>(row.source.startsWith(rebuilt)).toBe(true);
            }
        });
    });
});
