import { expect } from "@jest/globals";
import { split } from "../../../../src/domain/moduleSource/Split";
import { detect } from "../../../../src/domain/moduleSource/Detect";
import { MODULE_SOURCE_FLAGS, ModuleSource, hasFlag } from "../../../../src/types/ModuleSource";
import { MODULE_SOURCE_CORPUS } from "../../fixtures/module-sources";

const read = (raw: string): ModuleSource => detect(split(raw));

describe("Given a local path", () => {
    describe("When the path starts with ./ or ../", () => {
        test("Then I expect LocalPath and no host", () => {
            for (const raw of ["./modules/vpc", "../../modules/vpc"]) {
                const source = read(raw);
                expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.LocalPath)).toBe(true);
                expect<string>(source.host).toBe("");
                expect<string>(source.path).toBe(raw);
            }
        });
    });
});

describe("Given a registry address", () => {
    describe("When the address has no hostname", () => {
        test("Then I expect RegistryAddress with no host", () => {
            const source = read("terraform-aws-modules/vpc/aws");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress)).toBe(true);
            expect<string>(source.host).toBe("");
            expect<string>(source.registryHost).toBe("");
        });
    });

    describe("When the address is host qualified", () => {
        test("Then I expect the registry host to be recorded", () => {
            const source = read("registry.opentofu.org/terraform-aws-modules/vpc/aws");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress)).toBe(true);
            expect<string>(source.registryHost).toBe("registry.opentofu.org");
        });
    });

    describe("When the address has a subdir", () => {
        test("Then I expect the subdir not to disturb detection", () => {
            const source = read("terraform-aws-modules/vpc/aws//modules/vpc-endpoints");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress)).toBe(true);
            expect<string>(source.subDirectory).toBe("modules/vpc-endpoints");
        });
    });
});

describe("Given GitHub shorthand", () => {
    describe("When the source is github.com/owner/repo", () => {
        test("Then I expect it expanded to git over https", () => {
            const source = read("github.com/NickSpaghetti/iac-module-linker-fixtures");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress)).toBe(true);
            expect<string>(source.scheme).toBe("https");
            expect<string>(source.host).toBe("github.com");
            expect<string>(source.path).toBe("/NickSpaghetti/iac-module-linker-fixtures");
        });
    });

    describe("When the source is bitbucket.org/owner/repo", () => {
        test("Then I expect it expanded to git over https", () => {
            const source = read("bitbucket.org/example-corp/tofu-consul-aws");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress)).toBe(true);
            expect<string>(source.host).toBe("bitbucket.org");
        });
    });
});

describe("Given an scp style address", () => {
    describe("When the source has no git:: prefix", () => {
        test("Then I expect ssh transport and a parsed host", () => {
            const source = read("git@github.com:NickSpaghetti/iac-module-linker-fixtures.git");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.SshTransport)).toBe(true);
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress)).toBe(true);
            expect<string>(source.user).toBe("git");
            expect<string>(source.host).toBe("github.com");
            expect<string>(source.path).toBe("/NickSpaghetti/iac-module-linker-fixtures.git");
        });
    });

    describe("When the source has a git:: prefix", () => {
        test("Then I expect the same result", () => {
            const source = read("git::git@github.com:a/b.git//modules/vpc?ref=v1.0.0");
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
            const source = read("oci://example.com/repository-name?tag=v1.0.0");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.OciArtifact)).toBe(true);
            expect<string>(source.scheme).toBe("oci");
            expect<string>(source.ref).toBe("v1.0.0");
        });
    });

    describe("When the source is an archive over https", () => {
        test("Then I expect Archive", () => {
            for (const raw of [
                "https://example.com/vpc-module.zip",
                "s3::https://s3-eu-west-1.amazonaws.com/bucket/vpc.zip",
                "gcs::https://www.googleapis.com/storage/v1/modules/foo.zip",
            ]) {
                expect<boolean>(hasFlag(read(raw), MODULE_SOURCE_FLAGS.Archive)).toBe(true);
            }
        });
    });

    describe("When the prefix is hg", () => {
        test("Then I expect the underlying http url to be parsed", () => {
            const source = read("hg::http://example.com/vpc.hg");
            expect<string>(source.prefix).toBe("hg");
            expect<string>(source.scheme).toBe("http");
            expect<string>(source.host).toBe("example.com");
        });
    });
});

describe("Given a host confusion attempt", () => {
    describe("When the source uses a javascript: scheme", () => {
        test("Then I expect Unsupported", () => {
            const source = read("javascript:x.terraform.io/foo,alert(document.domain)");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
            expect<string>(source.host).toBe("");
        });
    });

    describe("When the source smuggles userinfo", () => {
        test("Then I expect Unsupported", () => {
            const source = read("user@a.terraform.io/path");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
        });
    });

    describe("When the source hides a decimal IP behind a backslash", () => {
        test("Then I expect Unsupported, because the host canonicalizes to an address", () => {
            const source = read("3325256838\\a.terraform.io/path");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
        });
    });

    describe("When userinfo spoofs the host on an http scheme", () => {
        test("Then I expect Unsupported, because the browser would go to evil.com", () => {
            for (const raw of [
                "a.terraform.io@evil.com/x",
                "https://a.terraform.io@evil.com/x",
                "git::https://github.com@evil.com/a/b.git",
            ]) {
                const source = read(raw);
                expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(true);
                expect<string>(source.host).toBe("");
            }
        });
    });

    describe("When userinfo appears on an ssh source", () => {
        test("Then I expect it accepted, because git@host is the normal form", () => {
            for (const raw of [
                "git::ssh://git@github.com/a/b.git//modules/vpc?ref=v1.0.0",
                "git@github.com:a/b.git",
                "git::git@github.com:a/b.git//modules/vpc?ref=v1.0.0",
            ]) {
                const source = read(raw);
                expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(false);
                expect<string>(source.host).toBe("github.com");
                expect<string>(source.user).toBe("git");
            }
        });
    });

    describe("When the backslash does not change the resolved host", () => {
        test("Then I expect it accepted against the real terraform.io host", () => {
            const source = read("a.terraform.io\\@evil.com/x");
            expect<boolean>(hasFlag(source, MODULE_SOURCE_FLAGS.Unsupported)).toBe(false);
            expect<string>(source.host).toBe("a.terraform.io");
            expect<string>(source.path).toBe("/@evil.com/x");
        });
    });
});

describe("Given every source in the corpus", () => {
    describe("When each one is split and detected", () => {
        test("Then I expect no throw", () => {
            for (const row of MODULE_SOURCE_CORPUS) {
                expect<string>(read(row.source).raw).toBe(row.source);
            }
        });

        test("Then I expect a host wherever a scheme was resolved", () => {
            for (const row of MODULE_SOURCE_CORPUS) {
                const source = read(row.source);
                if (source.scheme !== "") {
                    expect<string>(source.host).not.toBe("");
                }
            }
        });
    });
});
