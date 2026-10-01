import { Nullable } from "../types/Nullable";
import { HclFileTypes } from "../types/HclFileTypes";

/**
 * Reading the file page a host rendered. Substituted in tests of anything
 * above it, so that a service can be handed file text without building a DOM.
 */
export interface IPageDataAccess {
    getFileType(): Nullable<HclFileTypes>;
    getFileName(): string;
    readSourceTextAsync(): Promise<Nullable<string>>;
    readCommitSha(): Nullable<string>;
}
