# benchmark plan

For architectural review. No code written yet.

Scope: browser performance of the extension on large Terraform files, and the
cost of its caching. Goal is a benchmark that runs in CI and can be run by
hand when something feels slow.

## why

Nothing in the repository measures performance. The correctness corpus is 54
rows across 16 files totalling 241 lines, the largest file being 38 lines.
No fixture is big enough to move a timing number, so a regression in any of
the costs below would land unnoticed.

## what was measured

Run against real GitHub through the existing Playwright harness, which loads
the real extension in a real Chrome.

| file                          | `div[id^="LC"]` | `span.pl-s` | textarea chars |
| ----------------------------- | --------------- | ----------- | -------------- |
| fixtures 14-security-cases.tf | 38              | 7           | 1,182          |
| terraform-aws-vpc main.tf     | 210             | 24          | 63,082         |

GitHub virtualises the rendered lines and keeps the whole file in
`read-only-cursor-text-area`. The second file is roughly 1,500 lines and
renders 210 of them.

Two consequences:

- Parsing and module resolution scale with file size, because the parser reads
  the textarea.
- Link injection does not. It can only ever see what GitHub has rendered.

The wasm payload is 1,879,194 bytes gzipped, fetched and inflated on every
service worker cold start.

## cost model

| cost                | scales with                      | paid when               |
| ------------------- | -------------------------------- | ----------------------- |
| wasm load           | constant                         | every worker cold start |
| HCL parse           | file size                        | every cache miss        |
| module resolution   | module count, serial             | every cache miss        |
| scroll re-injection | file length, via scroll pauses   | every scroll pause      |
| DOM dedupe          | rendered lines, capped near 210  | every injection         |
| worker cold starts  | files read over a few minutes    | see below               |
| popup open          | module count, and a 329KB bundle | every popup open        |

Worker cold starts turn a constant into the dominant term. MV3 stops an idle
worker after roughly thirty seconds, so a user reading several files over a
few minutes pays the 1.88MB inflate and compile repeatedly, not once.
Recording the wasm load as a constant to be subtracted is the framing that
would stop anyone noticing it is the largest real cost in the product. The
measurement to take is cold starts per session, and the question it raises is
why the load is paid more than once rather than how long it takes.

The popup is its own page load and its cold path is worse than the content
script's, not comparable to it:

```
popup open
  index.js                         329KB parsed and executed, every open
  storage.get(MODULES)             payload scales with module count
  on miss: executeScript           injects contentscript.js, 44KB, into the tab
           sendMessage             then waits for the full parse and every
                                   serial registry fetch
  render                           a row per module
```

`dist/index.js` is 329KB against the content script's 44KB, because the popup
carries React and MUI. That cost is paid on every open and is independent of
the file being viewed.

The render is bounded by pagination at `popup.tsx:55`, five rows by default.
It is unbounded when the user picks All from `rowsPerPageOptions`, which is
the worst case and the only part of the popup that scales with module count
at render time. The storage read and the message payload scale regardless of
what is rendered.

`PageModuleService.ts:44` resolves modules one at a time:

```ts
for (const [, declaration] of declarations) {
    modules.push(await buildDisplayModuleAsync(pageUrl, declaration, this.moduleSourceLinker));
}
```

Each registry module is a network round trip. Forty registry modules is forty
serial round trips. This is expected to dominate.

`contentscript.ts:224` re-injects on every scroll pause, debounced 100ms:

```
scroll -> 100ms -> injectHyperLinksToPageAsync
                     hydrateModulesAsync
                       storage.get(MODULES)        cross process, every pause
                       on miss: full parse + every registry fetch
                     addHyperLinksToModuleSource   DOM walk, every pause
```

The dedupe in `addHyperLinksToModuleSource` is O(n squared):
`self.indexOf(htmlElement) === index` inside a `.filter`. At 210 rendered
lines that is bounded and small. It would matter if GitHub stopped
virtualising, and not before. Recorded so a later reader does not rediscover
it and assume it is hot.

## fixtures

In the fixtures repository under `benchmarks/`, one folder per axis, two
sizes per axis so the assertion can be a ratio rather than a number. A ratio
cancels out CI hardware.

```
benchmarks/
  parse/        small.tf  large.tf  worst-case.tf   500 and 2000 lines, few modules
  resolution/   small.tf  large.tf  worst-case.tf   10 and 40 registry modules
  scrolling/    small.tf  large.tf  worst-case.tf   modules spread down a long file
```

Handcrafted, not generated. A generator is a second thing to maintain, test
and benchmark.

The popup does not get its own folder. Its cost is driven by module count, so
it runs against `resolution/`, with one extra case: the same fixture with
rows per page set to All, which is the only configuration where the popup's
render scales.

`dom/` is deliberately absent. It cannot exceed what GitHub renders, so
density within the rendered window is the only variable and that belongs in
`scrolling/`.

Worst case content to handcraft:

- a `description` whose value equals a real module source, which the matcher
  will link (see defects below)
- modules only at the bottom of a long file, unlinked until scrolled to
- forty registry modules all needing version resolution
- the same source repeated twenty times
- a comment containing a string that looks like a module source, as a negative
  case: it must not be linked, and asserting that guards the selector
- a heredoc body containing one, also a negative case, and worth asserting
  separately from the comment because it survives for a different reason

`check-corpus-sync` derives its file list from the corpus and never
enumerates the repository, so `benchmarks/**` is invisible to it and needs no
change there.

## how it is measured

Four phases timed separately. One end to end number is useless because the
1.88MB wasm load is constant and swamps everything else on a cold run.

| phase             | where          | read from                      |
| ----------------- | -------------- | ------------------------------ |
| wasm load         | service worker | `serviceWorkers()[0].evaluate` |
| parse             | service worker | same                           |
| module resolution | content script | `page.evaluate`                |
| DOM injection     | content script | same                           |
| popup bundle      | popup page     | Navigation Timing, no marks    |
| popup render      | popup page     | `page.evaluate`                |

This needs `performance.mark` and `performance.measure` calls in the content
script and the parser. Accepted in review, with three conditions.

Marks on the scroll path accumulate for the life of the page. Whatever emits
them must `measure` then `clearMarks` for that name, or a file left open
grows the buffer with a history of every pause.

Mark names are a contract between production code and the harness, and
breaking it reads as a pass: a rename makes `getEntriesByName` return empty,
the duration reads as absent, and a benchmark measuring nothing looks like a
benchmark that got faster. The names live in one exported const both sides
import, and the harness asserts each measure exists before reading it.

No phase may span processes. Worker marks and content script marks are
separate timelines with different time origins, so subtracting across them
produces a number that means nothing. The phase table splits by process for
this reason. There is no end to end figure and there cannot be one.

Cold and warm are both measured. Warm is a second navigation. Cold needs
empty storage and a cold service worker.

Review proposed `chrome.runtime.reload()` in the worker, waiting for the next
`serviceworker` event. Tested against this harness, it does not work:

```
workers at start             1
workers after reload + 3s    0
old handle alive             false
workers after a page load    0
```

The worker is destroyed and never returns, not on a timer and not when a page
load should wake it. Under `--load-extension` that call ends the extension for
the rest of the run, which is worse than having no recipe.

Cold is therefore a fresh `launchPersistentContext` per cold measurement. A
new context gives a genuinely cold worker and empty storage, at the cost of a
browser start per data point. Acceptable for a benchmark, not for the e2e
suite.

## what is asserted

Two layers, because wall clock in a browser on CI is noisy.

- Counts gate CI everywhere. They are deterministic and assert exactly.
- Ratios gate the two CPU bound axes only, parse and DOM. Doubling the input
  and asserting the time does not quadruple catches a change in shape without
  knowing what a millisecond means on that machine.
- Ratios do not gate resolution. That axis is network bound and serial, so
  time is roughly module count times round trip and round trip variance
  dominates. A ratio of two noisy network numbers is noisier than either, so
  the assertion would flap or be loosened until it caught nothing. The count
  is the gate there: forty registry modules produce forty fetches.
- Wall clock is recorded to a baseline file, compared with a wide tolerance.
  Catches a ten times regression and ignores a thirty percent one. Same
  pattern as `corpus-baseline.json`.

The scroll axis is counts only. Both defects on that path manifest as
repeated work, which is countable and deterministic, while the durations
around it are dominated by network and CI noise. Three counts: injections
performed, module resolutions performed, storage reads performed. Resolutions
must equal the distinct module count once for the whole scroll rather than
once per pause, which is the cache assertion and is exact. Injections must
equal the number of scroll steps, so a change that injects twice per pause is
caught.

`retries: 1` in `tests/e2e/playwright.config.ts` must be 0 for benchmark
specs. A retried benchmark reports the second measurement as the first and
hides exactly the flakiness worth knowing about.

## where the pages come from

Captured GitHub HTML served locally, not live GitHub. This reverses the
earlier decision, on the review's argument: a benchmark whose input is a
third party's markup measures the third party as much as it measures this
code, goes red when they change something, and gets muted.

Chrome takes `--host-resolver-rules=MAP github.com 127.0.0.1` with
`--ignore-certificate-errors`. Both are browser flags the harness passes and
both are test only. The extension still sees `github.com`, so the host gate
in `contentscript.ts` and the manifest matches stay honest and unmodified.
The security boundary is not relaxed for the test.

### what going hermetic costs, and what has to replace it

The e2e suite currently hits real GitHub and asserts that links appear. That
is, accidentally, the only thing detecting a change to GitHub's markup. Serve
captured HTML and the extension can break in production while every test
passes against a frozen snapshot.

So the canary below is not an accessory to the benchmark. It replaces
protection the e2e suite is providing for free today, and it is worth having
whether or not the benchmarks are ever built.

### the contract, which is what the canary checks

Comparing captured HTML byte for byte is hopeless. GitHub churns hashed class
names and wrapper elements constantly and the canary would fail weekly for
changes that do not affect this extension.

What the extension actually depends on is six selectors:

```
contentscript.ts:82          div[id^="LC"] > span.pl-s > span.pl-pds
contentscript.ts:113         [inert]
contentscript.ts:126         .react-line-numbers
contentscript.ts:129         .react-code-lines
GitHubPageDataAccess.ts:43   #read-only-cursor-text-area
```

That is the contract. The canary asserts it, not the bytes.

### automating it, with the pattern already in the repository

The repository has solved this shape once. A local copy of remote truth that
drifts silently is regenerated by hand and detected on a schedule:

```
make record-fixtures      regenerate the recorded registry responses
make check-corpus-sync    detect drift, runs on the daily cron
```

Mirror it:

```
make capture-github       re-capture the pages
make check-github-sync    assert the contract still holds, on the daily cron
```

`check-github-sync` makes one or two real loads and asserts three things:

1. Live GitHub satisfies all six selectors. This is the extension's contract
   and is worth checking whether or not benchmarks exist.
2. The capture satisfies the same six, or the benchmark is measuring a page
   the extension cannot read.
3. Virtualisation still holds, rendered lines still far below file lines.
   That is the premise the whole plan rests on. If GitHub stopped
   virtualising, the dedupe stops being bounded and several conclusions here
   change.

The cron workflow already exists and already runs network bound checks, so
this costs two page loads a day.

### why the refresh is not automated further

An action that re-captures and opens a pull request is tempting and wrong.
The capture is a benchmark input, so refreshing it changes what every
recorded timing means. Auto merging one would silently invalidate the
baseline, the same class of problem as regenerating `corpus-baseline.json`
without reading the diff.

The canary fails loudly and names the command. A person runs it and
regenerates the baseline in the same commit. Detection is automated, the
decision is not. That is how `check-corpus-sync` already behaves.

## defects found while scoping

Not benchmark work. Recorded here because they were found here.

### the cache is emptied on tab away

`contentscript.ts:231` clears all of `chrome.storage.local` when the tab is
hidden on github.com. Tab away and back and the next scroll pays for a full
parse and every registry fetch again, on the scroll handler.

No measurement is needed to see this. It is a design decision to revisit.

### any quoted string equal to a module source is linked

Moved out of this document. It is a correctness bug on any page today with no
benchmark involved, and filing it here makes the fix wait on harness work. It
belongs in a review pass with the other correctness findings.

`benchmarks/*/worst-case.tf` still carries a `description` whose value equals
a real module source, so the fixture demonstrates it when the fix lands.

## settled

Measure before changing anything. The cache wipe above is not fixed until
there is a recorded number for the behaviour it causes, so the change can be
shown to have done something rather than asserted to have. The string
equality bug is exempt: it is a correctness fault, not a performance one, and
waits on nothing.

That order also decides what the first fixture is. It has to be the one that
exercises the caching and scroll path, which is `scrolling/`, not the easiest
to build.

## answered in review

1. `performance.mark` in shipping code: yes, with the three conditions under
   how it is measured.
2. The scroll harness: one fixture, K scroll steps each past the 100ms
   debounce, three counts asserted and durations recorded. The
   visibilitychange defect is three more lines on the same harness. Smaller
   than this plan first implied, because counts need no repetition to be
   stable.
3. Real GitHub loads per CI run: zero, plus a scheduled fidelity canary. See
   where the pages come from.
4. The baseline lives in this repository, with a content hash of
   `benchmarks/**` recorded in it so a fixture change that outdates the
   timings fails by name rather than drifting silently. Code changes far more
   often than fixtures, so the baseline belongs where the frequent change is
   and a performance change plus its baseline update stay one commit.

## still open

Nothing.
