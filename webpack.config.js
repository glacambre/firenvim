const CopyWebPackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "development",

  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
    nvimui: "./src/NeovimUi.ts",
  },
  output: {
    filename: "[name].js",
    path: __dirname + "/target/extension",
  },

  // Enable sourcemaps for debugging webpack's output.
  devtool: "inline-source-map",

  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: [".ts", ".tsx", ".js", ".json"],
    modules: ["node_modules"],
  },

  module: {
    rules: [
      // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
      { test: /\.tsx?$/, loader: "awesome-typescript-loader" },
    ],
  },

  plugins: [
    new CopyWebPackPlugin([
      { from: "src/manifest.json" },
      { from: "src/NeovimFrame.html" },
      { from: "static/firenvim.svg" },
    ]),
  ],
};
