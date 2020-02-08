import { AbstractEditor } from "./AbstractEditor";

export class TextareaEditor extends AbstractEditor {

    static matches (e: HTMLElement) {
        return true;
    }

    private elem: HTMLElement;
    constructor (e: HTMLElement) {
        super();
        this.elem = e;
    }

    getContent () {
        if ((this.elem as any).value !== undefined) {
            return Promise.resolve((this.elem as any).value);
        }
        return Promise.resolve(this.elem.innerText);
    }

    getElement () {
        return this.elem;
    }

    setContent (text: string) {
        if ((this.elem as any).value !== undefined) {
            (this.elem as any).value = text;
        } else {
            this.elem.innerText = text;
        }
        return Promise.resolve();
    }
}
