import { test, expect } from "../extension";

/** Chrome builds an extension id out of 32 lowercase letters. */
const ID_LENGTH = 32;

test("the extension loads and registers a service worker", async ({ extensionId }) => {
    // Act
    const stray = [...extensionId].filter((letter) => letter < "a" || letter > "z");

    // Assert
    expect(extensionId).toHaveLength(ID_LENGTH);
    expect(stray).toEqual([]);
});

test("the popup page renders", async ({ context, extensionId }) => {
    // Arrange
    const page = await context.newPage();

    // Act
    await page.goto(`chrome-extension://${extensionId}/index.html`);

    // Assert
    await expect(page.locator("body")).toBeVisible();
});
