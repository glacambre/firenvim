import { executeInPage } from "../utils/utils";
import { computeSelector } from "../utils/CSSUtils";
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

    getContent () {
        return executeInPage(`(${(selec: string) => {
            const elem = document.querySelector(selec) as any;
            return (window as any).ace.edit(elem).getValue();
        }})(${JSON.stringify(computeSelector(this.elem))})`);
    }

    getElement () {
        return this.elem;
    }

    setContent (text: string) {
        return executeInPage(`(${(selec: string, str: string) => {
            const elem = document.querySelector(selec) as any;
            return (window as any).ace.edit(elem).setValue(str);
        }})(${JSON.stringify(computeSelector(this.elem))}, ${JSON.stringify(text)})`);
    }
}
