// Make tslint happy
const fontFamily = "font-family";

// Parses a guifont declaration as described in `:h E244`
// defaults: default value for each of
export function parseGuifont(guifont: string, defaults: any) {
    const options = guifont.split(":");
    const result = Object.assign({}, defaults);
    result[fontFamily] = JSON.stringify(options[0]);
    if (defaults[fontFamily]) {
        result[fontFamily] += `, ${defaults[fontFamily]}`;
    }
    return options.slice(1).reduce((acc, option) => {
            switch (option[0]) {
                case "h":
                    acc["font-size"] = `${option.slice(1)}pt`;
                    break;
                case "b":
                    acc["font-weight"] = "bold";
                    break;
                case "i":
                    acc["font-style"] = "italic";
                    break;
                case "u":
                    acc["text-decoration"] = "underline";
                    break;
                case "s":
                    acc["text-decoration"] = "line-through";
                    break;
                case "w": // Can't set font width. Would have to adjust cell width.
                case "c": // Can't set character set
                    break;
            }
            return acc;
        }, result as any);
}

// Takes a `guifont` declaration and returns that same font declaration but as
// a bunch of CSS declarations.
export function guifontToMultiDecl(guifont: string) {
    const defaults: any = {};
    defaults[fontFamily] = "Monospace";
    defaults["font-size"] = "9pt";
    return Object.entries(parseGuifont(guifont, defaults))
        .map(([key, value]) => `${key}: ${value};\n`)
        .join("\n");
}

// Takes an array of `guifont` declarations and returns them as a single CSS
// declaration, using font-family for font fallback.
export function guifontsToFontFamily(guifonts: string[]) {
    const defaults: any = {};
    defaults[fontFamily] = "Monospace";
    defaults["font-size"] = "9pt";
    const reducedGuifonts = guifonts
        .slice()
        .reverse()
        .reduce((acc, cur) => parseGuifont(cur, acc), defaults);
    return `font-family: ${reducedGuifonts[fontFamily]}; font-size: ${reducedGuifonts["font-size"]};`;
}

// Takes a string formatted according to the `guifont` spec and returns a CSS
// declaration that matches it.
export function guifontsToCSS(guifont: string) {
    const guifonts = (guifont + ",")
        .match(/.+?[^\\],/g) // split on non-escaped commas
        .map(s => s.slice(0, -1)); // remove last comma of each font
    if (guifonts.length > 1) {
        // If there are multiple font declarations, we use a CSS declaration
        // like this: `font-family: font-family1 font-size font-style
        // font-weight, font-family2...`. This prevents us from setting
        // size/bold/italics/underlnie/strikethrough but enables letting the
        // browser fallback to other fonts if one can't be found.
        return guifontsToFontFamily(guifonts);
    }
    return guifontToMultiDecl(guifonts[0]);
}

// Computes a unique selector for its argument.
export function computeSelector(element: HTMLElement) {
    function uniqueSelector(e: HTMLElement): string {
        // Only matching alphanumeric selectors because others chars might have special meaning in CSS
        if (e.id && e.id.match("^[a-zA-Z0-9_-]+$")) {
            const id = e.tagName + `[id="${e.id}"]`;
            if (document.querySelectorAll(id).length === 1) {
                return id;
            }
        }
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

// Turns a number into its hash+6 number hexadecimal representation.
export function toHexCss(n: number) {
    if (n === undefined)
        return undefined;
    const str = n.toString(16);
    // Pad with leading zeros
    return "#" + (new Array(6 - str.length)).fill("0").join("") + str;
}

export function toHighlightClassName(n: number) {
    return "nvim_highlight_" + n;
}

// Computes a CSS stylesheet that represents the HighlightArray
export function toCss(highlights: HighlightArray) {
    const bg = highlights[0].background;
    const fg = highlights[0].foreground;
    return highlights.reduce((css, elem, id) => css +
        `.${toHighlightClassName(id)}{background: ${elem.background || bg};color:${elem.foreground || fg};font-style:${elem.italic ? "italic" : "normal"};font-weight:${elem.bold ? "bold" : "normal"};text-decoration-line:${(elem.undercurl || elem.underline) ? "underline" : (elem.strikethrough ? "line-through" : "none")};text-decoration-style:${elem.undercurl ? "wavy" : "solid"};}`
        , "");
}
