import { expect } from "@jest/globals";
import { split } from "../../../../src/domain/moduleSource/Split";
import { detect } from "../../../../src/domain/moduleSource/Detect";
import { classify } from "../../../../src/domain/moduleSource/Classify";
import { ModuleSource } from "../../../../src/types/ModuleSource";
import { resolverFor } from "../../../../src/domain/moduleSource/ModuleSourceResolvers";
import { SourceTypes } from "../../../../src/types/SourceTypes";
import { MODULE_SOURCE_CORPUS } from "../../fixtures/module-sources";

/**
 * Runs a raw source through the whole classification pipeline.
 * @param raw The source exactly as an author wrote it.
 * @returns The classified source.
 */
const read = (raw: string): ModuleSource => classify(detect(split(raw)));

/**
 * Reads the label a source is given.
 * @param raw The source exactly as an author wrote it.
 * @returns The label the popup would show for it.
 */
const typeOf = (raw: string): SourceTypes => read(raw).sourceType;

/**
 * Reports whether a source has somewhere to link to.
 * @param raw The source exactly as an author wrote it.
 * @returns true if a resolver can build a link for it; otherwise, false.
 */
const linkable = (raw: string): boolean => resolverFor(read(raw)).linkAsync !== null;

/**
 * Labels a set of sources for comparison against what each should be.
 * @param cases The sources and the label each is expected to carry.
 * @returns The same pairs, carrying the label each actually got.
 */
const labelAll = (cases: { raw: string; sourceType: SourceTypes }[]) =>
    cases.map(({ raw }) => ({ raw, sourceType: typeOf(raw) }));

describe("Given a source to label", () => {
    describe("When the source is a local path", () => {
        test("Then I expect path", () => {
            // Arrange
            const cases = [
                { raw: "./modules/vpc", sourceType: SourceTypes.path },
                { raw: "../../modules/vpc", sourceType: SourceTypes.path },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source is a bare registry address", () => {
        test("Then I expect registry", () => {
            // Arrange
            const raw = "terraform-aws-modules/vpc/aws";

            // Act
            const sourceType = typeOf(raw);

            // Assert
            expect<SourceTypes>(sourceType).toBe(SourceTypes.registry);
        });
    });

    describe("When the source is a terraform.io registry host", () => {
        test("Then I expect privateRegistry, unchanged from before", () => {
            // Arrange
            const raw = "app.terraform.io/corp/k8s/azurerm";

            // Act
            const sourceType = typeOf(raw);

            // Assert
            expect<SourceTypes>(sourceType).toBe(SourceTypes.privateRegistry);
        });
    });

    describe("When the source is another registry host", () => {
        test("Then I expect registry", () => {
            // Arrange
            const cases = [
                {
                    raw: "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    sourceType: SourceTypes.registry,
                },
                {
                    raw: "registry.example.com/corp/networking/aws",
                    sourceType: SourceTypes.registry,
                },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source is git over an explicit https url", () => {
        test("Then I expect the same label the shorthand form gets", () => {
            // Arrange
            const cases = [
                {
                    raw: "git::https://github.com/a/b.git//modules/vpc",
                    sourceType: SourceTypes.gitHttps,
                },
                { raw: "github.com/a/b", sourceType: SourceTypes.gitHttps },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source is an http address that is not a repository", () => {
        test("Then I expect url, because that is all that is known about it", () => {
            // Arrange
            const raw = "https://example.com/modules";

            // Act
            const sourceType = typeOf(raw);

            // Assert
            expect<SourceTypes>(sourceType).toBe(SourceTypes.url);
        });
    });

    describe("When the transport is plaintext", () => {
        test("Then I expect it visible in the label", () => {
            // Arrange
            const raw = "hg::http://example.com/vpc.hg";

            // Act
            const sourceType = typeOf(raw);

            // Assert
            expect<SourceTypes>(sourceType).toBe(SourceTypes.mercurialHttp);
        });
    });

    describe("When the protocol is one the vcs can fetch over", () => {
        test("Then I expect it named, for every protocol git speaks", () => {
            // Arrange
            const cases = [
                { raw: "git::https://github.com/a/b.git", sourceType: SourceTypes.gitHttps },
                { raw: "git::http://example.com/a/b.git", sourceType: SourceTypes.gitHttp },
                { raw: "git::ssh://git@github.com/a/b.git", sourceType: SourceTypes.gitSsh },
                { raw: "git::ftp://example.com/a/b.git", sourceType: SourceTypes.gitFtp },
                { raw: "git::ftps://example.com/a/b.git", sourceType: SourceTypes.gitFtps },
                { raw: "git::git://example.com/a/b.git", sourceType: SourceTypes.gitDaemon },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });

        test("Then I expect mercurial named only over what it speaks", () => {
            // Arrange
            const cases = [
                { raw: "hg::https://example.com/repo", sourceType: SourceTypes.mercurialHttps },
                { raw: "hg::ssh://example.com/repo", sourceType: SourceTypes.mercurialSsh },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the protocol is one the vcs cannot fetch over", () => {
        test("Then I expect unknown rather than a guess at https", () => {
            // Arrange
            // Mercurial has no ftp or git transport; git dropped rsync in 2.10.
            const cases = [
                { raw: "hg::ftp://example.com/repo", sourceType: SourceTypes.unknown },
                { raw: "hg::git://example.com/repo", sourceType: SourceTypes.unknown },
                { raw: "git::rsync://example.com/a/b.git", sourceType: SourceTypes.unknown },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source is shorthand", () => {
        test("Then I expect git", () => {
            // Arrange
            const cases = [
                { raw: "github.com/owner/repo", sourceType: SourceTypes.gitHttps },
                { raw: "bitbucket.org/owner/repo", sourceType: SourceTypes.gitHttps },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source uses ssh", () => {
        test("Then I expect ssh", () => {
            // Arrange
            const cases = [
                { raw: "git@github.com:owner/repo.git", sourceType: SourceTypes.gitSsh },
                { raw: "git::ssh://git@github.com/a/b.git", sourceType: SourceTypes.gitSsh },
                { raw: "git::git@github.com:a/b.git", sourceType: SourceTypes.gitSsh },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source is an archive", () => {
        test("Then I expect archive", () => {
            // Arrange
            const cases = [
                { raw: "https://example.com/vpc-module.zip", sourceType: SourceTypes.archive },
                {
                    raw: "s3::https://s3.amazonaws.com/bucket/vpc.zip",
                    sourceType: SourceTypes.archive,
                },
                {
                    raw: "gcs::https://www.googleapis.com/storage/v1/x.zip",
                    sourceType: SourceTypes.archive,
                },
            ];

            // Act
            const labelled = labelAll(cases);

            // Assert
            expect(labelled).toEqual(cases);
        });
    });

    describe("When the source is mercurial", () => {
        test("Then I expect mercurial", () => {
            // Arrange
            const raw = "hg::http://example.com/vpc.hg";

            // Act
            const sourceType = typeOf(raw);

            // Assert
            expect<SourceTypes>(sourceType).toBe(SourceTypes.mercurialHttp);
        });
    });

    describe("When the source is an oci artifact", () => {
        test("Then I expect oci", () => {
            // Arrange
            const raw = "oci://example.com/repo?tag=v1.0.0";

            // Act
            const sourceType = typeOf(raw);

            // Assert
            expect<SourceTypes>(sourceType).toBe(SourceTypes.oci);
        });
    });

    describe("When the source cannot be understood", () => {
        test("Then I expect unknown rather than null", () => {
            // Arrange
            const raws = [
                "",
                "javascript:x.terraform.io/foo,alert(document.domain)",
                "user@a.terraform.io/path",
                "3325256838\\a.terraform.io/path",
                "https://a.terraform.io@evil.com/x",
            ];

            // Act
            const labelled = raws.map((raw) => ({ raw, sourceType: typeOf(raw) }));

            // Assert
            expect(labelled).toEqual(raws.map((raw) => ({ raw, sourceType: SourceTypes.unknown })));
        });
    });
});

describe("Given a source to link", () => {
    describe("When the source has a browsable target", () => {
        test("Then I expect a link builder", () => {
            // Arrange
            const raws = [
                "./modules/vpc",
                "terraform-aws-modules/vpc/aws",
                "github.com/owner/repo",
                "git@github.com:owner/repo.git",
                "git::https://github.com/a/b.git",
                "hg::http://example.com/vpc.hg",
                "s3::https://s3.amazonaws.com/bucket/vpc.zip",
            ];

            // Act
            const browsable = raws.map((raw) => ({ raw, linkable: linkable(raw) }));

            // Assert
            expect(browsable).toEqual(raws.map((raw) => ({ raw, linkable: true })));
        });
    });

    describe("When the target has no browsable address", () => {
        test("Then I expect it labeled but not linkable", () => {
            // Arrange
            const raw = "oci://example.com/repo";

            // Act
            const browsable = linkable(raw);
            const sourceType = typeOf(raw);

            // Assert
            expect<boolean>(browsable).toBe(false);
            expect<SourceTypes>(sourceType).toBe(SourceTypes.oci);
        });
    });

    describe("When the source was rejected", () => {
        test("Then I expect it not linkable", () => {
            // Arrange
            const raws = [
                "javascript:x.terraform.io/foo,alert(x)",
                "https://a.terraform.io@evil.com/x",
                "git::https://github.com@evil.com/a/b.git",
            ];

            // Act
            const browsable = raws.map((raw) => ({ raw, linkable: linkable(raw) }));

            // Assert
            expect(browsable).toEqual(raws.map((raw) => ({ raw, linkable: false })));
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When each one is split, detected and classified", () => {
        test("Then I expect the label the corpus asks for", () => {
            // Act
            const wrong = MODULE_SOURCE_CORPUS.map((row) => ({
                row,
                actual: String(read(row.source).sourceType),
            }))
                .filter(({ row, actual }) => actual !== row.expectedSourceType)
                .map(
                    ({ row, actual }) => `${row.id}: got ${actual}, want ${row.expectedSourceType}`,
                );

            // Assert
            expect<string[]>(wrong).toStrictEqual([]);
        });

        test("Then I expect a link builder wherever a link is expected", () => {
            // Arrange
            const settled = MODULE_SOURCE_CORPUS.filter((row) => row.pending === null);

            // Act
            const wrong = settled
                .map((row) => ({
                    row,
                    browsable: resolverFor(read(row.source)).linkAsync !== null,
                }))
                .filter(({ row, browsable }) => browsable !== (row.expectedResolvedUrl !== null))
                .map(({ row, browsable }) => `${row.id}: browsable ${String(browsable)}`);

            // Assert
            expect<string[]>(wrong).toStrictEqual([]);
        });
    });
});
