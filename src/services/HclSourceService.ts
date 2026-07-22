import { Nullable } from "../types/Nullable";
import { SourceTypes } from "../types/SourceTypes";
import {
    FILE_EXTENSIONS,
    GITHUB_ROUTES,
    TERRAFORM_PROVIDERS,
    TERRAFORM_REGISTRY_ROUTES,
    TERRAFORM_SYNTAX,
} from "../util/constants";
import { HclVersionService } from "./HclVersionService";
import { ITerraformFetchService } from "./ITerraformFetchService";

export class HclSourceService {
    constructor(private readonly terraformFetchService: ITerraformFetchService) {}
    private readonly hlcVersionService = new HclVersionService(this.terraformFetchService);
    getSourceType = (source: string): Nullable<SourceTypes> => {
        if (this.isHost(source)) {
            return SourceTypes.url;
        }
        if (this.isFilePath(source)) {
            return SourceTypes.path;
        }
        if (this.isSSH(source)) {
            return SourceTypes.ssh;
        }
        if (this.isPrivateRegistry(source)) {
            return SourceTypes.privateRegistry;
        }
        if (this.isRegistry(source)) {
            return SourceTypes.registry;
        }
        return null;
    };

    resolveSourceAsync = async (
        sourceType: Nullable<SourceTypes>,
        source: string,
        moduleName: string,
        sourceVersion: string,
        url: URL,
    ): Promise<Nullable<string>> => {
        if (sourceType === null) {
            return null;
        }

        switch (sourceType) {
            case SourceTypes.url:
                return this.hostToUrl(source);
            case SourceTypes.ssh:
                return this.sshToUrl(source);
            case SourceTypes.path:
                return this.pathToUrl(source, url.href);
            case SourceTypes.registry:
                return await this.registryToUrlAsync(source, moduleName, sourceVersion);
            case SourceTypes.privateRegistry:
                return source;
            default:
                return null;
        }
    };

    //"git::https://github.com/gruntwork-io/terraform-aws-data-storage.git//modules/aurora?ref=v0.40.6"
    //"https://github.com/gruntwork-io/terraform-aws-data-storage/tree/v0.40.6/modules/aurora"
    hostToUrl = (source: string): string => {
        if (!source.startsWith("git::http")) {
            return source;
        }

        const stripedSource = source.replace("git::", "");
        const uri = new URL(stripedSource);
        let fullName = uri.pathname.replace(".git", "");
        const isRef = uri.searchParams.get("ref") !== null;
        const branchTag = uri.searchParams.get("ref") ?? "main";
        const dirName =
            uri.pathname.lastIndexOf(FILE_EXTENSIONS.TF) !== -1 ||
            uri.pathname.lastIndexOf(FILE_EXTENSIONS.HCL) !== -1
                ? GITHUB_ROUTES.BLOB
                : GITHUB_ROUTES.TREE;
        if (isRef) {
            fullName = fullName.replace(`?ref=${branchTag}`, "");
        }
        if (fullName.indexOf("//") === -1) {
            fullName += `/${dirName}/${branchTag}/`;
        } else {
            fullName = fullName.replace("//", `/${dirName}/${branchTag}/`);
        }

        return `${uri.origin}${fullName}`;
    };
    //git::git@github.com:gruntwork-io/terraform-aws-lambda.git//modules/lambda?ref=v0.21.6
    //https://github.com/gruntwork-io/terraform-aws-lambda/tree/v0.21.6/modules
    //https://github.com/gruntwork-io/terraform-aws-lambda/blob/v0.21.6/modules/keep-warm/main.tf
    sshToUrl = (source: string): string => {
        if (!this.isSSH(source)) {
            return source;
        }

        const hostName = source.substring(source.indexOf("@") + 1).replace(":", "/");
        try {
            const uri = new URL(source);
            const isRef = uri.searchParams.get("ref") !== null;
            const branchTag = uri.searchParams.get("ref") ?? "main";
            const dirName =
                uri.pathname.lastIndexOf(FILE_EXTENSIONS.TF) !== -1 ||
                uri.pathname.lastIndexOf(FILE_EXTENSIONS.HCL) !== -1
                    ? GITHUB_ROUTES.BLOB
                    : GITHUB_ROUTES.TREE;

            let fullName = hostName.replace(FILE_EXTENSIONS.GIT, "");
            if (isRef) {
                fullName = fullName.replace(`?ref=${branchTag}`, "");
            }
            if (fullName.indexOf("//") === -1) {
                fullName += `/${dirName}/${branchTag}/`;
            } else {
                fullName = fullName.replace("//", `/${dirName}/${branchTag}/`);
            }

            return `https://${fullName}`;
        } catch {
            return source;
        }
    };

    registryToUrlAsync = async (
        source: string,
        moduleName: string,
        sourceVersion: string,
    ): Promise<string> => {
        const providerType = moduleName.includes(TERRAFORM_SYNTAX.REQUIRED_PROVIDERS)
            ? TERRAFORM_REGISTRY_ROUTES.PROVIDERS
            : TERRAFORM_REGISTRY_ROUTES.MODULES;
        const version = await this.hlcVersionService.getTerraformProviderVersionAsync(
            source,
            providerType,
            sourceVersion ?? "",
        );
        const sourcePaths = source.split("/");
        let sourcePath = source;
        if (sourcePaths.length === 1 && providerType === TERRAFORM_REGISTRY_ROUTES.PROVIDERS) {
            sourcePath = `${TERRAFORM_PROVIDERS.HASHICORP}/${source}`;
        }

        return `https://registry.terraform.io/${providerType}/${sourcePath}/${version}`;
    };

    pathToUrl = (source: string, sourcePageUrl: string): string => {
        if (!this.isFilePath(source)) {
            throw new Error(`${source} is not of type ${SourceTypes.path.toString()}`);
        }
        return new URL(source, sourcePageUrl).href;
    };

    isHost = (source: string): boolean => {
        try {
            if (source.startsWith("git::http")) {
                source = source.replace("git::", "");
            }
            const url = new URL(source);
            const position = url.toString().lastIndexOf(url.protocol);
            const domainExtensionPosition = url.toString().lastIndexOf(".");
            return (
                position === 0 &&
                ["http:", "https:"].indexOf(url.protocol) !== -1 &&
                url.toString().length - domainExtensionPosition >= 2
            );
        } catch {
            return false;
        }
    };

    isPrivateRegistry = (source: string): boolean => {
        const stripedHttpSource = source.replace("https://", "").replace("http://", "");

        const privateRegistryHostNames = stripedHttpSource
            .substring(0, stripedHttpSource.indexOf("/"))
            .split(".");
        return (
            privateRegistryHostNames.length === 3 &&
            privateRegistryHostNames[1] === "terraform" &&
            privateRegistryHostNames[2] === "io"
        );
    };

    isRegistry = (source: string): boolean => {
        //public registry are only allowed /
        return (
            source !== "" &&
            source.indexOf(".") === -1 &&
            source.indexOf("//") === -1 &&
            source.indexOf("@") === -1 &&
            source.indexOf(":") === -1
        );
    };

    isFilePath = (source: string): boolean => {
        return source.startsWith("./") || source.startsWith("../");
    };

    isSSH = (source: string): boolean => {
        const startIndex = source.indexOf("::");
        const startHostNameIndex = source.indexOf("@");
        const endHostNameIndex = source.indexOf(":");

        return startIndex !== -1 && startHostNameIndex !== -1 && endHostNameIndex !== -1;
    };
}
