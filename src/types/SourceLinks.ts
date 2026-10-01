/** The url each module source on a page links to, keyed by the source as the page shows it. */
export type SourceLinks = {
    /** The url of each source, by the 1-based line it is written on. */
    readonly atLine: ReadonlyMap<number, ReadonlyMap<string, string>>;
    /** The url of each source wherever it is written, from the first module that declares it. */
    readonly bySource: ReadonlyMap<string, string>;
};
