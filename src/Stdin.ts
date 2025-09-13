import * as msgpack from "msgpack-lite";

export class Stdin {

    constructor(private socket: WebSocket) {}

    public write(reqId: number, method: string, args: any[]) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            console.debug("Attempted to write to closed WebSocket, ignoring:", method);
            return;
        }
        
        const req = [0, reqId, method, args];
        const encoded = msgpack.encode(req);
        this.socket.send(encoded);
    }

}
