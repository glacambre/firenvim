# Contributing to Firenvim

Thanks a lot for thinking about contributing to Firenvim! Please do not hesitate to ask me questions, either by opening [github issues](https://github.com/glacambre/firenvim/issues), joining the matrix [chat room](https://app.element.io/#/room/#firenvim:matrix.org) or by sending me emails (you can find my email by running `git log` in the git repository).

## Building Firenvim

### Using Docker

Installing from source using docker requires docker 18.09 or higher for [BuildKit support](https://docs.docker.com/develop/develop-images/build_enhancements/). Older Docker versions will build the required files into the image, but will not copy them into the host.

```sh
git clone https://github.com/glacambre/firenvim
cd firenvim
DOCKER_BUILDKIT=1 docker build . -t firenvim --output target
```

### Without Docker

Build without Docker requires NodeJS, npm, and Neovim >= 0.4.

Then, install Firenvim like a regular vim plugin (either by changing your runtime path manually or by [using your favourite plugin manager](README.md#installing)).

Then run the following commands:
```sh
git clone https://github.com/glacambre/firenvim
cd firenvim
npm install
npm run build
npm run install_manifests
```

These commands should create four directories: `target/chrome`, `target/firefox`, `target/thunderbird` and `target/xpi`.

## Installing the addon

### Google Chrome/Chromium

Go to `chrome://extensions`, enable "Developer mode", click on `Load unpacked` and select the `target/chrome` directory.

### Firefox

There are multiple ways to install add-ons from files on Firefox. If you just want to use Firenvim, use the regular mode. If you want to test, debug and frequently change Firenvim's source code, use the dev mode.

To install Firenvim in regular mode, go to `about:addons`, click on the cog icon, select `install addon from file` and select `target/xpi/firenvim-XXX.zip` (note: this might require setting `xpinstall.signatures.required` to false in `about:config`).

To install Firenvim in dev mode, go to `about:debugging`, click "Load Temporary Add-On" and select `target/firefox/manifest.json`.

### Thunderbird

In Thunderbird, click the "hamburger menu" (the three horizontal bars) at the top right corner of the screen. Select "Addons", this should open the Add-ons Manager. Once there, click on the cog icon. If you want to install Firenvim in regular mode, select "Install Add-On From File" and choose `target/xpi/thunderbird-latest.xpi`. To install Firenvim in dev mode, select "Debug Add-On", then "Load Temporary Add-On" and choose `target/thunderbird/manifest.json`.

## Working on Firenvim

`npm run build` is slow and performs lots of checks. In order to iterate faster, you can use `"$(npm bin)/webpack --env=firefox"` or `"$(npm bin)/webpack" --env=chrome` or `"$(npm bin)/webpack" --env=thunderbird` to build only for the target you care about. Make sure you click the "reload" button in your browser/thunderbird every time you reload Firenvim.

Firenvim's architecture is briefly described in [SECURITY.md](SECURITY.md). Firenvim is a webextension (it is a good idea to keep the [webextension documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions) at hand if you're not familiar with webextension development). Webextensions are split in multiple processes. These processes communicate by sending messages to each other and have different entry points. Firenvim's entry points are:

- src/background.ts: Entry point of the background process.
- src/content.ts: Entry point of the content process (firefox & chrome only).
- src/compose.ts: Entry point of the compose window process (thunderbird only).
- src/frame.ts: Entry point of the Neovim Frame process.
- src/browserAction.ts: Entry point of the browser action process.

### Background process

The background process is started on browser startup and takes care of several tasks:

- Starting the Neovim server and loading the settings from your init.vim.
- Handling browser shortcuts such as `<C-w>`, `<C-n>` or `<C-t>` that cannot be overriden by the Neovim Frame process.
- Logging errors and sending them to the browserAction. 
- Forwarding messages from the Neovim Frame process to the content process and vice versa.

### Content & Compose process

The Content process and the Compose process perform the same tasks. They are created for each new tab/compose window. The tasks they perform are:

- Creating event listeners to detect when the user tries to interact with a "writable" element to then spawn a Neovim Frame process.
- Retrieving the content of said element and sending it to the Neovim Frame process.
- Detecting when the "writable" element disappears or is resized, to hide or resize the Neovim Frame.
- Writing the content of the Neovim Frame back to the "writable" element.

Reading and writing the content of "writable" elements requires interacting with different kinds of editors (CodeMirror, Ace, Monaco, Textareas, contenteditable...). This is handled by the [editor-adapter](https://github.com/glacambre/editor-adapter) library I created.

### Neovim Frame process

Neovim Frame process are created for each "writable" element the user wants to interact with. The role of the Neovim Frame process is to connect to the Neovim server started by the background process. This is done with a websocket. Once the connection has been made, the Neovim Frame process forwards keypresses to the Neovim server and displays the resulting screen updates. Handling keypresses is performed in `src/input.ts` by relying on the KeyHandler instantiated in either `src/frame.ts` or `src/compose.ts`. Updating the screen is performed by `src/renderer.ts`.
The Neovim Frame process creates a `BufWrite` autocommand to detect when the buffer is written to the disk. When this happens, it sends a request to the Content or Compose process and asks it to update the content of the "writable" element.

### Browser Action process

The browser action process corresponds to the small Firenvim button next to the URL bar. It is created every time the user clicks on the button. It displays errors, warnings and lets the background script know when users click on the button to reload their configuration or to disable firenvim in the current tab.

## Testing your changes

The CI tests changes automatically, so running tests on your machine is not required. If you do want to test Firenvim on your machine, you will need to install either Geckodriver (firefox) or Chromedriver (Chrome & Chromium). Once that is done, run `npm run test-firefox` or `npm run test-chrome`. This will build the add-on in testing mode, load it in a browser and run a few tests to make sure nothing is particularily broken.

Writing new tests is currently rather complicated, so feel free to let me handle that if you don't want to deal with it.
