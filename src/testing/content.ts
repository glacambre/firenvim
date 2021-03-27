// This script is only loaded in firefox-testing and chrome-testing builds
// (check manifest.json if you want to make sure of that) It provides a way for
// the page to ask the webextension to reload the neovim instance. This is
// necessary for testing reasons (we sometimes might create states that
// "poison" firenvim and need to reset it).

import { makeRequestHandler } from "./rpc";
import { listenersSetup } from "../content";

listenersSetup.then(() => {
    const socket = new WebSocket('ws://127.0.0.1:12345');
    socket.addEventListener('message',
                            makeRequestHandler(socket,
                                               "content",
                                               (new Function("return this"))().__coverage__
                                               || /* istanbul ignore next */ {}));
});
