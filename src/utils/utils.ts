import * as browser from "webextension-polyfill";

let curBrowser = "firefox";
if (window.browser === undefined) {
    curBrowser = "chrome";
}

export function isFirefox() {
    return curBrowser === "firefox";
}

export function svgPathToImageData(path: string, dimensions = "32x32") {
    const [width, height] = dimensions.split("x").map(x => parseInt(x, 10));
    if (!width || !height) {
        throw new Error("Dimensions not correctly formated");
    }
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    // Placeholder until I can figure out how to draw an svg to a canvas
    ctx.rect(width * 0.10, height * 0.10, width * 0.80, height * 0.80);
    ctx.fillStyle = ({
        "firenvim-disabled.svg": "#888888",
        "firenvim-error.svg": "#FF0000",
        "firenvim-notification.svg": "#FFFF00",
    } as any)[path] || "#00FF00";
    ctx.fill();
    return ctx.getImageData(0, 0, width, height);
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
