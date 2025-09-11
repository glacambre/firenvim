import { makeRequestHandler } from "./rpc";
import * as background from "../background";

console.log("Background script loaded for testing");

const socket = new WebSocket('ws://127.0.0.1:12345');
socket.addEventListener('message', makeRequestHandler(socket,
                                                      "background",
                                                      (window as any).__coverage__ || /* istanbul ignore next */ {}));
