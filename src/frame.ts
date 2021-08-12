import { PageType, pageFunctions } from "./page";
import { getInputSetupFunction } from "./input";

const connectionPromise = browser.runtime.sendMessage({ funcName: ["getNeovimInstance"] });
const pageLoaded = new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(reject, 10000)
});

export const isReady = browser
    .runtime
    .sendMessage({ funcName: ["publishFrameId"] })
    .then((frameId: number) => {
        const page = {} as PageType;

        let funcName: keyof PageType;
        for (funcName in pageFunctions) {
            // We need to declare func here because funcName is a global and would not
            // be captured in the closure otherwise
            const func = funcName;
            (page[func] as any) = ((...arr: any[]) => {
                return browser.runtime.sendMessage({
                    args: {
                        args: [frameId].concat(arr),
                        funcName: [func],
                    },
                    funcName: ["messagePage"],
                });
            });
        }

        return pageLoaded.then(() => new Promise((resolve, reject) => {
            getInputSetupFunction(page, connectionPromise, resolve, reject)();
        }));
    }
);
