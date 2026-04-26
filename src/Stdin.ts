import * as msgpack from "msgpack-lite";

export class Stdin {

    constructor(private socket: WebSocket) {}

    public write(reqId: number, method: string, args: any[]) {
        const req = [0, reqId, method, args];
        const encoded = msgpack.encode(req);
        // There are a couple of typing issues forcing us to cast to any here:
        // - TypeScript doesn't have the right view of the type returned by
        //   msgpack-lite (a Uint8Array)
        // - For some reason, it thinks that Uint8Arrays can't be passed to a
        //   websocket's send() (which is wrong, the docs clearly state that
        //   any typed array can be used)
        //   https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
        this.socket.send(encoded as any);
    }

}
