# benchmark plan, architectural review

On `docs/benchmark.md`. Review only, no code written.

The shape is right. Virtualisation is the correct thing to have found first,
splitting phases per process is correct, and measuring before fixing is the
right order. The four open decisions are answered below, then five findings on
the plan itself.

## 1. `performance.mark` in shipping code: yes, with three conditions

Yes. A mark is roughly a hundred nanoseconds, the API is standard, and the
entries show up in the DevTools timeline, which is worth something to whoever
debugs this next at 2am. Rejecting it means the only alternative is wall clock
around the whole run, and the 1.88MB wasm load makes that number meaningless.

Three conditions, because the naive version has a failure mode worse than the
cost it avoids.

**Marks on the scroll path accumulate for the life of the page.** A mark per
scroll pause on a file a user keeps open is unbounded growth in the performance
buffer. Whatever helper emits them must `measure` then `clearMarks` for that
name, so the buffer holds the measures and not a history of every pause.

**Mark names are an undocumented contract, and breaking it reads as a pass.**
The harness looks up a name; a rename in production code means
`getEntriesByName` returns empty, the duration reads as absent, and a benchmark
that measures nothing looks exactly like a benchmark that got faster. Put the
names in one exported const that both sides import, and have the harness assert
each expected measure _exists_ before reading its duration. A missing mark must
fail loudly, not quietly.

**No phase may span processes.** Marks in the service worker and marks in the
content script are separate timelines with different time origins, so
subtracting across them produces a number that means nothing. The phase table
already splits by process and is right to, but say so explicitly, because the
first person who wants a click-to-link end-to-end figure will try it.

## 2. the minimum useful scroll harness

The reframing that makes this small: **the scroll axis's primary output is a
count, not a duration.**

Both defects on that path manifest as repeated work. Repeated work is countable
and deterministic; the durations around it are dominated by network and CI
noise. So the assertions that gate CI are counts, and the wall clock goes to
the baseline unasserted.

Minimum useful version:

- one fixture, `scrolling/large.tf`
- scroll to the bottom in K steps, each followed by a wait longer than the
  100ms debounce
- collect three counts: injections performed, module resolutions performed,
  storage reads performed
- assert resolutions equals the distinct module count, **once for the whole
  scroll, not once per pause**. That is the cache assertion and it is exact.
- assert injections equals K, so a change that injects twice per pause is caught
- record durations, assert nothing about them

K comes from fixture length over viewport height, not a magic number. Five is
enough to start.

Then the visibilitychange defect is three more lines on the same harness: hide
the tab, show it, scroll once, assert resolutions did not increase. That
assertion fails today. It is the recorded number the settled order says must
exist before the defect is fixed, and it costs almost nothing on top of the
above.

That is the whole minimum. It is less harness than the plan implies, because
counts need no repetition to be stable and durations are not being asserted.

## 3. real github.com loads in CI: zero, plus a fixed canary

The number should be zero, and the question dissolves rather than gets answered.

A benchmark whose input is a third party's HTML measures the third party as
much as it measures this code. When GitHub changes its markup the number moves,
CI goes red, and nothing in this repository changed. That erodes trust in a
benchmark faster than noise does, and a benchmark nobody trusts gets muted.

The hermetic route needs no production change. Chrome takes
`--host-resolver-rules=MAP github.com 127.0.0.1` with
`--ignore-certificate-errors`, both browser flags the harness passes, both
test-only. Serve captured fixture HTML from a local static server. The
extension still sees `github.com`, so the host gate in `contentscript.ts` and
the manifest matches stay honest and unmodified, which is the part that matters:
the security boundary is not relaxed for the test.

Keep one or two real loads as a **fidelity canary**, on a schedule rather than
per run, asserting that the captured fixture still resembles live GitHub:
`read-only-cursor-text-area` present, `div[id^="LC"]` present, rendered line
count still far below file line count. That is the single thing that would
silently invalidate every benchmark, and it deserves to fail with its own
message rather than as a mysterious timing shift.

One more, and it is not optional: **`retries: 1` must be 0 for benchmark
specs.** The existing config retries once. A retried benchmark reports the
second measurement as the first and hides exactly the flakiness worth knowing
about. The existing suite already spends around fifteen `goto` calls, thirty
with the retry, which is the budget the benchmarks would have been adding to.

## 4. the baseline lives in this repository

With a fixture fingerprint inside it.

The baseline records this code measured against those inputs, so it goes stale
when either changes. Code changes far more often than fixtures do. Put the file
where the frequent change is, so a performance change and its baseline update
are one commit and one review, rather than a commit here and a second commit in
the fixtures repository that someone forgets.

The drift risk the question raises is already a solved problem here.
`check-corpus-sync` exists to detect exactly this class of divergence. Extend
it: record a content hash of `benchmarks/**` in the baseline and fail when it
does not match what is on disk. Silent drift becomes a named failure with an
obvious fix, which is what that script already does for the corpus.

## findings on the plan

### the ratio assertion does not work for the resolution axis

Ratios cancel CI hardware for CPU bound work, which is why they are right for
parse and DOM. Resolution is network bound and serial: time is roughly module
count times round trip, and round trip variance dominates. A ratio of two noisy
network numbers is noisier than either one, so the assertion will either flap
or be loosened until it catches nothing.

For resolution the count is the gate and it is exact: N registry modules
produce N fetches, and forty produce forty. Duration goes to the baseline
unasserted. Ratios stay on the two axes where the work is deterministic.

### "wasm load, constant" understates it

It is constant per cold start, but MV3 stops an idle worker after roughly
thirty seconds. A user reading several files over a few minutes pays the 1.88MB
inflate and compile repeatedly, not once. The cost model records it as a
constant to be subtracted, which is exactly the framing that would stop anyone
noticing it is the largest real cost in the product.

Suggest a fifth row: worker cold starts per session. That is the multiplier
which turns a constant into the dominant term, and measuring it changes what
the results tell you to fix. It also reframes the wasm question from "how long
does it take" to "why is it paid more than once", which is the more useful one.

### the cold start recipe is not actually unsolved

`chrome.runtime.reload()` evaluated in the worker restarts the extension, and
the harness waits for the next `serviceworker` event to get a fresh handle.
Pair it with `storage.local.clear()` for a cold cache. That gives cold worker
plus cold storage without waiting out the thirty second idle timeout. Worth
writing into the plan so it stops being carried as risk.

### the popup is missing from the cost model, and its absence is not argued

`dom/` is absent and the document says why, which is the right treatment. The
popup is absent and says nothing. It does its own `sendMessage` and renders a
row per module, so it has a cost that scales with module count. Probably not
worth an axis, but decide it in writing or it gets raised again by the next
reader.

### the string equality defect will get lost here

The cache wipe is a design decision and belongs in this document, because the
measurement is the point. The `contentscript.ts:113` text match is a
correctness bug: a `description` or a comment whose value equals a module
source becomes a link, on any page, today, with no benchmark involved.

Recorded in a benchmark plan it waits on benchmark work. It belongs in a review
pass with the other correctness findings, with a pointer from here saying the
worst case fixture demonstrates it. That keeps the fixture requirement without
making the fix wait for the harness.
