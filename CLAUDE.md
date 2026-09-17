# Working on this repository

Read this before changing anything. `README.md` explains what the chart *is*;
this file is about how work on it is done, and which arguments have already
been had.

## The one rule that everything else follows from

`src/app/` holds 35 files. **They are not modules.** The page is a single
scope, and `build.py` assembles it by writing those files out one after
another in the order `APP_PARTS` declares. Nothing imports anything. A name
defined in part 32 is visible in part 07.

So:

- Moving a function between parts is free **only** if it is not read during
  boot before the part that now holds it has run. Function *declarations*
  hoist within a script, and the assembled program is one script — but
  `const`/`let`/`var` initialisation does not.
- Adding a part means adding it to `APP_PARTS` in `build.py` **and** to the
  loader array in `src/index.html`. The build refuses a mismatch between the
  two, a missing part, and a part on disk that nothing lists.
- `src/index.html` fetches the parts and runs them as **one** script with
  `//# sourceURL=app.js`. It does not use a `<script>` tag per part: as
  separate scripts, start-up reaches for hundreds of names whose part has not
  run yet. It therefore needs an HTTP server; for double-click use, build
  `dist/nexus-standalone.html`.

## Where the chart's contents actually live

**Not in `src/data.js`.** The published page rewrites its own `@@EDIT@@`
regions when someone presses Save, so the live artifact holds the current
chart and the repository holds a seed.

Before doing anything that will be published, pull the live copy back:

```bash
python3 build.py --pull saved-live-page.html
```

A plain `python3 build.py` already carries the regions over from the existing
`dist/nexus.html`; `--pull` is for when the browser has edits that no local
build has seen. The pull refuses a region that is missing, emptied, or has
lost most of its contents (`--partial`, `--force` to override), and keeps
three generations of `src/data.js` and `dist/nexus.html` in `.backups/`.

**The plain build carries them in memory only.** It writes the chart into the
page it is building and leaves `src/data.js` exactly as stale as it was; only
`--pull` writes back. That is the right split — a build should not quietly
rewrite a source file, and `--pull` is the guarded version of that write — but
it has a consequence worth stating plainly:

> `dist/` is generated and ignored, so a clean checkout has no live page at
> all. CI is a clean checkout. **What CI builds, and therefore what the
> published site becomes, is `src/data.js` and nothing else** — however far
> behind the artifact it has drifted.

So the two copies can disagree indefinitely while every local build looks
correct, because every local build carries the data across. Nothing about
that is visible until a publish loses work nobody deleted.

`python3 tools/data_check.py` asks the question directly. It reads only,
compares the regions of `src/data.js` against `dist/nexus.html`, and exits
non-zero when the sources are behind. A missing `dist/` is reported as a
fresh clone rather than as a failure — otherwise it would cry wolf on every
CI run, which is where it runs unattended. The comparison is on region
TEXT, not on item counts: renaming an entry changes no count, and most
staleness looks like that.

The build says the same two things itself — that it had nothing to carry
from, or that what it carried differs from the sources — so neither case
can happen in silence any more.

## Before you say anything is done

Five checks, and all five have to be green:

```bash
python3 build.py
python3 tools/data_check.py      # ~instant, and run it AFTER the build
python3 tests/build_guard.py     # ~seconds
python3 tools/lint.py            # ~seconds
node tests/regression.js         # ~6 minutes, against dist
node tests/regression.js src     # ~6 minutes, against src
```

`dist` and `src` load the same program by different paths. A green run on one
says nothing about the other; run both.

### Running less than all of it

The suite is 67 named scenarios, and they do not depend on one another —
which is checked rather than assumed: four shards print exactly the checks
one whole run prints, by name, and the wrapping that introduced them added
two lines per scenario and moved no bodies.

```bash
node tests/regression.js --list           what there is to run
node tests/regression.js --only=callout   just those, ~20s rather than ~5min
node tools/shards.js                      the whole thing, four ways, ~90s
node tools/shards.js src                  the same against the sources
```

`--only` that matches nothing exits 2 rather than 0: a mistyped name used to
read exactly like a run that passed. Each run names its three slowest
scenarios, so which ones are worth a quick set is answered by the suite
rather than guessed. A scenario that throws is caught and counted instead of
ending the run — one broken scenario used to take the sixty after it with it.

A plain `node tests/regression.js` still runs everything in order and still
takes about six minutes; the shards are for when you want the answer now. CI
runs the shards.

Adding behaviour means adding a named check to `tests/regression.js`, inside
the scenario it belongs to. When a claim turns out to be wrong — including
one this file makes — the fix is a check that would have caught it, not a
note.

## The two published copies

`dist/nexus.html` is published **with** the `artifact` capability, which is
what makes Save work. `dist/nexus-share.html` is the same chart built with
`capabilities: {}` so it can be shared to a public link; `build.py` makes it
by injecting `markReadOnly(false);` before `function isReadOnlyError(e){`.

Read-only is a flag, not a second program: `body.read-only` hides every
writing control and nearly every mutating function opens with a `readOnlyView`
guard. Republish **both** together — the share copy does not follow the
original on its own.

## What has been measured, so it need not be argued

Chromium at 1500×950, a synthetic chain of tagged entries:

| | |
| --- | --- |
| boot to first draw | 656 ms |
| `renderNodes` at 50 / 200 / 600 entries | 113 / 244 / 633 ms |
| `rebuildChart` at 50 / 200 / 600 | 78 / 312 / **931 ms** |
| `buildModel` at 600 | 4.1 ms — 0.4% of a rebuild |
| storage migrations at 417 | 0.027 ms |
| built page | 2.46 MB, 1.35 MB gzipped |
| `src/data.js` | 1.30 MB, of which ~1.26 MB is two base64 blobs |

- **Weight is media, not code.** Cutting program out of the page saves
  kilobytes against a megabyte of embedded pictures. Moving media to separate
  files is the size win, and it needs a host that serves more than one file.

### What `rebuildChart` was actually spending its time on

This file used to say the ceiling was `renderNodes` being long, and that
incremental rendering was the one optimisation worth doing. Measurement said
otherwise, and `tools/bench.js` is the measurement, so it can be re-run
rather than believed. A synthetic chain, this machine, median of five:

| entries | rebuild before | of that, `measureTextBlock` | rebuild after |
| ---: | ---: | --- | ---: |
| 50 | 53.6 ms | 100 calls, 33.7 ms — **63%** | **19.1 ms** |
| 200 | 196.2 ms | 400 calls, 115 ms — **59%** | **64.7 ms** |
| 600 | 772.1 ms | 1200 calls, 420 ms — **54%** | **288.2 ms** |

Over half of a rebuild was measuring text, at exactly two calls per entry —
`renderNodes` sizes the box from every text an entry can show, then measures
the active one AGAIN to centre it, with the same `maxChars` and the same
`fit`, both computed above and unchanged in between. Half of every render's
measurements were answers it had already worked out during that same render.

Remembering them (see `blockCache` in `05-render-text.js`) takes measurement
from 54–63% of a rebuild to 1–2%, and the whole rebuild to about a third of
what it was. Even with the cache cold, half the calls are served, because the
duplicate pair lands in the same render: a cold 600-entry rebuild is 651 ms.

Two things follow:

- **Incremental rendering is no longer the obvious next move.** What made
  rebuilds expensive was not that `renderNodes` is long; it was a forced
  synchronous layout per entry, taken while the SVG was being appended to.
  Whatever is proposed next should come with a measurement like the one
  above, not with an argument about the shape of the function.
- **A two-phase render — measure everything, then build the DOM — was the
  other half of this and is not worth doing.** Its whole gain was collapsing
  those forced layouts into one, and measurement is now 1–2% of a rebuild.
  It would be invasive surgery on 1123 lines for something already spent.

The cache is only allowed to exist because nothing can tell it is there, and
that is checked rather than asserted: see the named checks in
`tests/regression.js`. The one piece of state its arguments do not carry is
the order of `REFS` — a citation draws as the number its reference has in the
list, so moving one changes `[1]` to `[11]` and the width of every text that
cites it. The key carries that order, and only for texts that cite anything.

## Directions already rejected, with the reason

Do not re-propose these without new evidence:

- **ES modules / a bundler.** The call graph has 348 boot-reachable forward
  references with cycles; there is no order in which each part only uses what
  came before it. A bundler would also destroy the `@@EDIT@@` markers the page
  saves itself through.
- **A full TypeScript migration**, and a **Model/View split as an end in
  itself**. Cost without a measured problem behind it.
- **Splitting the editor and the viewer into two builds.** Editing and drawing
  are threaded through the same functions, so "not calling" the editor does
  not separate it; and two builds create a class of "looks different in the
  viewer" bugs that one program with a flag cannot have. If this is ever
  wanted, do it as lazy loading of the editing parts from one codebase, not as
  a second build.
- **An `[A-Za-z0-9_-]+` whitelist for entry ids.** Ids come from the chart's
  own content.

## Priorities

1. **Independence from the claude.ai runtime.** This is the standing top
   priority. Pages already serves the standalone copy; what remains is moving
   media out of the page and deciding where Save writes when there is no
   artifact host.
2. **Bughunting**, and removing behaviour that is unwanted or surprising, over
   new features.

A third priority stood here: splitting the suites so a small change did not
cost twelve minutes. It is done, and differently from how it was posed — not
a quick set and a full set, which would have meant deciding by hand which
checks matter, but named scenarios that can be selected (`--only`) and run in
parallel (`tools/shards.js`). Twelve minutes of waiting is now about three,
and one scenario is twenty seconds.

## House style

- Comments explain **why**, in prose, and are expected to be worth reading.
  Match the existing voice rather than adding `// set x to 1`.
- Review work is not delegated to subagents.
- A message containing **"код 1"** means: run a full review → critique →
  optimise cycle over the codebase.
- Deliverable archives keep the split-source layout (`src/`, `dist/`, `tests/`,
  `tools/`, `build.py`, `README.md`, `CHANGELOG.md`, `package.json`,
  `eslint.config.mjs`).
- Every version bump touches four places: `APP_VERSION` and `VERSION_LOG` in
  `src/app/20-about.js`, `CHANGELOG.md`, `README.md`, `package.json`. The
  About panel and the changelog are generated from the same `VERSION_LOG`, so
  they cannot disagree.
- Replies to the repository owner are written in Russian.
