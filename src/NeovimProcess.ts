import {Stdin} from "./Stdin";
import {Stdout} from "./Stdout";

export class NeovimProcess {
    public stdin: Stdin;
    public stdout: Stdout;

    constructor() {
        const port = browser.runtime.connectNative("firenvim");
        const proxy = {
            get: (obj: any, prop: any): any => {
                if (obj[prop] !== undefined) {
                    return obj[prop];
                }
                console.log(obj);
                throw new Error(`Property "${prop}" doesn't exist in "${obj}"`);
            },
            set: (obj: any, prop: any, value: any): boolean => {
                const retval = obj[prop] === undefined;
                if (retval) {
                    console.warn(`Setting new property "${prop}" to `, value, " in ", obj);
                }
                obj[prop] = value;
                return retval;
            },
        };
        this.stdin = new Stdin(port);
        this.stdout = new Stdout(port);
    }

}
