# wasm

The HCL parser, built from [tmccombs/hcl2json](https://github.com/tmccombs/hcl2json)
for `js/wasm`.

The previous parser was [benc-uk/hcl2-parser](https://github.com/benc-uk/hcl2-parser),
archived in 2022 and pinned to HCL v2.10. Its build needed Go 1.12 and
GopherJS and could not be reproduced.

## Building

You do not need this to work on the extension. `public/main.wasm.gz` is
committed, so a fresh clone needs neither Go nor Docker:

```
yarn install
yarn build
```

Rebuilding the parser needs Docker and nothing else:

```
make build-wasm
```

That writes `public/main.wasm.gz`, which webpack copies into `dist`.

### why a container

`src/vendor/wasm_exec.js` is Go's own glue and has to match the toolchain
that produced the binary. Building with whatever Go is installed on a machine
makes that pairing depend on who ran the build. The image in `GO_IMAGE` pins
it, and both files come out of the same run.

The container writes as the calling user, so nothing ends up owned by root.

To pin the patch release as well, set the full tag:

```
make build-wasm GO_IMAGE=golang:1.25.14
```

## Changing the HCL version

Edit `require` in `go.mod` and rebuild. The version currently in the binary
can be read back out of it:

```
gzip -dc public/main.wasm.gz | strings | grep -oE 'hashicorp/hcl/v2@v[0-9.]+' | sort -u
```

## Using OpenTofu's HCL instead

OpenTofu maintains a fork of HCL. For parsing it is the same as upstream, and
its branch lags, so upstream is used. To switch, add this to `go.mod` and
rebuild:

```
replace github.com/hashicorp/hcl/v2 => github.com/opentofu/hcl/v2 v2.20.2-0.20260915214928-efda35c2e6ff
```
