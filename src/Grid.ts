import { Cursor } from "./Cursor";
import { Row } from "./Row";

export class Grid {
    private elem: HTMLDivElement;
    private rows: Row[] = [];
    private cursorLine: Row = undefined;
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

    public clear() {
        this.rows.forEach(row => row.clear());
    }

    public cursor_goto(x: number, y: number) {
        if (this.cursorLine !== undefined) {
            this.cursorLine.get(this.cursor.x).removeCursor();
        }
        this.cursor = new Cursor(x, y);
        this.cursorLine = this.get(this.cursor.y);
        this.cursorLine.get(this.cursor.x).setCursor();
    }

    public detach() {
        this.elem.parentNode.removeChild(this.elem);
    }

    public get(n: number) {
        if (n < 0 || n >= this.width) {
            throw new Error(`Out of bounds access: ${n}`);
        }
        return this.rows[n];
    }

    public scroll(top: number, bot: number, left: number, right: number, rowCount: number, cols: number) {
        if (rowCount > 0) {
            const toDelete = this.rows.splice(top, rowCount);
            toDelete.forEach(row => row.detach());
            for (let i = 0; i < rowCount; ++i) {
                this.rows.push(new Row(this.width));
                this.rows[this.rows.length - 1].attach(this.elem);
            }
        } else {
            rowCount = -rowCount;
            const toDelete = this.rows.slice(this.rows.length - rowCount);
            toDelete.forEach(row => row.detach());
            const newRows = [];
            for (let i = 0; i < rowCount; ++i) {
                newRows.push(new Row(this.width));
                newRows[newRows.length - 1].attachBefore(this.rows[top].elem);
            }
            this.rows = this.rows.slice(0, top)
                .concat(newRows)
                .concat(this.rows.slice(top, this.rows.length - newRows.length));
            rowCount = -rowCount;
        }
        this.cursor_goto(this.cursor.x, this.cursor.y);
    }
}
