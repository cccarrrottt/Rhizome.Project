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

## Before you say anything is done

Four checks, and all four have to be green:

```bash
python3 build.py
python3 tests/build_guard.py     # ~seconds
python3 tools/lint.py            # ~seconds
node tests/regression.js         # ~6 minutes, against dist
node tests/regression.js src     # ~6 minutes, against src
```

The two regression runs share port 8830, so they run **one after the other**,
or one of them with `RHIZOME_TEST_PORT` set. They are long enough that a
two-minute tool timeout will cut them off — background them and poll:

```bash
setsid nohup node tests/regression.js > /tmp/dist.log 2>&1 & disown
```

`dist` and `src` load the same program by different paths. A green run on one
says nothing about the other; run both.

Adding behaviour means adding a named check to `tests/regression.js`. When a
claim turns out to be wrong — including one this file makes — the fix is a
check that would have caught it, not a note.

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

Two conclusions follow, and both have survived several attempts to find a
cheaper answer:

- **The only real ceiling is `renderNodes`**, which is 1114 lines and rebuilds
  everything on every edit. Incremental rendering is the one optimisation
  worth doing, and only with an equivalence check proving the incremental path
  produces what the full path produces.
- **Weight is media, not code.** Cutting program out of the page saves
  kilobytes against a megabyte of embedded pictures. Moving media to separate
  files is the size win, and it needs a host that serves more than one file.

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
3. Splitting the suites into a quick set and a full set, so a small change
   does not cost twelve minutes.

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
