const fs = require("fs");
const path = require("path");
const ProvidePlugin = require("webpack").ProvidePlugin;
const CopyWebPackPlugin = require("copy-webpack-plugin");
const sharp = require("sharp");

function deepCopy (obj) {
  if (obj instanceof Array) {
    return obj.slice();
  }
  const result = {};
  Object.assign(result, obj);
  Object.keys(result)
    .filter(key => (typeof result[key]) === "object")
    .forEach(key => result[key] = deepCopy(result[key]));
  return result;
};

const CopyWebPackFiles = [
  "ISSUE_TEMPLATE.md",
  "src/manifest.json",
  "src/NeovimFrame.html",
  "src/browserAction.html",
  "static/firenvim.svg",
]

const config = {
  mode: "development",

  entry: {
    background: "./src/background.ts",
    browserAction: "./src/browserAction.ts",
    content: "./src/content.ts",
    nvimui: "./src/NeovimFrame.ts",
  },
  output: {
    filename: "[name].js",
    // Overwritten by browser-specific config
    // path: __dirname + "/target/extension",
  },

  // Enable sourcemaps for debugging webpack's output.
  devtool: "inline-source-map",

  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: [".ts", ".tsx", ".js", ".json"],
  },

  module: {
    rules: [
      // Load ts files with ts-loader
      { test: /\.tsx?$/, loader: "ts-loader" },
      // For non-firefox browsers, we need to load a polyfill for the "browser"
      // object. This polyfill is loaded through webpack's Provide plugin.
      // Unfortunately, this plugin is pretty dumb and tries to provide an
      // empty object named "browser" to the webextension-polyfill library.
      // This results in the library not creating a browser object. The
      // following line makes sure `browser` is undefined when
      // webextension-polyfill is ran so that it can create a `browser` object.
      // This is why we shouldn't load webextension-polyfill for firefox -
      // otherwise we'd get a proxy instead of the real thing.
      {
        test: require.resolve("webextension-polyfill"),
        use: [{
          loader: "imports-loader",
          options: {
            additionalCode: 'browser = undefined;',
          },
        }]
      }
    ]},

  // Overwritten by browser-specific config
  plugins: [],
}

const package_json = JSON.parse(require("fs").readFileSync(path.join(__dirname, "package.json")))

const chrome_target_dir = path.join(__dirname, "target", "chrome")
const firefox_target_dir = path.join(__dirname, "target", "firefox")

const chromeConfig = (config, env) => {
  const result = Object.assign(deepCopy(config), {
    output: {
      path: chrome_target_dir,
    },
    plugins: [new CopyWebPackPlugin({ patterns: CopyWebPackFiles.map(file => ({
      from: file,
      to: chrome_target_dir,
      transform: (content, src) => {
        if (path.basename(src) === "manifest.json") {
          content = content.toString()
            .replace('BROWSER_SPECIFIC_SETTINGS', '"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk3pkgh862ElxtREZVPLxVNbiFWo9SnvZtZXZavNvs2GsUTY/mB9yHTPBGJiBMJh6J0l+F5JZivXDG7xdQsVD5t39CL3JGtt93M2svlsNkOEYIMM8tHbp69shNUKKjZOfT3t+aZyigK2OUm7PKedcPeHtMoZAY5cC4L1ytvgo6lge+VYQiypKF87YOsO/BGcs3D+MMdS454tLBuMp6LxMqICQEo/Q7nHGC3eubtL3B09s0l17fJeq/kcQphczKbUFhTVnNnIV0JX++UCWi+BP4QOpyk5FqI6+SVi+gxUosbQPOmZR4xCAbWWpg3OqMk4LqHaWpsBfkW9EUt6EMMMAfQIDAQAB"')
            .replace("FIRENVIM_VERSION", package_json.version)
            .replace("PACKAGE_JSON_DESCRIPTION", package_json.description)
          // Chrome doesn't support svgs in its manifest
            .replace(/"128": *"firenvim\.svg"/g, '"128": "firenvim128.png",\n'
              + '      "16": "firenvim16.png",\n'
              + '      "48": "firenvim48.png"'
            )
            .replace(/"default_icon": "firenvim.svg"/, '"default_icon": "firenvim128.png"')
          ;
          if (env.endsWith("testing")) {
            content = content.replace(`content.js`, `content.js", "testing.js`);
          }
        }
        return content;
      }
    })).concat([16, 48, 128].map(n => ({
      from: "static/firenvim.svg",
      to: chrome_target_dir,
      transformPath: () => `firenvim${n}.png`,
      transform: (content) => sharp(content).resize(n, n).toBuffer(),
    })))}),
      new ProvidePlugin({ "browser": "webextension-polyfill" })
    ]
  });
  try {
    fs.rmdirSync(result.output.path, { recursive: true })
  } catch (e) {
    console.log(`Could not delete output dir (${e.message})`);
  }
  return result;
}

const firefoxConfig = (config, env) => {
  const result = Object.assign(deepCopy(config), {
    output: {
      path: firefox_target_dir,
    },
    plugins: [new CopyWebPackPlugin({
      patterns: CopyWebPackFiles.map(file => ({
        from: file,
        to: firefox_target_dir,
        transform: (content, src) => {
          switch(path.basename(src)) {
            case "manifest.json":
              content = content.toString().replace("BROWSER_SPECIFIC_SETTINGS",
`  "browser_specific_settings": {
    "gecko": {
      "id": "firenvim@lacamb.re",
      "strict_min_version": "69.0"
    }
  }`)
                .replace("FIRENVIM_VERSION", package_json.version)
                .replace("PACKAGE_JSON_DESCRIPTION", package_json.description)
              ;
              if (env.endsWith("testing")) {
                content = content.replace(`content.js`, `content.js", "testing.js`);
              }
          }
          return content;
        }
      }))
    })]
  });
  try {
    fs.rmdirSync(result.output.path, { recursive: true })
  } catch (e) {
    console.log(`Could not delete output dir (${e.message})`);
  }
  return result;
}

module.exports = env => {
  if (env === undefined){
    env = "";
  }

  if (env.endsWith("testing")) {
    config.entry.testing = "./src/testing/content.ts";
    config.entry.nvimui = "./src/testing/frame.ts";
  }

  if (env.startsWith("chrome")) {
    return [chromeConfig(config, env)];
  } else if (env.startsWith("firefox")) {
    return [firefoxConfig(config, env)];
  }
  return [chromeConfig(config, env), firefoxConfig(config, env)];
}

