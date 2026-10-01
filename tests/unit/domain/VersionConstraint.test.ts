import { expect } from "@jest/globals";
import {
    pinnedVersion,
    selectVersion,
    toVersionConstraint,
    TERRAFORM_VERSION_CONSTRAINTS,
} from "../../../src/domain/VersionConstraint";
import { normalizeConstraint } from "../../../src/domain/ConstraintClauses";

/** The versions the registry publishes in every case below. */
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

/**
 * Picks the version a constraint selects out of the published set.
 * @param constraint The constraint as an author would write it.
 * @returns The version selected, or an empty string where none was.
 */
const resolve = (constraint: string): string =>
    selectVersion(PUBLISHED, toVersionConstraint(constraint));

/**
 * Reads the single version a constraint names.
 * @param constraint The constraint as an author would write it.
 * @returns That version, or an empty string where the constraint names a range.
 */
const pin = (constraint: string): string => pinnedVersion(toVersionConstraint(constraint));

describe("Given a version constraint", () => {
    describe("When the constraint is empty", () => {
        test("Then I expect the highest published version", () => {
            // Act
            const selected = resolve("");

            // Assert
            expect<string>(selected).toBe("6.7.3");
        });
    });

    describe("When the constraint is a bare version", () => {
        test("Then I expect that exact version", () => {
            // Arrange
            const cases = [
                { constraint: "6.7.3", selected: "6.7.3" },
                { constraint: "= 3.0.0", selected: "3.0.0" },
            ];

            // Act
            const resolved = cases.map(({ constraint }) => ({
                constraint,
                selected: resolve(constraint),
            }));

            // Assert
            expect(resolved).toEqual(cases);
        });
    });

    describe("When the version omits a part", () => {
        test("Then I expect it padded, not read as a range", () => {
            // Arrange
            const cases = [
                { constraint: ">= 5.0", selected: "6.7.3" },
                { constraint: "3", selected: "3.0.0" },
            ];

            // Act
            const resolved = cases.map(({ constraint }) => ({
                constraint,
                selected: resolve(constraint),
            }));

            // Assert
            expect(resolved).toEqual(cases);
        });
    });

    describe("When the constraint has one bound", () => {
        test("Then I expect that comparison applied", () => {
            // Arrange
            const cases = [
                { constraint: ">= 3.0.0", selected: "6.7.3" },
                { constraint: "<= 2.0.0", selected: "2.0.0" },
                { constraint: "> 5.4.0", selected: "6.7.3" },
                { constraint: "< 1.3.0", selected: "1.2.3" },
            ];

            // Act
            const resolved = cases.map(({ constraint }) => ({
                constraint,
                selected: resolve(constraint),
            }));

            // Assert
            expect(resolved).toEqual(cases);
        });
    });

    describe("When the constraint has two bounds", () => {
        test("Then I expect both kept", () => {
            // Arrange
            const cases = [
                { constraint: ">= 1.0, < 2.0", selected: "1.9.9" },
                { constraint: ">= 2.0.0, <= 3.0.0", selected: "3.0.0" },
            ];

            // Act
            const resolved = cases.map(({ constraint }) => ({
                constraint,
                selected: resolve(constraint),
            }));

            // Assert
            expect(resolved).toEqual(cases);
        });
    });

    describe("When the constraint is pessimistic with a patch", () => {
        test("Then I expect the minor pinned", () => {
            // Act
            const selected = resolve("~> 1.2.3");

            // Assert
            expect<string>(selected).toBe("1.2.3");
        });
    });

    describe("When the constraint is pessimistic without a patch", () => {
        test("Then I expect the major pinned", () => {
            // Arrange
            const constraints = ["~> 1.2", "~> 1"];

            // Act
            const resolved = constraints.map(resolve);

            // Assert
            expect<string[]>(resolved).toEqual(constraints.map(() => "1.9.9"));
        });
    });

    describe("When the constraint has no spaces", () => {
        test("Then I expect it read the same", () => {
            // Act
            const selected = resolve(">=2.0.0,<3.0.0");

            // Assert
            expect<string>(selected).toBe("2.4.0");
        });
    });

    describe("When the constraint excludes a version", () => {
        test("Then I expect the excluded version passed over", () => {
            // Act
            const selected = resolve(">= 1.0.0, <= 1.2.3, != 1.2.3");

            // Assert
            expect<string>(selected).toBe("1.2.0");
        });

        test("Then I expect an exclusion alone to leave every other version open", () => {
            // Act
            const selected = resolve("!= 6.7.3");

            // Assert
            expect<string>(selected).toBe("5.4.0");
        });
    });

    describe("When the version carries a prerelease", () => {
        test("Then I expect it compared rather than padded", () => {
            // Act
            const constraint = toVersionConstraint(">= 5.0.0-beta1");

            // Assert
            expect<boolean>(constraint.recognized).toBe(true);
            expect<string>(constraint.comparators[0].version).toBe("5.0.0-beta1");
        });
    });

    describe("When the constraint is an npm range terraform does not have", () => {
        test("Then I expect it unrecognized rather than resolved under npm rules", () => {
            // Arrange
            const npmRanges = ["^1.2.3", "~1.2.3", "1.2.x", "1.2.3 - 2.0.0"];

            // Act
            const read = npmRanges.map((npmRange) => ({
                recognized: toVersionConstraint(npmRange).recognized,
                selected: resolve(npmRange),
            }));

            // Assert
            expect(read).toEqual(npmRanges.map(() => ({ recognized: false, selected: "" })));
        });

        test("Then I expect one bad clause to reject the whole conjunction", () => {
            // Act
            const constraint = toVersionConstraint(">= 1.0.0, ^2.0.0");

            // Assert
            expect<boolean>(constraint.recognized).toBe(false);
        });
    });

    describe("When the version is not a version", () => {
        test("Then I expect the constraint unrecognized", () => {
            // Arrange
            const constraints = ["banana", ">= banana"];

            // Act
            const recognized = constraints.map(
                (constraint) => toVersionConstraint(constraint).recognized,
            );

            // Assert
            expect<boolean[]>(recognized).toEqual(constraints.map(() => false));
        });
    });
});

describe("Given a constraint a link has to name a version for", () => {
    describe("When the constraint names one version", () => {
        test("Then I expect that version", () => {
            // Arrange
            const cases = [
                { constraint: "3.0.0", pinned: "3.0.0" },
                { constraint: "= 3.0.0", pinned: "3.0.0" },
                { constraint: "5.0", pinned: "5.0.0" },
            ];

            // Act
            const pinned = cases.map(({ constraint }) => ({
                constraint,
                pinned: pin(constraint),
            }));

            // Assert
            expect(pinned).toEqual(cases);
        });
    });

    describe("When the constraint names a range", () => {
        test("Then I expect nothing to pin to", () => {
            // Arrange
            const constraints = [">= 3.0.0", "~> 1.2.3", ">= 1.0, < 2.0", ""];

            // Act
            const pinned = constraints.map(pin);

            // Assert
            expect<string[]>(pinned).toEqual(constraints.map(() => ""));
        });
    });

    describe("When the constraint is not terraform's", () => {
        test("Then I expect nothing to pin to", () => {
            // Act
            const pinned = pin("^1.2.3");

            // Assert
            expect<string>(pinned).toBe("");
        });
    });
});

describe("Given a constraint to show in a list", () => {
    const OPERATORS = Object.values(TERRAFORM_VERSION_CONSTRAINTS);

    describe("When the constraint is already spaced", () => {
        test("Then I expect it unchanged", () => {
            // Arrange
            const constraints = [">= 3.5.0, < 4.0.0", "3.0.0", ""];

            // Act
            const normalized = constraints.map(normalizeConstraint);

            // Assert
            expect<string[]>(normalized).toEqual(constraints);
        });
    });

    // Every operator, and every pair of them, the way the old formatter was
    // covered. One escaping mistake in the scan shows up here and nowhere else.
    describe.each(OPERATORS)("When the constraint leads with %s", (operator) => {
        test("Then I expect one space after the operator", () => {
            // Arrange
            const constraint = `${operator}3.0.0`;

            // Act
            const normalized = normalizeConstraint(constraint);

            // Assert
            expect<string>(normalized).toBe(`${operator} 3.0.0`);
        });

        test("Then I expect the operator kept, not expanded", () => {
            // Arrange
            const constraint = `${operator} 3.0.0`;

            // Act
            const normalized = normalizeConstraint(constraint);

            // Assert
            expect<string>(normalized).toBe(`${operator} 3.0.0`);
        });

        describe.each(OPERATORS)("and the second clause leads with %s", (second) => {
            test("Then I expect both spaced and comma separated", () => {
                // Arrange
                const constraint = `${operator}3.0.0,${second}4.0.0`;

                // Act
                const normalized = normalizeConstraint(constraint);

                // Assert
                expect<string>(normalized).toBe(`${operator} 3.0.0, ${second} 4.0.0`);
            });
        });
    });

    describe("When a clause is empty", () => {
        test("Then I expect it dropped rather than left as a stray comma", () => {
            // Arrange
            const cases = [
                { constraint: ">= 3.0.0,", normalized: ">= 3.0.0" },
                { constraint: ",", normalized: "" },
            ];

            // Act
            const read = cases.map(({ constraint }) => ({
                constraint,
                normalized: normalizeConstraint(constraint),
            }));

            // Assert
            expect(read).toEqual(cases);
        });
    });
});
