/** The commit a file was last changed by, as the page reports it. */
export type CommitIdentity = {
    readonly sha: string;
    readonly lastCommitDateTime: string;
};
