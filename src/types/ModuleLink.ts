import { Nullable } from "./Nullable";

/**
 * What a builder produces. `resolvedVersion` is "" unless a registry lookup
 * decided it, which is what the popup shows beside the constraint.
 */
export type ModuleLink = {
    readonly url: Nullable<string>;
    readonly resolvedVersion: string;
};
