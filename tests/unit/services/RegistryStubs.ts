import { MockFetchService } from "./MockFetchService";
import { TerraformRegistryDataAccess } from "../../../src/data-access/TerraformRegistryDataAccess";
import { OpenTofuRegistryDataAccess } from "../../../src/data-access/OpenTofuRegistryDataAccess";
import { TerraformVersionService } from "../../../src/services/TerraformVersionService";
import { OpenTofuVersionService } from "../../../src/services/OpenTofuVersionService";
import { ModuleSourceLinker } from "../../../src/services/ModuleSourceLinker";

/**
 * The wiring every registry backed test needs, over recorded responses. The
 * substitution happens at `IFetchService`, so everything above it is real.
 */
export const stubTerraformVersionService = (): TerraformVersionService =>
    new TerraformVersionService(new TerraformRegistryDataAccess(new MockFetchService()));

export const stubOpenTofuVersionService = (): OpenTofuVersionService =>
    new OpenTofuVersionService(new OpenTofuRegistryDataAccess(new MockFetchService()));

export const stubModuleSourceLinker = (): ModuleSourceLinker =>
    new ModuleSourceLinker(stubTerraformVersionService(), stubOpenTofuVersionService());
