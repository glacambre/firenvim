import { KeydownHandler } from "./KeyHandler";
import { confReady, getGlobalConf, GlobalSettings } from "./utils/configuration";
import { getPageProxy } from "./page";
import { isChrome } from "./utils/utils";
import { setupInput } from "./input";

const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });
const pageLoaded = new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(reject, 10000)
});

class BrowserKeyHandler extends KeydownHandler {

    constructor(private keyHandler: HTMLElement, settings: GlobalSettings) {
        super(keyHandler, settings);

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

        // On Firefox, Pinyin input method for a single chinese character will
        // result in the following sequence of events:
        // - compositionstart
        // - input (character)
        // - compositionend
        // - input (result)
        // But on Chrome, we'll get this order:
        // - compositionstart
        // - input (character)
        // - input (result)
        // - compositionend
        // So Chrome's input event will still have its isComposing flag set to
        // true! This means that we need to add a chrome-specific event
        // listener on compositionend to do what happens on input events for
        // Firefox.
        // Don't instrument this branch as coverage is only generated on
        // Firefox.
        /* istanbul ignore next */
        if (isChrome()) {
            this.keyHandler.addEventListener("compositionend", (e: CompositionEvent) => {
                acceptInput(e);
            });
        }
    }

    moveTo(x: number, y: number) {
        this.keyHandler.style.left = `${x}px`;
        this.keyHandler.style.top = `${y}px`;
    }
}

export const isReady = browser
    .runtime
    .sendMessage({ funcName: ["publishFrameId"] })
    .then(async (frameId: number) => {
        await confReady;
        await pageLoaded;
        return setupInput(
            getPageProxy(frameId),
            document.getElementById("canvas") as HTMLCanvasElement,
            new BrowserKeyHandler(document.getElementById("keyhandler"), getGlobalConf()),
            connectionPromise);
    });
