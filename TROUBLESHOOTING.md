# Troubleshooting Firenvim

If you're having issues with Firenvim, here are the following steps you can take in order to check if everything is correctly set up on your side:

## Make sure the neovim plugin is installed

Run neovim without any arguments and then try to run the following line:
```
call firenvim#install(0)
```

- If this results in `Installed native matifest for ${browser}` being printed, the firenvim plugin is correctly installed in neovim and you can move on to the next troubleshooting step.

- If this results in `No config detected for ${browser}` and `${browser}` is the browser you want to use firenvim with, this might be because your browser configuration files are in a non-standard directory. If this is the case, you will need to either create a symbolic link from your browser configuration directory to the expected one ([firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests#Manifest_location), [chrome](https://developer.chrome.com/apps/nativeMessaging#native-messaging-host-location)), or force-install Firenvim with `call firenvim#install(1)` and copy the contents of the default browser configuration directory ([firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests#Manifest_location), [chrome](https://developer.chrome.com/apps/nativeMessaging#native-messaging-host-location)) to your custom one.

- If this results in `Unknown function: firenvim#install` being printed, then firenvim is not correctly installed in neovim and this is likely a configuration error from your side. Check your configuration again.

- If this results in `nvim version >= 0.4.0 required. Aborting`, you know what to do :).

## Make sure the firenvim script has been created

Running `call firenvim#install(0)` should have created a shell or batch script in `$XDG_DATA_HOME/firenvim` (on linux/osx, this usually is `$HOME/.local/share/firenvim`, on windows it's `%LOCALAPPDATA%\firenvim`). Make sure that the script exists and that it is executable. Try running it in a shell, like this:
```sh
echo 'abcde{}' | ${XDG_DATA_HOME:-${HOME}/.local/share}/firenvim/firenvim
```
This should print a json object the content of which is the current version of the firenvim neovim plugin. If it doesn't, please open a new github issue.

## Make sure the firenvim native manifest has been created

Running `call firenvim#install(0)` should also have created a file named `firenvim.json` in your browser's configuration directory. Make sure it exists:

- On Linux:
    * For Firefox: `$HOME/.mozilla/native-messaging-hosts`
    * For Chrome: `$HOME/.config/google-chrome/NativeMessagingHosts/`
    * For Chromium: `$HOME/.config/chromium/NativeMessagingHosts/`
- On OSX:
    * For Firefox: `$HOME/Library/Application Support/Mozilla/NativeMessagingHosts`
    * For Chrome: `$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts`
    * For Chromium: `$HOME/Library/Application Support/Chromium/NativeMessagingHosts`
- On Windows: in `%LOCALAPPDATA%\firenvim` and check that the following registry keys exist and point to the native manifest:
    * For Firefox: `HKEY_CURRENT_USER\SOFTWARE\Mozilla\NativeMessagingHosts\firenvim`
    * For Chrome/Chromium: `HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\firenvim`

Also check the content of this json file to make sure that the `path` key points to the firenvim script you checked the existence of in the previous step. If the json file is missing or if the `path` attribute is wrong, please open a new github issue.

## Make sure the browser extension can communicate with neovim

In your browser, open the background console. This requires the following steps:

- On Firefox:
    * Go to `about:debugging`
    * Select `This Firefox` in the left column.
    * Find firenvim.
    * Click on the `inspect` button.
    * If the console already contains messages, empty it by clicking on the trash icon.
- On Chrome/ium:
    * Go to `chrome://extensions`
    * Enable Developer mode (the button is in the top right corner)
    * Find firenvim.
    * Click on the `background page` link.
    * If the console already contains messages, empty by pressing `<C-l>`.

Then, navigate to a page with a textarea (I really like `http://txti.es` for this). Open the content console (`<CS-I>` on both firefox and chrome/ium). If you're using firefox, also open and clear the Browser Console (`<CS-J>`). Then, click on the textarea. This should result in messages being printed in the console. If it doesn't, try clicking on the Firenvim icon next to the urlbar. If no messages are logged there either, try clicking on the `Reload settings` button.

### Make sure firenvim can access your config files

If your configs are not in `$HOME/.config/nvim` and the last step works with `-u NORC`, it could be that firenvim cannot access your config files. Try sourcing them (`:source [path to file]`) from inside firenvim. If this fails, move the configs into `$HOME/.config/nvim` and try sourcing them again.

## Make sure firenvim's $PATH is the same as neovim's

Some operating systems (such as OSX) empty your browser's `$PATH`. This could be a problem if you want to use plugins that depend on other executables. In order to check if this is indeed happening, just run `echo $PATH` in your shell and `:!echo $PATH` in firenvim and compare the results. If they're different, this might be the culprit.

In order to fix this, call firenvim#install() and give it a prologue that sets the right path for you, like this:
```sh
nvim --headless -c "call firenvim#install(0, 'export PATH=\"$PATH\"')" -c quit
```

Note that this sets your `$PATH` in stone and that in order to update it you'll need to run the above command again. If you want to avoid doing that, you could also try the method described [here](https://github.com/glacambre/firenvim/issues/122#issuecomment-536348171).

## Print-debugging your init.vim

You can't use `echo` or `echom` in your init.vim before Firenvim has been loaded and initialized. If you need to debug your init.vim, you could try one of these two apparoaches:
- Append the messages you would normally `echom` to a list which you will only display after the `UiEnter` autocommand has been triggered.
- Use `echoerr` instead and redirect Neovim's stderr to a file on your disk in the [firenvim script](#make-sure-the-firenvim-script-has-been-created) by appending `2>>/tmp/stderr | tee -a /tmp/stdout` at the end of the `exec` line.
