// Chrome doesn't have a "browser" object, instead it uses "chrome".
let curBrowser = "firefox";
if (window.browser === undefined) {
    curBrowser = "chrome";
}

export function isFirefox() {
    return curBrowser === "firefox";
}

// Runs CODE in the page's context by setting up a custom event listener,
// embedding a script element that runs the piece of code and emits its result
// as an event.
export function executeInPage(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const eventId = (new URL(browser.runtime.getURL(""))).hostname + Math.random();
        script.innerHTML = `((evId) => {
            try {
                let result;
                result = ${code};
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
    normal: ((img: Uint8ClampedArray) => (undefined as never)),
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
export function getIconImageData(kind: IconKind, dimensions = "32x32") {
    const [width, height] = dimensions.split("x").map(x => parseInt(x, 10));
    if (!width || !height) {
        throw new Error("Dimensions not correctly formated");
    }
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    const img = new Image(width, height);
    const result = new Promise((resolve) => img.addEventListener("load", (e) => {
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
    const parsedURL = new URL(url);
    const shortId = id.replace(/:nth-of-type/g, "");
    const toAlphaNum = (str: string) => (str.match(/[a-zA-Z0-9]+/g) || [])
        .join("-")
        .slice(-32);
    let ext = "txt";
    if (language !== undefined && language !== null) {
        const ext2 = languageToExtensions(language);
        if (ext2 !== undefined) {
            ext = ext2;
        }
    }
    return `${parsedURL.hostname}_${toAlphaNum(parsedURL.pathname)}_${toAlphaNum(shortId)}.${ext}`;
}

// Returns a number tuple representing the size of characters in the host
export function getCharSize(host: HTMLElement) {
    const span = document.createElement("span");
    span.style.position = "absolute";
    span.style.top = "0px";
    span.style.left = "0px";
    span.innerText = " ";
    host.appendChild(span);
    const { width, height } = span.getBoundingClientRect();
    host.removeChild(span);
    return [width, height];
}

// Returns a number tuple representing how many columns and rows can fit in the
// host.
export function getGridSize(host: HTMLElement) {
    const rect = host.getBoundingClientRect();
    const [width, height] = getCharSize(host);
    return [Math.floor(rect.width / width), Math.floor(rect.height / height)];
}

// Given a language name, returns a filename extension. Can return undefined.
export function languageToExtensions(language: string) {
    const lang = language.toLowerCase();
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
}
