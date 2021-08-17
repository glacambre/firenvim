import * as msgpack from "msgpack-lite";
import { EventEmitter } from "./EventEmitter";

type MessageKind = "request" | "response" | "notification";
type RequestHandler = (id: number, name: string, args: any[]) => void;
type ResponseHandler = (id: number, error: any, result: any) => void;
type NotificationHandler = (name: string, args: any[]) => void;
type MessageHandler = RequestHandler | ResponseHandler | NotificationHandler;
export class Stdout extends EventEmitter<MessageKind, MessageHandler>{
    private messageNames = new Map<number, MessageKind>([[0, "request"], [1, "response"], [2, "notification"]]);
    // Holds previously-received, incomplete and unprocessed messages
    private prev = new Uint8Array(0);
    private msgpackConfig = {} as msgpack.DecoderOptions;

    constructor(private socket: WebSocket) {
        super();
        this.socket.addEventListener("message", this.onMessage.bind(this));
    }

    public setTypes(types: {[key: string]: { id: number }}) {
        this.msgpackConfig.codec = msgpack.createCodec({ preset: true });
        Object
            .entries(types)
            .forEach(([_, { id }]) =>
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
            /* istanbul ignore else */
            if (name) {
                this.emit(name, reqId, data1, data2);
            } else {
                // Can't be tested because this would mean messages that break
                // the msgpack-rpc spec, so coverage impossible to get.
                console.error(`Unhandled message kind ${name}`);
            }
        }
    }
}
