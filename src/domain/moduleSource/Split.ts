import {
    ModuleSource,
    MODULE_SOURCE_FLAGS,
    clearFlag,
    emptyModuleSource,
    setFlag,
} from "../../types/ModuleSource";
/** The delimiters `[TYPE::]LOCATOR[//SUBDIR][?QUERY]` is built from. */
export const SCHEME_SEPARATOR = "://";
const PREFIX_SEPARATOR = "::";
const QUERY_SEPARATOR = "?";
const SUBDIR_SEPARATOR = "//";

const REF_PARAMS = ["ref", "tag"];

/**
 * Decomposes a module source into the parts of `[TYPE::]LOCATOR[//SUBDIR][?QUERY]`.
 * @param raw the source exactly as written in the file
 * @returns a module source with the delimited parts split out and nothing interpreted
 */
export const split = (raw: string): ModuleSource => {
    const source = emptyModuleSource();
    source.raw = raw;

    if (raw === "") {
        return source;
    }

    let rest = raw;
    rest = takePrefix(source, rest);
    rest = takeQuery(source, rest);
    rest = takeSubdir(source, rest);
    source.locator = rest;

    return clearFlag(source, MODULE_SOURCE_FLAGS.Unsupported);
};

/** Only counts before any scheme separator, so `oci://host` is a scheme, not a prefix. */
const takePrefix = (source: ModuleSource, rest: string): string => {
    const prefixAt = rest.indexOf(PREFIX_SEPARATOR);
    if (prefixAt === -1) {
        return rest;
    }

    const schemeAt = rest.indexOf(SCHEME_SEPARATOR);
    if (schemeAt !== -1 && schemeAt < prefixAt) {
        return rest;
    }

    source.prefix = rest.slice(0, prefixAt);
    setFlag(source, MODULE_SOURCE_FLAGS.HasPrefix);
    return rest.slice(prefixAt + PREFIX_SEPARATOR.length);
};

/** `?ref=`, `?tag=`. Other parameters such as `depth` are not the revision. */
const takeQuery = (source: ModuleSource, rest: string): string => {
    const queryAt = rest.indexOf(QUERY_SEPARATOR);
    if (queryAt === -1) {
        return rest;
    }

    const params = new URLSearchParams(rest.slice(queryAt + QUERY_SEPARATOR.length));
    for (const name of REF_PARAMS) {
        const value = params.get(name);
        if (value !== null && value !== "") {
            source.ref = value;
            setFlag(source, MODULE_SOURCE_FLAGS.HasRef);
            break;
        }
    }

    return rest.slice(0, queryAt);
};

/** The first `//` that is not the scheme's own separator. */
const takeSubdir = (source: ModuleSource, rest: string): string => {
    const schemeAt = rest.indexOf(SCHEME_SEPARATOR);
    const searchFrom = schemeAt === -1 ? 0 : schemeAt + SCHEME_SEPARATOR.length;
    const subdirAt = rest.indexOf(SUBDIR_SEPARATOR, searchFrom);
    if (subdirAt === -1) {
        return rest;
    }

    source.subDirectory = rest.slice(subdirAt + SUBDIR_SEPARATOR.length);
    setFlag(source, MODULE_SOURCE_FLAGS.HasSubDirectory);
    return rest.slice(0, subdirAt);
};
