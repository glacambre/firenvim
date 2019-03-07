
export function toHexCss(n: number) {
    const str = n.toString(16);
    // Pad with leading zeros
    return "#" + (new Array(6 - str.length)).fill("0").join("") + str;
}

export function toHighlightClassName(n: number) {
    return "nvim_highlight_" + n;
}

export function toCss(highlights: HighlightArray) {
    return highlights.reduce((css, elem, id) =>
        `${css} .${toHighlightClassName(id)} { background: ${elem.background}; color: ${elem.foreground}; }`, "");
}
