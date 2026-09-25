# code review, third pass

Against the tree after the layering work in `docs/code-review-second-pass.md`.
Working notes, not committed.

Verified before reviewing: `tsc --noEmit` clean, 237 tests across 15 suites,
eslint 0 errors, `check-corpus-sync` agreeing, webpack building.

## verdict

The layers hold. `domain/` imports nothing that does I/O and the build checks
it. What is wrong now is presentation, and the complaint behind this pass is
correct and measurable: types are declared in eight places, `models/` and
`types/` have no rule dividing them, and `domain/` is written in a different
idiom from every other folder. Two files are named after what they are not.
Two modules are dead.

None of this is a defect. All of it is why the folder is hard to read.

## 1. two homes for types, and no rule between them

Exported types and interfaces, by where they are declared:

| where                                    | what                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `types/`                                 | `Nullable`, `SourceTypes`, `HclFileTypes`, `ModuleSource`, `Terraform` (4), `Module`, `HclModule`, `RegistryTarget` |
| `models/`                                | `IHclFile`, `ITablePaginationActionsProps`, `DisplayModule`                                                         |
| `domain/moduleSource/sourceResolvers.ts` | `VersionLookup`, `LinkContext`, `ModuleLink`, `ModuleSourceResolver`                                                |
| `domain/versionConstraint.ts`            | `ComparisonOperator`, `Comparator`, `VersionConstraint`                                                             |
| `data-access/IFetchService.ts`           | `RunTimeFetchResponse`, `IFetchService`                                                                             |
| `data-access/GitHubPageDataAccess.ts`    | `IGitHubPageDataAccess`                                                                                             |
| `services/ChromeRuntimeParserService.ts` | `ParseHclResponse`                                                                                                  |
| `util/tabMessage.ts`                     | `TabMessage`, `BackgroundRefresh`, `PopupRequest`                                                                   |

Nothing distinguishes `models/` from `types/`. `IHclFile` is a parsed config
shape and sits in `models/`; `Terraform` and `Module`, which are the same kind
of thing, sit in `types/`. `DisplayModule` is in `models/` and is not a model
at all, it is a class with an async factory on it.

Cost: there is no answer to "where does this type go", so the next one lands
wherever the author looked first, and a reader hunting for a shape checks two
folders and then greps.

Fix: one home, `models/`, one type per file named after the type. Two rules
decide the rest:

- A type more than one file names goes in `models/`. A type only its own file
  uses stays where it is. Same rule the constants now follow.
- A data shape goes in `models/`; a contract that defines a layer boundary
  stays with the layer that owns it. So `RunTimeFetchResponse` moves and
  `IFetchService` does not, because data-access owning the transport contract
  is the thing that made the arrow point the right way.

By that rule `LinkContext`, `ModuleLink`, `VersionLookup`,
`RunTimeFetchResponse` and the `TabMessage` union move to `models/`;
`ModuleSourceResolver`, `ParseHclResponse`, `Comparator` and
`ComparisonOperator` stay where they are, named by one file each.

`Nullable<T>` is the one that fits neither: it is a language shim, not a model.
It belongs in `util/`, which already admits exactly that, holding no domain
knowledge and doing no I/O. In C# it would not exist at all, `string?` being
the language's own answer, and `T | null` is TypeScript's. Deleting it is the
more honest change and a wide one; moving it is cheap and settles the folder
question either way.

## 2. `domain/` is written in a different idiom from everything else

Every other folder is PascalCase files named after a class:

```
data-access/  ChromeRuntimeFetchService, GitHubPageDataAccess,
              TerraformRegistryDataAccess, OpenTofuRegistryDataAccess
services/     HclParser, ModuleSourceLinker, PageModuleService,
              TerraformVersionService, OpenTofuVersionService, ChromeStorageCache
models/       DisplayModule, IHclFile, ITablePaginationActionsProps

domain/       jsonConfig, moduleDeclarations, versionConstraint
domain/       moduleSource/{classify, detect, forges, sourceResolvers, split}
util/         constants, path, tabMessage, urlSafety
```

Cost: the eye reads the two halves as different codebases, and the file list
stops telling you what lives where. A reader who knows the rest of the tree
cannot guess a domain filename.

Fix: PascalCase every file, named after its primary export. `versionConstraint`
becomes `VersionConstraint`, `sourceResolvers` becomes `ModuleSourceResolvers`,
`forges` becomes `ForgeLayouts`, `path` becomes `PathHelpers`, and so on. This
is rename only, no code changes.

## 3. `jsonConfig` is a parser named like configuration

`src/domain/jsonConfig.ts`

`parseJsonConfig(contents: string): IHclFile` takes file text and returns a
parsed config. That is a parser. The name says configuration, which is why it
reads as data access or settings.

It is also the twin of `HclParser`: both turn file text into `IHclFile`, and
`HclParser.parseAsync` delegates to it for `.json`. The two are not visibly
related. They differ in shape, a class against a function, in folder, services
against domain, and in name.

The folder split is correct and worth keeping: `HclParser` fetches wasm through
chrome and belongs in a layer that may do I/O, while the JSON reader is pure.
What is missing is that the pairing is invisible.

Fix: `TerraformJsonParser`, named to pair with `HclParser`, with a line in each
pointing at the other. Do not merge them behind an interface: there is one
`if` on the file extension choosing between them, no duplication and no second
list, so a strategy would buy nothing. That is the same test the forge table
had to pass.

## 4. `moduleDeclarations` is neither a parser nor a service

`src/domain/moduleDeclarations.ts`

Taking the two options as posed: not on `HclParser`, and not a service.

Not on `HclParser`, because they do different jobs. `HclParser` turns text into
an `IHclFile`. This turns an `IHclFile` into the declarations inside it. Adding
it would also drag a pure function into the layer that touches chrome and wasm,
which the build now forbids in the other direction and which would make it
untestable without the parser.

Not a service either, on this codebase's own definition: a service wraps data
access and validates. This wraps nothing and does no I/O, so it would be a
class with an empty constructor, a registration in the composition root and a
mock in every test that touches it, in exchange for nothing.

What it is is a reader over a parsed config, and the name should say so:
`ModuleDeclarationReader`, with `readModuleDeclarations` as its entry point. It
stays in `domain/`, pure and directly testable, which is what lets
`PageModuleService` be tested without a DOM.

## 5. two dead modules

`src/services/InMemoryCache.ts` has no consumers. `RequiredProvider` in
`src/types/Terraform.ts` has no references: its last caller went when
`HclService` was split, since the rewritten reader types the provider map
directly.

Cost: both read as live, and `InMemoryCache` reads as an alternative to
`ChromeStorageCache` that someone might wire up.

Fix: delete both. `GitHubElementService` was the same and went in the last
pass.

## 6. minor

- `src/contentscript.ts:27`, `chromeStroageCache`, and `src/popup-page/popup.tsx`,
  `chromeStorageCahce`. The same variable misspelled two different ways in two
  files. `DisplayHlcModule` was the third and is fixed.
- `src/util/constants.ts` is now six exports and the name still says nothing
  about what belongs. With the placement rule from the last pass written down,
  `CrossLayerConstants` or splitting it by consumer would both say more.

## what translates from C#, and what does not

The parts worth taking, all of which this pass recommends:

- One public type per file, the file named after it.
- PascalCase filenames, uniformly.
- Data shapes separated from behaviour.
- Interfaces prefixed `I`, already enforced by the lint config.
- Classes where there are dependencies to inject, already true of every
  service and every data access class.

The part worth resisting: wrapping pure functions in classes so that the file
contains a class. `split`, `detect` and `classify` have no state and no
dependencies. A class around them adds a `new` at every call site or a set of
static methods, which is the same functions with more syntax, and it costs the
ability to import one of the three. A TypeScript module of exported functions
_is_ what C# calls a static class. The unit of grouping is the same, the file,
and only the ceremony differs.

So the honest balance is that everything C# gets from file and type discipline
is available here and should be taken, and the one thing that does not survive
the translation is the requirement that behaviour live inside a `class` keyword.
Taking the naming and leaving the ceremony gets a tree that reads like C#
without writing TypeScript badly.

## the target layout

```
models/       one type per file: DisplayModule, HclFile, ModuleSource,
              ModuleLink, LinkContext, VersionLookup, TerraformModule,
              RegistryTarget, SourceType, HclFileType, RunTimeFetchResponse,
              TabMessage, HclModule, Module
data-access/  unchanged, keeps IFetchService and IGitHubPageDataAccess
services/     unchanged, minus InMemoryCache
domain/       VersionConstraint, TerraformJsonParser, ModuleDeclarationReader,
              moduleSource/{Split, Detect, Classify, ForgeLayouts,
              ModuleSourceResolvers}
util/         Constants, PathHelpers, TabMessageGuards, UrlSafety, Nullable
```

Cost: a rename touching most imports again, on top of the folder move that just
landed. Nothing changes shape and no behaviour moves, so the tests carry it,
but it is the second large boring diff in a row and wants to be its own commit.
