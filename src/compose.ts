import { KeydownHandler } from "./KeyHandler";
import { confReady, getGlobalConf, GlobalSettings } from "./utils/configuration";
import { setupInput } from "./input";

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

const page = {
    evalInPage: (js: string) => eval(js),
    focusInput: print,
    focusPage: print,
    getEditorInfo: () => Promise.resolve(["", "", [1, 1], undefined]),
    getElementContent: () => Promise.resolve(document.body.innerText),
    hideEditor: print,
    killEditor: print,
    pressKeys: print,
    resizeEditor: print,
    setElementContent: (s: string) => { document.body.innerText = s },
    setElementCursor: print,
};

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
        page as any,
        canvas,
        new ThunderbirdKeyHandler(getGlobalConf()),
        connectionPromise);
});
