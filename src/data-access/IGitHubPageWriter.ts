/** Writes to the rendered GitHub page. */
export interface IGitHubPageWriter {
    /**
     * Replaces each module source on the page that has a link with an anchor to it.
     * @param links Each source, exactly as written in the file, mapped to the url it opens.
     */
    linkSources(links: ReadonlyMap<string, string>): void;
}
