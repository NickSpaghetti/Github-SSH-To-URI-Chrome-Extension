const { resolve } = require("path");
const HTMLWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const readable = process.env.IAC_READABLE === "1";

const tsRule = {
    test: /\.ts(x?)$/,
    exclude: ["/node_modules/", "/tests/"],
    use: "ts-loader",
};

const plugins = [
    new HTMLWebpackPlugin({
        template: "src/popup-page/popup.html",
        filename: "index.html",
        chunks: ["popup"],
    }),
    new CopyWebpackPlugin({
        patterns: [{ from: "public", to: "." }],
    }),
    // new LoaderOptionsPlugin({
    //     minimize: true,
    //     debug: false
    // }),
];

module.exports = {
    mode: "production",
    entry: {
        index: "./src/popup-page/popup.tsx",
        contentscript: "./src/contentscript.ts",
        backgroundscript: "./src/backgroundscript.ts",
    },
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
    },
    output: {
        filename: "[name].js",
        path: resolve(__dirname, readable ? "dist-bench" : "dist"),
        clean: true,
    },
    module: {
        rules: [tsRule],
    },
    plugins,
    devtool: false,
    optimization: {
        minimize: !readable,
        minimizer: [new TerserPlugin({ parallel: true })],
    },
};
