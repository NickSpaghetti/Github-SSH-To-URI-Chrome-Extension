/** A module source as the wasm parser emits it. Mirrors `Declaration` in `wasm/declarations`. */
export type ParsedDeclaration = {
    /** The module name, "terraform", or "required_providers.<name>". */
    name: string;
    /** The type of block it is read from. */
    block: "module" | "terraform" | "required_providers";
    /** The source address. For a module it is evaluated against the file's variables and locals. */
    source: string;
    /** The source as the file writes it, without the quotes around a string. */
    written: string;
    /** false when the source could not be evaluated from the file, in which case `source` is `written`. */
    resolved: boolean;
    /** The version constraint, or "" when none evaluates to a string. */
    version: string;
    /** The 1-based line the source is written on. */
    line: number;
    /** The 0-based offset of `written`'s first character within its line, in UTF-16 code units. */
    column: number;
};
