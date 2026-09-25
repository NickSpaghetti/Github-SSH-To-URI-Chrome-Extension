# code review, second pass

Follow up on `docs/code-review-first-pass.md`, against the current tree. Same
chain: `split → detect → classify → ModuleSourceLinker.linkAsync`, composed at
`src/models/DisplayHclModule.ts:49`.

Working notes, not committed.

Verified before reviewing: `tsc --noEmit` clean, 216 tests across 12 suites,
eslint 0 errors.

## verdict

The resolver table did what it was supposed to do. One ordered list decides the
label and the link, `classify` is three lines that read it, and `Browsable` is
gone rather than relocated. Every finding from the first pass is closed except
the ones listed below, and the version work that landed alongside it is a
bigger improvement than anything the first pass asked for:
`HclVersionService` went from 210 lines of index scanning to 71, with the
constraint grammar lifted into `versionConstraint.ts` as comparators rather
than a range string. OpenTofu pins are now verified against OpenTofu's own
registry instead of being trusted as written.

Everything this pass raised has landed. The layering it argued for is built, and
what follows it is the record of that layout and the rules holding it, then one
known limit that is now written down rather than silent.

Verified after the last change: `tsc --noEmit` clean, 233 tests across 15 suites,
eslint 0 errors, `check-corpus-sync` agreeing, webpack building. The corpus
baseline was not regenerated through any of it, so every browse url the
extension produces is byte for byte what it produced before.

## the layering, as built

Not a finding any more. This is what landed, and the rules that keep it that
way, kept here because the reasoning is not visible from the folder names.

The cause it addressed: `util/` was the only folder with no admission test, so
three unrelated kinds of module collected in it and two service classes grew
to span three layers each. `split`, `detect`, `classify`, `sourceResolvers` and
`versionConstraint` import types and constants and nothing else, and what they
encode is what a Terraform module source is and what `~>` means. That is the
most domain specific code in the repository, and it was filed under the folder
whose name says it is incidental.

### the two classes that spanned layers

`HclService` was three layers in one, which is why no name fit it:

```
getFileType, getFileName, getElementById("read-only-cursor-text-area")
    reading the rendered GitHub page                     data access
findTerraformSources, findModuleSources, isHclModule
    what a terraform{}, required_providers or module "x" block is   domain
findSourcesAsync
    read, parse, extract, loop, build rows               service
```

Its own test proves the cost: `HclService.test.ts` builds
`new HclService(new TerraformFetchService(new TerraformDataAccess(new MockFetchService())))`
to call `getFileType()`, which touches none of that.

`HclVersionService` was two registries with two different failure policies in
two methods of one class, and nothing in the structure said so:

```
getTerraformProviderVersionAsync   no match -> newest published;  none -> throw
getOpenTofuVersionAsync            no constraint -> "";  no match -> "";  never throws
```

Terraform falls back to a live version because its browse url needs a version
segment. OpenTofu returns "" because it has a `latest` route. The rule they
share, `selectVersion(published, toVersionConstraint(constraint))`, is already
in the domain, so what is left in each method is about six registry specific
lines. Neither class is about HCL; neither ever sees it.

### not a case for more services

A service here wraps data access and validates. The parsers wrap nothing,
because they do no I/O. `DetectService` with a constructor and an interface
would add a class, a wiring line and a mock per test, and remove nothing. The
functions are the right shape. They are filed wrong, not built wrong.

### the layout

```
data-access/   GitHubPageDataAccess           getFileType, getFileName, the
                                              textarea read, isSignedIn
               TerraformRegistryDataAccess    host, path, fetch, wire shape
               OpenTofuRegistryDataAccess     same, for its own api
               IFetchService                  moved down from services/
               ChromeRuntimeFetchService, ChromeStorageCache   moved down

services/      PageModuleService              was HclService, orchestration only
               TerraformVersionService        Terraform's fallback policy
               OpenTofuVersionService         OpenTofu's fallback policy
               ModuleSourceLinker             unchanged

domain/        moduleSource/{split, detect, classify, sourceResolvers}
               moduleDeclarations             was findTerraformSources and
                                              findModuleSources, one entry point
               versionConstraint, jsonConfig

models/        DisplayModule                  was DisplayHlcModule
```

Gone: `HclService`, `HclVersionService`, `TerraformFetchService`,
`GitHubElementService`.

`tabMessage.ts` belongs to none of these. It is the message contract between
the background, content and popup scripts, and it is pure. It belongs beside
the types it guards.

`HclParser.ts` reaches chrome and knows Terraform, so it is data access plus
domain. Worth separating when it is next touched, not as part of this move.

`DisplayHlcModule` is misspelled: the file is `DisplayHclModule.ts` and the
class and interface are `Hlc`. It is also not an HCL thing, it is a display row
for a Terraform module. `DisplayModule` fixes both, across 23 call sites.

### `TerraformFetchService` dissolves, but not for the reason first given

The first argument was that url building and response parsing change together,
so they belong together. That is an argument for a different pattern, not
against this one, and consistency with broker plus foundation service is worth
more than that.

What actually forced the merge was three defects that are fixable either way:

1. `data-access/ITerraformDataAccess.ts` imports `RunTimeFetchResponse` from
   `services/IFetchService`. Data access depends on services; the arrow is
   backwards. Move `IFetchService.ts` into `data-access/`.
2. It returns `RunTimeFetchResponse<any>`, so `ok`, `status` and `headers`
   cross upward and the service knows it is HTTP. The `any` is why
   `Unsafe member access .versions` appears in the lint output. Those warnings
   are the leak, not noise.
3. `TerraformFetchService` declares `OpenTofuVersions`, the wire shape of an
   endpoint it does not own. Wire shapes belong next to the url that produces
   them, because they change for the same reason.

Type both responses in data access and the service's remaining job is real but
thin, which is fine. The reason it dissolves here is the one to one mapping in
the layout above: one data access class per registry, one service per registry,
rather than one service straddling two.

### interfaces

TypeScript is structurally typed, so a stub with the same public shape is
already assignable without an interface or `implements`. The interface per
dependency habit comes from C#, which is nominally typed and has no choice. The
Standard is a .NET pattern, and this is the tax it charges that TypeScript does
not.

Two cases still earn one:

1. A second real implementation exists.
2. Private members block structural typing. A class with a `private` field is
   compared nominally, so a plain object of the same public shape will not
   assign. `TerraformDataAccess` has `private readonly runtimeFetchService`,
   so it cannot be stubbed without one.

For case 2 there is a lighter option than a second file:

```ts
type VersionsReader = Pick<TerraformRegistryDataAccess, "getVersionsAsync">;
```

`Pick` drops the privates, the contract is derived from the implementation
rather than maintained beside it, and it names the one method the consumer
actually uses.

| interface                | verdict | why                                            |
| ------------------------ | ------- | ---------------------------------------------- |
| `IFetchService`          | keep    | two implementations, and the suite's test seam |
| `IGitHubPageDataAccess`  | add     | every `PageModuleService` test substitutes it  |
| `ITerraformDataAccess`   | drop    | one implementation, never substituted          |
| `ITerraformFetchService` | drop    | one implementation, tests swap below it        |
| `IHclVersionService`     | drop    | one implementation and no consumers at all     |

On DI: `contentscript.ts:15-17` is already a composition root doing constructor
injection. What is absent is an IoC container, which buys runtime registration
and lifetime scopes that one wiring site does not need. Nothing to add.

Annotating that root with the interface, `const fetchService: IFetchService =
new ChromeRuntimeFetchService()`, adds nothing: the interface matters at the
consumer's parameter, not at the construction site.

### the admission tests

The point of the move is that each folder gets a rule, and two are enforceable
rather than remembered:

- `domain/` may not import `chrome`, `fetch`, `data-access/` or `services/`.
- `util/` may not import `domain/`, `data-access/` or `services/`, and may not
  name a Terraform concept.

Both are eslint `no-restricted-imports` entries. A folder with a rule the build
checks stops being a dumping ground; a folder with a convention does not.

### where the constants land

Placement stops being a consumer count and becomes the layer test:

| constants                                                                                                       | to                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `SOURCE_SEPARATORS`, `SOURCE_SCHEMES`, `HTTP_SCHEMES`, `VCS_PREFIXES`, `ARCHIVE_PREFIXES`, `ARCHIVE_EXTENSIONS` | `domain/moduleSource/`                      |
| `TERRAFORM_VERSION_CONSTRAINTS`                                                                                 | `domain/versionConstraint.ts`               |
| `TERRAFORM_PROVIDERS`, `FILE_EXTENSIONS`                                                                        | `domain/moduleSource/`                      |
| `TERRAFORM_REGISTRY_ROUTES`                                                                                     | `data-access/`, it is the api's url grammar |
| `GITHUB_LINKS`                                                                                                  | `data-access/GitHubPageDataAccess`          |
| `CACHE_KEYS`, `SENDERS`, `PARSER_QUERY`, `ALLOWED_FETCH_HOSTS`, `GITHUB_ROUTES`, `TERRAFORM_SYNTAX`             | stay in `constants.ts`                      |

`registryRoute: string` carrying `"providers"` and `"modules"` from the domain
is the last leak. Those are the registry api's url segments, and
`linkOpenTofuRegistryAsync` already computes two routes from one boolean
because of it, one for browsing and one for the api. Replace the string with a
domain type:

```ts
export type RegistryTarget = "module" | "provider";
```

The domain maps it to its browse route, data access maps it to its api path,
and that double mapping collapses to one. Cost: two small maps instead of one
shared constant. OpenTofu already proves the two vocabularies diverge, since
its browse route is singular where its api route is plural.

### the error policy the layers already follow

Writing it down, because it is coherent and undocumented:

| layer                | on failure                                                 |
| -------------------- | ---------------------------------------------------------- |
| data access          | returns `ok: false`, never throws                          |
| services             | throw, with the address in the message                     |
| `ModuleSourceLinker` | catches the version lookup only, returns no link           |
| `PageModuleService`  | catches per module, so one bad row cannot take the page    |
| domain               | never throws; the zero value carries `Unsupported` instead |

This is the lighter alternative to The Standard's exception per layer. Keep the
policy, write it in the folder's own doc comment, and skip the hierarchy. The `@throws` tags that make it
legible at each call site are now in place to make it legible at each call site.

## forge browse layouts, and why HEAD

Both forges resolve `HEAD` to the default branch, and guessing `main` is what
breaks. Measured against real repositories, following redirects:

```
bitbucket.org/atlassian/atlassian-event   default branch master
  /src/HEAD/                        200
  /src/master/                      200
  /src/main/                        404   <- the guess this replaced
  /src/definitely-not-a-branch-xyz/ 404   <- control: the status means something

github.com/git/git                        default branch master
  /tree/HEAD/Documentation          200
  /tree/main/Documentation          404   <- same guess, same failure
  /tree/master/Documentation        200
```

So `main` was not a harmless default: on any repository that still defaults to
`master`, every subDirectory link 404d. That was live on GitHub, not just Bitbucket,
and the earlier fix only covered the case where there was no subDirectory either.

Bitbucket serves files and directories from one `/src/{ref}/{path}` route where
GitHub splits `blob` and `tree`, so no file test is needed for it. One further
measured difference worth knowing: on Bitbucket a bad _path_ returns 200, only
a bad _ref_ 404s. Getting the ref right is what matters; a wrong subDirectory lands
in the repository rather than on an error.

An unknown forge still gets the repository root, which is correct and less
specific, and the comment saying so is on the branch that does it.

### one table, not a list and a branch

The forges live in `domain/moduleSource/forges.ts`: host to browse route, with
`FORGE_HOSTS` derived from its keys. `detect` reads the keys to decide what
counts as shorthand and `linkForge` reads the values to build the url.

This is not a pattern taken for extensibility. It is the same argument the
resolver table was taken for: the list existed twice, once in the detector and
once as a branch in the linker, and a forge added to one and not the other is
recognised as shorthand and then silently linked to its repository root.
Degraded rather than broken, so nothing fails and no test catches it. One
table removes the way to be half right.

Verified by adding a third forge as a single entry, `"gitlab.com": () =>
"-/tree"`, and confirming `gitlab.com/ns/repo//modules/vpc` came back
`ShorthandAddress|GitForge` labelled `git` with no edit to `detect.ts`.

A factory or a strategy class was not warranted and still is not. The variation
between forges is one expression returning one path segment; everything else,
the `.git` strip, the root, the `HEAD` default, the empty subDirectory guard, is
shared. The entry becomes a full builder the first time a forge does not fit
`{route}/{ref}/{path}`: SourceHut puts a segment between the ref and the path,
and Azure DevOps puts both in the query string. Objects only become worth it if
a forge ever needs state or a dependency, which none of the known ones do now
that `HEAD` removed any need to ask a forge for its default branch.

## popup layout

Separate from the chain, done this session. `popup.html` was pinned at 300px,
which is what forced the columns to wrap and the table to scroll. The body now
sizes to its content between 520px and the 800px Chrome allows a popup, every
cell is `nowrap`, and the name is the only column that ellipsizes, which is
what keeps the table inside the cap. The phantom fourth column on the
pagination footer (`colSpan={4}` on a three column table) is gone.

Measured in Chromium: table 723px against a 723px container with a 290
character module name, no wrapped cells, rows one line at 52-53px. With short
names the popup shrinks to its 520px floor. `tests/e2e/specs/popup-layout.spec.ts`
asserts both, seeded through `chrome.storage` so it does not depend on GitHub.

## closed since the first pass

1. Two priority orders over one flag set. `MODULE_SOURCE_RESOLVERS`.
2. `registry.terraform.io` labelled a private registry. `isPrivateRegistryHost`
   plus the `DEFAULT_REGISTRY_HOST` check in `linkRegistryAsync`.
3. classify branching on strings. The `HttpTransport` and `MercurialRepo` bits.
4. `path` carrying two conventions. `withLeadingSeparator` in every branch.
5. `Browsable` recomputed by its only consumer. The bit is deleted.
6. The catch wrapping more than the network. Scoped to the two version
   resolvers.
7. The scp scan running three times. `readScpParts`.
8. `exactVersionOrLatest` injected as a dependency. Gone, replaced by a real
   OpenTofu lookup.
9. `FILE_EXTENSIONS` dead with `.git` inlined. `stripGitSuffix` uses the
   constant again.
10. The doubled JSDoc on `resolveVersionAsync`. Merged. It reappeared one file
    over; see minor.
11. `main` guessed for a bare repository. Guarded at `sourceResolvers.ts:188`.
12. The linker built per module. Hoisted to `HclService` and shared.
13. The resolved version returned through a mutable box. `LinkBuilder` returns
    `ModuleLink`, and `contextFor` lost the fourth parameter.
14. `mercurial`, `archive` and `httpAddress` returning a locator that was not a
    url. One `linkHttpLocator` builder, guarded on `HttpTransport`.
15. Two sentinels for the same absence. One `VersionLookup` shape returning
    `Nullable<string>`, and one `contained()` helper in place of two closures.
16. Three dead fields on `ModuleSource`. Deleted.
17. Row 0 of the resolver table load bearing and unexplained. It now says why
    it must stay first.
18. Nothing documenting what throws. `@throws` on all 11 sites across 7 files,
    covering propagated and implicit throws, not just `throw` statements.
19. A ref with no subDirectory leaving a trailing separator. Two baseline rows
    regenerated; no row ends in one now.
20. The doubled JSDoc on the Terraform version lookup. Merged, stale half gone.
21. `DisplayHlcModule` misspelled and misnamed. `DisplayModule`, 23 sites, and
    its one implementation interface deleted.
22. `HclVersionService` spanning two registries. `TerraformVersionService` and
    `OpenTofuVersionService`, one per registry, each owning its fallback.
23. `TerraformFetchService` cleaning up after an untyped boundary. Dissolved
    into two registry data access classes with their wire shapes declared.
    `IFetchService` moved down to `data-access`, where the transport lives.
24. `HclService` spanning three layers. `GitHubPageDataAccess`,
    `readModuleDeclarations` and `PageModuleService`.
25. A module that could not be linked losing its whole row. The catch is inside
    `DisplayModule.buildAsync` around the link only, so the label survives.
26. `GitHubElementService` entirely dead. Deleted.
27. `Terraform.required_providers` typed `[]`, the empty tuple, which only
    compiled because its one caller indexed with a variable.
28. The parsers filed under `util/`. Moved to `domain/`, with the layer rules
    enforced by `no-restricted-imports` rather than remembered.
29. `registryRoute: string` carrying the registry api's url segments through
    three layers. `RegistryTarget` now, mapped to a url by each layer that
    needs one.
30. Bitbucket subdirs dropped. Its `/src/{ref}/{path}` layout is handled, and
    five corpus expectations were updated with the baseline.
31. `main` guessed as the default branch whenever a subDirectory was present, which
    404d on every `master` repository. `HEAD` on both forges, verified.
32. The forge list living twice, in the detector and as a branch in the linker.
    One `forges.ts` table, with `FORGE_HOSTS` derived from its keys.
