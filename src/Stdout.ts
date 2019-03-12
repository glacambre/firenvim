import * as msgpack from "msgpack-lite";

export class Stdout {
    public port: browser.runtime.Port;
    private listeners = new Map<string, Array<(...args: any[]) => any>>();
    private messageNames = new Map([[0, "request"], [1, "response"], [2, "notification"]]);

    constructor(port: browser.runtime.Port) {
        this.port = port;
        this.port.onMessage.addListener(this.onMessage.bind(this));
    }

    public addListener(kind: string, listener: (...args: any[]) => any) {
        let arr = this.listeners.get(kind);
        if (!arr) {
            arr = [];
            this.listeners.set(kind, arr);
        }
        arr.push(listener);
    }

    private onDisconnect() {
        console.log("onDisconnect", this.port);
    }

    private onMessage(msg: any) {
        const decoded = msgpack.decode(msg.data);
        if (Number.isInteger(decoded)) {
            // Notification/event. msgpack fails to decode them, so ignore for now
            console.log("Received message ", msg);
        } else {
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
            if (msg.data.length > rec.length + 4) {
                this.onMessage({ data: msg.data.slice(rec.length) });
            }
        }
    }
}
