/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://github.com/owner/repo/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitHubPageWriter } from "../../../src/data-access/GitHubPageWriter";

const SOURCE = "hashicorp/consul/aws";
const URL = "https://registry.terraform.io/modules/hashicorp/consul/aws/0.1.0";

const writer = new GitHubPageWriter();

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
            writer.linkSources(new Map([[SOURCE, URL]]));

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
            writer.linkSources(new Map([[SOURCE, URL]]));

            // Assert
            expect<boolean>(document.getElementById("LC2")?.hasAttribute("inert") ?? true).toBe(
                false,
            );
        });

        test("Then I expect the code lines raised above the line numbers", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(new Map([[SOURCE, URL]]));

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
            writer.linkSources(new Map());

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the link is not an http url", () => {
        test("Then I expect no anchor", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));

            // Act
            writer.linkSources(new Map([[SOURCE, "javascript:alert(1)"]]));

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the sources are linked twice", () => {
        test("Then I expect one anchor", () => {
            // Arrange
            render(line("LC2", [["source", SOURCE]]));
            const links = new Map([[SOURCE, URL]]);

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
            writer.linkSources(new Map([[SOURCE, URL]]));

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
                new Map([
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
