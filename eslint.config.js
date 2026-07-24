// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = tseslint.config(
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "tests/cypress/**",
            "coverage/**",
            "eslint.config.js",
            "webpack.config.js",
        ],
    },
    eslint.configs.recommended,
    {
        files: ["**/*.ts", "**/*.tsx"],
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
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unsafe-assignment": "warn",
            "@typescript-eslint/no-unsafe-member-access": "warn",
            "@typescript-eslint/no-unsafe-argument": "warn",
            "@typescript-eslint/no-unsafe-call": "warn",
            "@typescript-eslint/no-unsafe-return": "warn",
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
