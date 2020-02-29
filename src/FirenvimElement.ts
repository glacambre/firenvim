import * as browser from "webextension-polyfill";
import { isFirefox } from "./utils/utils";
import { AbstractEditor } from "./editors/AbstractEditor";
import { getEditor } from "./editors/editors";
import { computeSelector } from "./utils/CSSUtils";

export class FirenvimElement {

    // editor is an object that provides an interface to interact (e.g.
    // retrieve/set content, retrieve/set cursor position) consistently with
    // underlying elements (be they simple textareas, CodeMirror elements or
    // other).
    private editor: AbstractEditor;
    // frameId is the webextension id of the neovim frame. We use it to send
    // commands to the frame.
    private frameId: number;
    // frameIdPromise is a promise that will resolve to the frameId. The
    // frameId can't be retrieved synchronously as it needs to be sent by the
    // background script.
    private frameIdPromise: Promise<number>;
    // iframe is the Neovim frame. This is the element that receives all inputs
    // and displays the editor.
    private iframe: HTMLIFrameElement;
    // We use an intersectionObserver to detect when the element the
    // FirenvimElement is tied to disappears from the page. When this happens,
    // we also remove the FirenvimElement from the page.
    private intersectionObserver: IntersectionObserver;
    // nvimify is the function that listens for focus events and creates
    // firenvim elements. We need it in order to be able to remove it as an
    // event listener from the element the user selected when the user wants to
    // select that element again.
    private nvimify: (evt: { target: EventTarget }) => Promise<void>;
    // originalElement is the element a focus event has been triggered on. We
    // use it to retrieve the element the editor should appear over (e.g., if
    // elem is an element inside a CodeMirror editor, elem will be a small
    // invisible textarea and what we really want to put the Firenvim element
    // over is the parent div that contains it) and to give focus back to the
    // page when the user asks for that.
    private originalElement: HTMLElement;
    // resizeObserver is used in order to detect when the size of the element
    // being edited changed. When this happens, we resize the neovim frame.
    // TODO: periodically check if MS implemented a ResizeObserver type
    private resizeObserver: any;
    // span is the span element we use in order to insert the neovim frame in
    // the page. The neovim frame is attached to its shadow dom. Using a span
    // is much less disruptive to the page and enables a modicum of privacy
    // (the page won't be able to check what's in it). In firefox, pages will
    // still be able to detect the neovim frame by using window.frames though.
    private span: HTMLSpanElement;

    // elem is the element that received the focusEvent.
    // Nvimify is the function that listens for focus events. We need to know
    // about it in order to remove it before focusing elem (otherwise we'll
    // just grab focus again).
    constructor (elem: HTMLElement, listener: (evt: { target: EventTarget }) => Promise<void>) {
        this.originalElement = elem;
        this.nvimify = listener;
        this.editor = getEditor(elem);

        this.span = elem
            .ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "span");
        this.iframe = elem
            .ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;

        // Use a ResizeObserver to detect when the underlying input element's
        // size changes and change the size of the FirenvimElement
        // accordingly
        let resizeReqId = 0;
        this.resizeObserver = new ((window as any).ResizeObserver)(((self) => async (entries: any[]) => {
            const entry = entries.find((ent: any) => ent.target === self.getElement());
            if (self.frameId === undefined) {
                await this.frameIdPromise;
            }
            if (entry) {
                const { newRect } = self.setEditorSizeToInputSize();
                resizeReqId += 1;
                browser.runtime.sendMessage({
                    args: {
                        frameId: self.frameId,
                        message: {
                            args: [resizeReqId, newRect.width, newRect.height],
                            funcName: ["resize"],
                        }
                    },
                    funcName: ["messageFrame"],
                });
            }
        })(this));
        this.resizeObserver.observe(this.getElement(), { box: "border-box" });
    }

    attachToPage (fip: Promise<number>) {
        this.frameIdPromise = fip;
        this.frameIdPromise.then((f: number) => this.frameId = f);

        this.putEditorAtInputOrigin();
        // We don't need the iframe to be appended to the page in order to
        // resize it because we're just using the corresponding
        // input/textarea's size
        this.setEditorSizeToInputSize();

        this.iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
        this.span.attachShadow({ mode: "closed" }).appendChild(this.iframe);
        this.getElement().ownerDocument.body.appendChild(this.span);

        this.focus();

        // We want to remove the frame from the page if the corresponding
        // element has been removed. It is pretty hard to tell when an element
        // disappears from the page (either by being removed or by being hidden
        // by other elements), so we use an intersection observer, which is
        // triggered every time the element becomes more or less visible.
        this.intersectionObserver = new IntersectionObserver((self => () => {
            const elem = self.getElement();
            if (!elem.ownerDocument.contains(elem)
                || (elem.offsetWidth === 0
                    && elem.offsetHeight === 0
                    && elem.getClientRects().length === 0)
               ) {
                   self.detachFromPage();
               }
        })(this), { root: null, threshold: 0.1 });
        this.intersectionObserver.observe(this.getElement());
    }

    detachFromPage () {
        this.resizeObserver.unobserve(this.getElement());
        this.intersectionObserver.unobserve(this.getElement());
        this.span.parentNode.removeChild(this.span);
    }

    focus () {
        // Some inputs try to grab the focus again after we appended the iframe
        // to the page, so we need to refocus it each time it loses focus. But
        // the user might want to stop focusing the iframe at some point, so we
        // actually stop refocusing the iframe a second after it is created.
        const self = this;
        function refocus() {
            setTimeout(() => {
                // First, destroy current selection. Some websites use the
                // selection to force-focus an element.
                const sel = document.getSelection();
                sel.removeAllRanges();
                const range = document.createRange();
                range.setStart(self.span, 0);
                range.collapse(true);
                sel.addRange(range);
                // Then, attempt to "release" the focus from whatever element
                // is currently focused. This doesn't work on Chrome.
                if (isFirefox()) {
                    window.focus();
                    document.documentElement.focus();
                    document.body.focus();
                }
                self.iframe.focus();
            }, 0);
        }
        this.iframe.addEventListener("blur", refocus);
        this.getElement().addEventListener("focus", refocus);
        setTimeout(() => {
            refocus();
            this.iframe.removeEventListener("blur", refocus);
            this.getElement().removeEventListener("focus", refocus);
        }, 100);
        refocus();
    }

    focusOriginalElement (addListener: boolean) {
        (document.activeElement as any).blur();
        this.originalElement.removeEventListener("focus", this.nvimify);
        this.originalElement.focus();
        if (addListener) {
            this.originalElement.addEventListener("focus", this.nvimify);
        }
    }

    getEditor () {
        return this.editor;
    }

    getElement () {
        return this.editor.getElement();
    }

    getIframe () {
        return this.iframe;
    }

    getPageElementContent () {
        return this.getEditor().getContent();
    }

    getSelector () {
        return computeSelector(this.getElement());
    }

    getSpan () {
        return this.span;
    }

    hide () {
        this.iframe.style.display = "none";
    }

    pressKeys (keys: KeyboardEvent[]) {
        keys.forEach(ev => this.originalElement.dispatchEvent(ev));
        this.focus();
    }

    putEditorAtInputOrigin () {
        const rect = this.editor.getElement().getBoundingClientRect();
        // Save attributes
        const posAttrs = ["left", "position", "top", "zIndex"];
        const oldPosAttrs = posAttrs.map((attr: any) => this.iframe.style[attr]);

        // Assign new values
        this.iframe.style.left = `${rect.left + window.scrollX}px`;
        this.iframe.style.position = "absolute";
        this.iframe.style.top = `${rect.top + window.scrollY}px`;
        this.iframe.style.zIndex = "2147483645";

        // Compare, to know whether the element moved or not
        const posChanged = !!posAttrs.find((attr: any, index) =>
                                           this.iframe.style[attr] !== oldPosAttrs[index]);
        return { posChanged, newRect: rect };
    }

    resizeTo (width: number, height: number) {
        this.iframe.style.width = `${width}px`;
        this.iframe.style.height = `${height}px`;
    }

    setEditorSizeToInputSize () {
        const rect = this.getElement().getBoundingClientRect();
        // Make sure there isn't any extra width/height
        this.iframe.style.padding = "0px";
        this.iframe.style.margin = "0px";
        this.iframe.style.border = "0px";
        // We still need a border, use a shadow for that
        this.iframe.style.boxShadow = "0px 0px 1px 1px black";

        const dimAttrs = ["height", "width"];
        const oldDimAttrs = dimAttrs.map((attr: any) => this.iframe.style[attr]);

        // Assign new values
        this.iframe.style.height = `${rect.height}px`;
        this.iframe.style.width = `${rect.width}px`;

        const dimChanged = !!dimAttrs.find((attr: any, index) => this.iframe.style[attr] !== oldDimAttrs[index]);

        return { dimChanged, newRect: rect };
    }

    setPageElementContent (text: string) {
        this.editor.setContent(text);
        [
            new Event("keydown",     { bubbles: true }),
            new Event("keyup",       { bubbles: true }),
            new Event("keypress",    { bubbles: true }),
            new Event("beforeinput", { bubbles: true }),
            new Event("input",       { bubbles: true }),
            new Event("change",      { bubbles: true })
        ].forEach(ev => this.originalElement.dispatchEvent(ev));
        this.focus();
    }

    setPageElementCursor (line: number, column: number) {
        return this.editor.setCursor(line, column);
    }

    show () {
        this.iframe.style.display = "initial";
    }

}
