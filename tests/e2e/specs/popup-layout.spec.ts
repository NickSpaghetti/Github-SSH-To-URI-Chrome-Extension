import { test, expect, FIXTURES } from "../extension";

/**
 * Opens a fixture and waits until the content script has stopped writing.
 *
 * The rows are seeded directly into the cache rather than read off a real
 * page: this is about layout, so it needs a long name and a long version
 * summary, not a round trip through GitHub.
 * @param context The browser context the extension is loaded in.
 * @returns The page the fixture was opened on.
 */
const openFileAsync = async (context: import("@playwright/test").BrowserContext) => {
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect
        .poll(
            async () =>
                (await context
                    .serviceWorkers()[0]
                    .evaluate(
                        async () => Object.keys(await chrome.storage.session.get(null)).length,
                    )) as number,
            { timeout: 20_000 },
        )
        .toBeGreaterThan(0);
    // The first entry lands before the page finishes rendering and the content
    // script writes again once it has, which would replace the seed.
    await page.waitForTimeout(6_000);
    return page;
};

/**
 * Replaces the cached rows with two of a known shape.
 * @param context The browser context the extension is loaded in.
 * @param name The name to give the first row, which is the one under test.
 */
const seedAsync = async (context: import("@playwright/test").BrowserContext, name: string) => {
    const modules = [
        {
            source: "terraform-aws-modules/vpc/aws",
            moduleName: name,
            sourceType: "registry",
            resolvedUrl:
                "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3",
            versionConstraint: ">= 6.0, < 7.0",
            resolvedVersion: "6.7.3",
        },
        {
            source: "oci://ghcr.io/ns/mod",
            moduleName: "oci_plain",
            sourceType: "oci",
            resolvedUrl: null,
            versionConstraint: ">= 1.2.3, < 2.0.0",
            resolvedVersion: "1.9.4",
        },
    ];
    // Only the modules are replaced. The entry keeps the commit it was written
    // under, because a different one is a miss and the next injection would
    // put the file's real modules back.
    await context.serviceWorkers()[0].evaluate(async (seeded) => {
        const all = await chrome.storage.session.get(null);
        const [key, entry] = Object.entries(all)[0] as [
            string,
            { sha: string; lastCommitDateTimeISO: string },
        ];
        await chrome.storage.session.set({ [key]: { ...entry, modules: seeded } });
    }, modules);
};

/** What the popup's list measures at, and which names did not fit on a line. */
type Layout = {
    bodyWidth: number;
    listScrollWidth: number;
    listClientWidth: number;
    wrappedCells: string[];
};

/**
 * Measures the popup's list in the browser.
 * @param popup The page the popup was opened on.
 * @returns The widths, and the opening of every name that wrapped.
 */
const readLayoutAsync = async (popup: import("@playwright/test").Page): Promise<Layout> =>
    await popup.evaluate(() => {
        const list = document.querySelector("ul.ml-list")!;
        // The name is the only line that can be arbitrarily long, so it is
        // the only one held to one line by an ellipsis.
        const names = Array.from(document.querySelectorAll("ul.ml-list .ml-name"));
        return {
            bodyWidth: document.body.getBoundingClientRect().width,
            listScrollWidth: list.scrollWidth,
            listClientWidth: list.clientWidth,
            wrappedCells: names
                .filter((name) => name.scrollHeight > name.clientHeight + 1)
                .map((name) => (name.textContent ?? "").slice(0, 40)),
        };
    });

/**
 * Opens the popup with the file still in front and waits for the list.
 * @param context The browser context the extension is loaded in.
 * @param extensionId The id chrome assigned the extension.
 * @param file The page to keep in front.
 * @returns The page the popup was opened on.
 */
const openPopupAsync = async (
    context: import("@playwright/test").BrowserContext,
    extensionId: string,
    file: import("@playwright/test").Page,
) => {
    const popup = await context.newPage();
    await popup.goto("about:blank");
    await file.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("ul.ml-list")).toBeVisible({ timeout: 15_000 });
    return popup;
};

/** Chrome will not render a popup wider than this, so past it the table scrolls. */
const CHROME_POPUP_MAX_WIDTH = 800;

test("every name stays on one line and the list does not scroll sideways", async ({
    context,
    extensionId,
}) => {
    // Arrange
    const file = await openFileAsync(context);
    await seedAsync(context, "vpc_endpoints");

    // Act
    const layout = await readLayoutAsync(await openPopupAsync(context, extensionId, file));

    // Assert
    expect(layout.wrappedCells).toEqual([]);
    expect(layout.listScrollWidth).toBeLessThanOrEqual(layout.listClientWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(CHROME_POPUP_MAX_WIDTH);
});

test("a module name too long to fit is ellipsized rather than widening the popup", async ({
    context,
    extensionId,
}) => {
    // Arrange
    const file = await openFileAsync(context);
    await seedAsync(context, `module.${"extremely_long_segment_".repeat(12)}end`);

    // Act
    const popup = await openPopupAsync(context, extensionId, file);
    const layout = await readLayoutAsync(popup);

    // Assert
    expect(layout.wrappedCells).toEqual([]);
    expect(layout.listScrollWidth).toBeLessThanOrEqual(layout.listClientWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(CHROME_POPUP_MAX_WIDTH);

    // The full name is still readable on hover.
    const name = popup.locator("ul.ml-list > li").first().locator(".ml-name").first();
    expect(await name.getAttribute("title")).toContain("extremely_long_segment_");
});
