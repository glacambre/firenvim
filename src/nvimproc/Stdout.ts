import * as msgpack from "msgpack-lite";
import * as browser from "webextension-polyfill"; // lgtm[js/unused-local-variable]

export class Stdout {
    private listeners = new Map<string, Array<(...args: any[]) => any>>();
    private messageNames = new Map([[0, "request"], [1, "response"], [2, "notification"]]);

    constructor(private socket: WebSocket) {
        this.socket.addEventListener("message", this.onMessage.bind(this));
    }

    public addListener(kind: string, listener: (...args: any[]) => any) {
        let arr = this.listeners.get(kind);
        if (!arr) {
            arr = [];
            this.listeners.set(kind, arr);
        }
        arr.push(listener);
    }

    private onMessage(msg: any) {
        const uint8arr = new Uint8Array(msg.data);
        const decoded = msgpack.decode(uint8arr);
        const [kind, reqId, data1, data2] = decoded;
        const name = this.messageNames.get(kind);
        if (!name) {
            throw new Error(`Unhandled message kind! ${decoded}`);
        }
        const arr = this.listeners.get(name);
        if (arr) {
            arr.forEach(l => l(reqId, data1, data2));
        } else {
            console.log(`No handlers for message kind '${name}'`);
        }
        // FIXME: This is a hack to deal with coallesced messages, there has to be a better way
        const rec = msgpack.encode(decoded);
        if (msg.data.byteLength > rec.length) {
            this.onMessage({ data: msg.data.slice(rec.length) });
        }
    }
}
