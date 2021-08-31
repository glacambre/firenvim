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

const rects = document.documentElement.getClientRects();

const canvas = document.createElement("canvas");
canvas.id = "canvas";
canvas.oncontextmenu = () => false;
canvas.width = rects[0].width;
canvas.height = rects[0].height;
canvas.style.position = "absolute";
canvas.style.top = "0px";
canvas.style.left = "0px";
document.documentElement.appendChild(canvas);

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
    async focusInput(...args: any[]) { print(...args) }
    async focusPage(...args: any[]) { print(...args) }
    async getEditorInfo() { return ["", "", [1, 1], undefined] as [string, string, [number, number], string] }
    async getElementContent() { return document.body.innerText }
    async hideEditor(...args: any[]) { print(...args) }
    async killEditor(...args: any[]) { print(...args) }
    async pressKeys(...args: any[]) { print(...args) }
    async resizeEditor(...args: any[]) { print(...args) }
    async setElementContent(s: string) { document.body.innerText = s }
    async setElementCursor(...args: any[]) { print(...args) }
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
