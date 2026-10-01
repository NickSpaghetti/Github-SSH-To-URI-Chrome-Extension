import { defineConfig } from "@playwright/test";

/**
 * Extensions only load in a persistent context with a full Chromium build.
 * The headless shell Playwright ships by default cannot load them, so the
 * system browser is used when it is present.
 *
 * GitHub and GitLab run side by side, one worker each. Within a host the
 * specs stay serial, because GitHub rate limits an unauthenticated burst.
 */
export default defineConfig({
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 2,
    reporter: [["list"]],
    use: {
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "e2e-github",
            testDir: "./specs",
            testIgnore: "gitlab.spec.ts",
            retries: 1,
            workers: 1,
        },
        {
            name: "e2e-gitlab",
            testDir: "./specs",
            testMatch: "gitlab.spec.ts",
            retries: 1,
            workers: 1,
        },
        {
            name: "benchmark",
            testDir: "./benchmarks",
            testMatch: "**/*.bench.ts",
            retries: 0,
            timeout: 180_000,
            workers: 1,
        },
    ],
});
