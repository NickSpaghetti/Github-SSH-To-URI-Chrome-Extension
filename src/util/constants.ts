export const TERRAFORM_SYNTAX = {
    TERRAFORM: "terraform",
    REQUIRED_PROVIDERS: "required_providers",
    MODULE:   "module",
}

export const TERRAFORM_PROVIDERS = {
    HASHICORP: "hashicorp"
}

export const TERRAFORM_REGISTRY_ROUTES ={
    PROVIDERS: "providers",
    MODULES:   "modules",
}

export const GITHUB_ROUTES = {
    HOST:"github.com",
    BLOB: "blob",
    TREE: "tree",
    MAIN: "main"
}

export const FileExtensions = {
    TF:".tf",
    HCL:".hcl",
    GIT:".git"
}

export const SENDERS = {
    BACKGROUND:"background",
    POPUP:"popup"
}

export const TERRAFORM_VERSION_CONSTRAINTS = {
    EQUAL:                 "=",
    LESS_THAN:             "<",
    LESS_THAN_OR_EQUAL:    "<=",
    GREATER_THAN:          ">",
    GREATER_THAN_OR_EQUAL: ">=",
    EXACT:                 "~>",
    Excludes:              "!=",
}

export const GITHUB_LINKS = {
    SIGN_IN: 'Sign in',
    SIGN_UP: 'Sign up'
}

export const CacheKeys = {
    MODULES: 'MODULES'
}