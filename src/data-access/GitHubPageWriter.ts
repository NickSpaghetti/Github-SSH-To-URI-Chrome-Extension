import { Nullable } from "../types/Nullable";
import { isSafeHttpUrl } from "../util/UrlSafety";
import { IGitHubPageWriter } from "./IGitHubPageWriter";

// GitHub tokenizes a string literal into a `span.pl-s` holding a `span.pl-pds`
// for each of its two quotes.
const STRING_QUOTE = `div[id^="LC"] > span.pl-s > span.pl-pds`;
const STRING_LITERAL = "span.pl-s";
const LINE_NUMBERS = ".react-line-numbers";
const CODE_LINES = ".react-code-lines";
const INERT = "inert";
const ANCHOR_ID_PREFIX = "GithubTerraformSourceUrl";

// GitHub gives the attribute name its own element before the value: a
// `span.pl-v` reading `source = ` in HCL, a `span.pl-ent` reading `"source"`
// in json. Both reduce to the name once quotes and the operator are dropped.
const SOURCE_KEY = "source";
const NAME_PUNCTUATION = ['"', "=", ":"];

const ANCHOR_STYLE = `
    pointer-events: all !important;
    text-decoration: underline !important;
    cursor: pointer !important;
    display: inline !important;
    visibility: visible !important;
    opacity: 1 !important;
    position: relative !important;
    z-index: 9999 !important;
`;

/** Writes to the DOM GitHub rendered. */
export class GitHubPageWriter implements IGitHubPageWriter {
    /**
     * Replaces each module source on the page that has a link with an anchor to it.
     *
     * A source whose url is not http or https is left as text. Calling this
     * again on the same page changes nothing that is already linked.
     * @param links Each source, exactly as written in the file, mapped to the url it opens.
     */
    public linkSources(links: ReadonlyMap<string, string>): void {
        for (const textNode of this.readStringLiteralTextNodes()) {
            const literal = textNode.parentElement;
            const line = literal?.parentElement;
            if (literal == null || literal.textContent == null || line == null) {
                continue;
            }

            // A `description` or a `default` can hold the same text as a source.
            if (!isSourceValue(literal)) {
                continue;
            }

            const text = literal.textContent.trim().split('"').join("");
            const url = links.get(text);
            if (url === undefined || !isSafeHttpUrl(url)) {
                continue;
            }

            // GitHub marks the rendered line inert so its own overlay takes
            // the click. The anchor is unreachable until that is lifted.
            literal.closest(`[${INERT}]`)?.removeAttribute(INERT);
            textNode.replaceWith(createAnchor(url, text, anchorId(line, literal)));
        }

        raiseCodeLinesAboveLineNumbers();
    }

    private readStringLiteralTextNodes(): ChildNode[] {
        const literals = new Set<Element>();
        for (const quote of Array.from(document.querySelectorAll(STRING_QUOTE))) {
            if (quote.parentElement !== null) {
                literals.add(quote.parentElement);
            }
        }

        const textNodes: ChildNode[] = [];
        for (const literal of literals) {
            for (const node of Array.from(literal.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                    textNodes.push(node);
                }
            }
        }
        return textNodes;
    }
}

const isSourceValue = (literal: Element): boolean => {
    const label = literal.previousElementSibling?.textContent ?? "";
    const name = NAME_PUNCTUATION.reduce((text, mark) => text.split(mark).join(""), label).trim();
    return name === SOURCE_KEY;
};

const anchorId = (line: Element, literal: Element): string => {
    const position = Array.from(line.querySelectorAll(STRING_LITERAL)).indexOf(literal);
    const within = position === -1 ? crypto.randomUUID() : String(position);
    return `${ANCHOR_ID_PREFIX}-${line.id === "" ? crypto.randomUUID() : line.id}-${within}`;
};

const createAnchor = (url: string, text: string, id: string): HTMLAnchorElement => {
    const anchor = document.createElement("a");
    anchor.id = id;
    anchor.href = url;
    anchor.rel = "noreferrer";
    anchor.target = "_blank";
    anchor.textContent = text;
    anchor.style.cssText = ANCHOR_STYLE;
    return anchor;
};

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
