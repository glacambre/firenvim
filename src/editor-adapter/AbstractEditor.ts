export type AbstractEditorOptions = { preferHTML?: boolean };

export type AbstractEditor = {
    getElement: () => HTMLElement;
    getContent: () => Promise<string>;
    getLanguage: () => Promise<string | undefined>;
    getCursor: () => Promise<[number, number]>;
    setContent: (s: string) => Promise<void>;
    setCursor: (line: number, column: number) => Promise<undefined>;
};

// Structural contract for editor classes that go through the executeScript RPC
// path. Listing a class in editorClasses with `satisfies Record<string,
// EditorClass>` forces it to expose every static below with matching
// signatures.
export type EditorClass = {
    new (e: HTMLElement, options: AbstractEditorOptions): { getElement: () => HTMLElement };
    matches(e: HTMLElement): boolean;
    getContent(selector: string): Promise<string>;
    getLanguage(selector: string): Promise<string | undefined>;
    getCursor(selector: string): Promise<[number, number]>;
    setContent(selector: string, text: string): Promise<void>;
    setCursor(selector: string, line: number, column: number): Promise<undefined>;
};
