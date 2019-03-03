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
        const decoded = msgpack.decode(msg.data);
        console.log("received ", decoded, "encoded: ", msg);
        const arr = this.listeners.get("message");
        if (arr) {
            arr.forEach(l => l(decoded));
        }
    }
}
