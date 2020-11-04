import { FirenvimElement } from "./FirenvimElement";
import { executeInPage } from "./utils/utils";

const computedStyles : {[k:string]: CSSStyleDeclaration} = {
    documentElement: window.getComputedStyle(document.documentElement),
    body: window.getComputedStyle(document.body),
};
const overridenStyles : {[k: string]: string} = {
    "height": "100%",
    "width": "100%",
    "marginBottom": "0px",
    "marginLeft": "0px",
    "marginRight": "0px",
    "marginTop": "0px",
    "paddingBottom": "0px",
    "paddingLeft": "0px",
    "paddingRight": "0px",
    "paddingTop": "0px",
};
function restoreComputedStyles (_: any) {
    for (const element of Object.keys(computedStyles)) {
        const e = (document as any)[element];
        for (const style of Object.keys(overridenStyles)) {
            e.style[style] = (computedStyles as any)[element][style];
        }
    }
}
function overrideComputedStyles () {
    for (const element of Object.keys(computedStyles)) {
        const e = (document as any)[element];
        for (const style of Object.keys(overridenStyles)) {
            e.style[style] = overridenStyles[style];
        }
    }
}
overrideComputedStyles();

const firenvimElement = new FirenvimElement(document.body, () => Promise.resolve(), restoreComputedStyles);

firenvimElement.attachToPage(
    new Promise((resolve, reject) => {
        setTimeout(reject, 10000);
        browser.runtime.onMessage.addListener((request: { funcName: string[], args: any[] }) => {
            const args = request.args;
            switch (request.funcName[0]) {
                case "evalInPage": return executeInPage(args[1]);
                case "focusInput": throw new Error("focusInput not implemented in Thunderbird");
                case "focusPage": throw new Error("focusPage not implemented in Thunderbird");
                case "getEditorInfo": return firenvimElement.getBufferInfo();
                case "getElementContent": return firenvimElement.getPageElementContent();
                case "hideEditor": throw new Error("hideEditor not implemented in Thunderbird");
                case "killEditor": return firenvimElement.detachFromPage();
                case "pressKeys": throw new Error("pressKeys not implemented in Thunderbird");
                case "registerNewFrameId": return (resolve(request.args[0]));
                case "resizeEditor": throw new Error("resizeEditor not implemented in Thunderbird");
                case "setElementContent": return firenvimElement.setPageElementContent(args[1]);
                case "setElementCursor": return firenvimElement.setPageElementCursor(args[1], args[2]);
                default: throw new Error("Unhandeld request: " + JSON.stringify(request));
            }
        });
    })
);
