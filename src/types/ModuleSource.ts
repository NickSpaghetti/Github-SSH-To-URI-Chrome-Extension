import { SourceTypes } from "./SourceTypes";

/**
 * One bit per behavior. These decide which code runs; `sourceType` is only
 * the popup's label.
 */
/** The version control systems a `TYPE::` prefix can name. */
export const VCS_PREFIXES = { GIT: "git", MERCURIAL: "hg" } as const;

export type Vcs = (typeof VCS_PREFIXES)[keyof typeof VCS_PREFIXES];

export const MODULE_SOURCE_FLAGS = {
    None: 0,
    HasPrefix: 1 << 0,
    HasSubDirectory: 1 << 1,
    HasRef: 1 << 2,
    LocalPath: 1 << 3,
    RegistryAddress: 1 << 4,
    RepositoryAddress: 1 << 5,
    SshTransport: 1 << 6,
    Archive: 1 << 7,
    OciArtifact: 1 << 8,
    Unsupported: 1 << 9,
    SchemelessAddress: 1 << 10,
    HttpTransport: 1 << 11,
    MercurialRepo: 1 << 12,
} as const;

export type ModuleSource = {
    raw: string;
    prefix: string;
    locator: string;
    subDirectory: string;
    ref: string;
    scheme: string;
    user: string;
    host: string;
    path: string;
    registryHost: string;
    flags: number;
    sourceType: SourceTypes;
};

/**
 * Creates the zero value for a module source.
 *
 * Unusable but valid, so callers never check for null and an unparseable
 * source still reaches the popup as a labeled row.
 * @returns An inert module source.
 */
export const emptyModuleSource = (): ModuleSource => ({
    raw: "",
    prefix: "",
    locator: "",
    subDirectory: "",
    ref: "",
    scheme: "",
    user: "",
    host: "",
    path: "",
    registryHost: "",
    flags: MODULE_SOURCE_FLAGS.Unsupported,
    sourceType: SourceTypes.unknown,
});

/**
 * @param source The module source to read.
 * @param flag One or more bits from MODULE_SOURCE_FLAGS.
 * @returns true if every bit in flag is set; otherwise, false.
 */
export const hasFlag = (source: ModuleSource, flag: number): boolean =>
    (source.flags & flag) === flag;

/**
 * Mutates rather than copies: one source per module, built once.
 * @param source The module source to change.
 * @param flag The bits to set.
 * @returns The same source, so construction chains.
 */
export const setFlag = (source: ModuleSource, flag: number): ModuleSource => {
    source.flags |= flag;
    return source;
};

/**
 * @param source The module source to change.
 * @param flag The bits to clear.
 * @returns The same source, so construction chains.
 */
export const clearFlag = (source: ModuleSource, flag: number): ModuleSource => {
    source.flags &= ~flag;
    return source;
};

/**
 * Returns readable flag names, for test failure messages and debugging only.
 * @param source The module source to describe.
 * @returns The set flags joined by `|`, or "None".
 */
export const describeFlags = (source: ModuleSource): string => {
    const names = Object.entries(MODULE_SOURCE_FLAGS)
        .filter(([name, bit]) => name !== "None" && (source.flags & bit) === bit)
        .map(([name]) => name);
    return names.length === 0 ? "None" : names.join("|");
};
