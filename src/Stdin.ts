import * as msgpack from "msgpack-lite";

export class Stdin {
    public port: Port;

    constructor(port: Port) {
        this.port = port;
        this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
    }

    public write(reqId: number, method: string, args: any[]) {
        const req = [0, reqId, method, args];
        const encoded = msgpack.encode(req);
        // console.log("writing ", req, "encoded: ", encoded);
        this.port.postMessage({ type: "Buffer", data: Array.from(encoded)});
    }

    private onDisconnect() {
        // console.log("onDisconnect", this.port);
    }

}
