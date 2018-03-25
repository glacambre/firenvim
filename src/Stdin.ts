import * as stream from "stream";

export class Stdin extends stream.Writable {
    public port: Port;

    constructor(port: Port) {
        super();
        this.port = port;
        this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
    }

    public _write(chunk: any, encoding: any, cb: any) {
        console.warn("Stdin._write called: ", chunk);
        this.port.postMessage(chunk);
        return false;
    }

    private onDisconnect(port: Port) {
        if (port.error) {
            console.log("Disconnected due to an error:", port);
        }
        this.emit("close");
    }
}
