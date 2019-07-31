import * as browser from "webextension-polyfill"; // lgtm[js/unused-local-variable]

export function computeSelector(element: HTMLElement) {
    function uniqueSelector(e: HTMLElement): string {
        // Only matching alphanumeric selectors because others chars might have special meaning in CSS
        if (e.id && e.id.match("^[a-zA-Z0-9_-]+$")) { return "#" + e.id; }
        // If we reached the top of the document
        if (!e.parentElement) { return "HTML"; }
        // Compute the position of the element
        const index =
            Array.from(e.parentElement.children)
                .filter(child => child.tagName === e.tagName)
                .indexOf(e) + 1;
        return `${uniqueSelector(e.parentElement)} > ${e.tagName}:nth-of-type(${index})`;
    }
    return uniqueSelector(element);
}

export function toHexCss(n: number) {
    const str = n.toString(16);
    // Pad with leading zeros
    return "#" + (new Array(6 - str.length)).fill("0").join("") + str;
}

export function toHighlightClassName(n: number) {
    return "nvim_highlight_" + n;
}

export function toCss(highlights: HighlightArray) {
    const bg = highlights[0].background;
    const fg = highlights[0].foreground;
    return highlights.reduce((css, elem, id) => css +
        `.${toHighlightClassName(id)} { background: ${elem.background || bg}; color: ${elem.foreground || fg}; }`
        , "");
}
