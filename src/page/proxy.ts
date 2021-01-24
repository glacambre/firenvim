import { getNeovimFrameFunctions } from "./functions";

// We don't need to give real values to getFunctions since we're only trying to
// get the name of functions that exist in the page.
const functions = getNeovimFrameFunctions({} as any);

type ft = typeof functions;
// The proxy automatically appends the frameId to the request, so we hide that from users
type ArgumentsType<T> = T extends (x: any, ...args: infer U) => any ? U: never;
type Promisify<T> = T extends Promise<infer U> ? T : Promise<T>;

export const page = {} as {
    [k in keyof ft]: (...args: ArgumentsType<ft[k]>) => Promisify<ReturnType<ft[k]>>
};

let funcName: keyof typeof functions;
for (funcName in functions) {
    // This if condition is never executed and actually only there for TSLint
    /* istanbul ignore next */
    if (!functions.hasOwnProperty(funcName)) {
        continue;
    }
    // We need to declare func here because funcName is a global and would not
    // be captured in the closure otherwise
    const func = funcName;
    page[func] = ((...arr: any[]) => {
        return browser.runtime.sendMessage({
            args: {
                args: [(window as any).frameId].concat(arr),
                funcName: [func],
            },
            funcName: ["messagePage"],
        });
    });
}
