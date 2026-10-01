import { Nullable } from "../types/Nullable";
import { SourceLinks } from "../types/SourceLinks";
import { isSafeHttpUrl } from "../util/UrlSafety";
import { IPageWriter } from "./IPageWriter";
import { createSourceAnchor } from "./SourceAnchor";

// GitLab ids each rendered line `LC` and its 1-based line number, on a `.line`
// element. Which element and which token classes depend on the highlighter,
// so a source is found by the line and column the parser read it at.
const LINE_ID_PREFIX = "LC";
const LINE = `.line[id^="${LINE_ID_PREFIX}"]`;
const INERT = "inert";
const ANCHOR_ID_PREFIX = "GitlabTerraformSourceUrl";
const ANCHOR = `a[id^="${ANCHOR_ID_PREFIX}"]`;

/** Writes to the DOM GitLab rendered, including lines it renders later. */
export class GitLabPageWriter implements IPageWriter {
    private links: SourceLinks = { atLine: new Map(), bySource: new Map(), placed: new Map() };
    private linkedUrl = "";
    private observer: Nullable<MutationObserver> = null;

    /**
     * Replaces each module source on the page that has a link with an anchor to it.
     *
     * GitLab renders a long file in chunks as they scroll into view. Lines it
     * renders after this call are linked from the same links when they appear,
     * until the page moves to another url.
     * A source is linked only where the line's text at its column is the
     * source as written. A source whose url is not http or https is left as
     * text. Calling this again on the same page changes nothing that is
     * already linked.
     * @param links The url of each source, by the line and column it is written at.
     */
    public linkSources(links: SourceLinks): void {
        this.links = links;
        this.linkedUrl = document.URL;
        linkLines(Array.from(document.querySelectorAll(LINE)), links);
        this.observer ??= this.observeRenderedLines();
    }

    private observeRenderedLines(): MutationObserver {
        const observer = new MutationObserver((records) => {
            // GitLab moves between files without loading a new document, so
            // the links stop applying once the url is not the one they were built for.
            if (document.URL !== this.linkedUrl) {
                return;
            }
            linkLines(renderedLines(records), this.links);
            liftInertOverLinks(records);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [INERT],
        });
        return observer;
    }
}

// GitLab marks a chunk's code inert again each time it renders the chunk,
// which leaves the anchors already inside it unclickable.
const liftInertOverLinks = (records: MutationRecord[]): void => {
    for (const record of records) {
        const target = record.target;
        if (
            record.type === "attributes" &&
            target instanceof Element &&
            target.hasAttribute(INERT) &&
            target.querySelector(ANCHOR) !== null
        ) {
            target.removeAttribute(INERT);
        }
    }
};

const renderedLines = (records: MutationRecord[]): Element[] => {
    const lines = new Set<Element>();
    for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
            const element = node instanceof Element ? node : node.parentElement;
            if (element === null || isLinked(element)) {
                continue;
            }
            const line = element.closest(LINE);
            if (line !== null) {
                lines.add(line);
                continue;
            }
            for (const inside of Array.from(element.querySelectorAll(LINE))) {
                lines.add(inside);
            }
        }
    }
    return Array.from(lines);
};

const linkLines = (lines: Element[], links: SourceLinks): void => {
    for (const line of lines) {
        linkLine(line, links);
    }
};

const linkLine = (line: Element, links: SourceLinks): void => {
    const text = line.textContent ?? "";
    const placed = links.placed.get(lineNumberOf(line)) ?? [];
    placed.forEach(({ column, written, url }, position) => {
        const end = column + written.length;
        if (written === "" || text.slice(column, end) !== written || !isSafeHttpUrl(url)) {
            return;
        }
        const range = rangeOf(line, column, end);
        if (range === null || isLinked(range.startContainer)) {
            return;
        }

        // GitLab marks the code element inert, which leaves an anchor inside
        // it unclickable until that is lifted.
        line.closest(`[${INERT}]`)?.removeAttribute(INERT);
        const anchor = createSourceAnchor(url, `${ANCHOR_ID_PREFIX}-${line.id}-${position}`);
        anchor.append(range.extractContents());
        range.insertNode(anchor);
    });
};

const isLinked = (node: Node): boolean => {
    const element = node instanceof Element ? node : node.parentElement;
    return element !== null && element.closest(ANCHOR) !== null;
};

const lineNumberOf = (line: Element): number =>
    Number.parseInt(line.id.slice(LINE_ID_PREFIX.length), 10);

// The value's text can span several highlighter tokens, so the range runs
// from the text node holding its first character to the one holding its last.
const rangeOf = (line: Element, start: number, end: number): Nullable<Range> => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    let started = false;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        if (!started && start < offset + length) {
            range.setStart(node, start - offset);
            started = true;
        }
        if (started && end <= offset + length) {
            range.setEnd(node, end - offset);
            return range;
        }
        offset += length;
    }
    return null;
};
