import {HclSourceService} from "../../../src/services/HclSourceService";


let hlcSourceService: HclSourceService;
beforeAll(() => {
    hlcSourceService = new HclSourceService();
});

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







