import { AbstractEditorOptions } from "./AbstractEditor";

/* istanbul ignore next */
export class CodeMirrorEditor {

    static matches (e: HTMLElement) {
        let parent: HTMLElement | null = e;
        for (let i = 0; i < 3; ++i) {
            if (parent !== undefined && parent !== null) {
                if ((/^(.* )?CodeMirror/gi).test(parent.className)) {
                    return true;
                }
                parent = parent.parentElement;
            }
        }
        return false;
    }

    private elem: HTMLElement;
    constructor (e: HTMLElement, _options: AbstractEditorOptions) {
        this.elem = e;
        // Get the topmost CodeMirror element
        let parent: HTMLElement | null = this.elem.parentElement;
        while (parent !== null && CodeMirrorEditor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    /* istanbul ignore next */
    static getContent = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        return elem.CodeMirror.getValue();
    }

    /* istanbul ignore next */
    static getCursor = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const position = elem.CodeMirror.getCursor();
        return [position.line + 1, position.ch] as [number, number];
    }

    getElement () {
        return this.elem;
    }

    /* istanbul ignore next */
    static getLanguage = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        return elem.CodeMirror.getMode().name;
    }

    /* istanbul ignore next */
    static setContent = async (selector: string, text: string) => {
        const elem = document.querySelector(selector) as any;
        return elem.CodeMirror.setValue(text);
    }

    /* istanbul ignore next */
    static setCursor = async (selector: string, line: number, column: number) => {
        const elem = document.querySelector(selector) as any;
        return elem.CodeMirror.setCursor({line: line - 1, ch: column });
    }
}
