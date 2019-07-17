# Firenvim [![Build Status](https://travis-ci.org/glacambre/firenvim.svg?branch=master)](https://travis-ci.org/glacambre/firenvim)

Turn Firefox into a Neovim client.

![Firenvim demo](firenvim.gif)

# How to use

For now, just click on textareas or input fields. When you want to set the content of the textarea to the content of the neovim frame, just `:w`. When you want to close the neovim frame, just `:q`.

# How to install

Before installing anything, please read [SECURITY.md](SECURITY.md).

## Pre-built

Get the extension from [AMO](https://addons.mozilla.org/en-US/firefox/addon/firenvim/), get the native messenger from the [releases page](https://github.com/glacambre/firenvim/releases). Run the native messenger once in your shell and if it results in `Native messenger successfully installed.` being printed, you're done.

## From source

Installing from source requires nodejs, npm and neovim v.>=0.4 and running the following commands:
```sh
git clone https://github.com/glacambre/firenvim
cd firenvim
npm install
npm run build
npm run install
```
These commands should have created a file named `target/xpi/firenvim-X.X.X.zip`. You can import it in firefox by going to `about:addons`, clicking on the cog icon and selecting `install addon from file` (note: this might require setting `xpinstall.signatures.required` to false in `about:config`).

Now, install Firenvim like a regular vim plugin manually or by using your favourite plugin manager.

# Drawbacks

The main issue with Firenvim is that some keybindings (e.g. `<C-w>`) are not overridable. I circumvent this issue by running a [patched](https://github.com/glacambre/firefox-patches) version of firefox.

# You might also like

- [Tridactyl](https://github.com/tridactyl/tridactyl), provides vim-like keybindings to use Firefox. Also lets you edit input fields and text areas in your favourite editor with its `:editor` command.
- [GhostText](https://github.com/GhostText/GhostText), lets you edit text areas in your editor with a single click. Requires installing a plugin in your editor too. Features live updates!
- [Textern](https://github.com/jlebon/textern), a Firefox addon that lets you edit text areas in your editor without requiring you to install a plugin in your editor.
- [withExEditor](https://github.com/asamuzaK/withExEditor), same thing as Textern, except you can also edit/view a page's source with your editor.
