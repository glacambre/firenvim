import { AbstractEditorOptions } from "./AbstractEditor";

/* istanbul ignore next */
export class AceEditor {

    static matches (e: HTMLElement) {
        let parent: HTMLElement | null = e;
        for (let i = 0; i < 3; ++i) {
            if (parent !== undefined && parent !== null) {
                if ((/ace_editor/gi).test(parent.className)) {
                    return true;
                }
                parent = parent.parentElement;
            }
        }
        return false;
    }

    private elem: HTMLElement;
    constructor(e: HTMLElement, _options: AbstractEditorOptions) {
        this.elem = e;
        // Get the topmost ace element
        let parent: HTMLElement | null = this.elem.parentElement;
        while (parent !== null && AceEditor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    /* istanbul ignore next */
    static getContent = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || (window as any).ace.edit(elem);
        return ace.getValue();
    }

    /* istanbul ignore next */
    static getCursor = async (selector: string) => {
        let position;
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || (window as any).ace.edit(elem);
        if (ace.getCursorPosition !== undefined) {
            position = ace.getCursorPosition();
        } else {
            position = ace.selection.cursor;
        }
        return [position.row + 1, position.column] as [number, number];
    }

    getElement () {
        return this.elem;
    }

    /* istanbul ignore next */
    static getLanguage = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || (window as any).ace.edit(elem);
        return ace.session.$modeId.split("/").slice(-1)[0];
    }

    /* istanbul ignore next */
    static setContent = async (selector: string, text: string) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || (window as any).ace.edit(elem);
        return ace.setValue(text, 1);
    }

    /* istanbul ignore next */
    static setCursor = async (selector: string, line: number, column: number) => {
        const elem = document.querySelector(selector) as any;
        const ace = elem.aceEditor || (window as any).ace.edit(elem);
        const selection = ace.getSelection();
        return selection.moveCursorTo(line - 1, column, false);
    }
}
