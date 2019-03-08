import * as msgpack from "msgpack-lite";

export class Stdout {
    public port: Port;
    private listeners = new Map<string, Array<(...args: any[]) => any>>();

    constructor(port: Port) {
        this.port = port;
        this.port.onMessage.addListener(this.onMessage.bind(this));
        this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
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
        const [_, reqId, data1, data2] = msgpack.decode(msg.data);
        const arr = this.listeners.get("message");
        if (arr) {
            arr.forEach(l => l(reqId, data1, data2));
        }
        // FIXME: This is a hack to deal with coallesced messages, there has to be a better way
        const rec = msgpack.encode([_, reqId, data1, data2]);
        if (msg.data.length > rec.length + 4) {
            this.onMessage({ data: msg.data.slice(rec.length) });
        }
    }
}
