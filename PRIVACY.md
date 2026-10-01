# Privacy Policy for IaC Module Linker

Last updated: September 30, 2026

IaC Module Linker is a Chrome extension that converts Terraform and OpenTofu
module sources into clickable links. This policy describes every piece of data
it handles.

## What the extension reads

The extension reads the text of `.tf`, `.tofu`, `.hcl`, `.tf.json`, and
`.tofu.json` files rendered on github.com pages you visit, to locate module
source strings. It also reads the commit sha and commit date GitHub shows in
the file header. It reads only content already displayed on the page you are
viewing.

## What the extension stores

Parsed modules are cached in `chrome.storage.session`, on your own device. One
entry is written per GitHub file page where the extension parsed modules. Each
entry holds:

- The key `modules:<hostname>:<path>`, built from the address of that file page.
- The commit sha and last commit date of the file, used to skip reparsing a file that has not changed.
- The modules found in the file: name, source, source type, version constraint, resolved version, and resolved link.

Entries stay for the rest of the browser session. This means the cache holds
the paths of the GitHub file pages you viewed during that session. It does not
record page titles or when you visited. Session storage lives in memory and
Chrome empties it when the browser closes. The extension also drops its
entries if session storage fills up. Nothing in the cache is transmitted
anywhere.

## What leaves your device

The extension sends module and provider addresses, for example
`terraform-aws-modules/vpc/aws`, to two public registry APIs to look up
published versions:

- `https://registry.terraform.io`
- `https://registry.opentofu.org`

Outbound requests are restricted to those two hosts by an allowlist in the
source. Chrome may keep the registry responses in its own HTTP cache. No other
network requests are made.

## Where links point

Generated links can point to GitHub, `registry.terraform.io`, and
`search.opentofu.org`, along with any other host a module source names. The
extension never requests these pages itself. Opening one is ordinary
navigation you start by clicking the link.

## What the extension does not do

- Does not collect personally identifiable information.
- Does not read credentials, form data, or personal communications.
- Does not read any site other than github.com.
- Does not keep anything past the browser session.
- Does not run analytics, telemetry, or tracking of any kind.
- Does not sell or transfer user data to third parties.
- Does not execute remote code. The HCL parser is a WebAssembly file shipped inside the extension package.

## Limited use

IaC Module Linker's use of information received from Chrome APIs adheres to the
Chrome Web Store User Data Policy, including the Limited Use requirements. Data
is used only to provide the extension's single purpose, and is not transferred,
sold, or used for any unrelated purpose.

## Source

The extension is open source under GPL-3.0. Every claim above can be verified
in the source: https://github.com/NickSpaghetti/iac-module-linker

## Contact

Open an issue at
https://github.com/NickSpaghetti/iac-module-linker/issues
