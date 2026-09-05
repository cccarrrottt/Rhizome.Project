# Rhizome Project

**Version 0.9.18** — see `CHANGELOG.md`, and the version history at the foot of
the chart's own About panel (both are generated from `VERSION_LOG` in
`src/app.js`, which is the single source of truth).

A hand-drawn continuity map of the Transformers G1 "OG World", redrawn as an
interactive chart and published as a Claude artifact.

> Formerly *Axiom Nexus*. The rename is cosmetic: browser storage keys and the
> `@@EDIT@@` region names are unchanged, so charts saved or exported under the
> old name open unaltered.

## Layout

```
src/
  index.html   markup — a real standalone document you can open in a browser
  style.css    every rule on the page
  data.js      the chart's contents, in @@EDIT@@ regions (see below)
  app.js       everything the page does — layout, routing, editing, saving
build.py       welds src/ into the single file the artifact host needs
dist/
  nexus.html         the editable chart      → published WITH write access
  nexus-share.html   the same, read-only     → published WITHOUT it
```

## Why there is a build step

A published artifact is served under a Content Security Policy that blocks
every external host: no separate stylesheet, no separate script, no image
files, no `fetch`. The page it serves must be one self-contained file.

That is a fine way to *ship* a page and a poor way to *write* one, so the
sources live apart and `build.py` inlines them. `src/index.html` is a real
document with `<link rel="stylesheet">` and `<script src>` — open it through
a local server and the chart runs exactly as it does when published. Only
the built file is a monolith, and only the built file drops the
doctype/head/body wrapper, because the host supplies its own.

The build is verified to reproduce the previous single-file version byte for
byte, so nothing about the published page changed when the sources were
split.

Fonts are the one exception the CSP allows: three families come from Google
Fonts by `<link>`, each with a local fallback stack, so the page still reads
correctly if those hosts are blocked. Everything else — icons as inline SVG,
portraits and stickers as `data:` URIs — is inside the file.

## Build

```bash
python3 build.py                    # src/ -> dist/
python3 build.py --pull live.html   # take the chart's data from a saved
                                    # copy of the live artifact first
```

## Where the chart's contents actually live

Not in `src/data.js`. Pressing **Save** in the published page rewrites the
`@@EDIT@@` regions of the *published* file:

```
/* @@EDIT:NODES:START@@ */      the entries
/* @@EDIT:EDGESTYLES:START@@ */ per-connector styling
/* @@EDIT:STICKERS:START@@ */   the sticker library
/* @@EDIT:MEDIA:START@@ */      pictures and clips embedded in comments
/* @@EDIT:TAGCATS:START@@ */    tag categories
/* @@EDIT:REFS:START@@ */       the reference list
/* @@EDIT:SETTINGS:START@@ */   chart-wide settings
/* @@EDIT:COMMENTS:START@@ */   suggestions (feature currently switched off)
```

So the live artifact, not the repository, holds the current chart. A plain
`build.py` run knows this: it carries those regions over from the existing
`dist/nexus.html` rather than resetting them to the seed data in the
sources. If you have edited the chart in the browser since the last build,
save that page and pass it with `--pull` so your edits come back into the
sources first — otherwise the next publish would overwrite them.

## The two published copies

`dist/nexus.html` is published with the `artifact` runtime capability, which
is what lets the page publish new versions of itself — that is the Save
button. A page holding that capability appears not to be shareable to a
public link, which makes sense: a public link is opened by anyone, signed in
or not, and such a viewer cannot be granted write access.

`dist/nexus-share.html` exists for that reason. It is the same chart built
with no capability at all, so it can be made public; it knows it is a reader
from the first frame instead of discovering it when someone presses Save.
Rebuild and republish both together — the share copy does not follow the
original on its own.

## Working on it locally

```bash
python3 -m http.server 8000 --directory src
```

Everything works offline except **Save**, which needs the claude.ai artifact
runtime.


## Running it without claude.ai

The chart does not need claude.ai, and does not need any server. `dist/nexus-standalone.html`
is a complete document: put it on any web space, or open it straight off a disk, and it works —
the same archetypes, the same routing, the same editing. Nothing loads from a network. (The two
webfonts do, when a network is there; without one the page falls back to system faces and is
otherwise unchanged.)

What changes when there is no host is only where **Save** writes:

| Where the page is open | What Save does |
| --- | --- |
| Published on claude.ai | publishes a new version of the page, as it always has |
| Any other host, or `file://` | keeps the chart in that browser, keyed to the page's own address |

The page decides this at load time by looking for the host's runtime, and the **File** panel
states in words which of the two applies, so the answer is never a guess.

### Export and Import

A browser's storage belongs to one browser on one machine, so it is a place to keep work, not a
way to move it. **Export** is the way to move it: it writes out a full, self-contained copy of
the page with the current chart baked into it. That file is not a data file — it is the chart,
openable anywhere, with nothing to import. **Import** is the other direction, lifting the chart
out of such a file into the page you have open; it validates before it replaces anything, and
refuses a file that holds no chart rather than half-loading it.

One asymmetry worth knowing: what gets **published** to the artifact host stays a *fragment*
(no `<!doctype>`, no `<html>`), because the host wraps it in a skeleton of its own — nesting a
second document inside that would be malformed. What gets **exported** is wrapped into a real
document, because a file on disk has no host to wrap it. The same is true of the build: the
`nexus.html` / `nexus-share.html` pair are fragments for publishing, and `nexus-standalone.html`
is the wrapped document for everywhere else.

### Why Export behaves differently on claude.ai

Off claude.ai, offering a file is trivial: a blob URL on an `<a download>`. Inside the artifact
viewer that link is inert, and inert *silently* — there is no event to catch — which is the worst
possible failure mode for a button whose job is saving your work. The viewer mediates file offers
through a `downloads` capability that asks the person first, so the editable copy declares it and
saves through it.

The read-only share copy deliberately declares **no capabilities at all**, because declaring any
is what stops a page being publicly shareable — and being shareable is that copy's entire reason
to exist. It therefore cannot hand anyone a file, so it disables its own Export button on open
and says why, rather than presenting a control that fails after the click.

One wrinkle: `.html` sits in the viewer's *extended* download set and is not always enabled. When
it is refused, the same bytes are offered as `.html.txt` with a note to rename it — a file you
have to rename beats no file.

## Tags and categories

Tags live in two places now. An entry's `opts.tags` is still the list it wears, and `TAG_CATS` —
its own `@@EDIT@@` region, so it travels with an export — records how those tags are grouped. A
tag belongs to at most one category; `sanitizeTagCats()` enforces that on import so no tag can
render twice.

The reason categories hold tags rather than the other way round is that it gives a tag somewhere
to exist before any entry carries it. The old list was derived from the chart every rebuild, so a
tag with no entries simply vanished; a category that names it keeps it alive, which is what makes
"set up the vocabulary, then apply it" possible.

Which tags are *hidden* is deliberately NOT part of this. That is a view preference, per browser,
and it stays in `hiddenTags` where it always was.

## Waves

`waveRun()` draws one-sided half-ellipses, not a sine. Two details do all the work:

- The control points sit directly above the arc's two **endpoints**. Inset them and the curve
  leaves the baseline at a slope, which is exactly what makes a sine read as a sine; put them on
  the endpoints and it leaves vertically, so the hump is a half-ellipse.
- Every arc bulges the **same** way. Alternating humps average out to a line and read as wobble;
  one-sided arcs read as the coil of an inductor symbol.

Amplitude is not a parameter — it is `step/2`, so the arcs are true semicircles by construction
and cannot be tuned out of being circular. A run has exactly one dial: how long an arc should be.
One-sided arcs also span `amp` rather than `2×amp`, so the line occupies a *thinner* band than
the old sine did while each arc is rounder.

## References

A citation is the token `{{r:key}}` and nothing else. A bracketed number typed by hand stays
ordinary text — a chart about fiction is full of bracketed numbers that are not citations, and a
system that silently claimed them would be worse than none.

What a text stores is the **key**; the `[n]` a reader sees is rendered from the reference's
position in `REFS` at draw time. Nothing anywhere stores a number, which is what lets the list be
reordered — every mark in the chart renumbers itself at once. Deleting a reference strips its
marks from every text rather than leaving `[?]` scattered about.

The mark is the only clickable thing inside a text. The chart's text layer is inert by design (a
label is dragged, not pressed), so `pointer-events` is turned back on for that one `tspan` — which
is what keeps "click the little number" from becoming "click anywhere in the sentence".

## Leader-line notes

`notePos: 'leader'` plus `noteAt`, a **fraction** along the connector. A fraction rather than a
point because the connector is re-routed whenever anything moves: an absolute point would be left
behind the moment a node was dragged.

The point is chosen by pointing at the connector, not by typing a number — 0.62 means nothing when
you are looking at an elbowed line. Shift restricts the offer to the ends, quarters and middle:
the places such a note usually wants to be, and exactly the places freehand pointing is worst at
hitting.

## Why there are no browser dialogs

`window.prompt` and `window.confirm` are unusable here. The artifact viewer runs the page in a
sandboxed frame without `allow-modals`, where `prompt()` returns `null` and `confirm()` returns
`false` — silently, with nothing to catch. Every dialog built on them therefore looked like a
button that did nothing. `askFields()` / `askConfirm()` in `app.js` replace them with in-page
dialogs that also match the rest of the application.

## Collinear stubs are not corners

A routed connector always carries a short stub at each end, standing the line off the border
before it turns. On a straight run those stubs are collinear with the middle, and treating each as
its own run cost twice: a corner flat was spent at every false join (so a short connector was
mostly bald), and the wave-direction vote read the collinear neighbour as a turn when its dot
product with the normal is exactly zero. Zero is *no opinion*, not a vote for the far side —
counting it as one kept a straight connector from ever reaching its default side, which is why it
hung its arcs below the line. `mergeCollinear()` drops those interior points first; the vote now
abstains below an epsilon.

## Saving must never derive the page from the live DOM

The page reads its own source in order to save an edited copy of itself. Fetching its own URL is
the good way; a host that refuses that leaves only the live DOM — which contains whatever the
**host** also put in the document. Publishing that embedded the host's runtime in the chart and
nested one document inside another; a downloaded copy carried references to things that were not
there. Either way the result was a page that rendered part of a chart and responded to nothing.

`build.py` therefore brackets everything the page is made of between `@@PAGE:BEGIN@@` and
`@@PAGE:END@@`, and `ownContent()` cuts between them. What comes out is this page's content and
nothing else, and it is a **fragment** by construction — which is what the artifact host expects
to be handed back, since it supplies the document wrapper itself.

Two details that are easy to get wrong, and were:

- The opening marker goes **after** the first element, not in the first line. A comment appearing
  before `<html>` is attached to the *document*, and `documentElement.outerHTML` starts at
  `<html>` — so a marker in line one is missing from exactly the serialisation it exists for.
- The marker constants are **assembled from pieces** in the source. Written whole they would
  appear inside the very `<script>` being searched, and `indexOf` would find the declaration
  instead of the real marker.

## Formatting never encloses an atomic token

A sticker or a citation is one token. A colour wrapper around one produces
`{{#c23b22|Word{{r:bw}}}}`, which the colour pattern cannot parse because its body stops at the
first `}` — so the whole run fell through as literal text. `richHtmlToMarkup()` keeps its open
wrappers on a stack: an atomic token closes them, emits itself, and reopens them after. Openers
are written lazily, so a wrapper that ends up containing only a token disappears instead of
leaving `****` behind.

## Text formatting is markup, not entry properties

Bold, italic, ruby, colour, **typeface**, stickers and citations are all tokens in the stored
text. That is what lets one entry mix two faces, and what gives a connector's note and a language
tab the same controls as an entry's label — they share one text engine, so a field either has
every capability or the engine is wrong.

Two consequences worth stating:

- **A wave's pitch is fixed, never fitted.** It used to be `runLen/bumps`, so a run stretched its
  arcs to come out even — and adding an arrowhead, which shortens the run, visibly re-pitched the
  whole pattern. An arc is always `EDGE_WAVE_LEN`; the remainder pads the flats.
- **A hand-placed entry grows about its middle.** The stored position is read as the top of a
  default-height box and the real box is centred on it, so a taller entry keeps its centre — and
  a connector meeting the middle of its side does not develop a jog when the text gains a line.

## Two cascade traps worth remembering

Both cost real bugs in this codebase, and both look fine in the source:

- **A presentation attribute loses to a stylesheet rule.** `setAttribute('text-anchor','start')`
  was silently ignored because `.edge-note-text` sets `text-anchor:middle`, so every `tspan`
  re-centred on its own absolute x and the words printed on top of one another. Use an inline
  style when a rule already targets the property.
- **`[hidden]` loses to any author `display`.** The UA rule is the weakest there is, so
  `.style-row{display:flex}` kept a "hidden" row on screen while `element.hidden` reported
  `true` — invisible to a test that checks the property instead of the computed style. There is
  now a `[hidden]{display:none !important}` rule, and the suite checks computed display.

## Tests

    node tests/regression.js          # against dist/nexus.html
    node tests/regression.js src      # against the split sources

111 scenarios (105 against `src`, where reading its own source does not apply), driven through a real browser against the real built page: boot, undo/redo, all
nine archetypes, card layout, connector clearance on a dense chart, every panel, tag filtering,
search, the grid, export/import round-tripping, a full unhosted save-reload-restore cycle with
the host runtime deleted, the semicircle geometry, tag categories, connector-note formatting,
the crop chooser's clamping, stacking and round frame, the outward wave direction, the amalgam
junction bead, leader-line notes, the reference system, and URL-scheme filtering. There are no unit tests, deliberately — nearly everything here is
geometry, layout and event wiring, and a unit test cannot vouch for any of it.
