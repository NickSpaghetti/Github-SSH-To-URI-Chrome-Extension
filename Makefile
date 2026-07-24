.PHONY: install build test lint lint-fix format format-check audit audit-dev check clean refresh-chrome-token

install:
	yarn install

build:
	yarn build

test:
	yarn test

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
