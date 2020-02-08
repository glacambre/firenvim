import * as browser from "webextension-polyfill"; //lgtm [js/unused-local-variable]

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
