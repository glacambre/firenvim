import { EventEmitter } from "./EventEmitter";
import { PageEvents, PageHandlers } from "./page";
import { KeydownHandler } from "./KeyHandler";
import { setupInput } from "./input";

const connectionPromise = Promise.resolve({ port: "QUTEBROWSER_PORT", password: "QUTEBROWSER_PASSWORD" });
const pageLoaded = new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(reject, 10000)
});

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
    async evalInPage(js: string) { console.error(`eval(${js})`); }
    async focusInput() { return Promise.resolve(); }
    async focusPage() { return Promise.resolve(); }
    async getEditorInfo() { return [document.location.href, "", [1, 1], undefined] as [string, string, [number, number], string] }
    async getElementContent() {
        return (window as any).editorContent || "fail";
    }
    async hideEditor() { return Promise.resolve(); }
    async killEditor() { console.error("killEditor"); }
    async pressKeys(_: any[]) { return Promise.resolve(); }
    async resizeEditor(_: number, __: number) { return Promise.resolve(); }
    async setElementContent(text: string) {
        window.parent.postMessage({"funcName": "setContent", args:[text]}, "*");
    }
    async setElementCursor(_: number, __: number) { return Promise.resolve(); }
}


class QuteKeyHandler extends KeydownHandler {

    constructor(private keyHandler: HTMLElement) {
        super(keyHandler, {
            alt: "all",
            "<C-n>": "noop",
            "<C-t>": "noop",
            "<C-w>": "noop",
            "<CS-n>": "noop",
            "<CS-t>": "noop",
            "<CS-w>": "noop",
            ignoreKeys: {
                "all": [],
                "normal": [],
                "visual": [],
                "insert": [],
                "replace": [],
                "cmdline_normal": [],
                "cmdline_insert": [],
                "cmdline_replace": [],
                "operator": [],
                "visual_select": [],
                "cmdline_hover": [],
                "statusline_hover": [],
                "statusline_drag": [],
                "vsep_hover": [],
                "vsep_drag": [],
                "more": [],
                "more_lastline": [],
                "showmatch": [],
            },
            cmdlineTimeout: 3000,
        });

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
