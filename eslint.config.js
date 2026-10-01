// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = tseslint.config(
    {
        ignores: [
            "dist/**",
            "dist-bench/**",
            "node_modules/**",
            // Go's module and build cache for the wasm container, not ours.
            ".gocache/**",
            "tests/cypress/**",
            "tests/e2e/**",
            "src/vendor/**",
            "coverage/**",
            "eslint.config.js",
        ],
    },
    eslint.configs.recommended,
    {
        files: ["**/*.ts", "**/*.mts", "**/*.tsx"],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            "prefer-const": "error",
            "no-var": "error",
            eqeqeq: ["error", "always", { null: "ignore" }],
            curly: ["error", "all"],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": [
                "error",
                { checksVoidReturn: { arguments: false } },
            ],
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/naming-convention": [
                "error",
                {
                    selector: "interface",
                    format: ["PascalCase"],
                    prefix: ["I"],
                },
                {
                    selector: "typeLike",
                    format: ["PascalCase"],
                },
                {
                    selector: ["function", "classMethod", "classProperty"],
                    modifiers: ["async"],
                    format: ["camelCase"],
                    custom: { regex: "Async$", match: true },
                },
                {
                    selector: ["function", "classMethod"],
                    format: ["camelCase"],
                },
                {
                    selector: "variable",
                    format: ["camelCase", "UPPER_CASE"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "default",
                    format: ["camelCase"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "property",
                    format: null,
                },
                {
                    selector: "import",
                    format: null,
                },
            ],
        },
    },
    {
        files: ["**/*.tsx"],
        rules: {
            "@typescript-eslint/naming-convention": [
                "error",
                {
                    selector: "interface",
                    format: ["PascalCase"],
                    prefix: ["I"],
                },
                {
                    selector: "typeLike",
                    format: ["PascalCase"],
                },
                {
                    selector: ["function", "classMethod"],
                    format: ["camelCase", "PascalCase"],
                },
                {
                    selector: "variable",
                    format: ["camelCase", "UPPER_CASE", "PascalCase"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "default",
                    format: ["camelCase"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "property",
                    format: null,
                },
                {
                    selector: "import",
                    format: null,
                },
            ],
        },
    },
    {
        // The layers, enforced rather than remembered. `domain` is the pure
        // Terraform rules: no I/O, so it can be read and tested without a
        // browser, a registry or a chrome runtime.
        files: ["src/domain/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/data-access/*", "**/services/*"],
                            message:
                                "domain is pure: it may not reach a layer that does I/O. Take what it needs as an argument instead.",
                        },
                    ],
                },
            ],
            "no-restricted-globals": [
                "error",
                { name: "chrome", message: "domain does no I/O." },
                { name: "fetch", message: "domain does no I/O." },
            ],
        },
    },
    {
        // `util` is what is left when a module knows neither the domain nor a
        // boundary: generic helpers only.
        files: ["src/util/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/domain/*", "**/data-access/*", "**/services/*"],
                            message:
                                "util holds no domain knowledge and no I/O. If it needs one, it is not a util.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["tests/unit/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        files: ["scripts/**/*.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "writable",
                process: "readonly",
                console: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                fetch: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
            },
        },
        rules: {
            "prefer-const": "error",
            "no-var": "error",
            eqeqeq: ["error", "always", { null: "ignore" }],
            curly: ["error", "all"],
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
    eslintConfigPrettier,
    {
        // eslint-config-prettier disables "curly" project-wide; reassert it since
        // brace requirements aren't a Prettier formatting concern.
        rules: {
            curly: ["error", "all"],
        },
    },
);
