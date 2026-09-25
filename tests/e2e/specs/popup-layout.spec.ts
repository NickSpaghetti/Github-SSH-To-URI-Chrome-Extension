import { test, expect } from "../extension";

/**
 * Seeded directly into the cache rather than read off a real page: this is
 * about layout, so it needs a long name and a long version summary, not a
 * round trip through GitHub.
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
    await context
        .serviceWorkers()[0]
        .evaluate(async (seeded) => await chrome.storage.local.set({ MODULES: seeded }), modules);
};

type Layout = {
    bodyWidth: number;
    tableScrollWidth: number;
    containerClientWidth: number;
    wrappedCells: string[];
};

const readLayoutAsync = async (popup: import("@playwright/test").Page): Promise<Layout> =>
    await popup.evaluate(() => {
        const cells = Array.from(document.querySelectorAll("tbody th, tbody td"));
        return {
            bodyWidth: document.body.getBoundingClientRect().width,
            tableScrollWidth: document.querySelector("table")!.scrollWidth,
            containerClientWidth: document.querySelector(".MuiTableContainer-root")!.clientWidth,
            // A cell taller than its box has wrapped onto a second line.
            wrappedCells: cells
                .filter((cell) => cell.scrollHeight > cell.clientHeight + 1)
                .map((cell) => (cell.textContent ?? "").slice(0, 40)),
        };
    });

const openPopupAsync = async (
    context: import("@playwright/test").BrowserContext,
    extensionId: string,
) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: 15_000 });
    return popup;
};

/** Chrome will not render a popup wider than this, so past it the table scrolls. */
const CHROME_POPUP_MAX_WIDTH = 800;

test("every cell stays on one line and the table does not scroll sideways", async ({
    context,
    extensionId,
}) => {
    await seedAsync(context, "vpc_endpoints");
    const layout = await readLayoutAsync(await openPopupAsync(context, extensionId));

    expect(layout.wrappedCells).toEqual([]);
    expect(layout.tableScrollWidth).toBeLessThanOrEqual(layout.containerClientWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(CHROME_POPUP_MAX_WIDTH);
});

test("a module name too long to fit is ellipsized rather than widening the popup", async ({
    context,
    extensionId,
}) => {
    await seedAsync(context, `module.${"extremely_long_segment_".repeat(12)}end`);
    const popup = await openPopupAsync(context, extensionId);
    const layout = await readLayoutAsync(popup);

    expect(layout.wrappedCells).toEqual([]);
    expect(layout.tableScrollWidth).toBeLessThanOrEqual(layout.containerClientWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(CHROME_POPUP_MAX_WIDTH);

    // The full name is still readable on hover.
    const name = popup.locator("tbody tr").first().locator("th").first();
    expect(await name.getAttribute("title")).toContain("extremely_long_segment_");
});
