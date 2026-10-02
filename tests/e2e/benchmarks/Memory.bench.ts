import { test, expect, chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { BrowserCdp } from "./BrowserCdp";
import { grewMost, residentByExtensionPid } from "./WorkerMemory";
import { record } from "./Recorder";
import baseline from "./baseline.json";

const DIST = path.resolve(__dirname, "../../..", process.env.IAC_BUILD ?? "dist");
const DEBUG_PORT = 9333;
const FIXTURE =
    "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/benchmarks/scrolling/large.tf";
const STARTUP_MS = 4_000;
const WORK_MS = 12_000;

const findBrowser = (): string | undefined =>
    ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chrome"].find((candidate) =>
        fs.existsSync(candidate),
    );

test("parsing costs the worker tens of megabytes, which its heap does not show", async () => {
    // Arrange
    const context = await chromium.launchPersistentContext("", {
        executablePath: findBrowser(),
        headless: false,
        args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });

    try {
        await new Promise((resolve) => setTimeout(resolve, STARTUP_MS));
        const before = residentByExtensionPid();

        // Act
        const page = await context.newPage();
        await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(WORK_MS);
        const grown = grewMost(before, residentByExtensionPid());

        // Assert
        expect(grown, "an extension renderer must have grown").not.toBeNull();

        const residentMb = Math.round(grown!.deltaKb / 1024);
        console.log(
            `BENCH worker resident +${residentMb}MB (${Math.round(grown!.wasKb / 1024)} to ${Math.round(grown!.nowKb / 1024)}MB)`,
        );
        record("worker", { residentMb });

        expect(residentMb).toBeLessThan(baseline.worker.residentMb * baseline.ceiling);
        expect(residentMb).toBeGreaterThan(1);
        await context.close();
    } catch (error) {
        await context.close();
        throw error;
    }
});

test("the js heap reports almost none of what the parser costs", async () => {
    // Arrange
    const context = await chromium.launchPersistentContext("", {
        executablePath: findBrowser(),
        headless: false,
        args: [
            `--disable-extensions-except=${DIST}`,
            `--load-extension=${DIST}`,
            `--remote-debugging-port=${DEBUG_PORT}`,
        ],
    });

    try {
        const cdp = await BrowserCdp.connectAsync(DEBUG_PORT);
        const worker = (await cdp.targetsAsync()).find(
            (target) => target.type === "service_worker",
        );
        expect(worker, "the extension's service worker must be running").toBeDefined();
        const session = await cdp.attachAsync(worker!.targetId);

        // Act
        const page = await context.newPage();
        await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(WORK_MS);
        const { usedSize } = await cdp.sendAsync<{ usedSize: number }>(
            "Runtime.getHeapUsage",
            {},
            session,
        );
        const heapMb = usedSize / 1024 / 1024;
        console.log(`BENCH worker js heap after a parse: ${Math.round(usedSize / 1024)}KB`);
        record("worker", { jsHeapKb: Math.round(usedSize / 1024) });

        // Assert
        expect(heapMb).toBeLessThan(baseline.worker.residentMb / 4);
        cdp.close();
        await context.close();
    } catch (error) {
        await context.close();
        throw error;
    }
});
