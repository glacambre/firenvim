# Firenvim

Turn Firefox into a Neovim client.

# How to build

You need nodejs, rustc, npm and cargo.

```sh
git clone https://github.com/glacambre/firenvim
cd firenvim
mkdir ~/bin
npm install
node run build
```

All build artifacts will be in the `target/` directory. Note that `node run build` will also install a native manifest in your `~/.mozilla/native-messaging-hosts` and the native messenger in your `~/bin`.
