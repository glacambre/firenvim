import { EventEmitter } from "./EventEmitter";
import { GlobalSettings, NvimMode } from "./utils/configuration";
import { nonLiteralKeys, addModifier, translateKey } from "./utils/keys";
import { isChrome } from "./utils/utils";

export class KeyHandler extends EventEmitter<"input", (s: string) => void> {
    private currentMode : NvimMode;
    private isComposing : boolean;
    private lastCursorPosition : { x: number, y: number };
    constructor(private elem: HTMLElement, settings: GlobalSettings) {
        super();
        const ignoreKeys = settings.ignoreKeys;
        this.elem.addEventListener("keydown", (evt) => {
            this.moveTo(this.lastCursorPosition.x, this.lastCursorPosition.y, "cursor");
            // This is a workaround for osx where pressing non-alphanumeric
            // characters like "@" requires pressing <A-a>, which results
            // in the browser sending an <A-@> event, which we want to
            // treat as a regular @.
            // So if we're seeing an alt on a non-alphanumeric character,
            // we just ignore it and let the input event handler do its
            // magic. This can only be tested on OSX, as generating an
            // <A-@> keydown event with selenium won't result in an input
            // event.
            // Since coverage reports are only retrieved on linux, we don't
            // instrument this condition.
            /* istanbul ignore next */
            if (evt.altKey && settings.alt === "alphanum" && !/[a-zA-Z0-9]/.test(evt.key)) {
                return;
            }
            // Note: order of this array is important, we need to check OS before checking meta
            const specialKeys = [["Alt", "A"], ["Control", "C"], ["OS", "D"], ["Meta", "D"]];
            // The event has to be trusted and either have a modifier or a non-literal representation
            if (evt.isTrusted
                && (nonLiteralKeys[evt.key] !== undefined
                    || specialKeys.find(([mod, _]: [string, string]) =>
                                        evt.key !== mod && (evt as any).getModifierState(mod)))) {
                const text = specialKeys.concat([["Shift", "S"]])
                .reduce((key: string, [attr, mod]: [string, string]) => {
                    if ((evt as any).getModifierState(attr)) {
                        return addModifier(mod, key);
                    }
                    return key;
                }, translateKey(evt.key));

                let keys : string[] = [];
                if (ignoreKeys[this.currentMode] !== undefined) {
                    keys = ignoreKeys[this.currentMode].slice();
                }
                if (ignoreKeys.all !== undefined) {
                    keys.push.apply(keys, ignoreKeys.all);
                }
                if (!keys.includes(text)) {
                    this.emit("input", text);
                    evt.preventDefault();
                    evt.stopImmediatePropagation();
                }
            }
        })

        const acceptInput = ((evt: any) => {
            this.emit("input", evt.target.value);
            evt.preventDefault();
            evt.stopImmediatePropagation();
            evt.target.innerText = "";
            evt.target.value = "";
        }).bind(this);

        this.elem.addEventListener("input", (evt: any) => {
            if (evt.isTrusted && !evt.isComposing) {
                acceptInput(evt);
            }
        });

        // On Firefox, Pinyin input method for a single chinese character will
        // result in the following sequence of events:
        // - compositionstart
        // - input (character)
        // - compositionend
        // - input (result)
        // But on Chrome, we'll get this order:
        // - compositionstart
        // - input (character)
        // - input (result)
        // - compositionend
        // So Chrome's input event will still have its isComposing flag set to
        // true! This means that we need to add a chrome-specific event
        // listener on compositionend to do what happens on input events for
        // Firefox.
        // Don't instrument this branch as coverage is only generated on
        // Firefox.
        /* istanbul ignore next */
        if (isChrome()) {
            this.elem.addEventListener("compositionstart", (e: CompositionEvent) => {
                this.isComposing = true;
            });
            this.elem.addEventListener("compositionend", (e: CompositionEvent) => {
                this.isComposing = false;
                acceptInput(e);
            });
        }
    }

    focus() {
        this.elem.focus();
    }

    moveTo(x: number, y: number, eventSource: string) {
        if (eventSource === "cursor") {
            this.lastCursorPosition = { x, y };
        }
        if (!this.isComposing) {
            this.elem.style.left = `${x}px`;
            this.elem.style.top = `${y}px`;
        }
    }

    resizeHeight(height: number) {
        this.elem.style.height = `${height}px`;
    }

    changeColor(foregroundColor: string) {
        this.elem.style.color = foregroundColor;
    }

    setMode(s: NvimMode) {
        this.currentMode = s;
    }
}
