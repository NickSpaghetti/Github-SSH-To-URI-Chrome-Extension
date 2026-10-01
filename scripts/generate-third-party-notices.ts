// Writes public/THIRD_PARTY_NOTICES.txt, the licenses of everything the
// extension ships that it did not write: the Go modules linked into the wasm,
// the Go runtime, and the npm packages bundled into the scripts.
//
// The Go side is listed by the build container into .gocache/notices, because
// only that toolchain knows what the wasm links. The npm side is read from the
// source maps of a throwaway build, so a package counts only if it is bundled.
//
// --check compares instead of writing, and fails when the file is out of date.
// A license this does not recognise fails either way: someone has to read it.
//
// Invoke via: make third-party-notices, or make check-third-party-notices

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const NOTICES = join(ROOT, "public", "THIRD_PARTY_NOTICES.txt");
const GO_NOTICES = join(ROOT, ".gocache", "notices");
const GO_MODULE_CACHE = join(ROOT, ".gocache", "mod");
const NODE_MODULES = "node_modules/";
const RULE = "=".repeat(78);

type Notice = { name: string; version: string; license: string; source: string; text: string };

const LICENSES: { id: string; phrases: string[] }[] = [
    { id: "MPL-2.0", phrases: ["Mozilla Public License", "Version 2.0"] },
    { id: "Apache-2.0", phrases: ["Apache License", "Version 2.0"] },
    { id: "MIT", phrases: ["Permission is hereby granted, free of charge"] },
    {
        id: "BSD-3-Clause",
        phrases: ["Redistribution and use in source and binary forms", "Neither the name"],
    },
    { id: "ISC", phrases: ["Permission to use, copy, modify, and/or distribute this software"] },
    { id: "Unicode-DFS-2016", phrases: ["Unicode Data Files", "Unicode, Inc."] },
];

const identify = (name: string, text: string): string => {
    const found = LICENSES.filter((license) =>
        license.phrases.every((phrase) => text.includes(phrase)),
    );
    if (found.length === 0) {
        throw new Error(
            `${name} has a license this script does not recognise. Read it, then add it to LICENSES.`,
        );
    }
    return found.map((license) => license.id).join(" AND ");
};

const readLicense = (dir: string, name: string): string => {
    const file = readdirSync(dir).find((entry) => {
        const lower = entry.toLowerCase();
        return (
            lower.startsWith("license") ||
            lower.startsWith("licence") ||
            lower.startsWith("copying")
        );
    });
    if (file === undefined) {
        throw new Error(`${name} ships no license file in ${dir}`);
    }
    return readFileSync(join(dir, file), "utf8").trim();
};

// The module cache and the module proxy spell an upper case letter as `!` and its lower case.
const escapeModulePath = (path: string): string =>
    Array.from(path)
        .map((char) => (char !== char.toLowerCase() ? `!${char.toLowerCase()}` : char))
        .join("");

const goNotices = (): Notice[] => {
    const goVersion = readFileSync(join(GO_NOTICES, "go-version.txt"), "utf8").trim();
    const runtime: Notice = {
        name: "Go standard library, runtime and wasm_exec.js",
        version: goVersion,
        license: "",
        source: `https://go.dev/dl/${goVersion}.src.tar.gz`,
        text: `${readFileSync(join(GO_NOTICES, "LICENSE"), "utf8").trim()}\n\n${readFileSync(join(GO_NOTICES, "PATENTS"), "utf8").trim()}`,
    };
    runtime.license = identify(runtime.name, runtime.text);

    const modules = readFileSync(join(GO_NOTICES, "modules.txt"), "utf8")
        .split("\n")
        .map((line) => line.trim().split(" "))
        .filter((fields) => fields.length === 2 && fields[1] !== "");

    return [
        runtime,
        ...modules.map(([path, version]): Notice => {
            const text = readLicense(
                join(GO_MODULE_CACHE, `${escapeModulePath(path)}@${version}`),
                path,
            );
            return {
                name: path,
                version: version,
                license: identify(path, text),
                source: `https://proxy.golang.org/${escapeModulePath(path)}/@v/${version}.zip`,
                text: text,
            };
        }),
    ];
};

const bundledPackages = (): Map<string, string> => {
    const out = mkdtempSync(join(tmpdir(), "notices-"));
    try {
        execFileSync("pnpm", ["vite", "build", "--sourcemap", "--outDir", out, "--emptyOutDir"], {
            cwd: ROOT,
            stdio: ["ignore", "ignore", "inherit"],
        });
        const packages = new Map<string, string>();
        for (const map of readdirSync(out).filter((file) => file.endsWith(".js.map"))) {
            const sources = (
                JSON.parse(readFileSync(join(out, map), "utf8")) as { sources: string[] }
            ).sources;
            for (const source of sources) {
                const at = source.lastIndexOf(NODE_MODULES);
                if (at === -1) {
                    continue;
                }
                const parts = source.slice(at + NODE_MODULES.length).split("/");
                const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
                packages.set(name, resolve(out, source.slice(0, at + NODE_MODULES.length) + name));
            }
        }
        return packages;
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
};

const npmNotices = (): Notice[] =>
    Array.from(bundledPackages()).map(([name, dir]): Notice => {
        const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
            version: string;
        };
        const text = readLicense(dir, name);
        const tarball = name.startsWith("@") ? name.split("/")[1] : name;
        return {
            name: name,
            version: manifest.version,
            license: identify(name, text),
            source: `https://registry.npmjs.org/${name}/-/${tarball}-${manifest.version}.tgz`,
            text: text,
        };
    });

const render = (notices: Notice[]): string => {
    const sections = notices
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((notice) =>
            [
                RULE,
                `${notice.name} ${notice.version}`,
                `License: ${notice.license}`,
                `Source: ${notice.source}`,
                RULE,
                "",
                notice.text,
                "",
            ].join("\n"),
        );
    return [
        "Third-party software shipped in IaC Module Linker",
        "",
        "IaC Module Linker is licensed under GPL-3.0. It includes the software below,",
        "each under its own license. The source of each is at the address given.",
        "",
        "Generated by `make third-party-notices`. Do not edit by hand.",
        "",
        ...sections,
    ].join("\n");
};

const main = (): void => {
    const notices = render([...goNotices(), ...npmNotices()]);
    if (!process.argv.includes("--check")) {
        writeFileSync(NOTICES, notices);
        console.log(`wrote ${NOTICES}`);
        return;
    }
    const current = existsSync(NOTICES) ? readFileSync(NOTICES, "utf8") : "";
    if (current !== notices) {
        console.error(
            `${NOTICES} is out of date with what the extension ships. Run make third-party-notices.`,
        );
        process.exit(1);
    }
    console.log(`${NOTICES} is up to date`);
};

main();
