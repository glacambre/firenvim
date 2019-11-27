# Firenvim [![Build Status](https://travis-ci.org/glacambre/firenvim.svg?branch=master)](https://travis-ci.org/glacambre/firenvim) [![Build status](https://ci.appveyor.com/api/projects/status/kboak3f5kl9hkgf4/branch/master?svg=true)](https://ci.appveyor.com/project/glacambre/firenvim/branch/master) [![Total alerts](https://img.shields.io/lgtm/alerts/g/glacambre/firenvim.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/glacambre/firenvim/alerts/) [![Vint](https://github.com/glacambre/firenvim/workflows/Vint/badge.svg)](https://github.com/glacambre/firenvim/actions?workflow=Vint)

Turn your browser into a Neovim client.

![Firenvim demo](firenvim.gif)

## How to use

Just click on any textarea and it will be immediately replaced by an instance of Firenvim. When you want to set the content of the now hidden textarea to the content of the Neovim instance, just `:w`. If you want to close the Firenvim overlay and return to the textarea run `:q`. If you selected an element where you expected the Firenvim frame to appear and it didn't, try pressing `<C-e>`.

## Installing

Before installing anything please read [SECURITY.md](SECURITY.md) and make sure you're okay with everything mentioned. In the event you think of a way to compromise Firenvim, please send me an email (you can find my address in my commits).

### Pre-built

1. Make sure you are using [Neovim][nvim] 0.4.0 or later. This plugin will not work with vanilla [VIM][vim] or [Vimr](vimr).

2. Check if the luabitop package is available by running `:lua bit.band(1,1)` in Neovim. If this throws an error, you will need to install it.

3. Install Firenvim as a VIM plugin as you would any other, then run the built in post-install hook script.

    * [vim-plug](https://github.com/junegunn/vim-plug)

        ```vim
        Plug 'glacambre/firenvim', { 'do': { _ -> firenvim#install(0) } }
        ```

    * [dein](https://github.com/Shougo/dein.vim)

        ```vim
        call dein#add('glacambre/firenvim', { 'hook_post_update': { _ -> firenvim#install(0) } })
        ```

    * [minpac](https://github.com/k-takata/minpac)

        ```vim
        call minpac#add('glacambre/firenvim', { 'do': { _ -> firenvim#install(0) } })
        ```

    * [pathogen](https://github.com/tpope/vim-pathogen), [vundle](https://github.com/VundleVim/Vundle.vim), others

        Install the plugin as you usually would, then run this shell command:

        ```sh
        $ nvim --headless "+call firenvim#install(0) | q"
        ```

4. Finally install Firenvim in your browser from [Mozilla's store](https://addons.mozilla.org/en-US/firefox/addon/firenvim/) or [Google's](https://chrome.google.com/webstore/detail/firenvim/egpjdkipkomnmjhjmdamaniclmdlobbo).

### From source

#### Requirements

Installing from source requires NodeJS, `npm`, and Neovim >= 0.4.

#### Cross-browser steps

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

#### Firefox-specific steps

Go to `about:addons`, click on the cog icon and select `install addon from file` (note: this might require setting `xpinstall.signatures.required` to false in `about:config`).

#### Google Chrome/Chromium-specific steps

Go to `chrome://extensions`, enable "Developer mode", click on `Load unpacked` and select the `target/chrome` directory.

#### Other browsers

Other browsers aren't supported for now. Opera, Vivaldi and other Chromium-based browsers should however work just like in Chromium and have similar install steps. Brave and Edge might work, Safari doesn't (it doesn't support Webextensions).

## Permissions

Firenvim currently requires the following permissions for the following reasons:

- [Access your data for all websites](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u&utm_source=inproduct#w_access-your-data-for-all-websites): this is necessary in order to be able to append elements (= the neovim iframe) to the DOM.
- [Exchange messages with programs other than Firefox](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u#w_exchange-messages-with-programs-other-than-firefox): this is necessary in order to be able to start neovim instances.
- [Access browser tabs](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions?as=u#w_access-browser-tabs): This is required in order to find out what the currently active tab is.

## Configuring Firenvim

### Configuring the browser addon behavior

#### Manually triggering Firenvim

You can configure the keybinding to manually trigger Firenvim (`<C-e>` by default) in [the shortcuts menu in `about://addons`](https://support.mozilla.org/en-US/kb/manage-extension-shortcuts-firefox) on Firefox, or in `chrome://extensions/shortcuts` on Chrome.

#### Configuring what sites Firenvim should automatically appear on

The rest of Firenvim is configured by creating a variable named `g:firenvim_config` in your init.vim. This variable is a dictionary containing the key "localSettings". `g:firenvim_config["localSettings"]` is a dictionary the keys of which have to be a Javascript pattern matching a URL and the values of which are dictionaries containing settings that apply for all URLs matched by the Javascript pattern. When multiple patterns match a same URL, the pattern with the highest "priority" value is used.

Here's an example `g:firenvim_config` that matches the default configuration:

```vim
let g:firenvim_config = {
    \ 'localSettings': {
        \ '.*': {
            \ 'selector': 'textarea, div[role="textbox"]',
            \ 'priority': 0,
        \ }
    \ }
\ }
```

This means that for all URLs ("`.*`"), textareas will be turned into Firenvim instances. Here's an example that will make Firenvim not take over any elements, except for Github's textareas:

```vim
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

Note that even with this config, manually triggering Firenvim will still work on every page.

#### Automatically syncing changes to the page

Since Firenvim just uses the BufWrite event in order to detect when it needs to write neovim's buffers to the page, Firenvim can be made to automatically synchronize all changes like this:

```vim
au TextChanged * ++nested write
au TextChangedI * ++nested write
```

Depending on how large the edited buffer is, this could be a little slow. A better approach would then be to delay writes, like this:

```vim
let g:dont_write = v:false
function! My_Write(timer) abort
	let g:dont_write = v:false
	write
endfunction

function! Delay_My_Write() abort
	if g:dont_write
		return
	end
	let g:dont_write = v:true
	call timer_start(10000, 'My_Write')
endfunction

au TextChanged * ++nested call Delay_My_Write()
au TextChangedI * ++nested call Delay_My_Write()
```

You can also focus move focus from the editor back to the page by calling `firenvim#focus_page`. Here's an example that does exactly this if you press `<Esc>` twice while in normal mode:

```vim
nnoremap <Esc><Esc> :call firenvim#focus_page()<CR>
```

#### Special characters on OSX

On OSX, on certain layouts (e.g. the swedish layout), pressing special characters (e.g. `@`) requires combining `Alt` and another key. Because of browser/OS limitations, it is impossible to tell the difference between a user trying to press `<A-@>` and just `@`. Because of that, on OSX, Firenvim decides to ignore the Alt key when you press any non-alphanumerical key. This behavior can be changed by setting the `alt` setting of the `globalSettings` configuration to `all`, like this:
```
let g:firenvim_config = {
	\ "globalSettings": {
		\ "alt": "all"
	\}
\}
```
Non-OSX users can get the default OSX behavior by setting the `alt` setting to `alphanum` (but they shouldn't ever need to do that).

### Configuring Neovim's behavior

When it starts Neovim, Firenvim sets the variable `g:started_by_firenvim` which you can check to run different code in your init.vim. For example:

```vim
if exists('g:started_by_firenvim')
  set laststatus=0
else
  set laststatus=2
endif
```

Alternatively, you can detect Firenvim using the `UIEnter` autocmd event:

```vim
function! s:IsFirenvimActive(event) abort
  if !exists('*nvim_get_chan_info')
    return 0
  endif
  let l:ui = nvim_get_chan_info(a:event.chan)
  return has_key(l:ui, 'client') && has_key(l:ui.client, "name") &&
      \ l:ui.client.name is# "Firenvim"
endfunction

function! OnUIEnter(event) abort
  if s:IsFirenvimActive(a:event)
    set laststatus=0
  endif
endfunction
autocmd UIEnter * call OnUIEnter(deepcopy(v:event))
```

Similarly, you can detect when Firenvim disconnects from a Neovim instance with the `UILeave` autocommand.

If you want to use different settings depending on the textarea you're currently editing, you can use autocommands to do that too. All buffers are named like this: `domainname_page_selector.txt` (see the [toFileName function](src/utils/utils.ts)). This means that you can for example set the file type to markdown for all GitHub buffers:

```vim
au BufEnter github.com_*.txt set filetype=markdown
```

## Drawbacks

The main issue with Firenvim is that some keybindings (e.g. `<C-w>`) are not overridable. I circumvent this issue by running a [patched](https://github.com/glacambre/firefox-patches) version of Firefox.

## You might also like

- [Tridactyl](https://github.com/tridactyl/tridactyl), provides vim-like keybindings to use Firefox. Also lets you edit input fields and text areas in your favourite editor with its `:editor` command.
- [GhostText](https://github.com/GhostText/GhostText), lets you edit text areas in your editor with a single click. Requires installing a plugin in your editor too. Features live updates!
- [Textern](https://github.com/jlebon/textern), a Firefox addon that lets you edit text areas in your editor without requiring you to install a plugin in your editor.
- [withExEditor](https://github.com/asamuzaK/withExEditor), same thing as Textern, except you can also edit/view a page's source with your editor.

 [nvim]: https://neovim.io
 [vim]: https://www.vim.org
 [vimr]: https://github.com/qvacua/vimr
