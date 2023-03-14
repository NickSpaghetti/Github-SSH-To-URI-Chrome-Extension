import {HclSourceService} from "../../../src/services/HclSourceService";
import {Nullable} from "../../../src/types/Nullable";
import {SourceTypes} from "../../../src/types/SourceTypes";
import { expect } from '@jest/globals';
import {TERRAFORM_SYNTAX} from "../../../src/util/constants";


let hlcSourceService: HclSourceService;
beforeAll(() => {
    hlcSourceService = new HclSourceService();
});

describe("Given a version", () => {
    describe("When the version is 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is ~= 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("~= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is = 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is >= 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion(">= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is <= 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("<= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is < 3.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("< 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is >= 3.0.0, < 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion(">= 3.0.0, < 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is >= 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion(">= 3.0.0, <= 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is > 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be 4.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("> 3.0.0, <= 4.0.0")).toBe("4.0.0");
        });
    });

    describe("When the version is > 3.0.0, < 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("> 3.0.0, < 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is ~= 3.0.0, < 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("~= 3.0.0, < 4.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version is ~= 3.0.0, <= 4.0.0", () => {
        test('Then I expect Version to be 3.0.0', () => {
            expect<string>(hlcSourceService.computeVersion("~= 3.0.0, <= 4.0.0")).toBe("4.0.0");
        });
    });
})



describe('Given a github file path', () => {
    describe('When path starts with ./', () => {
        test('Then I expect IsFilePath to be true',() =>{
            expect<boolean>(hlcSourceService.IsFilePath("./foo/bar")).toBe(true);
        });
    });

    describe('When path starts with ../', () => {
        test('Then I expect IsFilePath to be true',() =>{
            expect<boolean>(hlcSourceService.IsFilePath("../foo/bar")).toBe(true);
        });
    });

    describe('When path is an empty string', () => {
        test('Then I expect IsFilePath to be false',() =>{
            expect<boolean>(hlcSourceService.IsFilePath("")).toBe(false);
        });
    });

    describe('When path does not start with ./ or .// string', () => {
        test('Then I expect IsFilePath to be false',() =>{
            expect<boolean>(hlcSourceService.IsFilePath("/foo/bar")).toBe(false);
        });
    });

});

describe('Given a ssh string', () => {
    describe('When string is a url', () => {
        test('Then I expect IsSSH to be false', () => {
            expect<boolean>(hlcSourceService.IsSSH("https://github.com")).toBe(false);
        });
    });

    describe('When string is a file path', () => {
        test('Then I Expect IsSSH to be false', () => {
            expect<boolean>(hlcSourceService.IsSSH("../foo/bar")).toBe(false);
        });
    });
    describe('When string is a terraform registry path', () => {
        test('Then I expect IsSSH to be false', () => {
            expect<boolean>(hlcSourceService.IsSSH("aws/cloud")).toBe(false);
        })
    });
    describe("When string is a ssh Host", () => {
        test('Then I expect IsSSH to be true', () => {
            expect<boolean>(hlcSourceService.IsSSH("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6")).toBe(true);
        });
    });
});


describe('Given a url', () => {
    describe("When the url is a valid url", () => {
        test('Then I expect IsHost to return true', () => {
            expect<boolean>(hlcSourceService.IsHost('https://github.com')).toBe(true);
        });
    });
    describe('When string is a file path', () => {
        test('Then I Expect IsHost to be false', () => {
            expect<boolean>(hlcSourceService.IsHost("../foo/bar")).toBe(false);
        });
    });
    describe('When string is a terraform registry path', () => {
        test('Then I expect IsHost to be false', () => {
            expect<boolean>(hlcSourceService.IsHost("aws/cloud")).toBe(false);
        })
    });
    describe("When string is a ssh Host", () => {
        test('Then I expect IsHost to be false', () => {
            expect<boolean>(hlcSourceService.IsHost("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6")).toBe(false);
        });
    });
    describe("When string is empty", () => {
        test('Then I expect IsHost to be false', () => {
            expect<boolean>(hlcSourceService.IsHost("")).toBe(false);
        });
    });
});

describe('Given a Public Registry', () => {
    describe("When the Public Registry is a valid url", () => {
        test('Then I expect IsRegistry to return false', () => {
            expect<boolean>(hlcSourceService.IsRegistry('https://github.com')).toBe(false);
        });
    });
    describe('When Public Registry is a file path', () => {
        test('Then I Expect IsRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsRegistry("../foo/bar")).toBe(false);
        });
    });
    describe('When Public Registry is a terraform registry path', () => {
        test('Then I expect IsRegistry to be true', () => {
            expect<boolean>(hlcSourceService.IsRegistry("clouddrove/labels/aws")).toBe(true);
        })
    });
    describe('When Public Registry is a terraform registry path', () => {
        test('Then I expect IsRegistry to be true', () => {
            expect<boolean>(hlcSourceService.IsRegistry("hashicorp/aws")).toBe(true);
        });
    });
    describe('When Public Registry is aws', () => {
        test('Then I expect RegistryToUrl("aws","Provider.aws","") to be hashicorp/aws', () => {
            expect<String>(hlcSourceService.registryToUrl("aws",`${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.aws`,"")).toBe("https://registry.terraform.io/providers/hashicorp/aws/");
        });
        test('Then I expect RegistryToUrl("required_provider.hashicorp/aws","4.58.0") to be providers/hashicorp/aws/4.58.0',() => {
            expect<String>(hlcSourceService.registryToUrl("hashicorp/aws",`${TERRAFORM_SYNTAX.REQUIRED_PROVIDERS}.hashicorp/aws`,"4.58.0")).toBe("https://registry.terraform.io/providers/hashicorp/aws/4.58.0");
        });
        test('Then I expect RegistryToUrl("module.hashicorp/aws","4.58.0") to be providers/hashicorp/aws/4.58.0',() => {
            expect<String>(hlcSourceService.registryToUrl("aws",'',"")).toBe("https://registry.terraform.io/modules/aws/");
            expect<String>(hlcSourceService.registryToUrl("hashicorp/aws",'',"4.58.0")).toBe("https://registry.terraform.io/modules/hashicorp/aws/4.58.0");
            expect<String>(hlcSourceService.registryToUrl("aws",`${TERRAFORM_SYNTAX.MODULE}.aws`,"")).toBe("https://registry.terraform.io/modules/aws/");
            expect<String>(hlcSourceService.registryToUrl("hashicorp/aws",`${TERRAFORM_SYNTAX.MODULE}.hashicorp/aws`,"4.58.0")).toBe("https://registry.terraform.io/modules/hashicorp/aws/4.58.0");
        });
    });
    describe("When Public Registry is a ssh Host", () => {
        test('Then I expect IsRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsRegistry("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6")).toBe(false);
        });
    });
    describe("When Public Registry is empty", () => {
        test('Then I expect IsRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsRegistry("")).toBe(false);
        });
    });
});


describe('Given a Private Registry', () => {
    describe("When the Private Registry is a valid url", () => {
        test('Then I expect IsPrivateRegistry to return false', () => {
            expect<boolean>(hlcSourceService.IsPrivateRegistry('https://github.com')).toBe(false);
        });
    });
    describe('When Private Registry is a file path', () => {
        test('Then I Expect IsPrivateRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsPrivateRegistry("../foo/bar")).toBe(false);
        });
    });
    describe('When Private Registry is a terraform registry path', () => {
        test('Then I expect IsPrivateRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsPrivateRegistry("clouddrove/labels/aws")).toBe(false);
        })
    });
    describe("When Private Registry is a ssh Host", () => {
        test('Then I expect IsPrivateRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsPrivateRegistry("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6")).toBe(false);
        });
    });
    describe("When Private Registry is empty", () => {
        test('Then I expect IsPrivateRegistry to be false', () => {
            expect<boolean>(hlcSourceService.IsPrivateRegistry("")).toBe(false);
        });
    });
    describe("When Private Registry is valid", () => {
        test('Then I expect IsPrivateRegistry to be true', () => {
            expect<boolean>(hlcSourceService.IsPrivateRegistry("https://app.terraform.io/hashicorp-learn/foo/bar")).toBe(true);
            expect<boolean>(hlcSourceService.IsPrivateRegistry("http://app.terraform.io/hashicorp-learn/foo/bar")).toBe(true);
            expect<boolean>(hlcSourceService.IsPrivateRegistry("app.terraform.io/hashicorp-learn/foo/bar")).toBe(true);
        });
    });
});

describe("Given a ssh host", () => {
    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/lambda", () => {
            expect<string>(hlcSourceService.sshToUrl("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6"))
                .toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules/lambda");
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/modules/lambda", () => {
            expect<string>(hlcSourceService.sshToUrl("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda"))
                .toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/modules/lambda");
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/", () => {
            expect<string>(hlcSourceService.sshToUrl("git::git@github.com:gruntwork-io/terraform-aws-lambda.git"))
                .toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/main/");
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/blob/main/modules/main.tf", () => {
            expect<string>(hlcSourceService.sshToUrl("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf"))
                .toBe("https://github.com/gruntwork-io/terraform-aws-lambda/blob/main/modules/main.tf");
        });
    });

    describe("When ssh host is git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0", () => {
        test("Then I expect the url to be https://github.com/gruntwork-io/terraform-aws-lambda/blob/2.0.0/modules/main.tf", () => {
            expect<string>(hlcSourceService.sshToUrl("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0"))
                .toBe("https://github.com/gruntwork-io/terraform-aws-lambda/blob/2.0.0/modules/main.tf");
        });
    });

    describe("When ssh host is invalid", () => {
        test("Then I expect the url to be the original ssh host", () => {
            expect<string>(hlcSourceService.sshToUrl(""))
                .toBe("");
            expect<string>(hlcSourceService.sshToUrl("https://google.com"))
                .toBe("https://google.com");
            expect<string>(hlcSourceService.sshToUrl("./foo/bar"))
                .toBe("./foo/bar");
            expect<string>(hlcSourceService.sshToUrl("../foo/bar"))
                .toBe("../foo/bar");
        });
    });
});

describe("Given a Source", () => {
    describe("When the Source is an Empty String", () => {
        test("Then I expect SourceTypes to be NULL", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("")).toBe(null);
        });
    });

    describe("When the Source is an SSH Host", () => {
        test("Then I expect SourceTypes to be SSH", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/main.tf?ref=2.0.0")).toBe(SourceTypes.ssh);
        });
    });

    describe("When the Source is a url", () => {
        test("Then I expect SourceTypes to be url", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("https://Google.com")).toBe(SourceTypes.url);
        });
    });

    describe("When the Source is a path", () => {
        test("Then I expect SourceTypes to be path", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("../foo/bar")).toBe(SourceTypes.path);
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("./foo/bar")).toBe(SourceTypes.path);
        });
    });

    describe("When the Source is a Public Registry", () => {
        test("Then I expect SourceTypes to be Public Registry", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("foo/bar")).toBe(SourceTypes.registry);
        });
    });

    describe("When the Source is a Private Registry", () => {
        test("Then I expect SourceTypes to be Private Registry", () => {
            expect<Nullable<SourceTypes>>(hlcSourceService.GetSourceType("app.terraform.io/foo/bar")).toBe(SourceTypes.privateRegistry);
        });
    });
});

describe("Given a SourceType, Source,  ModuleName, and Source Version", () => {
    describe("When url, github.com, foo, ''", () => {
        test("I expect the result to be github.com", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.url, "github.com",'foo',''))
                .toBe("github.com");
        });
    });

    describe("When ssh, git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda.tf?ref=v2.0.0, foo, ''", () => {
        test("I expect the result to be https://github.com/gruntwork-io/terraform-aws-lambda/tree/v2.0.0/modules/lambda", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.ssh, "git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v2.0.0",'foo',''))
                .toBe("https://github.com/gruntwork-io/terraform-aws-lambda/tree/v2.0.0/modules/lambda");
        });
    });

    describe("When path, ../foo/bar, foo, ''", () => {
        test("I expect the result to be ../foo/bar", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.path, "../foo/bar",'foo',''))
                .toBe("../foo/bar");
        });
    });

    describe("When path, ./foo/bar, foo, ''", () => {
        test("I expect the result to be github.com", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.path, "./foo/bar",'foo',''))
                .toBe("./foo/bar");
        });
    });

    describe("When registry, hashicorp/aws foo, ''", () => {
        test("I expect the result to be https://registry.terraform.io/modules/hashicorp/aws/", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.registry, "hashicorp/aws",'foo',''))
                .toBe("https://registry.terraform.io/modules/hashicorp/aws/");
        });
    });

    describe("When registry, hashicorp/aws foo, '1.0.0'", () => {
        test("I expect the result to be github.com", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.registry, "hashicorp/aws",'foo','1.0.0'))
                .toBe("https://registry.terraform.io/modules/hashicorp/aws/1.0.0");
        });
    });

    describe("When private registry, bar.terraform.io/foo/aws foo, ''", () => {
        test("I expect the result to be bar.terraform.io/foo/aws", ()=>{
            expect(hlcSourceService.ResolveSource(SourceTypes.privateRegistry, "bar.terraform.io/foo/aws",'foo','1.0.0'))
                .toBe("bar.terraform.io/foo/aws");
        });
    });
})









