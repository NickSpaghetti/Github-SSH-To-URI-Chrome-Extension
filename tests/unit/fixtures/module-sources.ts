/**
 * Every module source in the iac-module-linker-fixtures repo, with the
 * classification and link it should produce.
 *
 * Authored from OpenTofu's module sources doc, not generated from current
 * behavior. Generating it would enshrine the current bugs as correct.
 * Regenerate the skeleton from the fixture repo, never by hand.
 */

/** How closely a built link has to match what the row expects. */
export type CorpusMatch = "exact" | "prefix";

/** One module source and everything this suite asserts about it. */
export type CorpusRow = {
    /** Identifies the row in a failure message. */
    id: string;
    /** The fixture file the source was declared in. */
    file: string;
    /** The GitHub page that file is served on. */
    pageUrl: string;
    /** The name the block was given. */
    moduleName: string;
    /** The source exactly as the fixture wrote it. */
    source: string;
    /** The constraint the block declared. */
    version: string;
    /** The label the source should carry. */
    expectedSourceType: string;
    /** The link it should resolve to, or null where it is deliberately not linked. */
    expectedResolvedUrl: string | null;
    /** Whether the link must match exactly or need only lead with the expected value. */
    match: CorpusMatch;
    /** The phase that will define the url, or null where this row is settled. */
    pending: string | null;
    /** Why the row is here, where that is not obvious from the source. */
    note: string | null;
};

/** The corpus itself, one row per source. */
export const MODULE_SOURCE_CORPUS: CorpusRow[] = [
    {
        id: "01-local-paths:local_dir",
        file: "01-local-paths.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/01-local-paths.tf",
        moduleName: "local_dir",
        source: "./modules/vpc",
        version: "",
        expectedSourceType: "path",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/main/modules/vpc",
        match: "exact",
        pending: null,
        note: "directory target must use tree, not blob",
    },
    {
        id: "01-local-paths:local_file_target",
        file: "01-local-paths.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/01-local-paths.tf",
        moduleName: "local_file_target",
        source: "./modules/vpc/main.tf",
        version: "",
        expectedSourceType: "path",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/modules/vpc/main.tf",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "01-local-paths:local_sibling",
        file: "01-local-paths.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/01-local-paths.tf",
        moduleName: "local_sibling",
        source: "./modules/lambda",
        version: "",
        expectedSourceType: "path",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/main/modules/lambda",
        match: "exact",
        pending: null,
        note: "directory target must use tree, not blob",
    },
    {
        id: "02-registry-public:registry_constraint",
        file: "02-registry-public.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/02-registry-public.tf",
        moduleName: "registry_constraint",
        source: "terraform-aws-modules/rds/aws",
        version: ">= 6.0, < 7.0",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://registry.terraform.io/modules/terraform-aws-modules/rds/aws/6.13.1",
        match: "exact",
        pending: null,
        note: "highest satisfying version, matching what Terraform would select",
    },
    {
        id: "02-registry-public:registry_unversioned",
        file: "02-registry-public.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/02-registry-public.tf",
        moduleName: "registry_unversioned",
        source: "terraform-aws-modules/security-group/aws",
        version: "",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://registry.terraform.io/modules/terraform-aws-modules/security-group/aws/6.0.0",
        match: "exact",
        pending: null,
        note: "no constraint must resolve to latest, not oldest",
    },
    {
        id: "02-registry-public:registry_versioned",
        file: "02-registry-public.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/02-registry-public.tf",
        moduleName: "registry_versioned",
        source: "terraform-aws-modules/vpc/aws",
        version: "6.7.3",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "03-registry-host:hcp_terraform",
        file: "03-registry-host.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/03-registry-host.tf",
        moduleName: "hcp_terraform",
        source: "app.terraform.io/example-corp/k8s-cluster/azurerm",
        version: "1.0.0",
        expectedSourceType: "privateRegistry",
        expectedResolvedUrl: "https://app.terraform.io/example-corp/k8s-cluster/azurerm",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "03-registry-host:opentofu_registry",
        file: "03-registry-host.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/03-registry-host.tf",
        moduleName: "opentofu_registry",
        source: "registry.opentofu.org/terraform-aws-modules/vpc/aws",
        version: "6.7.3",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/6.7.3",
        match: "exact",
        pending: null,
        note: "OpenTofu browses on search.opentofu.org, not on its registry api host",
    },
    {
        id: "03-registry-host:opentofu_registry_range",
        file: "03-registry-host.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/03-registry-host.tf",
        moduleName: "opentofu_registry_range",
        source: "registry.opentofu.org/terraform-aws-modules/vpc/aws",
        version: "~> 5.0",
        expectedSourceType: "registry",
        expectedResolvedUrl: "https://search.opentofu.org/module/terraform-aws-modules/vpc/aws/5.",
        match: "prefix",
        pending: null,
        note: "a range has to be resolved against the published list, since the api takes a version",
    },
    {
        id: "03-registry-host:third_party_registry",
        file: "03-registry-host.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/03-registry-host.tf",
        moduleName: "third_party_registry",
        source: "registry.example.com/example-corp/networking/aws",
        version: "",
        expectedSourceType: "registry",
        expectedResolvedUrl: "https://registry.example.com/example-corp/networking/aws",
        match: "exact",
        pending: null,
        note: "a third party registry's layout is its own, so nothing is appended",
    },
    {
        id: "04-git-forced:git_https_file_target",
        file: "04-git-forced.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/04-git-forced.tf",
        moduleName: "git_https_file_target",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc/main.tf?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/v1.0.0/modules/vpc/main.tf",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "04-git-forced:git_https_no_subdir",
        file: "04-git-forced.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/04-git-forced.tf",
        moduleName: "git_https_no_subdir",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "04-git-forced:git_https_subdir_ref",
        file: "04-git-forced.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/04-git-forced.tf",
        moduleName: "git_https_subdir_ref",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "04-git-forced:git_ssh_scheme",
        file: "04-git-forced.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/04-git-forced.tf",
        moduleName: "git_ssh_scheme",
        source: "git::ssh://git@github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:ssh",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "05-git-scp:scp_bare",
        file: "05-git-scp.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/05-git-scp.tf",
        moduleName: "scp_bare",
        source: "git@github.com:NickSpaghetti/iac-module-linker-fixtures.git",
        version: "",
        expectedSourceType: "git:ssh",
        expectedResolvedUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures",
        match: "exact",
        pending: null,
        note: "scp style without a git:: prefix",
    },
    {
        id: "05-git-scp:scp_bare_subdir",
        file: "05-git-scp.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/05-git-scp.tf",
        moduleName: "scp_bare_subdir",
        source: "git@github.com:NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc",
        version: "",
        expectedSourceType: "git:ssh",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/HEAD/modules/vpc",
        match: "exact",
        pending: null,
        note: "scp style without a git:: prefix",
    },
    {
        id: "05-git-scp:scp_with_forced_type",
        file: "05-git-scp.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/05-git-scp.tf",
        moduleName: "scp_with_forced_type",
        source: "git::git@github.com:NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:ssh",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "06-github-shorthand:gh_shorthand",
        file: "06-github-shorthand.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/06-github-shorthand.tf",
        moduleName: "gh_shorthand",
        source: "github.com/NickSpaghetti/iac-module-linker-fixtures",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures",
        match: "exact",
        pending: null,
        note: "detector expands shorthand to git over https",
    },
    {
        id: "06-github-shorthand:gh_shorthand_ref",
        file: "06-github-shorthand.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/06-github-shorthand.tf",
        moduleName: "gh_shorthand_ref",
        source: "github.com/NickSpaghetti/iac-module-linker-fixtures?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "06-github-shorthand:gh_shorthand_subdir",
        file: "06-github-shorthand.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/06-github-shorthand.tf",
        moduleName: "gh_shorthand_subdir",
        source: "github.com/NickSpaghetti/iac-module-linker-fixtures//modules/vpc",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/HEAD/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "07-bitbucket:bitbucket_shorthand",
        file: "07-bitbucket.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/07-bitbucket.tf",
        moduleName: "bitbucket_shorthand",
        source: "bitbucket.org/example-corp/tofu-consul-aws",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl: "https://bitbucket.org/example-corp/tofu-consul-aws",
        match: "exact",
        pending: null,
        note: "repo root only, default branch is not knowable",
    },
    {
        id: "07-bitbucket:bitbucket_subdir",
        file: "07-bitbucket.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/07-bitbucket.tf",
        moduleName: "bitbucket_subdir",
        source: "bitbucket.org/example-corp/tofu-consul-aws//modules/consul",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://bitbucket.org/example-corp/tofu-consul-aws/src/HEAD/modules/consul",
        match: "exact",
        pending: null,
        note: "bitbucket serves files and directories from one /src/ route",
    },
    {
        id: "08-mercurial:hg_http",
        file: "08-mercurial.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/08-mercurial.tf",
        moduleName: "hg_http",
        source: "hg::http://example.com/vpc.hg",
        version: "",
        expectedSourceType: "mercurial:http",
        expectedResolvedUrl: "http://example.com/vpc.hg",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "08-mercurial:hg_ref",
        file: "08-mercurial.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/08-mercurial.tf",
        moduleName: "hg_ref",
        source: "hg::http://example.com/vpc.hg?ref=default",
        version: "",
        expectedSourceType: "mercurial:http",
        expectedResolvedUrl: "http://example.com/vpc.hg",
        match: "exact",
        pending: null,
        note: "ref is stripped, hg has no browse convention",
    },
    {
        id: "09-archives:gcs_archive",
        file: "09-archives.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/09-archives.tf",
        moduleName: "gcs_archive",
        source: "gcs::https://www.googleapis.com/storage/v1/modules/foomodule.zip",
        version: "",
        expectedSourceType: "archive",
        expectedResolvedUrl: "https://www.googleapis.com/storage/v1/modules/foomodule.zip",
        match: "exact",
        pending: null,
        note: "strip the prefix, link the underlying https url",
    },
    {
        id: "09-archives:http_zip",
        file: "09-archives.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/09-archives.tf",
        moduleName: "http_zip",
        source: "https://example.com/vpc-module.zip",
        version: "",
        expectedSourceType: "archive",
        expectedResolvedUrl: "https://example.com/vpc-module.zip",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "09-archives:s3_archive",
        file: "09-archives.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/09-archives.tf",
        moduleName: "s3_archive",
        source: "s3::https://s3-eu-west-1.amazonaws.com/examplecorp-tofu-modules/vpc.zip",
        version: "",
        expectedSourceType: "archive",
        expectedResolvedUrl: "https://s3-eu-west-1.amazonaws.com/examplecorp-tofu-modules/vpc.zip",
        match: "exact",
        pending: null,
        note: "strip the prefix, link the underlying https url",
    },
    {
        id: "10-oci:oci_digest",
        file: "10-oci.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/10-oci.tf",
        moduleName: "oci_digest",
        source: "oci://example.com/repository-name?digest=sha256:abc123",
        version: "",
        expectedSourceType: "oci",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "oci is not http, no browse url",
    },
    {
        id: "10-oci:oci_plain",
        file: "10-oci.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/10-oci.tf",
        moduleName: "oci_plain",
        source: "oci://example.com/repository-name",
        version: "",
        expectedSourceType: "oci",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "oci is not http, no browse url",
    },
    {
        id: "10-oci:oci_tag",
        file: "10-oci.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/10-oci.tf",
        moduleName: "oci_tag",
        source: "oci://example.com/repository-name?tag=v1.0.0",
        version: "",
        expectedSourceType: "oci",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "oci is not http, no browse url",
    },
    {
        id: "11-subdirs:git_nested_subdir",
        file: "11-subdirs.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/11-subdirs.tf",
        moduleName: "git_nested_subdir",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "11-subdirs:registry_subdir",
        file: "11-subdirs.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/11-subdirs.tf",
        moduleName: "registry_subdir",
        source: "terraform-aws-modules/vpc/aws//modules/vpc-endpoints",
        version: "6.7.3",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3/submodules/vpc-endpoints",
        match: "exact",
        pending: null,
        note: "registry subdir maps to a submodules page",
    },
    {
        id: "11-subdirs:shorthand_subdir",
        file: "11-subdirs.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/11-subdirs.tf",
        moduleName: "shorthand_subdir",
        source: "github.com/NickSpaghetti/iac-module-linker-fixtures//modules/lambda",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/HEAD/modules/lambda",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "12-refs:no_ref_defaults_to_default_branch",
        file: "12-refs.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/12-refs.tf",
        moduleName: "no_ref_defaults_to_default_branch",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/HEAD/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "12-refs:ref_branch",
        file: "12-refs.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/12-refs.tf",
        moduleName: "ref_branch",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=main",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/main/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "12-refs:ref_tag",
        file: "12-refs.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/12-refs.tf",
        moduleName: "ref_tag",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "12-refs:ref_with_depth",
        file: "12-refs.tf",
        pageUrl: "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/12-refs.tf",
        moduleName: "ref_with_depth",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0&depth=1",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: "depth must not be mistaken for the ref",
    },
    {
        id: "13-required-providers:required_providers.aws",
        file: "13-required-providers.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/13-required-providers.tf",
        moduleName: "required_providers.aws",
        source: "hashicorp/aws",
        version: ">= 5.0, < 6.0",
        expectedSourceType: "registry",
        expectedResolvedUrl: "https://registry.terraform.io/providers/hashicorp/aws/5.100.0",
        match: "exact",
        pending: null,
        note: "highest satisfying version, currently resolves to the 5.0.0 floor",
    },
    {
        id: "13-required-providers:required_providers.bare_name_defaults_to_hashicorp",
        file: "13-required-providers.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/13-required-providers.tf",
        moduleName: "required_providers.bare_name_defaults_to_hashicorp",
        source: "random",
        version: "",
        expectedSourceType: "registry",
        expectedResolvedUrl: "https://registry.terraform.io/providers/hashicorp/random/3.9.1",
        match: "exact",
        pending: null,
        note: "currently throws, which wipes every link on the page",
    },
    {
        id: "13-required-providers:required_providers.okta",
        file: "13-required-providers.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/13-required-providers.tf",
        moduleName: "required_providers.okta",
        source: "okta/okta",
        version: "4.9.1",
        expectedSourceType: "registry",
        expectedResolvedUrl: "https://registry.terraform.io/providers/okta/okta/4.9.1",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "14-security-cases:backslash_no_confusion",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "backslash_no_confusion",
        source: "a.terraform.io\\@evil.com/x",
        version: "",
        expectedSourceType: "privateRegistry",
        expectedResolvedUrl: "https://a.terraform.io/@evil.com/x",
        match: "exact",
        pending: null,
        note: "resolves to the real terraform.io host, must stay accepted",
    },
    {
        id: "14-security-cases:decimal_ip_backslash",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "decimal_ip_backslash",
        source: "3325256838\\a.terraform.io/path",
        version: "",
        expectedSourceType: "unknown",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "must be rejected",
    },
    {
        id: "14-security-cases:javascript_scheme",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "javascript_scheme",
        source: "javascript:x.terraform.io/foo,alert(document.domain)",
        version: "",
        expectedSourceType: "unknown",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "must be rejected",
    },
    {
        id: "14-security-cases:userinfo_smuggling",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "userinfo_smuggling",
        source: "user@a.terraform.io/path",
        version: "",
        expectedSourceType: "unknown",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "must be rejected",
    },
    {
        id: "15-everything:tofu_git",
        file: "15-everything.tofu",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/15-everything.tofu",
        moduleName: "tofu_git",
        source: "git::https://github.com/NickSpaghetti/iac-module-linker-fixtures.git//modules/vpc?ref=v1.0.0",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/v1.0.0/modules/vpc",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "15-everything:tofu_oci",
        file: "15-everything.tofu",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/15-everything.tofu",
        moduleName: "tofu_oci",
        source: "oci://example.com/repository-name?tag=v1.0.0",
        version: "",
        expectedSourceType: "oci",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "15-everything:tofu_registry",
        file: "15-everything.tofu",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/15-everything.tofu",
        moduleName: "tofu_registry",
        source: "terraform-aws-modules/vpc/aws",
        version: "6.7.3",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "nested/deep/consumer:up_two",
        file: "nested/deep/consumer.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/nested/deep/consumer.tf",
        moduleName: "up_two",
        source: "../../modules/vpc",
        version: "",
        expectedSourceType: "path",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/tree/main/modules/vpc",
        match: "exact",
        pending: null,
        note: "directory target must use tree, not blob",
    },
    {
        id: "nested/deep/consumer:up_two_file",
        file: "nested/deep/consumer.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/nested/deep/consumer.tf",
        moduleName: "up_two_file",
        source: "../../modules/vpc/main.tf",
        version: "",
        expectedSourceType: "path",
        expectedResolvedUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/modules/vpc/main.tf",
        match: "exact",
        pending: null,
        note: null,
    },
    {
        id: "14-security-cases:userinfo_spoof_forced_git",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "userinfo_spoof_forced_git",
        source: "git::https://github.com@evil.com/a/b.git",
        version: "",
        expectedSourceType: "unknown",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "must be rejected, userinfo spoofs the host",
    },
    {
        id: "14-security-cases:userinfo_spoof_https",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "userinfo_spoof_https",
        source: "https://a.terraform.io@evil.com/x",
        version: "",
        expectedSourceType: "unknown",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "must be rejected, userinfo spoofs the host",
    },
    {
        id: "14-security-cases:userinfo_spoof_schemeless",
        file: "14-security-cases.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/14-security-cases.tf",
        moduleName: "userinfo_spoof_schemeless",
        source: "a.terraform.io@evil.com/x",
        version: "",
        expectedSourceType: "unknown",
        expectedResolvedUrl: null,
        match: "exact",
        pending: null,
        note: "must be rejected, userinfo spoofs the host",
    },
    {
        id: "03-registry-host:public_registry_host_qualified",
        file: "03-registry-host.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/03-registry-host.tf",
        moduleName: "public_registry_host_qualified",
        source: "registry.terraform.io/terraform-aws-modules/vpc/aws",
        version: "6.7.3",
        expectedSourceType: "registry",
        expectedResolvedUrl:
            "https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3",
        match: "exact",
        pending: null,
        note: "the host qualified public registry must resolve exactly like the bare form",
    },
    {
        id: "04-git-forced:git_forced_beats_archive_extension",
        file: "04-git-forced.tf",
        pageUrl:
            "https://github.com/NickSpaghetti/iac-module-linker-fixtures/blob/main/04-git-forced.tf",
        moduleName: "git_forced_beats_archive_extension",
        source: "git::https://example.com/repo.zip",
        version: "",
        expectedSourceType: "git:https",
        expectedResolvedUrl: "https://example.com/repo.zip",
        match: "exact",
        pending: null,
        note: "a VCS prefix wins over the .zip extension, label and link must agree",
    },
];
