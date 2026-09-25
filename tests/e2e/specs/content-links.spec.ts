import { test, expect, FIXTURES } from "../extension";

const RATE_LIMITED = 429;
const REQUEST_SPACING_MS = 500;

/** Spaced out and retried once, because GitHub rate limits an unauthenticated burst. */
const statusOfAsync = async (page: import("@playwright/test").Page, href: string) => {
    await page.waitForTimeout(REQUEST_SPACING_MS);
    let status = (await page.request.get(href)).status();
    if (status === RATE_LIMITED) {
        await page.waitForTimeout(3000);
        status = (await page.request.get(href)).status();
    }
    return status;
};

const readAnchors = async (page: import("@playwright/test").Page) =>
    await page.evaluate(() =>
        Array.from(document.querySelectorAll('div[id^="LC"] a'))
            .filter((a) => a.id.startsWith("GithubTerraformSourceUrl"))
            .map((a) => ({ text: a.textContent ?? "", href: (a as HTMLAnchorElement).href })),
    );

test("links are injected on the first visit to a page", async ({ context }) => {
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());

    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect
        .poll(async () => (await readAnchors(page)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);

    const anchors = await readAnchors(page);
    expect(anchors).toHaveLength(5);
});

test("a subdirectory target links to tree and a file target links to blob", async ({ context }) => {
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(5);

    const byText = Object.fromEntries((await readAnchors(page)).map((a) => [a.text, a.href]));
    expect(
        byText[
            "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0"
        ],
    ).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(
        byText[
            "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc/main.tf?ref=v1.0.0"
        ],
    ).toBe(`${FIXTURES}/blob/v1.0.0/modules/vpc/main.tf`);
});

test("every generated link actually resolves", async ({ context }) => {
    const page = await context.newPage();
    const checked: string[] = [];

    for (const file of ["04-git-forced.tf", "01-local-paths.tf", "12-refs.tf"]) {
        await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
        await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
        await expect
            .poll(async () => (await readAnchors(page)).length, { timeout: 20_000 })
            .toBeGreaterThan(0);

        for (const anchor of await readAnchors(page)) {
            // Only links into the fixture repository are ours to assert on.
            // example.com is a documentation host with nothing behind it.
            if (!anchor.href.startsWith(FIXTURES) || checked.includes(anchor.href)) {
                continue;
            }
            checked.push(anchor.href);
            const status = await statusOfAsync(page, anchor.href);
            if (status === RATE_LIMITED) {
                // GitHub throttled us. That says nothing about the link.
                continue;
            }
            expect(status, `${anchor.href} from ${file}`).toBeLessThan(400);
        }
    }
    expect(checked.length).toBeGreaterThan(5);
});

test("a source with no browsable target is left unlinked", async ({ context }) => {
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
    await page.goto(`${FIXTURES}/blob/main/10-oci.tf`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    expect(await readAnchors(page)).toHaveLength(0);
});

test("host spoofing sources are never linked", async ({ context }) => {
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
    await page.goto(`${FIXTURES}/blob/main/14-security-cases.tf`, {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(6000);

    for (const anchor of await readAnchors(page)) {
        expect(new URL(anchor.href).hostname, anchor.text).not.toBe("evil.com");
    }
});

test("a .tofu file is treated as HCL", async ({ context }) => {
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
    await page.goto(`${FIXTURES}/blob/main/15-everything.tofu`, { waitUntil: "domcontentloaded" });
    await expect
        .poll(async () => (await readAnchors(page)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);

    const hrefs = (await readAnchors(page)).map((a) => a.href);
    // The registry module and the git source link. The oci source does not.
    expect(hrefs.some((h) => h.includes("registry.terraform.io"))).toBe(true);
    expect(hrefs.some((h) => h.includes("iac-module-linker-fixtures/tree/v1.0.0"))).toBe(true);
    expect(hrefs.some((h) => h.startsWith("oci://"))).toBe(false);
});

test("a .tf.json file is parsed as JSON", async ({ context }) => {
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
    await page.goto(`${FIXTURES}/blob/main/16-everything.tf.json`, {
        waitUntil: "domcontentloaded",
    });

    await expect
        .poll(
            async () =>
                (
                    (await context
                        .serviceWorkers()[0]
                        .evaluate(async () => await chrome.storage.local.get("MODULES"))) as {
                        MODULES?: unknown[];
                    }
                ).MODULES?.length ?? 0,
            { timeout: 20_000 },
        )
        .toBeGreaterThan(0);

    const stored = (await context
        .serviceWorkers()[0]
        .evaluate(async () => await chrome.storage.local.get("MODULES"))) as {
        MODULES: { moduleName: string; resolvedUrl: string | null }[];
    };
    const names = stored.MODULES.map((m) => m.moduleName).sort();
    expect(names).toContain("json_registry");
    expect(names).toContain("json_git");
});
