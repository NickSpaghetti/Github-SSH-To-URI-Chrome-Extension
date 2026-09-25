# module source rework

Plan for replacing the module source classifier in `HclSourceService`, and the
test infrastructure it needs. Working notes, not committed.

Status: design agreed. Phase A complete.

## why

`getSourceType()` classifies module sources with 5 independent boolean
predicates. Each one re-scans the raw string for a different incidental
character. They cannot share work, cannot be ordered safely, and adding a
source type means adding a sixth predicate that has to stay consistent with
the other 5. That is why `git::` ended up special cased twice instead of
generalized.

Measured against every source form in OpenTofu's module sources doc:
22 of 48 fixture sources come back unclassified. 3 of those are correct
rejections from the security cases. 19 are real gaps.

### root causes

1. **Predicates match characters, not grammar.** `isRegistry` is defined by
   absence: no `.`, no `//`, no `@`, no `:`. A registry address with a
   hostname has a dot. One with a subDirectory has `//`. Both are rejected by
   construction.
2. **`git::` is special cased**, in `isHost` and again in `isSSH`, instead of
   parsing the general `TYPE::` prefix. `hg::`, `s3::` and `gcs::` fall
   through every check.
3. **No detector stage.** Terraform and OpenTofu normalize shorthand before
   classifying. `github.com/x/y` and `git@host:path` never become something
   the predicates can recognize. These are the most common real world forms.
4. **Ordering makes classification depend on surface form.** `isHost` runs
   first, so `https://app.terraform.io/x/y/z` classifies as `url` while
   `app.terraform.io/x/y/z` classifies as `privateRegistry`. Same module.
5. **`isPrivateRegistry` is hardcoded to terraform.io.** `app.terraform.io` is
   public SaaS, not a private registry. A real private registry returns null,
   and so does `registry.opentofu.org`.

## decisions

| Area                 | Decision                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| Parser swap          | Deferred. Classifier first.                                               |
| No regex             | New code only. `HclVersionService` keeps its 5 sites, tracked separately. |
| `SourceTypes`        | Convert to string enum, extend, demote to display label.                  |
| Naming               | No "kind". Use `sourceType`, `SourceTypes`, "detectors", "resolvers".     |
| Placement            | New module. Migrate tests in batches.                                     |
| Fixture repo         | `NickSpaghetti/iac-module-linker-fixtures`, public.                       |
| E2E runner           | Playwright. `launchPersistentContext` plus `--load-extension`.            |
| Release gate         | E2E gates auto publish, with manual override.                             |
| `modifiedSourceType` | Renamed to `resolvedUrl`. Done, 11 sites, 143 tests green.                |

## design

One parse producing one struct. Flags drive behavior. `sourceType` is a label
for the popup and nothing else.

### struct

```
ModuleSource:
  raw

  # decomposition, pure delimiters
  forcedType    # git | hg | s3 | gcs | oci | ""   from TYPE::
  scheme        # https | ssh | oci | ""
  user          # "git" from git@
  host, path
  subDirectory        # from //
  ref           # from ?ref= ?tag= ?depth=

  # registry interpretation
  registryHost  # "" means default registry
  namespace, name, targetSystem

  flags         # bitfield
  sourceType    # popup label only
```

Flags: `HasForcedType`, `HasSubdir`, `HasRef`, `LocalPath`, `RegistryAddress`,
`GitForge`, `SshTransport`, `Archive`, `OciArtifact`, `Browsable`,
`Unsupported`.

Bundles are constants that expand to flags, for example
`GitOverSsh = GitForge | SshTransport`. They are not subclasses.

### stages

```
raw  ->  split()  ->  detect()  ->  classify()  ->  link()
         delimiters   shorthand     flags plus     browse url
         only         to fields     sourceType     from flags
```

Each stage is a pure function from struct to struct. `link()` never reads
`raw`.

`detect()` is the stage missing today. It is where shorthand becomes
canonical: `github.com/x/y` gets a scheme and a forced type, `git@host:path`
gets recognized by delimiter position rather than by looking for `::`.

### files

```
src/types/ModuleSource.ts          struct, flags, SourceTypes
src/util/moduleSource/split.ts     delimiters only
src/util/moduleSource/detect.ts    shorthand to fields and bits
src/util/moduleSource/classify.ts  flags and sourceType
src/services/ModuleSourceLinker.ts the only piece needing ITerraformFetchService
```

3 of the 4 stages have no dependencies. Only link building touches I/O. The
current tests need a fake fetch service just to ask whether a string is a
path.

### zero value

`getSourceType` returns `Nullable<SourceTypes>` today, and null means two
different things. "I do not recognize this" and "there is no link for this"
are not the same answer. `pathToUrl` throws on top of that.

An unparseable source becomes a `ModuleSource` with `Unsupported` set and
`sourceType` of `unknown`. Never null, never a throw. This is what makes
`oci://`, `s3::` and `gcs::` expressible. They get classified and labeled,
with `Browsable` off so no link is offered.

### string enum

Done. `SourceTypes` now has 10 members:

```
url  path  ssh  registry  privateRegistry  git  mercurial  oci  archive  unknown
```

The numeric enum was persisted. `popup.tsx:162` rendered
`SourceTypes[content.sourceType]`, and `ChromeStorageCache` writes
`DisplayHlcModule` into `chrome.storage.local`, so the numbers survived
extension updates. Inserting a member in the middle renumbered the rest and
made stale cache entries render the wrong label.

String enums have no reverse mapping, so the 3 `SourceTypes[...]` call sites
were replaced. The value is now the label. `toSourceTypeLabel` guards the
read path: a cache written by an older build holds numbers, and anything that
is not a current member reads as `unknown` rather than rendering a raw number.

New members and what they carry:

| member      | covers                                          | linked                        |
| ----------- | ----------------------------------------------- | ----------------------------- |
| `git`       | `github.com/x/y`, `bitbucket.org/x/y` shorthand | yes                           |
| `mercurial` | `hg::`                                          | yes, the underlying http url  |
| `archive`   | `s3::`, `gcs::`, plain `.zip` over https        | yes, the underlying https url |
| `oci`       | `oci://`                                        | no, not an http scheme        |
| `unknown`   | unparseable, and the rejected security cases    | no                            |

The rule for forced types: strip the prefix, and if what remains is an http or
https url, that is the link. Only `oci://` fails that test.

The popup already renders a plain module name when `resolvedUrl` is null, so
the label without a link case needs no UI work.

## corpus schema

A corpus row is `{ source, expectedSourceType, expectedResolvedUrl }`. Flags
are not pinned, for 3 reasons.

1. The differential cannot test them. The old implementation has no flags, so
   the only fields both sides produce are `sourceType` and `resolvedUrl`.
2. Pinning 48 rows by 11 flags makes a change detector. Any flag layout
   refactor breaks 48 expectations while behavior is unchanged. That is the
   editing cost the flag design exists to remove.
3. Almost every flag has an observable proxy, which is a sign the flag set is
   shaped correctly.

| Flag                                                                 | Observable as                                     |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `Browsable`                                                          | `resolvedUrl !== null`                            |
| `Unsupported`                                                        | `sourceType === unknown`                          |
| `HasSubdir`, `HasRef`                                                | present in `resolvedUrl`                          |
| `LocalPath`, `RegistryAddress`, `GitForge`, `Archive`, `OciArtifact` | maps to `sourceType`                              |
| `SshTransport`                                                       | `sourceType === ssh`                              |
| `HasForcedType`                                                      | no proxy, and does not matter if the url is right |

Flags get covered by focused stage tests in batches 1 through 3, where they
are the subject, not by the end to end corpus.

### expected is not baseline

2 artifacts, not 1.

- `baseline`. Machine generated from current code. 26 classified, 22 null.
  Guards against regression.
- `expected`. Hand authored from the OpenTofu spec. What should happen.
  Measures progress.

The differential asserts `new === baseline` on every row except the 19 on the
known gap list, where it asserts `new === expected`. Batches move rows from
one list to the other. Done is the gap list reaching zero.

Generating `expected` by snapshotting current behavior would enshrine all 22
nulls as correct and certify the bugs.

## phases

**A. fixture repo.** Done. https://github.com/NickSpaghetti/iac-module-linker-fixtures

20 files, all 18 source forms plus the 4 security cases plus `.tofu` and
`.tf.json`. Stable refs that must not be renamed: `main`, `v1.0.0`,
`modules/vpc/`, `modules/vpc/main.tf`, `nested/deep/consumer.tf`. All verified
to return 200.

**B. corpus and differential harness.** Corpus rows, baseline snapshot, gap
list. Sync test, cron only, asserting the corpus matches the fixture repo.

Prerequisite done: `MockFetchService` was calling real `fetch()`, so the unit
suite hit `registry.terraform.io` on every PR. It now serves recorded
responses from `tests/unit/fixtures/registry-responses.json`. Unknown URLs
throw instead of falling through to the network. Refresh with
`make record-fixtures`.

Only the fields the code reads are recorded. `TerraformFetchService` reads
`data.versions` and `response.ok`, so 2.1 MB of live payload trims to 29 KB.
The 404 responses are kept because they drive `verifyTerraformVersionAsync`
to false.

**B is done apart from the sync check.** 33 gaps. 51 corpus rows in `tests/unit/fixtures/module-sources.ts`,
baseline in `corpus-baseline.json`, regression test in
`ModuleSourceCorpus.test.ts`. 28 of 51 classified, 33 gaps against the
authored expectations. Regenerate with `make generate-baseline`.

The gap count is asserted in the test. It drops as batches land, and reaching
0 is the definition of done.

Still outstanding: the cron only sync test asserting the corpus matches the
fixture repo. The corpus is currently kept in step by rerunning the skeleton
extraction by hand, which is exactly the drift the sync test is meant to
catch. Build it before the fixture repo and the corpus have any reason to
disagree.

The 3 userinfo spoofing cases were added to `14-security-cases.tf` after
finding 5. The baseline records the current behavior, so the exploit is
captured in the repo rather than only in a doc:

```
userinfo_spoof_forced_git   url   https://evil.com/a/b/tree/main/
userinfo_spoof_https        url   https://a.terraform.io@evil.com/x
userinfo_spoof_schemeless   null  null
```

**C. classifier.** Batches 1 through 5.

Batch 1 is done. `src/types/ModuleSource.ts` holds the struct, the flag
bitfield, the zero value and `describeFlags`. `src/util/moduleSource/split.ts`
decomposes `[TYPE::]LOCATOR[//SUBDIR][?QUERY]` by scanning delimiters. 20 tests
in `tests/unit/util/moduleSource/Split.test.ts`.

No regex. No host parsing either, that waits for `detect` where the URL parser
can do it. Cases worth keeping: `oci://` is a scheme and not a forced type,
`&depth=1` is not the ref, and `?digest=sha256:abc` does not break on its
colon because the query is taken before the subDirectory.

Batch 2 is done. `src/util/moduleSource/detect.ts` resolves what a locator is
and expands shorthand. 17 tests in `Detect.test.ts`.

The three most common broken forms now resolve:

| source                          | detected as                              |
| ------------------------------- | ---------------------------------------- |
| `github.com/owner/repo`         | git over https, host github.com          |
| `bitbucket.org/owner/repo`      | git over https, host bitbucket.org       |
| `git@github.com:owner/repo.git` | ssh transport, user git, host github.com |

Every hostname goes through the URL parser. None are sliced by hand. The
3 rejection rules are userinfo present, an IP literal host, and a colon before
the first slash that is not a scheme separator.

What the probe settled, recorded so it is not rediscovered:

| input                            | parser result                          | outcome                                              |
| -------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `user@a.terraform.io/path`       | host is right, `username` is set       | reject on userinfo                                   |
| `3325256838\a.terraform.io/path` | host canonicalizes to `198.51.100.134` | reject on IP literal                                 |
| `a.terraform.io\@evil.com/x`     | host `a.terraform.io`, no userinfo     | accept, unchanged from today                         |
| `javascript:...`                 | colon before first slash, no `://`     | reject                                               |
| `terraform-aws-modules/vpc/aws`  | host would be `terraform-aws-modules`  | a dot in the first segment is what marks a real host |

An IP literal is detected by its last label being all digits. No TLD is, so no
regex is needed.

`FORGE_HOSTS` is github.com and bitbucket.org, matching the detectors
go-getter actually ships. GitLab has no detector upstream, so it stays a
registry host here too.

Batch 3 is done. `src/util/moduleSource/classify.ts` derives the label and the
`Browsable` bit. 16 tests in `Classify.test.ts`.

**The pipeline produces the corpus label for all 51 rows.** `Browsable` agrees
with whether a link is expected on every row that is not pending. The
classification half of the rework is finished. What remains is link building
and wiring.

Label precedence, first match wins:

| check                                | label             |
| ------------------------------------ | ----------------- |
| `Unsupported`                        | `unknown`         |
| `LocalPath`                          | `path`            |
| `OciArtifact`                        | `oci`             |
| forced type `hg`                     | `mercurial`       |
| `Archive`                            | `archive`         |
| `RegistryAddress`, terraform.io host | `privateRegistry` |
| `RegistryAddress`                    | `registry`        |
| `SshTransport`                       | `ssh`             |
| `ShorthandAddress`                   | `git`             |
| http or https scheme                 | `url`             |

`git::https://github.com/...` stays `url`. The extension runs in a browser, so
an http address is a url whatever protocol fetches it. `git` is reserved for
shorthand, which is the form that carries no address at all.

`privateRegistry` still means a terraform.io host specifically. That is the
label users already see, so it is preserved rather than renamed. The
difference from before is that it is no longer the only host qualified
registry path, so `registry.opentofu.org` and third party hosts now classify
instead of returning null.

`Browsable` is set for `LocalPath`, `RegistryAddress`, `GitForge`, or an http
scheme. Only `oci://` and rejected sources are left unlinkable.

Batch 4 is done. `src/services/ModuleSourceLinker.ts` builds the browse url.
15 tests in `ModuleSourceLinker.test.ts`.

**45 of 49 non pending rows match exactly.** All 4 misses are the version
resolver, which is deliberately untouched:

```
rds/aws        >= 6.0, < 7.0   got 6.0.0   want 6.13.1
security-group (none)          got 1.0.0   want 6.0.0
hashicorp/aws  >= 5.0, < 6.0   got 5.0.0   want 5.100.0
hashicorp/random (none)        got 0.1.0   want 3.9.1
```

Those 4 ids are listed in `VERSION_BLOCKED` in the test, and the assertion is
that the mismatch set equals that list exactly. Fixing the resolver empties
the list and the test says so.

Bug 1 does not appear in that list. A bare provider name no longer throws,
because `linkRegistryAsync` normalizes the address before the lookup instead
of after. That is new code written correctly, not a fix to the resolver. The
version it returns is still wrong, which is bug 2.

Every branch in the linker is chosen by a flag. `sourceType` is never read.

Link rules:

| flag                          | url                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| not `Browsable`               | null                                                                                        |
| `LocalPath`                   | resolved against the page, `tree` or `blob` by target                                       |
| `RegistryAddress` with a host | `https://<host><path>`, no version segment                                                  |
| `RegistryAddress`             | `<registry>/<route>/<address>/<version>`, `/submodules/<name>` when there is a subDirectory |
| `GitForge` on github.com      | `<repo>/<tree or blob>/<ref or main>/<subdir>`                                              |
| `GitForge` elsewhere          | repository root, since only GitHub's layout is known                                        |
| anything else browsable       | the locator, which is the address itself                                                    |

File or directory is decided by whether the last path segment contains a dot.
That keeps working for `.tofu` and `.tf.json` with no extension list to
maintain. A directory with a dot in its name would be linked as a file, and
GitHub redirects that case.

| Batch | Work                                                                    | Tests                                                  |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 0     | corpus, baseline snapshot                                               | new                                                    |
| 1     | `split()`                                                               | new                                                    |
| 2     | `detect()`                                                              | new                                                    |
| 3     | `classify()`                                                            | port `getSourceType` describes, differential goes live |
| 4     | `link()`                                                                | port `resolveSourceAsync` plus all 4 security tests    |
| 5     | repoint `DisplayHclModule`, delete `HclSourceService` and old test file |                                                        |

**D. Playwright e2e. Done.** `tests/e2e`, 9 specs, all passing against real
GitHub pages with the built extension loaded.

Cypress is retired. Its 3 specs loaded a Java file and never installed the
extension, and it gated the Chrome Web Store publish.

| workflow        | runs                                          |
| --------------- | --------------------------------------------- |
| `branch.yml`    | lint, format, audit, build, unit. No network. |
| `cron-test.yml` | the above plus end to end                     |
| `release.yaml`  | unit, then end to end, then publish           |

The release override is `workflow_dispatch` with a `skip_e2e` input. On a
`release` trigger the input is undefined, so the tests run.

Extensions cannot load in a headless browser, so the run is headed under
`xvfb-run` in CI. Playwright's bundled headless shell cannot load extensions
at all, which is what `headless: false` avoids.

Link resolution is checked against real GitHub, spaced out and retried once,
and a 429 is skipped rather than failed. GitHub rate limits an unauthenticated
burst and that says nothing about the link.

#### finding 6, found by the first e2e run

Not visible to any unit test. The extension appeared to work and did not.

`HclService.findSourcesAsync` returned `[]` both when the file held no module
sources and when GitHub had not yet rendered the file. `hydrateModulesAsync`
treated `null` as a cache miss but `[]` as an answer, so the empty result of a
race was cached and never reconsidered.

Measured on a first visit, before the fix:

```
t=500ms   textarea 619 chars   MODULES=[]   anchors=0
t=6000ms  textarea 619 chars   MODULES=[]   anchors=0
after clearing the cache and reloading      anchors=4
```

The text was there the whole time. The cache was not.

2 changes. `findSourcesAsync` returns `null` when there is no source text to
read, which is different from an empty array, and the caller does not cache
that. Then `findSourcesWhenRenderedAsync` polls for up to 5 seconds, which
only happens on a page whose extension is handled and whose modules are not
cached.

After:

```
t=500ms   MODULES=1884 bytes   anchors=4
```

This is the bug the whole fixture repo was built to find, and it took one run.

**E. OpenTofu work. Done.** See below.

Parser swap comes after all of this.

## bugs the corpus found

Found on the first run of batch 0. None were known before the fixture repo
existed.

### 1. bare provider name throws, and takes the whole page with it

`registryToUrlAsync` looks up the version with `source`, then applies the
`hashicorp/` prefix 4 lines later when building the url.

```ts
const version = await this.hlcVersionService.getTerraformProviderVersionAsync(source, ...);
const sourcePaths = source.split("/");
let sourcePath = source;
if (sourcePaths.length === 1 && providerType === PROVIDERS) {
    sourcePath = `${HASHICORP}/${source}`;   // too late
}
```

`source = "random"` requests `/v1/providers/random`, gets a 404, and
`getTerraformVersionsAsync` throws.

The blast radius is the real problem. `HclService.findSourcesAsync` wraps the
whole module loop in a try and the catch returns `[]`, discarding every result
accumulated so far. So one failing lookup removes every link on the page and
the popup reports no modules found.

This is not specific to bare names. Any registry failure reaches the same
catch: a renamed module, a typo, a registry outage.

Fix: compute `sourcePath` before the lookup and pass it. Separately, resolution
failures must not throw. This is the case the zero value rule exists for.

### 2. no version constraint resolves to the oldest release

`semver.satisfies(version, "")` is true, because an empty range means `*`. The
loop in `getTerraformProviderVersionAsync` returns the first match, and the
registry returns versions ascending.

`terraform-aws-modules/security-group/aws` with no version links to `1.0.0`.
Latest is `6.0.0`. The `allVersions.at(-1)` fallback is correct but
unreachable, because an empty constraint always matches on the first pass.

### 3. relative paths to a directory emit blob instead of tree

`pathToUrl` is `new URL(source, sourcePageUrl)`, so it inherits `blob` from the
page url no matter what the target is. `hostToUrl` and `sshToUrl` both pick
`tree` or `blob` by checking the extension. `pathToUrl` does not.

Verified against the fixture repo: 3 of the 16 generated GitHub urls return
301 rather than 200, and all 3 are directory targets. GitHub redirects, so the
link works and nobody noticed. It is still wrong, and it depends on GitHub
keeping that redirect.

### 5. userinfo in an http source spoofs the link target

Not fixed. Present in `HclSourceService` today.

`https://a.terraform.io@evil.com/x` reads as terraform.io and resolves to
evil.com. The extension classifies it as `url`, links it verbatim, and
`isSafeHttpUrl` passes because the protocol is https. `isSafeHttpUrl` only
checks the scheme, never the authority.

```
source   https://a.terraform.io@evil.com/x
type     url
link     https://a.terraform.io@evil.com/x   -> browser goes to evil.com
```

The `git::` form is worse, because `hostToUrl` drops the userinfo while
rebuilding and the result carries no `@` at all.

```
source   git::https://github.com@evil.com/a/b.git
link     https://evil.com/a/b/tree/main/      -> looks like an ordinary path
```

Reachable by viewing a repo whose `.tf` contains such a source. The rendered
link text is the attacker chosen module name, so it can read `vpc`. This is
link spoofing, not code execution.

Why the existing tests missed it: userinfo is tested against
`isPrivateRegistry`, never against the `url` path.

Note the contrast with the accepted case. `a.terraform.io\@evil.com/x` is
safe, because the backslash normalizes to a slash and ends the authority, so
`@evil.com` lands in the path. The dangerous twin is the same string without
the backslash.

`detect` rejects all 3 spoofing forms. The rule is that userinfo is legitimate
only on ssh, where `git@host` is the normal form.

### 4. version constraints resolve to the floor, not the version you would get

Terraform and OpenTofu select the highest version satisfying a constraint.
`getTerraformProviderVersionAsync` returns the first match in an ascending
list, which is the lowest.

| source                          | constraint      | current | correct |
| ------------------------------- | --------------- | ------- | ------- |
| `terraform-aws-modules/rds/aws` | `>= 6.0, < 7.0` | 6.0.0   | 6.13.1  |
| `hashicorp/aws`                 | `>= 5.0, < 6.0` | 5.0.0   | 5.100.0 |

The aws case is the one to look at. The link points 100 minor versions behind
the release the user would actually get.

Bug 2 is the same defect with an empty constraint. Both are fixed by selecting
the maximum satisfying version instead of the first.

## fixing the bugs

Order agreed: containment, then the switch, then the constraint translator.

### B. error containment. Done.

The throw is not removed. It is prevented from being catastrophic. 3 layers:

| layer                          | change                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| `ModuleSourceLinker.linkAsync` | wraps the build and returns null on any failure                     |
| `DisplayHclModule.buildAsync`  | a failed resolve leaves `resolvedUrl` null, the row keeps its label |
| `HclService.findSourcesAsync`  | the parse stays in one try, each module is built in its own         |

Before, the module loop sat inside the parse try and the catch returned `[]`,
discarding results already collected. Now a file that will not parse still
returns nothing, which is right, but a single module that cannot be resolved
costs only its own link.

3 tests in `ErrorContainment.test.ts` drive a registry address that is not in
the recorded fixtures, which is the same shape as a renamed module, a typo, or
a registry outage. The middle module fails and the modules either side keep
their links.

`HclService.findSourcesAsync` itself is not unit tested. It reads
`document.getElementById`, jest runs in the node environment here, and jsdom
is not installed. The change is small and the layer beneath it is covered.

The corpus baseline still records `threw` for the bare provider name, because
the generator calls `HclSourceService` directly rather than through
`DisplayHclModule`. That is accurate. The throw is still there. C removes it.

### A. the switch. Done.

`DisplayHclModule` now runs `split`, `detect`, `classify`, then
`ModuleSourceLinker`. `HclSourceService.ts` and its 62 test file are deleted.

**Gap count 33 to 4.** 51 of 51 rows classify, and the only 4 remaining are
the version rows that C owns. No row throws.

Findings closed by deleting the code that held them:

| finding                                 | closed |
| --------------------------------------- | ------ |
| 1a registry lookup before normalization | yes    |
| 3 local directory linked as blob        | yes    |
| 5 userinfo spoofing                     | yes    |

All 7 security rows now read as expected:

```
backslash_no_confusion      privateRegistry  https://a.terraform.io/@evil.com/x
decimal_ip_backslash        unknown          no link
javascript_scheme           unknown          no link
userinfo_smuggling          unknown          no link
userinfo_spoof_forced_git   unknown          no link
userinfo_spoof_https        unknown          no link
userinfo_spoof_schemeless   unknown          no link
```

Also in this batch:

- `hostUri` is gone from the class and the interface. It was write only, and
  its declared type stopped being true after a cache round trip.
- The guard it was accidentally providing is now explicit.
  `buildAsync` rejects a page url that is not http or https, using
  `isSafeHttpUrl` rather than `new URL`, which parses `javascript:` happily.
  It throws, because the page url is an invariant and every module on the page
  depends on it.
- `sourceType` is no longer nullable. It is `SourceTypes.unknown` instead, so
  the dead null branch in `popup.tsx` is gone. `toSourceTypeLabel` still
  guards the read path for caches written by older builds.
- The corpus baseline now snapshots the new pipeline rather than the old one.
  Its job changed from checking the migration to guarding the result.

Test count went 220 to 158 because the 62 test file was retired. Its coverage
moved into `Split`, `Detect`, `Classify` and `ModuleSourceLinker` tests during
batches 1 to 4, which is why the switch did not need new tests of its own.

### C. the constraint translator. Done.

`src/util/versionConstraint.ts` translates a Terraform constraint into a
semver range. `getTerraformProviderVersionAsync` then takes the highest
satisfying version.

**Gap count 4 to 0. Every corpus row matches its authored expectation.**

```
registry_constraint     .../rds/aws/6.13.1              was 6.0.0
registry_unversioned    .../security-group/aws/6.0.0    was 1.0.0
required_providers.aws  .../hashicorp/aws/5.100.0       was 5.0.0
bare name random        .../hashicorp/random/3.9.1      was a throw
```

`getMinimalTerraformVersion` is gone with its 12 tests.
`formatTerraformVersion` is kept as a display formatter.

The floor verification early return is gone too, which also removes every
`verifyTerraformVersionAsync` call from the resolution path. The method
remains on the interfaces as an unused capability.

#### one source of truth for the operators

`TERRAFORM_VERSION_CONSTRAINTS` is the only place operators are declared. The
2 character sets that scan for them, in `versionConstraint.ts` and
`HclVersionService.ts`, were hand written copies of the same 5 characters and
are now derived:

```ts
const OPERATOR_CHARACTERS = [
    ...new Set(Object.values(TERRAFORM_VERSION_CONSTRAINTS).join("")),
].join("");
```

`~=` was removed. It was added believing the old formatter emitted it, which
was later shown to be false, and it is not a Terraform operator.

Keeping it was argued for on the grounds that removal makes `~= 1.2` silently
wrong, because semver reads `~=` natively and pins the minor where Terraform's
`~>` pins the major. That argument is circular: it assumes `~=` ought to mean
`~>`, which is the thing in question. There is no correct reading of an
operator the language does not have.

#### the leak that is real

The translator reformats and never validates, so anything it does not
recognize reaches semver and gets npm semantics:

```
^1.2.3          semver reads >=1.2.3 <2.0.0
~1.2.3          semver reads >=1.2.3 <1.3.0
1.2.x           semver reads >=1.2.0 <1.3.0
1.2.3 - 2.0.0   semver reads >=1.2.3 <=2.0.0
```

Terraform supports none of those. The extension reads whatever is on the
page, so a malformed file produces a confidently wrong version in the link.

The fix is a whitelist: only the 7 operators in the constant produce a
comparator, and anything else makes the constraint unrecognized. Not done.

#### why `!=` is not in the range string

semver has no `!=` operator. `validRange("!=1.2.3")` is null.

Rewriting it as `<1.2.3 || >1.2.3` does not compose, because the `||` escapes
the conjunction it is spliced into. Measured:

```
range    >=1.0.0 <2.0.0 <1.5.0 || >1.5.0
3.0.0 satisfies it   true
```

So `toVersionConstraint` returns `{ range, excluded }` and the resolver
filters the excluded versions out before asking semver. The type carries the
reason in a comment so it does not get "simplified" back into the range.

#### the pessimistic operator

```
~> 1.2.3   >=1.2.3 <1.3.0    the count of parts written decides
~> 1.2     >=1.2.0 <2.0.0    what gets pinned
```

`~=` is not accepted. It is not a Terraform operator, so it cannot appear in
a file that validates.

A version with fewer than 3 parts is padded rather than handed to semver,
which would otherwise read `5.0` as the `5.0.x` series. That is the original
bug in one line.

When nothing published satisfies the constraint, the newest published version
is returned rather than failing. A slightly wrong link beats no link.

## the message guard

Fixed, and moved out of the listener so it can be tested.

The original read:

```ts
if (
    (currentTab == null || currentTab?.tabUrl === "") &&
    currentTab.tabUrl.hostname !== GITHUB_ROUTES.HOST
) {
```

`popup.tsx:78` sends `tabUrl: tab.url || ""`, a string, so `.hostname` was
always undefined and the host check rejected nothing. A null message reached
`currentTab.tabUrl` through the `&&` and threw instead of returning early.

Changing `&&` to `||` is not the fix. The background refresh sends the bare
string `"background"` as the whole message, so an `||` would evaluate
`"background".tabUrl`, fail the host check and reject the refresh.

`src/util/tabMessage.ts` separates the 2 shapes. `shouldHandleMessage` returns
true for the sentinel, and otherwise requires a string `tabUrl` whose parsed
hostname is github.com.

| message                | before      | now      |
| ---------------------- | ----------- | -------- |
| `"background"`         | handled     | handled  |
| `{tabUrl: github url}` | handled     | handled  |
| `{tabUrl: other host}` | **handled** | rejected |
| `{tabUrl: ""}`         | rejected    | rejected |
| `null`                 | **throws**  | rejected |
| `{}`                   | handled     | rejected |

15 tests in `TabMessage.test.ts`, including `github.com.evil.com` and
`notgithub.com`, which a substring check would let through.

## jsdom

`jest-environment-jsdom` is a dev dependency now, opted into per file with a
docblock rather than set globally, so the other 10 suites keep running in node
and stay fast. Verified that `URL` and `Headers` are present under it, since
`MockFetchService` constructs a `Headers`.

First use is `HclService.test.ts`, which covers `getFileType` for the first
time. 2 of its cases record gaps rather than behavior:

```
main.tofu      null    OpenTofu extensions are not supported yet
main.tf.json   null    only the last extension is read
```

Both are phase E work. The tests assert what happens today so the change is
visible when it lands.

## sequencing risk

Do not wire e2e into `release.yaml` the day it is written. A green but flaky
suite attached to auto publish blocks releases for reasons unrelated to the
code. Run it on cron for a week or two first, then add the gate with the
`workflow_dispatch` override.

## baseline

48 sources across the fixture repo, run through today's `getSourceType`.

```
26 classified, 22 unclassified
```

3 of the 22 are correct. The security file behaves as the unit tests demand:

```
backslash_no_confusion  -> privateRegistry   correctly accepted
javascript_scheme       -> null              correctly rejected
decimal_ip_backslash    -> null              correctly rejected
userinfo_smuggling      -> null              correctly rejected
```

19 real gaps, in 2 groups that need different handling.

| Should produce a link       | Count |
| --------------------------- | ----- |
| GitHub shorthand            | 3     |
| bare scp style              | 2     |
| bitbucket                   | 2     |
| host qualified registry     | 2     |
| registry plus subDirectory  | 1     |
| shorthand plus subDirectory | 1     |

| Should be labeled, deliberately unlinked | Count |
| ---------------------------------------- | ----- |
| `oci://`                                 | 4     |
| `hg::`                                   | 2     |
| `s3::` and `gcs::`                       | 2     |

The corpus stores an expected value per source. A harness that counts nulls
would call the 3 correct rejections bugs.

## regex inventory

`formatTerraformVersion` and `findTerraformConstraintIndexes` no longer use
regex. The looping and the map building are unchanged. Only the matching was
replaced, by a scanner that takes 2 sign characters over 1 at each position
and resumes after the sign it took, which is what `{1,2}` and `/g` did.

Verified by running the original regex and the scanner over 36 constraint
strings, including `>>3.0.0`, `><3.0.0`, `=>3.0.0`, `!!3`, `>=v3.0.0`,
`>=3.0.0>=4.0.0>=5.0.0` and `a>=3.0.0b`. Identical on all 36. 5 scanner tests
pin the behavior that mattered: 2 characters preferred over 1, a sign must
sit in front of a digit, repeats accumulate, and indexes are measured after
separators are removed.

Remaining in `src/`:

| location              | pattern       | note                             |
| --------------------- | ------------- | -------------------------------- |
| `contentscript.ts:82` | `/"/g`        | strips quotes from scraped text  |
| `HclService.ts:119`   | commented out | dead line from before the parser |

Nothing that decides behavior runs on a regex.

### two corrections found while doing this

`formatTerraformVersion` never emitted `~=`. It preserves whatever operator
was written. 3 test names claimed otherwise while asserting `~>`, and have
been corrected. The comment in `versionConstraint.ts` justifying `~=` support
was wrong for the same reason and now says what is actually true: `~=` is not
a Terraform operator, it is accepted leniently.

## the parser swap

Done. `benc-uk/hcl2-parser` is removed. The parser is now built here from
`tmccombs/hcl2json` for `js/wasm`, source in `wasm/`, rebuilt with
`make build-wasm`.

|                         | before                                | after                                 |
| ----------------------- | ------------------------------------- | ------------------------------------- |
| HCL version             | 2.10, from 2021                       | 2.24                                  |
| build                   | Go 1.12 plus GopherJS, unreproducible | `make build-wasm`                     |
| `dist/contentscript.js` | 3,229,140 bytes                       | **41,372 bytes**                      |
| shipped parser          | bundled twice                         | `main.wasm.gz`, 2.17 MB, fetched once |

The binary ships gzipped and is inflated with `DecompressionStream` on load.
8 MB becomes 1.88 MB.

It is built in a pinned container rather than with whatever Go is installed:

```
make build-wasm            # needs Docker, nothing else
```

`src/vendor/wasm_exec.js` is Go's own glue and has to match the toolchain that
produced the binary. Building on a developer's machine makes that pairing
depend on who ran it. Both files now come out of the same container run.

The difference is visible. Host Go 1.27 produced a 2,173,143 byte archive.
The pinned `golang:1.25` image produced 1,879,194 bytes from the same source.
Same HCL, same hcl2json, different toolchain, different binary. That is the
drift the container removes.

The binary stays committed. A fresh clone needs neither Go nor Docker, which
keeps the barrier to a CSS fix at `yarn install`. Docker is needed only to
change the parser.

The `[object, error]` tuple is gone. That was GopherJS returning a Go
multiple return, and it is why the old code read `hclFile[0]` everywhere.

### the parser cannot run in the content script

This corrects an earlier claim in this document, which said the host page's
CSP does not reach a content script's isolated world and that GitHub's policy
was therefore irrelevant. Chrome's documentation says that. For WebAssembly
it is not true.

Measured. GitHub sends:

```
content-security-policy: default-src 'none'; script-src github.githubassets.com 'sha256-...'
```

No `wasm-unsafe-eval`. Compiling in the content script fails with an empty
`CompileError: WebAssembly.instantiate():`, which is what a CSP block looks
like. The same fetch, inflate and instantiate works in an extension page,
where our own policy applies.

So parsing happens in the service worker. The content script sends the file
text with `chrome.runtime.sendMessage` and gets back the parsed object, the
same shape as the existing `fetchData` bridge. `extension_pages` carries
`'wasm-unsafe-eval'`, which covers the worker.

`web_accessible_resources` was removed again once the content script stopped
fetching the binary. Nothing on github.com needs to read it.

This is the second time end to end tests caught something no unit test could.
The swap passed 182 unit tests and failed 5 of 9 e2e tests.

## phase E

### file types

`getFileType` took everything after the last dot, so `.tofu` was unknown and
`main.tf.json` read as `json`. It now matches known suffixes, longest first,
case insensitively.

```
.tofu.json  .tf.json  .tofu  .hcl  .tf
```

`.tf.json` and `.tofu.json` are JSON, not HCL, and hcl2json does not read them
whatever filename it is given. `src/util/jsonConfig.ts` parses them instead.
The JSON syntax lets a block be written once as an object or repeated as an
array, while the HCL parser always emits arrays, so everything is normalized
to arrays and the rest of the code sees one shape.

### the OpenTofu registry

`registry.opentofu.org` is an api. Its browsable pages are on
`search.opentofu.org`, and its routes are singular where Terraform's are
plural.

|           | Terraform                      | OpenTofu                      |
| --------- | ------------------------------ | ----------------------------- |
| module    | `/modules/ns/name/sys/version` | `/module/ns/name/sys/version` |
| provider  | `/providers/ns/name/version`   | `/provider/ns/name/version`   |
| submodule | `/submodules/name`             | `/submodule/name`             |

All 4 OpenTofu shapes were checked and return 200.

Version selection is deliberately limited. OpenTofu implements the standard
module registry protocol, where versions live at
`/v1/modules/<ns>/<name>/<sys>/versions` and come back as objects. Terraform's
registry answers the bare `/v1/modules/<ns>/<name>/<sys>` with an array of
strings, which is what this code speaks. Measured:

```
200  registry.terraform.io/v1/modules/terraform-aws-modules/vpc/aws
404  registry.opentofu.org/v1/modules/terraform-aws-modules/vpc/aws
```

Rather than carry a second client, an exact pin is used as written and
anything else resolves to `latest`, which `search.opentofu.org` accepts. No
request is made to OpenTofu at all, so no host permission was added.

Implementing the protocol properly is worth doing, because the same protocol
covers third party registries such as Artifactory and Spacelift. Today a
third party host is linked at its own address with nothing appended.

A bare registry address still defaults to `registry.terraform.io`. Defaulting
by file type, so a `.tofu` file resolves against OpenTofu, is a reasonable
refinement and is not done.

Both `pending` corpus rows are closed. The corpus has no pending rows left.

## follow up: bundle size

`dist/index.js` is 4.76 MB and none of it is the parser. It never was. The
cause is one line in `src/components/TablePaginationComponent.tsx`:

```ts
import { KeyboardArrowLeft, KeyboardArrowRight } from "@mui/icons-material";
```

That is a barrel import from the package root, so webpack pulls the whole
icon set in. `node_modules/@mui/icons-material` is 128 MB. The 2 lines above
it already do the right thing:

```ts
import LastPageIcon from "@mui/icons-material/LastPage";
import FirstPageIcon from "@mui/icons-material/FirstPage";
```

Measured by switching that line to deep imports and rebuilding:

|               | `dist/index.js`        |
| ------------- | ---------------------- |
| barrel import | 4,761,446 bytes        |
| deep imports  | **675,189 bytes**      |
| saving        | 4,086,257 bytes, 85.8% |

Applied. Both the barrel import and the pre React 18 `render` call, which
`popup.tsx` used instead of `createRoot` from `react-dom/client`.

What the whole extension weighs, for context:

|                   | contentscript | popup   | parser        | total       |
| ----------------- | ------------- | ------- | ------------- | ----------- |
| before this work  | 3.23 MB       | 4.76 MB | bundled twice | ~8.0 MB     |
| now               | 0.04 MB       | 4.76 MB | 2.17 MB       | ~7.0 MB     |
| with the icon fix | 0.04 MB       | 0.68 MB | 2.17 MB       | **~2.9 MB** |

Worth checking at the same time: `popup.tsx` imports `render` from
`react-dom`, which is the pre React 18 API. React 18 wants
`createRoot` from `react-dom/client`. That is correctness rather than size.

## build toolchain upgrade

webpack was pinned exact at `5.76.0` while every other dev dependency floated
on a caret, which is why it went stale. 3 advisories applied to it.

| severity | advisory                                            | applies to us |
| -------- | --------------------------------------------------- | ------------- |
| moderate | `AutoPublicPathRuntimeModule` DOM clobbering gadget | no            |
| low      | `buildHttp` allowedUris bypass via userinfo         | no            |
| low      | `buildHttp` allowedUris bypass via redirects        | no            |

Exposure was checked rather than assumed. The gadget appears 0 times in all
3 bundles, because there are no async chunks and no runtime `publicPath` for
webpack to generate one for. Both low advisories need `buildHttp` or
`HttpUriPlugin`, and the config has no `experiments` block at all.

So this was housekeeping, not a live hole. Upgraded anyway, because the
advisories are what CI reports and the pin is what caused the staleness.

|                       | before         | after    |
| --------------------- | -------------- | -------- |
| webpack               | 5.76.0, pinned | ^5.111.1 |
| webpack-cli           | 5.0.1          | ^7.2.3   |
| copy-webpack-plugin   | 11.0.0         | ^14.0.0  |
| terser-webpack-plugin | 5.3.7          | ^5.6.1   |
| html-webpack-plugin   | 5.5.0          | ^5.6.8   |
| ts-loader             | 9.4.1          | ^9.6.2   |

`yarn audit:dev` reports nothing. The exact pin is gone, so a caret keeps it
current the way the rest of the toolchain already is.

Both major bumps, webpack-cli 5 to 7 and copy-webpack-plugin 11 to 14, were
taken after checking the build, the unit suite and the browser suite rather
than on the version numbers alone.

An unasked for improvement came with it. Newer webpack and terser cut
`dist/index.js` from 675,392 to 315,037 bytes.

`clean-webpack-plugin` is removed. Webpack has done this itself since 5.20:

```js
output: {
    clean: true,
}
```

Verified rather than assumed. A file was planted in `dist`, the build was
run, and the file was gone. One fewer third party package in the build, and
that one was last released in 2020.

## typescript upgrade

TypeScript 4.9 to **6.0.3**, which is the newest version this toolchain
supports. The goal was removing this from `HclParser`, which 4.9 needed
because its dom library predates the Compression Streams API:

```ts
declare class DecompressionStream { ... }
```

It is gone. `DecompressionStream` resolves from `lib.dom`.

### why not 7

TypeScript 7.0.2 is `latest` and shipped 2026-07-08. It is the native Go
port, not a version bump, and **it ships without a stable programmatic
compiler API**. `ts.createProgram`, `ts.transform` and `ts.factory` are what
typescript-eslint and ts-jest are built on, so neither can use it.

| package                    | peer typescript  | allows 7             |
| -------------------------- | ---------------- | -------------------- |
| `typescript-eslint` 8.70.1 | `>=4.8.4 <6.1.0` | no                   |
| `ts-jest` 29.4.13          | `>=4.3 <7`       | no, excluded by name |
| `ts-loader` 9.6.2          | `*`              | yes                  |
| `ts-node` 10.9.1           | `>=2.7`          | yes                  |

Those first 2 gate linting and every unit test. There is no newer major of
either: typescript-eslint tops out at 8 and ts-jest at 29. Prereleases do not
help, the typescript-eslint canary still caps at `<6.1.0` and ts-jest's
`next` tag points at an older build than `latest`.

The programmatic API is planned for 7.1, with a beta targeted October 2026.
Until then the pattern the ecosystem settled on is to keep 6.x as the source
of truth for emit and tooling, and optionally run `tsgo` alongside as a fast
non blocking checker. Revisit when typescript-eslint and ts-jest publish
support.

### what 6 required

2 changes, both real rather than incidental.

`@types/chrome` was on 0.0.202, published in 2022. Now 0.3.0.

TypeScript 6 stopped pulling in every package under `node_modules/@types`
automatically, so the `chrome` global went missing and 25 errors appeared
across every file touching the extension APIs. Fixed by naming them:

```jsonc
"types": ["chrome", "jest", "node"],
```

That is a better default anyway. Unrelated `@types` packages no longer leak
their globals into the project.

Verified by exit code rather than by reading output:

```
TS 6.0.3, no explicit types   exit=2
TS 6.0.3, explicit types      exit=0
```

Lint warnings went 39 to 40 under 5.9 and back to 39 under 6.0.3. Still 0
errors throughout.

## language target and the browser floor

`target` is `es2023` and `minimum_chrome_version` is `112`. Both were chosen
together, because a target that outruns the declared floor is a trap rather
than a setting.

### how the pair was picked

`target` decides which syntax is emitted without downlevelling and which
library typings exist. Set it above what the floor supports and code will
typecheck, build, pass every test, and fail in a browser nobody on the team
is running.

| ES version | complete at Chrome           |
| ---------- | ---------------------------- |
| es2021     | 85                           |
| es2022     | 94                           |
| es2023     | **110**                      |
| es2024     | 119, `Promise.withResolvers` |
| es2025     | about 136, `RegExp.escape`   |

A floor of 112 makes es2023 the highest sound target. es2024 would need the
floor moved to 119.

`minimum_chrome_version` had never been set. The extension's real floor was
Chrome 92, from `crypto.randomUUID`, and it was implicit. It is now declared,
so the Web Store enforces it instead of a user discovering it.

### the bug the bump found

`ModuleSourceLinker` had this, carried over from the old `HclSourceService`:

```ts
constructor(private readonly terraformFetchService: ITerraformFetchService) {}

private readonly hclVersionService = new HclVersionService(this.terraformFetchService);
```

A field initializer reading a constructor parameter property. From es2022
onward `useDefineForClassFields` is on by default, and field initializers run
**before** the constructor assigns parameter properties, so the argument is
`undefined`.

Which targets catch it, measured against a minimal reproduction:

```
es2015 .. es2021   clean
es2022             TS2729: Property 'fetch' is used before its initialization.
es2023 .. es2025   TS2729
```

es2021 was silent, which is why it sat there. Anything from es2022 up catches
it, so going to es2025 was not what found it.

It is a real runtime failure, not a type checker quibble. The same file
compiled at both targets and run:

```
target es2021   ok
target es2022   TypeError at  return this.fetch.go();
```

On this codebase that would have meant every registry link failing, and
failing silently as an unlinked row, because of the error containment added
earlier.

Fixed by constructing it in the constructor body. The parameter property was
dropped, since it was read exactly once. No other class in `src/` has a field
initializer that reads one.

## why oci sources are not linked

`oci://` is classified, labeled `oci` in the popup, and deliberately left
without a link. The e2e suite asserts this.

There is no general mapping from an OCI reference to a web page:

| registry    | browsable ui                                      |
| ----------- | ------------------------------------------------- |
| `ghcr.io`   | `github.com/{owner}/{repo}/pkgs/container/{name}` |
| `docker.io` | `hub.docker.com/r/{ns}/{name}` or `/_/{name}`     |
| ECR         | console url, region specific, needs auth          |
| ACR         | portal url, needs auth                            |
| Artifactory | deployment specific                               |

Special casing `ghcr.io` was considered, since this is a GitHub extension and
those urls do resolve. It was rejected on usage. An exact phrase code search
for `source = "oci://"` returns **6 results across all of GitHub**.

Providers cannot use it at all. `source` inside `required_providers` is
always a registry address. OCI for providers is a mirror configured in the
CLI config, not in the HCL this extension reads. So `oci://` can only appear
in a `module` block, in an OpenTofu config, using a feature about a year old.

Guessing a url that 404s is worse than no url, and ghcr's path shape depends
on whether a package is owner or repo scoped, which the reference does not
say. Revisit if OCI module sources become common.

## acting on the first pass review

All 7 findings and all 4 minors are fixed. `docs/code-review-first-pass.md`
has the original. Every claim in it was verified before anything changed, and
every claim held.

### 1 and 5, one ordered table

The table is `resolverFor`, in `sourceResolvers.ts`. "kind" was the first
name and was wrong twice over: it is vocabulary that was already ruled out,
and it reads as a stored discriminator, which is the thing this design exists
to avoid. "form" and "handler" were considered and dropped, the second
because it reads as event driven when nothing is dispatched.

`resolvedUrl` and the old `resolveSourceAsync` already used the word, so
resolver adds no new vocabulary.

`src/util/moduleSource/sourceResolvers.ts` holds one ordered table of
`{ name, matches, label, linkAsync }`. `classify` reads the label column,
`ModuleSourceLinker` reads the link column, and `resolverFor` picks the row. The
2 hand maintained priority orders are gone.

`Browsable` is no longer a stored bit. A source is browsable when its
resolver has a link builder, which cannot drift from the builder that exists.

The overlap that produced the bug is also removed at its source. A forced VCS
type now wins over the file extension, so `git::` over a url ending in `.zip`
is a repository rather than both a repository and an archive.

Before and after, same input:

```
git::https://github.com/ns/repo.zip
  was  flags GitForge|Archive   label archive   link .../repo.zip/tree/main/
  now  flags GitForge           label url       link https://github.com/ns/repo.zip
```

### 2, the public registry was a private registry

`registry.terraform.io` ends with `.terraform.io`, so the suffix check caught
it and the host qualified form of a public module got a different label and a
worse link than the bare form. Same module, two answers, decided by how it
was typed. That is root cause 4 again, reintroduced by the fix for root
cause 5.

```
registry.terraform.io/terraform-aws-modules/vpc/aws
  was  privateRegistry  https://registry.terraform.io/terraform-aws-modules/vpc/aws
  now  registry         https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3
terraform-aws-modules/vpc/aws
       registry         https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/6.7.3
```

Identical, as they should always have been.

### 3, no strings left in classify

`HttpTransport` and `MercurialRepo` are set in `detect`, where the scheme and
the forced type are already in hand. `classify` reads 0 strings now. The
duplicated `HTTP_SCHEMES` is gone with them.

### 4, one path convention

Every branch of `detect` now writes `path` with a leading separator.
`trimLeadingSeparator` is deleted. `normalizeRegistryAddress` counts non empty
segments rather than depending on the other flavor.

### 6, the catch wraps only the network

The broad try around the whole build is gone. The only thing wrapped is the
version lookup, which returns null when the registry cannot be reached. A
defect in a pure link builder throws, and the per module try in
`HclService.findSourcesAsync` keeps it off the rest of the page.

### 7, one scp scan

`readScpParts` returns the parts instead of a bool, so the indexes it found
are used rather than recomputed. Colon scans went from 3 to 2, and the 2 that
remain answer different questions.

### minors

`versionConstraint ?? ""` on a `string` is gone. The linker is built once by
`HclService` and shared, rather than one per module. Separators and
`lastSegment` live in `src/util/moduleSource/grammar.ts`. `linkForge` returns
the repository root when there is neither a ref nor a subdirectory, because
guessing `main` 404s on a repository that defaults to `master`, which was
measured against a real one.

Also removed as dead: the `Browsable` bit, and `GIT_OVER_SSH`, a flag bundle
written during the original design and never used.

### the review's one overstatement

Finding 1 says no test could catch the label and link disagreeing, because
each file is tested on its own. The corpus asserts both per row, so a row
combining `git::` with an archive extension would have caught it. There was
no such row.

The gap was fixture coverage, not test architecture. Two fixtures were added
to cover exactly the 2 confirmed bugs:

```
04-git-forced:git_forced_beats_archive_extension   git::https://example.com/repo.zip
03-registry-host:public_registry_host_qualified    registry.terraform.io/terraform-aws-modules/vpc/aws
```

Corpus is 53 rows, 0 gaps, and agrees with the fixture repository.

## FILE_EXTENSIONS

Kept, holding `.git`. It originally held `.tf`, `.hcl` and `.git`, and all 3
uses were in the old `HclSourceService`.

`.tf` and `.hcl` drove the tree against blob decision by `lastIndexOf`. Both
are superseded: file typing moved to `HCL_FILE_SUFFIXES`, which also covers
`.tofu` and the JSON variants, and tree against blob became `isFilePath`, a
dot in the last segment check that needs no extension list.

`.git` was a regression. `ModuleSourceLinker` imported the constant and used
`FILE_EXTENSIONS.GIT`. Rewriting that file as `sourceResolvers.ts` retyped
`stripGitSuffix` with `".git"` hardcoded twice, which is what left the
constant with no readers. `FILE_EXTENSIONS.GIT` is used again.

An audit of the rest of `constants.ts` found no other dead entry. 2 near
misses worth recording:

- `TERRAFORM_VERSION_CONSTRAINTS.LESS_THAN` and 3 siblings look unused to a
  dotted reference search. They are read wholesale by
  `Object.values(TERRAFORM_VERSION_CONSTRAINTS)` in `extractVersion`.
  Deleting them would change behavior.
- `SENDERS.POPUP` is genuinely unread, and already was before this work.

## one constants file

There is no `grammar.ts`. The separators, schemes and forced types live in
`src/util/constants.ts` with everything else, grouped the way the rest of
that file is:

```
SOURCE_SEPARATORS   PATH SCHEME FORCED_TYPE QUERY SUB_DIRECTORY
SOURCE_SCHEMES      SSH OCI
HTTP_SCHEMES        an array, used with includes
FORCED_TYPES        GIT MERCURIAL
ARCHIVE_FORCED_TYPES, ARCHIVE_EXTENSIONS, FILE_EXTENSIONS
```

The 4 helpers that were in that file are not constants and did not move
there. 3 had a single consumer and are now local to it: `isHttpScheme` and
`withLeadingSeparator` in `detect.ts`, `isFilePath` in `sourceResolvers.ts`.
`lastSegment` is the only one used from 2 places and sits in `urlSafety.ts`
with the other small pure path predicates.

## open

- `popup.tsx:160` checks `sourceType === null`. Dead once the zero value is
  `unknown`. Clean up in batch 5.
- `getFileType()` takes everything after the last dot, so `.tf.json` reads as
  `json` and gets rejected. Same problem will hit `.tofu.json`.
- Audit for any other field typed `URL` that crosses `chrome.storage`.
- Nothing outstanding here. See the message guard below.

## structured comparators

`toVersionConstraint` used to build a semver range string and hand it to
`semver.maxSatisfying`. That string is the bug. Everything we failed to
recognise got a second opinion from a parser with different rules.

Two ways in, both verified:

```
"^1.2.3"  ^ is not an operator character, so readClause returned operator ""
          and the whole token as the version. padVersion saw three parts and
          left it alone. Range "^1.2.3". semver picked 1.9.9.
"~1.2.3"  ~ IS an operator character, being the first half of ~>. So it was
          taken as an operator and the last line of toComparator concatenated
          it. Range "~1.2.3". npm tilde semantics.
```

Blast radius first, because it decided how much to build. All 12 forms
terraform itself accepts already resolved correctly, and garbage such as
`banana` produced an invalid range, `maxSatisfying` returned null, and
`HclVersionService` fell back to newest. So the leak only fired on input that
is not valid terraform. Robustness gap, not a live defect.

That ruled out writing our own constraint evaluator. The question splits in
two. Constraint syntax, which operators exist and what `~>` means, is
terraform specific and we should own it. Version comparison, including
prerelease ordering, is where the bugs live and semver has it right.
Terraform does not hand roll it either: `hashicorp/go-version` is the same
ordering with different operators attached.

So the fix is not a whitelist bolted onto `toComparator`. It is dropping the
string:

```ts
export type Comparator = {
    readonly operator: ComparisonOperator; // = != > >= < <=, what semver.cmp takes
    readonly version: string;
};
export type VersionConstraint = {
    readonly comparators: readonly Comparator[];
    readonly recognized: boolean;
};
```

`recognized` is false when any clause used an operator terraform does not
have, or a version semver cannot read. One bad clause rejects the whole
conjunction rather than being dropped, because dropping a clause silently
widens the constraint, which is the same class of defect.

What fell out of it:

- `excluded` is gone. It existed only because semver _ranges_ have no `!=`.
  `semver.cmp` has one, so an exclusion is an ordinary comparator and
  `satisfies` is one `every`.
- The `"*"` sentinel is gone. An empty constraint is an empty comparator list
  and `every` on it is true.
- `toPessimisticBounds` uses `semver.parse` instead of `parseInt` per part.
  That deleted the NaN branch and an accident where `parseInt("0-beta")`
  returned 0.
- `ModuleSourceLinker` no longer imports semver. `semver.valid(range) === null`
  was a string test standing in for "did this pin one version". It is now
  `pinnedVersion`, which asks the structure.

`TERRAFORM_VERSION_CONSTRAINTS` got `as const` so `ComparisonOperator` derives
from it rather than being a second list:

```ts
type TerraformOperator =
    (typeof TERRAFORM_VERSION_CONSTRAINTS)[keyof typeof TERRAFORM_VERSION_CONSTRAINTS];
export type ComparisonOperator = Exclude<TerraformOperator, typeof PESSIMISTIC_OPERATOR>;
```

### the regression this introduced

Dropping `maxSatisfying` dropped its prerelease rule with it. `< 6.0.0`
started selecting `6.0.0-beta3`, because raw `cmp` says that is less than
6.0.0 and nothing else was filtering. Caught by an existing
`HclVersionService` test that expected 5.100.0.

Terraform installs a prerelease only when the constraint asks for one of that
same release, which is the rule semver ranges apply. Reproduced in
`satisfies` with `semver.diff(comparator.version, version) === "prerelease"`,
which is true only when the major, minor and patch all match.

This is the argument for not rolling our own, arriving on schedule. The one
piece of comparison behaviour taken away from semver broke within an hour.

### SUB_DIRECTORY

Found while typechecking this change, unrelated to it. `split.ts` referenced
`SOURCE_SEPARATORS.SUBDIR`; the one constants file pass renamed the key to
`SUB_DIRECTORY` and this call site was missed.

It is not a runtime bug, because ts-jest refuses to compile the module, so
the moduleSource suite reported `0 total` rather than failing. That is the
worse outcome: 55 tests silently stopped running. The green run recorded
earlier in this document predates the rename.

Worth a CI guard that fails when a suite reports zero tests.

## the version column

`linkAsync` now returns `ModuleLink` rather than a bare url:

```ts
export type ModuleLink = {
    readonly url: Nullable<string>;
    readonly resolvedVersion: string;
};
```

The resolved version was already computed inside
`getTerraformProviderVersionAsync`, spent on the url path and thrown away. It
is collected in a box created per `linkAsync` call, not in a field, because
one linker is shared by every module on the page and instance state would let
concurrent modules see each other's version.

`DisplayHclModule` carries `versionConstraint` and `resolvedVersion`. The
popup renders `>= 6.0, < 7.0 -> 6.13.1`. A constraint that is already an exact
pin renders once rather than resolving to itself.

`resolvedVersion` is "" for anything that is not a registry lookup, because
nothing else consults a published version list. OpenTofu included: its api
takes an exact pin as written or `latest`, so there is nothing resolved to
report.

Five call sites unwrapped `.url`, 25 of the linker tests going through one
helper. 4 unit tests and 1 e2e added.

### what this settles about formatTerraformVersion

The formatter turns `>=3.5.0<4.0.0` into `>= 3.5.0, < 4.0.0`, so it only does
anything when clauses run together with no comma. Terraform requires the
comma, so that input does not appear in a file the extension reads. The
column renders the author's own text and `resolvedVersion`, neither of which
needs it. Delete with the rest of the cluster.

## the popup rendered twice

`popup.tsx` ended with a commented out first draft, and the `if (container !==
null) { createRoot(container).render(...) }` under it was never commented with
the rest. Only the `const container` line above it was, so the live block
reused the binding from line 198 and mounted a second root on the same
container.

Confirmed by emitting the file with `--removeComments` and counting: two
`createRoot(container)` calls. React 18 warns on the second, and the effect
runs twice, so every popup open did the tab query, the script injection and
the parse twice.

Lines 202 to 335 deleted. The file is 201 lines.

## explicit senders

Both sides of the runtime message now name themselves. The background sends
`{ sender: SENDERS.BACKGROUND }` instead of a bare string, the popup sends
`{ sender: SENDERS.POPUP, tabId, tabUrl }`, and `shouldHandleMessage` reads
the field rather than telling the two apart by shape.

`SENDERS.POPUP` had been declared and never sent. The guard inferred the
popup from the presence of a string `tabUrl`, which is the duck typing that
made the original `&&` bug possible.

The guard is strictly tighter now: an object carrying a github `tabUrl` but
no sender is rejected, and so is the bare sentinel the background used to
send. Both are pinned by tests.

## opentofu pin verification

`linkOpenTofuRegistry` used the author's pin as written and never checked it
existed, so a pin to a version that was never published produced a 404 link.

It now resolves through `registry.opentofu.org/v1/{route}/{address}/versions`,
and because the whole published list comes back in that one request, the
constraint is resolved the same way the Terraform path resolves one, with
`selectVersion`. A range no longer degrades to `latest`.

| constraint             | before        | after    |
| ---------------------- | ------------- | -------- |
| `6.7.3`, published     | `6.7.3`       | `6.7.3`  |
| `6.7.3`, not published | `6.7.3` (404) | `latest` |
| `>= 6.0, < 7.0`        | `latest`      | `6.7.3`  |
| `~> 5.0`               | `latest`      | `5.21.0` |
| `^6.0.0`               | `latest`      | `latest` |
| none                   | `latest`      | `latest` |

No constraint still short circuits before the request: `latest` already names
the newest, so fetching the list to rediscover that is a wasted round trip.
Nothing satisfying the constraint also falls back to `latest`, which differs
from the Terraform path only because `latest` is a live page here.

Three shapes come back from the two registries, which the recorder and the
fetch service both handle:

```
terraform            { versions: ["1.0.0", ...] }            strings
opentofu providers   { versions: [{version: "1.0.0"}, ...] } objects
opentofu modules     { modules: [{versions: [...]}] }        nested
```

Cost, which is why it was a decision rather than a cleanup:

- `manifest.json` gains `https://registry.opentofu.org/*`, which re-triggers
  Chrome Web Store review.
- `ALLOWED_FETCH_HOSTS` gains the host, or the service worker refuses it.

`verifyTerraformVersionAsync` did not survive into this. It hardcoded
`registry.terraform.io`, so it could not check an OpenTofu version, and on
the Terraform side the version already comes out of the published list.
Deleted across its four files.

Two e2e tests pin the live path, one for a pin and one for a range, against
`opentofu_registry` and `opentofu_registry_range` in `03-registry-host.tf`.
They have teeth: removing the host permission from the built manifest makes
them fail with `latest`, which was verified.

Adding the range fixture broke the pin test, because `hasText` is a substring
match and `opentofu_registry` also matches `opentofu_registry_range`. Both
now locate by exact link text. Worth remembering when naming fixtures: a
module name that is a prefix of another silently widens every locator that
mentions it.

The corpus is 54 rows. `corpus-baseline.json` regenerated.

## the formatter, and the loop that tested it

`formatTerraformVersion` is gone, replaced by `normalizeConstraint` in
`versionConstraint.ts`.

The claim that the formatter only fired on invalid input was wrong. It also
normalizes `>=3.5.0,<4.0.0`, which is valid terraform people write, and that
matters now the popup shows constraints.

What made it 95 lines was `removeSeparators` stripping the commas and the
spaces, after which the sign-index machinery had to reconstruct clause
boundaries by pairing sign positions with `signCount % 2`. Keep the comma and
the whole job is twelve lines. Identical output on every valid terraform
form; the two differ only on `>=3.5.0<4.0.0`, which terraform rejects.

The operator loop in `HclVersionService.test.ts` was deleted with the
function and should not have been. It generated 56 cases, every operator and
every operator pair, and that is coverage the twelve-line version needs just
as much. Ported to `normalizeConstraint` with `describe.each`.
`VersionConstraint.test.ts` went from 17 tests to 82.

Also gone with it: `findTerraformConstraintIndexes`, `extractVersion`, the
five scan helpers, `src/types/Hits.ts`. `IHclVersionService` is down to the
two methods that are called.

## third pass, findings 5 and 6

`InMemoryCache` deleted. No importers anywhere in `src`, `tests` or `scripts`,
and it read as an alternative to `ChromeStorageCache` that someone might wire
up. Its two `any` fields were 2 of the 22 remaining lint warnings, so the
count is 20 now.

`RequiredProvider` deleted from `types/Terraform.ts`. Its last caller went
when `HclService` was split. `ProviderType`, declared next to it, is still
read by `moduleDeclarations.ts` and stays.

The cache variable was misspelled two different ways in two files,
`chromeStroageCache` twelve times in `contentscript.ts` and
`chromeStorageCahce` twice in `popup.tsx`. Both are now `storageCache`: the
`chrome` prefix was repeating the type name, which is the only reason there
was room to misspell it twice without either one looking wrong.

Not done here: the `constants.ts` half of finding 6. Renaming that file
belongs with the blanket PascalCase rename rather than on its own, or the
import lines get touched twice.

## third pass, findings 1 to 4

### the rename

12 files to PascalCase, 30 files had import paths rewritten. Rename only.

```
domain/  jsonConfig -> TerraformJsonParser        moduleSource/  classify -> Classify
         moduleDeclarations -> ModuleDeclarationReader          detect -> Detect
         versionConstraint -> VersionConstraint                 forges -> ForgeLayouts
util/    constants -> Constants                                 sourceResolvers -> ModuleSourceResolvers
         path -> PathHelpers                                    split -> Split
         tabMessage -> TabMessageGuards
         urlSafety -> UrlSafety
```

Two passes were needed. The first rewrote paths carrying a folder prefix and
missed the same folder ones, `./forges` and `../constants`, because the
pattern required the prefix to match. The rule in the pattern was "a path
naming this module", and a bare `./name` is one.

`TerraformJsonParser` and `HclParser` now each carry a line naming the other
and saying why they are in different layers.

### where the types went

`types/` holds types, `models/` holds classes. That is the user's rule rather
than the review's, which proposed one home named `models/`, and it settles
the same question with a name that says what the folder is for.

Moved to `types/`: `LinkContext` and `VersionLookup`, `ModuleLink`,
`RunTimeFetchResponse`, `IHclFile`. Left alone: `ModuleSourceResolver`,
`ParseHclResponse`, `Comparator`, `ComparisonOperator`, named by one file
each; `IFetchService` and `IGitHubPageDataAccess`, which are layer contracts
and belong with the layer that owns them.

`models/` is one file now, `DisplayModule`, which is the only class among
them.

`ITablePaginationActionsProps` had exactly one consumer, so by the review's
own count rule it is now declared inside that component and the file is gone.

### the dead types the review did not catch

`TabMessage`, `BackgroundRefresh` and `PopupRequest` were declared in the
sender protocol work and never named by anything: the guards all take
`unknown`, so the contract was enforced on arrival and nowhere else.

They are not deleted. They are now what the senders are typed against, which
is the job they were written for. `chrome.tabs.sendMessage` takes `any`, so
nothing was checking that the two senders agreed with the reader.

Verified it bites: changing the popup to send `SENDERS.BACKGROUND` now fails
to compile with `'tabId' does not exist in type 'BackgroundRefresh'`. Before
this it compiled and broke at runtime.

Lint warnings 22 -> 19 across findings 5, 6, 1: two `any` fields left with
`InMemoryCache`, one with the `any` on the popup's `sendMessage`.

## the comment pass, second time

Caught by the user: public APIs without JSDoc, and paragraphs of prose where
a line would do. Both were mine.

My first audit said 53 of 82 exported declarations had no doc block. That was
wrong: the detector only recognised a block ending in `*/` on its own line,
so every single-line `/** ... */` read as missing. Rewritten, the real numbers
were 17 exported behaviours with nothing at all and 8 with a comment but no
tags, 6 of which are classes where a one-line description is the house style.

Constants and plain type aliases were left alone. `PATH_SEPARATOR` and
`Nullable` do not get `@param`.

Documented: `isSafeHttpUrl`, `isAllowedFetchHost`, `lastSegment`,
`isFilePath`, `hasFlag`, `setFlag`, `clearFlag`, `describeFlags`,
`isJsonFileType`, `isBackgroundRefresh`, `readTabUrl`, `isGithubTabUrl`, the
three `ChromeStorageCache` methods, and a class line on
`ChromeRuntimeFetchService`, `TerraformRegistryDataAccess`,
`OpenTofuRegistryDataAccess`, `GitHubPageDataAccess`, `DisplayModule`,
`TablePaginationActions` and `Popup`.

Five prose blocks cut to one or two lines each, including the row 0 comment,
which the second pass had asked for as one sentence and which had grown to
four lines. Three commented-out `console.log` calls deleted, one of them
carrying the sentence "we cache the modules because we do not want to parse
the TF evey time we scroll if the page is long", replaced by "Cached because
scrolling a long file would otherwise reparse it."

Re-audited after: 0 exported behaviours without a comment, 0 runs of three or
more `//` lines, 0 commented-out logging.

## dropping "forge"

The word appears nowhere at HEAD. All 24 sites came from this rework, which
means I introduced it.

It is a real term, from SourceForge by way of Forgejo, Codeberg and ForgeFed,
and it is the wrong one here. This codebase speaks OpenTofu's vocabulary
everywhere else: module source, registry, subDirectory, ref, pessimistic
constraint. OpenTofu's module sources documentation never says forge. It says
GitHub, Bitbucket, and Generic Git Repository. go-getter calls the things
that recognise those hosts detectors.

The name was also carrying two different ideas:

| site            | what it meant                             |
| --------------- | ----------------------------------------- |
| `GitForge` bit  | this source is a git repository over http |
| `FORGE_LAYOUTS` | hosts whose browse url layout is known    |

`Detect.ts` sets the bit without consulting the host table, so a git repo on
an unknown host carried `GitForge` and then missed the lookup in `linkForge`
and fell back to the repository root. Two concepts, one word.

```
ForgeLayouts.ts -> RepositoryHosts.ts    GitForge      -> GitRepository
FORGE_LAYOUTS   -> BROWSE_LAYOUTS        linkForge     -> linkRepository
FORGE_HOSTS     -> KNOWN_REPOSITORY_HOSTS
ForgeRoute      -> BrowseRoute           "forgeShorthand" -> "shorthand"
```

`shorthand` keeps terraform's own word. Its docs call
`source = "github.com/hashicorp/example"` shorthand for the full
`git::https://` form, so `ShorthandAddress` was already right and only the
resolver row had my prefix bolted onto it.

Rename only. Prose in four files reworded too, so the word is gone from
comments and test names rather than just from identifiers.

## the vcs was never known

Raised by the user against the `forge` rename: what if the repository is not
git based.

Verified, and the flags said two contradictory things at once:

```
hg::bitbucket.org/corp/repo -> HasPrefix|GitRepository|ShorthandAddress|MercurialRepo
```

The label came out `mercurial` only because that row sits above the others in
the resolver table. The flags themselves disagreed. Bitbucket hosted Mercurial
until 2020, so this is a real address, not a hypothetical.

This was mine twice over. `GitForge` had the same defect, and the rename an
hour earlier carried the assumption across without noticing, into a name that
states it outright rather than hiding it behind a vague word.

The detector cannot know the vcs from `bitbucket.org/corp/repo`. It knows the
host has a browse layout and that no scheme was written. It then defaults the
prefix to git, which is a guess, correctly overridden when `hg::` is present.

```
GitRepository    -> RepositoryAddress    what it addresses, like RegistryAddress
ShorthandAddress -> SchemelessAddress    no scheme was written
"gitOverHttp"    -> "repositoryOverHttp"
```

Nothing is lost by dropping the vcs from the names: transport has
`HttpTransport` and `SshTransport`, and the vcs has `MercurialRepo`. The
default at `Detect.ts:180` now carries a line saying git is a default and not
a fact, which is the sentence the old name was standing in for.

One wart, stated rather than papered over: `SchemelessAddress` is literally
true of a registry address too, which does not carry the flag. It reads
correctly beside `RepositoryAddress` and wrongly alone.

Still open and deliberately not touched: `bitbucket.org/corp/repo` is still
labelled `git`, which is the same guess in the display layer. That is the
`SourceTypes` mixing-axes finding the first pass parked.

## splitting the constants file

Third pass finding 6 asked whether `constants.ts` should be renamed. Renaming
was the weaker fix: most of what was in it had a better home, and once those
moved there was not enough left to need a collective noun.

`GITHUB_ROUTES` was two things under one name:

```
HOST        contentscript, backgroundscript, TabMessageGuards   is this tab github
BLOB TREE   RepositoryHosts, ModuleSourceResolvers              github's browse layout
```

`HOST` is plumbing and mirrors `content_scripts.matches` in the manifest.
`BLOB` and `TREE` are domain, touched only by the two link builders, and
`RepositoryHosts.ts` already held the table that chooses between them.

| moved          | to                                       |
| -------------- | ---------------------------------------- |
| `BLOB`, `TREE` | `domain/moduleSource/RepositoryHosts.ts` |
| `PARSER_QUERY` | `services/ChromeRuntimeParserService.ts` |
| `SENDERS`      | `types/TabMessage.ts`                    |

Three entries left, all of them spoken across layers: `GITHUB_HOST`,
`CACHE_KEYS`, `ALLOWED_FETCH_HOSTS`.

`ALLOWED_FETCH_HOSTS` breaks the one consumer rule on purpose. It decides what
the service worker will fetch and has to be read against `host_permissions`
in the manifest, and burying a security allowlist inside a 250 line script
makes it harder to audit than the rule is worth. It now says so.

## the label says what it is

`SourceTypes` mixed transport, vcs and location on one axis, so the same
GitHub repository read three ways depending on how it was spelled:

```
git::https://github.com/o/r.git   url
git@github.com:o/r.git            ssh
github.com/o/r                    git
```

Collapsing all three to `repository` was rejected: the user wants the label
explicit. So it states both facts instead of picking one arbitrarily.

```
                                    before      after
git::https://github.com/o/r.git     url         git:https
github.com/o/r                      git         git:https
git@github.com:o/r.git              ssh         git:ssh
git::ssh://git@github.com/o/r.git   ssh         git:ssh
hg::http://example.com/vpc.hg       mercurial   mercurial:http
```

`url` survives for what it actually describes: an http address that is not a
repository.

Three things had to change underneath.

`label` is now a function of the source rather than a constant on the row. A
static label cannot tell `hg::http://` from `hg::https://`, and a plaintext
repository is worth seeing.

The schemeless branch now sets `HttpTransport`. It was assigning
`source.scheme = https` and not saying so in the flags, so shorthand sources
carried no transport at all.

The vcs is declared per host rather than defaulted:

```ts
export const BROWSE_LAYOUTS: Record<string, RepositoryHost | undefined> = {
    [GITHUB_HOST]: { vcs: VCS_PREFIXES.GIT, route: ... },
    // Mercurial hosting ended here on 1 July 2020.
    [BITBUCKET_HOST]: { vcs: VCS_PREFIXES.GIT, route: ... },
};
```

That is the real fix for the `hg::bitbucket.org` thread. Adding a host now
has to say what it runs. `KNOWN_REPOSITORY_HOSTS` is gone: the detector reads
the table directly, so there is no list to fall out of step with it.

A correction: earlier in that thread I called `git` on `bitbucket.org/corp/repo`
a guess. It is true today, since both hosts in the table are git only. The
defect was a blanket default that happened to be right for the two hosts
present and would be silently wrong for the third.

22 corpus rows relabelled from their source text rather than regenerated from
behaviour, baseline rebuilt, 0 gaps. One unit test and one e2e had pinned the
old labels; the unit test's rationale was "I expect url, because in a browser
that is an address", which is the reasoning this change rejects.

## correction: what clearAsync clears

The JSDoc on `ChromeStorageCache.clearAsync` said "Drops every key, not only
this extension's." That is wrong and it was mine.

`chrome.storage.local` is sandboxed per extension. `clear()` empties this
extension's own area and cannot reach another extension's data.

What is true, and what the line now says, is that it drops every key this
extension stored rather than the one the caller had in mind. Both call sites
in `contentscript.ts` call it to invalidate `MODULES`, and both also wipe
`CURRENT_TAB_URL`, which is what `shouldModelsRehydrateAsync` reads to decide
whether a reparse is needed.

## fourth pass, finding 1

Three rows in the resolver table were one row:

```
sshRepository       SshTransport       gitLabel   linkRepository
schemeless          SchemelessAddress  gitLabel   linkRepository
repositoryOverHttp  RepositoryAddress  gitLabel   linkRepository
```

They were split by transport, which made sense while each carried a different
constant label, `ssh`, `git` and `url`. Making `label` a function earlier in
this session moved the transport inside `gitLabel`, which reads
`source.scheme`. The rows have said the same thing three times ever since. Not
three rows that happen to match, then: three rows whose reason to be separate
was removed a few hours earlier and not cleaned up.

```ts
const REPOSITORY_FLAGS =
    MODULE_SOURCE_FLAGS.SshTransport |
    MODULE_SOURCE_FLAGS.SchemelessAddress |
    MODULE_SOURCE_FLAGS.RepositoryAddress;

const anyFlag =
    (flags: number) =>
    (source: ModuleSource): boolean =>
        (source.flags & flags) !== 0;
```

`anyFlag` is needed rather than cosmetic: `hasFlag` is `(flags & flag) === flag`
and would demand all three bits at once.

The named bundle keeps what the three row names documented, beside the flags
it bundles rather than spread across the table. Nothing reads `.name`, so it
was documentation only.

Behaviour preserving, checked rather than reasoned: 20 of 54 corpus rows land
on those three, and 0 resolve differently under the merged table. The baseline
covers `sourceType` and `resolvedUrl` for every row and did not move. 11 rows
to 9.

## fourth pass, finding 4

The review called the `??` in `gitLabel` and `mercurialLabel` unreachable.
It is not:

```
git::ftp://example.com/ns/repo.git   scheme=ftp   labelled git:https
hg::ftp://example.com/repo           scheme=ftp   labelled mercurial:https
```

`detectSchemed` assigns whatever scheme it parsed, not one of the three in
the label tables, so anything else fell through and was labelled https. The
failure the review described as theoretical was reachable, and it was the
same shape as the small lies the last two passes removed.

Both fallbacks now return `SourceTypes.unknown`. Two tests pin it, and they
were checked against the old code: restoring the fallback fails them.

Unresolved, and outside this finding: such a source is still labelled
`unknown` while the row goes on linking it to `https://example.com/ns/repo`.
The row matched `REPOSITORY_FLAGS`, so a repository is exactly what it is;
the part not known is the transport. `unknown` therefore understates what the
code knows. A plain `repository` label for the no-transport-name case would
say it better.

## the label names the protocol

`unknown` for `git::ftp://` was answering the wrong question. Every browse
link is https, hardcoded in all five builders, because that is what a browser
opens. The transport in the label has always described what the source says,
not what the link does, which is already visible in the cases that worked:
`git@github.com:o/r.git` is labelled `git:ssh` and linked over https.

So the gap was in the enum, not in what was known. The protocols are now
enumerated per vcs rather than as a product, because the product contains
combinations that do not exist:

```
git        https http ssh ftp ftps git          git:ftp,  git:git
mercurial  https http ssh                       hg::ftp:// stays unknown
```

Each table is now a claim about what that vcs can fetch over. `hg::ftp://` is
unknown because Mercurial has no ftp transport, not because the enum is
short. `rsync` is absent because git removed it in 2.10 in 2016, and `file`
because `detect` rejects a source with no host before the label is reached.

Adding enum members is safe across `chrome.storage`: `toSourceTypeLabel` maps
only unrecognised values to unknown, and these are recognised.

`git:git` for the git daemon protocol reads oddly and is accurate.

## fourth pass, finding 2

Two message protocols crossed the same wire, one typed and one not. The
background to content direction was made a discriminated union this morning;
the content to worker direction was still `request: any` with a string tag,
and every read off it unchecked.

`types/WorkerRequest.ts` mirrors `types/TabMessage.ts`:

```ts
export const WORKER_QUERIES = { PARSE: "parseHcl", FETCH: "fetchData" } as const;
export type WorkerRequest = ParseRequest | FetchRequest;
```

`util/WorkerRequestGuards.ts` narrows, the listener calls `isParseRequest` and
`isFetchRequest` instead of reading fields off `any`, and both senders build a
typed request rather than an object literal.

`"fetchData"` had been a bare string at two sites while its twin had a
constant. Both now name `WORKER_QUERIES`.

Checked rather than assumed: swapping `contents` for `fileName` in the parser
service now fails to compile with `Type 'number' is not assignable to type
'string'`. Before this it compiled and failed at the parser.

The guards validate the cache mode against the six values `fetch` accepts,
because that field reaches `fetch` directly. This is not a security change:
`isAllowedFetchHost` gates the url before any request and is untouched.

Warnings 19 to 7. The two left in `backgroundscript.ts` are the
`response.json()` payload, which is genuinely untyped, and the rest are
elsewhere. 5 guard tests, 247 total.

## fourth pass, finding 3

`git::` is the one part of a module source that says outright what it is, and
an unknown dotted host was overruling it:

```
                                    before                  after
git::example.com/ns/repo            registry                git:https
hg::example.com/ns/repo             unknown, no link        mercurial:https
```

`applyPrefix` set the flag from the prefix, then `detectSchemeless` added
`RegistryAddress` on top of it and the registry row matched first. The
mercurial case was worse than the review recorded: no scheme was ever set, so
the label fell through to unknown and no link was built at all.

The decision now sits where the evidence is. `detectSchemeless` treats a
source carrying `git::` or `hg::` as a repository rather than a registry, and
both branches share `asRepository`, so the known-host and unknown-host paths
cannot drift.

A source with no prefix on the same host is still a registry, which is the
behaviour that matters and is unchanged.

### a regression this turned up, mine

```
hg::bitbucket.org/corp/repo -> "bitbucket.org/corp/repo"   NOT A URL
```

Adding `HttpTransport` to the schemeless branch for the label work made
`linkHttpLocator` hand back a bare locator, which is the finding 2 defect
from the second pass returning by a different route. Nothing failed: the sink
rejects it, and the invariant test that exists for exactly this iterates the
corpus, which has no `hg::` on a known host.

`linkHttpLocator` now rebuilds from the host and path when the locator has no
scheme of its own.

The invariant test was the real gap. It is now two tests: one over the corpus,
one over 40 prefix and locator combinations that reach a row by a different
path. Checked against the broken code, the second catches it and the first
still does not.

## fourth pass, finding 5

`RepositoryHosts.ts` held two things: the browse table it exists for, and
`VCS_PREFIXES`, which is the `git::` and `hg::` vocabulary `Detect` reads. It
was there only because the table's `vcs` field needed a value.

The review proposed moving it into `Detect` and having the table import it
from there. That is a circular import: `Detect` already imports
`BROWSE_LAYOUTS`. Tried it, and it fails on load:

```
TypeError: Cannot read properties of undefined (reading 'GIT')
    at RepositoryHosts.ts:35:27
    at Detect.ts:3:1
5 test suites failed to run
```

`BROWSE_LAYOUTS` reads `VCS_PREFIXES.GIT` while its own module is evaluating,
so in the cycle it gets undefined. `tsc --noEmit` was clean throughout:
TypeScript accepts cyclic imports and only the runtime does not.

First attempt typed the field as `"git" | "hg"` so the table could write the
value without importing the constant. That removed the cycle and traded one
definition for three literal spellings, which the user caught immediately:
zero literals became three to fix a cohesion smell.

The cycle only existed because both files wanted the constant at runtime, and
both already sit downstream of `types/ModuleSource.ts`, which imports nothing
but `SourceTypes` and already holds `MODULE_SOURCE_FLAGS`. The prefixes are
the same kind of thing, so they live there and the type is derived from them:

```ts
export const VCS_PREFIXES = { GIT: "git", MERCURIAL: "hg" } as const;
export type Vcs = (typeof VCS_PREFIXES)[keyof typeof VCS_PREFIXES];
```

One definition, both files importing downward, no cycle and no new file.
`"git"` and `"hg"` now appear exactly once in `src`. The derived type still
carries the weight: `vcs: "mercurial"` fails with `Type '"mercurial"' is not
assignable to type 'Vcs'`.

## the field nobody read, stored on every module

`DisplayModule` carried `private readonly terraformModule`. It was assigned in
the constructor and never read again: the factory reads its own parameter at
every other site.

`private` means nothing to `JSON.stringify`, and `DisplayModule` crosses
`chrome.storage` in five places, so the whole `TerraformModule` was persisted
with each row, duplicating `moduleName`, `source` and `version`, which are
already fields on the same object.

Measured in a real browser, one registry row:

```
before   419 bytes
after    255 bytes
```

The constructor now takes the module name, which is the only thing it used
the argument for.

### the other half, not done

`getAsync<DisplayModule[]>` returns plain objects typed as the class.
`instanceof` is false and a method would be undefined. Harmless while the
only method is static, and a trap: the day an instance method is added, the
popup breaks and the content script does not, because one path builds fresh
and the other reads cache.

Nothing is wrong with the static async factory. It is the right shape for
something that needs I/O to build, since a constructor cannot await. The
question is whether the thing that crosses storage should be a class at all,
and a plain type with a free `buildDisplayModuleAsync` would keep the factory
while dropping the claim that storage returns instances.

## DisplayModule is a shape

`types/DisplayModule.ts` holds the type and `emptyDisplayModule`, matching
`emptyModuleSource`. `services/DisplayModuleBuilder.ts` holds
`buildDisplayModuleAsync`, whose body is unchanged. It sits in `services/`
because it calls `ModuleSourceLinker`, which `domain/` may not.

The class could not survive its own consumers. `chrome.storage` and runtime
messaging both drop a prototype, and every read of a `DisplayModule` goes
through one or the other:

```
popup      getAsync            serialised
popup      tabs.sendMessage    serialised
content    getAsync            serialised
content    findSourcesAsync    real instance
```

So the popup never held an instance and the content script held one only on a
cold cache. A method added to the class would have broken the popup always
and the content script on every visit after the first, which is the harder
failure to notice.

Three call sites, one in `src` and two in tests. `models/` is gone, having
held only this.

## comments that say what changed

Caught by the user, on a jsdoc written minutes earlier: "A shape rather than
a class: every consumer reads it back through chrome.storage or a runtime
message, and neither preserves a prototype." That is the reasoning for the
change, in the file the change produced.

Swept the same fault elsewhere:

```
types/Terraform.ts        "It was `[]`, the empty tuple, which only compiled because..."
types/SourceTypes.ts      "the numeric members this enum used to have"
domain/VersionConstraint  "held as comparisons rather than as a range string"
```

All four now state what the thing is, present tense. The test is whether the
sentence could have been written by someone who never saw the old version.

## fifth pass, finding 1

The two guard files had exactly one caller each and sat in the folder for code
that belongs to nobody. They sit beside their caller now:

```
src/backgroundscript.ts
src/contentscript.ts
src/TabMessageGuards.ts
src/WorkerRequestGuards.ts
```

The names stay as they were. The review proposed the reference's
`contentscript.Validations.ts`, which is a dotted convention this tree uses
nowhere else, and `WorkerRequestGuards` says what it validates where an
owner-derived name would only say who calls it. The one-caller problem was
the folder, and moving fixes that on its own.

Tests moved with them, `tests/unit/util/` to `tests/unit/`.

`util/` is three files: `Constants`, `PathHelpers`, `UrlSafety`.

### on the pass itself

Checked the reference rather than taking it on trust. 581 entries under `src/`,
zero matching `util|helper|common`, top level `brokers clients models services
tools`, `ApprovalBroker.ts` beside `FunctionApprovalBroker.ts`, and
`StandardAgent.Validations.ts` beside its service. The pass describes it
accurately.

## fifth pass, finding 2

`isAllowedFetchHost` and `ALLOWED_FETCH_HOSTS` moved to
`WorkerRequestGuards.ts`, beside the two guards that already decide whether an
incoming request may proceed. It is the same job.

The allowlist was a parameter only because the function lived where it could
not know the policy. The guard owns the policy now, so the call site reads
`isAllowedFetchHost(request.url)`.

`isSafeHttpUrl` stays in `util/UrlSafety.ts`. A broker wrapping `new URL()`
would be a class, an interface and an injection at five call sites to make
substitutable something already pure and deterministic. The substitution this
codebase needs is at `IFetchService` and `IGitHubPageDataAccess`.

A new test pins the policy against the manifest, since the two have to agree
and nothing enforced it:

```
Expected: "registry.opentofu.org: true"
Received: "registry.opentofu.org: false"
```

That is with the host removed from `host_permissions`. The manifest is read
from disk rather than imported, which would have needed `resolveJsonModule`
in the build config for one test.

`util/` is `Constants` with 2 exports, `PathHelpers` with 3, `UrlSafety` with 1.

## fifth pass, finding 3, in part

`CACHE_KEYS` moved to `ChromeStorageCache`, which already named it twice in
its jsdoc without importing it. The keys are typed now, so only a key the
cache declares can be passed:

```ts
export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];
```

```
Argument of type '"Modules"' is not assignable to parameter of type 'CacheKey'.
```

Before this, `getAsync("Modules")` compiled and returned null forever.

`GITHUB_HOST` stays in `util/Constants.ts`, against the review. It proposed
moving it to `RepositoryHosts`, whose inventory of readers missed one:

```
contentscript  backgroundscript  domain/moduleSource/RepositoryHosts  TabMessageGuards
```

Three of the four ask whether a tab is on github.com, which is not what the
browse table is for. Moving it would have the background worker import a
domain module to answer that, a worse coupling than the one it removes.

`util/` is `Constants` with one export, `PathHelpers`, `UrlSafety`.
