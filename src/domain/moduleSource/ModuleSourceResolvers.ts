import { MODULE_SOURCE_FLAGS, ModuleSource, hasFlag } from "../../types/ModuleSource";
import { SourceTypes } from "../../types/SourceTypes";
import { Nullable } from "../../types/Nullable";
import { LinkContext } from "../../types/LinkContext";
import { ModuleLink } from "../../types/ModuleLink";
import { BROWSE_LAYOUTS, GITHUB_BLOB_ROUTE, GITHUB_TREE_ROUTE } from "./RepositoryHosts";
import {
    DEFAULT_REGISTRY_HOST,
    LATEST_VERSION,
    OPENTOFU_LAYOUT,
    OPENTOFU_REGISTRY_HOST,
    TERRAFORM_LAYOUT,
    isPrivateRegistryHost,
    normalizeRegistryAddress,
    registryAddress,
    registryPageUrl,
    registryTargetFor,
} from "./RegistryHosts";
import { PATH_SEPARATOR, isFilePath } from "../../util/PathHelpers";
import { isSafeHttpUrl } from "../../util/UrlSafety";

const GIT_SUFFIX = ".git";

type LinkBuilder = (source: ModuleSource, context: LinkContext) => Promise<ModuleLink>;

/** For the builders that never consult a registry, which is most of them. */
const linkOnly = (url: Nullable<string>): ModuleLink => ({ url: url, resolvedVersion: "" });

export const NO_LINK: ModuleLink = { url: null, resolvedVersion: "" };

/**
 * Builds a browse link from a source that carries its own address.
 *
 * `hg::`, `s3::` and `gcs::` name something for a client to fetch, not
 * something a browser can open, and only the ones that arrived over http are
 * both. A schemeless locator is not a url even then, so it is rebuilt from
 * the host and path the detector parsed out of it.
 */
const linkHttpLocator = (source: ModuleSource): ModuleLink => {
    if (!hasFlag(source, MODULE_SOURCE_FLAGS.HttpTransport)) {
        return NO_LINK;
    }
    return linkOnly(
        isSafeHttpUrl(source.locator) ? source.locator : `https://${source.host}${source.path}`,
    );
};

export type ModuleSourceResolver = {
    readonly name: string;
    readonly matches: (source: ModuleSource) => boolean;
    /** Reads the source, because a repository's label names its vcs and its transport. */
    readonly label: (source: ModuleSource) => SourceTypes;
    /** null means there is no browsable address. Browsable is not a stored bit. */
    readonly linkAsync: Nullable<LinkBuilder>;
};

/**
 * The protocols mercurial can fetch over. `file` and `static-http` are absent
 * because `detect` rejects a source with no host before it reaches here.
 */
const MERCURIAL_LABELS: Record<string, SourceTypes> = {
    https: SourceTypes.mercurialHttps,
    http: SourceTypes.mercurialHttp,
    ssh: SourceTypes.mercurialSsh,
};

/**
 * The protocols git can fetch over. `rsync` is absent because git 2.10
 * removed it in 2016, and `file` for the reason above. A source naming
 * anything else is labelled unknown: this table is the claim about what the
 * vcs supports, so `hg::ftp://` is unknown while `git::ftp://` is not.
 */
const GIT_LABELS: Record<string, SourceTypes> = {
    https: SourceTypes.gitHttps,
    http: SourceTypes.gitHttp,
    ssh: SourceTypes.gitSsh,
    ftp: SourceTypes.gitFtp,
    ftps: SourceTypes.gitFtps,
    git: SourceTypes.gitDaemon,
};

const mercurialLabel = (source: ModuleSource): SourceTypes =>
    MERCURIAL_LABELS[source.scheme] ?? SourceTypes.unknown;

const gitLabel = (source: ModuleSource): SourceTypes =>
    GIT_LABELS[source.scheme] ?? SourceTypes.unknown;

const flagged =
    (flag: number) =>
    (source: ModuleSource): boolean =>
        hasFlag(source, flag);

/**
 * Any one of these means the source addresses a repository. Which one decides
 * only the transport, and `gitLabel` reads that from the scheme.
 */
const REPOSITORY_FLAGS =
    MODULE_SOURCE_FLAGS.SshTransport |
    MODULE_SOURCE_FLAGS.SchemelessAddress |
    MODULE_SOURCE_FLAGS.RepositoryAddress;

/** `hasFlag` needs every bit, which is wrong for a bundle of alternatives. */
const anyFlag =
    (flags: number) =>
    (source: ModuleSource): boolean =>
        (source.flags & flags) !== 0;

/**
 * Ordered. The first row whose `matches` holds decides both the label and the
 * link, so the two can never disagree about what a source is.
 */
const MODULE_SOURCE_RESOLVERS: readonly ModuleSourceResolver[] = [
    {
        // Must stay first: `detect` can set capability flags before it rejects,
        // so a row above this one would match `git::javascript:alert(1)`.
        name: "unsupported",
        matches: flagged(MODULE_SOURCE_FLAGS.Unsupported),
        label: () => SourceTypes.unknown,
        linkAsync: null,
    },
    {
        name: "localPath",
        matches: flagged(MODULE_SOURCE_FLAGS.LocalPath),
        label: () => SourceTypes.path,
        linkAsync: (source, context) =>
            Promise.resolve(linkOnly(linkLocalPath(source, context.pageUrl))),
    },
    {
        name: "ociArtifact",
        matches: flagged(MODULE_SOURCE_FLAGS.OciArtifact),
        label: () => SourceTypes.oci,
        linkAsync: null,
    },
    {
        name: "mercurial",
        matches: flagged(MODULE_SOURCE_FLAGS.MercurialRepo),
        label: mercurialLabel,
        linkAsync: (source) => Promise.resolve(linkHttpLocator(source)),
    },
    {
        name: "archive",
        matches: flagged(MODULE_SOURCE_FLAGS.Archive),
        label: () => SourceTypes.archive,
        linkAsync: (source) => Promise.resolve(linkHttpLocator(source)),
    },
    {
        name: "privateRegistry",
        matches: (source) =>
            hasFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress) &&
            isPrivateRegistryHost(source.registryHost),
        label: () => SourceTypes.privateRegistry,
        linkAsync: (source) =>
            Promise.resolve(linkOnly(`https://${source.registryHost}${source.path}`)),
    },
    {
        name: "registry",
        matches: flagged(MODULE_SOURCE_FLAGS.RegistryAddress),
        label: () => SourceTypes.registry,
        linkAsync: linkRegistryAsync,
    },
    {
        name: "repository",
        matches: anyFlag(REPOSITORY_FLAGS),
        label: gitLabel,
        linkAsync: (source) => Promise.resolve(linkOnly(linkRepository(source))),
    },
    {
        name: "httpAddress",
        matches: flagged(MODULE_SOURCE_FLAGS.HttpTransport),
        label: () => SourceTypes.url,
        linkAsync: (source) => Promise.resolve(linkHttpLocator(source)),
    },
];

const FALLBACK_RESOLVER: ModuleSourceResolver = {
    name: "unknown",
    matches: () => true,
    label: () => SourceTypes.unknown,
    linkAsync: null,
};

/**
 * Returns the resolver that decides a source's label and link.
 *
 * The first resolver whose `matches` holds, or a fallback that labels the
 * source unknown and offers no link.
 * @param source A module source that has been through detect.
 * @returns The resolver deciding this source's label and link.
 */
export const resolverFor = (source: ModuleSource): ModuleSourceResolver =>
    MODULE_SOURCE_RESOLVERS.find((resolver) => resolver.matches(source)) ?? FALLBACK_RESOLVER;

const linkLocalPath = (source: ModuleSource, pageUrl: URL): Nullable<string> => {
    const resolved = new URL(source.path, pageUrl.href);
    const wanted = isFilePath(resolved.pathname) ? GITHUB_BLOB_ROUTE : GITHUB_TREE_ROUTE;
    const replacement = `${PATH_SEPARATOR}${wanted}${PATH_SEPARATOR}`;

    for (const route of [GITHUB_BLOB_ROUTE, GITHUB_TREE_ROUTE]) {
        const marker = `${PATH_SEPARATOR}${route}${PATH_SEPARATOR}`;
        const markerAt = resolved.pathname.indexOf(marker);
        if (markerAt !== -1) {
            const pathname =
                resolved.pathname.slice(0, markerAt) +
                replacement +
                resolved.pathname.slice(markerAt + marker.length);
            return `${resolved.origin}${pathname}`;
        }
    }
    return resolved.href;
};

/**
 * The ref that means "whatever the default branch is". Both hosts resolve it,
 * and it is the only safe choice: guessing `main` 404s on a `master`
 * repository, which is most of the older ones.
 */
const DEFAULT_REFERENCE = "HEAD";

const linkRepository = (source: ModuleSource): Nullable<string> => {
    const repository = stripGitSuffix(source.path);
    const root = `https://${source.host}${repository}`;

    if (source.ref === "" && source.subDirectory === "") {
        return root;
    }

    const host = BROWSE_LAYOUTS[source.host];
    if (host === undefined) {
        return root;
    }

    const reference = source.ref === "" ? DEFAULT_REFERENCE : source.ref;
    return joinPath(root, host.route(source.subDirectory), reference, source.subDirectory);
};

/** Drops empty segments, so a ref with no subdir does not trail a separator. */
const joinPath = (base: string, ...segments: string[]): string =>
    [base, ...segments.filter((segment) => segment !== "")].join(PATH_SEPARATOR);

const stripGitSuffix = (path: string): string =>
    path.endsWith(GIT_SUFFIX) ? path.slice(0, -GIT_SUFFIX.length) : path;

async function linkRegistryAsync(source: ModuleSource, context: LinkContext): Promise<ModuleLink> {
    if (source.registryHost === OPENTOFU_REGISTRY_HOST) {
        return await linkOpenTofuRegistryAsync(source, context);
    }

    if (source.registryHost !== "" && source.registryHost !== DEFAULT_REGISTRY_HOST) {
        return linkOnly(`https://${source.registryHost}${source.path}`);
    }

    const target = registryTargetFor(context.moduleName);

    const address = normalizeRegistryAddress(source.path, target);
    const version = await context.resolveVersionAsync(address, target, context.versionConstraint);
    if (version === null) {
        return NO_LINK;
    }

    return {
        url: registryPageUrl(TERRAFORM_LAYOUT, source, target, address, version),
        resolvedVersion: version,
    };
}

/**
 * Its api takes a version rather than a constraint, so only an exact pin can
 * be used, and only once the registry confirms it exists. Anything else is
 * `latest`, which is always a live page.
 */
async function linkOpenTofuRegistryAsync(
    source: ModuleSource,
    context: LinkContext,
): Promise<ModuleLink> {
    const target = registryTargetFor(context.moduleName);
    const address = registryAddress(source.path);

    const published = await context.resolveOpenTofuVersionAsync(
        address,
        target,
        context.versionConstraint,
    );
    const version = published ?? LATEST_VERSION;

    return {
        url: registryPageUrl(OPENTOFU_LAYOUT, source, target, address, version),
        resolvedVersion: published ?? "",
    };
}
