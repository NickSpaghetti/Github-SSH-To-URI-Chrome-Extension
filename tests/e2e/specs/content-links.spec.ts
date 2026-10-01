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

test("OpenTofu sources and versions built from variables and locals are linked", async ({
    context,
}) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/19-opentofu-static-evaluation.tofu`, {
        waitUntil: "domcontentloaded",
    });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(8);

    // Assert
    // In page order. `source_is_a_local` is linked on its bare `local.vpc_git`,
    // and the three unresolved sources have no link.
    const anchors = await readAnchors(page);
    expect(anchors.map((a) => a.text)).toEqual([
        "${local.fixtures}//${local.vpc_path}?ref=${var.fixtures_ref}",
        "git::https://${local.fixtures}.git//modules/vpc?ref=${var.fixtures_ref}",
        '${var.env == "prod" ? local.fixtures : "example.com/unused"}//modules/vpc?ref=${var.fixtures_ref}',
        "${local.registry}/vpc/aws",
        "local.vpc_git",
        "hashicorp/consul/aws",
        "hashicorp/consul/aws",
        "terraform-aws-modules/vpc/aws",
    ]);
    expect(anchors[0].href).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(anchors[1].href).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(anchors[2].href).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(anchors[3].href.split("/").pop()).toBe("6.7.3");
    expect(anchors[4].href).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(anchors.slice(5).map((a) => a.href.split("/").pop())).toEqual([
        "0.1.0",
        "0.11.0",
        "6.7.3",
    ]);
});

test("OpenTofu JSON sources and versions built from variables and locals are linked", async ({
    context,
}) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/20-opentofu-static-evaluation.tofu.json`, {
        waitUntil: "domcontentloaded",
    });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(5);

    // Assert
    const anchors = await readAnchors(page);
    expect(anchors[0].href).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(anchors[1].href).toBe(`${FIXTURES}/tree/v1.0.0/modules/vpc`);
    expect(anchors.slice(2).map((a) => a.href.split("/").pop())).toEqual([
        "6.7.3",
        "0.1.0",
        "0.11.0",
    ]);
});

test("OpenTofu sources and versions in a .tf file are linked too", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());

    // Act
    await page.goto(`${FIXTURES}/blob/main/21-opentofu-static-evaluation.tf`, {
        waitUntil: "domcontentloaded",
    });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(1);

    // Assert
    const [anchor] = await readAnchors(page);
    expect(anchor.text).toBe("${local.registry}/vpc/aws");
    expect(anchor.href.split("/").pop()).toBe("6.7.3");
});

/**
 * Takes the extension's anchors off the page, leaving their text where it was.
 * @param page The page to unlink.
 */
const unlinkAsync = async (page: import("@playwright/test").Page) =>
    await page.evaluate(() => {
        for (const anchor of Array.from(
            document.querySelectorAll('a[id^="GithubTerraformSourceUrl"]'),
        )) {
            anchor.replaceWith(...Array.from(anchor.childNodes));
        }
    });

/**
 * Fires the scroll the content script relinks on.
 * @param page The page to scroll.
 */
const scrollEventAsync = async (page: import("@playwright/test").Page) =>
    await page.evaluate(() => document.dispatchEvent(new Event("scroll")));

test("a page is still linked when the cache cannot be read", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => await chrome.storage.session.clear());
    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(5);
    // Closes session storage to content scripts, as it is on a cold start
    // before the worker opens it. The commit sha is on the page by now, so
    // the next run reads the cache first.
    await worker.evaluate(
        async () =>
            await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    );
    await unlinkAsync(page);

    // Act
    await scrollEventAsync(page);

    // Assert
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 10_000 }).toBe(5);
});

test("a scroll while the cache waits for the commit header still links", async ({ context }) => {
    // Arrange
    const page = await context.newPage();
    await context.serviceWorkers()[0].evaluate(async () => await chrome.storage.session.clear());
    await page.goto(`${FIXTURES}/blob/main/04-git-forced.tf`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 20_000 }).toBe(5);
    // With no commit link the cache write waits its whole deadline, which is
    // the window a scroll has to land in.
    await page.evaluate(() => {
        for (const link of Array.from(document.querySelectorAll("a[href*='/commit/']"))) {
            link.remove();
        }
    });
    await unlinkAsync(page);
    await scrollEventAsync(page);
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 10_000 }).toBe(5);
    await unlinkAsync(page);

    // Act
    await scrollEventAsync(page);

    // Assert
    await expect.poll(async () => (await readAnchors(page)).length, { timeout: 10_000 }).toBe(5);
});

/**
 * Reads each line GitHub rendered for the file being viewed, as the writer
 * selects them.
 * @param page The page to read from.
 * @returns Each line's id and text, in page order.
 */
const readRenderedLines = async (page: import("@playwright/test").Page) =>
    await page.evaluate(() =>
        Array.from(document.querySelectorAll("div[id^='LC']")).map((line) => ({
            id: line.id,
            text: line.textContent ?? "",
        })),
    );

/**
 * @param id An element id.
 * @returns The line number an `LC{n}` id names, or null when the id is not one.
 */
const lineNumberOf = (id: string): number | null => {
    const digits = id.slice("LC".length);
    const number = Number(digits);
    return id.startsWith("LC") && digits !== "" && Number.isInteger(number) && number > 0
        ? number
        : null;
};

// The GitHub writer relies on GitHub numbering each rendered line `LC{n}` and
// holding that line of the file in it. GitHub renders an empty line as "\n",
// which holds no source. These check that against github.com, so a change on
// GitHub's side fails here with the assumption it broke.
for (const file of [
    "01-local-paths.tf",
    "19-opentofu-static-evaluation.tofu",
    "16-everything.tf.json",
]) {
    test(`each LC-numbered line GitHub renders for ${file} holds that line of the file`, async ({
        context,
    }) => {
        // Arrange
        const page = await context.newPage();
        const raw = await (
            await page.request.get(
                `https://raw.githubusercontent.com/NickSpaghetti/iac-module-linker-fixtures/main/${file}`,
            )
        ).text();
        const fileLines = raw.split("\n");

        // Act
        await page.goto(`${FIXTURES}/blob/main/${file}`, { waitUntil: "domcontentloaded" });
        await expect
            .poll(async () => (await readRenderedLines(page)).length, { timeout: 20_000 })
            .toBeGreaterThan(0);
        const rendered = await readRenderedLines(page);

        // Assert
        expect(
            rendered.map((line) => lineNumberOf(line.id)),
            "the lines are div elements numbered LC1, LC2, ... in order",
        ).toEqual(rendered.map((_, index) => index + 1));
        expect(
            rendered
                .filter(
                    (line) =>
                        (line.text === "\n" ? "" : line.text) !==
                        fileLines[(lineNumberOf(line.id) ?? 0) - 1],
                )
                .map((line) => ({
                    id: line.id,
                    rendered: line.text,
                    file: fileLines[(lineNumberOf(line.id) ?? 0) - 1],
                })),
            'each line\'s text is that line of the file, character for character, an empty one as "\\n"',
        ).toEqual([]);
    });
}
