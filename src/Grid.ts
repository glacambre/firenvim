import { Cursor } from "./Cursor";

export class Grid {
    public cursor = new Cursor(0, 0);
    public data: any[][];

    constructor(public width: number, public height: number) {
        this.clear();
    }

    public clear() {
        this.data = (new Array(this.height)).fill("").map(_ => (new Array(this.width)).fill(" "));
    }
}
