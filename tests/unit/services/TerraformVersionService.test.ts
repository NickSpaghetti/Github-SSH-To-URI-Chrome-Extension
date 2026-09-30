import { expect } from "@jest/globals";
import { TerraformVersionService } from "../../../src/services/TerraformVersionService";
import { RegistryTarget } from "../../../src/types/RegistryTarget";
import { stubTerraformVersionService } from "./RegistryStubs";

let terraformVersionService: TerraformVersionService;
beforeAll(() => {
    terraformVersionService = stubTerraformVersionService();
});

describe("Given a constraint and the versions a registry publishes", () => {
    describe("When the constraint has an upper bound", () => {
        test("Then I expect the highest version inside it, not the floor", async () => {
            // Arrange
            const address = "hashicorp/aws";
            const constraint = ">= 5.0, < 6.0";

            // Act
            const selected = await terraformVersionService.selectVersionAsync(
                address,
                "provider",
                constraint,
            );

            // Assert
            expect<string | null>(selected).toBe("5.100.0");
        });
    });

    describe("When there is no constraint", () => {
        test("Then I expect the newest published version, not the oldest", async () => {
            // Arrange
            const cases: { address: string; kind: RegistryTarget; newest: string }[] = [
                {
                    address: "terraform-aws-modules/security-group/aws",
                    kind: "module",
                    newest: "6.0.0",
                },
                { address: "hashicorp/random", kind: "provider", newest: "3.9.1" },
            ];

            // Act
            const selected = await Promise.all(
                cases.map(async ({ address, kind }) => ({
                    address,
                    kind,
                    newest: await terraformVersionService.selectVersionAsync(address, kind, ""),
                })),
            );

            // Assert
            expect(selected).toEqual(cases);
        });
    });

    describe("When the constraint pins an exact version", () => {
        test("Then I expect that version", async () => {
            // Arrange
            const address = "terraform-aws-modules/vpc/aws";
            const constraint = "6.7.3";

            // Act
            const selected = await terraformVersionService.selectVersionAsync(
                address,
                "module",
                constraint,
            );

            // Assert
            expect<string | null>(selected).toBe("6.7.3");
        });
    });

    describe("When the constraint is satisfied by nothing published", () => {
        test("Then I expect the newest version rather than a failure", async () => {
            // Arrange
            const address = "hashicorp/random";
            const constraint = ">= 99.0.0";

            // Act
            const selected = await terraformVersionService.selectVersionAsync(
                address,
                "provider",
                constraint,
            );

            // Assert
            expect<string | null>(selected).toBe("3.9.1");
        });
    });
});
