const {resolve} = require('path');
const HTMLWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const {CleanWebpackPlugin} = require("clean-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const tsRule = {
    test: /\.ts(x?)$/,
    exclude: [
        '/node_modules/',
        '/tests/'
    ],
    use: 'ts-loader'
}

const plugins = [
    new HTMLWebpackPlugin({
      template: 'src/popup-page/popup.html',
      filename: 'index.html',
      chunks: ['popup'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {from: "public", to: "."}
      ],
    }),
    // new LoaderOptionsPlugin({
    //     minimize: true,
    //     debug: false
    // }),
    new CleanWebpackPlugin(),
  ];

module.exports = {
    mode: "production",
    entry: {
        index:              './src/popup-page/popup.tsx',
        contentscript:      './src/contentscript.ts',
        backgroundscript:   './src/backgroundscript.ts'
    },
    resolve:{
      extensions:['.js','.jsx','.ts','.tsx'],
    },
    output: {
        filename: '[name].js',
        path: resolve(__dirname, 'dist')
    },
    module : {
        rules: [tsRule]
    },
    plugins,
    devtool: false,
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({parallel:true})]
    }
}
