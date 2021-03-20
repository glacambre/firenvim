# Firenvim Architecture and Security mitigations

## Architecture

Webextensions are made of [several kinds of processes](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Anatomy_of_a_WebExtension) (also named "scripts"). Firenvim uses three kinds of scripts:
- The [background script](src/background.ts).
- The [content script](src/content.ts).
- The ["frame" script](src/frame.ts).

These scripts have different permissions. For example, the background script can start new processes on your computer but cannot access the content of your tabs. The content script has the opposite permissions. The frame script is just a kind of content script that executes in a frame.

When you launch your browser (or install Firenvim), the background script starts a new NeoVim process and writes a randomly-generated 256-bit password to its stdin. The NeoVim process binds itself to a random TCP port and sends the port number to the background script by writing to stdout.

When you open a new tab, the content script adds event listeners to text areas. When you focus one of the text areas the content script is listening to, it creates a new frame and places it on top of the text area.

When it is created, the frame script asks the background script for the port and password of the NeoVim process it started earlier by using a webextension-only API. The frame script then creates a plaintext (as opposed to TLS) [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications) and sends the password as part of the websocket handshake.

When the NeoVim process notices a new connection, it makes sure that:
- The password is in the handshake.
- The handshake really is a websocket handshake.

If any of these conditions isn't met, the NeoVim process closes its socket and port and then shuts itself down.

After a successful websocket handshake, the frame script and neovim process communicate with neovim's msgpack-rpc protocol.

## Threats

### Malicious page

A malicious page could create an infinite amount of textareas and focus them all; this could result in PID and/or port and/or memory exhaustion. You can [sandbox firenvim](https://github.com/glacambre/firenvim/issues/238) to protect yourself from that. Finer-grained controls will be implemented some day.

A malicious page could try to connect to the NeoVim process started by the background script with its own-websocket. However, it would have to guess the port and password the NeoVim process was started with in order to be able to send commands to NeoVim.

A malicious page could try to send key events to the neovim frame. However, only the script inside the frame listens for key events and a page can't send key events to a child frame (and even then, the frame script makes sure that [events are trusted](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)).

A malicious page could try to send malicious messages to the frame with the [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Client/postMessage) api but the frame script doesn't listen for these.

### Malicious extensions

A malicious extension can do everything a page can (and these attacks are mitigated in the same way). There's two more attack vectors to consider:

A malicious extension cannot start neovim unless its id matches Firenvim's. I have no idea what Mozilla does in order to prevent an extension from stealing another extension's id. I assume they check extension ids when publishing extensions on addons.mozilla.org. However, if this is the only protection in place, this would mean that you're not safe from this kind of attack if you install your extensions from somewhere else.

Another attack a malicious extension could attempt is to use the webrequest extension API in order to intercept Firenvim's websocket connection request, inspect its content, cancel it and then connect to Neovim while pretending it is Firenvim. However, this cannot work as the webrequest extension API does not offer the ability to intercept requests from other extensions.

### Malicious actors on LAN

The neovim process binds itself to 127.0.0.1, so malicious actors on your LAN should be unable to interact with either your webextension or your neovim process.

### Malicious software on your computer

Malicious software on your computer could try to connect to the neovim process but they would have to find out what port and password. This information lives either in firefox or neovim's RAM. If you're running malicious software that can read your RAM, you probably have bigger problems than a webextension that lets you use neovim from your browser.

## Sandboxing Firenvim

If you want to sandbox Firenvim, you can do so with apparmor. [This github issue](https://github.com/glacambre/firenvim/issues/238) has a bit more information about that.
