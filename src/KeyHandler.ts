import { EventEmitter } from "./EventEmitter";
import { GlobalSettings, NvimMode } from "./utils/configuration";
import { addModifier, nonLiteralKeys, translateKey } from "./utils/keys";

// KeyHandler is the interface expecte by getInput
export interface KeyHandler extends EventEmitter<"input", (s: string) => void> {
    setMode: (m: NvimMode) => void,
    focus: () => void,
    moveTo: (x: number, y: number) => void,
}

type KeydownEmittingObject = {
    addEventListener: (s: "keydown", h: ((e: KeyboardEvent) => void)) => void,
    focus: () => void
};

// This class implements the keydown logic that deals with modifiers and is
// shared across both browsers and thunderbird
export class KeydownHandler extends EventEmitter<"input", (s: string) => void> implements KeyHandler {
    private currentMode : NvimMode;
    constructor(private elem: KeydownEmittingObject, settings: GlobalSettings) {
        super();
        const ignoreKeys = settings.ignoreKeys;
        this.elem.addEventListener("keydown", (evt) => {
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
    }

    focus() {
        this.elem.focus();
    }

    moveTo(_: number, __: number) {
        // Don't do nuthin
    }

    setMode(s: NvimMode) {
        this.currentMode = s;
    }
};
