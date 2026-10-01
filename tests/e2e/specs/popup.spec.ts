import { test, expect, FIXTURES } from "../extension";

const LIST = "ul.ml-list";
const ROW = "ul.ml-list > li";
const RESOLVES_TO = "resolves to";

/**
 * Loads a fixture and waits for the content script to fill the cache.
 *
 * The popup renders from that cache, so there is nothing to show until the
 * content script has written it.
 * @param context The browser context the extension is loaded in.
 * @param file The fixture file to open.
 * @returns The page the fixture was opened on.
 */
const primeCacheAsync = async (
    context: import("@playwright/test").BrowserContext,
    file: string,
) => {
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());
    const page = await context.newPage();
    await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
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
    return page;
};

/**
 * Opens the popup with the file still in front.
 *
 * A real popup is a panel and leaves the file in front, so the extension asks
 * the active tab which file to show. Opening the popup as a tab would make it
 * the active tab and it would ask about itself.
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
    return popup;
};

test("the popup lists the modules found on the page", async ({ context, extensionId }) => {
    // Arrange
    const page = await primeCacheAsync(context, "04-git-forced.tf");

    // Act
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });

    // Assert
    const rows = popup.locator(ROW);
    await expect.poll(async () => await rows.count(), { timeout: 15_000 }).toBeGreaterThan(0);

    const text = await popup.locator(LIST).innerText();
    expect(text).toContain("git_https_subdir_ref");
    // The label names the vcs and the transport, not how the source was spelled.
    expect(text).toContain("git:https");
});

test("the popup labels a source it cannot link", async ({ context, extensionId }) => {
    // Arrange
    const page = await primeCacheAsync(context, "10-oci.tf");

    // Act
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });

    // Assert
    const text = await popup.locator(LIST).innerText();
    expect(text).toContain("oci_plain");
    expect(text).toContain("oci");

    // Labeled, but with no link, because oci is not an http address. The name
    // renders as a span rather than an anchor.
    expect(await popup.locator(`${LIST} a`).count()).toBe(0);
    await expect(popup.locator("span.ml-name", { hasText: "oci_plain" })).toBeVisible();
});

test("the popup shows what a constraint resolved to", async ({ context, extensionId }) => {
    // Arrange
    const page = await primeCacheAsync(context, "02-registry-public.tf");

    // Act
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });

    // Assert
    const row = popup.locator(ROW, { hasText: "registry_constraint" });
    await expect(row.locator(".ml-name")).toHaveText("registry_constraint");

    // The sub line reads "registry, >= 6.0, < 7.0" and gains " allows <version>"
    // only when a newer version is out. Which 6.x is newest is whatever the
    // registry publishes today, so only the major is asserted.
    const detail = await row.locator(".ml-sub").innerText();
    expect(detail.startsWith("registry, >= 6.0, < 7.0")).toBe(true);
    if (detail.includes(RESOLVES_TO)) {
        const offered = detail.split(RESOLVES_TO)[1].trim();
        expect(offered.startsWith("6.")).toBe(true);
    }
});

test("an OpenTofu pin is verified against its own registry", async ({ context, extensionId }) => {
    // Arrange
    const page = await primeCacheAsync(context, "03-registry-host.tf");

    // Act
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });

    // Assert
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
    // Arrange
    const page = await primeCacheAsync(context, "03-registry-host.tf");

    // Act
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });
    const link = popup.getByRole("link", { name: "opentofu_registry_range", exact: true });
    const href = (await link.getAttribute("href")) ?? "";

    // Assert
    // Which 5.x is newest is whatever the registry publishes today. latest
    // would mean the range was never resolved at all.
    const version = href.split("/").pop() ?? "";
    expect(version.startsWith("5.")).toBe(true);
});

test("typing in the search narrows the list", async ({ context, extensionId }) => {
    // Arrange
    const page = await primeCacheAsync(context, "04-git-forced.tf");
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });
    const all = await popup.locator(ROW).count();
    expect(all).toBeGreaterThan(1);
    const first = await popup.locator(`${ROW} .ml-name`).first().innerText();

    // Act
    await popup.fill("#ml-q", first);

    // Assert
    await expect.poll(async () => await popup.locator(ROW).count()).toBe(1);
    await expect(popup.locator(".ml-count")).toHaveText(`1 of ${all}`);

    // Act
    await popup.fill("#ml-q", "no-module-is-called-this");

    // Assert
    await expect(popup.locator(LIST)).toHaveCount(0);
    await expect(popup.locator(".ml-empty")).toContainText("No module matches");
});

test("the copy button puts the module name on the clipboard", async ({ context, extensionId }) => {
    // Arrange
    const page = await primeCacheAsync(context, "04-git-forced.tf");
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });
    const row = popup.locator(ROW).first();
    const name = await row.locator(".ml-name").innerText();

    // Act
    await row.getByRole("button", { name: "Copy name" }).click();

    // Assert
    // The status line is the evidence. It is only set after `writeText`
    // resolves, and reading the clipboard back would need `clipboardRead`,
    // which this extension does not ask for.
    await expect(popup.locator(".ml-live")).toHaveText(`Copied ${name}`);
});

/**
 * Seeded rather than read off a real page, because whether a module is behind
 * depends on what the registry published today. An earlier version of this
 * test walked the buttons on a live fixture and skipped every "Copy name",
 * which meant it passed without asserting anything on a file whose constraint
 * never earns a suggestion.
 */
test("a module behind the newest version is offered a bumped constraint", async ({
    context,
    extensionId,
}) => {
    // Arrange
    await context.serviceWorkers()[0].evaluate(
        async (key) =>
            await chrome.storage.session.set({
                [key]: {
                    sha: "seeded",
                    lastCommitDateTimeISO: "2026-01-01T00:00:00.000Z",
                    modules: [
                        {
                            source: "terraform-aws-modules/vpc/aws",
                            moduleName: "behind",
                            sourceType: "registry",
                            resolvedUrl: "https://registry.terraform.io/x",
                            versionConstraint: "~> 6.0",
                            resolvedVersion: "6.7.3",
                        },
                        {
                            source: "terraform-aws-modules/acm/aws",
                            moduleName: "current",
                            sourceType: "registry",
                            resolvedUrl: "https://registry.terraform.io/y",
                            versionConstraint: "~> 6.7",
                            resolvedVersion: "6.7.3",
                        },
                    ],
                },
            }),
        `modules:${extensionId}:/index.html`,
    );

    // Act
    const popup = await context.newPage();
    await popup.goto("about:blank");
    await popup.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });

    // Assert
    const behind = popup.locator(ROW, { hasText: "behind" });
    const current = popup.locator(ROW, { hasText: "current" });

    // The constraint's precision is kept: `~> 6.0` against 6.7.3 offers
    // `~> 6.7`, not `~> 6.7.3`.
    const offer = behind.getByRole("button", { name: "Copy ~> 6.7", exact: true });
    await expect(offer).toBeVisible();
    await expect(behind.locator(".ml-sub")).toHaveText("registry, ~> 6.0 resolves to 6.7.3");

    // Already current, so there is nothing to offer and only one button.
    await expect(current.getByRole("button")).toHaveCount(1);
    await expect(current.locator(".ml-sub")).toHaveText("registry, ~> 6.7");

    // Act
    await offer.click();

    // Assert
    await expect(popup.locator(".ml-live")).toHaveText("Copied ~> 6.7");
});

test("the popup keeps OpenTofu modules it cannot resolve, unlinked", async ({
    context,
    extensionId,
}) => {
    // Arrange
    const page = await primeCacheAsync(context, "19-opentofu-static-evaluation.tofu");

    // Act
    const popup = await openPopupAsync(context, extensionId, page);
    await expect(popup.locator(LIST)).toBeVisible({ timeout: 15_000 });

    // Assert
    await expect(popup.locator(ROW)).toHaveCount(11);
    for (const name of ["unresolved_variable", "unresolved_function", "unresolved_resource"]) {
        await expect(popup.locator("span.ml-name", { hasText: name })).toBeVisible();
    }
    // A source that is a bare local has nothing to anchor on the page, but the
    // popup still links it.
    await expect(popup.locator("a.ml-name", { hasText: "source_is_a_local" })).toBeVisible();
});
