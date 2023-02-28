const {resolve} = require('path');
const HTMLWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const {CleanWebpackPlugin} = require("clean-webpack-plugin");

const tsRule = {
    test: /\.ts(x?)$/,
    exclude: [
        /node_modules/,
        "tests/cypress/cypress/e2e/*.cy.ts",
        /dist/,
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
    plugins
}
