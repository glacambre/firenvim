# Firenvim [![Build Status](https://travis-ci.org/glacambre/firenvim.svg?branch=master)](https://travis-ci.org/glacambre/firenvim)

Turn Firefox into a Neovim client.

![Firenvim demo](firenvim.gif)

# How to use

For now, just click on textareas or input fields. When you want to set the content of the textarea to the content of the neovim frame, just `:w`. When you want to close the neovim frame, just `:q`.

# How to install

Get the extension from [AMO](https://addons.mozilla.org/en-US/firefox/addon/firenvim/), get the native messenger from the [releases page](https://github.com/glacambre/firenvim/releases). Run the native messenger once in your shell and if it results in `Native messenger successfully installed.` being printed, you're done.

# Drawbacks

There are two huge issues with this extension. The first one is that some keybindings (e.g. `<C-w>`) are not overridable. I circumvent this issue by running a [patched](https://github.com/glacambre/firefox-patches) version of firefox.

The second issue is that the extension is quite slow, for now. I believe this is in part caused by webextension API architecture: in order to reach Neovim, Firenvim's messages must go from Firefox's content process to its background process, then from the background process to Firenvim's native messenger and then from the native messenger to Neovim. Answers to these messages must pass through all 3 layers of IPC too.

This could perhaps be alleviated by moving from the native messenger API to a websocket (this would remove the need to go through the background script).

Another way to make Firenvim faster would probably be to move from DOM-rendering to Webgl rendering.

# You might also like

- [Tridactyl](https://github.com/tridactyl/tridactyl), provides vim-like keybindings to use Firefox. Also lets you edit input fields and text areas in your favourite editor with its `:editor` command.
- [GhostText](https://github.com/GhostText/GhostText), lets you edit text areas in your editor with a single click. Requires installing a plugin in your editor too. Features live updates!
- [Textern](https://github.com/jlebon/textern), a Firefox addon that lets you edit text areas in your editor without requiring you to install a plugin in your editor.
- [withExEditor](https://github.com/asamuzaK/withExEditor), same thing as Textern, except you can also edit/view a page's source with your editor.

# How to build

You need nodejs, rustc, npm and cargo.

```sh
git clone https://github.com/glacambre/firenvim
cd firenvim
npm install
node run build
```

All build artifacts will be in the `target/` directory. Note that `node run build` will also install the native messenger on your computer. If another instance of the native messenger is already running while you try to install another version, you might get an error message. You can ignore it if you didn't change the native messenger's source code.
