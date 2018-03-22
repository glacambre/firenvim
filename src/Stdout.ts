export class Stdout extends EventEmitter {
    public port: Port;
    public readable: boolean;

    constructor(port: Port) {
        super();
        this.port = port;
        this.port.onMessage.addListener(this.onMessage.bind(this));
        this.readable = true;
    }

    public isPaused() {
        console.warn("Calling isPaused on Stdout");
        return false;
    }

    public pause() {
        console.warn("Calling pause on Stdout");
        return this as any;
    }

    public pipe(destination: any, options?: {end?: boolean; }) {
        console.warn("Calling pipe on Stdout");
        return destination;
    }

    public read(size: number) {
        console.warn("Calling read on Stdout");
        return "";
    }

    public resume() {
        console.warn("Calling resume on Stdout");
        return this as any;
    }

    public setEncoding(encoding: string) {
        console.warn("Calling setEncoding on Stdout");
        return this as any;
    }

    public unpipe(destination: any) {
        console.warn("Calling unpipe on Stdout");
        return this as any;
    }

    public unshift() {
        console.warn("Calling unshift on Stdout");
    }

    public wrap(oldStream: any) {
        console.warn("Calling wrap on Stdout");
        return this as any;
    }

    public destroy() {
        console.warn("Calling destroy on Stdout");
    }

    private onMessage(msg: any) {
        console.log(msg);
    }
}
