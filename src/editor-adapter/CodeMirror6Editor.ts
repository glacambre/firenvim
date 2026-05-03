import { GenericAbstractEditor, AbstractEditorOptions, wrapper, unwrapper } from "./AbstractEditor";

/* istanbul ignore next */
export class CodeMirror6Editor extends GenericAbstractEditor {

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
    constructor (e: HTMLElement, options: AbstractEditorOptions) {
        super(e, options);
        this.elem = e;
        // Get the topmost CodeMirror element
        let parent: HTMLElement | null = this.elem.parentElement;
        while (parent !== null && CodeMirror6Editor.matches(parent)) {
            this.elem = parent;
            parent = parent.parentElement;
        }
    }

    getContent = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector);
        return wrap(unwrap(elem).cmView.view.state.doc.toString());
    }

    getCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
        const elem = document.querySelector(selector) as any;
        const position = unwrap(elem).cmView.view.state.selection.main.head;
        return [wrap(position.line), wrap(position.ch)] as [number, number];
    }

    getElement = () => {
        return this.elem;
    }

    getLanguage = async (selector: string, wrap: wrapper, unwrap: unwrapper) => {
	const elem = document.querySelector(selector);
	return wrap(unwrap(elem).dataset.language);
    }

    setContent = async (selector: string, wrap: wrapper, unwrap: unwrapper, text: string) => {
        const elem = unwrap(document.querySelector(selector) as any);
        let length = elem.cmView.view.state.doc.length;
        return wrap(elem.cmView.view.dispatch({changes: {from: 0, to: length, insert: text}}));
    }

    setCursor = async (selector: string, wrap: wrapper, unwrap: unwrapper, line: number, column: number) => {
        const elem = unwrap(document.querySelector(selector) as any);
        return wrap(elem.vmView.view.dispatch({
            selection: {
                anchor: elem.cmView.view.doc.line(line) + column
            }
        }));
    }
}
