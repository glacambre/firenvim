# Firenvim [![Build Status](https://travis-ci.org/glacambre/firenvim.svg?branch=master)](https://travis-ci.org/glacambre/firenvim)[![Build status](https://ci.appveyor.com/api/projects/status/kboak3f5kl9hkgf4/branch/master?svg=true)](https://ci.appveyor.com/project/glacambre/firenvim/branch/master)[![Total alerts](https://img.shields.io/lgtm/alerts/g/glacambre/firenvim.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/glacambre/firenvim/alerts/)

Turn your browser into a Neovim client.

![Firenvim demo](firenvim.gif)

# How to use

Just click on textareas, the firenvim frame should pop up. When you want to set the content of the textarea to the content of the neovim frame, just `:w`. When you want to close the neovim frame, just `:q`.

# Installing

Before installing anything, please read [SECURITY.md](SECURITY.md) and make sure you're OK with everything mentionned in there. If you think of a way to compromise Firenvim, please send me an email (you can find my address in my commits).

## Pre-built

1. Make make sure you are using [Neovim][nvim] 0.4.0 or later. This plugin will not work with vanilla [VIM][vim].

2. Install Firenvim as a VIM plugin as you would any other, then run the built in post-install hook script.

    * [vim-plug](https://github.com/junegunn/vim-plug)

        ```vim
        Plug 'glacambre/firenvim', { 'do': function('firenvim#install') }
        ```

    * [dein](https://github.com/Shougo/dein.vim)

        ```vim
        call dein#add('glacambre/firenvim', { 'hook_post_update': function('firenvim#install') })
        ```

    * [minpac](https://github.com/k-takata/minpac)

        ```vim
        call minpac#add('glacambre/firenvim', { 'do': function('firenvim#install') })
        ```

    * [pathogen](https://github.com/tpope/vim-pathogen), [vundle](https://github.com/VundleVim/Vundle.vim), others

        Install the plugin as you usually would, then run this shell command:

        ```sh
        $ nvim --headless -c "call firenvim#install(0)" -c "quit"`.
        ```

3. Finally install Firenvim in your browser from [Mozilla's store](https://addons.mozilla.org/en-US/firefox/addon/firenvim/) or [Google's](https://chrome.google.com/webstore/detail/firenvim/egpjdkipkomnmjhjmdamaniclmdlobbo).

## From source

### Requirements

Installing from source requires nodejs, npm and neovim v.>=0.4

### Cross-browser steps

First, install Firenvim like a regular vim plugin (either by changing your runtime path manually or by using your favourite plugin manager).

Then, run the following commands:
```sh
git clone https://git.sr.ht/~glacambre/firenvim
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
- [Access browser tabs](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u#w_access-browser-tabs): This is required in order to find out what the currently active tab is.

# Configuring Firenvim

## Configuring the browser addon behavior

Firenvim is configured by creating a variable named `g:firenvim_config` in your init.vim. This variable is a dictionnary containing the key "localSettings". `g:firenvim_config["localSettings"]` is a dictionnary the keys of which have to be a javascript pattern matching a url and the values of which are dictionnaries containing settings that apply for all urls matched by the javascript pattern. When multiple patterns match a same URL, the pattern with the highest "priority" value is used.

Here's an example `g:firenvim_config` that matches the default configuration:
```
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
        \ },
        \ 'github\.com': {
            \ 'selector': 'textarea',
            \ 'priority': 1,
        \ },
    \ }
\ }
```
Note that it is not necessary to specify the `priority` key because it defaults to 1, except for the `.*` pattern, which has a priority of 0.

## Configuring neovim's behavior

You can detect when firenvim connects to neovim with the following code:
```
function! OnUIEnter(event)
    let l:ui = nvim_get_chan_info(a:event.chan)
    if has_key(l:ui, 'client') && has_key(l:ui.client, "name")
        if l:ui.client.name == "Firenvim"
            set laststatus=0
        endif
    endif
endfunction
autocmd UIEnter * call OnUIEnter(deepcopy(v:event))
```

Similarly, you can detect when firenvim disconnects from a neovim instance with the `UILeave` autocommand.

If you want to use different settings depending on the textarea you're currently editing, you can use autocommands to do that too. All buffers are named like this: `domainname_page_selector.txt` (see the [toFileName function](src/utils/utils.ts)). This means that you can for example set the file type to markdown for all github buffers:
```
au BufEnter github.com_*.txt set filetype=markdown
```

# Drawbacks

The main issue with Firenvim is that some keybindings (e.g. `<C-w>`) are not overridable. I circumvent this issue by running a [patched](https://github.com/glacambre/firefox-patches) version of firefox.

# You might also like

- [Tridactyl](https://github.com/tridactyl/tridactyl), provides vim-like keybindings to use Firefox. Also lets you edit input fields and text areas in your favourite editor with its `:editor` command.
- [GhostText](https://github.com/GhostText/GhostText), lets you edit text areas in your editor with a single click. Requires installing a plugin in your editor too. Features live updates!
- [Textern](https://github.com/jlebon/textern), a Firefox addon that lets you edit text areas in your editor without requiring you to install a plugin in your editor.
- [withExEditor](https://github.com/asamuzaK/withExEditor), same thing as Textern, except you can also edit/view a page's source with your editor.

 [nvim]: https://neovim.io
 [vim]: https://www.vim.org
