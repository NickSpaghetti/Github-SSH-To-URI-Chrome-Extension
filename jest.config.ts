import type { Config } from "jest";
// Sync object
const config: Config = {
    verbose: true,
    // Playwright drives a real browser and has its own runner.
    testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
};
export default config;
