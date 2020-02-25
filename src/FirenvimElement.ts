import * as browser from "webextension-polyfill";
import { AbstractEditor } from "./editors/AbstractEditor";
import { getEditor } from "./editors/editors";
import { computeSelector } from "./utils/CSSUtils";

export class FirenvimElement {

    private editor: AbstractEditor;
    private span: HTMLSpanElement;
    private iframe: HTMLIFrameElement;
    private frameId: number;
    // TODO: periodically check if MS implemented a ResizeObserver type
    private resizeObserver: any;
    private intersectionObserver: IntersectionObserver;

    constructor (elem: HTMLElement, frameIdPromise: Promise<number>) {
        frameIdPromise.then((f: number) => this.frameId = f);

        this.editor = getEditor(elem);
        // We use a span because these are the least likely to disturb the page
        this.span = elem
            .ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "span");
        // It's important to create the iframe last because otherwise it might
        // try to access uninitialized data from the page
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
                await frameIdPromise;
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

    attachToPage () {
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
        function refocus() {
            setTimeout(() => {
                // First, destroy current selection. Some websites use the
                // selection to force-focus an element.
                const sel = document.getSelection();
                sel.removeAllRanges();
                const range = document.createRange();
                range.setStart(this.span, 0);
                range.collapse(true);
                sel.addRange(range);
                // Then, attempt to "release" the focus from whatever element
                // is currently focused.
                window.focus();
                document.documentElement.focus();
                document.body.focus();
                this.iframe.focus();
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

    getEditor () {
        return this.editor;
    }

    getElement () {
        return this.editor.getElement();
    }

    getIframe () {
        return this.iframe;
    }

    getSelector () {
        return computeSelector(this.getElement());
    }

    getSpan () {
        return this.span;
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

        const posChanged = !!posAttrs.find((attr: any, index) =>
                                           this.iframe.style[attr] !== oldPosAttrs[index]);
        return { posChanged, newRect: rect };
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

}
