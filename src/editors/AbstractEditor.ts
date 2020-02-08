
export abstract class AbstractEditor {
    public abstract getContent (): Promise<string>;
    public abstract getElement (): HTMLElement;
    public abstract setContent (s: string): Promise<any>;
}
