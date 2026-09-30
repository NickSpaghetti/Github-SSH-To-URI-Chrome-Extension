import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import { copyFileSync } from "fs";

const readable = process.env.IAC_READABLE === "1";
const entry = process.env.IAC_ENTRY ?? "";

const ENTRIES: Record<string, string> = {
    index: "src/popup-page/index.ts",
    contentscript: "src/contentscript.ts",
    backgroundscript: "src/backgroundscript.ts",
};

/**
 * A proof of concept alongside `webpack.config.js`, not a replacement.
 *
 * One entry per invocation, in iife format. MV3 content scripts cannot load
 * an es module, and rollup splits code shared between entries into a chunk
 * the content script would then have to import, so the three are built
 * separately to get three self contained files.
 */
/** What `HTMLWebpackPlugin` does on the other side: the popup's page. */
const popupPage = (outDir: string) => ({
    name: "popup-page",
    closeBundle() {
        if (entry === "index") {
            copyFileSync(resolve(__dirname, "src/popup-page/popup.html"), `${outDir}/index.html`);
        }
    },
});

export default defineConfig({
    plugins: [svelte(), popupPage(readable ? "dist-vite-bench" : "dist-vite")],
    // Copied once, by the popup build, rather than three times.
    publicDir: entry === "index" ? resolve(__dirname, "public") : false,
    build: {
        outDir: readable ? "dist-vite-bench" : "dist-vite",
        emptyOutDir: entry === "index",
        minify: !readable,
        rollupOptions: {
            input: resolve(__dirname, ENTRIES[entry] ?? ENTRIES.index),
            output: {
                format: "iife",
                entryFileNames: `${entry}.js`,
                assetFileNames: "[name][extname]",
            },
        },
    },
});
