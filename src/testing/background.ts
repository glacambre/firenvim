import { makeRequestHandler } from "./rpc";
import * as background from "../background";

const socket = new WebSocket('ws://127.0.0.1:12345');
socket.addEventListener('message', makeRequestHandler(socket,
                                                      "background",
                                                      (self as any).__coverage__ || /* istanbul ignore next */ {},
                                                      {
                                                          updateSettings: background.updateSettings,
                                                          updateIfPossible: background.updateIfPossible,
                                                          acceptCommand: background.acceptCommand,
                                                      }));
