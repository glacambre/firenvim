// Make tslint happy
const fontFamily = "font-family";

// Parses a guifont declaration as described in `:h E244`
// defaults: default value for each of
export function parseGuifont(guifont: string, defaults: any) {
    const options = guifont.split(":");
    const result = Object.assign({}, defaults);
    if (/^[a-zA-Z0-9]+$/.test(options[0])) {
        result[fontFamily] = options[0];
    } else {
        result[fontFamily] = JSON.stringify(options[0]);
    }
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

