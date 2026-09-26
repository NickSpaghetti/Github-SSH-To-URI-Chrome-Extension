.PHONY: install build test e2e benchmark record-baseline lint lint-fix format format-check audit audit-dev check clean refresh-chrome-token record-fixtures generate-baseline check-corpus-sync build-wasm

install:
	yarn install

build:
	yarn build

test:
	yarn test

e2e:
	yarn build
	cd tests/e2e && yarn install && yarn e2e


benchmark:
	yarn build:bench
	cd tests/e2e && yarn install && yarn benchmark

record-baseline:
	yarn build:bench
	rm -rf tests/e2e/benchmarks/.recorded
	cd tests/e2e && yarn install && yarn benchmark || true
	node -r ts-node/register ./scripts/RecordBaseline.ts

lint:
	yarn lint

lint-fix:
	yarn lint:fix

format:
	yarn format

format-check:
	yarn format:check

audit:
	yarn audit:prod

audit-dev:
	-yarn audit:dev

check: lint format-check audit test

clean:
	rm -rf dist

refresh-chrome-token:
	node ./scripts/refresh-chrome-token.js

record-fixtures:
	node ./scripts/record-registry-fixtures.js

generate-baseline:
	node -r ts-node/register ./scripts/generate-corpus-baseline.ts

check-corpus-sync:
	node -r ts-node/register ./scripts/check-corpus-sync.ts

# The parser is built in a pinned container, not with whatever Go happens to
# be installed. wasm_exec.js is Go's own glue and has to match the toolchain
# that produced the binary, so both come out of the same image.
#
# Only needed to change the parser. The result is committed, so building the
# extension needs neither Go nor Docker.
GO_IMAGE ?= golang:1.25

build-wasm:
	docker run --rm \
		--user "$$(id -u):$$(id -g)" \
		-v "$(CURDIR):/src" \
		-w /src/wasm \
		-e GOFLAGS=-mod=mod \
		-e GOCACHE=/tmp/go-build \
		-e GOMODCACHE=/tmp/go-mod \
		$(GO_IMAGE) sh -euc '\
			go mod tidy; \
			GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o main.wasm ./; \
			cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" /src/src/vendor/wasm_exec.js'
	gzip -9 -f -c wasm/main.wasm > public/main.wasm.gz
	rm -f wasm/main.wasm
	@echo "built with $(GO_IMAGE)"
	@ls -la public/main.wasm.gz
