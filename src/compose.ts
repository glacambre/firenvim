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

// Make canvas size of window
const canvas = document.createElement("canvas");
canvas.id = "canvas";
canvas.oncontextmenu = () => false;
canvas.style.position = "fixed";
canvas.style.top = "0px";
canvas.style.left = "0px";
document.body.appendChild(canvas);

const style = document.createElement("style");
style.innerText = `
html, body {
    /* Hide caret, which sometimes appears over canvas */
    caret-color: transparent !important;
    /* Hide scrollbars when email is longer than window */
    overflow: hidden !important;
}
body > *:not(canvas) {
    /* Hide email content, useful when email is longer than canvas and */
    /* canvas shorter than window */
    display: none !important;
}
`.replace(/\n/g, "");
document.head.appendChild(style);

const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });

class ThunderbirdPageEventEmitter extends PageEventEmitter {
    private resizeCount = 0;
    constructor() {
        super();
        const onResize = (() => {
            this.resizeCount += 1;
            this.emit("resize", [this.resizeCount, window.innerWidth, window.innerHeight]);
        }).bind(this)
        window.addEventListener("resize", onResize);
        // We need to trigger a resize on startup because for some reason the
        // window might be 1px wide when the compose script is created.
        setTimeout(onResize, 100);
    }
    async evalInPage(js: string) { return eval(js) }
    async focusInput() { return Promise.resolve(); }
    async focusPage() { return Promise.resolve(); }
    async getEditorInfo() { return [document.location.href, "", [1, 1], undefined] as [string, string, [number, number], string] }
    async getElementContent() {
        const details = await browser.runtime.sendMessage({ funcName: ["getOwnComposeDetails"], args: [] });
        if (details.isPlainText) {
            return details.plainTextBody;
        }

        return "HTML composition mode not supported due to extension "
            + "restrictions. Switch to plaintext editing (Account Settings "
            + "> Composition & Addressing > Untick `Compose messages in HTML "
            + "Format`)";
    }
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
    async setElementContent(_: string) { return; }
    async setElementCursor(_: number, __: number) { return Promise.resolve(); }
}

class ThunderbirdKeyHandler extends KeydownHandler {
    private enabled: boolean;
    constructor(settings: GlobalSettings) {
        super(document.documentElement, settings);
        this.start();
        const acceptInput = ((evt: any) => {
            if (this.enabled) {
                this.emit("input", evt.data);
                evt.preventDefault();
                evt.stopImmediatePropagation();
            }
        }).bind(this);
        document.documentElement.addEventListener("beforeinput", (evt: any) => {
            if (evt.isTrusted && !evt.isComposing) {
                acceptInput(evt);
            }
        });
    }

    start() {
        this.enabled = true;
    }

    stop() {
        this.enabled = false;
    }

    focus() {
        window.focus();
        document.documentElement.focus();
    }
}

confReady.then(async () => {
    const keyHandler = new ThunderbirdKeyHandler(getGlobalConf());
    const page = new ThunderbirdPageEventEmitter();
    page.on("pause_keyhandler", () => {
        keyHandler.stop();
        setTimeout(() => keyHandler.start(), 1000);
    });
    setupInput(
        page,
        canvas,
        keyHandler,
        connectionPromise);
});
