import {
    MODULE_SOURCE_FLAGS,
    ModuleSource,
    VCS_PREFIXES,
    setFlag,
    hasFlag,
} from "../../types/ModuleSource";
import { PATH_SEPARATOR } from "../../util/PathHelpers";
import { BROWSE_LAYOUTS } from "./RepositoryHosts";
import { SCHEME_SEPARATOR } from "./Split";

const HTTP_SCHEMES = ["http", "https"];
const SOURCE_SCHEMES = { SSH: "ssh", OCI: "oci" };
const ARCHIVE_PREFIXES = ["s3", "gcs"];
const ARCHIVE_EXTENSIONS = [".zip", ".tar.gz", ".tar.bz2", ".tar.xz"];

const HTTPS_SCHEME = HTTP_SCHEMES[1];

const isHttpScheme = (scheme: string): boolean => HTTP_SCHEMES.includes(scheme);

const withLeadingSeparator = (path: string): string =>
    path.startsWith(PATH_SEPARATOR) ? path : `${PATH_SEPARATOR}${path}`;

/**
 * Resolves what a locator is, expanding shorthand into explicit fields.
 * @param source A module source that has been through split.
 * @returns The same source with scheme, user, host, path and flags set. `path` always carries a leading separator.
 */
export const detect = (source: ModuleSource): ModuleSource => {
    const locator = source.locator;
    if (locator === "") {
        return setFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
    }

    applyPrefix(source);

    if (isLocalPath(locator)) {
        source.path = locator;
        return setFlag(source, MODULE_SOURCE_FLAGS.LocalPath);
    }

    const scheme = readScheme(locator);
    if (scheme !== "") {
        return detectSchemed(source, locator, scheme);
    }

    const scpParts = readScpParts(locator);
    if (scpParts !== null) {
        return detectScp(source, scpParts);
    }

    if (hasColonBeforePath(locator)) {
        return setFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
    }

    return detectSchemeless(source, locator);
};

const isVcsPrefix = (prefix: string): boolean =>
    prefix === VCS_PREFIXES.GIT || prefix === VCS_PREFIXES.MERCURIAL;

/** A schemeless repository address: the detector supplies the transport. */
const asRepository = (source: ModuleSource): ModuleSource => {
    source.scheme = HTTPS_SCHEME;
    setFlag(source, MODULE_SOURCE_FLAGS.SchemelessAddress);
    setFlag(source, MODULE_SOURCE_FLAGS.HttpTransport);
    return setFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress);
};

const applyPrefix = (source: ModuleSource): void => {
    if (source.prefix === VCS_PREFIXES.GIT) {
        setFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress);
    }
    if (source.prefix === VCS_PREFIXES.MERCURIAL) {
        setFlag(source, MODULE_SOURCE_FLAGS.MercurialRepo);
    }
    if (ARCHIVE_PREFIXES.includes(source.prefix)) {
        setFlag(source, MODULE_SOURCE_FLAGS.Archive);
    }
};

const isLocalPath = (locator: string): boolean =>
    locator.startsWith("./") || locator.startsWith("../");

/** `https://`, `ssh://`, `oci://`. Returns "" when there is no scheme separator. */
const readScheme = (locator: string): string => {
    const separatorAt = locator.indexOf(SCHEME_SEPARATOR);
    return separatorAt === -1 ? "" : locator.slice(0, separatorAt).toLowerCase();
};

type ScpParts = { user: string; host: string; path: string };

/** `git@github.com:ns/repo.git`. Returns the parts so the scan is not repeated. */
const readScpParts = (locator: string): ScpParts | null => {
    const atAt = locator.indexOf("@");
    if (atAt === -1) {
        return null;
    }
    const colonAt = locator.indexOf(":", atAt);
    if (colonAt === -1) {
        return null;
    }
    const slashAt = locator.indexOf(PATH_SEPARATOR);
    if (slashAt !== -1 && colonAt > slashAt) {
        return null;
    }
    return {
        user: locator.slice(0, atAt),
        host: locator.slice(atAt + 1, colonAt),
        path: locator.slice(colonAt + 1),
    };
};

/** Only the scheme rejection half. scp style is handled by readScpParts. */
const hasColonBeforePath = (locator: string): boolean => {
    const colonAt = locator.indexOf(":");
    if (colonAt === -1) {
        return false;
    }
    const slashAt = locator.indexOf(PATH_SEPARATOR);
    return slashAt === -1 || colonAt < slashAt;
};

/** Userinfo is rejected on any scheme but ssh: `https://trusted.com@evil.com/x` resolves to evil.com. */
const detectSchemed = (source: ModuleSource, locator: string, scheme: string): ModuleSource => {
    const parsed = parseHost(locator);
    if (parsed === null) {
        return setFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
    }

    if (parsed.user !== "" && scheme !== SOURCE_SCHEMES.SSH) {
        return setFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
    }

    source.scheme = scheme;
    source.user = parsed.user;
    source.host = parsed.host;
    source.path = withLeadingSeparator(parsed.path);

    if (scheme === SOURCE_SCHEMES.SSH) {
        setFlag(source, MODULE_SOURCE_FLAGS.SshTransport);
        setFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress);
    }
    if (scheme === SOURCE_SCHEMES.OCI) {
        setFlag(source, MODULE_SOURCE_FLAGS.OciArtifact);
    }
    if (isHttpScheme(scheme)) {
        setFlag(source, MODULE_SOURCE_FLAGS.HttpTransport);
        const isRepository =
            hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress) ||
            hasFlag(source, MODULE_SOURCE_FLAGS.MercurialRepo);
        if (!isRepository && isArchivePath(parsed.path)) {
            setFlag(source, MODULE_SOURCE_FLAGS.Archive);
        }
    }
    return source;
};

const detectScp = (source: ModuleSource, parts: ScpParts): ModuleSource => {
    const parsed = parseHost(`${SOURCE_SCHEMES.SSH}${SCHEME_SEPARATOR}${parts.host}`);
    if (parsed === null) {
        return setFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
    }

    source.scheme = SOURCE_SCHEMES.SSH;
    source.user = parts.user;
    source.host = parsed.host;
    source.path = withLeadingSeparator(parts.path);
    setFlag(source, MODULE_SOURCE_FLAGS.SshTransport);
    return setFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress);
};

const detectSchemeless = (source: ModuleSource, locator: string): ModuleSource => {
    const firstSegment = locator.split(PATH_SEPARATOR)[0] ?? "";

    if (!firstSegment.includes(".")) {
        source.path = withLeadingSeparator(locator);
        return setFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress);
    }

    const parsed = parseHost(`${HTTPS_SCHEME}${SCHEME_SEPARATOR}${locator}`);
    if (parsed === null || parsed.user !== "" || isIpLiteral(parsed.host)) {
        return setFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
    }

    source.host = parsed.host;
    source.path = withLeadingSeparator(parsed.path);

    const knownHost = BROWSE_LAYOUTS[parsed.host];
    if (knownHost !== undefined && knownHost.shorthand) {
        source.prefix = source.prefix === "" ? knownHost.vcs : source.prefix;
        return asRepository(source);
    }

    // `git::` and `hg::` say outright what the source is, so an unknown host
    // does not get to overrule them and call it a registry.
    if (isVcsPrefix(source.prefix)) {
        return asRepository(source);
    }

    source.registryHost = parsed.host;
    return setFlag(source, MODULE_SOURCE_FLAGS.RegistryAddress);
};

type ParsedHost = { user: string; host: string; path: string };

const parseHost = (candidate: string): ParsedHost | null => {
    try {
        const url = new URL(candidate);
        if (url.hostname === "") {
            return null;
        }
        return { user: url.username, host: url.hostname, path: url.pathname };
    } catch {
        return null;
    }
};

/** A trailing label of only digits is never a TLD, so this is an address, not a hostname. */
const isIpLiteral = (host: string): boolean => {
    if (host.startsWith("[")) {
        return true;
    }
    const labels = host.split(".");
    const last = labels[labels.length - 1] ?? "";
    return last !== "" && [...last].every((character) => character >= "0" && character <= "9");
};

const isArchivePath = (path: string): boolean =>
    ARCHIVE_EXTENSIONS.some((extension) => path.endsWith(extension));
