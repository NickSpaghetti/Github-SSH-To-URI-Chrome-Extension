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

/**
 * Creates the anchor a module source is wrapped in.
 * @param url The address the anchor opens, in a new tab.
 * @param id The anchor's id.
 * @returns The anchor, empty.
 */
export const createSourceAnchor = (url: string, id: string): HTMLAnchorElement => {
    const anchor = document.createElement("a");
    anchor.id = id;
    anchor.href = url;
    anchor.rel = "noreferrer";
    anchor.target = "_blank";
    anchor.style.cssText = ANCHOR_STYLE;
    return anchor;
};
