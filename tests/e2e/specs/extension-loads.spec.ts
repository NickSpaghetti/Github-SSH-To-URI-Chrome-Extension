import { test, expect } from "../extension";

test("the extension loads and registers a service worker", async ({ extensionId }) => {
    expect(extensionId).toMatch(/^[a-z]{32}$/);
});

test("the popup page renders", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(page.locator("body")).toBeVisible();
});
