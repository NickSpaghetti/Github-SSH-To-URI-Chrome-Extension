import { expect } from "@jest/globals";
import { split } from "../../../../src/domain/moduleSource/Split";
import { detect } from "../../../../src/domain/moduleSource/Detect";
import { classify } from "../../../../src/domain/moduleSource/Classify";
import { ModuleSource } from "../../../../src/types/ModuleSource";
import { resolverFor } from "../../../../src/domain/moduleSource/ModuleSourceResolvers";
import { SourceTypes } from "../../../../src/types/SourceTypes";
import { MODULE_SOURCE_CORPUS } from "../../fixtures/module-sources";

const read = (raw: string): ModuleSource => classify(detect(split(raw)));
const typeOf = (raw: string): SourceTypes => read(raw).sourceType;
const linkable = (raw: string): boolean => resolverFor(read(raw)).linkAsync !== null;

describe("Given a source to label", () => {
    describe("When the source is a local path", () => {
        test("Then I expect path", () => {
            expect<SourceTypes>(typeOf("./modules/vpc")).toBe(SourceTypes.path);
            expect<SourceTypes>(typeOf("../../modules/vpc")).toBe(SourceTypes.path);
        });
    });

    describe("When the source is a bare registry address", () => {
        test("Then I expect registry", () => {
            expect<SourceTypes>(typeOf("terraform-aws-modules/vpc/aws")).toBe(SourceTypes.registry);
        });
    });

    describe("When the source is a terraform.io registry host", () => {
        test("Then I expect privateRegistry, unchanged from before", () => {
            expect<SourceTypes>(typeOf("app.terraform.io/corp/k8s/azurerm")).toBe(
                SourceTypes.privateRegistry,
            );
        });
    });

    describe("When the source is another registry host", () => {
        test("Then I expect registry", () => {
            expect<SourceTypes>(typeOf("registry.opentofu.org/terraform-aws-modules/vpc/aws")).toBe(
                SourceTypes.registry,
            );
            expect<SourceTypes>(typeOf("registry.example.com/corp/networking/aws")).toBe(
                SourceTypes.registry,
            );
        });
    });

    describe("When the source is git over an explicit https url", () => {
        test("Then I expect the same label the shorthand form gets", () => {
            expect<SourceTypes>(typeOf("git::https://github.com/a/b.git//modules/vpc")).toBe(
                SourceTypes.gitHttps,
            );
            expect<SourceTypes>(typeOf("github.com/a/b")).toBe(SourceTypes.gitHttps);
        });
    });

    describe("When the source is an http address that is not a repository", () => {
        test("Then I expect url, because that is all that is known about it", () => {
            expect<SourceTypes>(typeOf("https://example.com/modules")).toBe(SourceTypes.url);
        });
    });

    describe("When the transport is plaintext", () => {
        test("Then I expect it visible in the label", () => {
            expect<SourceTypes>(typeOf("hg::http://example.com/vpc.hg")).toBe(
                SourceTypes.mercurialHttp,
            );
        });
    });

    describe("When the protocol is one the vcs can fetch over", () => {
        test("Then I expect it named, for every protocol git speaks", () => {
            expect<SourceTypes>(typeOf("git::https://github.com/a/b.git")).toBe(
                SourceTypes.gitHttps,
            );
            expect<SourceTypes>(typeOf("git::http://example.com/a/b.git")).toBe(
                SourceTypes.gitHttp,
            );
            expect<SourceTypes>(typeOf("git::ssh://git@github.com/a/b.git")).toBe(
                SourceTypes.gitSsh,
            );
            expect<SourceTypes>(typeOf("git::ftp://example.com/a/b.git")).toBe(SourceTypes.gitFtp);
            expect<SourceTypes>(typeOf("git::ftps://example.com/a/b.git")).toBe(
                SourceTypes.gitFtps,
            );
            expect<SourceTypes>(typeOf("git::git://example.com/a/b.git")).toBe(
                SourceTypes.gitDaemon,
            );
        });

        test("Then I expect mercurial named only over what it speaks", () => {
            expect<SourceTypes>(typeOf("hg::https://example.com/repo")).toBe(
                SourceTypes.mercurialHttps,
            );
            expect<SourceTypes>(typeOf("hg::ssh://example.com/repo")).toBe(
                SourceTypes.mercurialSsh,
            );
        });
    });

    describe("When the protocol is one the vcs cannot fetch over", () => {
        test("Then I expect unknown rather than a guess at https", () => {
            // Mercurial has no ftp or git transport; git dropped rsync in 2.10.
            expect<SourceTypes>(typeOf("hg::ftp://example.com/repo")).toBe(SourceTypes.unknown);
            expect<SourceTypes>(typeOf("hg::git://example.com/repo")).toBe(SourceTypes.unknown);
            expect<SourceTypes>(typeOf("git::rsync://example.com/a/b.git")).toBe(
                SourceTypes.unknown,
            );
        });
    });

    describe("When the source is shorthand", () => {
        test("Then I expect git", () => {
            expect<SourceTypes>(typeOf("github.com/owner/repo")).toBe(SourceTypes.gitHttps);
            expect<SourceTypes>(typeOf("bitbucket.org/owner/repo")).toBe(SourceTypes.gitHttps);
        });
    });

    describe("When the source uses ssh", () => {
        test("Then I expect ssh", () => {
            expect<SourceTypes>(typeOf("git@github.com:owner/repo.git")).toBe(SourceTypes.gitSsh);
            expect<SourceTypes>(typeOf("git::ssh://git@github.com/a/b.git")).toBe(
                SourceTypes.gitSsh,
            );
            expect<SourceTypes>(typeOf("git::git@github.com:a/b.git")).toBe(SourceTypes.gitSsh);
        });
    });

    describe("When the source is an archive", () => {
        test("Then I expect archive", () => {
            expect<SourceTypes>(typeOf("https://example.com/vpc-module.zip")).toBe(
                SourceTypes.archive,
            );
            expect<SourceTypes>(typeOf("s3::https://s3.amazonaws.com/bucket/vpc.zip")).toBe(
                SourceTypes.archive,
            );
            expect<SourceTypes>(typeOf("gcs::https://www.googleapis.com/storage/v1/x.zip")).toBe(
                SourceTypes.archive,
            );
        });
    });

    describe("When the source is mercurial", () => {
        test("Then I expect mercurial", () => {
            expect<SourceTypes>(typeOf("hg::http://example.com/vpc.hg")).toBe(
                SourceTypes.mercurialHttp,
            );
        });
    });

    describe("When the source is an oci artifact", () => {
        test("Then I expect oci", () => {
            expect<SourceTypes>(typeOf("oci://example.com/repo?tag=v1.0.0")).toBe(SourceTypes.oci);
        });
    });

    describe("When the source cannot be understood", () => {
        test("Then I expect unknown rather than null", () => {
            for (const raw of [
                "",
                "javascript:x.terraform.io/foo,alert(document.domain)",
                "user@a.terraform.io/path",
                "3325256838\\a.terraform.io/path",
                "https://a.terraform.io@evil.com/x",
            ]) {
                expect<SourceTypes>(typeOf(raw)).toBe(SourceTypes.unknown);
            }
        });
    });
});

describe("Given a source to link", () => {
    describe("When the source has a browsable target", () => {
        test("Then I expect a link builder", () => {
            for (const raw of [
                "./modules/vpc",
                "terraform-aws-modules/vpc/aws",
                "github.com/owner/repo",
                "git@github.com:owner/repo.git",
                "git::https://github.com/a/b.git",
                "hg::http://example.com/vpc.hg",
                "s3::https://s3.amazonaws.com/bucket/vpc.zip",
            ]) {
                expect<boolean>(linkable(raw)).toBe(true);
            }
        });
    });

    describe("When the target has no browsable address", () => {
        test("Then I expect it labeled but not linkable", () => {
            expect<boolean>(linkable("oci://example.com/repo")).toBe(false);
            expect<SourceTypes>(typeOf("oci://example.com/repo")).toBe(SourceTypes.oci);
        });
    });

    describe("When the source was rejected", () => {
        test("Then I expect it not linkable", () => {
            for (const raw of [
                "javascript:x.terraform.io/foo,alert(x)",
                "https://a.terraform.io@evil.com/x",
                "git::https://github.com@evil.com/a/b.git",
            ]) {
                expect<boolean>(linkable(raw)).toBe(false);
            }
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When each one is split, detected and classified", () => {
        test("Then I expect the label the corpus asks for", () => {
            const wrong: string[] = [];
            for (const row of MODULE_SOURCE_CORPUS) {
                const actual = read(row.source).sourceType as string;
                if (actual !== row.expectedSourceType) {
                    wrong.push(`${row.id}: got ${actual}, want ${row.expectedSourceType}`);
                }
            }
            expect<string[]>(wrong).toStrictEqual([]);
        });

        test("Then I expect a link builder wherever a link is expected", () => {
            const wrong: string[] = [];
            for (const row of MODULE_SOURCE_CORPUS) {
                if (row.pending !== null) {
                    continue;
                }
                const browsable = resolverFor(read(row.source)).linkAsync !== null;
                if (browsable !== (row.expectedResolvedUrl !== null)) {
                    wrong.push(`${row.id}: browsable ${String(browsable)}`);
                }
            }
            expect<string[]>(wrong).toStrictEqual([]);
        });
    });
});
