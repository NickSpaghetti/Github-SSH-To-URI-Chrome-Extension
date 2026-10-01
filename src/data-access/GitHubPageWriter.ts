import { Nullable } from "../types/Nullable";
import { IPageWriter } from "./IPageWriter";
import { SourceLinks } from "../types/SourceLinks";
import { LINE_ID_PREFIX, lineNumberOf, linkPlacedSources } from "./PlacedSources";

// GitHub ids each rendered line `LC` and its 1-based line number, on a `div`
// holding that line of the file. It renders only the lines near the viewport.
const LINE = `div[id^="${LINE_ID_PREFIX}"]`;
const LINE_NUMBERS = ".react-line-numbers";
const CODE_LINES = ".react-code-lines";
const ANCHOR_ID_PREFIX = "GithubTerraformSourceUrl";

/** Writes to the DOM GitHub rendered. */
export class GitHubPageWriter implements IPageWriter {
    /**
     * Replaces each module source on the page that has a link with an anchor to it.
     *
     * A source is linked only where the line's text at its column is the
     * source as written. A source whose url is not http or https is left as
     * text. Only rendered lines are linked; calling this again after GitHub
     * renders more links those and changes nothing already linked.
     * @param links Each source with a url, by the line it is written on.
     */
    public linkSources(links: SourceLinks): void {
        for (const line of Array.from(document.querySelectorAll(LINE))) {
            linkPlacedSources(line, links.get(lineNumberOf(line)), ANCHOR_ID_PREFIX);
        }
        raiseCodeLinesAboveLineNumbers();
    }
}

// GitHub renders the code lines under the line numbers, which covers the
// anchor. The z-index is read computed, so a value GitHub declares in a
// stylesheet counts as well as one on the element. "auto" parses to NaN and
// means the line numbers are not stacked, which anything positive sits above.
const raiseCodeLinesAboveLineNumbers = (): void => {
    const lineNumbers = document.querySelector(LINE_NUMBERS) as Nullable<HTMLElement>;
    const codeLines = document.querySelector(CODE_LINES) as Nullable<HTMLElement>;
    if (codeLines === null) {
        return;
    }
    const declared =
        lineNumbers === null
            ? Number.NaN
            : Number.parseInt(getComputedStyle(lineNumbers).zIndex, 10);
    codeLines.style.zIndex = Number.isNaN(declared) ? "1" : String(declared + 1);
};
