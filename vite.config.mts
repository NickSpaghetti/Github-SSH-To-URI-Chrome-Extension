import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type EnvironmentOptions, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const READABLE = process.env.IAC_READABLE === "1";
const POPUP = "popup";
const POPUP_TEMPLATE = fileURLToPath(new URL("src/popup-page/popup.html", import.meta.url));

/**
 * Builds one entry as a self contained iife.
 * @param source The entry's source file.
 * @param name The file name it ships as, without the extension.
 * @param first Whether this build empties the output folder and copies `public/`.
 * @returns The environment that builds it.
 */
const iife = (source: string, name: string, first = false): EnvironmentOptions => ({
    consumer: "client",
    build: {
        emptyOutDir: first,
        copyPublicDir: first,
        rolldownOptions: {
            input: source,
            output: {
                format: "iife",
                entryFileNames: `${name}.js`,
                assetFileNames: "[name][extname]",
            },
        },
    },
});

// Vite only processes a page whose script is `type="module"`, and the popup's
// script is an iife, so the page is copied through as written. An iife build
// inlines the stylesheet into the script, so there is no link to add.
const popupPage = (): Plugin => ({
    name: "popup-page",
    applyToEnvironment: (environment) => environment.name === POPUP,
    generateBundle() {
        this.emitFile({
            type: "asset",
            fileName: "index.html",
            source: readFileSync(POPUP_TEMPLATE, "utf8"),
        });
    },
});

// One environment per entry. An MV3 content script cannot load an es module,
// so a chunk shared between entries would break it. The popup builds first
// because it empties the output folder.
const ENVIRONMENTS = {
    [POPUP]: iife("src/popup-page/index.ts", "index", true),
    content: iife("src/contentscript.ts", "contentscript"),
    background: iife("src/backgroundscript.ts", "backgroundscript"),
};

export default defineConfig({
    logLevel: "warn",
    plugins: [svelte(), popupPage()],
    build: {
        outDir: READABLE ? "dist-bench" : "dist",
        target: "chrome112",
        minify: !READABLE,
    },
    environments: ENVIRONMENTS,
    builder: {
        // Only these three. Vite's own default would also build the implicit
        // client environment, which looks for an index.html at the root.
        buildApp: async (builder) => {
            for (const name of Object.keys(ENVIRONMENTS)) {
                await builder.build(builder.environments[name]);
            }
        },
    },
});
