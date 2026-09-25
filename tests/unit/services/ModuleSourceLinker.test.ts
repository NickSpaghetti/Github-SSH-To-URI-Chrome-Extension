import { expect } from "@jest/globals";
import { split } from "../../../src/domain/moduleSource/Split";
import { detect } from "../../../src/domain/moduleSource/Detect";
import { classify } from "../../../src/domain/moduleSource/Classify";
import { stubModuleSourceLinker } from "./RegistryStubs";
import { MODULE_SOURCE_CORPUS } from "../fixtures/module-sources";
import { Nullable } from "../../../src/types/Nullable";
import { isSafeHttpUrl } from "../../../src/util/UrlSafety";

const linker = stubModuleSourceLinker();

const FIXTURES = "https://github.com/NickSpaghetti/iac-module-linker-fixtures";
const PAGE = new URL(`${FIXTURES}/blob/main/01-local-paths.tf`);

const linkAsync = async (raw: string, moduleName = "m", version = "", page = PAGE) =>
    (await linker.linkAsync(classify(detect(split(raw))), moduleName, version, page)).url;

/**
 * Was the set of rows blocked on the version resolver. The resolver now
 * selects the highest satisfying version, so nothing is blocked.
 */
const VERSION_BLOCKED: string[] = [];

describe("Given a local path", () => {
    describe("When the target is a directory", () => {
        test("Then I expect tree rather than the page's blob", async () => {
            expect<Nullable<string>>(await linkAsync("./modules/vpc")).toBe(
                `${FIXTURES}/tree/main/modules/vpc`,
            );
        });
    });

    describe("When the target is a file", () => {
        test("Then I expect blob", async () => {
            expect<Nullable<string>>(await linkAsync("./modules/vpc/main.tf")).toBe(
                `${FIXTURES}/blob/main/modules/vpc/main.tf`,
            );
        });
    });

    describe("When the path walks up from a nested file", () => {
        test("Then I expect it resolved against the page", async () => {
            const page = new URL(`${FIXTURES}/blob/main/nested/deep/consumer.tf`);
            expect<Nullable<string>>(await linkAsync("../../modules/vpc", "m", "", page)).toBe(
                `${FIXTURES}/tree/main/modules/vpc`,
            );
        });
    });
});

describe("Given a repository source", () => {
    describe("When there is a ref and a subdir", () => {
        test("Then I expect tree at that ref", async () => {
            expect<Nullable<string>>(
                await linkAsync(`git::https://github.com/a/b.git//modules/vpc?ref=v1.0.0`),
            ).toBe("https://github.com/a/b/tree/v1.0.0/modules/vpc");
        });
    });

    describe("When the subdir points at a file", () => {
        test("Then I expect blob", async () => {
            expect<Nullable<string>>(
                await linkAsync(`git::https://github.com/a/b.git//modules/vpc/main.tf?ref=v1.0.0`),
            ).toBe("https://github.com/a/b/blob/v1.0.0/modules/vpc/main.tf");
        });
    });

    describe("When there is neither a ref nor a subdirectory", () => {
        test("Then I expect the repository root, not a guess at the default branch", async () => {
            // `main` is a 404 on a repository that still defaults to `master`.
            expect<Nullable<string>>(await linkAsync("github.com/owner/repo")).toBe(
                "https://github.com/owner/repo",
            );
        });
    });

    describe("When the source is scp style", () => {
        test("Then I expect an https browse url", async () => {
            expect<Nullable<string>>(
                await linkAsync("git@github.com:owner/repo.git//modules/vpc"),
            ).toBe("https://github.com/owner/repo/tree/HEAD/modules/vpc");
        });
    });

    describe("When no ref is named", () => {
        test("Then I expect HEAD, because guessing main 404s on a master repository", async () => {
            expect<Nullable<string>>(await linkAsync("github.com/owner/repo//modules/vpc")).toBe(
                "https://github.com/owner/repo/tree/HEAD/modules/vpc",
            );
        });
    });

    describe("When the host is Bitbucket", () => {
        test("Then I expect its own src route, which serves files and directories alike", async () => {
            expect<Nullable<string>>(
                await linkAsync("bitbucket.org/corp/mod//modules/consul"),
            ).toBe("https://bitbucket.org/corp/mod/src/HEAD/modules/consul");
        });

        test("Then I expect a named ref used as written", async () => {
            expect<Nullable<string>>(
                await linkAsync("bitbucket.org/corp/mod//modules/consul?ref=v1.0.0"),
            ).toBe("https://bitbucket.org/corp/mod/src/v1.0.0/modules/consul");
        });

        test("Then I expect the repository root when there is nothing to deep link to", async () => {
            expect<Nullable<string>>(await linkAsync("bitbucket.org/corp/mod")).toBe(
                "https://bitbucket.org/corp/mod",
            );
        });
    });

    describe("When the browse layout is not known", () => {
        test("Then I expect the repository root, correct but less specific", async () => {
            expect<Nullable<string>>(
                await linkAsync("git::https://gitlab.internal/ns/repo.git//modules/vpc?ref=v2"),
            ).toBe("https://gitlab.internal/ns/repo");
        });
    });
});

describe("Given a registry source", () => {
    describe("When the address is host qualified", () => {
        test("Then I expect it browsed on that host with no version", async () => {
            expect<Nullable<string>>(await linkAsync("app.terraform.io/corp/k8s/azurerm")).toBe(
                "https://app.terraform.io/corp/k8s/azurerm",
            );
        });
    });

    describe("When the address has a subdir", () => {
        test("Then I expect a submodules route", async () => {
            const link = await linkAsync(
                "terraform-aws-modules/vpc/aws//modules/vpc-endpoints",
                "m",
                "6.7.3",
            );
            expect<Nullable<string>>(link).toBe(
                "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3/submodules/vpc-endpoints",
            );
        });
    });

    describe("When a provider is named without a namespace", () => {
        test("Then I expect the hashicorp namespace and no throw", async () => {
            const link = await linkAsync("random", "required_providers.random", "");
            expect<boolean>(link !== null).toBe(true);
            expect<boolean>(
                (link as string).startsWith(
                    "https://registry.terraform.io/providers/hashicorp/random/",
                ),
            ).toBe(true);
        });
    });
});

describe("Given a source with no browsable target", () => {
    describe("When the source is an oci artifact", () => {
        test("Then I expect no link", async () => {
            expect<Nullable<string>>(
                await linkAsync("oci://example.com/repo?tag=v1.0.0"),
            ).toBeNull();
        });
    });

    describe("When the source was rejected", () => {
        test("Then I expect no link", async () => {
            for (const raw of [
                "javascript:x.terraform.io/foo,alert(x)",
                "https://a.terraform.io@evil.com/x",
                "git::https://github.com@evil.com/a/b.git",
                "user@a.terraform.io/path",
            ]) {
                expect<Nullable<string>>(await linkAsync(raw)).toBeNull();
            }
        });
    });
});

describe("Given an archive or mercurial source", () => {
    describe("When a prefix wraps an http address", () => {
        test("Then I expect the underlying address", async () => {
            expect<Nullable<string>>(
                await linkAsync("s3::https://s3.amazonaws.com/bucket/vpc.zip"),
            ).toBe("https://s3.amazonaws.com/bucket/vpc.zip");
            expect<Nullable<string>>(
                await linkAsync("hg::http://example.com/vpc.hg?ref=default"),
            ).toBe("http://example.com/vpc.hg");
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When the new pipeline builds each link", () => {
        test("Then I expect every row to match", async () => {
            const mismatched: string[] = [];
            for (const row of MODULE_SOURCE_CORPUS) {
                if (row.pending !== null) {
                    continue;
                }
                const actual = await linkAsync(
                    row.source,
                    row.moduleName,
                    row.version,
                    new URL(row.pageUrl),
                );
                const matches =
                    row.match === "prefix"
                        ? actual !== null &&
                          row.expectedResolvedUrl !== null &&
                          actual.startsWith(row.expectedResolvedUrl)
                        : actual === row.expectedResolvedUrl;
                if (!matches) {
                    mismatched.push(row.id);
                }
            }
            expect<string[]>(mismatched.sort()).toStrictEqual([...VERSION_BLOCKED].sort());
        });
    });
});

describe("Given an OpenTofu registry source", () => {
    describe("When the version is pinned to one the registry publishes", () => {
        test("Then I expect it browsed on search.opentofu.org at that version", async () => {
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "6.7.3",
                ),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/6.7.3");
        });

        test("Then I expect a short pin padded to the published form", async () => {
            expect<Nullable<string>>(
                await linkAsync("registry.opentofu.org/terraform-aws-modules/vpc/aws", "m", "6.0"),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/6.0.0");
        });
    });

    describe("When the version is pinned to one the registry does not publish", () => {
        test("Then I expect latest rather than a link that 404s", async () => {
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "99.0.0",
                ),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/latest");
        });
    });

    describe("When the version is a range", () => {
        test("Then I expect the highest published version inside it", async () => {
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    ">= 6.0, < 7.0",
                ),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/6.7.3");
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "~> 5.0",
                ),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/5.21.0");
        });
    });

    describe("When there is no version at all", () => {
        test("Then I expect latest, which already names the newest", async () => {
            expect<Nullable<string>>(
                await linkAsync("registry.opentofu.org/terraform-aws-modules/vpc/aws", "m", ""),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/latest");
        });
    });

    describe("When the constraint is not one terraform writes", () => {
        test("Then I expect latest rather than npm semantics", async () => {
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "^6.0.0",
                ),
            ).toBe("https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/latest");
        });
    });

    describe("When the address is a provider", () => {
        test("Then I expect the singular provider route", async () => {
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/hashicorp/aws",
                    "required_providers.aws",
                    "5.100.0",
                ),
            ).toBe("https://search.opentofu.org/provider/hashicorp/aws/5.100.0");
        });
    });

    describe("When the address has a subdirectory", () => {
        test("Then I expect the singular submodule route", async () => {
            expect<Nullable<string>>(
                await linkAsync(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws//modules/vpc-endpoints",
                    "m",
                    "6.7.3",
                ),
            ).toBe(
                "https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/6.7.3/submodule/vpc-endpoints",
            );
        });
    });

    describe("When the registry is neither Terraform's nor OpenTofu's", () => {
        test("Then I expect the address browsed on that host with nothing appended", async () => {
            expect<Nullable<string>>(
                await linkAsync("registry.example.com/corp/networking/aws", "m", ""),
            ).toBe("https://registry.example.com/corp/networking/aws");
        });
    });
});

describe("Given the version the popup shows beside a constraint", () => {
    const resolvedVersion = async (raw: string, moduleName = "m", version = "") =>
        (await linker.linkAsync(classify(detect(split(raw))), moduleName, version, PAGE))
            .resolvedVersion;

    describe("When a registry source resolves a range", () => {
        test("Then I expect the version the link points at", async () => {
            expect<string>(
                await resolvedVersion("terraform-aws-modules/vpc/aws", "m", ">= 5.0, < 6.0"),
            ).toBe("5.21.0");
        });
    });

    describe("When a registry source pins a version", () => {
        test("Then I expect that version", async () => {
            expect<string>(
                await resolvedVersion("terraform-aws-modules/vpc/aws", "m", "5.4.0"),
            ).toBe("5.4.0");
        });
    });

    describe("When an OpenTofu pin is confirmed published", () => {
        test("Then I expect that version", async () => {
            expect<string>(
                await resolvedVersion(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "6.7.3",
                ),
            ).toBe("6.7.3");
        });
    });

    describe("When an OpenTofu range resolves", () => {
        test("Then I expect the version it selected", async () => {
            expect<string>(
                await resolvedVersion(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "~> 5.0",
                ),
            ).toBe("5.21.0");
        });
    });

    describe("When the source is not a registry lookup", () => {
        test("Then I expect nothing to show", async () => {
            expect<string>(await resolvedVersion("./modules/vpc")).toBe("");
            expect<string>(await resolvedVersion("github.com/owner/repo")).toBe("");
        });
    });

    describe("When OpenTofu falls back to latest", () => {
        test("Then I expect nothing to show, because nothing was resolved", async () => {
            expect<string>(
                await resolvedVersion("registry.opentofu.org/terraform-aws-modules/vpc/aws"),
            ).toBe("");
            expect<string>(
                await resolvedVersion(
                    "registry.opentofu.org/terraform-aws-modules/vpc/aws",
                    "m",
                    "99.0.0",
                ),
            ).toBe("");
        });
    });

    describe("When the source has no browsable address", () => {
        test("Then I expect nothing to show", async () => {
            expect<string>(await resolvedVersion("oci://example.com/repo?tag=v1.0.0")).toBe("");
        });
    });
});

describe("Given a source whose locator is not a browsable address", () => {
    describe("When a mercurial or archive source did not arrive over http", () => {
        test("Then I expect no link rather than a string that cannot resolve", async () => {
            expect<Nullable<string>>(await linkAsync("hg::ssh://hg@hg.internal/repo")).toBeNull();
            expect<Nullable<string>>(
                await linkAsync("s3::s3-eu-west-1.amazonaws.com/bucket/vpc.zip"),
            ).toBeNull();
            expect<Nullable<string>>(
                await linkAsync("gcs::gcs.internal/bucket/foo.tar.gz"),
            ).toBeNull();
        });
    });

    describe("When the same source did arrive over http", () => {
        test("Then I expect the locator, which is a url", async () => {
            expect<Nullable<string>>(
                await linkAsync("hg::http://example.com/vpc.hg?ref=default"),
            ).toBe("http://example.com/vpc.hg");
            expect<Nullable<string>>(
                await linkAsync("s3::https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip"),
            ).toBe("https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip");
        });
    });

    describe("When any row in the table does produce a link", () => {
        test("Then I expect it to be an http url, for every corpus row", async () => {
            for (const row of MODULE_SOURCE_CORPUS) {
                const url = await linkAsync(
                    row.source,
                    row.moduleName,
                    row.version,
                    new URL(row.pageUrl),
                );
                if (url !== null) {
                    expect<string>(`${row.id}: ${String(isSafeHttpUrl(url))}`).toBe(
                        `${row.id}: true`,
                    );
                }
            }
        });

        // The corpus holds the shapes people write. These are the shapes that
        // reach a row by a different path, and a schemeless one returning its
        // bare locator is how this invariant broke once already.
        test("Then I expect it to be an http url, for shapes outside the corpus", async () => {
            const prefixes = ["", "git::", "hg::", "s3::", "gcs::"];
            const locators = [
                "example.com/ns/repo",
                "bitbucket.org/corp/repo",
                "github.com/o/r//modules/vpc",
                "https://example.com/a.zip",
                "http://example.com/vpc.hg",
                "ssh://git@example.com/ns/repo",
                "ftp://example.com/ns/repo",
                "git@example.com:ns/repo.git",
            ];
            for (const prefix of prefixes) {
                for (const locator of locators) {
                    const raw = `${prefix}${locator}`;
                    const url = await linkAsync(raw);
                    if (url !== null) {
                        expect<string>(`${raw}: ${String(isSafeHttpUrl(url))}`).toBe(
                            `${raw}: true`,
                        );
                    }
                }
            }
        });
    });
});

describe("Given a vcs prefix on a host with no browse layout", () => {
    describe("When the host is dotted and unknown", () => {
        test("Then I expect the prefix to decide, not the host", async () => {
            expect<Nullable<string>>(await linkAsync("git::example.com/ns/repo")).toBe(
                "https://example.com/ns/repo",
            );
            expect<Nullable<string>>(await linkAsync("hg::example.com/ns/repo")).toBe(
                "https://example.com/ns/repo",
            );
        });
    });

    describe("When no prefix is written", () => {
        test("Then I expect the same host read as a registry", async () => {
            expect<Nullable<string>>(await linkAsync("example.com/ns/repo")).toBe(
                "https://example.com/ns/repo",
            );
        });
    });
});

describe("Given a mercurial or archive source written without a scheme", () => {
    describe("When the host is one with a browse layout", () => {
        test("Then I expect a url built from the host, not the bare locator", async () => {
            expect<Nullable<string>>(await linkAsync("hg::bitbucket.org/corp/repo")).toBe(
                "https://bitbucket.org/corp/repo",
            );
        });
    });

    describe("When the locator already carries a scheme", () => {
        test("Then I expect it used as written", async () => {
            expect<Nullable<string>>(await linkAsync("hg::http://example.com/vpc.hg")).toBe(
                "http://example.com/vpc.hg",
            );
        });
    });
});
