import { DisplayModule, emptyDisplayModule } from "../types/DisplayModule";
import { TerraformModule } from "../types/Terraform";
import { ModuleSourceLinker } from "./ModuleSourceLinker";
import { split } from "../domain/moduleSource/Split";
import { detect } from "../domain/moduleSource/Detect";
import { classify } from "../domain/moduleSource/Classify";
import { isSafeHttpUrl } from "../util/UrlSafety";
import { logRecovered } from "../util/Log";

/**
 * @param uri The page the module was read from. Relative sources resolve
 * against it, so it has to be a real http address. A bad one is a programming
 * error rather than bad input, and every module on the page would be wrong,
 * so it throws.
 * @param terraformModule One declaration read out of the file.
 * @param moduleSourceLinker Shared by every module on the page.
 * @returns The row the popup and the content script render.
 * @throws When `uri` is not an http or https address.
 */
export const buildDisplayModuleAsync = async (
    uri: string,
    terraformModule: TerraformModule,
    moduleSourceLinker: ModuleSourceLinker,
): Promise<DisplayModule> => {
    if (!isSafeHttpUrl(uri)) {
        throw new Error(`page url is not an http address: ${uri}`);
    }

    const module = emptyDisplayModule(terraformModule.moduleName);
    module.versionConstraint = terraformModule.provider.version ?? "";
    module.sourceLine = terraformModule.sourceLine;
    module.sourceColumn = terraformModule.sourceColumn;
    const source = terraformModule.provider.source;
    if (source === undefined || source === "") {
        return module;
    }

    module.source = source;
    module.writtenSource = terraformModule.writtenSource;
    if (!terraformModule.sourceResolved) {
        return module;
    }
    const moduleSource = classify(detect(split(source)));
    module.sourceType = moduleSource.sourceType;

    try {
        const link = await moduleSourceLinker.linkAsync(
            moduleSource,
            terraformModule.moduleName,
            module.versionConstraint,
            new URL(uri),
        );
        module.resolvedUrl = link.url;
        module.resolvedVersion = link.resolvedVersion;
    } catch (error) {
        logRecovered(`could not build a link for ${source}`, error);
    }
    return module;
};
