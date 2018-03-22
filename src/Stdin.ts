export class Stdin extends EventEmitter {
    public port: Port;
    public writable: boolean;
    public writableBuffer: boolean;

    constructor(port: Port) {
        super();
        this.port = port;
        this.writable = true;
        this.writableBuffer = true;
    }

    public write(str: string) {
        this.port.postMessage(str);
        return false;
    }

    public pipe() {
        throw new Error("Trying to pipe Stdin");
    }

    public cork() {
        throw new Error("Trying to cork Stdin");
    }

    public uncork() {
        throw new Error("Trying to uncork Stdin");
    }

    public setDefaultEncoding() {
        throw new Error("Trying to setDefaultEncoding Stdin");
    }

    public end() {
        throw new Error("Trying to end Stdin");
    }
}
