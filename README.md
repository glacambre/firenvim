# Firenvim [![Build Status](https://travis-ci.org/glacambre/firenvim.svg?branch=master)](https://travis-ci.org/glacambre/firenvim)[![Total alerts](https://img.shields.io/lgtm/alerts/g/glacambre/firenvim.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/glacambre/firenvim/alerts/)

Turn your browser into a Neovim client.

![Firenvim demo](firenvim.gif)

# How to use

For now, just click on textareas or input fields. When you want to set the content of the textarea to the content of the neovim frame, just `:w`. When you want to close the neovim frame, just `:q`.

# Installing

Before installing anything, please read [SECURITY.md](SECURITY.md) and make sure you're OK with everything mentionned in there. If you think of a way to compromise Firenvim, please send an email (you can find my address in my commits).

## Pre-built

Get the extension from [AMO](https://addons.mozilla.org/en-US/firefox/addon/firenvim/), get the native messenger from the [releases page](https://github.com/glacambre/firenvim/releases). Run the native messenger once in your shell and if it results in `Native messenger successfully installed.` being printed, you're done.

## From source

### Requirements

Installing from source requires nodejs, npm and neovim v.>=0.4

### Cross-browser steps

First, install Firenvim like a regular vim plugin (either by changing your runtime path manually or by using your favourite plugin manager).

Then, run the following commands:
```sh
git clone git@git.sr.ht:~glacambre/firenvim
cd firenvim
npm install
npm run build
npm run install_manifests
```
These commands should create three directories: `target/chrome`, `target/firefox` and `target/xpi`.

### Firefox-specific steps
Go to `about:addons`, click on the cog icon and select `install addon from file` (note: this might require setting `xpinstall.signatures.required` to false in `about:config`).

### Google Chrome/Chromium-specific steps
Go to `chrome://extensions`, enable "Developer mode", click on `Load unpacked` and select the `target/chrome` directory.

### Other browsers
Other browsers aren't supported for now. Opera, Vivaldi and other Chromium-based browsers should however work just like in Chromium and have similar install steps. Brave and Edge might work, Safari doesn't (it doesn't support Webextensions).

# Permissions

Firenvim currently requires the following permissions for the following reasons:

- [Access your data for all websites](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u&utm_source=inproduct#w_access-your-data-for-all-websites): this is necessary in order to be able to append elements (= the neovim iframe) to the DOM.
- [Exchange messages with programs other than Firefox](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u#w_exchange-messages-with-programs-other-than-firefox): this is necessary in order to be able to start neovim instances.
- [Access recently closed tabs](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u#w_access-recently-closed-tabs): Firenvim needs the [sessions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions) permission in order to be able to use [getTabValue](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions/getTabValue) and [setTabValue](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions/setTabValue), which are used to keep track of whether Firenvim should be disabled in a specific tab.
- [Access browser tabs](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u#w_access-browser-tabs): This is required in order to find out what the currently active tab is (used in conjunction with getTabValue and setTabValue in order to set the disabled/enabled state).

# Configuring Firenvim

Firenvim is configured by creating a variable named `g:firenvim_config` in your init.vim. This variable is a dictionnary containing the key "localSettings". `g:firenvim_config["localSettings"]` is a dictionnary the keys of which have to be a javascript pattern matching a url and the values of which are dictionnaries containing settings that apply for all urls matched by the javascript pattern. When multiple patterns match a same URL, the pattern with the highest "priority" value is used.

Here's an example `g:firenvim_config` that matches the default configuration:
```vimscript
let g:firenvim_config = {
    \ 'localSettings': {
        \ '.*': {
            \ 'selector': 'textarea',
            \ 'priority': 0,
        \ }
    \ }
\ }
```
This means that for all urls ("`.*`"), textareas will be turned into firenvim instances. Here's an example that disables firenvim everywhere but enables it on github:
```vimscript
let g:firenvim_config = {
    \ 'localSettings': {
        \ '.*': {
            \ 'selector': '',
            \ 'priority': 0,
        \ }
        \ 'github\.com': {
            \ 'selector': 'textarea',
            \ 'priority': 1,
        \ }
    \ }
\ }
```
Note that it is not necessary to specify the `priority` key because it defaults to 1, except for the `.*` pattern, which has a priority of 0.

# Drawbacks

The main issue with Firenvim is that some keybindings (e.g. `<C-w>`) are not overridable. I circumvent this issue by running a [patched](https://github.com/glacambre/firefox-patches) version of firefox.

# You might also like

- [Tridactyl](https://github.com/tridactyl/tridactyl), provides vim-like keybindings to use Firefox. Also lets you edit input fields and text areas in your favourite editor with its `:editor` command.
- [GhostText](https://github.com/GhostText/GhostText), lets you edit text areas in your editor with a single click. Requires installing a plugin in your editor too. Features live updates!
- [Textern](https://github.com/jlebon/textern), a Firefox addon that lets you edit text areas in your editor without requiring you to install a plugin in your editor.
- [withExEditor](https://github.com/asamuzaK/withExEditor), same thing as Textern, except you can also edit/view a page's source with your editor.
