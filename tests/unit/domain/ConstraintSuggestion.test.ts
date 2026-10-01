import { expect } from "@jest/globals";
import { suggestConstraint } from "../../../src/domain/ConstraintSuggestion";

/** The version the registry resolved to in most of these cases. */
const RESOLVED = "6.7.3";

describe("Given a constraint and the version it resolved to", () => {
    describe("When the constraint pins fewer parts than the version has", () => {
        test("Then I expect the suggestion to keep the author's precision", () => {
            // Arrange
            const cases = [
                { constraint: "~> 6.0", suggestion: "~> 6.7" },
                { constraint: ">= 5.0", suggestion: ">= 6.7" },
            ];

            // Act
            const suggested = cases.map(({ constraint }) => ({
                constraint,
                suggestion: suggestConstraint(constraint, RESOLVED),
            }));

            // Assert
            expect(suggested).toEqual(cases);
        });
    });

    describe("When the constraint already allows the resolved version", () => {
        test("Then I expect nothing to suggest", () => {
            // Arrange
            const constraints = ["~> 6.7", "~> 6", "= 6.7.3", "6.7.3"];

            // Act
            const suggested = constraints.map((constraint) =>
                suggestConstraint(constraint, RESOLVED),
            );

            // Assert
            expect(suggested).toEqual(constraints.map(() => null));
        });
    });

    describe("When the constraint is an exact pin behind the resolved version", () => {
        test("Then I expect the full version", () => {
            // Arrange
            const cases = [
                { constraint: "= 6.7.2", suggestion: "= 6.7.3" },
                { constraint: "6.7.2", suggestion: "6.7.3" },
            ];

            // Act
            const suggested = cases.map(({ constraint }) => ({
                constraint,
                suggestion: suggestConstraint(constraint, RESOLVED),
            }));

            // Assert
            expect(suggested).toEqual(cases);
        });
    });

    describe("When the operator is written without a space", () => {
        test("Then I expect it read and spaced out", () => {
            // Arrange
            const constraint = "~>6.0";

            // Act
            const suggestion = suggestConstraint(constraint, RESOLVED);

            // Assert
            expect(suggestion).toBe("~> 6.7");
        });
    });

    describe("When the constraint has several clauses", () => {
        test("Then I expect nothing, because bumping one would drop the other", () => {
            // Arrange
            const constraint = ">= 5.0, < 6.0";

            // Act
            const suggestion = suggestConstraint(constraint, RESOLVED);

            // Assert
            expect(suggestion).toBeNull();
        });
    });

    describe("When the operator names a ceiling or an exclusion", () => {
        test("Then I expect nothing, because raising it changes what is allowed", () => {
            // Arrange
            const constraints = ["< 6.0", "<= 6.0", "!= 6.0", "> 6.0"];

            // Act
            const suggested = constraints.map((constraint) =>
                suggestConstraint(constraint, RESOLVED),
            );

            // Assert
            expect(suggested).toEqual(constraints.map(() => null));
        });
    });

    describe("When either side is missing or is not a version", () => {
        test("Then I expect nothing", () => {
            // Arrange
            const cases = [
                { constraint: "", version: RESOLVED },
                { constraint: "~> 6.0", version: "" },
                { constraint: "~>", version: RESOLVED },
                { constraint: "~> abc", version: RESOLVED },
                { constraint: "~> 6.0", version: "latest" },
                { constraint: "~> 6..0", version: RESOLVED },
            ];

            // Act
            const suggested = cases.map(({ constraint, version }) =>
                suggestConstraint(constraint, version),
            );

            // Assert
            expect(suggested).toEqual(cases.map(() => null));
        });
    });

    describe("When the resolved version is below the constraint", () => {
        test("Then I expect nothing, because the suggestion would lower the floor", () => {
            // Arrange
            // The version service falls back to the newest published version
            // when nothing satisfies, so this pair is reachable.
            const behind = "3.9.1";
            const constraints = [">= 99.0.0", "~> 99.0", "= 99.0.0"];

            // Act
            const suggested = constraints.map((constraint) =>
                suggestConstraint(constraint, behind),
            );

            // Assert
            expect(suggested).toEqual(constraints.map(() => null));
        });
    });

    describe("When a version part is not a number", () => {
        test("Then I expect nothing", () => {
            // Arrange
            const cases = [
                { constraint: "~> 6.7x", version: "6.9.9" },
                { constraint: "~> 6.0", version: "6.7.3x" },
            ];

            // Act
            const suggested = cases.map(({ constraint, version }) =>
                suggestConstraint(constraint, version),
            );

            // Assert
            expect(suggested).toEqual(cases.map(() => null));
        });
    });

    describe("When the resolved version carries a prerelease", () => {
        test("Then I expect the parts the author pinned, suffix and all", () => {
            // Arrange
            const prerelease = "6.8.0-beta1";
            const cases = [
                { constraint: "~> 6.0", suggestion: "~> 6.8" },
                { constraint: "= 6.7.2", suggestion: "= 6.8.0-beta1" },
            ];

            // Act
            const suggested = cases.map(({ constraint }) => ({
                constraint,
                suggestion: suggestConstraint(constraint, prerelease),
            }));

            // Assert
            expect(suggested).toEqual(cases);
        });
    });
});
