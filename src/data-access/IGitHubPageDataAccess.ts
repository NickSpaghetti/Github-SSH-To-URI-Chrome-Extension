import { Nullable } from "../types/Nullable";
import { HclFileTypes } from "../types/HclFileTypes";
import { CommitIdentity } from "../types/CommitIdentity";

/**
 * Reading the rendered GitHub page. Substituted in tests of anything above it,
 * so that a service can be handed file text without building a DOM.
 */
export interface IGitHubPageDataAccess {
    getFileType(): Nullable<HclFileTypes>;
    getFileName(): string;
    readSourceText(): Nullable<string>;
    readCommitIdentity(): Nullable<CommitIdentity>;
}
