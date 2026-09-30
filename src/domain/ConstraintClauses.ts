/** Terraform's constraint operators. The only place they are declared. */
export const TERRAFORM_VERSION_CONSTRAINTS = {
    EQUAL: "=",
    LESS_THAN: "<",
    LESS_THAN_OR_EQUAL: "<=",
    GREATER_THAN: ">",
    GREATER_THAN_OR_EQUAL: ">=",
    EXACT: "~>",
    EXCLUDES: "!=",
} as const;

export const CLAUSE_SEPARATOR = ",";

/** Derived so the constant stays the only place operators are declared. */
const OPERATOR_CHARACTERS = [
    ...new Set(Object.values(TERRAFORM_VERSION_CONSTRAINTS).join("")),
].join("");

/**
 * @param clause One comma separated part of a constraint.
 * @returns Its leading operator and the version that follows.
 */
export const readClause = (clause: string): { operator: string; version: string } => {
    let index = 0;
    while (index < clause.length && OPERATOR_CHARACTERS.includes(clause[index])) {
        index += 1;
    }
    return { operator: clause.slice(0, index), version: clause.slice(index).trim() };
};

const spaceClause = (clause: string): string => {
    const { operator, version } = readClause(clause);
    return operator === "" ? version : `${operator} ${version}`;
};

/**
 * Spaces a constraint out for display without changing what it says, so
 * `>=3.5.0,<4.0.0` and `>= 3.5.0, < 4.0.0` read alike in a list. The operator
 * the author chose is kept: `~> 1.2` stays itself rather than becoming the
 * pair of bounds it stands for.
 * @param constraint A constraint as the author wrote it.
 * @returns The same constraint, one space after each operator and comma.
 */
export const normalizeConstraint = (constraint: string): string =>
    constraint
        .split(CLAUSE_SEPARATOR)
        .map((clause) => spaceClause(clause.trim()))
        .filter((clause) => clause !== "")
        .join(`${CLAUSE_SEPARATOR} `);
