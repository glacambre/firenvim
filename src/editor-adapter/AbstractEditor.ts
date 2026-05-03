export type AbstractEditorOptions = { preferHTML?: boolean, triggerUpdateEvents?: boolean };

export type wrapper = (x: any) => any;
export type unwrapper = (x: any) => any;

/* Prepends selector, wrap and unwrap to function's arg types */
type D<T> = T extends (...args: infer U) => any ? (selector: string, wrap: wrapper, unwrap: unwrapper, ...args: U) => ReturnType<T> : never;

export class GenericAbstractEditor {
    public constructor (_e: HTMLElement, _options: AbstractEditorOptions) {};
    public static matches (_: HTMLElement): boolean {
        throw new Error("Matches function not overriden");
    };
    declare getElement: () => HTMLElement;
    declare getContent: D<() => Promise<string>>;
    declare getLanguage: D<() => Promise<string | undefined>>;
    declare getCursor: D<() => Promise<[number, number]>>;
    declare setContent: D<(s: string) => Promise<void>>;
    declare setCursor: D<(line: number, column: number) => Promise<undefined>>;
}

type Unargified<T> = T extends (s: string, w: wrapper, u: unwrapper, ...args: infer U) => any ? (...args: U) => ReturnType<T> : never;
type Unproxified<T> = {
    [k in keyof T]: Unargified<T[k]>
};

export type AbstractEditor = Unproxified<GenericAbstractEditor>;
