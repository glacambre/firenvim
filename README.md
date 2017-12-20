# Firenvim
## Goals
Have vim and/or neovim run in every HTML input present on a page. Don't use an external editor, do not require the user to install extra software besides vim/neovim and the plugin. Have the plugin integrate well with existing plugin ecosystem (e.g. [tridactyl](https://github.com/cmcaine/tridactyl), [vim-vixen](https://github.com/ueokande/vim-vixen)...).

Although Chrome/Chromium compatibility is nice, it is not required.

## Existing options
### Maintained, working with quantum
[GhostText](https://github.com/GhostText/GhostText)
- Uses an external editor
- Requires to install a plugin within the editor

[emacs_chrome](https://github.com/stsquad/emacs_chrome/)
- Chrome only (but being ported)
- Emacs >:(

[textern](https://github.com/jlebon/textern)
- Uses an external editor

[WithExEditor](https://github.com/asamuzaK/withExEditor)
- External editor
- Requires additional software

### Discontinued/Not compatible with quantum
[Pterosaur](https://github.com/ardagnir/pterosaur)

[Texto](https://addons.mozilla.org/en-US/firefox/addon/texto/)
- External editor

[jV](https://addons.mozilla.org/en-US/firefox/addon/jv/)
- Stripped down version of Vim

[It's All Text](https://github.com/docwhat/itsalltext)
- External editor

## Architecture
It seems the only option if you don't want to have to use an external editor is to have Firefox become a neovim client.
