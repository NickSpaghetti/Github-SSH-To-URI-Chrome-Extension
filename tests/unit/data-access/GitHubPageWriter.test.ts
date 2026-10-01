/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://github.com/owner/repo/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitHubPageWriter } from "../../../src/data-access/GitHubPageWriter";
import { SourceLinks } from "../../../src/types/SourceLinks";

const SOURCE = "hashicorp/consul/aws";
const URL = "https://registry.terraform.io/modules/hashicorp/consul/aws/0.1.0";

const writer = new GitHubPageWriter();

/**
 * Builds links that match on source alone.
 * @param entries Each source and the url it opens.
 * @returns The links.
 */
const bySource = (entries: [string, string][]): SourceLinks => ({
    atLine: new Map(),
    bySource: new Map(entries),
});

/**
 * Builds a rendered line the way GitHub tokenizes it.
 * @param id The line's id.
 * @param attributes Each attribute name and string value on the line.
 * @returns The line's html.
 */
const line = (id: string, attributes: [string, string][]): string =>
    `<div id="${id}" inert>${attributes
        .map(
            ([name, value]) =>
                `<span class="pl-v">${name} = </span>` +
                `<span class="pl-s"><span class="pl-pds">"</span>${value}<span class="pl-pds">"</span></span>`,
        )
        .join(" ")}</div>`;

/**
 * Renders lines into a page with GitHub's line numbers and code lines.
 * @param lines The html of each line.
 */
const render = (...lines: string[]): void => {
    document.body.innerHTML =
        `<div class="react-line-numbers"></div>` +
        `<div class="react-code-lines">${lines.join("")}</div>`;
};

const anchors = (): HTMLAnchorElement[] => Array.from(document.querySelectorAll("a"));

describe("Given a page with a module source", () => {
    describe("When the source has a link", () => {
        test("Then I expect it replaced by an anchor to the url", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(bySource([[SOURCE, URL]]));

            // Assert
            const [anchor] = anchors();
            expect<string>(anchor.href).toBe(URL);
            expect<string>(anchor.textContent ?? "").toBe(SOURCE);
            expect<string>(anchor.id).toBe("GithubTerraformSourceUrl-LC2-0");
        });

        test("Then I expect the inert attribute removed from the line", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(bySource([[SOURCE, URL]]));

            // Assert
            expect<boolean>(document.getElementById("LC2")?.hasAttribute("inert") ?? true).toBe(
                false,
            );
        });

        test("Then I expect the code lines raised above the line numbers", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(bySource([[SOURCE, URL]]));

            // Assert
            const codeLines = document.querySelector(".react-code-lines") as HTMLElement;
            expect<string>(codeLines.style.zIndex).toBe("1");
        });
    });

    describe("When the source has no link", () => {
        test("Then I expect no anchor", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(bySource([]));

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the link is not an http url", () => {
        test("Then I expect no anchor", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(bySource([[SOURCE, "javascript:alert(1)"]]));

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the sources are linked twice", () => {
        test("Then I expect one anchor", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));
            const links = bySource([[SOURCE, URL]]);

            // Act
            writer.linkSources(links);
            writer.linkSources(links);

            // Assert
            expect<number>(anchors().length).toBe(1);
        });
    });
});

describe("Given a page with a string that matches a source", () => {
    describe("When the string is not the value of a source attribute", () => {
        test("Then I expect it left as text", () => {
            // Arrange
            render(line("LC2", [["description", SOURCE]]));

            // Act
            writer.linkSources(bySource([[SOURCE, URL]]));

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });
});

describe("Given a line with two sources", () => {
    describe("When both are linked", () => {
        test("Then I expect each anchor to have its own id", () => {
            // Arrange
            const other = "terraform-aws-modules/vpc/aws";
            render(
                line("LC2", [
                    ["source", SOURCE],
                    ["source", other],
                ]),
            );

            // Act
            writer.linkSources(
                bySource([
                    [SOURCE, URL],
                    [other, "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws"],
                ]),
            );

            // Assert
            expect<string[]>(anchors().map((anchor) => anchor.id)).toEqual([
                "GithubTerraformSourceUrl-LC2-0",
                "GithubTerraformSourceUrl-LC2-1",
            ]);
        });
    });
});

describe("Given two lines with the same source", () => {
    describe("When each line has its own url", () => {
        test("Then I expect each anchor to open its line's url", () => {
            // Arrange
            render(line("LC12", [["source", SOURCE]]), line("LC19", [["source", SOURCE]]));
            const links: SourceLinks = {
                atLine: new Map([
                    [12, new Map([[SOURCE, `${URL}/0.1.0`]])],
                    [19, new Map([[SOURCE, `${URL}/0.12.0`]])],
                ]),
                bySource: new Map([[SOURCE, `${URL}/0.1.0`]]),
            };

            // Act
            writer.linkSources(links);

            // Assert
            expect<string[]>(anchors().map((anchor) => anchor.href)).toEqual([
                `${URL}/0.1.0`,
                `${URL}/0.12.0`,
            ]);
        });
    });

    describe("When only one line has a url of its own", () => {
        test("Then I expect the other to open the url by source", () => {
            // Arrange
            render(line("LC12", [["source", SOURCE]]), line("LC19", [["source", SOURCE]]));
            const links: SourceLinks = {
                atLine: new Map([[19, new Map([[SOURCE, `${URL}/0.12.0`]])]]),
                bySource: new Map([[SOURCE, `${URL}/0.1.0`]]),
            };

            // Act
            writer.linkSources(links);

            // Assert
            expect<string[]>(anchors().map((anchor) => anchor.href)).toEqual([
                `${URL}/0.1.0`,
                `${URL}/0.12.0`,
            ]);
        });
    });
});

describe("Given a source written as a template", () => {
    describe("When it is linked", () => {
        test("Then I expect one anchor around everything between the quotes, text unchanged", () => {
            // Arrange
            document.body.innerHTML =
                `<div class="react-code-lines"><div id="LC7">` +
                `<span class="pl-v">source = </span>` +
                `<span class="pl-s"><span class="pl-pds">"</span>` +
                `<span class="pl-pse">\${</span><span class="pl-s1">local.repo</span>` +
                `<span class="pl-pse">}</span>//vpc<span class="pl-pds">"</span></span>` +
                `</div></div>`;
            const written = "${local.repo}//vpc";

            // Act
            writer.linkSources({
                atLine: new Map([[7, new Map([[written, URL]])]]),
                bySource: new Map(),
            });

            // Assert
            const literal = document.querySelector("span.pl-s") as HTMLElement;
            const [anchor] = anchors();
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchor.textContent ?? "").toBe(written);
            expect<string>(literal.textContent ?? "").toBe(`"${written}"`);
            expect<string[]>(Array.from(literal.children).map((child) => child.tagName)).toEqual([
                "SPAN",
                "A",
                "SPAN",
            ]);
        });
    });
});

describe("Given a template with a string inside its interpolation", () => {
    describe("When it is linked", () => {
        test("Then I expect it matched by its inner quotes as written", () => {
            // Arrange
            const inner = (text: string) =>
                `<span class="pl-s"><span class="pl-pds">"</span>${text}<span class="pl-pds">"</span></span>`;
            document.body.innerHTML =
                `<div class="react-code-lines"><div id="LC4">` +
                `<span class="pl-v">source = </span>` +
                `<span class="pl-s"><span class="pl-pds">"</span>` +
                `<span class="pl-pse">\${</span><span class="pl-s1">var.env == ${inner("prod")} ? ${inner("a")} : ${inner("b")}</span>` +
                `<span class="pl-pse">}</span>/vpc<span class="pl-pds">"</span></span>` +
                `</div></div>`;
            const written = '${var.env == "prod" ? "a" : "b"}/vpc';

            // Act
            writer.linkSources({
                atLine: new Map([[4, new Map([[written, URL]])]]),
                bySource: new Map(),
            });

            // Assert
            const [anchor] = anchors();
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchor.textContent ?? "").toBe(written);
        });
    });
});

describe("Given a JSON source with an escaped quote", () => {
    describe("When it is linked", () => {
        test("Then I expect it matched with the escape as written", () => {
            // Arrange
            document.body.innerHTML =
                `<div class="react-code-lines"><div id="LC3">` +
                `<span class="pl-ent">"source"</span>: ` +
                `<span class="pl-s"><span class="pl-pds">"</span>\${local.m[\\"vpc\\"]}<span class="pl-pds">"</span></span>` +
                `</div></div>`;
            const written = '${local.m[\\"vpc\\"]}';

            // Act
            writer.linkSources({ atLine: new Map(), bySource: new Map([[written, URL]]) });

            // Assert
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchors()[0].textContent ?? "").toBe(written);
        });
    });
});
