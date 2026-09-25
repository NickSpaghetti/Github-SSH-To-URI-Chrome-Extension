import { expect } from "@jest/globals";
import { TerraformVersionService } from "../../../src/services/TerraformVersionService";
import { stubTerraformVersionService } from "./RegistryStubs";
let terraformVersionService: TerraformVersionService;
beforeAll(() => {
    terraformVersionService = stubTerraformVersionService();
});

describe("Given a constraint and the versions a registry publishes", () => {
    describe("When the constraint has an upper bound", () => {
        test("Then I expect the highest version inside it, not the floor", async () => {
            expect<string | null>(
                await terraformVersionService.selectVersionAsync(
                    "hashicorp/aws",
                    "provider",
                    ">= 5.0, < 6.0",
                ),
            ).toBe("5.100.0");
        });
    });

    describe("When there is no constraint", () => {
        test("Then I expect the newest published version, not the oldest", async () => {
            expect<string | null>(
                await terraformVersionService.selectVersionAsync(
                    "terraform-aws-modules/security-group/aws",
                    "module",
                    "",
                ),
            ).toBe("6.0.0");
            expect<string | null>(
                await terraformVersionService.selectVersionAsync(
                    "hashicorp/random",
                    "provider",
                    "",
                ),
            ).toBe("3.9.1");
        });
    });

    describe("When the constraint pins an exact version", () => {
        test("Then I expect that version", async () => {
            expect<string | null>(
                await terraformVersionService.selectVersionAsync(
                    "terraform-aws-modules/vpc/aws",
                    "module",
                    "6.7.3",
                ),
            ).toBe("6.7.3");
        });
    });

    describe("When the constraint is satisfied by nothing published", () => {
        test("Then I expect the newest version rather than a failure", async () => {
            expect<string | null>(
                await terraformVersionService.selectVersionAsync(
                    "hashicorp/random",
                    "provider",
                    ">= 99.0.0",
                ),
            ).toBe("3.9.1");
        });
    });
});
