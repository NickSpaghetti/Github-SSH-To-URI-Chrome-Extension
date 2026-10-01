# wasm

The HCL parser, built from [tmccombs/hcl2json](https://github.com/tmccombs/hcl2json)
for `js/wasm`.

## Building

Requires Docker. Two files are generated and are in the .gitignore. Webpack
copies `public/main.wasm.gz` into `dist`. `src/services/HclParser.ts` imports
`src/vendor/wasm_exec.js`.

```
make build
```

Rebuilt only when `main.go`, `go.mod` or `go.sum` changes. To force it:

```
make build-wasm
```

Two builds of the same sources are not byte identical. Go embeds a build ID.

The Go toolchain is pinned in `Dockerfile`. A bump moves the benchmark
numbers, so re-record the baseline with `make record-baseline`.

## Changing the HCL version

Edit `require` in `go.mod` and rebuild. The version in the binary can be read
back out of it:

```
gzip -dc public/main.wasm.gz | strings | grep -oE 'hashicorp/hcl/v2@v[0-9.]+' | sort -u
```

## Using OpenTofu's HCL instead

OpenTofu forks HCL at <https://github.com/opentofu/hcl>. For parsing it matches
upstream. Its branch lags, so upstream is used here. To switch, add a `replace`
in `go.mod` pointing at the current commit on that fork. Then rebuild.
