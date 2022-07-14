import * as msgpack from "msgpack-lite";
import { EventEmitter } from "./EventEmitter";

type MessageKind = "request" | "response" | "notification";
type RequestHandler = (id: number, name: string, args: any[]) => void;
type ResponseHandler = (id: number, error: any, result: any) => void;
type NotificationHandler = (name: string, args: any[]) => void;
type MessageHandler = RequestHandler | ResponseHandler | NotificationHandler;
export class Stdout extends EventEmitter<MessageKind, MessageHandler>{
    private messageNames = new Map<number, MessageKind>([[0, "request"], [1, "response"], [2, "notification"]]);
    private msgpackConfig: msgpack.DecoderOptions = {
        // Create the codec object early so the Decoder is initialized with it.
        // If that was created in `setTypes`, the `decoder` would already be
        // initialized with the default codec.
        // https://github.com/kawanet/msgpack-lite/blob/5b71d82cad4b96289a466a6403d2faaa3e254167/lib/decode-buffer.js#L17
        codec: msgpack.createCodec({ preset: true }),
    };
    private decoder = msgpack.Decoder(this.msgpackConfig);

    constructor(private socket: WebSocket) {
        super();
        this.socket.addEventListener("message", this.onMessage.bind(this));
        this.decoder.on("data", this.onDecodedChunk.bind(this));
    }

    public setTypes(types: {[key: string]: { id: number }}) {
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
        try {
            this.decoder.decode(msgData);
        } catch (error) {
            // NOTE: this branch was not hit during testing, but theoretically could happen
            // due to
            // https://github.com/kawanet/msgpack-lite/blob/5b71d82cad4b96289a466a6403d2faaa3e254167/lib/flex-buffer.js#L52
            console.log("msgpack decode failed", error);
        }
    }

    private onDecodedChunk(decoded: [number, unknown, unknown, unknown]) {
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
