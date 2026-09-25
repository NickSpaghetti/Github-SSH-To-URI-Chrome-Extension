import { test, expect, FIXTURES } from "../extension";

/** The popup renders from the cache the content script fills in. */
const primeCacheAsync = async (
    context: import("@playwright/test").BrowserContext,
    file: string,
) => {
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.local.clear());
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
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
    return page;
};

test("the popup lists the modules found on the page", async ({ context, extensionId }) => {
    await primeCacheAsync(context, "04-git-forced.tf");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: 15_000 });

    const rows = popup.locator("tbody tr");
    await expect.poll(async () => await rows.count(), { timeout: 15_000 }).toBeGreaterThan(0);

    const text = await popup.locator("tbody").innerText();
    expect(text).toContain("git_https_subdir_ref");
    // The label names the vcs and the transport, not how the source was spelled.
    expect(text).toContain("git:https");
});

test("the popup labels a source it cannot link", async ({ context, extensionId }) => {
    await primeCacheAsync(context, "10-oci.tf");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: 15_000 });

    const text = await popup.locator("tbody").innerText();
    expect(text).toContain("oci_plain");
    expect(text).toContain("oci");

    // Labeled, but with no link, because oci is not an http address.
    const links = popup.locator("tbody a");
    expect(await links.count()).toBe(0);
});

test("the popup shows what a constraint resolved to", async ({ context, extensionId }) => {
    await primeCacheAsync(context, "02-registry-public.tf");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: 15_000 });

    // The cells render as th, not td: TableCell component="th".
    const row = popup.locator("tbody tr", { hasText: "registry_constraint" });
    const cells = (await row.innerText()).split("\t");
    expect(cells[0]).toBe("registry_constraint");

    // The resolved version is whatever the registry publishes today, so only
    // its major is asserted.
    const [constraint, resolved] = cells[2].split("→").map((part) => part.trim());
    expect(constraint).toBe(">= 6.0, < 7.0");
    expect(resolved.startsWith("6.")).toBe(true);
});

test("an OpenTofu pin is verified against its own registry", async ({ context, extensionId }) => {
    await primeCacheAsync(context, "03-registry-host.tf");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: 15_000 });

    // latest here would mean the lookup never reached registry.opentofu.org,
    // which is what a missing host permission looks like. Exact, because
    // opentofu_registry_range would otherwise match too.
    const link = popup.getByRole("link", { name: "opentofu_registry", exact: true });
    await expect(link).toHaveAttribute(
        "href",
        "https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/6.7.3",
    );
});

test("an OpenTofu range is resolved against its own registry", async ({ context, extensionId }) => {
    await primeCacheAsync(context, "03-registry-host.tf");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator("table")).toBeVisible({ timeout: 15_000 });

    const link = popup.getByRole("link", { name: "opentofu_registry_range", exact: true });
    const href = (await link.getAttribute("href")) ?? "";

    // Which 5.x is newest is whatever the registry publishes today. latest
    // would mean the range was never resolved at all.
    const version = href.split("/").pop() ?? "";
    expect(version.startsWith("5.")).toBe(true);
});
