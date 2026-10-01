import { test as base, chromium, BrowserContext, Worker } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Benchmarks need the instrumented build, everything else the shipped one.
 * `pnpm benchmark` sets this; without it the tests load what users get.
 */
const DIST = path.resolve(__dirname, "../..", process.env.IAC_BUILD ?? "dist");

/**
 * The bundled headless shell cannot load extensions. A full Chromium can, so
 * the system browser is preferred and Playwright's own build is the fallback.
 */
const findBrowser = (): string | undefined => {
    for (const candidate of ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"]) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
};

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
    context: async ({}, use) => {
        if (!fs.existsSync(path.join(DIST, "manifest.json"))) {
            throw new Error(
                `no build found at ${DIST}. Run 'pnpm build' or 'pnpm build:bench' in the project root.`,
            );
        }
        const context = await chromium.launchPersistentContext("", {
            // Playwright's bundled headless shell cannot load extensions.
            // headless:false selects the full build, locally and in CI.
            executablePath: findBrowser(),
            headless: false,
            args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
        });
        await use(context);
        await context.close();
    },

    extensionId: async ({ context }, use) => {
        // The service worker's url carries the id the browser assigned.
        let worker: Worker | undefined = context.serviceWorkers()[0];
        if (worker === undefined) {
            worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
        }
        await use(new URL(worker.url()).host);
    },
});

export const expect = test.expect;
export const FIXTURES = "https://github.com/NickSpaghetti/iac-module-linker-fixtures";
