import { IFetchService } from "../../../src/data-access/IFetchService";
import { TerraformRegistryDataAccess } from "../../../src/data-access/TerraformRegistryDataAccess";
import { OpenTofuRegistryDataAccess } from "../../../src/data-access/OpenTofuRegistryDataAccess";
import { RunTimeFetchResponse } from "../../../src/types/RunTimeFetchResponse";

/**
 * @param ok Whether the registry answered successfully.
 * @param data The body the registry answered with.
 * @returns A fetch service giving that answer to every url.
 */
const answering = (ok: boolean, data: unknown): IFetchService => ({
    fetchDataAsync: () =>
        Promise.resolve<RunTimeFetchResponse<unknown>>({
            ok: ok,
            status: ok ? 200 : 500,
            statusText: ok ? "OK" : "Internal Server Error",
            headers: new Headers(),
            data: data,
        }),
});

describe("Given a registry that publishes no versions", () => {
    describe("When the Terraform registry is asked", () => {
        test("Then I expect an empty list rather than a throw", async () => {
            // Arrange
            const registry = new TerraformRegistryDataAccess(answering(true, { versions: [] }));

            // Act
            const versions = await registry.getVersionsAsync("hashicorp/aws", "provider");

            // Assert
            expect(versions).toEqual([]);
        });
    });

    describe("When the OpenTofu registry is asked", () => {
        test("Then I expect an empty list rather than a throw", async () => {
            // Arrange
            const registry = new OpenTofuRegistryDataAccess(answering(true, { modules: [] }));

            // Act
            const versions = await registry.getVersionsAsync("owner/name/aws", "module");

            // Assert
            expect(versions).toEqual([]);
        });
    });
});

describe("Given a registry that answers with a failure", () => {
    describe("When the Terraform registry is asked", () => {
        test("Then I expect a throw naming the address", async () => {
            // Arrange
            const registry = new TerraformRegistryDataAccess(answering(false, undefined));

            // Act
            const versions = registry.getVersionsAsync("hashicorp/aws", "provider");

            // Assert
            await expect(versions).rejects.toThrow("hashicorp/aws");
        });
    });

    describe("When the OpenTofu registry is asked", () => {
        test("Then I expect a throw naming the address", async () => {
            // Arrange
            const registry = new OpenTofuRegistryDataAccess(answering(false, undefined));

            // Act
            const versions = registry.getVersionsAsync("owner/name/aws", "module");

            // Assert
            await expect(versions).rejects.toThrow("owner/name/aws");
        });
    });
});

describe("Given a registry that answers ok with a body of the wrong shape", () => {
    const bodies: unknown[] = [null, "<html>", 42, [], { versions: "1.0.0" }, { versions: [1, 2] }];

    describe("When the Terraform registry is asked", () => {
        test("Then I expect an empty list for each", async () => {
            // Arrange
            const registries = bodies.map(
                (body) => new TerraformRegistryDataAccess(answering(true, body)),
            );

            // Act
            const versions = await Promise.all(
                registries.map((registry) =>
                    registry.getVersionsAsync("hashicorp/aws", "provider"),
                ),
            );

            // Assert
            expect(versions).toEqual(bodies.map(() => []));
        });
    });

    describe("When the OpenTofu registry is asked", () => {
        test("Then I expect an empty list for each", async () => {
            // Arrange
            const shapes: unknown[] = [
                ...bodies,
                { modules: "x" },
                { modules: [{ versions: ["1.0.0"] }] },
                { versions: [{ version: 1 }] },
            ];
            const registries = shapes.map(
                (body) => new OpenTofuRegistryDataAccess(answering(true, body)),
            );

            // Act
            const versions = await Promise.all(
                registries.map((registry) => registry.getVersionsAsync("owner/name/aws", "module")),
            );

            // Assert
            expect(versions).toEqual(shapes.map(() => []));
        });
    });
});

describe("Given a version list with a malformed entry", () => {
    describe("When the Terraform registry is asked", () => {
        test("Then I expect an empty list", async () => {
            // Arrange
            const registry = new TerraformRegistryDataAccess(
                answering(true, { versions: ["1.0.0", 2, "1.1.0"] }),
            );

            // Act
            const versions = await registry.getVersionsAsync("hashicorp/aws", "provider");

            // Assert
            expect(versions).toEqual([]);
        });
    });

    describe("When the OpenTofu registry is asked for a module", () => {
        test("Then I expect an empty list", async () => {
            // Arrange
            const registry = new OpenTofuRegistryDataAccess(
                answering(true, {
                    modules: [{ versions: [{ version: "1.0.0" }, { version: 2 }] }],
                }),
            );

            // Act
            const versions = await registry.getVersionsAsync("owner/name/aws", "module");

            // Assert
            expect(versions).toEqual([]);
        });
    });
});

describe("Given a well formed version list", () => {
    describe("When the OpenTofu registry is asked for a module", () => {
        test("Then I expect the nested list read", async () => {
            // Arrange
            const registry = new OpenTofuRegistryDataAccess(
                answering(true, {
                    modules: [{ versions: [{ version: "1.0.0" }, { version: "1.1.0" }] }],
                }),
            );

            // Act
            const versions = await registry.getVersionsAsync("owner/name/aws", "module");

            // Assert
            expect(versions).toEqual(["1.0.0", "1.1.0"]);
        });
    });

    describe("When the OpenTofu registry is asked for a provider", () => {
        test("Then I expect the unnested list read", async () => {
            // Arrange
            const registry = new OpenTofuRegistryDataAccess(
                answering(true, { versions: [{ version: "5.0.0" }, { version: "5.1.0" }] }),
            );

            // Act
            const versions = await registry.getVersionsAsync("hashicorp/aws", "provider");

            // Assert
            expect(versions).toEqual(["5.0.0", "5.1.0"]);
        });
    });
});
