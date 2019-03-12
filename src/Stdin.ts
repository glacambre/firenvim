import * as msgpack from "msgpack-lite";

export class Stdin {
    public port: browser.runtime.Port;

    constructor(port: browser.runtime.Port) {
        this.port = port;
    }

    public write(reqId: number, method: string, args: any[]) {
        const req = [0, reqId, method, args];
        const encoded = msgpack.encode(req);
        // console.log("writing ", req, "encoded: ", encoded);
        this.port.postMessage({ type: "Buffer", data: Array.from(encoded)});
    }

}
