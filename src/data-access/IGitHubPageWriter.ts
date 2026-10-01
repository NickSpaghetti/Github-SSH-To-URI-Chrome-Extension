import { SourceLinks } from "../types/SourceLinks";

/** Writes to the rendered GitHub page. */
export interface IGitHubPageWriter {
    /**
     * Replaces each module source on the page that has a link with an anchor to it.
     * @param links The url of each source, by the line it is written on and by source alone.
     */
    linkSources(links: SourceLinks): void;
}
