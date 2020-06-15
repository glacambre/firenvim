import * as msgpack from "msgpack-lite";

export class Stdout {
    private listeners = new Map<string, ((...args: any[]) => any)[]>();
    private messageNames = new Map([[0, "request"], [1, "response"], [2, "notification"]]);
    // Holds previously-received, incomplete and unprocessed messages
    private prev = new Uint8Array(0);
    private msgpackConfig = {} as msgpack.DecoderOptions;

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

    public setTypes(types: {[key: string]: { id: number }}) {
        this.msgpackConfig.codec = msgpack.createCodec({ preset: true });
        Object
            .entries(types)
            .forEach(([name, { id }]) =>
                     this
                        .msgpackConfig
                        .codec
                        .addExtUnpacker(id, (data: any) => data));
    }

    private onMessage(msg: any) {
        const msgData = new Uint8Array(msg.data);
        let data = new Uint8Array(msgData.byteLength + this.prev.byteLength);
        data.set(this.prev);
        data.set(msgData, this.prev.length);
        while (true) {
            let decoded;
            try {
                decoded = msgpack.decode(data, this.msgpackConfig);
            } catch (e) {
                this.prev = data;
                return;
            }
            const encoded = msgpack.encode(decoded);
            data = data.slice(encoded.byteLength);
            const [kind, reqId, data1, data2] = decoded;
            const name = this.messageNames.get(kind);
            if (name) {
                const handlers = this.listeners.get(name);
                if (handlers !== undefined) {
                    for (let handler of handlers) {
                        handler(reqId, data1, data2);
                    }
                }
            } else {
                console.log(`Unhandled message kind ${name}`);
            }
        }
    }
}
