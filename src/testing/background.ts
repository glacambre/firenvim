import { makeRequest, makeRequestHandler } from "./rpc";
import * as background from "../background";

// This console.log is mostly to force webpack to import background here
background.preloadedInstance.then(() => console.log("preloaded instance loaded!"));

const socket = new WebSocket('ws://127.0.0.1:12345');
socket.addEventListener('message', makeRequestHandler(socket,
                                                      "background",
                                                      (window as any).__coverage__ || /* istanbul ignore next */ {}));
