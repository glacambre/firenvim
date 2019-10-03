import * as browser from "webextension-polyfill";

let curBrowser = "firefox";
if (window.browser === undefined) {
    curBrowser = "chrome";
}

export function isFirefox() {
    return curBrowser === "firefox";
}

export function getCodeMirrorParent(elem: HTMLElement): HTMLElement {
    function isCodeMirror(element: HTMLElement) {
       return element.className.match(/CodeMirror/gi);
    }
    if (elem.parentElement) {
        // We check both parentElement and parentElement.parentElement because
        // some CodeMirror elements have internal elements the className of
        // which doesn't contain "CodeMirror"
        if (isCodeMirror(elem.parentElement)) {
            return getCodeMirrorParent(elem.parentElement);
        }
        if (isCodeMirror(elem.parentElement.parentElement)) {
            return getCodeMirrorParent(elem.parentElement.parentElement);
        }
    }
    return elem;
}

export function getAceParent(elem: HTMLElement): HTMLElement {
    function isAce(element: HTMLElement) {
        return element.className.match(/ace_editor/gi);
    }
    if (elem.parentElement && isAce(elem.parentElement)) {
        return getAceParent(elem.parentElement);
    }
    return elem;
}

export function svgPathToImageData(path: string, dimensions = "32x32") {
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
        resolve(id);
    }));
    img.src = path;
    return result;
}

export function toFileName(url: string, id: string) {
    const parsedURL = new URL(url);
    const shortId = id.replace(/:nth-of-type/g, "");
    const toAlphaNum = (str: string) => (str.match(/[a-zA-Z0-9]+/g) || [])
        .join("-")
        .slice(-32);
    return `${parsedURL.hostname}_${toAlphaNum(parsedURL.pathname)}_${toAlphaNum(shortId)}.txt`;
}

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

export function getGridSize(host: HTMLElement) {
    const rect = host.getBoundingClientRect();
    const [width, height] = getCharSize(host);
    return [Math.floor(rect.width / width), Math.floor(rect.height / height)];
}
