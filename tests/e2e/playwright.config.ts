import { defineConfig } from "@playwright/test";

/**
 * Extensions only load in a persistent context with a full Chromium build.
 * The headless shell Playwright ships by default cannot load them, so the
 * system browser is used when it is present.
 */
export default defineConfig({
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "e2e", testDir: "./specs", retries: 1 },
        {
            name: "benchmark",
            testDir: "./benchmarks",
            testMatch: "**/*.bench.ts",
            retries: 0,
            timeout: 180_000,
        },
    ],
});
