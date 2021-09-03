import { KeydownHandler } from "./KeyHandler";
import { confReady, getGlobalConf, GlobalSettings } from "./utils/configuration";
import { setupInput } from "./input";
import { PageEventEmitter } from "./page";

function print (...args: any[]) {
    return browser.runtime.sendMessage({
        args: [(new Error()).stack.replace(/@moz-extension:\/\/[^/]*/g, ""), args],
        funcName: ["console", "log"],
    });
}

window.console.log = print;
window.console.error = print;

// Move email content to holder element. This allows writing content without
// destroying the canvas. Another solution would be to append the canvas to the
// documentElement rather than the body but thunderbird doesn't let us remove
// documentElement children from the compose.onBeforeSend listener.
const bodyChildren = Array.from(document.body.childNodes);
const content = document.createElement("span");
content.id = "firenvim-content";
document.body.appendChild(content);
for (const child of bodyChildren) {
    content.append(child);
};

const rects = document.documentElement.getClientRects();

const canvas = document.createElement("canvas");
canvas.id = "canvas";
canvas.oncontextmenu = () => false;
canvas.width = rects[0].width;
canvas.height = rects[0].height;
canvas.style.position = "absolute";
canvas.style.top = "0px";
canvas.style.left = "0px";
document.body.appendChild(canvas);

const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });

class ThunderbirdPageEventEmitter extends PageEventEmitter {
    private resizeCount = 0;
    constructor() {
        super();
        window.addEventListener("resize", (() => {
            this.resizeCount += 1;
            this.emit("resize", [this.resizeCount, window.innerWidth, window.innerHeight]);
        }).bind(this));
    }
    async evalInPage(js: string) { return eval(js) }
    async focusInput() { return Promise.resolve(); }
    async focusPage() { return Promise.resolve(); }
    async getEditorInfo() { return [document.location.href, "", [1, 1], undefined] as [string, string, [number, number], string] }
    async getElementContent() { return content.innerText }
    async hideEditor() { return Promise.resolve(); }
    async killEditor() {
        return browser.runtime.sendMessage({
            funcName: ["closeOwnTab"]
        });
    }
    async pressKeys(_: any[]) { return Promise.resolve(); }
    async resizeEditor(_: number, __: number) {
        // Don't do anything, resizing is fully controlled by resizing the
        // compose window
        return Promise.resolve();
    }
    async setElementContent(s: string) { content.innerText = s }
    async setElementCursor(_: number, __: number) { return Promise.resolve(); }
}

class ThunderbirdKeyHandler extends KeydownHandler {
    constructor(settings: GlobalSettings) {
        super(document.documentElement, settings);
        const acceptInput = ((evt: any) => {
            this.emit("input", evt.data);
            evt.preventDefault();
            evt.stopImmediatePropagation();
        }).bind(this);
        document.documentElement.addEventListener("beforeinput", (evt: any) => {
            if (evt.isTrusted && !evt.isComposing) {
                acceptInput(evt);
            }
        });
    }

    focus() {
        window.focus();
        document.documentElement.focus();
    }
}

confReady.then(async () => {
    setupInput(
        new ThunderbirdPageEventEmitter(),
        canvas,
        new ThunderbirdKeyHandler(getGlobalConf()),
        connectionPromise);
});
