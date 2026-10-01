import cmp from "semver/functions/cmp";
import diff from "semver/functions/diff";
import gt from "semver/functions/gt";
import parse from "semver/functions/parse";
import prerelease from "semver/functions/prerelease";
import { CLAUSE_SEPARATOR, readClause, TERRAFORM_VERSION_CONSTRAINTS } from "./ConstraintClauses";

export { TERRAFORM_VERSION_CONSTRAINTS };

const VERSION_SEPARATOR = ".";
const VERSION_PART_COUNT = 3;

const PESSIMISTIC_OPERATOR = TERRAFORM_VERSION_CONSTRAINTS.EXACT;
const PRERELEASE_MARKERS = ["-", "+"];

type TerraformOperator =
    (typeof TERRAFORM_VERSION_CONSTRAINTS)[keyof typeof TERRAFORM_VERSION_CONSTRAINTS];

/**
 * The operators that stand for a single comparison. `~>` is absent because it
 * is shorthand for a pair of bounds rather than a comparison of its own.
 */
export type ComparisonOperator = Exclude<TerraformOperator, typeof PESSIMISTIC_OPERATOR>;

export type Comparator = {
    readonly operator: ComparisonOperator;
    readonly version: string;
};

/**
 * Every comparison a satisfying version must meet. `recognized` is false when
 * any clause used an operator Terraform does not have, or a version semver
 * cannot read.
 */
export type VersionConstraint = {
    readonly comparators: readonly Comparator[];
    readonly recognized: boolean;
};

const UNRECOGNIZED: VersionConstraint = { comparators: [], recognized: false };

/**
 * Reads a Terraform version constraint into the comparisons it stands for.
 * `~>` is not npm's: `~> 1.2.3` is `>=1.2.3 <1.3.0`, `~> 1.2` is `>=1.2.0 <2.0.0`.
 * An npm range such as `^1.2.3` is not Terraform and comes back unrecognized
 * rather than being resolved under npm's rules.
 * @param constraint A comma separated conjunction, for example `>= 5.0, < 6.0`.
 * @returns The comparisons every satisfying version must meet.
 */
export const toVersionConstraint = (constraint: string): VersionConstraint => {
    const comparators: Comparator[] = [];

    for (const clause of constraint.split(CLAUSE_SEPARATOR)) {
        const trimmed = clause.trim();
        if (trimmed === "") {
            continue;
        }
        const bounds = toComparators(trimmed);
        if (bounds.length === 0) {
            return UNRECOGNIZED;
        }
        comparators.push(...bounds);
    }

    return { comparators, recognized: true };
};

/**
 * @param version A published version, which must be valid semver.
 * @param constraint The constraint to test against.
 * @returns true if the version meets every comparison the constraint holds; otherwise, false.
 */
export const satisfies = (version: string, constraint: VersionConstraint): boolean => {
    if (!constraint.recognized) {
        return false;
    }
    if (prerelease(version) !== null && !namesPrerelease(version, constraint)) {
        return false;
    }
    return constraint.comparators.every((comparator) =>
        cmp(version, comparator.operator, comparator.version),
    );
};

/**
 * Determines whether a constraint asks for a prerelease of the same release.
 *
 * `< 6.0.0` must not select `6.0.0-beta3`. Terraform installs a prerelease
 * only when the constraint asks for one of that same release, which is the
 * rule semver ranges apply and comparing on its own does not.
 */
const namesPrerelease = (version: string, constraint: VersionConstraint): boolean =>
    constraint.comparators.some(
        (comparator) =>
            prerelease(comparator.version) !== null &&
            diff(comparator.version, version) === "prerelease",
    );

/**
 * @param versions Published versions, which must all be valid semver.
 * @param constraint The constraint to resolve.
 * @returns The highest version satisfying the constraint, or "" when none does.
 */
export const selectVersion = (
    versions: readonly string[],
    constraint: VersionConstraint,
): string => {
    let selected = "";
    for (const version of versions) {
        if (satisfies(version, constraint) && (selected === "" || gt(version, selected))) {
            selected = version;
        }
    }
    return selected;
};

/**
 * @param constraint The constraint to inspect.
 * @returns The one version an exact constraint names, or "" when it names a range.
 */
export const pinnedVersion = (constraint: VersionConstraint): string => {
    if (!constraint.recognized || constraint.comparators.length !== 1) {
        return "";
    }
    const [only] = constraint.comparators;
    return only.operator === TERRAFORM_VERSION_CONSTRAINTS.EQUAL ? only.version : "";
};

/** The whitelist. `~` alone reaches here because it is the first half of `~>`. */
const isComparisonOperator = (operator: string): operator is ComparisonOperator =>
    operator !== PESSIMISTIC_OPERATOR &&
    (Object.values(TERRAFORM_VERSION_CONSTRAINTS) as string[]).includes(operator);

/** Empty when the clause is not Terraform's, which is what marks a constraint unrecognized. */
const toComparators = (clause: string): readonly Comparator[] => {
    const { operator, version } = readClause(clause);
    if (operator === PESSIMISTIC_OPERATOR) {
        return toPessimisticBounds(version);
    }
    const normalized = operator === "" ? TERRAFORM_VERSION_CONSTRAINTS.EQUAL : operator;
    const parsed = parse(padVersion(version));
    if (!isComparisonOperator(normalized) || parsed === null) {
        return [];
    }
    return [{ operator: normalized, version: parsed.version }];
};

/** `~>` pins the last part the author wrote, so the count of parts decides. */
const toPessimisticBounds = (version: string): readonly Comparator[] => {
    const parsed = parse(padVersion(version));
    if (parsed === null) {
        return [];
    }
    const written = version.split(VERSION_SEPARATOR).length;
    const upper =
        written >= VERSION_PART_COUNT
            ? `${parsed.major}.${parsed.minor + 1}.0`
            : `${parsed.major + 1}.0.0`;
    return [
        {
            operator: TERRAFORM_VERSION_CONSTRAINTS.GREATER_THAN_OR_EQUAL,
            version: parsed.version,
        },
        { operator: TERRAFORM_VERSION_CONSTRAINTS.LESS_THAN, version: upper },
    ];
};

/** `5.0` is not a semver version. Pad it rather than let semver reject it. */
const padVersion = (version: string): string => {
    if (PRERELEASE_MARKERS.some((marker) => version.includes(marker))) {
        return version;
    }
    const parts = version.split(VERSION_SEPARATOR);
    while (parts.length < VERSION_PART_COUNT) {
        parts.push("0");
    }
    return parts.join(VERSION_SEPARATOR);
};
