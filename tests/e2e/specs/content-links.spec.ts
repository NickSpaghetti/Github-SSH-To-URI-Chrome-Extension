import { test, expect, FIXTURES } from "../extension";

const RATE_LIMITED = 429;
const REQUEST_SPACING_MS = 500;

/**
 * Fetches a link and reports what it answered with.
 *
 * Spaced out and retried once, because GitHub rate limits an unauthenticated
 * burst.
 * @param page The page whose request context to fetch through.
 * @param href The link to fetch.
 * @returns The status code, which may still be 429 after the retry.
 */
const statusOfAsync = async (page: import("@playwright/test").Page, href: string) => {
    await page.waitForTimeout(REQUEST_SPACING_MS);
    let status = (await page.request.get(href)).status();
    if (status === RATE_LIMITED) {
        await page.waitForTimeout(3000);
        status = (await page.request.get(href)).status();
    }
    return status;
};

/**
 * Reads every anchor this extension injected into the rendered file.
 * @param page The page to read from.
 * @returns The source text and the link built for it, one entry per anchor.
 */
const readAnchors = async (page: import("@playwright/test").Page) =>
    await page.evaluate(() =>
        Array.from(document.querySelectorAll('div[id^="LC"] a'))
            .filter((a) => a.id.startsWith("GithubTerraformSourceUrl"))
            .map((a) => ({ text: a.textContent ?? "", href: (a as HTMLAnchorElement).href })),
    );

test("links are injected on the first visit to a page", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect
        .poll(async () => (await readAnchors(page)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);

    // Assert
    const anchors = await readAnchors(page);
    expect(anchors).toHaveLength(5);
});

test("a subdirectory target links to tree and a file target links to blob", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(5);

    // Assert
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
    // Arrange
    const page = await context.newPage();
    const checked: string[] = [];

    // Act and Assert, once per link: each is fetched and checked in turn,
    // because collecting them all first would burn the rate limit before the
    // first assertion ran.
    for (const file of ["04-git-forced.tf", "01-local-paths.tf", "12-refs.tf"]) {
        await context
            .serviceWorkers()[0]
            .evaluate(async () => await chrome.storage.session.clear());
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
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/10-oci.tf`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    // Assert
    expect(await readAnchors(page)).toHaveLength(0);
});

test("host spoofing sources are never linked", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/14-security-cases.tf`, {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(6000);
    const spoofed = (await readAnchors(page))
        .filter((anchor) => new URL(anchor.href).hostname === "evil.com")
        .map((anchor) => anchor.text);

    // Assert
    expect(spoofed).toEqual([]);
});

test("a .tofu file is treated as HCL", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/15-everything.tofu`, { waitUntil: "domcontentloaded" });
    await expect
        .poll(async () => (await readAnchors(page)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);

    // Assert
    const hrefs = (await readAnchors(page)).map((a) => a.href);
    // The registry module and the git source link. The oci source does not.
    expect(hrefs.some((h) => new URL(h).hostname === "registry.terraform.io")).toBe(true);
    expect(hrefs.some((h) => h.includes("iac-module-linker-fixtures/tree/v1.0.0"))).toBe(true);
    expect(hrefs.some((h) => h.startsWith("oci://"))).toBe(false);
});

test("a .tf.json file is parsed as JSON", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/16-everything.tf.json`, {
        waitUntil: "domcontentloaded",
    });
    await expect
        .poll(
            async () =>
                ((await context
                    .serviceWorkers()[0]
                    .evaluate(
                        async () => Object.keys(await chrome.storage.session.get(null)).length,
                    )) as number) ?? 0,
            { timeout: 20_000 },
        )
        .toBeGreaterThan(0);

    // Assert
    const stored = (await context.serviceWorkers()[0].evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const entry = Object.values(all)[0] as { modules: { moduleName: string }[] } | undefined;
        return entry?.modules ?? [];
    })) as { moduleName: string }[];
    const names = stored.map((m) => m.moduleName).sort();
    expect(names).toContain("json_registry");
    expect(names).toContain("json_git");
});

for (const file of ["17-duplicate-sources.tf", "18-duplicate-sources.tf.json"]) {
    test(`two modules sharing a source each link to their own version in ${file}`, async ({
        context,
    }) => {
        // Arrange
        const page = await context.newPage();
        await context
            .serviceWorkers()[0]
            .evaluate(async () => await chrome.storage.session.clear());

        // Act
        await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
        await expect
            .poll(async () => (await readAnchors(page)).length, { timeout: 20_000 })
            .toBe(2);

        // Assert
        const versions = (await readAnchors(page)).map((a) => a.href.split("/").pop());
        expect(versions).toEqual(["0.1.0", "0.11.0"]);
    });
}
