import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]

// Chrome doesn't have a "browser" object, instead it uses "chrome".
let curBrowser = "firefox";
if (window.browser === undefined) {
    curBrowser = "chrome";
}

export function isFirefox() {
    return curBrowser === "firefox";
}

// Takes an element as parameter. If this element lives in an element which is
// used by CodeMirror, returns the "topmost" CodeMirror element. Otherwise,
// returns the element itself.
export function getCodeMirrorParent(elem: HTMLElement): HTMLElement {
    function isCodeMirror(element: HTMLElement) {
       return element.className.match(/CodeMirror/gi);
    }
    let parent = elem;
    // We check both parentElement and parentElement.parentElement because
    // some CodeMirror elements have internal elements the className of
    // which doesn't contain "CodeMirror"
    for (let i = 0; i < 2; ++i) {
        parent = parent.parentElement;
        if (parent && isCodeMirror(parent)) {
            return getCodeMirrorParent(parent);
        }
    }
    return elem;
}

// Takes an element as parameter. If this element lives in an element which is
// used by AdeEditor, returns the "topmost" AceEditor element. Otherwise,
// returns the element itself.
export function getAceParent(elem: HTMLElement): HTMLElement {
    function isAce(element: HTMLElement) {
        return element.className.match(/ace_editor/gi);
    }
    if (elem.parentElement && isAce(elem.parentElement)) {
        return getAceParent(elem.parentElement);
    }
    return elem;
}

// Takes an element as parameter. If this element lives in an element which is
// used by the Monaco Editor, returns the "topmost" Monaco element. Otherwise,
// returns the element itself.
export function getMonacoParent(elem: HTMLElement): HTMLElement {
    if (elem.className.match(/monaco-editor/gi) && elem.getAttribute("data-uri").match("inmemory://")) {
        return elem;
    }
    function isMonaco(element: HTMLElement) {
        return element.className.match(/monaco-editor/gi);
    }
    let parent = elem;
    // Check if parent, grand-parent or great grand-parent is monaco
    for (let i = 0; i < 3; ++i) {
        parent = parent.parentElement;
        if (parent && isMonaco(parent)) {
            return getMonacoParent(parent);
        }
    }
    return elem;
}

export function getEditorElement(elem: HTMLElement): HTMLElement {
    return getMonacoParent(getAceParent(getCodeMirrorParent(elem)));
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
export function toFileName(url: string, id: string) {
    const parsedURL = new URL(url);
    const shortId = id.replace(/:nth-of-type/g, "");
    const toAlphaNum = (str: string) => (str.match(/[a-zA-Z0-9]+/g) || [])
        .join("-")
        .slice(-32);
    return `${parsedURL.hostname}_${toAlphaNum(parsedURL.pathname)}_${toAlphaNum(shortId)}.txt`;
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
