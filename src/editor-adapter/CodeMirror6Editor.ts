import { AbstractEditorOptions } from "./AbstractEditor";

/* istanbul ignore next */
export class CodeMirror6Editor {

    static matches (e: HTMLElement) {
        let parent: HTMLElement | null = e;
        for (let i = 0; i < 3; ++i) {
            if (parent !== undefined && parent !== null) {
                if ((/^(.* )?cm-content/gi).test(parent.className)) {
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
        while (parent !== null && CodeMirror6Editor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    /* istanbul ignore next */
    static getContent = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const cm = elem.cmView || elem.cmTile;
        return cm.view.state.doc.toString();
    }

    /* istanbul ignore next */
    static getCursor = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        const cm = elem.cmView || elem.cmTile;
        const state = cm.view.state;
        const head = state.selection.main.head;
        const line = state.doc.lineAt(head);
        return [line.number, head - line.from] as [number, number];
    }

    getElement () {
        return this.elem;
    }

    /* istanbul ignore next */
    static getLanguage = async (selector: string) => {
        const elem = document.querySelector(selector) as any;
        return elem.dataset.language;
    }

    /* istanbul ignore next */
    static setContent = async (selector: string, text: string) => {
        const elem = document.querySelector(selector) as any;
        const cm = elem.cmView || elem.cmTile;
        let length = cm.view.state.doc.length;
        return cm.view.dispatch({changes: {from: 0, to: length, insert: text}});
    }

    /* istanbul ignore next */
    static setCursor = async (selector: string, line: number, column: number) => {
        const elem = document.querySelector(selector) as any;
        const cm = elem.cmView || elem.cmTile;
        return cm.view.dispatch({
            selection: {
                anchor: cm.view.state.doc.line(line).from + column
            }
        });
    }
}
