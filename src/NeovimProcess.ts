import {Stdin} from "./Stdin";
import {Stdout} from "./Stdout";

export class NeovimProcess {
    public stdin: Stdin;
    public stdout: Stdout;

    constructor() {
        const port = browser.runtime.connect();
        this.stdin = new Stdin(port);
        this.stdout = new Stdout(port);
    }

}
