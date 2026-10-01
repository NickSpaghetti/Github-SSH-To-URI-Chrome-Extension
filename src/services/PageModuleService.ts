import { DisplayModule } from "../types/DisplayModule";
import { buildDisplayModuleAsync } from "./DisplayModuleBuilder";
import { Nullable } from "../types/Nullable";
import { readModuleDeclarations } from "../domain/ModuleDeclarationReader";
import { ChromeRuntimeParserService } from "./ChromeRuntimeParserService";
import { ModuleSourceLinker } from "./ModuleSourceLinker";
import { IGitHubPageDataAccess } from "../data-access/IGitHubPageDataAccess";
import { logRecovered } from "../util/Log";

const REGISTRY_REQUESTS_AT_ONCE = 10;

/** The Terraform modules declared on the page being viewed, each with its link. */
export class PageModuleService {
    constructor(
        private readonly page: IGitHubPageDataAccess,
        private readonly parserService: ChromeRuntimeParserService,
        private readonly moduleSourceLinker: ModuleSourceLinker,
    ) {}

    /**
     * Returns null when there is no source text to read yet, which happens
     * when GitHub has not rendered the file. That is different from an empty
     * array, which means the file was read and holds no module sources. The
     * caller must not cache the first case, or a page visited before it
     * rendered stays empty for as long as the cache lives.
     * @param pageUrl The page the file is being viewed on.
     * @returns A row per declaration, or null when the file has not rendered.
     * @throws When `pageUrl` is not an http address, which would make every
     * row on the page wrong rather than just one.
     */
    public async findSourcesAsync(pageUrl: string): Promise<Nullable<DisplayModule[]>> {
        const contents = this.page.readSourceText();
        if (contents === null) {
            return null;
        }

        let declarations;
        try {
            const hclFile = await this.parserService.parseAsync(contents, this.page.getFileName());
            declarations = readModuleDeclarations(hclFile);
        } catch (error) {
            logRecovered("could not parse the file being viewed", error);
            return [];
        }

        const declared = Array.from(declarations.values());
        const resolved: DisplayModule[][] = [];
        for (let start = 0; start < declared.length; start += REGISTRY_REQUESTS_AT_ONCE) {
            const batch = declared.slice(start, start + REGISTRY_REQUESTS_AT_ONCE);
            resolved.push(
                await Promise.all(
                    batch.map((declaration) =>
                        buildDisplayModuleAsync(pageUrl, declaration, this.moduleSourceLinker),
                    ),
                ),
            );
        }
        return resolved.flat();
    }
}
