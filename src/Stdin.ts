import * as msgpack from "msgpack-lite";

export class Stdin {

    constructor(private socket: WebSocket) {}

    public write(reqId: number, method: string, args: any[]) {
        // V3 Migration: Check WebSocket state before sending to prevent CLOSING/CLOSED errors
        if (this.socket.readyState !== WebSocket.OPEN) {
            console.debug("Attempted to write to closed WebSocket, ignoring:", method);
            return;
        }
        
        const req = [0, reqId, method, args];
        const encoded = msgpack.encode(req);
        this.socket.send(encoded);
    }

}
