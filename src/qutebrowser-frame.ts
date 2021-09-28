import { EventEmitter } from "./EventEmitter";
import { PageEvents, PageHandlers } from "./page";
import { KeydownHandler } from "./KeyHandler";
import { setupInput } from "./input";
import { applySettingsToDefaults } from "./utils/configuration";

// QUTEBROWSER_PORT and QUTEBROWSER_PASSWORD will be replaced through
// string-substitutions when the user runs `spawn --userscript firenvim`
const connectionPromise = Promise.resolve({ port: "QUTEBROWSER_PORT", password: "QUTEBROWSER_PASSWORD" });

// Tiny promise to allow blocking until page is loaded
const pageLoaded = new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(reject, 10000)
});

// Handler to notify the parent
// TODO: see if we can find a way to only notify the qutebrowser script rather
// than the whole window?
function notify(data: object) {
    window.parent.postMessage(data, "*");
}

// Notify and wait for an answer
function request(data: object) {
    const reqId = Math.random();
    return new Promise((resolve) => {
        function once(e: MessageEvent<any>) {
            if (e.source !== window.parent || e.data.token !== (window as any).authToken) {
                return
            }
            if (e.data.funcName === "resolve" && e.data.reqId === reqId) {
                window.removeEventListener("message", once);
                return resolve(e.data.args[0]);
            }
        }
        window.addEventListener("message", once);
        notify(Object.assign({ reqId }, data));
    });
}

// An event emitter that takes care of sending messages to the frame and receiving answers
class QutePageEventEmitter extends EventEmitter<PageEvents, PageHandlers> {
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
    // Let's not allow eval for now...
    async evalInPage(js: string) { console.error(`eval(${js})`); }
    async focusInput() {
        notify({"funcName": "focusInput", args: []});
    }
    async focusPage() {
        notify({"funcName": "focusPage", args: []});
    }
    async getEditorInfo() {
        return request({"funcName": "getEditorInfo", args: []}) as Promise<[string, string, [number, number], string]>
    }
    async getElementContent() {
        return request({"funcName": "getElementContent", args: []}) as Promise<string>
    }
    async hideEditor() {
        return notify({"funcName": "hideEditor", args: []})
    }
    async killEditor() {
        return notify({"funcName": "killEditor", args: []})
    }
    // Let's avoid this one too until we have a proper idea of what this means security-wise
    async pressKeys(_: any[]) { return Promise.resolve(); }
    async resizeEditor(w: number, h: number) {
        return notify({"funcName": "resizeEditor", args: [w, h]});
    }
    async setElementContent(text: string) {
        notify({"funcName": "setElementContent", args: [text]});
    }
    async setElementCursor(x: number, y: number) {
        notify({"funcName": "setElementCursor", args: [x]});
    }
}

// Takes care of receiving keystrokes
class QuteKeyHandler extends KeydownHandler {

    constructor(private keyHandler: HTMLElement) {
        super(keyHandler, applySettingsToDefaults("", {}));

        const acceptInput = ((evt: any) => {
            this.emit("input", evt.target.value);
            evt.preventDefault();
            evt.stopImmediatePropagation();
        }).bind(this);

        this.keyHandler.addEventListener("input", (evt: any) => {
            if (evt.isTrusted && !evt.isComposing) {
                acceptInput(evt);
                evt.target.innerText = "";
                evt.target.value = "";
            }
        });

        this.keyHandler.addEventListener("compositionend", (e: CompositionEvent) => {
            acceptInput(e);
        });
    }

    moveTo(x: number, y: number) {
        this.keyHandler.style.left = `${x}px`;
        this.keyHandler.style.top = `${y}px`;
    }
}

export const isReady = (async () => {
        await pageLoaded;
        return setupInput(
            new QutePageEventEmitter(),
            document.getElementById("canvas") as HTMLCanvasElement,
            new QuteKeyHandler(document.getElementById("keyhandler")),
            connectionPromise);
})();
