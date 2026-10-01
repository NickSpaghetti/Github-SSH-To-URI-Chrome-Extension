/** A module source's place on its line, and the url it links to. */
export type PlacedSourceLink = {
    /** The 0-based offset of the written source within its line, in UTF-16 code units. */
    readonly column: number;
    /** The source as the file writes it. */
    readonly written: string;
    /** The url it links to. */
    readonly url: string;
};

/** The url each module source on a page links to, keyed by the source as the page shows it. */
export type SourceLinks = {
    /** The url of each source, by the 1-based line it is written on. */
    readonly atLine: ReadonlyMap<number, ReadonlyMap<string, string>>;
    /** The url of each source wherever it is written, from the first module that declares it. */
    readonly bySource: ReadonlyMap<string, string>;
    /** Each source whose column is known, by the 1-based line it is written on. */
    readonly placed: ReadonlyMap<number, readonly PlacedSourceLink[]>;
};
