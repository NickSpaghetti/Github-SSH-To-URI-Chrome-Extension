/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://github.com/owner/repo/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitHubPageWriter } from "../../../src/data-access/GitHubPageWriter";
import {
    Line,
    Token,
    anchors,
    fillLine,
    lineText,
    numberLines,
    placedAt,
    text,
} from "./RenderedLines";

const SOURCE = "hashicorp/consul/aws";
const URL = "https://registry.terraform.io/modules/hashicorp/consul/aws/0.1.0";
const OTHER_URL = "https://registry.terraform.io/modules/hashicorp/consul/aws/0.2.0";

const writer = new GitHubPageWriter();

/**
 * Puts a file on the window the way GitHub renders it: an inert `div` with an
 * `LC{n}` id per line inside its code lines, next to its line numbers.
 * @param lines Each line, from line 1, or by line number. Lines not given are empty.
 */
const renderLines = (lines: readonly Line[] | Readonly<Record<number, Line>>): void => {
    const { byNumber, last } = numberLines(lines);
    document.body.innerHTML =
        `<div class="react-line-numbers"></div>` + `<div class="react-code-lines"></div>`;
    const codeLines = document.querySelector(".react-code-lines") as HTMLElement;
    for (let number = 1; number <= last; number++) {
        const line = document.createElement("div");
        line.id = `LC${number}`;
        line.setAttribute("inert", "");
        fillLine(line, byNumber[number] ?? "");
        codeLines.append(line);
    }
};

/**
 * A string as GitHub tokenizes it: a span holding its two quote spans, with
 * what is between them.
 * @param inside The tokens between the quotes.
 * @returns The string's token.
 */
const quoted = (...inside: Token[]): Token => ['"', ...inside, '"'];

/**
 * An attribute line as GitHub tokenizes it: the name and operator in one span, then the string.
 * @param name The attribute's name.
 * @param value The value between the quotes, as bare text.
 * @returns The line.
 */
const attribute = (name: string, value: string): Token[] => [`${name} = `, quoted(text(value))];

// `source = "` is ten characters, so the value starts at column 10.
const SOURCE_COLUMN = 10;

describe("Given a page with a module source", () => {
    describe("When the source has a link", () => {
        test("Then I expect it replaced by an anchor to the url", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt({ line: 2, column: SOURCE_COLUMN, written: SOURCE, url: URL }),
            );

            // Assert
            const [anchor] = anchors();
            expect<string>(anchor.href).toBe(URL);
            expect<string>(anchor.textContent ?? "").toBe(SOURCE);
            expect<string>(anchor.id).toBe("GithubTerraformSourceUrl-LC2-0");
            expect<string>(lineText("LC2")).toBe(`source = "${SOURCE}"`);
        });

        test("Then I expect the inert attribute removed from the line", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt({ line: 2, column: SOURCE_COLUMN, written: SOURCE, url: URL }),
            );

            // Assert
            expect<boolean>(document.getElementById("LC2")?.hasAttribute("inert") ?? true).toBe(
                false,
            );
        });

        test("Then I expect the code lines raised above the line numbers", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt({ line: 2, column: SOURCE_COLUMN, written: SOURCE, url: URL }),
            );

            // Assert
            const codeLines = document.querySelector(".react-code-lines") as HTMLElement;
            expect<string>(codeLines.style.zIndex).toBe("1");
        });
    });

    describe("When the source has no link", () => {
        test("Then I expect no anchor", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(placedAt());

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the link is not an http url", () => {
        test("Then I expect no anchor", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt({
                    line: 2,
                    column: SOURCE_COLUMN,
                    written: SOURCE,
                    url: "javascript:alert(1)",
                }),
            );

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the sources are linked twice", () => {
        test("Then I expect one anchor", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });
            const links = placedAt({ line: 2, column: SOURCE_COLUMN, written: SOURCE, url: URL });

            // Act
            writer.linkSources(links);
            writer.linkSources(links);

            // Assert
            expect<number>(anchors().length).toBe(1);
        });
    });

    describe("When the line's text at the column is not the source", () => {
        test("Then I expect the line left as text", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt({ line: 2, column: SOURCE_COLUMN - 1, written: SOURCE, url: URL }),
            );

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When the line is not rendered yet", () => {
        test("Then I expect nothing linked", () => {
            // Arrange
            renderLines({ 2: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt({ line: 9, column: SOURCE_COLUMN, written: SOURCE, url: URL }),
            );

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });
});

describe("Given a line where another attribute holds the same text as a source", () => {
    describe("When the source is linked", () => {
        test("Then I expect only the text at the source's column linked", () => {
            // Arrange
            renderLines({
                1: [...attribute("description", SOURCE), " ", ...attribute("source", SOURCE)],
            });
            const column = `description = "${SOURCE}" source = "`.length;

            // Act
            writer.linkSources(placedAt({ line: 1, column, written: SOURCE, url: URL }));

            // Assert
            expect<number>(anchors().length).toBe(1);
            expect<string>(
                anchors()[0].parentElement?.previousElementSibling?.textContent ?? "",
            ).toBe("source = ");
        });
    });
});

describe("Given a line with two sources", () => {
    describe("When both are linked", () => {
        test("Then I expect each anchor to have its own id and url", () => {
            // Arrange
            const other = "terraform-aws-modules/vpc/aws";
            renderLines({
                2: [...attribute("source", SOURCE), " ", ...attribute("source", other)],
            });

            // Act
            writer.linkSources(
                placedAt(
                    { line: 2, column: SOURCE_COLUMN, written: SOURCE, url: URL },
                    {
                        line: 2,
                        column: `source = "${SOURCE}" source = "`.length,
                        written: other,
                        url: OTHER_URL,
                    },
                ),
            );

            // Assert
            expect(anchors().map((anchor) => [anchor.id, anchor.href])).toEqual([
                ["GithubTerraformSourceUrl-LC2-0", URL],
                ["GithubTerraformSourceUrl-LC2-1", OTHER_URL],
            ]);
        });
    });
});

describe("Given two lines with the same source", () => {
    describe("When each line has its own url", () => {
        test("Then I expect each anchor to open its line's url", () => {
            // Arrange
            renderLines({ 12: attribute("source", SOURCE), 19: attribute("source", SOURCE) });

            // Act
            writer.linkSources(
                placedAt(
                    { line: 12, column: SOURCE_COLUMN, written: SOURCE, url: URL },
                    { line: 19, column: SOURCE_COLUMN, written: SOURCE, url: OTHER_URL },
                ),
            );

            // Assert
            expect(anchors().map((anchor) => anchor.href)).toEqual([URL, OTHER_URL]);
        });
    });
});

describe("Given a source written as a template", () => {
    describe("When it is linked", () => {
        test("Then I expect one anchor around everything between the quotes, text unchanged", () => {
            // Arrange
            renderLines({ 7: ["source = ", quoted("${", "local.repo", "}", text("//vpc"))] });
            const written = "${local.repo}//vpc";

            // Act
            writer.linkSources(placedAt({ line: 7, column: SOURCE_COLUMN, written, url: URL }));

            // Assert
            const [anchor] = anchors();
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchor.textContent ?? "").toBe(written);
            expect<string>(lineText("LC7")).toBe(`source = "${written}"`);
        });
    });
});

describe("Given a template with a string inside its interpolation", () => {
    describe("When it is linked", () => {
        test("Then I expect it matched by its inner quotes as written", () => {
            // Arrange
            renderLines({
                4: [
                    "source = ",
                    quoted(
                        "${",
                        ["var.env == ", quoted(text("prod")), " ? ", quoted(text("a")), " : "],
                        quoted(text("b")),
                        "}",
                        text("/vpc"),
                    ),
                ],
            });
            const written = '${var.env == "prod" ? "a" : "b"}/vpc';

            // Act
            writer.linkSources(placedAt({ line: 4, column: SOURCE_COLUMN, written, url: URL }));

            // Assert
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchors()[0].textContent ?? "").toBe(written);
        });
    });
});

describe("Given a JSON source with an escaped quote", () => {
    describe("When it is linked", () => {
        test("Then I expect it matched with the escape as written", () => {
            // Arrange
            renderLines({ 3: ['"source"', ": ", quoted(text('${local.m[\\"vpc\\"]}'))] });
            const written = '${local.m[\\"vpc\\"]}';

            // Act
            writer.linkSources(
                placedAt({ line: 3, column: '"source": "'.length, written, url: URL }),
            );

            // Assert
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchors()[0].textContent ?? "").toBe(written);
        });
    });
});
