export enum SourceTypes {
    url = "url",
    path = "path",
    registry = "registry",
    privateRegistry = "privateRegistry",
    gitHttps = "git:https",
    gitHttp = "git:http",
    gitSsh = "git:ssh",
    gitFtp = "git:ftp",
    gitFtps = "git:ftps",
    gitDaemon = "git:git",
    mercurialHttps = "mercurial:https",
    mercurialHttp = "mercurial:http",
    mercurialSsh = "mercurial:ssh",
    oci = "oci",
    archive = "archive",
    unknown = "unknown",
}

/**
 * @param value a source type read back from storage, written by any build
 * @returns the value when it is a member of this enum, otherwise unknown
 */
export const toSourceTypeLabel = (value: unknown): SourceTypes => {
    const members = Object.values(SourceTypes) as string[];
    return typeof value === "string" && members.includes(value)
        ? (value as SourceTypes)
        : SourceTypes.unknown;
};
