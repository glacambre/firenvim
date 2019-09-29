const path = require("path")
const CopyWebPackPlugin = require("copy-webpack-plugin");

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
  "src/manifest.json",
  "src/NeovimFrame.html",
  "src/browserAction.html",
  "static/firenvim.svg",
  "static/firenvim-disabled.svg",
  "static/firenvim-notification.svg",
  "static/firenvim-error.svg",
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
      // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
      { test: /\.tsx?$/, loader: "awesome-typescript-loader" },
    ],
  },

  // Overwritten by browser-specific config
  plugins: [],
}

const package_json = JSON.parse(require("fs").readFileSync(path.join(__dirname, "package.json")))

const chrome_target_dir = path.join(__dirname, "target", "chrome")

module.exports = [
  Object.assign(deepCopy(config), {
    output: {
      path: chrome_target_dir,
    },
    plugins: [new CopyWebPackPlugin(CopyWebPackFiles.map(file => ({
      from: file,
      to: chrome_target_dir,
      transform: (content, src) => {
        switch(path.basename(src)) {
          case "manifest.json":
            return content.toString()
              .replace('BROWSER_SPECIFIC_SETTINGS,', '"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk3pkgh862ElxtREZVPLxVNbiFWo9SnvZtZXZavNvs2GsUTY/mB9yHTPBGJiBMJh6J0l+F5JZivXDG7xdQsVD5t39CL3JGtt93M2svlsNkOEYIMM8tHbp69shNUKKjZOfT3t+aZyigK2OUm7PKedcPeHtMoZAY5cC4L1ytvgo6lge+VYQiypKF87YOsO/BGcs3D+MMdS454tLBuMp6LxMqICQEo/Q7nHGC3eubtL3B09s0l17fJeq/kcQphczKbUFhTVnNnIV0JX++UCWi+BP4QOpyk5FqI6+SVi+gxUosbQPOmZR4xCAbWWpg3OqMk4LqHaWpsBfkW9EUt6EMMMAfQIDAQAB",\n')
              .replace("FIRENVIM_VERSION", package_json.version)
              .replace("PACKAGE_JSON_DESCRIPTION", package_json.description)
              // Chrome doesn't support svgs in its manifest
              .replace('"default_icon": "firenvim.svg",\n', "")
            ;
            break;
        }
        return content;
      }
    }))),
    ]
  }),
  Object.assign(deepCopy(config), {
    output: {
      path: __dirname + "/target/firefox",
    },
    plugins: [new CopyWebPackPlugin(CopyWebPackFiles.map(file => ({
      from: file,
      to: __dirname + "/target/firefox",
      transform: (content, src) => {
        switch(path.basename(src)) {
          case "manifest.json":
            return content.toString().replace("BROWSER_SPECIFIC_SETTINGS,", `
  "browser_specific_settings": {
    "gecko": {
      "id": "firenvim@lacamb.re",
      "strict_min_version": "65.0"
    }
  },`)
              .replace("FIRENVIM_VERSION", package_json.version)
              .replace("PACKAGE_JSON_DESCRIPTION", package_json.description)
            ;
            break;
        }
        return content;
      }
    })))]
  }),
];

