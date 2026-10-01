/** A module source's place on its line, and the url it links to. */
export type PlacedSourceLink = {
    /** The 0-based offset of the written source within its line, in UTF-16 code units. */
    readonly column: number;
    /** The source as the file writes it. */
    readonly written: string;
    /** The url it links to. */
    readonly url: string;
};

/** Each module source on a page that has a url, by the 1-based line it is written on. */
export type SourceLinks = ReadonlyMap<number, readonly PlacedSourceLink[]>;
