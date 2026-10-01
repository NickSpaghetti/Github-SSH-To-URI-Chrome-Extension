# Privacy Policy for IaC Module Linker

Last updated: October 1, 2026

IaC Module Linker is a Chrome extension that converts Terraform and OpenTofu
module sources into clickable links. This policy describes every piece of data
it handles.

## What the extension reads

The extension reads the text of `.tf`, `.tofu`, `.hcl`, `.tf.json`, and
`.tofu.json` files on github.com pages you visit, to locate module source
strings. It also reads the commit sha shown in the file header.

It reads gitlab.com pages only after you allow it. Access to gitlab.com is an
optional permission. The extension asks for it when you click
`Allow on gitlab.com` in its popup, and you can take it back at any time from
the site access setting on `chrome://extensions`. Until you allow it, the
extension does not run on gitlab.com pages.

On github.com it reads only content already displayed on the page you are
viewing. On gitlab.com it also fetches the file you are viewing, described
below.

## What the extension stores

Parsed modules are cached in `chrome.storage.session`, on your own device. One
entry is written per GitHub or GitLab file page where the extension parsed modules. Each
entry holds:

- The key `modules:<hostname>:<path>`, built from the address of that file page.
- The commit sha of the file, used to skip reparsing a file that has not changed.
- The modules found in the file: name, source, source type, version constraint, resolved version, and resolved link.

Entries stay for the rest of the browser session. This means the cache holds
the paths of the GitHub and GitLab file pages you viewed during that session. It does not
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

Registry requests are restricted to those two hosts by an allowlist in the
source. Chrome may keep the registry responses in its own HTTP cache.

On a gitlab.com file page, the extension fetches the text of that same file
from gitlab.com, at the page's address with `/-/raw/` in place of `/-/blob/`.
GitLab renders a long file a piece at a time as you scroll, so the page never
holds all of it. The request goes to the site you are already on and carries
your gitlab.com session the same way the page does, which is how it reads a
private project you can see. Nothing is sent to gitlab.com beyond the address
of the file.

No other network requests are made.

## Where links point

Generated links can point to GitHub, GitLab, `registry.terraform.io`, and
`search.opentofu.org`, along with any other host a module source names. The
extension never requests these pages itself. Opening one is ordinary
navigation you start by clicking the link.

## What the extension does not do

- Does not collect personally identifiable information.
- Does not read credentials, form data, or personal communications.
- Does not read any site other than github.com, and gitlab.com once you allow it.
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
