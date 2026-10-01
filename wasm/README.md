# wasm

The parser, built from [hashicorp/hcl](https://github.com/hashicorp/hcl) for
`js/wasm`.

`tofuParseToString(contents, fileName)` returns `{ declarations }` or
`{ error }`. `declarations` is a JSON array of every module source the file
declares, in the order the file writes them: `{ name, block, source, written,
resolved, version, line }`. `name` is what the extension shows: the module name,
`terraform`, or `required_providers.<name>`. `line` is 1-based. A file ending in
`.json` is read as JSON syntax and any other as native HCL. `declarations/` does
the reading.

A module's `source` and `version` are evaluated the way OpenTofu does before
state exists: against the file's variable defaults and its locals, with no
functions. Terraform's literal strings are a subset of that, so both languages
read the same way. `written` is the source as the page shows it, and `resolved`
is false when the source names something the file does not define, in which case
`source` is `written`. A provider's source and version must be literal strings
in both languages.

## Contract

`testdata/contract.json` is what `Read` emits for `testdata/contract.tf`. The Go
test `TestContract` fails when the output stops matching it, and
`tests/unit/types/ParsedDeclaration.test.ts` fails when `ParsedDeclaration` stops
matching it. To change the shape on purpose, change `Declaration`, rewrite the
file, then change `ParsedDeclaration` until the TypeScript test passes:

```
go test ./declarations/ -run TestContract -update
```

Run it inside the build container, the same way the `Makefile` does.

## Building

Requires Docker. Two files are generated and are in the .gitignore. Webpack
copies `public/main.wasm.gz` into `dist`. `src/services/HclParser.ts` imports
`src/vendor/wasm_exec.js`.

```
make build
```

Rebuilt only when `main.go`, `declarations/`, `go.mod` or `go.sum` changes. The
build runs `go test ./declarations/` first. To force it:

```
make build-wasm
```

Two builds of the same sources are not byte identical. Go embeds a build ID.

The Go toolchain is pinned in `Dockerfile`. A bump moves the benchmark
numbers, so re-record the baseline with `make record-baseline`.

## The HCL version

The parser is OpenTofu's fork of HCL, <https://github.com/opentofu/hcl>, at the
commit OpenTofu's own `go.mod` pins, so files parse exactly as OpenTofu parses
them. `go.mod` requires `github.com/hashicorp/hcl/v2`, the import path the code
uses, and a `replace` points it at the fork.

To move to the commit OpenTofu pins now, copy the `replace` line from
<https://github.com/opentofu/opentofu/blob/main/go.mod> and rebuild. The binary
records the fork it was built with:

```
gzip -dc public/main.wasm.gz | strings | grep -E '^=>.*opentofu/hcl'
```

Then run `make third-party-notices`, because the fork's version is in them.
