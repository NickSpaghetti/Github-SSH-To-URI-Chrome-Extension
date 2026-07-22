import { HclSourceService } from "../../../src/services/HclSourceService";
import { Nullable } from "../../../src/types/Nullable";
import { SourceTypes } from "../../../src/types/SourceTypes";
import { expect } from "@jest/globals";
import { TERRAFORM_SYNTAX } from "../../../src/util/constants";
import { ITerraformFetchService } from "../../../src/services/ITerraformFetchService";
import { TerraformFetchService } from "../../../src/services/TerraformFetchService";
import { TerraformDataAccess } from "../../../src/data-access/TerraformDataAccess";
import { MockFetchService } from "./MockFetchService";

const terraformFetchService: ITerraformFetchService = new TerraformFetchService(
    new TerraformDataAccess(new MockFetchService()),
);
let hlcSourceService: HclSourceService;
beforeAll(() => {
    hlcSourceService = new HclSourceService(terraformFetchService);
});

describe("Given a github file path", () => {
    describe("When path starts with ./", () => {
        test("Then I expect isFilePath to be true", () => {
            expect<boolean>(hlcSourceService.isFilePath("./foo/bar")).toBe(true);
        });
    });

    describe("When path starts with ../", () => {
        test("Then I expect isFilePath to be true", () => {
            expect<boolean>(hlcSourceService.isFilePath("../foo/bar")).toBe(true);
        });
    });

    describe("When path is an empty string", () => {
        test("Then I expect isFilePath to be false", () => {
            expect<boolean>(hlcSourceService.isFilePath("")).toBe(false);
        });
    });

    describe("When path does not start with ./ or .// string", () => {
        test("Then I expect isFilePath to be false", () => {
            expect<boolean>(hlcSourceService.isFilePath("/foo/bar")).toBe(false);
        });
    });
});

describe("Given a ssh string", () => {
    describe("When string is a url", () => {
        test("Then I expect isSSH to be false", () => {
            expect<boolean>(hlcSourceService.isSSH("https://github.com")).toBe(false);
        });
    });

    describe("When string is a file path", () => {
        test("Then I Expect isSSH to be false", () => {
            expect<boolean>(hlcSourceService.isSSH("../foo/bar")).toBe(false);
        });
    });
    describe("When string is a terraform registry path", () => {
        test("Then I expect isSSH to be false", () => {
            expect<boolean>(hlcSourceService.isSSH("aws/cloud")).toBe(false);
        });
    });
    describe("When string is a ssh Host", () => {
        test("Then I expect isSSH to be true", () => {
            expect<boolean>(
                hlcSourceService.isSSH(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6",
                ),
            ).toBe(true);
        });
    });
});

describe("Given a url", () => {
    describe("When the url is a valid url", () => {
        test("Then I expect isHost to return true", () => {
            expect<boolean>(hlcSourceService.isHost("https://github.com")).toBe(true);
        });
    });
    describe("When string is a file path", () => {
        test("Then I Expect isHost to be false", () => {
            expect<boolean>(hlcSourceService.isHost("../foo/bar")).toBe(false);
        });
    });
    describe("When string is a terraform registry path", () => {
        test("Then I expect isHost to be false", () => {
            expect<boolean>(hlcSourceService.isHost("aws/cloud")).toBe(false);
        });
    });
    describe("When string is a ssh Host", () => {
        test("Then I expect isHost to be false", () => {
            expect<boolean>(
                hlcSourceService.isHost(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6",
                ),
            ).toBe(false);
        });
    });
    describe("When string is empty", () => {
        test("Then I expect isHost to be false", () => {
            expect<boolean>(hlcSourceService.isHost("")).toBe(false);
        });
    });
    describe("When string is git::https://github.com", () => {
        test("Then I expect isHost to be true", () => {
            expect<boolean>(hlcSourceService.isHost("git::https://github.com")).toBe(true);
        });
    });
    describe("When string is git::'git::https://github.com/gruntwork-io/terraform-aws-data-storage.git//modules/aurora?ref=v0.40.6'", () => {
        test("Then I expect isHost to be true", () => {
            expect<boolean>(
                hlcSourceService.isHost(
                    "git::https://github.com/gruntwork-io/terraform-aws-data-storage.git//modules/aurora?ref=v0.40.6",
                ),
            ).toBe(true);
        });
    });
});

describe("Given a Public Registry", () => {
    describe("When the Public Registry is a valid url", () => {
        test("Then I expect isRegistry to return false", () => {
            expect<boolean>(hlcSourceService.isRegistry("https://github.com")).toBe(false);
        });
    });
    describe("When Public Registry is a file path", () => {
        test("Then I Expect isRegistry to be false", () => {
            expect<boolean>(hlcSourceService.isRegistry("../foo/bar")).toBe(false);
        });
    });
    describe("When Public Registry is a terraform registry path", () => {
        test("Then I expect isRegistry to be true", () => {
            expect<boolean>(hlcSourceService.isRegistry("clouddrove/labels/aws")).toBe(true);
        });
    });
    describe("When Public Registry is a terraform registry path", () => {
        test("Then I expect isRegistry to be true", () => {
            expect<boolean>(hlcSourceService.isRegistry("hashicorp/aws")).toBe(true);
        });
    });
    describe("When Public Registry is aws", () => {
        test('Then I expect RegistryToUrl("hashicorp/aws","Provider.hashicorp/aws","") to be hashicorp/aws', async () => {
            expect<string>(
                await hlcSourceService.registryToUrlAsync(
                    "hashicorp/aws",
                    `${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.hashicorp/aws`,
                    "",
                ),
            ).toContain("https://registry.terraform.io/providers/hashicorp/aws/");
        });
        test('Then I expect RegistryToUrl("required_provider.hashicorp/aws","4.58.0") to be providers/hashicorp/aws/4.58.0', async () => {
            expect<string>(
                await hlcSourceService.registryToUrlAsync(
                    "hashicorp/aws",
                    `${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.hashicorp/aws`,
                    "4.58.0",
                ),
            ).toBe("https://registry.terraform.io/providers/hashicorp/aws/4.58.0");
        });
        test('Then I expect RegistryToUrl("module.terraform-aws-modules/vpc/aws","4.58.0") to be providers/hashicorp/aws/4.58.0', async () => {
            expect<string>(
                await hlcSourceService.registryToUrlAsync("hashicorp/consul/aws", "", ""),
            ).toContain("https://registry.terraform.io/modules/hashicorp/consul/aws/");
            expect<string>(
                await hlcSourceService.registryToUrlAsync("hashicorp/consul/aws", "", "0.11"),
            ).toBe("https://registry.terraform.io/modules/hashicorp/consul/aws/0.11.0");
            expect<string>(
                await hlcSourceService.registryToUrlAsync(
                    "terraform-aws-modules/vpc/aws",
                    `${TERRAFORM_SYNTAX.MODULE}.vpc`,
                    "",
                ),
            ).toContain("https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/");
            expect<string>(
                await hlcSourceService.registryToUrlAsync(
                    "terraform-aws-modules/vpc/aws",
                    `${TERRAFORM_SYNTAX.MODULE}.vpc`,
                    "5.0.0",
                ),
            ).toBe("https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/5.0.0");
        });
    });
    describe("When Public Registry is a ssh Host", () => {
        test("Then I expect isRegistry to be false", () => {
            expect<boolean>(
                hlcSourceService.isRegistry(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6",
                ),
            ).toBe(false);
        });
    });
    describe("When Public Registry is empty", () => {
        test("Then I expect isRegistry to be false", () => {
            expect<boolean>(hlcSourceService.isRegistry("")).toBe(false);
        });
    });
});

describe("Given a Private Registry", () => {
    describe("When the Private Registry is a valid url", () => {
        test("Then I expect isPrivateRegistry to return false", () => {
            expect<boolean>(hlcSourceService.isPrivateRegistry("https://github.com")).toBe(false);
        });
    });
    describe("When Private Registry is a file path", () => {
        test("Then I Expect isPrivateRegistry to be false", () => {
            expect<boolean>(hlcSourceService.isPrivateRegistry("../foo/bar")).toBe(false);
        });
    });
    describe("When Private Registry is a terraform registry path", () => {
        test("Then I expect isPrivateRegistry to be false", () => {
            expect<boolean>(hlcSourceService.isPrivateRegistry("clouddrove/labels/aws")).toBe(
                false,
            );
        });
    });
    describe("When Private Registry is a ssh Host", () => {
        test("Then I expect isPrivateRegistry to be false", () => {
            expect<boolean>(
                hlcSourceService.isPrivateRegistry(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6",
                ),
            ).toBe(false);
        });
    });
    describe("When Private Registry is empty", () => {
        test("Then I expect isPrivateRegistry to be false", () => {
            expect<boolean>(hlcSourceService.isPrivateRegistry("")).toBe(false);
        });
    });
    describe("When Private Registry is valid", () => {
        test("Then I expect isPrivateRegistry to be true", () => {
            expect<boolean>(
                hlcSourceService.isPrivateRegistry(
                    "https://app.terraform.io/hashicorp-learn/foo/bar",
                ),
            ).toBe(true);
            expect<boolean>(
                hlcSourceService.isPrivateRegistry(
                    "http://app.terraform.io/hashicorp-learn/foo/bar",
                ),
            ).toBe(true);
            expect<boolean>(
                hlcSourceService.isPrivateRegistry("app.terraform.io/hashicorp-learn/foo/bar"),
            ).toBe(true);
        });
    });
});

describe("Given a ssh host", () => {
    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/lambda", () => {
            expect<string>(
                hlcSourceService.sshToUrl(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/lambda",
            );
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/modules/lambda", () => {
            expect<string>(
                hlcSourceService.sshToUrl(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda",
                ),
            ).toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/modules/lambda");
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/", () => {
            expect<string>(
                hlcSourceService.sshToUrl(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git",
                ),
            ).toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/");
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/blob/main/modules/main.tf", () => {
            expect<string>(
                hlcSourceService.sshToUrl(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/blob/main/modules/main.tf",
            );
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/blob/2.0.0/modules/main.tf", () => {
            expect<string>(
                hlcSourceService.sshToUrl(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/blob/2.0.0/modules/main.tf",
            );
        });
    });

    describe("When ssh host is invalid", () => {
        test("Then I expect the url to be the original ssh host", () => {
            expect<string>(hlcSourceService.sshToUrl("")).toBe("");
            expect<string>(hlcSourceService.sshToUrl("https://google.com")).toBe(
                "https://google.com",
            );
            expect<string>(hlcSourceService.sshToUrl("./foo/bar")).toBe("./foo/bar");
            expect<string>(hlcSourceService.sshToUrl("../foo/bar")).toBe("../foo/bar");
        });
    });
});

describe("Given a host", () => {
    describe("When host is git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/lambda", () => {
            expect<string>(
                hlcSourceService.hostToUrl(
                    "git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/lambda",
            );
        });
    });

    describe("When host is git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/lambda", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/modules/lambda", () => {
            expect<string>(
                hlcSourceService.hostToUrl(
                    "git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/lambda",
                ),
            ).toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/modules/lambda");
        });
    });

    describe("When ssh host is git::https://github.com/gruntwork-io/terraform-aws-lambda.git", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/", () => {
            expect<string>(
                hlcSourceService.hostToUrl(
                    "git::https://github.com/gruntwork-io/terraform-aws-lambda.git",
                ),
            ).toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/");
        });
    });

    describe("When host is is git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/main.tf", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/blob/main/modules/main.tf", () => {
            expect<string>(
                hlcSourceService.hostToUrl(
                    "git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/main.tf",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/blob/main/modules/main.tf",
            );
        });
    });

    describe("When host is is git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/blob/2.0.0/modules/main.tf", () => {
            expect<string>(
                hlcSourceService.hostToUrl(
                    "git::https://github.com/gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/blob/2.0.0/modules/main.tf",
            );
        });
    });

    describe("When host is is https://github.com/NickSpaghetti/foobar", () => {
        test("Then I expect the url to be  https://github.com/NickSpaghetti/foobar", () => {
            expect<string>(
                hlcSourceService.hostToUrl(" https://github.com/NickSpaghetti/foobar"),
            ).toBe(" https://github.com/NickSpaghetti/foobar");
        });
    });
});

describe("Given a relative file path", () => {
    describe("When relative path is host is ../../base/ec2-baseline and the path is https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/mgmt/lambdas/main.tf", () => {
        test("Then I expect the url to be  https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/base/ec2-baseline", () => {
            expect<string>(
                hlcSourceService.pathToUrl(
                    "../../base/ec2-baseline",
                    "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/mgmt/lambdas/main.tf",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/base/ec2-baseline",
            );
        });
    });
    describe("When relative path is host is ../base/ec2-baseline and the path is https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/mgmt/lambdas/main.tf", () => {
        test("Then I expect the url to be  https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/base/ec2-baseline", () => {
            expect<string>(
                hlcSourceService.pathToUrl(
                    "../base/ec2-baseline",
                    "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/mgmt/lambdas/main.tf",
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/mgmt/base/ec2-baseline",
            );
        });
    });
});

describe("Given a Source", () => {
    describe("When the Source is an Empty String", () => {
        test("Then I expect SourceTypes to be NULL", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.getSourceType("")).toBe(null);
        });
    });

    describe("When the Source is an SSH Host", () => {
        test("Then I expect SourceTypes to be SSH", () => {
            expect<Nullable<SourceTypes>>(
                hlcSourceService.getSourceType(
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0",
                ),
            ).toBe(SourceTypes.ssh);
        });
    });

    describe("When the Source is a url", () => {
        test("Then I expect SourceTypes to be url", () => {
            expect<Nullable<SourceTypes>>(
                hlcSourceService.getSourceType("https://Google.com"),
            ).toBe(SourceTypes.url);
        });
    });

    describe("When the Source is a path", () => {
        test("Then I expect SourceTypes to be path", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.getSourceType("../foo/bar")).toBe(
                SourceTypes.path,
            );
            expect<Nullable<SourceTypes>>(hlcSourceService.getSourceType("./foo/bar")).toBe(
                SourceTypes.path,
            );
        });
    });

    describe("When the Source is a Public Registry", () => {
        test("Then I expect SourceTypes to be Public Registry", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.getSourceType("foo/bar")).toBe(
                SourceTypes.registry,
            );
        });
    });

    describe("When the Source is a Private Registry", () => {
        test("Then I expect SourceTypes to be Private Registry", () => {
            expect<Nullable<SourceTypes>>(
                hlcSourceService.getSourceType("app.terraform.io/foo/bar"),
            ).toBe(SourceTypes.privateRegistry);
        });
    });
});

describe("Given a SourceType, Source,  ModuleName, and Source Version", () => {
    describe("When url, github.com, foo, ''", () => {
        test("I expect the result to be github.com", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.url,
                    "github.com",
                    "foo",
                    "",
                    new URL("https://github.com"),
                ),
            ).toBe("github.com");
        });
    });

    describe("When ssh, git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda.tf?ref=v2.0.0, foo, ''", () => {
        test("I expect the result to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/v2.0.0/modules/lambda", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.ssh,
                    "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v2.0.0",
                    "foo",
                    "",
                    new URL("https://github.com"),
                ),
            ).toBe(
                "https://github.com/gruntwork-io/terraform-aws-lambda/tree/v2.0.0/modules/lambda",
            );
        });
    });

    describe("When path, ../foo/bar, foo, ''", () => {
        test("I expect the result to be ../foo/bar", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.path,
                    "../foo/bar",
                    "foo",
                    "",
                    new URL(
                        "https://github.com/NickSpaghetti/terraform-up-and-running-3rd-edition/blob/main/Chapters/5/modules/services/webserver-cluster/main.tf",
                    ),
                ),
            ).toBe(
                "https://github.com/NickSpaghetti/terraform-up-and-running-3rd-edition/blob/main/Chapters/5/modules/services/foo/bar",
            );
        });
    });

    describe("When path, ./foo/bar, foo, ''", () => {
        test("I expect the result to be github.com", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.path,
                    "./foo/bar",
                    "foo",
                    "",
                    new URL(
                        "https://github.com/NickSpaghetti/terraform-up-and-running-3rd-edition/blob/main/Chapters/5/modules/services/webserver-cluster/main.tf",
                    ),
                ),
            ).toBe(
                "https://github.com/NickSpaghetti/terraform-up-and-running-3rd-edition/blob/main/Chapters/5/modules/services/webserver-cluster/foo/bar",
            );
        });
    });

    describe("When registry for module hashicorp/aws foo, ''", () => {
        test("I expect the result to be https://registry.terraform.io/modules/hashicorp/consul/aws/", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.registry,
                    "hashicorp/consul/aws",
                    "foo",
                    "",
                    new URL("https://github.com"),
                ),
            ).toContain("https://registry.terraform.io/modules/hashicorp/consul/aws/");
        });
    });

    describe("When registry for module hashicorp/consul/aws/ foo, '0.11.0'", () => {
        test("I expect the result to be github.com", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.registry,
                    "hashicorp/consul/aws",
                    "foo",
                    "1.0.0",
                    new URL("https://github.com"),
                ),
            ).toBe("https://registry.terraform.io/modules/hashicorp/consul/aws/0.11.0");
        });
    });

    describe("When private registry, bar.terraform.io/foo/aws foo, ''", () => {
        test("I expect the result to be bar.terraform.io/foo/aws", async () => {
            expect(
                await hlcSourceService.resolveSourceAsync(
                    SourceTypes.privateRegistry,
                    "bar.terraform.io/foo/aws",
                    "foo",
                    "1.0.0",
                    new URL("https://github.com"),
                ),
            ).toBe("bar.terraform.io/foo/aws");
        });
    });
});
