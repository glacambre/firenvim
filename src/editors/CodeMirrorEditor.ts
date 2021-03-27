import { computeSelector, executeInPage } from "../utils/utils";
import { AbstractEditor } from "./AbstractEditor";

export class CodeMirrorEditor extends AbstractEditor {

    static matches (e: HTMLElement) {
        let parent = e;
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
    constructor (e: HTMLElement) {
        super();
        this.elem = e;
        // Get the topmost ace element
        let parent = this.elem.parentElement;
        while (CodeMirrorEditor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    getContent () {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string) => {
            const elem = document.querySelector(selec) as any;
            return elem.CodeMirror.getValue();
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    getCursor () {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string) => {
            const elem = document.querySelector(selec) as any;
            const position = elem.CodeMirror.getCursor();
            return [position.line + 1, position.ch];
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    getElement () {
        return this.elem;
    }

    getLanguage () {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string) => {
            const elem = document.querySelector(selec) as any;
            return elem.CodeMirror.getMode().name;
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    setContent (text: string) {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string, str: string) => {
            const elem = document.querySelector(selec) as any;
            return elem.CodeMirror.setValue(str);
        }})(${JSON.stringify(computeSelector(this.elem))}, ${JSON.stringify(text)})`);
    }

    setCursor (line: number, column: number) {
        return executeInPage(`(${/* istanbul ignore next */ (selec: string, l: number, c: number) => {
            const elem = document.querySelector(selec) as any;
            return elem.CodeMirror.getCursor(l - 1, c);
        }})(${JSON.stringify(computeSelector(this.elem))}, ${line}, ${column})`);
    }
}
