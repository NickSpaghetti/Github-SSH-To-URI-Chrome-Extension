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
    fetchDataAsync: <T>() =>
        Promise.resolve<RunTimeFetchResponse<T>>({
            ok: ok,
            status: ok ? 200 : 500,
            statusText: ok ? "OK" : "Internal Server Error",
            headers: new Headers(),
            data: data as T,
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
