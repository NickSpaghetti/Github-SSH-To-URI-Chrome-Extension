# code review, sixth pass

The link injection path in `contentscript.ts`, which no earlier pass had read.
Carries over the string equality defect recorded in `docs/benchmark.md`, which
is a correctness bug and should not wait on benchmark work.

Review only, no code changed.

## 1. any string literal equal to a module source becomes a link

`src/contentscript.ts:113`

```ts
const text = parent.textContent.trim().split('"').join("");
modules.forEach((module) => {
    if (module.source === text && module.resolvedUrl != null) {
```

`parent` is the `span.pl-s` for a _string literal anywhere on the page_. The
match is equality against the source of any module found in the file, with
nothing tying the literal to the attribute it belongs to. So a literal that
happens to equal a module source is linked, whatever it is:

```hcl
module "vpc" {
  source = "./modules/vpc"
}

variable "docs_path" {
  description = "./modules/vpc"   # linked
  default     = "./modules/vpc"   # linked
}
```

Cost: a link the user did not write and cannot explain, pointing somewhere
plausible. It is worse than a missing link, because a wrong link is followed.

Fix: match on position, not on text. The parse already knows which declaration
a source came from; the injector rediscovers it by string comparison and loses
the association doing so. Short of passing position through, the cheap
narrowing is to require the literal be the value of a `source` attribute,
which is checkable from the DOM: the `span.pl-s` follows a `source` identifier
token on the same line.

### one correction to the benchmark note

`docs/benchmark.md:166` says a comment or a heredoc containing the string will
also be linked. Comments will not. The selector is

```
div[id^="LC"] > span.pl-s > span.pl-pds
```

and GitHub highlights HCL comments as `span.pl-c`, not `span.pl-s`, so a
commented source is never a candidate.

Heredocs are also safe, and checking that turned out to be worth doing, because
the reason is different and more fragile. GitHub ships highlighting as
`stylingDirectives`, an array of `[start, end, class]` per line, which React
renders into the spans the selector walks. Read off
`terraform-community-modules/tf_aws_ecs/iam.tf`:

```
 11   assume_role_policy = <<EOF    [pl-k, pl-s, pl-smi, pl-v]
 12 {                               [[0, 1, pl-s]]
 13   "Version": "2012-10-17",      [[0, 26, pl-s]]
 16       "Action": "sts:AssumeRole", [[0, 33, pl-s]]

  8   name_prefix = "${replace(...   [... [16,17,pl-pds] ... [40,41,pl-pds] ...]
```

A heredoc body line is one whole line `pl-s` with **no `pl-pds` anywhere**,
where an ordinary string line carries a `pl-pds` pair per quote. So the body is
a `span.pl-s`, but it has no quote delimiter child and the selector cannot
descend into it.

That immunity is incidental. It holds only while GitHub declines to tokenise
the quotes inside a heredoc body. If their highlighter ever emitted `pl-pds`
there, every heredoc line would become a candidate, and because the matcher
reads `parent.textContent` for the whole span, the text compared would be the
entire line. A heredoc line that is exactly a module source would then link.

Worth correcting before the worst case fixture is built, because a fixture
written to the overstated claim contains cases that do not reproduce, and a
finding with a failing repro in it gets dismissed whole. Both belong in the
fixture as negative assertions, asserted separately, since they survive for
different reasons and could stop surviving independently.

## 2. the z-index fix computes a string and lands on the wrong layer

`src/contentscript.ts:130`

```ts
const reactLineNumbersZIndex = reactLineNumbers?.style?.zIndex ?? "2";
const reactCodeLines = document.querySelector(".react-code-lines") as HTMLElement;
if (reactCodeLines !== null) {
    reactCodeLines.style.zIndex = String(reactLineNumbersZIndex + 1);
}
```

`style.zIndex` is a string, so `+ 1` concatenates rather than adds. The
intended "one above the line numbers" evaluates as:

| line numbers z-index | intended | actual |
| -------------------- | -------- | ------ |
| `"2"`                | 3        | `"21"` |
| unset, `""`          | 3        | `"1"`  |
| element absent       | 3        | `"21"` |

TypeScript permits `string + number`, so this type checks and ships.

Cost: the whole block exists to make the injected anchor clickable. In the
first and third rows it works by accident, 21 being above 2. In the second it
does not: an unset line-number z-index yields `"1"`, which is the failure the
block was written to prevent, and it is the case that fires when GitHub ships
the default rather than an explicit value. Note that `?? "2"` does not catch an
unset value, because `style.zIndex` returns `""` and not null.

Fix: parse before arithmetic, and default when the parse fails rather than when
the property is null.

## 3. a debug log on every injection

`src/contentscript.ts:128`

```ts
console.log(reactLineNumbersZIndex);
```

A bare value, no message. It runs on every injection, which by
`contentscript.ts:224` means every scroll pause on every HCL file the user
opens.

Cost: small but permanent noise in the console of anyone debugging their own
page, and it is the kind of line that makes a reader assume the surrounding
block is unfinished.

## 4. injected anchors can collide on `id`

`src/contentscript.ts:146`

```ts
a.id = `GithubTerraformSourceUrl-${lineCount === undefined ? crypto.randomUUID() : lineCount}`;
```

`lineCount` is the line element's id, so two matched literals on the same line
produce two anchors with the same DOM id. A map or a one line block with two
matching values is enough.

Cost: duplicate ids are invalid and make `getElementById` return whichever came
first, which matters the moment anything tries to find these anchors again.
There is no such caller today, so this is latent rather than live.

## 5. re-injection is idempotent by accident

Worth writing down because the benchmark work is about to lean on it.

After `replaceSourceTag`, the matched text node is replaced by an `<a>`. The
collector takes only direct `TEXT_NODE` children of `span.pl-s`, and after the
replacement there are none: the quotes are inside `span.pl-pds` elements and
the content is now an element. So a second pass over the same line matches
nothing and the anchor is not re-wrapped.

That is load bearing, since injection runs on every scroll pause, and nothing
states it. If `replaceSourceTag` were ever changed to wrap the node rather than
replace it, every scroll pause would nest another anchor, and the symptom would
be a slow page rather than an obviously wrong one.

Fix: a sentence at `replaceSourceTag` saying the replacement is what makes
re-injection safe.

## not repeated here

The cache wipe on `visibilitychange` stays in `docs/benchmark.md`. It is a
design decision whose argument is the measurement, which is the plan's own
point. This pass carries only the defects that are wrong independent of any
number.
