/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://gitlab.com/group/repo/-/blob/main/main.tf"}
 */
import { expect } from "@jest/globals";
import { GitLabPageWriter } from "../../../src/data-access/GitLabPageWriter";
import {
    Line,
    Placement,
    Token,
    anchors,
    fillLine,
    lineText,
    numberLines,
    placedAt,
    text,
} from "./RenderedLines";

const URL = "https://registry.terraform.io/modules/hashicorp/consul/aws/0.1.0";
const OTHER_URL = "https://registry.terraform.io/modules/hashicorp/consul/aws/0.2.0";

/**
 * Puts a file on the window the way GitLab renders it: a `.line` with an
 * `LC{n}` id per line, inside a code element, at the file's url. The body is
 * replaced, so a writer from an earlier test is left observing a detached one.
 * @param lines Each line, from line 1, or by line number. Lines not given are empty.
 * @param options Whether the code is inert, as GitLab marks .tf and JSON
 * code, and the line element, which is a span for .tofu files.
 */
const renderLines = (
    lines: readonly Line[] | Readonly<Record<number, Line>>,
    options: { inert?: boolean; lineTag?: "div" | "span" } = {},
): void => {
    const { byNumber, last } = numberLines(lines);
    window.history.replaceState({}, "", "/group/repo/-/blob/main/main.tf");
    const body = document.createElement("body");
    const code = document.createElement("code");
    if (options.inert ?? true) {
        code.setAttribute("inert", "");
    }
    for (let number = 1; number <= last; number++) {
        const line = document.createElement(options.lineTag ?? "div");
        line.id = `LC${number}`;
        line.className = "line";
        fillLine(line, byNumber[number] ?? "");
        code.append(line);
    }
    const pre = document.createElement("pre");
    pre.append(code);
    body.append(pre);
    document.documentElement.replaceChild(body, document.body);
};

// Each line below is split into tokens the way GitLab's highlighter splits that
// line of the named fixture file. Class names are left out: the writer reads none.

/** `01-local-paths.tf`: a source on line 4 and one on line 12, in 14 lines. */
const LOCAL_PATHS: Record<number, Line> = {
    4: ["  source = ", '"./modules/vpc"'],
    12: ["  source = ", '"./modules/lambda"'],
    14: "",
};

/** `21-opentofu-static-evaluation.tf` line 13: a template the .tf highlighter nests. */
const TF_TEMPLATE: Line = ["  source  = ", ['"', "${local.registry}", '/vpc/aws"']];

/** `19-opentofu-static-evaluation.tofu` line 37: the .tofu highlighter's tokens, with bare spaces. */
const TOFU_TEMPLATE: Line = [
    text("  "),
    "source",
    text(" "),
    "=",
    text(" "),
    '"',
    "${",
    "local",
    ".",
    "fixtures",
    "}",
    "//",
    "${",
    "local",
    ".",
    "vpc_path",
    "}",
    "?ref=",
    "${",
    "var",
    ".",
    "fixtures_ref",
    "}",
    '"',
];

/**
 * A JSON `source` line as GitLab splits it.
 * @param indent The spaces before the key.
 * @param value The value's tokens, quotes included.
 * @returns The line.
 */
const jsonSource = (indent: string, value: Token): Line => [indent, '"source"', ":", " ", value];

const LOCAL_VPC: Placement = { line: 4, column: 12, written: "./modules/vpc", url: URL };
const LOCAL_LAMBDA: Placement = {
    line: 12,
    column: 12,
    written: "./modules/lambda",
    url: OTHER_URL,
};

describe("Given a .tf file GitLab highlighted", () => {
    describe("When its sources have links", () => {
        test("Then I expect each wrapped in an anchor to its url", () => {
            // Arrange
            renderLines(LOCAL_PATHS);

            // Act
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC, LOCAL_LAMBDA));

            // Assert
            expect(anchors().map((a) => [a.id, a.href, a.textContent])).toEqual([
                ["GitlabTerraformSourceUrl-LC4-0", URL, "./modules/vpc"],
                ["GitlabTerraformSourceUrl-LC12-0", OTHER_URL, "./modules/lambda"],
            ]);
        });

        test("Then I expect the line's text and quotes unchanged", () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            const before = lineText("LC4");

            // Act
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC));

            // Assert
            expect<string>(lineText("LC4")).toBe(before);
            expect<string>(
                document.querySelector("#LC4")?.lastElementChild?.textContent ?? "",
            ).toBe('"./modules/vpc"');
        });

        test("Then I expect the code element no longer inert", () => {
            // Arrange
            renderLines(LOCAL_PATHS);

            // Act
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC));

            // Assert
            expect<number>(document.querySelectorAll("[inert]").length).toBe(0);
        });
    });

    describe("When the sources are linked twice", () => {
        test("Then I expect one anchor per source", () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            const writer = new GitLabPageWriter();
            const links = placedAt(LOCAL_VPC);

            // Act
            writer.linkSources(links);
            writer.linkSources(links);

            // Assert
            expect<number>(anchors().length).toBe(1);
        });
    });

    describe("When a link is not an http url", () => {
        test("Then I expect the source left as text", () => {
            // Arrange
            renderLines({
                7: ["  source = ", '"javascript:x.terraform.io/foo,alert(document.domain)"'],
            });
            const written = "javascript:x.terraform.io/foo,alert(document.domain)";

            // Act
            new GitLabPageWriter().linkSources(
                placedAt({ line: 7, column: 12, written, url: "javascript:alert(1)" }),
            );

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });

    describe("When two lines share a source and each has its own url", () => {
        test("Then I expect each anchor to open its line's url", () => {
            // Arrange
            renderLines({
                4: ["  source  = ", '"hashicorp/consul/aws"'],
                9: ["  source  = ", '"hashicorp/consul/aws"'],
            });
            const written = "hashicorp/consul/aws";

            // Act
            new GitLabPageWriter().linkSources(
                placedAt(
                    { line: 4, column: 13, written, url: URL },
                    { line: 9, column: 13, written, url: OTHER_URL },
                ),
            );

            // Assert
            expect(anchors().map((a) => a.href)).toEqual([URL, OTHER_URL]);
        });
    });

    describe("When a source is a template", () => {
        test("Then I expect one anchor around all of it, highlighting kept", () => {
            // Arrange
            renderLines({ 13: TF_TEMPLATE });
            const written = "${local.registry}/vpc/aws";
            const before = lineText("LC13");

            // Act
            new GitLabPageWriter().linkSources(
                placedAt({ line: 13, column: 13, written, url: URL }),
            );

            // Assert
            const [anchor] = anchors();
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchor.textContent ?? "").toBe(written);
            expect<string[]>(
                Array.from(anchor.querySelectorAll("span")).map((span) => span.textContent ?? ""),
            ).toContain("${local.registry}");
            expect<string>(lineText("LC13")).toBe(before);
        });
    });

    describe("When the line's text at the column is not the source", () => {
        test("Then I expect the line left as text", () => {
            // Arrange
            renderLines(LOCAL_PATHS);

            // Act
            new GitLabPageWriter().linkSources(placedAt({ ...LOCAL_VPC, column: 11 }));

            // Assert
            expect<number>(anchors().length).toBe(0);
        });
    });
});

describe("Given a .tofu file GitLab highlighted with its other highlighter", () => {
    describe("When a template source spans several tokens", () => {
        test("Then I expect one anchor between the quotes and the line unchanged", () => {
            // Arrange
            renderLines({ 37: TOFU_TEMPLATE }, { inert: false, lineTag: "span" });
            const written = "${local.fixtures}//${local.vpc_path}?ref=${var.fixtures_ref}";
            const before = lineText("LC37");

            // Act
            new GitLabPageWriter().linkSources(
                placedAt({ line: 37, column: 12, written, url: URL }),
            );

            // Assert
            const [anchor] = anchors();
            expect<number>(anchors().length).toBe(1);
            expect<string>(anchor.textContent ?? "").toBe(written);
            expect<string>(anchor.closest(".line")?.id ?? "").toBe("LC37");
            expect<string>(lineText("LC37")).toBe(before);
        });
    });
});

describe("Given a JSON file GitLab highlighted", () => {
    describe("When its sources have links", () => {
        test("Then I expect the module sources linked", () => {
            // Arrange
            renderLines({
                17: [...jsonSource("        ", '"terraform-aws-modules/vpc/aws"'), ","],
                28: jsonSource("        ", '"./modules/vpc"'),
            });

            // Act
            new GitLabPageWriter().linkSources(
                placedAt(
                    { line: 17, column: 19, written: "terraform-aws-modules/vpc/aws", url: URL },
                    { line: 28, column: 19, written: "./modules/vpc", url: OTHER_URL },
                ),
            );

            // Assert
            expect(anchors().map((a) => [a.id, a.textContent])).toEqual([
                ["GitlabTerraformSourceUrl-LC17-0", "terraform-aws-modules/vpc/aws"],
                ["GitlabTerraformSourceUrl-LC28-0", "./modules/vpc"],
            ]);
        });
    });

    describe("When a source holds escaped quotes", () => {
        test("Then I expect it matched with the escapes as written", () => {
            // Arrange
            renderLines({
                17: jsonSource("      ", [
                    '"${var.env == ',
                    '\\"',
                    "prod",
                    '\\"',
                    " ? local.fixtures : ",
                    '\\"',
                    "example.com/unused",
                    '\\"',
                    '}//modules/vpc?ref=v1.0.0"',
                ]),
            });
            const written =
                '${var.env == \\"prod\\" ? local.fixtures : \\"example.com/unused\\"}//modules/vpc?ref=v1.0.0';

            // Act
            new GitLabPageWriter().linkSources(
                placedAt({ line: 17, column: 17, written, url: URL }),
            );

            // Assert
            expect(anchors().map((a) => [a.closest(".line")?.id, a.textContent])).toEqual([
                ["LC17", written],
            ]);
        });
    });
});

describe("Given a source and a commented out copy of it", () => {
    describe("When the copy sits inside a block comment opened on an earlier line", () => {
        test("Then I expect only the source the parser read linked", () => {
            // Arrange
            renderLines([
                'module "vpc" { source = "./modules/vpc" }',
                "/*",
                'module "old" { source = "./modules/vpc" }',
                "*/",
            ]);

            // Act
            new GitLabPageWriter().linkSources(
                placedAt({ line: 1, column: 25, written: "./modules/vpc", url: URL }),
            );

            // Assert
            expect(anchors().map((a) => a.closest(".line")?.id)).toEqual(["LC1"]);
        });
    });
});

describe("Given one line that declares two modules", () => {
    describe("When both sources are linked", () => {
        test("Then I expect each anchor to have its own id and url", () => {
            // Arrange
            renderLines(['module "a" { source = "x/y/z" } module "b" { source = "x/y/z" }']);

            // Act
            new GitLabPageWriter().linkSources(
                placedAt(
                    { line: 1, column: 23, written: "x/y/z", url: URL },
                    { line: 1, column: 55, written: "x/y/z", url: OTHER_URL },
                ),
            );

            // Assert
            expect(anchors().map((a) => [a.id, a.href])).toEqual([
                ["GitlabTerraformSourceUrl-LC1-0", URL],
                ["GitlabTerraformSourceUrl-LC1-1", OTHER_URL],
            ]);
            expect<string>(lineText("LC1")).toBe(
                'module "a" { source = "x/y/z" } module "b" { source = "x/y/z" }',
            );
        });
    });
});

describe("Given lines GitLab renders after the sources are linked", () => {
    describe("When a chunk scrolls into view", () => {
        test("Then I expect its sources linked too", async () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            const code = document.querySelector("code") as HTMLElement;
            const later = Array.from(code.querySelectorAll(".line")).slice(8);
            later.forEach((line) => line.remove());
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC, LOCAL_LAMBDA));
            const linkedBefore = anchors().length;

            // Act
            code.append(...later);
            await Promise.resolve();

            // Assert
            expect<number>(linkedBefore).toBe(1);
            expect(anchors().map((a) => a.id)).toEqual([
                "GitlabTerraformSourceUrl-LC4-0",
                "GitlabTerraformSourceUrl-LC12-0",
            ]);
        });
    });
});

describe("Given a chunk GitLab renders again after its sources are linked", () => {
    describe("When GitLab marks its code inert again", () => {
        test("Then I expect the inert attribute lifted so the anchors stay clickable", async () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC));
            const code = document.querySelector("code") as HTMLElement;

            // Act
            code.setAttribute("inert", "");
            await Promise.resolve();

            // Assert
            expect<boolean>(code.hasAttribute("inert")).toBe(false);
        });
    });

    describe("When GitLab marks code with no anchors inert", () => {
        test("Then I expect it left inert", async () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            new GitLabPageWriter().linkSources(placedAt());
            const code = document.querySelector("code") as HTMLElement;

            // Act
            code.setAttribute("inert", "");
            await Promise.resolve();

            // Assert
            expect<boolean>(code.hasAttribute("inert")).toBe(true);
        });
    });
});

describe("Given the page moves to another file without reloading", () => {
    describe("When GitLab renders that file's lines", () => {
        test("Then I expect them left unlinked by the previous file's links", async () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC));
            window.history.pushState({}, "", "/group/repo/-/blob/main/nested/main.tf");
            const code = document.querySelector("code") as HTMLElement;
            code.replaceChildren();
            const line = document.createElement("div");
            line.id = "LC4";
            line.className = "line";
            line.textContent = '  source = "./modules/vpc"';

            // Act
            code.append(line);
            await Promise.resolve();

            // Assert
            expect<number>(line.querySelectorAll("a").length).toBe(0);
        });
    });

    describe("When GitLab marks that file's code inert", () => {
        test("Then I expect it left inert", async () => {
            // Arrange
            renderLines(LOCAL_PATHS);
            new GitLabPageWriter().linkSources(placedAt(LOCAL_VPC));
            window.history.pushState({}, "", "/group/repo/-/blob/main/README.md");
            const code = document.querySelector("code") as HTMLElement;

            // Act
            code.setAttribute("inert", "");
            await Promise.resolve();

            // Assert
            expect<boolean>(code.hasAttribute("inert")).toBe(true);
        });
    });
});
