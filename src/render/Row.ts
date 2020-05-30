import { Cell } from "./Cell";

export class Row {
    public elem: HTMLSpanElement;
    private cells: Cell[] = [];
    constructor(public width: number) {
        this.elem = document.createElement("span");
        this.elem.className = "nvim_row";
        for (let i = 0; i < width; ++i) {
            this.cells.push(new Cell());
            this.cells[this.cells.length - 1].attach(this.elem);
        }
    }

    public clear() {
        this.cells.forEach(c => c.clear());
    }

    public attachBefore(e: HTMLElement) {
        e.parentNode.insertBefore(this.elem, e);
    }

    public attach(e: HTMLElement) {
        e.appendChild(this.elem);
    }

    public detach() {
        this.elem.parentNode.removeChild(this.elem);
    }

    public get(n: number) {
        return this.cells[n];
    }

    public resize(width: number) {
        if (width < this.width) {
            this.cells.slice(width).forEach(cell => cell.detach());
            this.cells = this.cells.slice(0, width);
        } else {
            for (let i = this.width; i < width; ++i) {
                this.cells.push(new Cell());
                this.cells[this.cells.length - 1].attach(this.elem);
            }
        }
        this.width = width;
    }

    public set(n: number, v: string) {
        this.cells[n].value = v;
    }
}
