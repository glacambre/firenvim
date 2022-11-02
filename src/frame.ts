import { confReady, getGlobalConf } from "./utils/configuration";
import { getPageProxy } from "./page";
import { setupInput } from "./input";
import { KeyHandler } from "./KeyHandler";

const pageLoaded = new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(reject, 10000)
});
const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });

export const isReady = browser
    .runtime
    .sendMessage({ funcName: ["publishFrameId"] })
    .then(async (frameId: number) => {
        await confReady;
        await pageLoaded;
        return setupInput(
            getPageProxy(frameId),
            document.getElementById("canvas") as HTMLCanvasElement,
            new KeyHandler(document.getElementById("keyhandler"), getGlobalConf()),
            connectionPromise);
    });
