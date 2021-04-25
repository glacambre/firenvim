let curHost = "firefox";

// Can't get coverage for thunderbird.
/* istanbul ignore next */
if ((browser as any).composeScripts !== undefined || document.location.href === "about:blank?compose") {
    curHost = "thunderbird";
// Chrome doesn't have a "browser" object, instead it uses "chrome".
} else if (window.browser === undefined) {
    curHost = "chrome";
}

export function isChrome() {
    return curHost === "chrome";
}
export function isThunderbird() {
    return curHost === "thunderbird";
}

// Runs CODE in the page's context by setting up a custom event listener,
// embedding a script element that runs the piece of code and emits its result
// as an event.
export function executeInPage(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const eventId = (new URL(browser.runtime.getURL(""))).hostname + Math.random();
        script.innerHTML = `(async (evId) => {
            try {
                let result;
                result = await ${code};
                window.dispatchEvent(new CustomEvent(evId, {
                    detail: {
                        success: true,
                        result,
                    }
                }));
            } catch (e) {
                window.dispatchEvent(new CustomEvent(evId, {
                    detail: { success: false, reason: e },
                }));
            }
        })(${JSON.stringify(eventId)})`;
        window.addEventListener(eventId, ({ detail }: any) => {
            script.parentNode.removeChild(script);
            if (detail.success) {
                return resolve(detail.result);
            }
            return reject(detail.reason);
        }, { once: true });
        document.head.appendChild(script);
    });
}

// Various filters that are used to change the appearance of the BrowserAction
// icon.
const svgpath = "firenvim.svg";
const transformations = {
    disabled: (img: Uint8ClampedArray) => {
        for (let i = 0; i < img.length; i += 4) {
            // Skip transparent pixels
            if (img[i + 3] === 0) {
                continue;
            }
            const mean = Math.floor((img[i] + img[i + 1] + img[i + 2]) / 3);
            img[i] = mean;
            img[i + 1] = mean;
            img[i + 2] = mean;
        }
    },
    error: (img: Uint8ClampedArray) => {
        for (let i = 0; i < img.length; i += 4) {
            // Turn transparent pixels red
            if (img[i + 3] === 0) {
                img[i] = 255;
                img[i + 3] = 255;
            }
        }
    },
    normal: ((_img: Uint8ClampedArray) => (undefined as never)),
    notification: (img: Uint8ClampedArray) => {
        for (let i = 0; i < img.length; i += 4) {
            // Turn transparent pixels yellow
            if (img[i + 3] === 0) {
                img[i] = 255;
                img[i + 1] = 255;
                img[i + 3] = 255;
            }
        }
    },
};

export type IconKind = keyof typeof transformations;

// Takes an icon kind and dimensions as parameter, draws that to a canvas and
// returns a promise that will be resolved with the canvas' image data.
export function getIconImageData(kind: IconKind, width = 32, height = 32) {
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    const img = new Image(width, height);
    const result = new Promise((resolve) => img.addEventListener("load", () => {
        ctx.drawImage(img, 0, 0, width, height);
        const id = ctx.getImageData(0, 0, width, height);
        transformations[kind](id.data);
        resolve(id);
    }));
    img.src = svgpath;
    return result;
}

// Given a url and a selector, tries to compute a name that will be unique,
// short and readable for the user.
export function toFileName(url: string, id: string, language: string) {
    let parsedURL;
    try {
        parsedURL = new URL(url);
    } catch (e) {
        // Only happens with thunderbird, where we can't get coverage
        /* istanbul ignore next */
        parsedURL = { hostname: 'thunderbird', pathname: 'mail' };
    }
    const shortId = id.replace(/:nth-of-type/g, "");
    const toAlphaNum = (str: string) => (str.match(/[a-zA-Z0-9]+/g) || [])
        .join("-")
        .slice(-32);
    const ext = languageToExtensions(language);
    return `${parsedURL.hostname}_${toAlphaNum(parsedURL.pathname)}_${toAlphaNum(shortId)}.${ext}`;
}

// Given a language name, returns a filename extension. Can return undefined.
export function languageToExtensions(language: string) {
    if (language === undefined || language === null) {
        language = "";
    }
    const lang = language.toLowerCase();
    /* istanbul ignore next */
    switch (lang) {
        case "apl":              return "apl";
        case "brainfuck":        return "bf";
        case "c":                return "c";
        case "c#":               return "cs";
        case "c++":              return "cpp";
        case "ceylon":           return "ceylon";
        case "clike":            return "c";
        case "clojure":          return "clj";
        case "cmake":            return ".cmake";
        case "cobol":            return "cbl";
        case "coffeescript":     return "coffee";
        case "commonlisp":      return "lisp";
        case "crystal":          return "cr";
        case "css":              return "css";
        case "cython":           return "py";
        case "d":                return "d";
        case "dart":             return "dart";
        case "diff":             return "diff";
        case "dockerfile":       return "dockerfile";
        case "dtd":              return "dtd";
        case "dylan":            return "dylan";
        // Eiffel was there first but elixir seems more likely
        // case "eiffel":           return "e";
        case "elixir":           return "e";
        case "elm":              return "elm";
        case "erlang":           return "erl";
        case "f#":               return "fs";
        case "factor":           return "factor";
        case "forth":            return "fth";
        case "fortran":          return "f90";
        case "gas":              return "asm";
        case "go":               return "go";
        // GFM: CodeMirror's github-flavored markdown
        case "gfm":              return "md";
        case "groovy":           return "groovy";
        case "haml":             return "haml";
        case "handlebars":       return "hbs";
        case "haskell":          return "hs";
        case "haxe":             return "hx";
        case "html":             return "html";
        case "htmlembedded":     return "html";
        case "htmlmixed":        return "html";
        case "java":             return "java";
        case "javascript":       return "js";
        case "jinja2":           return "jinja";
        case "julia":            return "jl";
        case "jsx":              return "jsx";
        case "kotlin":           return "kt";
        case "latex":            return "latex";
        case "less":             return "less";
        case "lua":              return "lua";
        case "markdown":         return "md";
        case "mllike":            return "ml";
        case "ocaml":            return "ml";
        case "octave":           return "m";
        case "pascal":           return "pas";
        case "perl":             return "pl";
        case "php":              return "php";
        case "powershell":       return "ps1";
        case "python":           return "py";
        case "r":                return "r";
        case "rst":              return "rst";
        case "ruby":             return "ruby";
        case "rust":             return "rs";
        case "sas":              return "sas";
        case "sass":             return "sass";
        case "scala":            return "scala";
        case "scheme":           return "scm";
        case "scss":             return "scss";
        case "smalltalk":        return "st";
        case "shell":            return "sh";
        case "sql":              return "sql";
        case "stex":             return "latex";
        case "swift":            return "swift";
        case "tcl":              return "tcl";
        case "toml":             return "toml";
        case "twig":             return "twig";
        case "typescript":       return "ts";
        case "vb":               return "vb";
        case "vbscript":         return "vbs";
        case "verilog":          return "sv";
        case "vhdl":             return "vhdl";
        case "xml":              return "xml";
        case "yaml":             return "yaml";
        case "z80":              return "z8a";
    }
    return "txt";
}

// Make tslint happy
const fontFamily = "font-family";

// Can't be tested e2e :/
/* istanbul ignore next */
export function parseSingleGuifont(guifont: string, defaults: any) {
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
};

// Parses a guifont declaration as described in `:h E244`
// defaults: default value for each of.
// Can't be tested e2e :/
/* istanbul ignore next */
export function parseGuifont(guifont: string, defaults: any) {
    const fonts = guifont.split(",").reverse();
    return fonts.reduce((acc, cur) => parseSingleGuifont(cur, acc), defaults);
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

