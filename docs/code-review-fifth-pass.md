# code review, fifth pass

On whether `util/` is a smell, measured against the Standard conformant
TypeScript in `hassanhabib/standard-agents`. Review only, no code changed.

Verified before reviewing: `tsc --noEmit` clean, tests green, eslint 0 errors,
7 warnings remaining, down from 19 at the fourth pass.

## what the reference actually does

Fetched from the repository rather than recalled:

```
src/
  brokers/<plural>/          TimeBroker.ts          the contract
                             SystemTimeBroker.ts    the implementation
  models/
  services/
    foundations/<plural>/    SessionService.ts
                             SessionService.Validations.ts
                             SessionService.Exceptions.ts
                             SessionServiceTests.Logic.Record.test.ts
                             SessionServiceTests.Validations.Record.test.ts
                             SessionServiceTests.Exceptions.Retrieve.test.ts
    orchestrations/  coordinations/  managements/
  clients/  tools/
```

Four things worth taking from that, only two of which are about folders:

1. There is no `util`, `utils`, `helpers` or `common` anywhere in the tree.
2. A broker exists for something as small as reading the clock. Wrapping a
   platform call is a first class thing there, not a helper.
3. Validation is a named file belonging to a named service, not a loose
   predicate. `SessionService.Validations.ts`.
4. The contract has no `I`. `TimeBroker` is the interface and
   `SystemTimeBroker` implements it.

## verdict

The instinct is right, but not for the reason usually given. `util/` here is
not unbounded: the second pass gave it an admission test and the build enforces
it, so nothing in it knows the domain or does I/O. That rule works and has held.

The problem is that the test is _negative_. "Knows nothing and touches nothing"
admits anything that knows nothing and touches nothing, so the folder collects
things that have nothing to do with each other and, more importantly, things
that do have an owner but were never attached to one.

The evidence is that it grew during this review series, from four files to
five, and the newest arrival is the clearest case of something with an owner:

```
util/Constants.ts            3 exports, read by 4 modules across every layer
util/PathHelpers.ts          3 exports, read by 4 modules
util/TabMessageGuards.ts     4 exports, read by 1 module
util/UrlSafety.ts            2 exports, read by 5 modules
util/WorkerRequestGuards.ts  2 exports, read by 1 module   <- added this week
```

Two of those five are read by exactly one module each. A helper with one caller
is not shared code, it is the caller's code filed somewhere else.

## 1. the guards are Validations files that never found their service

`util/TabMessageGuards.ts`, `util/WorkerRequestGuards.ts`

These were arrived at independently and they are exactly the reference's
pattern: predicates that narrow an untrusted incoming message, split out of the
thing that receives it. `isParseRequest`, `isFetchRequest`,
`shouldHandleMessage`, `isBackgroundRefresh`.

What is missing is the other half of the pattern. In the reference these are
`SessionService.Validations.ts`, next to `SessionService.ts`, named after it and
owned by it. Here they are in the folder for code that belongs to nobody, and
each is read by exactly one module.

Cost: the connection between a boundary and the rules guarding it is not
visible from either side. A reader of `backgroundscript.ts` has to know to go
looking; a reader of `WorkerRequestGuards.ts` cannot tell who is supposed to
call it, or whether anyone still does.

Fix: move each next to its caller and name it for that caller. This is the one
finding in this pass that is unambiguous, cheap, and does not require adopting
anything else from The Standard.

## 2. `UrlSafety` is a broker and a validation wearing one name

`util/UrlSafety.ts`

Two exports doing different jobs:

- `isSafeHttpUrl` wraps `new URL()`, a platform call that throws, and asks
  whether the protocol is http. The wrapping is broker work by the reference's
  standard, which has a broker for the clock.
- `isAllowedFetchHost` takes an allowlist and decides whether a request may go
  out. That is a policy, which is validation work.

Cost: low in practice, because both are pure and correct. The cost is naming:
one file called safety holds a platform wrapper and an authorisation rule, and
the second is the one that matters for security review.

Fix by the reference: a `urls` broker exposing the parse, and the http decision
plus the allowlist as validations on the services that need them.

Fix I would actually take: leave `isSafeHttpUrl` where it is and move
`isAllowedFetchHost` to the worker's validations with the allowlist constant it
reads. A broker for `new URL()` would mean a class, an interface and an
injection into all five callers, to make substitutable something that is
already pure and deterministic. This codebase already substitutes at
`IFetchService` and `IGitHubPageDataAccess`, which are the boundaries the tests
actually need. That is the line I would draw: take the ownership lesson, leave
the broker-per-platform-call ceremony.

## 3. `Constants` is three constants with three different owners

`util/Constants.ts`

```
GITHUB_HOST           domain vocabulary, read by RepositoryHosts and the scripts
CACHE_KEYS            storage keys, which is the storage cache's vocabulary
ALLOWED_FETCH_HOSTS   a policy, read only by the background worker
```

The file passed the "crosses layers" test from the second pass, and that test
was the right one at the time. Under the reference's model the question is not
how many layers read a value but which thing owns it, and by that question all
three have an owner and none of them is `util`.

Fix: `CACHE_KEYS` to the storage cache, `ALLOWED_FETCH_HOSTS` to the worker
validation that enforces it, `GITHUB_HOST` to the host table that already
declares the other host in the same set. `util/Constants.ts` then has nothing
in it.

## 4. `PathHelpers` is the one with no good answer

`util/PathHelpers.ts`

`PATH_SEPARATOR`, `lastSegment` and `isFilePath` are pure string work over
paths, read by `Detect`, `RepositoryHosts` and `ModuleSourceResolvers` in the
domain, and by `GitHubPageDataAccess` in data access.

The reference has no home for this. It is not a broker, because it wraps
nothing external. It is not a service, because it has no dependencies and no
logic worth the name. In a Standard codebase it would be duplicated into each
service that needs it, or pushed onto a model, and duplicating a one line
`split().filter().pop()` four times is worse than the folder it came from.

Worth noticing though: three of its four callers are in `domain/`. The fourth
uses only `lastSegment`, to take a filename off a pathname, and that one call
inlines to a single expression. Do that and `PathHelpers` becomes domain only
and can move into `domain/`, which removes the last reason for the folder to
exist.

## what this adds up to

`util/` is a smell when it is the _default destination_ for anything without an
obvious home, and that is what it has become here: five files, four unrelated
concepts, two of them with exactly one caller. It is not a smell because the
name is on a list of bad names.

Evacuating it is mostly moving things to owners that already exist:

```
TabMessageGuards      -> beside the content script that reads it
WorkerRequestGuards   -> beside the background worker that reads it
ALLOWED_FETCH_HOSTS   -> with the worker validation that enforces it
CACHE_KEYS            -> ChromeStorageCache
GITHUB_HOST           -> RepositoryHosts, next to the other host
PathHelpers           -> domain/, after inlining the one data-access call
isSafeHttpUrl         -> the only genuine leftover
```

Which leaves one predicate with five callers and no owner. At that point the
folder is not a junk drawer with a rule, it is one file, and the question stops
being interesting. If it bothers you, it is a sink guard: the two renderers and
the linker all call it before putting a url in front of a user, so it can live
with whichever of those is deemed to own "we do not render a url we did not
check".

## where this codebase departs from the reference, deliberately

### interface naming: settled, the `I` stays

The reference drops the `I` on contracts, `TimeBroker` being the interface and
`SystemTimeBroker` the implementation. This codebase keeps it: `IFetchService`
and `IGitHubPageDataAccess` stay as they are, and the eslint rule requiring the
prefix stays on.

Recorded so a later pass does not reopen it. The .NET Standard this is a port
of uses `IDateTimeBroker`, so dropping the `I` is the reference's own
TypeScript departure rather than the rule; keeping it is both closer to the
Standard and already enforced here.

### service file splitting: open

The reference splits `.Validations.ts` and `.Exceptions.ts` off every service
and mirrors that in test names. This codebase splits neither, and its error
policy is a table in the second pass doc rather than a file per service. The
guards in finding 1 are the only place the pattern appears. Adopting it
wholesale is a much larger change than this pass is proposing, and I would not
take it for a thirty file extension. Adopting the _naming_ for the two guard
files is finding 1 and costs nothing.
