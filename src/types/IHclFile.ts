import { Terraform } from "../types/Terraform";
import { Module } from "../types/Module";

export interface IHclFile {
    terraform: Terraform[];
    module?: Map<string, Module[]>;
    /** The 1-based line of each declaration's source, keyed by the name it is shown under. */
    sourceLines?: Record<string, number>;
}
