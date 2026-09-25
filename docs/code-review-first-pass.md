# code review, first pass

Review of the parse and link chain: `split → detect → classify →
ModuleSourceLinker.buildAsync`, composed at `src/models/DisplayHclModule.ts:46`.
Working notes, not committed.

Reviewed in this order: data model, lifetimes, correctness, cost, churn.

## verdict

The data model is right. Flat struct plus a flag word, a zero value instead of
a null, delimiters separated from interpretation. It has already earned its
keep: `detect` grew SCP style and shorthand handling without a new type and
without a new case in any switch. That was the whole point of the rework and it
worked.

Lifetimes and allocation do not apply. Garbage collected, one struct per module,
roughly 20 modules on a page. Performance is not a factor anywhere in this
chain: a few `indexOf` scans per source, and the only real cost is the registry
fetch, which is already awaited once per module.

So everything below is correctness and structure. Two real bugs, one structural
split that will keep producing more of them, and a short list of cheap ones.

Fix 1 through 3 before merge.

## 1. two priority orders over one flag set

`src/util/moduleSource/classify.ts:23` and `src/services/ModuleSourceLinker.ts:68`

`readSourceType` orders Unsupported, LocalPath, Oci, hg, Archive, Registry, Ssh,
Shorthand, http. `buildAsync` orders Browsable, LocalPath, Registry, GitForge,
fallthrough. Same flag set, two hand maintained orders, in two files, with
nothing holding them consistent.

`git::https://github.com/ns/repo.zip` sets `GitForge` (detect.ts:58) and
`Archive` (detect.ts:123). classify reaches Archive first and labels it
`archive`. The linker reaches GitForge first and builds a GitHub tree url. The
label and the link disagree about what the source is.

Cost: adding one flag means getting two independent priority lists right in two
files. Miss one side and you get either a dead linker branch or a mislabeled
row, and no test can catch it because each file is tested on its own.

Fix: one ordered table of `{ predicate, label, link }`. classify reads the label
column, the linker reads the link column. One list, one order, one edit per new
kind.

## 2. registry.terraform.io classifies as a private registry

`src/util/moduleSource/classify.ts:58`

`isHashicorpRegistry` matches the suffix `.terraform.io`, and
`registry.terraform.io` ends with it. Confirmed by running the chain:
`registry.terraform.io/terraform-aws-modules/vpc/aws` comes back as
`privateRegistry`.

It also sets `registryHost`, so `linkRegistryAsync` takes the third party host
early return at line 96 and emits
`https://registry.terraform.io/terraform-aws-modules/vpc/aws`. No version
resolution, no `/modules/` route, no submodule handling.

Cost: the host qualified form of the public registry gets a wrong label and a
worse link, while the bare form `terraform-aws-modules/vpc/aws` gets the correct
versioned deep link. Same module, two answers, decided by how the user typed it.
This is the same class of defect as root cause 4 in `module-source-rework.md`,
which the rework was supposed to remove.

Fix: exclude `registry.terraform.io` and `registry.opentofu.org` from the
private check, and have `linkRegistryAsync` treat a `registryHost` equal to
`DEFAULT_REGISTRY_HOST` as the default path rather than as a third party host.

## 3. classify branches on strings, which the model forbids

`src/util/moduleSource/classify.ts:33`, `:50`, `:69`

The comment at `src/types/ModuleSource.ts:7` says flags decide what runs and
`sourceType` is only a label. Three conditionals in classify decide on raw
strings instead: `source.forcedType === "hg"`, and
`HTTP_SCHEMES.includes(source.scheme)` twice. The second of those sits inside
`isBrowsable`, where it decides whether a link is attempted at all.

There is no Mercurial bit and no HttpTransport bit, so `detect` establishes both
facts and then throws them away for classify to re derive.

Cost: `HTTP_SCHEMES` now exists in two files (detect.ts:11, classify.ts:4) and
they have to stay equal silently. Adding mercurial link support means a fourth
string comparison in a third file, which is the switch the flags replaced,
growing back one comparison at a time.

Fix: two more bits, `HttpTransport` and `MercurialRepo`, set in `detect` where
the scheme and the forced type are already in hand. classify then reads only
`source.flags`, and the invariant holds because there is nothing else to read.

## 4. path has two conventions

`src/util/moduleSource/detect.ts:155` against `:165`

The bare registry branch assigns the locator verbatim,
`terraform-aws-modules/vpc/aws`, with no leading separator. Every other branch
assigns `url.pathname`, which always has one.

`trimLeadingSeparator` at `ModuleSourceLinker.ts:206` exists only to undo this.
`normalizeRegistryAddress` at `:122` quietly depends on the other flavor, since
`path.split("/").length === 1` only holds without the leading separator. Hand it
the slashed flavor and a bare provider name stops getting its `hashicorp/`
prefix, which is a 404.

Cost: every consumer of `path` has to know which flavor it holds, and that is
written down nowhere.

Fix: normalize the bare registry branch to a leading separator in `detect`, and
delete `trimLeadingSeparator`.

## 5. Browsable is recomputed by its only consumer

`src/util/moduleSource/classify.ts:61` and `src/services/ModuleSourceLinker.ts:68-79`

`isBrowsable` enumerates LocalPath, RegistryAddress, GitForge, http. `buildAsync`
checks `Browsable` and then re tests the same three flags in the same order. The
bit carries nothing the linker does not immediately recompute. Its only real
content is the http fallthrough at line 82.

Cost: one new browsable kind is two edits in two files. Add it to the linker
alone and the branch is dead, because the `Browsable` gate rejects it first. Add
it to `isBrowsable` alone and it falls through to `return source.locator`, which
returns an unbuilt link that happens to pass `isSafeHttpUrl` at the sink.

Fix: falls out of finding 1. With one table, browsable means the row has a link
function and is not stored at all.

## 6. the catch wraps more than the network

`src/services/ModuleSourceLinker.ts:54`

`try { ... } catch { return null }` covers the whole build, including the four
pure link builders. The registry fetch is the only thing in there that can fail
legitimately. A `TypeError` in `linkForge`, or a bad `new URL()` in
`linkLocalPath`, is a defect and gets the same treatment as a registry 404.

Cost: a bug in link building renders as "no link" forever, in production and in
any test that only asserts non null. `corpus-baseline.json` records
`"threw": null` for all 51 rows, which is exactly what it would record if a
builder were broken.

Fix: move the `try` so it wraps `this.linkRegistryAsync` only, where the network
is. Let the pure builders throw.

## 7. the scp scan runs three times

`src/util/moduleSource/detect.ts:76`, `:89`, `:129`

`isScpStyle` and `hasColonBeforePath` are the same scan. Both compute `colonAt`
and `slashAt`, and both end in `slashAt === -1 || colonAt < slashAt`.
`detectScp` then recomputes `atAt` and `colonAt` a third time, because
`isScpStyle` returned a bool and discarded the indexes it had already found.

Cost: the cycles are irrelevant. Three copies of the "colon before slash" rule
that have to agree is what will drift.

Fix: one `readScpParts(locator): {user, host, path} | null`. `detect` calls it
and uses the result when it is not null. `hasColonBeforePath` keeps only the
scheme rejection half.

## minor

Worth doing in the same pass, none of them blocking.

- `ModuleSourceLinker.ts:111`, `versionConstraint ?? ""` on a parameter typed
  `string`. Dead check that reads as though the parameter were optional.
- `DisplayHclModule.ts:50`, a `new ModuleSourceLinker` per module, which builds a
  `new HclVersionService` per module. Harmless now because neither holds state,
  but a cache added to `HclVersionService` later would be per module and would do
  nothing. Hoist the linker to the caller that loops over modules.
- `ModuleSourceLinker.ts:159`, with no `ref` and no `subdir` the url is
  `https://github.com/ns/repo/tree/main/`: a trailing separator and a guess that
  the default branch is `main`. `corpus-baseline.json` has enshrined both, in
  `04-git-forced:git_https_no_subdir`, `05-git-scp:scp_bare` and
  `06-github-shorthand:gh_shorthand`. On a repo that defaults to `master` that is
  a 404, and `https://github.com/ns/repo` is always right. Return the repo root
  when `ref` and `subdir` are both empty.
- `PATH_SEPARATOR` and `SCHEME_SEPARATOR` are declared again in three files, and
  `lastSegment` (`ModuleSourceLinker.ts:165`) is written inline again at
  `HclService.ts:36`. The second instance is where to compress. These are past
  it.

## not a finding, deliberately

`SourceTypes` mixes transport (`ssh`, `url`), repository kind (`git`,
`mercurial`) and location (`registry`, `path`) on one axis, so the same GitHub
repository labels as `git`, `ssh` or `url` depending on how it was written. That
is real, but the label is display only and the code says so in three places.
Leave it until something tries to filter on it.

`detectSchemed` populates host and path for any scheme, including `javascript:`
forms that reach it through `//`. The link is never built because `isBrowsable`
rejects a non http scheme, and both sinks check `isSafeHttpUrl` independently
(`contentscript.ts:141`, `popup.tsx:146`). Defence is at the sink, in two places,
which is where it should be.
