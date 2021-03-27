import { getNeovimFrameFunctions } from "./functions";

// We don't need to give real values to getFunctions since we're only trying to
// get the name of functions that exist in the page.
const functions = getNeovimFrameFunctions({} as any);

type ft = typeof functions;
// The proxy automatically appends the frameId to the request, so we hide that from users
type ArgumentsType<T> = T extends (x: any, ...args: infer U) => any ? U: never;
type Promisify<T> = T extends Promise<any> ? T : Promise<T>;

export const page = {} as {
    [k in keyof ft]: (...args: ArgumentsType<ft[k]>) => Promisify<ReturnType<ft[k]>>
};

let funcName: keyof typeof functions;
for (funcName in functions) {
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
