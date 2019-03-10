import { getFunctions } from "./functions";

// We don't need to give real values to getFunctions since we're only trying to
// get the name of functions that exist in the page.
const functions = getFunctions({} as any);

export const page = {} as typeof functions;

let funcName: keyof typeof functions;
for (funcName in functions) {
    if (!functions.hasOwnProperty(funcName)) { // Make tslint happy
        continue;
    }
    // We need this local variable because Typescript won't let us give type
    // annotations to variables declared on for(... in ...) loops
    const func = funcName;
    page[func] = ((...arr: any[]) => {
        return browser.runtime.sendMessage({
            args: {
                args: arr,
                function: func,
            },
            function: "messageOwnTab",
        });
    }) as ((typeof functions)[typeof func]);
}
