const { resolve } = require("path");
const HTMLWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const readable = process.env.IAC_READABLE === "1";

const tsRule = {
    test: /\.ts$/,
    exclude: ["/node_modules/", "/tests/"],
    use: "ts-loader",
};

const cssRule = {
    test: /\.css$/,
    use: ["style-loader", "css-loader"],
};

const svelteRule = {
    test: /\.svelte$/,
    use: {
        loader: "svelte-loader",
        options: { compilerOptions: { dev: readable }, emitCss: false },
    },
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
        index: "./src/popup-page/index.ts",
        contentscript: "./src/contentscript.ts",
        backgroundscript: "./src/backgroundscript.ts",
    },
    resolve: {
        extensions: [".js", ".ts", ".svelte"],
        // "..." keeps webpack's own defaults. Writing an explicit list
        // instead drops `webpack`, `module` and the mode condition, which
        // changes how every dependency resolves.
        conditionNames: ["svelte", "..."],
    },
    output: {
        filename: "[name].js",
        path: resolve(__dirname, readable ? "dist-bench" : "dist"),
        clean: true,
    },
    module: {
        rules: [tsRule, svelteRule, cssRule],
    },
    plugins,
    devtool: false,
    optimization: {
        minimize: !readable,
        minimizer: [new TerserPlugin({ parallel: true })],
    },
};
