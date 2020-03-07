
export abstract class AbstractEditor {
    public abstract getContent (): Promise<string>;
    public abstract getCursor (): Promise<[number, number]>;
    public abstract getElement (): HTMLElement;
    public abstract getLanguage (): Promise<string | undefined>;
    public abstract setContent (s: string): Promise<any>;
    public abstract setCursor (line: number, column: number): Promise<any>;
}
