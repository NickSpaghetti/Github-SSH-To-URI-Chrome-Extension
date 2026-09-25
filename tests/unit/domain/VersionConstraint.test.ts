import { expect } from "@jest/globals";
import {
    normalizeConstraint,
    pinnedVersion,
    selectVersion,
    toVersionConstraint,
    TERRAFORM_VERSION_CONSTRAINTS,
} from "../../../src/domain/VersionConstraint";

const PUBLISHED = [
    "1.0.0",
    "1.2.0",
    "1.2.3",
    "1.3.0",
    "1.9.9",
    "2.0.0",
    "2.4.0",
    "3.0.0",
    "5.0.0",
    "5.4.0",
    "6.7.3",
];

const resolve = (constraint: string): string =>
    selectVersion(PUBLISHED, toVersionConstraint(constraint));

const pin = (constraint: string): string => pinnedVersion(toVersionConstraint(constraint));

describe("Given a version constraint", () => {
    describe("When the constraint is empty", () => {
        test("Then I expect the highest published version", () => {
            expect<string>(resolve("")).toBe("6.7.3");
        });
    });

    describe("When the constraint is a bare version", () => {
        test("Then I expect that exact version", () => {
            expect<string>(resolve("6.7.3")).toBe("6.7.3");
            expect<string>(resolve("= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the version omits a part", () => {
        test("Then I expect it padded, not read as a range", () => {
            expect<string>(resolve(">= 5.0")).toBe("6.7.3");
            expect<string>(resolve("3")).toBe("3.0.0");
        });
    });

    describe("When the constraint has one bound", () => {
        test("Then I expect that comparison applied", () => {
            expect<string>(resolve(">= 3.0.0")).toBe("6.7.3");
            expect<string>(resolve("<= 2.0.0")).toBe("2.0.0");
            expect<string>(resolve("> 5.4.0")).toBe("6.7.3");
            expect<string>(resolve("< 1.3.0")).toBe("1.2.3");
        });
    });

    describe("When the constraint has two bounds", () => {
        test("Then I expect both kept", () => {
            expect<string>(resolve(">= 1.0, < 2.0")).toBe("1.9.9");
            expect<string>(resolve(">= 2.0.0, <= 3.0.0")).toBe("3.0.0");
        });
    });

    describe("When the constraint is pessimistic with a patch", () => {
        test("Then I expect the minor pinned", () => {
            expect<string>(resolve("~> 1.2.3")).toBe("1.2.3");
        });
    });

    describe("When the constraint is pessimistic without a patch", () => {
        test("Then I expect the major pinned", () => {
            expect<string>(resolve("~> 1.2")).toBe("1.9.9");
            expect<string>(resolve("~> 1")).toBe("1.9.9");
        });
    });

    describe("When the constraint has no spaces", () => {
        test("Then I expect it read the same", () => {
            expect<string>(resolve(">=2.0.0,<3.0.0")).toBe("2.4.0");
        });
    });

    describe("When the constraint excludes a version", () => {
        test("Then I expect the excluded version passed over", () => {
            expect<string>(resolve(">= 1.0.0, <= 1.2.3, != 1.2.3")).toBe("1.2.0");
        });

        test("Then I expect an exclusion alone to leave every other version open", () => {
            expect<string>(resolve("!= 6.7.3")).toBe("5.4.0");
        });
    });

    describe("When the version carries a prerelease", () => {
        test("Then I expect it compared rather than padded", () => {
            const constraint = toVersionConstraint(">= 5.0.0-beta1");
            expect<boolean>(constraint.recognized).toBe(true);
            expect<string>(constraint.comparators[0].version).toBe("5.0.0-beta1");
        });
    });

    describe("When the constraint is an npm range terraform does not have", () => {
        test("Then I expect it unrecognized rather than resolved under npm rules", () => {
            for (const npmRange of ["^1.2.3", "~1.2.3", "1.2.x", "1.2.3 - 2.0.0"]) {
                expect<boolean>(toVersionConstraint(npmRange).recognized).toBe(false);
                expect<string>(resolve(npmRange)).toBe("");
            }
        });

        test("Then I expect one bad clause to reject the whole conjunction", () => {
            expect<boolean>(toVersionConstraint(">= 1.0.0, ^2.0.0").recognized).toBe(false);
        });
    });

    describe("When the version is not a version", () => {
        test("Then I expect the constraint unrecognized", () => {
            expect<boolean>(toVersionConstraint("banana").recognized).toBe(false);
            expect<boolean>(toVersionConstraint(">= banana").recognized).toBe(false);
        });
    });
});

describe("Given a constraint a link has to name a version for", () => {
    describe("When the constraint names one version", () => {
        test("Then I expect that version", () => {
            expect<string>(pin("3.0.0")).toBe("3.0.0");
            expect<string>(pin("= 3.0.0")).toBe("3.0.0");
            expect<string>(pin("5.0")).toBe("5.0.0");
        });
    });

    describe("When the constraint names a range", () => {
        test("Then I expect nothing to pin to", () => {
            expect<string>(pin(">= 3.0.0")).toBe("");
            expect<string>(pin("~> 1.2.3")).toBe("");
            expect<string>(pin(">= 1.0, < 2.0")).toBe("");
            expect<string>(pin("")).toBe("");
        });
    });

    describe("When the constraint is not terraform's", () => {
        test("Then I expect nothing to pin to", () => {
            expect<string>(pin("^1.2.3")).toBe("");
        });
    });
});

describe("Given a constraint to show in a list", () => {
    const OPERATORS = Object.values(TERRAFORM_VERSION_CONSTRAINTS);

    describe("When the constraint is already spaced", () => {
        test("Then I expect it unchanged", () => {
            expect<string>(normalizeConstraint(">= 3.5.0, < 4.0.0")).toBe(">= 3.5.0, < 4.0.0");
            expect<string>(normalizeConstraint("3.0.0")).toBe("3.0.0");
            expect<string>(normalizeConstraint("")).toBe("");
        });
    });

    // Every operator, and every pair of them, the way the old formatter was
    // covered. One escaping mistake in the scan shows up here and nowhere else.
    describe.each(OPERATORS)("When the constraint leads with %s", (operator) => {
        test("Then I expect one space after the operator", () => {
            expect<string>(normalizeConstraint(`${operator}3.0.0`)).toBe(`${operator} 3.0.0`);
        });

        test("Then I expect the operator kept, not expanded", () => {
            expect<string>(normalizeConstraint(`${operator} 3.0.0`)).toBe(`${operator} 3.0.0`);
        });

        describe.each(OPERATORS)("and the second clause leads with %s", (second) => {
            test("Then I expect both spaced and comma separated", () => {
                expect<string>(normalizeConstraint(`${operator}3.0.0,${second}4.0.0`)).toBe(
                    `${operator} 3.0.0, ${second} 4.0.0`,
                );
            });
        });
    });

    describe("When a clause is empty", () => {
        test("Then I expect it dropped rather than left as a stray comma", () => {
            expect<string>(normalizeConstraint(">= 3.0.0,")).toBe(">= 3.0.0");
            expect<string>(normalizeConstraint(",")).toBe("");
        });
    });
});
