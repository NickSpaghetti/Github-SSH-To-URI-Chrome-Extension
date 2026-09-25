import { defineConfig } from "@playwright/test";

/**
 * Extensions only load in a persistent context with a full Chromium build.
 * The headless shell Playwright ships by default cannot load them, so the
 * system browser is used when it is present.
 */
export default defineConfig({
    testDir: "./specs",
    // Real GitHub pages. Slower and rate limited, so these are not part of
    // the unit suite and do not run on every pull request.
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 1,
    reporter: [["list"]],
    use: {
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
});
