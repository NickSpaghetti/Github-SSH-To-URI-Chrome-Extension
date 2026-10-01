import { SourceLinks } from "../../../src/types/SourceLinks";

/** Text a highlighter leaves between its spans, not wrapped in one. */
export type Bare = { readonly bare: string };

/** A highlighter token: a span of text, a span holding tokens, or bare text. */
export type Token = string | readonly Token[] | Bare;

/** A line: its text as one text node, or its tokens. */
export type Line = string | readonly Token[];

/**
 * Makes text a highlighter leaves between its spans.
 * @param value The text.
 * @returns The bare text token.
 */
export const text = (value: string): Bare => ({ bare: value });

const isBare = (token: Token): token is Bare => typeof token === "object" && "bare" in token;

/**
 * Renders a token the way a highlighter does.
 * @param token The token.
 * @returns A span for text or tokens, or a text node for bare text.
 */
export const renderToken = (token: Token): Node => {
    if (isBare(token)) {
        return document.createTextNode(token.bare);
    }
    const span = document.createElement("span");
    if (typeof token === "string") {
        span.textContent = token;
    } else {
        span.append(...token.map(renderToken));
    }
    return span;
};

/**
 * Fills a rendered line with its text or tokens.
 * @param element The line's element.
 * @param line The line's text or tokens.
 */
export const fillLine = (element: Element, line: Line): void => {
    if (typeof line === "string") {
        element.textContent = line;
    } else {
        element.append(...line.map(renderToken));
    }
};

/**
 * Numbers lines given either in order from line 1 or by line number.
 * @param lines The lines.
 * @returns Each line by its 1-based number, and the last number.
 */
export const numberLines = (
    lines: readonly Line[] | Readonly<Record<number, Line>>,
): { byNumber: Readonly<Record<number, Line>>; last: number } => {
    const byNumber: Record<number, Line> = Array.isArray(lines)
        ? Object.fromEntries(lines.map((line, index) => [index + 1, line]))
        : lines;
    return { byNumber, last: Math.max(...Object.keys(byNumber).map(Number)) };
};

/** A source as the parser places it: its line, its column, and what the file writes. */
export type Placement = { line: number; column: number; written: string; url: string };

/**
 * Builds links from where the parser read each source.
 * @param placements Each source's line, column, text as written, and url.
 * @returns The links.
 */
export const placedAt = (...placements: Placement[]): SourceLinks => {
    const placed = new Map<number, { column: number; written: string; url: string }[]>();
    for (const { line, column, written, url } of placements) {
        placed.set(line, [...(placed.get(line) ?? []), { column, written, url }]);
    }
    return placed;
};

/** @returns Every anchor on the page, in page order. */
export const anchors = (): HTMLAnchorElement[] => Array.from(document.querySelectorAll("a"));

/**
 * @param id A line's element id.
 * @returns The line's text, or "" when there is no such line.
 */
export const lineText = (id: string): string => document.getElementById(id)?.textContent ?? "";
