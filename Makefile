.PHONY: install build test lint lint-fix format format-check check clean

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

check: lint format-check test

clean:
	rm -rf dist
