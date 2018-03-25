import * as stream from "stream";

export class Stdout extends stream.Readable {
    public port: Port;

    constructor(port: Port) {
        super();
        this.port = port;
        this.port.onMessage.addListener(this.onMessage.bind(this));
        this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
    }

    public _read(n: any) {
        console.log("Stdout._read called:", n);
    }

    private onDisconnect(port: Port) {
        if (port.error) {
            console.log("Disconnected due to an error:", port);
        }
        console.log("Stdout.onDisconnect");
    }

    private onMessage(msg: any) {
        console.log("Stdout.onMessage: ", msg);
        this.push(new Uint8Array(msg.data));
        // this.emit("data", msg.data);
    }
}
