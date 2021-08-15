import { getPageProxy } from "./page";
import { setupInput } from "./input";

const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });
const pageLoaded = new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(reject, 10000)
});

export const isReady = browser
    .runtime
    .sendMessage({ funcName: ["publishFrameId"] })
    .then(async (frameId: number) => {
        await pageLoaded;
        return setupInput(getPageProxy(frameId), connectionPromise);
    });
