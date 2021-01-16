import { confReady } from "./utils/configuration";
import { firenvimGlobal } from "./common";

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
for (const element of ["documentElement", "body"]) {
    const e = (document as any)[element];
    for (const style of Object.keys(overridenStyles)) {
        e.style[style] = overridenStyles[style];
    }
}

confReady.then(() => {
    // Playing tricks with __proto__ to make fakeEvent look like a real event.
    // We need this because we can't change the target when using the
    // FocusEvent constructor???
    const fakeEvent = { target: document.body };
    (fakeEvent as any).__proto__ = (new FocusEvent("focus") as any).__proto__;
    firenvimGlobal.nvimify(fakeEvent);
});
