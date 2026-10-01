import { Page } from "@playwright/test";
import { FIXTURES, GITLAB_FIXTURES } from "../extension";

/** The shape of a fixture file, which a benchmark asserts so a changed file is noticed. */
export type Fingerprint = { lines: number; bytes: number };

/** What a benchmark needs to know about the host whose pages it measures. */
export type BenchHost = {
    /** The host, as a benchmark's output names it. */
    readonly name: string;
    /**
     * Builds the url of a fixture file's page.
     * @param path The file's path in the fixture repository.
     * @returns The page's url.
     */
    readonly fileUrl: (path: string) => string;
    /** Selects the anchors the extension injects on this host's pages. */
    readonly anchor: string;
    /** Whether the extension's optional access to this host has to be granted. */
    readonly grantOptionalHosts: boolean;
    /**
     * Scrolls the code one viewport down.
     * @param page The page to scroll.
     */
    readonly scrollStep: (page: Page) => Promise<void>;
    /**
     * Scrolls the code back to its first line.
     * @param page The page to scroll.
     */
    readonly scrollToTop: (page: Page) => Promise<void>;
    /** Whether lines stay rendered once scrolled past, so scrolling back over them costs nothing. */
    readonly keepsRenderedLines: boolean;
    /**
     * Reads the shape of the file a page shows.
     * @param page The page to read from.
     * @returns The file's line count and size in UTF-8 bytes.
     */
    readonly fingerprint: (page: Page) => Promise<Fingerprint>;
    /** The links clicked, in order, to move from `benchmarks/parse/small.tf` to `benchmarks/parse/large.tf` without a reload. */
    readonly browseToLargeParse: readonly string[];
};

/** github.com. */
export const GITHUB: BenchHost = {
    name: "github",
    fileUrl: (path) => `${FIXTURES}/blob/main/${path}`,
    anchor: 'a[id^="GithubTerraformSourceUrl-"]',
    grantOptionalHosts: false,
    scrollStep: async (page) => {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    },
    scrollToTop: async (page) => {
        await page.evaluate(() => window.scrollTo(0, 0));
    },
    keepsRenderedLines: false,
    // GitHub keeps the whole file in a read only textarea, without its final newline.
    fingerprint: async (page) =>
        await page.evaluate(() => {
            const area = document.getElementById(
                "read-only-cursor-text-area",
            ) as HTMLTextAreaElement | null;
            if (area === null) {
                return { lines: 0, bytes: 0 };
            }
            return {
                lines: area.value.split("\n").length,
                bytes: new TextEncoder().encode(area.value).length,
            };
        }),
    browseToLargeParse: [
        'a[href$="/tree/main/benchmarks"]',
        'a[href$="/benchmarks/parse"]',
        'a[href*="parse/large.tf"]',
    ],
};

// GitLab's code view scrolls inside its own panel, not the window.
const GITLAB_SCROLLER = ".js-static-panel-inner";
const GITLAB_BLOB_ROUTE = "/-/blob/";
const GITLAB_RAW_ROUTE = "/-/raw/";

/** gitlab.com, with the extension's optional access to it granted. */
export const GITLAB: BenchHost = {
    name: "gitlab",
    fileUrl: (path) => `${GITLAB_FIXTURES}${GITLAB_BLOB_ROUTE}main/${path}`,
    anchor: 'a[id^="GitlabTerraformSourceUrl-"]',
    grantOptionalHosts: true,
    scrollStep: async (page) => {
        await page.evaluate((selector) => {
            const scroller = document.querySelector(selector);
            scroller?.scrollBy(0, scroller.clientHeight);
        }, GITLAB_SCROLLER);
    },
    scrollToTop: async (page) => {
        await page.evaluate((selector) => {
            document.querySelector(selector)?.scrollTo(0, 0);
        }, GITLAB_SCROLLER);
    },
    // GitLab renders a file in chunks of 70 lines and never removes one.
    keepsRenderedLines: true,
    // GitLab never holds the whole file on the page, so it is read the way the
    // extension reads it, and measured as GitHub's textarea holds it.
    fingerprint: async (page) => {
        const raw = page.url().split(GITLAB_BLOB_ROUTE).join(GITLAB_RAW_ROUTE);
        const text = await (await page.request.get(raw)).text();
        const held = text.endsWith("\n") ? text.slice(0, -1) : text;
        return { lines: held.split("\n").length, bytes: Buffer.byteLength(held, "utf8") };
    },
    browseToLargeParse: [
        'a[href$="/-/tree/main/benchmarks"]',
        'a[href$="/-/tree/main/benchmarks/parse"]',
        'a[href*="parse/large.tf"]',
    ],
};
