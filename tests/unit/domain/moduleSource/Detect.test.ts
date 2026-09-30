import { expect } from "@jest/globals";
import { split } from "../../../../src/domain/moduleSource/Split";
import { detect } from "../../../../src/domain/moduleSource/Detect";
import { MODULE_SOURCE_FLAGS, ModuleSource, hasFlag } from "../../../../src/types/ModuleSource";
import { MODULE_SOURCE_CORPUS } from "../../fixtures/module-sources";

/**
 * Splits a raw source and detects what it addresses.
 * @param raw The source exactly as an author wrote it.
 * @returns The source with its transport, host and flags filled in.
 */
const read = (raw: string): ModuleSource => detect(split(raw));

describe("Given a local path", () => {
    describe("When the path starts with ./ or ../", () => {
        test("Then I expect LocalPath and no host", () => {
            // Arrange
            const raws = ["./modules/vpc", "../../modules/vpc"];

            // Act
            const detected = raws.map((raw) => {
                const source = read(raw);
                return {
                    local: hasFlag(source, MODULE_SOURCE_FLAGS.LocalPath),
                    host: source.host,
                    path: source.path,
                };
            });

            // Assert
            expect(detected).toEqual(raws.map((raw) => ({ local: true, host: "", path: raw })));
        });
    });
});

describe("Given a registry address", () => {
    describe("When the address has no hostname", () => {
        test("Then I expect RegistryAddress with no host", () => {
            // Arrange
            const raw = "terraform-aws-modules/vpc/aws";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress)).toBe(true);
            expect<string>(source.host).toBe("");
            expect<string>(source.registryHost).toBe("");
        });
    });

    describe("When the address is host qualified", () => {
        test("Then I expect the registry host to be recorded", () => {
            // Arrange
            const raw = "registry.opentofu.org/terraform-aws-modules/vpc/aws";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress)).toBe(true);
            expect<string>(source.registryHost).toBe("registry.opentofu.org");
        });
    });

    describe("When the address has a subdir", () => {
        test("Then I expect the subdir not to disturb detection", () => {
            // Arrange
            const raw = "terraform-aws-modules/vpc/aws//modules/vpc-endpoints";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress)).toBe(true);
            expect<string>(source.subDirectory).toBe("modules/vpc-endpoints");
        });
    });
});

describe("Given GitHub shorthand", () => {
    describe("When the source is github.com/owner/repo", () => {
        test("Then I expect it expanded to git over https", () => {
            // Arrange
            const raw = "github.com/NickSpaghetti/iac-module-linker-fixtures";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress)).toBe(true);
            expect<string>(source.scheme).toBe("https");
            expect<string>(source.host).toBe("github.com");
            expect<string>(source.path).toBe("/NickSpaghetti/iac-module-linker-fixtures");
        });
    });

    describe("When the source is bitbucket.org/owner/repo", () => {
        test("Then I expect it expanded to git over https", () => {
            // Arrange
            const raw = "bitbucket.org/example-corp/tofu-consul-aws";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress)).toBe(true);
            expect<string>(source.host).toBe("bitbucket.org");
        });
    });
});

describe("Given an scp style address", () => {
    describe("When the source has no git:: prefix", () => {
        test("Then I expect ssh transport and a parsed host", () => {
            // Arrange
            const raw = "git@github.com:NickSpaghetti/iac-module-linker-fixtures.git";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.SshTransport)).toBe(true);
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress)).toBe(true);
            expect<string>(source.user).toBe("git");
            expect<string>(source.host).toBe("github.com");
            expect<string>(source.path).toBe("/NickSpaghetti/iac-module-linker-fixtures.git");
        });
    });

    describe("When the source has a git:: prefix", () => {
        test("Then I expect the same result", () => {
            // Arrange
            const raw = "git::git@github.com:a/b.git//modules/vpc?ref=v1.0.0";

            // Act
            const source = read(raw);

            // Assert
            expect<string>(source.host).toBe("github.com");
            expect<string>(source.subDirectory).toBe("modules/vpc");
            expect<string>(source.ref).toBe("v1.0.0");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.SshTransport)).toBe(true);
        });
    });
});

describe("Given a scheme", () => {
    describe("When the scheme is oci", () => {
        test("Then I expect OciArtifact", () => {
            // Arrange
            const raw = "oci://example.com/repository-name?tag=v1.0.0";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.OciArtifact)).toBe(true);
            expect<string>(source.scheme).toBe("oci");
            expect<string>(source.ref).toBe("v1.0.0");
        });
    });

    describe("When the source is an archive over https", () => {
        test("Then I expect Archive", () => {
            // Arrange
            const raws = [
                "https://example.com/vpc-module.zip",
                "s3::https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip",
                "gcs::https://www.googleapis.com/storage/v1/modules/foo.zip",
            ];

            // Act
            const archives = raws.map((raw) => hasFlag(read(raw), MODULE_SOURCE_FLAGS.Archive));

            // Assert
            expect<boolean[]>(archives).toEqual(raws.map(() => true));
        });
    });

    describe("When the prefix is hg", () => {
        test("Then I expect the underlying http url to be parsed", () => {
            // Arrange
            const raw = "hg::http://example.com/vpc.hg";

            // Act
            const source = read(raw);

            // Assert
            expect<string>(source.prefix).toBe("hg");
            expect<string>(source.scheme).toBe("http");
            expect<string>(source.host).toBe("example.com");
        });
    });
});

describe("Given a host confusion attempt", () => {
    describe("When the source uses a javascript: scheme", () => {
        test("Then I expect Unsupported", () => {
            // Arrange
            const raw = "javascript:x.terraform.io/foo,alert(document.domain)";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
            expect<string>(source.host).toBe("");
        });
    });

    describe("When the source smuggles userinfo", () => {
        test("Then I expect Unsupported", () => {
            // Arrange
            const raw = "user@a.terraform.io/path";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
        });
    });

    describe("When the source hides a decimal IP behind a backslash", () => {
        test("Then I expect Unsupported, because the host canonicalizes to an address", () => {
            // Arrange
            const raw = "3325256838\\a.terraform.io/path";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
        });
    });

    describe("When userinfo spoofs the host on an http scheme", () => {
        test("Then I expect Unsupported, because the browser would go to evil.com", () => {
            // Arrange
            const raws = [
                "a.terraform.io@evil.com/x",
                "https://a.terraform.io@evil.com/x",
                "git::https://github.com@evil.com/a/b.git",
            ];

            // Act
            const detected = raws.map((raw) => {
                const source = read(raw);
                return {
                    raw,
                    unsupported: hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported),
                    host: source.host,
                };
            });

            // Assert
            expect(detected).toEqual(raws.map((raw) => ({ raw, unsupported: true, host: "" })));
        });
    });

    describe("When userinfo appears on an ssh source", () => {
        test("Then I expect it accepted, because git@host is the normal form", () => {
            // Arrange
            const raws = [
                "git::ssh://git@github.com/a/b.git//modules/vpc?ref=v1.0.0",
                "git@github.com:a/b.git",
                "git::git@github.com:a/b.git//modules/vpc?ref=v1.0.0",
            ];

            // Act
            const detected = raws.map((raw) => {
                const source = read(raw);
                return {
                    raw,
                    unsupported: hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported),
                    host: source.host,
                    user: source.user,
                };
            });

            // Assert
            expect(detected).toEqual(
                raws.map((raw) => ({
                    raw,
                    unsupported: false,
                    host: "github.com",
                    user: "git",
                })),
            );
        });
    });

    describe("When the backslash does not change the resolved host", () => {
        test("Then I expect it accepted against the real terraform.io host", () => {
            // Arrange
            const raw = "a.terraform.io\\@evil.com/x";

            // Act
            const source = read(raw);

            // Assert
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(false);
            expect<string>(source.host).toBe("a.terraform.io");
            expect<string>(source.path).toBe("/@evil.com/x");
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When each one is split and detected", () => {
        test("Then I expect no throw", () => {
            // Act
            const raws = MODULE_SOURCE_CORPUS.map((row) => read(row.source).raw);

            // Assert
            expect<string[]>(raws).toEqual(MODULE_SOURCE_CORPUS.map((row) => row.source));
        });

        test("Then I expect a host wherever a scheme was resolved", () => {
            // Act
            const hostless = MODULE_SOURCE_CORPUS.map((row) => read(row.source))
                .filter((source) => source.scheme !== "" && source.host === "")
                .map((source) => source.raw);

            // Assert
            expect<string[]>(hostless).toEqual([]);
        });
    });
});
