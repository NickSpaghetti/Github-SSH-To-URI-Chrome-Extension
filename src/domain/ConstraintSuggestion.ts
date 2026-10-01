import { Nullable } from "../types/Nullable";
import { CLAUSE_SEPARATOR, readClause, TERRAFORM_VERSION_CONSTRAINTS } from "./ConstraintClauses";

const VERSION_SEPARATOR = ".";
const DIGITS = "0123456789";
const PRERELEASE_MARKERS = ["-", "+"];

const isDigits = (text: string): boolean =>
    text !== "" && [...text].every((character) => DIGITS.includes(character));

/** The leading digits of a part, so `0-beta1` compares as 0. */
const numericHead = (part: string): number => {
    let end = 0;
    while (end < part.length && DIGITS.includes(part[end])) {
        end += 1;
    }
    return end === 0 ? 0 : Number(part.slice(0, end));
};

/**
 * Determines whether one version is above another, comparing part by part.
 *
 * `semver` would answer this, and the popup dropped that dependency on
 * purpose. Only the parts a constraint pins are ever compared here, so
 * numeric parts are enough.
 * @param candidate The version being suggested.
 * @param pinned The version the constraint already names.
 * @returns true if candidate is above pinned; otherwise, false.
 */
const isAbove = (candidate: string, pinned: string): boolean => {
    const left = candidate.split(VERSION_SEPARATOR);
    const right = pinned.split(VERSION_SEPARATOR);
    const depth = Math.max(left.length, right.length);
    for (let part = 0; part < depth; part += 1) {
        const a = numericHead(left[part] ?? "0");
        const b = numericHead(right[part] ?? "0");
        if (a !== b) {
            return a > b;
        }
    }
    return false;
};

/**
 * Bumping toward the newest version only means something for a lower bound.
 * Raising `<` or `<=` would exclude the version it names, and `!=` names one
 * to avoid rather than one to move to.
 */
const BUMPABLE: readonly string[] = [
    "",
    TERRAFORM_VERSION_CONSTRAINTS.EXACT,
    TERRAFORM_VERSION_CONSTRAINTS.EQUAL,
    TERRAFORM_VERSION_CONSTRAINTS.GREATER_THAN_OR_EQUAL,
];

/** Every part is digits. The last may carry a prerelease, as `6.8.0-beta1` does. */
const isVersion = (text: string): boolean => {
    const parts = text.split(VERSION_SEPARATOR);
    return parts.every((part, index) => {
        if (isDigits(part)) {
            return true;
        }
        if (index !== parts.length - 1) {
            return false;
        }
        return PRERELEASE_MARKERS.some((marker) => {
            const at = part.indexOf(marker);
            return at > 0 && isDigits(part.slice(0, at));
        });
    });
};

/**
 * Returns a constraint pinned to what this one currently resolves to.
 *
 * For `=` and a bare version that unlocks a version the pin does not reach.
 * For `>=` and `~>` the resolved version is already allowed, and this raises
 * the floor to it. Neither case makes anything newer available.
 *
 * The constraint's precision is kept, so `~> 6.0` against 6.7.3 suggests
 * `~> 6.7` rather than `~> 6.7.3`: the author chose how tightly to pin and
 * that is not this function's to change.
 *
 * Nothing is suggested for a constraint of several clauses. Bumping the first
 * clause of `>= 5.0, < 6.0` would drop the upper bound, which is a change to
 * what the author allowed rather than a suggestion about it.
 * @param constraint The constraint as the author wrote it.
 * @param resolvedVersion The version the registry says that constraint selects.
 * @returns The constraint to write instead, or null when there is nothing to say.
 */
export const suggestConstraint = (
    constraint: string,
    resolvedVersion: string,
): Nullable<string> => {
    if (constraint === "" || resolvedVersion === "") {
        return null;
    }
    if (constraint.includes(CLAUSE_SEPARATOR)) {
        return null;
    }

    const { operator, version } = readClause(constraint.trim());
    if (!BUMPABLE.includes(operator) || !isVersion(version) || !isVersion(resolvedVersion)) {
        return null;
    }

    const pinned = version.split(VERSION_SEPARATOR).length;
    const suggested = resolvedVersion
        .split(VERSION_SEPARATOR)
        .slice(0, pinned)
        .join(VERSION_SEPARATOR);
    // The resolved version is not always above the constraint.
    // `TerraformVersionService` falls back to the newest published version
    // when nothing satisfies, so a module pinned `>= 99.0.0` resolves to
    // whatever exists. Suggesting that would lower the floor the author set.
    if (!isAbove(suggested, version)) {
        return null;
    }
    return operator === "" ? suggested : `${operator} ${suggested}`;
};
