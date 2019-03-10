import { Cursor } from "./Cursor";
import { Row } from "./Row";

export class Grid {
    private elem: HTMLDivElement;
    private rows: Row[] = [];
    private cursor = new Cursor(0, 0);

    constructor(public width: number, public height: number) {
        this.elem = document.createElement("div");
        this.elem.className = "nvim_grid";
        for (let i = 0; i < height; ++i) {
            this.rows.push(new Row(width));
            this.rows[this.rows.length - 1].attach(this.elem);
        }
    }

    public attach(parent: HTMLElement) {
        parent.appendChild(this.elem);
    }

    public detach() {
        this.elem.parentNode.removeChild(this.elem);
    }

    public clear() {
        this.rows.forEach(row => row.clear());
    }

    public cursor_goto(x: number, y: number) {
        this.get(this.cursor.y).get(this.cursor.x).removeCursor();
        this.cursor = new Cursor(x, y);
        this.get(this.cursor.y).get(this.cursor.x).setCursor();
    }

    public get(n: number) {
        if (n < 0 || n >= this.width) {
            throw new Error(`Out of bounds access: ${n}`);
        }
        return this.rows[n];
    }
}
