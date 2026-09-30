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

/**
 * Builds the link a source resolves to.
 * @param raw The source exactly as an author wrote it.
 * @param moduleName The name the block was given.
 * @param version The constraint the block declared.
 * @param page The page the source was declared on.
 * @returns The link, or null where the source has nowhere to point.
 */
const linkAsync = async (raw: string, moduleName = "m", version = "", page = PAGE) =>
    (await linker.linkAsync(classify(detect(split(raw))), moduleName, version, page)).url;

/**
 * Builds the link for each of a set of sources.
 * @param cases The sources and the link each is expected to resolve to.
 * @returns The same pairs, carrying the link each actually resolved to.
 */
const linkAll = async (cases: { raw: string; url: Nullable<string> }[]) =>
    await Promise.all(cases.map(async ({ raw }) => ({ raw, url: await linkAsync(raw) })));

/**
 * Was the set of rows blocked on the version resolver. The resolver now
 * selects the highest satisfying version, so nothing is blocked.
 */
const VERSION_BLOCKED: string[] = [];

describe("Given a local path", () => {
    describe("When the target is a directory", () => {
        test("Then I expect tree rather than the page's blob", async () => {
            // Arrange
            const raw = "./modules/vpc";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(`${FIXTURES}/tree/main/modules/vpc`);
        });
    });

    describe("When the target is a file", () => {
        test("Then I expect blob", async () => {
            // Arrange
            const raw = "./modules/vpc/main.tf";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(`${FIXTURES}/blob/main/modules/vpc/main.tf`);
        });
    });

    describe("When the path walks up from a nested file", () => {
        test("Then I expect it resolved against the page", async () => {
            // Arrange
            const raw = "../../modules/vpc";
            const page = new URL(`${FIXTURES}/blob/main/nested/deep/consumer.tf`);

            // Act
            const url = await linkAsync(raw, "m", "", page);

            // Assert
            expect<Nullable<string>>(url).toBe(`${FIXTURES}/tree/main/modules/vpc`);
        });
    });
});

describe("Given a repository source", () => {
    describe("When there is a ref and a subdir", () => {
        test("Then I expect tree at that ref", async () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git//modules/vpc?ref=v1.0.0";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://github.com/a/b/tree/v1.0.0/modules/vpc");
        });
    });

    describe("When the subdir points at a file", () => {
        test("Then I expect blob", async () => {
            // Arrange
            const raw = "git::https://github.com/a/b.git//modules/vpc/main.tf?ref=v1.0.0";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://github.com/a/b/blob/v1.0.0/modules/vpc/main.tf",
            );
        });
    });

    describe("When there is neither a ref nor a subdirectory", () => {
        test("Then I expect the repository root, not a guess at the default branch", async () => {
            // Arrange
            // `main` is a 404 on a repository that still defaults to `master`.
            const raw = "github.com/owner/repo";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://github.com/owner/repo");
        });
    });

    describe("When the source is scp style", () => {
        test("Then I expect an https browse url", async () => {
            // Arrange
            const raw = "git@github.com:owner/repo.git//modules/vpc";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://github.com/owner/repo/tree/HEAD/modules/vpc",
            );
        });
    });

    describe("When no ref is named", () => {
        test("Then I expect HEAD, because guessing main 404s on a master repository", async () => {
            // Arrange
            const raw = "github.com/owner/repo//modules/vpc";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://github.com/owner/repo/tree/HEAD/modules/vpc",
            );
        });
    });

    describe("When the host is Bitbucket", () => {
        test("Then I expect its own src route, which serves files and directories alike", async () => {
            // Arrange
            const raw = "bitbucket.org/corp/mod//modules/consul";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://bitbucket.org/corp/mod/src/HEAD/modules/consul",
            );
        });

        test("Then I expect a named ref used as written", async () => {
            // Arrange
            const raw = "bitbucket.org/corp/mod//modules/consul?ref=v1.0.0";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://bitbucket.org/corp/mod/src/v1.0.0/modules/consul",
            );
        });

        test("Then I expect the repository root when there is nothing to deep link to", async () => {
            // Arrange
            const raw = "bitbucket.org/corp/mod";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://bitbucket.org/corp/mod");
        });
    });

    describe("When the browse layout is not known", () => {
        test("Then I expect the repository root, correct but less specific", async () => {
            // Arrange
            const raw = "git::https://gitlab.internal/ns/repo.git//modules/vpc?ref=v2";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://gitlab.internal/ns/repo");
        });
    });
});

describe("Given a registry source", () => {
    describe("When the address is host qualified", () => {
        test("Then I expect it browsed on that host with no version", async () => {
            // Arrange
            const raw = "app.terraform.io/corp/k8s/azurerm";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://app.terraform.io/corp/k8s/azurerm");
        });
    });

    describe("When the address has a subdir", () => {
        test("Then I expect a submodules route", async () => {
            // Arrange
            const raw = "terraform-aws-modules/vpc/aws//modules/vpc-endpoints";

            // Act
            const url = await linkAsync(raw, "m", "6.7.3");

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3/submodules/vpc-endpoints",
            );
        });
    });

    describe("When a provider is named without a namespace", () => {
        test("Then I expect the hashicorp namespace and no throw", async () => {
            // Arrange
            const raw = "random";

            // Act
            const url = await linkAsync(raw, "required_providers.random", "");

            // Assert
            expect<boolean>(url !== null).toBe(true);
            expect<boolean>(
                (url as string).startsWith(
                    "https://registry.terraform.io/providers/hashicorp/random/",
                ),
            ).toBe(true);
        });
    });
});

describe("Given a source with no browsable target", () => {
    describe("When the source is an oci artifact", () => {
        test("Then I expect no link", async () => {
            // Arrange
            const raw = "oci://example.com/repo?tag=v1.0.0";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBeNull();
        });
    });

    describe("When the source was rejected", () => {
        test("Then I expect no link", async () => {
            // Arrange
            const cases = [
                { raw: "javascript:x.terraform.io/foo,alert(x)", url: null },
                { raw: "https://a.terraform.io@evil.com/x", url: null },
                { raw: "git::https://github.com@evil.com/a/b.git", url: null },
                { raw: "user@a.terraform.io/path", url: null },
            ];

            // Act
            const linked = await linkAll(cases);

            // Assert
            expect(linked).toEqual(cases);
        });
    });
});

describe("Given an archive or mercurial source", () => {
    describe("When a prefix wraps an http address", () => {
        test("Then I expect the underlying address", async () => {
            // Arrange
            const cases = [
                {
                    raw: "s3::https://s3.amazonaws.com/bucket/vpc.zip",
                    url: "https://s3.amazonaws.com/bucket/vpc.zip",
                },
                {
                    raw: "hg::http://example.com/vpc.hg?ref=default",
                    url: "http://example.com/vpc.hg",
                },
            ];

            // Act
            const linked = await linkAll(cases);

            // Assert
            expect(linked).toEqual(cases);
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When the new pipeline builds each link", () => {
        test("Then I expect every row to match", async () => {
            // Arrange
            const settled = MODULE_SOURCE_CORPUS.filter((row) => row.pending === null);

            // Act
            const built = await Promise.all(
                settled.map(async (row) => ({
                    row,
                    actual: await linkAsync(
                        row.source,
                        row.moduleName,
                        row.version,
                        new URL(row.pageUrl),
                    ),
                })),
            );
            const mismatched = built
                .filter(({ row, actual }) =>
                    row.match === "prefix"
                        ? actual === null ||
                          row.expectedResolvedUrl === null ||
                          !actual.startsWith(row.expectedResolvedUrl)
                        : actual !== row.expectedResolvedUrl,
                )
                .map(({ row }) => row.id);

            // Assert
            expect<string[]>(mismatched.sort()).toStrictEqual([...VERSION_BLOCKED].sort());
        });
    });
});

describe("Given an OpenTofu registry source", () => {
    const VPC = "registry.opentofu.org/terraform-aws-modules/vpc/aws";
    const SEARCH = "https://search.opentofu.org/module/terraform-aws-modules/vpc/aws";

    describe("When the version is pinned to one the registry publishes", () => {
        test("Then I expect it browsed on search.opentofu.org at that version", async () => {
            // Act
            const url = await linkAsync(VPC, "m", "6.7.3");

            // Assert
            expect<Nullable<string>>(url).toBe(`${SEARCH}/6.7.3`);
        });

        test("Then I expect a short pin padded to the published form", async () => {
            // Act
            const url = await linkAsync(VPC, "m", "6.0");

            // Assert
            expect<Nullable<string>>(url).toBe(`${SEARCH}/6.0.0`);
        });
    });

    describe("When the version is pinned to one the registry does not publish", () => {
        test("Then I expect latest rather than a link that 404s", async () => {
            // Act
            const url = await linkAsync(VPC, "m", "99.0.0");

            // Assert
            expect<Nullable<string>>(url).toBe(`${SEARCH}/latest`);
        });
    });

    describe("When the version is a range", () => {
        test("Then I expect the highest published version inside it", async () => {
            // Arrange
            const cases = [
                { version: ">= 6.0, < 7.0", url: `${SEARCH}/6.7.3` },
                { version: "~> 5.0", url: `${SEARCH}/5.21.0` },
            ];

            // Act
            const linked = await Promise.all(
                cases.map(async ({ version }) => ({
                    version,
                    url: await linkAsync(VPC, "m", version),
                })),
            );

            // Assert
            expect(linked).toEqual(cases);
        });
    });

    describe("When there is no version at all", () => {
        test("Then I expect latest, which already names the newest", async () => {
            // Act
            const url = await linkAsync(VPC, "m", "");

            // Assert
            expect<Nullable<string>>(url).toBe(`${SEARCH}/latest`);
        });
    });

    describe("When the constraint is not one terraform writes", () => {
        test("Then I expect latest rather than npm semantics", async () => {
            // Act
            const url = await linkAsync(VPC, "m", "^6.0.0");

            // Assert
            expect<Nullable<string>>(url).toBe(`${SEARCH}/latest`);
        });
    });

    describe("When the address is a provider", () => {
        test("Then I expect the singular provider route", async () => {
            // Arrange
            const raw = "registry.opentofu.org/hashicorp/aws";

            // Act
            const url = await linkAsync(raw, "required_providers.aws", "5.100.0");

            // Assert
            expect<Nullable<string>>(url).toBe(
                "https://search.opentofu.org/provider/hashicorp/aws/5.100.0",
            );
        });
    });

    describe("When the address has a subdirectory", () => {
        test("Then I expect the singular submodule route", async () => {
            // Arrange
            const raw = `${VPC}//modules/vpc-endpoints`;

            // Act
            const url = await linkAsync(raw, "m", "6.7.3");

            // Assert
            expect<Nullable<string>>(url).toBe(`${SEARCH}/6.7.3/submodule/vpc-endpoints`);
        });
    });

    describe("When the registry is neither Terraform's nor OpenTofu's", () => {
        test("Then I expect the address browsed on that host with nothing appended", async () => {
            // Arrange
            const raw = "registry.example.com/corp/networking/aws";

            // Act
            const url = await linkAsync(raw, "m", "");

            // Assert
            expect<Nullable<string>>(url).toBe("https://registry.example.com/corp/networking/aws");
        });
    });
});

describe("Given the version the popup shows beside a constraint", () => {
    const VPC = "registry.opentofu.org/terraform-aws-modules/vpc/aws";

    /**
     * Reads the version a source resolved to.
     * @param raw The source exactly as an author wrote it.
     * @param moduleName The name the block was given.
     * @param version The constraint the block declared.
     * @returns The resolved version, or an empty string where none was.
     */
    const resolvedVersion = async (raw: string, moduleName = "m", version = "") =>
        (await linker.linkAsync(classify(detect(split(raw))), moduleName, version, PAGE))
            .resolvedVersion;

    describe("When a registry source resolves a range", () => {
        test("Then I expect the version the link points at", async () => {
            // Act
            const resolved = await resolvedVersion(
                "terraform-aws-modules/vpc/aws",
                "m",
                ">= 5.0, < 6.0",
            );

            // Assert
            expect<string>(resolved).toBe("5.21.0");
        });
    });

    describe("When a registry source pins a version", () => {
        test("Then I expect that version", async () => {
            // Act
            const resolved = await resolvedVersion("terraform-aws-modules/vpc/aws", "m", "5.4.0");

            // Assert
            expect<string>(resolved).toBe("5.4.0");
        });
    });

    describe("When an OpenTofu pin is confirmed published", () => {
        test("Then I expect that version", async () => {
            // Act
            const resolved = await resolvedVersion(VPC, "m", "6.7.3");

            // Assert
            expect<string>(resolved).toBe("6.7.3");
        });
    });

    describe("When an OpenTofu range resolves", () => {
        test("Then I expect the version it selected", async () => {
            // Act
            const resolved = await resolvedVersion(VPC, "m", "~> 5.0");

            // Assert
            expect<string>(resolved).toBe("5.21.0");
        });
    });

    describe("When the source is not a registry lookup", () => {
        test("Then I expect nothing to show", async () => {
            // Arrange
            const raws = ["./modules/vpc", "github.com/owner/repo"];

            // Act
            const resolved = await Promise.all(raws.map((raw) => resolvedVersion(raw)));

            // Assert
            expect<string[]>(resolved).toEqual(raws.map(() => ""));
        });
    });

    describe("When OpenTofu falls back to latest", () => {
        test("Then I expect nothing to show, because nothing was resolved", async () => {
            // Arrange
            const versions = ["", "99.0.0"];

            // Act
            const resolved = await Promise.all(
                versions.map((version) => resolvedVersion(VPC, "m", version)),
            );

            // Assert
            expect<string[]>(resolved).toEqual(versions.map(() => ""));
        });
    });

    describe("When the source has no browsable address", () => {
        test("Then I expect nothing to show", async () => {
            // Act
            const resolved = await resolvedVersion("oci://example.com/repo?tag=v1.0.0");

            // Assert
            expect<string>(resolved).toBe("");
        });
    });
});

describe("Given a source whose locator is not a browsable address", () => {
    describe("When a mercurial or archive source did not arrive over http", () => {
        test("Then I expect no link rather than a string that cannot resolve", async () => {
            // Arrange
            const cases = [
                { raw: "hg::ssh://hg@hg.internal/repo", url: null },
                { raw: "s3::s3-eu-west-1.amazonaws.com/bucket/vpc.zip", url: null },
                { raw: "gcs::gcs.internal/bucket/foo.tar.gz", url: null },
            ];

            // Act
            const linked = await linkAll(cases);

            // Assert
            expect(linked).toEqual(cases);
        });
    });

    describe("When the same source did arrive over http", () => {
        test("Then I expect the locator, which is a url", async () => {
            // Arrange
            const cases = [
                {
                    raw: "hg::http://example.com/vpc.hg?ref=default",
                    url: "http://example.com/vpc.hg",
                },
                {
                    raw: "s3::https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip",
                    url: "https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip",
                },
            ];

            // Act
            const linked = await linkAll(cases);

            // Assert
            expect(linked).toEqual(cases);
        });
    });

    describe("When any row in the table does produce a link", () => {
        test("Then I expect it to be an http url, for every corpus row", async () => {
            // Act
            const built = await Promise.all(
                MODULE_SOURCE_CORPUS.map(async (row) => ({
                    id: row.id,
                    url: await linkAsync(
                        row.source,
                        row.moduleName,
                        row.version,
                        new URL(row.pageUrl),
                    ),
                })),
            );
            const unsafe = built
                .filter(({ url }) => url !== null && !isSafeHttpUrl(url))
                .map(({ id, url }) => `${id}: ${String(url)}`);

            // Assert
            expect<string[]>(unsafe).toEqual([]);
        });

        // The corpus holds the shapes people write. These are the shapes that
        // reach a row by a different path, and a schemeless one returning its
        // bare locator is how this invariant broke once already.
        test("Then I expect it to be an http url, for shapes outside the corpus", async () => {
            // Arrange
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
            const raws = prefixes.flatMap((prefix) =>
                locators.map((locator) => `${prefix}${locator}`),
            );

            // Act
            const built = await Promise.all(
                raws.map(async (raw) => ({ raw, url: await linkAsync(raw) })),
            );
            const unsafe = built
                .filter(({ url }) => url !== null && !isSafeHttpUrl(url))
                .map(({ raw, url }) => `${raw}: ${String(url)}`);

            // Assert
            expect<string[]>(unsafe).toEqual([]);
        });
    });
});

describe("Given a vcs prefix on a host with no browse layout", () => {
    describe("When the host is dotted and unknown", () => {
        test("Then I expect the prefix to decide, not the host", async () => {
            // Arrange
            const cases = [
                { raw: "git::example.com/ns/repo", url: "https://example.com/ns/repo" },
                { raw: "hg::example.com/ns/repo", url: "https://example.com/ns/repo" },
            ];

            // Act
            const linked = await linkAll(cases);

            // Assert
            expect(linked).toEqual(cases);
        });
    });

    describe("When no prefix is written", () => {
        test("Then I expect the same host read as a registry", async () => {
            // Arrange
            const raw = "example.com/ns/repo";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://example.com/ns/repo");
        });
    });
});

describe("Given a mercurial or archive source written without a scheme", () => {
    describe("When the host is one with a browse layout", () => {
        test("Then I expect a url built from the host, not the bare locator", async () => {
            // Arrange
            const raw = "hg::bitbucket.org/corp/repo";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("https://bitbucket.org/corp/repo");
        });
    });

    describe("When the locator already carries a scheme", () => {
        test("Then I expect it used as written", async () => {
            // Arrange
            const raw = "hg::http://example.com/vpc.hg";

            // Act
            const url = await linkAsync(raw);

            // Assert
            expect<Nullable<string>>(url).toBe("http://example.com/vpc.hg");
        });
    });
});
