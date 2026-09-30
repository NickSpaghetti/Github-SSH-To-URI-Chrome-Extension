.PHONY: install build test e2e benchmark record-baseline lint typecheck lint-fix format format-check audit audit-dev check clean refresh-chrome-token record-fixtures generate-baseline check-corpus-sync build-wasm clean-go-cache

# Generated, not committed, so every target that reads one names both as
# prerequisites. `jest` needs them too, not just the bundle: `HclParser.ts`
# imports `wasm_exec.js`. Rebuilt only when the Go sources change.
WASM_SOURCES = wasm/main.go wasm/go.mod wasm/go.sum
WASM = public/main.wasm.gz src/vendor/wasm_exec.js

# Installed when the manifest or the lockfile moves, the same way the parser is
# built. A no-op `yarn install` still costs a second, so the targets below name
# this instead of running it every time. The touch is because yarn does not
# always change the directory's own timestamp.
node_modules: package.json yarn.lock
	yarn install
	@touch node_modules

# Forces it, for a tree that install state has got out of step with.
install:
	yarn install
	@touch node_modules

build: node_modules $(WASM)
	yarn build

test: node_modules $(WASM)
	yarn test

e2e: node_modules $(WASM)
	yarn build
	cd tests/e2e && yarn install && yarn e2e


# Both builds: the browser runs the readable one, and the popup benchmark
# weighs the shipping one to gate what a user downloads.
benchmark: node_modules $(WASM)
	yarn build
	yarn build:bench
	cd tests/e2e && yarn install && yarn benchmark

record-baseline: node_modules $(WASM)
	yarn build
	yarn build:bench
	rm -rf tests/e2e/benchmarks/.recorded
	cd tests/e2e && yarn install && yarn benchmark || true
	node -r ts-node/register ./scripts/RecordBaseline.ts

lint: node_modules
	yarn lint

# Checks the .svelte files and the props crossing into them, which `tsc`
# resolves but does not typecheck.
typecheck: node_modules $(WASM)
	yarn typecheck

lint-fix: node_modules
	yarn lint:fix

format: node_modules
	yarn format

format-check: node_modules
	yarn format:check

audit: node_modules
	yarn audit:prod

audit-dev: node_modules
	-yarn audit:dev

check: lint typecheck format-check audit test

clean:
	rm -rf dist

# Separate from `clean`: a build cache, not build output.
clean-go-cache:
	rm -rf "$(GO_CACHE)"

refresh-chrome-token: node_modules
	node ./scripts/refresh-chrome-token.js

record-fixtures: node_modules
	node ./scripts/record-registry-fixtures.js

generate-baseline: node_modules
	node -r ts-node/register ./scripts/generate-corpus-baseline.ts

check-corpus-sync: node_modules
	node -r ts-node/register ./scripts/check-corpus-sync.ts

# The parser is built in a pinned container, not with whatever Go happens to
# be installed. wasm_exec.js is Go's own glue and has to match the toolchain
# that produced the binary, so both come out of the same image.
#
# The toolchain is pinned in wasm/Dockerfile, not here, so dependabot can see
# it. Docker caches the image, so building it costs nothing after the first run.
WASM_BUILDER ?= iac-module-linker-wasm-build

# The container is ephemeral, so Go's caches live outside it. Without this
# every build re-downloads the module graph. Gitignored, safe to delete.
GO_CACHE ?= $(CURDIR)/.gocache

$(WASM) &: $(WASM_SOURCES) wasm/Dockerfile
	@mkdir -p "$(GO_CACHE)/build" "$(GO_CACHE)/mod"
	docker build -q -t $(WASM_BUILDER) wasm/
	docker run --rm \
		--user "$$(id -u):$$(id -g)" \
		-v "$(CURDIR):/src" \
		-v "$(GO_CACHE):/gocache" \
		-w /src/wasm \
		-e GOFLAGS=-mod=mod \
		-e GOCACHE=/gocache/build \
		-e GOMODCACHE=/gocache/mod \
		$(WASM_BUILDER) sh -euc '\
			go mod tidy; \
			GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o main.wasm ./; \
			cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" /src/src/vendor/wasm_exec.js'
	gzip -9 -f -c wasm/main.wasm > public/main.wasm.gz
	rm -f wasm/main.wasm
	@echo "built with $$(docker run --rm $(WASM_BUILDER) go version)"
	@ls -la $(WASM)

# Forces a rebuild, for a toolchain bump or a container layer gone stale.
build-wasm:
	rm -f $(WASM)
	$(MAKE) $(WASM)
