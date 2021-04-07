import { executeInPage, computeSelector } from "../utils/utils";
import { AbstractEditor } from "./AbstractEditor";

export class AceEditor extends AbstractEditor {

    static matches (e: HTMLElement) {
        let parent = e;
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
    constructor (e: HTMLElement) {
        super();
        this.elem = e;
        // Get the topmost ace element
        let parent = this.elem.parentElement;
        while (AceEditor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    private getAce = (selec: string) => {
        const elem = document.querySelector(selec) as any;
        const win_ace = (window as any).ace;
        if (win_ace !== undefined) {
            return win_ace.edit(elem);
        } else if (Object.prototype.hasOwnProperty.call(elem, 'aceEditor')) {
            return elem.aceEditor;
        } else {
            throw new Error("Couldn't find AceEditor instance");
        }
    };

    getContent () {
        return executeInPage(`(${/* istanbul ignore next */ (getAce: any, selec: string) => {
            return getAce(selec).getValue();
        }})(${this.getAce}, ${JSON.stringify(computeSelector(this.elem))})`);
    }

    getCursor () {
        return executeInPage(`(${/* istanbul ignore next */ (getAce: any, selec: string) => {
            let position;
            const ace = getAce(selec);
            if (ace.getCursorPosition !== undefined) {
                position = ace.getCursorPosition();
            } else {
                position = ace.selection.cursor;
            }
            return [position.row + 1, position.column];
        }})(${this.getAce}, ${JSON.stringify(computeSelector(this.elem))})`);
    }

    getElement () {
        return this.elem;
    }

    getLanguage () {
        return executeInPage(`(${/* istanbul ignore next */ (getAce: any, selec: string) => {
            const ace = getAce(selec);
            return ace.session.$modeId.split("/").slice(-1)[0];
        }})(${this.getAce}, ${JSON.stringify(computeSelector(this.elem))})`);
    }

    setContent (text: string) {
        return executeInPage(`(${/* istanbul ignore next */ (getAce: any, selec: string, str: string) => {
            return getAce(selec).setValue(str, 1);
        }})(${this.getAce}, ${JSON.stringify(computeSelector(this.elem))}, ${JSON.stringify(text)})`);
    }

    setCursor (line: number, column: number) {
        return executeInPage(`(${/* istanbul ignore next */ (getAce: any, selec: string, l: number, c: number) => {
            const selection = getAce(selec).getSelection();
            return selection.moveCursorTo(l - 1, c, false);
        }})(${this.getAce}, ${JSON.stringify(computeSelector(this.elem))}, ${line}, ${column})`);
    }

}
