import {
    test as base,
    chromium,
    BrowserContext,
    ConsoleMessage,
    Page,
    TestInfo,
    Worker,
} from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
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

/** What `logRecovered` in `src/util/Log.ts` starts every line with. */
const LOG_PREFIX = "[iac-module-linker]";

/**
 * Records what the extension logs, from its pages and its service worker.
 * @param context The browser context the extension is loaded in.
 * @returns The lines logged so far, each marked with where it came from.
 */
const recordExtensionLogs = (context: BrowserContext): string[] => {
    const lines: string[] = [];
    const started = Date.now();
    context.on("console", (message: ConsoleMessage) => {
        const where = message.worker() === null ? "page" : "worker";
        if (
            message.text().includes(LOG_PREFIX) ||
            (where === "worker" && message.type() === "error")
        ) {
            lines.push(`+${Date.now() - started}ms ${where} ${message.type()}: ${message.text()}`);
        }
    });
    return lines;
};

/**
 * Attaches what the extension logged to a test that did not pass, so a flake
 * that cannot be reproduced still says why it failed. Written to a file,
 * because the list reporter cuts an inline attachment short.
 * @param testInfo The test that ran.
 * @param lines What the extension logged while it ran.
 */
const attachLogsOnFailureAsync = async (testInfo: TestInfo, lines: string[]) => {
    if (testInfo.status === testInfo.expectedStatus) {
        return;
    }
    const file = testInfo.outputPath("extension-logs.txt");
    fs.writeFileSync(
        file,
        `${lines.length === 0 ? "(the extension logged nothing)" : lines.join("\n")}\n`,
    );
    await testInfo.attach("extension-logs", { path: file, contentType: "text/plain" });
};

/**
 * Copies a build with its optional host permissions made required.
 *
 * Chrome's permission prompt is not part of the page, so a test cannot click
 * it. An unpacked extension is granted its required hosts on load, which puts
 * the browser where it would be after the user allowed them.
 * @param dist The build to copy.
 * @returns The copy's folder.
 */
export const grantOptionalHosts = (dist: string): string => {
    const granted = fs.mkdtempSync(path.join(os.tmpdir(), "iac-granted-"));
    fs.cpSync(dist, granted, { recursive: true });
    const manifestFile = path.join(granted, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
        host_permissions: string[];
        optional_host_permissions?: string[];
    };
    manifest.host_permissions.push(...(manifest.optional_host_permissions ?? []));
    delete manifest.optional_host_permissions;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 4));
    return granted;
};

export const test = base.extend<{
    grantOptionalHosts: boolean;
    context: BrowserContext;
    extensionId: string;
}>({
    // Off unless a spec opts in with `test.use({ grantOptionalHosts: true })`.
    grantOptionalHosts: [false, { option: true }],

    context: async ({ grantOptionalHosts: grant }, use, testInfo) => {
        if (!fs.existsSync(path.join(DIST, "manifest.json"))) {
            throw new Error(
                `no build found at ${DIST}. Run 'pnpm build' or 'pnpm build:bench' in the project root.`,
            );
        }
        const extension = grant ? grantOptionalHosts(DIST) : DIST;
        const context = await chromium.launchPersistentContext("", {
            // Playwright's bundled headless shell cannot load extensions.
            // headless:false selects the full build, locally and in CI.
            executablePath: findBrowser(),
            headless: false,
            args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        });
        const logs = recordExtensionLogs(context);
        await use(context);
        await attachLogsOnFailureAsync(testInfo, logs);
        await context.close();
        if (extension !== DIST) {
            fs.rmSync(extension, { recursive: true, force: true });
        }
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
export const GITLAB_FIXTURES = "https://gitlab.com/NickSpaghetti/iac-module-linker-fixtures";

/**
 * Opens the popup with the file still in front.
 *
 * A real popup is a panel and leaves the file in front, so the extension asks
 * the active tab which file to show. Opening the popup as a tab would make it
 * the active tab and it would ask about itself.
 * @param context The browser context the extension is loaded in.
 * @param extensionId The id chrome assigned the extension.
 * @param file The page to keep in front.
 * @returns The page the popup was opened on.
 */
export const openPopupAsync = async (context: BrowserContext, extensionId: string, file: Page) => {
    const popup = await context.newPage();
    await popup.goto("about:blank");
    await file.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    return popup;
};
