import { GenericAbstractEditor, AbstractEditorOptions, wrapper, unwrapper } from "./AbstractEditor";

/* istanbul ignore next */
export class CodeMirrorEditor extends GenericAbstractEditor {

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
    constructor (e: HTMLElement, options: AbstractEditorOptions) {
        super(e, options);
        this.elem = e;
        // Get the topmost CodeMirror element
        let parent: HTMLElement | null = this.elem.parentElement;
        while (parent !== null && CodeMirrorEditor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    getContent = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector);
        return wrap(unwrap(elem).CodeMirror.getValue());
    }

    getCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector) as any;
        const position = unwrap(elem).CodeMirror.getCursor();
        return [wrap(position.line) + 1, wrap(position.ch)] as [number, number];
    }

    getElement = () => {
        return this.elem;
    }

    getLanguage = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector);
        return wrap(unwrap(elem).CodeMirror.getMode().name);
    }

    setContent = async (selector: string, wrap: wrapper, unwrap: unwrapper, text: string) => {
        const elem = document.querySelector(selector) as any;
        return wrap(unwrap(elem).CodeMirror.setValue(text));
    }

    setCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper, line: number, column: number) => {
        const elem = document.querySelector(selector) as any;
        return wrap(unwrap(elem).CodeMirror.setCursor({line: line - 1, ch: column }));
    }
}
