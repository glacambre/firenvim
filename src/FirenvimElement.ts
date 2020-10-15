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
    // FirenvimElement is tied becomes invisible. When this happens,
    // we hide the FirenvimElement from the page.
    private intersectionObserver: IntersectionObserver;
    // We use a mutation observer to detect whether the element is removed from
    // the page. When this happens, the FirenvimElement is removed from the
    // page.
    private mutationObserver: MutationObserver;
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
    // resizeReqId keeps track of the number of resizing requests that are sent
    // to the iframe. We send and increment it for every resize requests, this
    // lets the iframe know what the most recently sent resize request is and
    // thus avoids reacting to an older resize request if a more recent has
    // already been processed.
    private resizeReqId = 0;
    // relativeX/Y is the position the iframe should have relative to the input
    // element in order to be both as close as possible to the input element
    // and fit in the window without overflowing out of the viewport.
    private relativeX = 0;
    private relativeY = 0;
    // firstPutEditorCloseToInputOrigin keeps track of whether this is the
    // first time the putEditorCloseToInputOrigin function is called from the
    // iframe. See putEditorCloseToInputOriginAfterResizeFromFrame() for more
    // information.
    private firstPutEditorCloseToInputOrigin = true;
    // onDetach is a callback provided by the content script when it creates
    // the FirenvimElement. It is called when the detach() function is called,
    // after all Firenvim elements have been removed from the page.
    private onDetach: (id: number) => any;
    // bufferInfo: a [url, selector, cursor, lang] tuple indicating the page
    // the last iframe was created on, the selector of the corresponding
    // textarea and the column/line number of the cursor.
    // Note that these are __default__ values. Real values must be created with
    // prepareBufferInfo(). The reason we're not doing this from the
    // constructor is that it's expensive and disruptive - getting this
    // information requires evaluating code in the page's context.
    private bufferInfo = (Promise.resolve(["", "", [1, 1], undefined]) as
                          Promise<[string, string, [number, number], string]>);


    // elem is the element that received the focusEvent.
    // Nvimify is the function that listens for focus events. We need to know
    // about it in order to remove it before focusing elem (otherwise we'll
    // just grab focus again).
    constructor (elem: HTMLElement,
                 listener: (evt: { target: EventTarget }) => Promise<void>,
                 onDetach: (id: number) => any) {
        this.originalElement = elem;
        this.nvimify = listener;
        this.onDetach = onDetach;
        this.editor = getEditor(elem);

        this.span = elem
            .ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "span");
        this.iframe = elem
            .ownerDocument
            .createElementNS("http://www.w3.org/1999/xhtml", "iframe") as HTMLIFrameElement;
        // Make sure there isn't any extra width/height
        this.iframe.style.padding = "0px";
        this.iframe.style.margin = "0px";
        this.iframe.style.border = "0px";
        // We still need a border, use a shadow for that
        this.iframe.style.boxShadow = "0px 0px 1px 1px black";
    }

    attachToPage (fip: Promise<number>) {
        this.frameIdPromise = fip.then((f: number) => this.frameId = f);

        // We don't need the iframe to be appended to the page in order to
        // resize it because we're just using the corresponding
        // input/textarea's size
        let rect = this.getElement().getBoundingClientRect();
        this.resizeTo(rect.width, rect.height, false);
        this.relativeX = 0;
        this.relativeY = 0;
        this.putEditorCloseToInputOrigin();

        // Use a ResizeObserver to detect when the underlying input element's
        // size changes and change the size of the FirenvimElement
        // accordingly
        this.resizeObserver = new ((window as any).ResizeObserver)(((self) => async (entries: any[]) => {
            const entry = entries.find((ent: any) => ent.target === self.getElement());
            if (self.frameId === undefined) {
                await this.frameIdPromise;
            }
            if (entry) {
                const newRect = this.getElement().getBoundingClientRect();
                if (rect.width === newRect.width && rect.height === newRect.height) {
                    return;
                }
                rect = newRect;
                self.resizeTo(rect.width, rect.height, false);
                self.putEditorCloseToInputOrigin();
                self.resizeReqId += 1;
                browser.runtime.sendMessage({
                    args: {
                        frameId: self.frameId,
                        message: {
                            args: [self.resizeReqId, rect.width, rect.height],
                            funcName: ["resize"],
                        }
                    },
                    funcName: ["messageFrame"],
                });
            }
        })(this));
        this.resizeObserver.observe(this.getElement(), { box: "border-box" });

        this.iframe.src = (browser as any).extension.getURL("/NeovimFrame.html");
        this.span.attachShadow({ mode: "closed" }).appendChild(this.iframe);
        this.getElement().ownerDocument.body.appendChild(this.span);

        this.focus();

        // It is pretty hard to tell when an element disappears from the page
        // (either by being removed or by being hidden by other elements), so
        // we use an intersection observer, which is triggered every time the
        // element becomes more or less visible.
        this.intersectionObserver = new IntersectionObserver((self => () => {
            const elem = self.getElement();
            // If elem doesn't have a rect anymore, it's hidden
            if (elem.getClientRects().length === 0) {
                self.hide();
            } else {
                self.show();
            }
        })(this), { root: null, threshold: 0.1 });
        this.intersectionObserver.observe(this.getElement());

        // We want to remove the FirenvimElement from the page when the
        // corresponding element is removed. We do this by adding a
        // mutationObserver to its parent.
        this.mutationObserver = new MutationObserver((self => (mutations: MutationRecord[]) => {
            const elem = self.getElement();
            mutations.forEach(mutation => mutation.removedNodes.forEach(node => {
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_ALL);
                while (walker.nextNode()) {
                    if (walker.currentNode === elem) {
                        setTimeout(() => self.detachFromPage());
                    }
                }
            }));
        })(this));
        this.mutationObserver.observe(document.documentElement, {
            subtree: true,
            childList: true
        });
    }

    detachFromPage () {
        const elem = this.getElement();
        this.resizeObserver.unobserve(elem);
        this.intersectionObserver.unobserve(elem);
        this.mutationObserver.disconnect();
        this.span.parentNode.removeChild(this.span);
        this.onDetach(this.frameId);
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

    getBufferInfo () {
        return this.bufferInfo;
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

    isFocused () {
        return document.activeElement === this.span
            || document.activeElement === this.iframe;
    }

    prepareBufferInfo () {
        this.bufferInfo = new Promise(async r => r([
            document.location.href,
            this.getSelector(),
            await (this.editor.getCursor().catch(() => [1, 1])),
            await (this.editor.getLanguage().catch(() => undefined))
        ]));
    }

    pressKeys (keys: KeyboardEvent[]) {
        keys.forEach(ev => this.originalElement.dispatchEvent(ev));
        this.focus();
    }

    putEditorCloseToInputOrigin () {
        const rect = this.editor.getElement().getBoundingClientRect();

        // Save attributes
        const posAttrs = ["left", "position", "top", "zIndex"];
        const oldPosAttrs = posAttrs.map((attr: any) => this.iframe.style[attr]);

        // Assign new values
        this.iframe.style.left = `${rect.left + window.scrollX + this.relativeX}px`;
        this.iframe.style.position = "absolute";
        this.iframe.style.top = `${rect.top + window.scrollY + this.relativeY}px`;
        // 2139999995 is hopefully higher than everything else on the page but
        // lower than Vimium's elements
        this.iframe.style.zIndex = "2139999995";

        // Compare, to know whether the element moved or not
        const posChanged = !!posAttrs.find((attr: any, index) =>
                                           this.iframe.style[attr] !== oldPosAttrs[index]);
        return { posChanged, newRect: rect };
    }

    putEditorCloseToInputOriginAfterResizeFromFrame () {
        // This is a very weird, complicated and bad piece of code. All calls
        // to `resizeEditor()` have to result in a call to `resizeTo()` and
        // then `putEditorCloseToInputOrigin()` in order to make sure the
        // iframe doesn't overflow from the viewport.
        // However, when we create the iframe, we don't want it to fit in the
        // viewport at all cost. Instead, we want it to cover the underlying
        // input as much as possible. The problem is that when it is created,
        // the iframe will ask for a resize (because Neovim asks for one) and
        // will thus also accidentally call putEditorCloseToInputOrigin, which
        // we don't want to call.
        // So we have to track the calls to putEditorCloseToInputOrigin that
        // are made from the iframe (i.e. from `resizeEditor()`) and ignore the
        // first one.
        if (this.firstPutEditorCloseToInputOrigin) {
            this.relativeX = 0;
            this.relativeY = 0;
            this.firstPutEditorCloseToInputOrigin = false;
            return;
        }
        return this.putEditorCloseToInputOrigin();
    }

    // Resize the iframe, making sure it doesn't get larger than the window
    resizeTo (width: number, height: number, warnIframe: boolean) {
        // If the dimensions that are asked for are too big, make them as big
        // as the window
        let cantFullyResize = false;
        let availableWidth = window.innerWidth;
        if (availableWidth > document.documentElement.clientWidth) {
            availableWidth = document.documentElement.clientWidth;
        }
        if (width >= availableWidth) {
            width = availableWidth - 1;
            cantFullyResize = true;
        }
        let availableHeight = window.innerHeight;
        if (availableHeight > document.documentElement.clientHeight) {
            availableHeight = document.documentElement.clientHeight;
        }
        if (height >= availableHeight) {
            height = availableHeight - 1;
            cantFullyResize = true;
        }

        // The dimensions that were asked for might make the iframe overflow.
        // In this case, we need to compute how much we need to move the iframe
        // to the left/top in order to have it bottom-right corner sit right in
        // the window's bottom-right corner.
        const rect = this.editor.getElement().getBoundingClientRect();
        const rightOverflow = availableWidth - (rect.left + width);
        this.relativeX = rightOverflow < 0 ? rightOverflow : 0;
        const bottomOverflow = availableHeight - (rect.top + height);
        this.relativeY = bottomOverflow < 0 ? bottomOverflow : 0;

        // Now actually set the width/height, move the editor where it is
        // supposed to be and if the new iframe can't be as big as requested,
        // warn the iframe script.
        this.iframe.style.width = `${width}px`;
        this.iframe.style.height = `${height}px`;
        if (cantFullyResize && warnIframe) {
            this.resizeReqId += 1;
            browser.runtime.sendMessage({
                args: {
                    frameId: this.frameId,
                    message: {
                        args: [this.resizeReqId, width, height],
                        funcName: ["resize"],
                    }
                },
                funcName: ["messageFrame"],
            });
        }
    }

    sendKey (key: string) {
        return browser.runtime.sendMessage({
            args: {
                frameId: this.frameId,
                message: {
                    args: [key],
                    funcName: ["sendKey"],
                }
            },
            funcName: ["messageFrame"],
        });
    }

    setPageElementContent (text: string) {
        const focused = this.isFocused();
        this.editor.setContent(text);
        [
            new Event("keydown",     { bubbles: true }),
            new Event("keyup",       { bubbles: true }),
            new Event("keypress",    { bubbles: true }),
            new Event("beforeinput", { bubbles: true }),
            new Event("input",       { bubbles: true }),
            new Event("change",      { bubbles: true })
        ].forEach(ev => this.originalElement.dispatchEvent(ev));
        if (focused) {
            this.focus();
        }
    }

    setPageElementCursor (line: number, column: number) {
        return this.editor.setCursor(line, column);
    }

    show () {
        this.iframe.style.display = "initial";
    }

}
