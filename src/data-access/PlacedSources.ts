import { Nullable } from "../types/Nullable";
import { PlacedSourceLink } from "../types/SourceLinks";
import { isSafeHttpUrl } from "../util/UrlSafety";
import { createSourceAnchor } from "./SourceAnchor";

/** The prefix of the id GitHub and GitLab give each rendered line, before its 1-based number. */
export const LINE_ID_PREFIX = "LC";

const INERT = "inert";

/**
 * Returns the line number a rendered line's id names.
 * @param line The rendered line.
 * @returns The 1-based line number, or NaN when the id names none.
 */
export const lineNumberOf = (line: Element): number =>
    line.id.startsWith(LINE_ID_PREFIX)
        ? Number.parseInt(line.id.slice(LINE_ID_PREFIX.length), 10)
        : Number.NaN;

/**
 * Wraps each source placed on a rendered line in an anchor to its url.
 *
 * A source is linked only where the line's text at its column is the source
 * as written, and only when its url is http or https. A source already linked
 * is left as it is.
 * @param line The rendered line.
 * @param placed The sources the parser read on that line.
 * @param anchorIdPrefix The prefix of each anchor's id, which marks it as this extension's.
 */
export const linkPlacedSources = (
    line: Element,
    placed: readonly PlacedSourceLink[] | undefined,
    anchorIdPrefix: string,
): void => {
    const text = line.textContent ?? "";
    (placed ?? []).forEach(({ column, written, url }, position) => {
        const end = column + written.length;
        if (written === "" || text.slice(column, end) !== written || !isSafeHttpUrl(url)) {
            return;
        }
        const range = rangeOf(line, column, end);
        if (range === null || isLinked(range.startContainer, anchorIdPrefix)) {
            return;
        }

        // Both hosts mark rendered code inert so their own overlay takes the
        // click, which leaves an anchor inside it unclickable until that is lifted.
        line.closest(`[${INERT}]`)?.removeAttribute(INERT);
        const anchor = createSourceAnchor(url, `${anchorIdPrefix}-${line.id}-${position}`);
        anchor.append(range.extractContents());
        range.insertNode(anchor);
    });
};

/**
 * Determines whether a node is inside one of this extension's anchors.
 * @param node The node to test.
 * @param anchorIdPrefix The prefix of the anchors' ids.
 * @returns true if node is inside such an anchor; otherwise, false.
 */
export const isLinked = (node: Node, anchorIdPrefix: string): boolean => {
    const element = node instanceof Element ? node : node.parentElement;
    return element !== null && element.closest(`a[id^="${anchorIdPrefix}"]`) !== null;
};

// The source's text can span several highlighter tokens, so the range runs
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
