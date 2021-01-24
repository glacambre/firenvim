import * as msgpack from "msgpack-lite";

export class Stdin {

    constructor(private socket: WebSocket) {}

    public write(reqId: number, method: string, args: any[]) {
        const req = [0, reqId, method, args];
        const encoded = msgpack.encode(req);
        this.socket.send(encoded);
    }

}
