#!/usr/bin/env node
// Records the registry.terraform.io responses that the unit tests depend on,
// so the suite runs offline and deterministically.
//
// Only the fields the code actually reads are kept. TerraformFetchService
// reads data.versions from the list endpoints and response.ok from the verify
// endpoints, so the full 2MB payloads are trimmed to that.
//
// Invoke via: make record-fixtures

"use strict";

const fs = require("fs");
const path = require("path");

const OUT_FILE = path.resolve(__dirname, "../tests/unit/fixtures/registry-responses.json");

// Every URL the unit suite requests. Captured by wrapping global fetch during
// a test run. Add to this list when a test starts exercising a new endpoint.
const URLS = [
    "https://registry.terraform.io/v1/modules/hashicorp/consul/aws",
    "https://registry.terraform.io/v1/modules/hashicorp/consul/aws/",
    "https://registry.terraform.io/v1/modules/hashicorp/consul/aws/0.11",
    "https://registry.terraform.io/v1/modules/hashicorp/consul/aws/1.0.0",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/vpc/aws",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/vpc/aws/",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/vpc/aws/5.0.0",
    "https://registry.terraform.io/v1/providers/hashicorp/aws",
    "https://registry.terraform.io/v1/providers/hashicorp/aws/",
    "https://registry.terraform.io/v1/providers/hashicorp/aws/4.58.0",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/rds/aws",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/rds/aws/6.0",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/security-group/aws",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/security-group/aws/",
    "https://registry.terraform.io/v1/modules/terraform-aws-modules/vpc/aws/6.7.3",
    "https://registry.terraform.io/v1/providers/hashicorp/aws/5.0",
    "https://registry.terraform.io/v1/providers/okta/okta",
    "https://registry.terraform.io/v1/providers/okta/okta/4.9.1",
    "https://registry.terraform.io/v1/providers/random",
    "https://registry.terraform.io/v1/providers/random/",
    "https://registry.terraform.io/v1/providers/hashicorp/random",
    "https://registry.terraform.io/v1/providers/hashicorp/random/",
    "https://registry.opentofu.org/v1/modules/terraform-aws-modules/vpc/aws/versions",
    "https://registry.opentofu.org/v1/providers/hashicorp/aws/versions",
];

// The code reads only these. Recording the rest would add 2MB of noise and
// invite tests to depend on fields the production code never touches.
//
// Three shapes: terraform publishes an array of strings, opentofu an array of
// objects, and opentofu modules nest that array under the matched module.
function trim(body) {
    if (body == null || typeof body !== "object") {
        return {};
    }
    if (Array.isArray(body.modules)) {
        return {
            modules: [{ versions: trimEntries(body.modules[0] && body.modules[0].versions) }],
        };
    }
    return Array.isArray(body.versions) ? { versions: trimEntries(body.versions) } : {};
}

function trimEntries(versions) {
    if (!Array.isArray(versions)) {
        return [];
    }
    return versions.map((entry) =>
        typeof entry === "string" ? entry : { version: entry.version },
    );
}

function countOf(data) {
    if (Array.isArray(data.versions)) {
        return data.versions.length;
    }
    if (Array.isArray(data.modules)) {
        return (data.modules[0].versions || []).length;
    }
    return 0;
}

async function record() {
    const recorded = {};
    for (const url of URLS) {
        const response = await fetch(url);
        let body;
        try {
            body = await response.json();
        } catch {
            body = null;
        }
        recorded[url] = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data: response.ok ? trim(body) : {},
        };
        const count = countOf(recorded[url].data);
        console.log(`${response.status} ${url} (${count} versions)`);
    }

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(recorded, null, 4) + "\n");
    console.log(`\nwrote ${OUT_FILE}`);
    console.log(`${Object.keys(recorded).length} responses, ${fs.statSync(OUT_FILE).size} bytes`);
}

record().catch((error) => {
    console.error(error);
    process.exit(1);
});
