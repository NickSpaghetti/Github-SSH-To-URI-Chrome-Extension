# code review, fourth pass

Against the tree after the renaming in `docs/code-review-third-pass.md`.
Working notes, not committed.

Verified before reviewing: `tsc --noEmit` clean, 239 tests across 15 suites,
eslint 0 errors, webpack building.

## verdict

The third pass landed and the tree reads consistently now: PascalCase
throughout, one type per file, one home for types, and the two files named
after what they were not are named after what they are. `SourceTypes` went
further than anything I asked for and is better for it.

What is left is narrower. One table has three rows that are the same row. The
remaining `any` in the codebase has a single cause and a typed protocol sitting
next to it unused. Two smaller things, and one behaviour worth knowing about
before the next release goes out.

## 1. three rows in the resolver table are the same row

`src/domain/moduleSource/ModuleSourceResolvers.ts:143`, `:149`, `:155`

```
sshRepository       matches SshTransport       label gitLabel   link linkRepository
schemeless          matches SchemelessAddress  label gitLabel   link linkRepository
repositoryOverHttp  matches RepositoryAddress  label gitLabel   link linkRepository
```

Identical labels, identical builders, and contiguous in the table, so the only
thing separating them is which flag matched. Eighteen lines saying one thing
three times.

Cost: three places to edit when the repository label or link changes, and
nothing makes them change together. It is the same shape as the defect the
table was built to remove, one level down.

Fix: one row matching any of the three flags.

```ts
{
    name: "repository",
    matches: (source) =>
        hasFlag(source, MODULE_SOURCE_FLAGS.SshTransport) ||
        hasFlag(source, MODULE_SOURCE_FLAGS.SchemelessAddress) ||
        hasFlag(source, MODULE_SOURCE_FLAGS.RepositoryAddress),
    label: gitLabel,
    linkAsync: (source) => Promise.resolve(linkOnly(linkRepository(source))),
}
```

Behaviour preserving, because the three are adjacent: nothing can match one of
them today without matching the merged row at the same position. If the three
names are worth keeping as documentation, an `anyFlag(...)` helper beside
`flagged` reads better than three rows.

## 2. the last `any` is one boundary, and the typed protocol is already next to it

`src/backgroundscript.ts:26`

Fourteen of the nineteen remaining warnings are in this file, and all of them
come from one line: `chrome.runtime.onMessage.addListener((request, ...))`
hands over `request: any`, and every read off it, `contentScriptQuery`,
`contents`, `fileName`, `url`, `cache`, is unchecked.

The same file already sends a typed message on the way out:

```ts
const refresh: BackgroundRefresh = { sender: SENDERS.BACKGROUND };
```

So there are two message protocols in this extension. The one between the
background, content and popup scripts is a discriminated union in
`types/TabMessage.ts` with guards in `util/TabMessageGuards.ts`. The one
between the content script and the background worker, which carries the parse
and fetch requests, is an untyped object with a string tag.

Cost: nothing validates what crosses the second boundary, and the warnings say
so fourteen times. A caller that sends `fileName` where `contents` is expected
compiles, ships, and fails at the parser.

Fix: the second protocol wants the same treatment as the first. A
`WorkerRequest` union of `{ query: "parseHcl"; contents; fileName }` and
`{ query: "fetchData"; url; cache }`, a guard per arm, and the listener
narrows instead of reading off `any`. That is where the warning count goes to
five, and the remaining five are the genuinely untyped parser output.

## 3. an explicit `git::` prefix loses to an inferred registry

`src/domain/moduleSource/ModuleSourceResolvers.ts:137`

Measured:

```
git::example.com/ns/repo
    row registry   label registry   flags HasPrefix|RegistryAddress|RepositoryAddress
```

The author wrote `git::`, which is the one part of a module source that says
outright what it is. `detect` records it as `RepositoryAddress`, then
`detectSchemeless` adds `RegistryAddress` because the host is dotted and not a
known browse host, and the registry row matches first.

Cost: the label contradicts the source text, and the link goes to a registry
that will not have it. Pre-existing rather than new, and the input is
unusual, which is why it is third rather than first.

Fix: the registry row should not match a source that carries an explicit VCS
prefix. `matches: (source) => hasFlag(RegistryAddress) && !hasFlag(HasPrefix)`
is the small version; having `detectSchemeless` decline to set
`RegistryAddress` when a VCS prefix is already present is the version that puts
the decision where the evidence is.

## 4. two label fallbacks that cannot be reached

`src/domain/moduleSource/ModuleSourceResolvers.ts:68`, `:71`

```ts
const gitLabel = (source) => GIT_LABELS[source.scheme] ?? SourceTypes.gitHttps;
```

Every path to these rows sets a scheme: `detectScp` sets `ssh`, the schemeless
branch sets `https`, and the schemed branch sets whatever was parsed. So the
`??` never fires, and if it ever did it would quietly label an unknown
transport as https.

Cost: small, but it is a claim the code does not have to make, and it is the
kind of default that turns a future missing case into a wrong answer rather
than a visible one.

Fix: either drop the fallback and let the type require a match, or return
`SourceTypes.unknown`, which is honest about not knowing.

## 5. `RepositoryHosts` holds two concepts

`src/domain/moduleSource/RepositoryHosts.ts:20`

`BROWSE_LAYOUTS` is what the file is for. `VCS_PREFIXES` is the `git::` and
`hg::` vocabulary, which `Detect` reads to interpret a source prefix and which
has nothing to do with which hosts can be browsed. It is here because the
layout table's `vcs` field references it.

Cost: the file that was created to be one cohesive thing has started
collecting, which is how the last two shared-constants files went.

Fix: `VCS_PREFIXES` belongs with prefix interpretation, in `Detect`, and the
layout table can import it from there. If that direction reads wrong, leaving
it is defensible, but the file should say why it is here.

## minor

- `SourceTypes` values changed from `git`, `ssh`, `url` to `git:https`,
  `git:ssh` and the rest. `toSourceTypeLabel` maps anything unrecognised to
  `unknown`, so a user who upgrades while sitting on a page sees every row
  labelled `unknown` until they navigate, at which point the cache is rewritten.
  Self healing and short lived, but avoidable: clearing the module cache on
  `chrome.runtime.onInstalled` makes an upgrade clean rather than briefly wrong.
- `models/` now holds one file. `DisplayModule` is genuinely different in kind
  from everything in `types/`, being a class with a factory rather than a shape,
  so the split is defensible. Worth deciding deliberately rather than leaving it
  as the residue of the move.
- `RepositoryHosts.ts:39` carries `// Mercurial hosting ended here on 1 July
2020` above the Bitbucket entry. Good comment, wrong place: it explains why
  Bitbucket's `vcs` is `git` and not why the route is `src`, and it reads as a
  note about the table rather than about that field.

## closed since the third pass

1. Two homes for types with no rule. One home, `types/`, one type per file.
   `LinkContext`, `ModuleLink`, `RunTimeFetchResponse` and the `TabMessage`
   union are now named files rather than inline declarations.
2. `domain/` written in a different idiom. PascalCase throughout, matching
   every other folder.
3. `jsonConfig` named like configuration. `TerraformJsonParser`, paired with
   `HclParser`.
4. `moduleDeclarations` neither parser nor service. `ModuleDeclarationReader`.
5. `InMemoryCache` and `RequiredProvider` dead. Deleted.
6. `chromeStroageCache` and `chromeStorageCahce`. Both `storageCache`.
7. `constants.ts` saying nothing about what belongs. `Constants.ts`, and the
   host constant it exports is named for what it is.
8. Beyond what the pass asked for: `SourceTypes` now encodes vcs and transport
   rather than mixing kind, transport and location on one axis. That was noted
   as deliberately-not-a-finding in the first pass, on the grounds that the
   label was display only. It was worth fixing anyway.
