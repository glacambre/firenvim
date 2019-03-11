# Firenvim

Turn Firefox into a Neovim client.

# How to use

For now, just click on textareas or input fields. When you want to set the content of the textarea to the content of the neovim frame, just `:w`. When you want to close the neovim frame, just `:q`.

# How to install

Get the extension from (https://addons.mozilla.org/en-US/firefox/addon/firenvim/)[https://addons.mozilla.org/en-US/firefox/addon/firenvim/], get the native messenger from the (releases page)[https://github.com/glacambre/firefox-patches/releases]. Run the native messenger once in your shell and if it results in `Native messenger successfully installed.` being printed, you're done.

# How to build

You need nodejs, rustc, npm and cargo.

```sh
git clone https://github.com/glacambre/firenvim
cd firenvim
npm install
node run build
```

All build artifacts will be in the `target/` directory. Note that `node run build` will also install the native messenger on your computer.
