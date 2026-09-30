import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const READABLE = process.env.IAC_READABLE === "1";
const OUT_DIR = resolve(ROOT, READABLE ? "dist-bench" : "dist");
const POPUP_TEMPLATE = resolve(ROOT, "src/popup-page/popup.html");

// The popup goes first: it empties the output folder and copies `public/`.
const ENTRIES = [
    { name: "index", source: "src/popup-page/index.ts" },
    { name: "contentscript", source: "src/contentscript.ts" },
    { name: "backgroundscript", source: "src/backgroundscript.ts" },
];

// Vite only processes a page whose script is `type="module"`, and the popup's
// script is an iife, so the page is copied through as written. An iife build
// inlines the stylesheet into the script, so there is no link to add.
const popupPage = (): Plugin => ({
    name: "popup-page",
    generateBundle() {
        this.emitFile({
            type: "asset",
            fileName: "index.html",
            source: readFileSync(POPUP_TEMPLATE, "utf8"),
        });
    },
});

// One build per entry, each a self contained iife. An MV3 content script
// cannot load an es module, so a chunk shared between entries would break it.
for (const [position, entry] of ENTRIES.entries()) {
    const isPopup = entry.name === "index";
    await build({
        configFile: false,
        root: ROOT,
        logLevel: "warn",
        plugins: [svelte(), ...(isPopup ? [popupPage()] : [])],
        publicDir: isPopup ? resolve(ROOT, "public") : false,
        build: {
            outDir: OUT_DIR,
            emptyOutDir: position === 0,
            target: "chrome112",
            minify: !READABLE,
            rolldownOptions: {
                input: resolve(ROOT, entry.source),
                output: {
                    format: "iife",
                    entryFileNames: `${entry.name}.js`,
                    assetFileNames: "[name][extname]",
                },
            },
        },
    });
}
