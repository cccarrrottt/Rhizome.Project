# Changelog

All notable changes to the Rhizome Project. The same list is shown in the
chart's own About panel; both are generated from `VERSION_LOG` in
`src/app.js`, so this file and the page can never disagree.

Releases before 0.9.0 were not numbered.

## 0.9.18 — "Written where it is drawn" — 2026-09-05

- **An entry's words are written on the entry.** Double-click one and a
  field opens on the entry itself — at the entry's width, in its face, its
  size and its ink, with the toolbar floating just above it. **Enter**
  settles it; so does a click anywhere else.
  - They used to be typed into the settings drawer at the other side of the
    screen, with a live preview as the only thing connecting the two —
    which is to say, with the reader watching two places at once.
  - A **portrait's** field opens on its *card*, because that is where a
    portrait's words are.
  - The drawer still holds everything an entry has that is not its words,
    and its Label field still works exactly as it did: this is a second way
    in, not a replacement for the form. A caption and a picture keep the
    card they already had, which stands beside them and carries the same
    toolbar.
- **A tag is made where it will stand.** Under the search box there is now
  a bin for the tags no category claims.
  - Press **+** → *New tag* and an empty tag shape appears in it with the
    caret already in it — the same gesture that renames a category on its
    own heading. Type the name, press **Enter**, and drag it onto whichever
    category it belongs to.
  - Nothing typed, **Escape**, or a click anywhere else, and no tag was
    made at all.
  - Dropping a tag *into* that bin is how one comes back **out** of a
    category — a gesture there was no way to make before.
  - A new category is written the same way. **Untagged** is set in italic:
    it is a bin, not a name anybody typed.
- **The Delete key has stopped dying.** Picking an entry up calls
  `preventDefault` on its mousedown — so the browser never starts selecting
  text as the entry is carried — and that also cancels the focus change the
  press would have made. So whatever field was last typed in kept the
  keyboard: click into a label, click back onto the chart, press Delete,
  and nothing happened. The chart now remembers where the last press
  landed, which is what a reader means by which of the two they are working
  in. A drop-down holding focus no longer counts as typing either, which is
  why Delete did nothing on a connector whose Path menu had just been used.
- **The scenery no longer flashes while another entry is written.** A tag's
  decorations are rebuilt on every redraw, and the renderer measures text
  as it works — a measurement resolves the new element at full strength,
  and the `.dim` class arriving a moment later was a real change that
  started a real 120ms fade. Every decoration on the chart flaring and
  sinking back on every keystroke somewhere else. Nothing about an entry's
  own box has ever faded; its scenery now behaves the same way.
- **And the drawing no longer lurches** when a portrait's card leads into
  its settings. The canvas sat in a container that could still be scrolled
  *by the browser* even though nobody could scroll it by hand, so focusing
  a field in the drawer the instant it slid in had the browser shove the
  whole chart 326 pixels sideways to "reveal" a panel that was arriving
  anyway — and slide it back as it landed.
- **The fan-fiction weave reads as gold** from across the chart rather than
  only to a reader already looking for it. Short of opaque, deliberately:
  it is the ground an entry stands on, and the entry has to stay the thing
  you read first.
- **A portrait's card is written in the entry's own ink**, and takes the
  entry's background. Every other entry writes its label in its own colour;
  this one was set in the plain body ink, so recolouring a portrait
  repainted its rim, its stub and its card's border and left the words
  inside black.
- **The bend marks come up with the connector's panel.** They were drawn at
  the end of a redraw, and opening a panel redraws nothing — nothing about
  the chart has changed — so they appeared on the first edit and were gone
  again the next time the panel was opened without one.
- **The merged connector beads every seam on its bar again.** 0.9.17
  skipped the seams where the two lineages meeting are the same colour,
  which on a chart of mostly default ink took every bead off every bar. The
  doubled dot that started all this was never a same-colour seam: it was
  the seam the junction bead is already standing on, which is what the
  clearance around the junction deals with.

## 0.9.17 — "Bent by hand" — 2026-09-05

- **A connector takes corners where you put them.** With a line's panel
  open, pale marks appear along it — one in the middle of every straight
  run. Drag one and the line bends there; drag a corner again to move it,
  double-click it to take it out, or press **Straighten** to lose them all.
  - A hand-laid corner does not stop the route being a set of right
    angles. What it changes is *which way round* the corners go, which is
    the one thing an automatic router cannot know.
  - Holding **Shift** lines a corner up with the *other connectors* and
    with nothing else. A bend has no edge of its own to match against a
    box's, and lining one up with a node's left side says nothing; what it
    can usefully be level with is the corridor another route already
    occupies, or the height a neighbouring corner sits at.
  - Corners are written into the chart with everything else and come back
    with it.
- **The guides offer two middles before two edges.** Two boxes of
  different heights are close to each other in several places at once, so
  an edge-to-edge alignment a pixel nearer always won the contest, and
  lining the two up by their middles — the alignment that makes the
  connector between them run dead straight — was unreachable. Each pairing
  now carries a small handicap: middle to middle first, then an edge to
  the matching edge, then anything else.
- **A portrait's card keeps up with the portrait.** It was redrawn when the
  resize *finished*, so growing a portrait left the card beside where the
  rim used to be for the whole of the drag.
  - **Which side it hangs on is a choice**: left, right, or left to the
    chart, which puts it on whichever side has room.
  - **Every connector into a portrait finishes on the circle.** The ports
    were taken from the square the circle is inscribed in — the same point
    for one line, three different gaps for three. The more lines a
    portrait had, the wider the wedge of daylight between them and its rim.
  - **Picking a portrait out no longer thickens its rim.** The border is a
    property now; a selection that quietly redraws it two pixels heavier
    reads as a size change.
- **Decorations no longer blink while you type.** A tag's scenery lives in
  layers that are cleared and rebuilt whenever anything on the chart is
  redrawn — and typing in an entry's settings redraws it on every
  keystroke — so a CSS animation on a brand-new element started at its
  first frame: an echo half-way out jumped back to the box, a sheet
  half-way across vanished and set off again. Each performance now
  remembers when it began, and a decoration rebuilt part-way through is
  given a negative delay of exactly how far through it was.
- **The merged connector beads only where the colour actually changes.**
  Three lineages of one colour make one plain bar, not a bar with two dots
  on it marking nothing.
- **A merge's entry cannot be carried off the end of its own bar.** The
  leash that used to *pull* it back towards its lineages is still gone — a
  position written into the chart is honoured exactly — but the hand is
  held to the length of the bar, because past its end there is no bar for
  the stem to leave from.

## 0.9.16 — "Properties, not archetypes" — 2026-09-04

- **Two archetypes have become properties.** A "mirror reality" was an
  entry filled with its own border colour; a "pocket reality" was an entry
  whose border rippled. Both are claims about how an entry *looks*,
  standing where a claim about what it *is* belongs — and each of them shut
  out every other archetype for the sake of one visual trait.
  - **Background.** One colour fills the box; two or more make a gradient
    across it. It reaches every box the chart draws: an entry, a card, a
    portrait circle, an amalgam, a comment card. A connector's note plate
    has a background of its own in the connector's panel — its *ink* is the
    line's and is not the reader's to set, but what it is written on is.
  - **Border style.** The same six the connectors have always offered:
    solid, dashed, dotted, dash-dotted, double, and wavy — the wavy one
    being the pocket border in every particular, same wavelength, same
    amplitude, same phase grid, same ports, same clipping of the arrowheads
    that meet it.
  - **Charts written with the old archetypes open unchanged**: a mirror
    becomes an entry with its border colour as its background, a pocket
    becomes an entry with a wavy border, and both draw exactly what they
    drew. A label that would be lost against its own ground takes the plain
    contrasting ink, which is what makes the migrated mirror come out
    right.
- **The five remaining archetypes are chosen by their pictures.** The Add
  form shows them: a box, a portrait circle, two lineages merging into a
  box, a box with a T in it, a box with a picture in it. Every one of them
  is a *shape*, which is the one thing a drop-down of words cannot say.
- **A caption is turned by a handle on the caption.** A round arrow stands
  off its top-left corner, where the corner grips stand off theirs. Aiming
  by eye at one end of the screen while a number changed at the other was
  never the way to set an angle. Shift steps in eighths of a turn; a
  double-click puts it back level. The slider is gone from the caption's
  card.
- **A tag category is renamed where it stands** — double-click the name,
  type over it, Enter to keep it, Escape to put it back. It used to open a
  modal with one field in it.
- **An amalgam goes wherever it is put.** The drag was clamped so the entry
  could not leave its bar's reach — a limit that belonged to a merge whose
  bar was tied to the entry it fed, which it has not been since 0.9.15. All
  the clamp still did was stop the hand while the pointer carried on, and
  pushing further went on shortening the very stem it was meant to protect.
- **And the doubled dot on the merged connector is gone.** The junction
  bead travels along the bar with the entry, so sooner or later it lands on
  a joint — and two beads a few pixels apart, one carrying every colour and
  the other two of them, read as one mark drawn twice. The junction's is
  the larger and carries the whole gradient, so where they meet it is the
  one that stays.
- **A portrait's resize grips sit on its rim.** They are live only while
  the entry is hovered, and what answers the pointer for a circle is the
  circle — so a corner of the bounding box is outside the entry, and
  reaching for it let go of the hover that was showing it. At the default
  size the gap is small enough to cross; enlarge the portrait and it grows
  with the radius, until the grip cannot be reached at all.

## 0.9.15 — "Follow the deeper one" — 2026-09-04

- **Two ports facing the same way share one level, and it follows the
  deeper of them and stops.** The level used to be taken from the two
  *shortened* run-outs. Shortening a run-out is the right answer for two
  ports facing **each other** — a long one from both and they march past
  one another — and it means nothing for two facing the same way, which
  share a level and have no gap to fit into. So the level tracked the
  deeper port while one entry sat below the other, and the moment they
  crossed it dropped to the other port's bare minimum: a few pixels clear
  of its border. A few pixels will not pass a neighbouring box, so every
  stock shape was rejected, the lattice search took over, and the run
  leapt to wherever the search happened to put it. Drag an entry up past
  its neighbour now and the bend shrinks to one run-out and stays there,
  with only the moving entry's own leg lengthening. Swept at four-pixel
  steps across the crossing: monotone throughout, and equal to the deeper
  port plus one run-out at every step.
- **A callout swung about its anchor keeps the angle it was snapped to,
  exactly.** Its corner was rounded to a whole pixel; a port rarely sits
  on one, so the card's *centre* — which is what the leader is drawn to —
  landed up to half a pixel off, and a leader the reader had just snapped
  to ninety degrees came out at 89.9. On a merge, whose bar ports sit on
  half pixels, every snap came out wrong. It now keeps two decimals, which
  is what the release of an anchor drag already did for exactly this
  reason, and `saveNodePositions` no longer rounds it back on the drop.
- **A portrait's card no longer blinks.** The card layer is cleared and
  rebuilt whenever anything on the chart is redrawn, and a rebuilt card
  replayed its entrance animation — so a portrait keeping its card open
  flashed it at the reader on every click, every keystroke, every edit
  anywhere on the map. A card that was already up is put back up in the
  same turn, before the browser has resolved a style for the new element,
  so no transition runs; only a genuinely new card is introduced.
- **And it steps back with the portrait it belongs to.** The cards sit in
  a layer of their own that the selection's wash never reached, so
  selecting something else left a faded portrait with a card at full
  strength floating beside it, joined by a faded stub. The card reads its
  state off the drawn portrait, so the two cannot disagree.
- **A card no longer pops up while another entry is selected** — not only
  while that entry's settings are open, which was the previous rule. A
  selection has already stepped the chart back; a card appearing over that
  because the pointer crossed a portrait is the same interruption whether
  a form is open under it or not.
- **A tag's decoration performs while its entry is selected.** The rule
  was meant to be "while the reader is looking at this one", and it took
  the settings form as the sign of that — but clicking an entry already
  fades the rest of the chart around it, which is the same statement made
  louder, and the form is a second click past it.
- **Shift on the rotation slider turns in eighths of a turn**, not in
  fives. The angles a caption actually wants are level, on its side, and
  the four diagonals — the same set a leader snaps to; anything between
  them is dialled in by eye with the key up.

## 0.9.14 — "What the entry decides, and what it does not" — 2026-09-04

- **A merge has two points on its bar, not one.** The last two versions each
  got this wrong from opposite ends, because both assumed there was only
  one point and argued about where it should be.
  - The **seam** is where one lineage hands the bar over to the next and
    the colours change. It belongs to the merge, so it is the middle of the
    ground the lineages cover and it does not move when the entry does —
    which is what keeps a callout anchored on a lineage's stretch of bar
    exactly where it was put.
  - The **junction** is where the merged arrow leaves the bar. That is the
    stem of the connector into the entry, and a connector's job is to reach
    the thing it feeds: it stands in front of the entry, clamped to the bar
    it has to leave from, and travels along the bar as the entry is
    dragged. Nothing else on the merge depends on it.
  - Swept across eight positions: every drop, the bar's span and the
    callout on a lineage come out identical to the pixel, while the
    gradient stem and its bead follow the entry the whole way.
- **Formatting a caption no longer fades the chart.** The live text preview
  redraws every entry and then repaints the selection highlight, and a
  free-standing picture or caption is related to nothing on the chart — so
  the painter found it related to itself alone and dimmed the entire
  drawing to a ghost, until the commit half a second later redrew it. A
  flash of transparency across the map on every press of every formatting
  button, and the reason a colour set on a caption looked like it had done
  nothing at all. Free elements clear the wash instead, which is also the
  right answer when one is selected after an entry that had dimmed things.
- **The ⟲ button is back on a connector's note and on a callout.** It went
  away with the colour box it used to stand beside, and took with it the
  only way to undo a face, a size, a bold or a rule on those two fields. It
  clears everything the reader *can* set and leaves the inherited ink alone
  — the one thing there that is not theirs to choose.
- **That ink is live.** A callout is an entry, and it lives in the node
  layer, which redrawing the connectors does not touch — so recolouring a
  connector repainted its line, its arrowheads and its note plate at once
  and left the card hanging off it in the old colour until something else
  happened to redraw the entries. Moving the leader's dot was the only
  reason it ever appeared to work. And the plate around a connector's note
  now wears the connector's paint as well as its words did.
- **Selecting words and then typing a colour for them is one gesture
  again.** A document has one selection and the hex box takes it, so the
  run being coloured stopped *looking* chosen the instant the box was
  clicked. The range was remembered and applied correctly; nothing on
  screen said so, and the natural response was to go back and select the
  words again. It is painted in the same wash by a custom highlight, which
  shows the range without owning the selection.
- **Shift on the rotation slider turns in fives** — and rounds whatever the
  slider is showing to the nearest one, so it can be pressed part-way
  through a drag to tidy an angle already chosen. The same modifier that
  snaps a dragged entry to the grid, on the one control that has no grid.
- **A pocket reality's local-multiverse sheets are rippled** like the
  outline they are copies of, instead of a stack of plain rectangles
  standing behind a wavy box.
- **Four things about a portrait's card.**
  - It is as tall as its words and no taller, by the same arithmetic that
    already made it as wide as them. It used to carry eight extra pixels of
    floor and twelve of padding that nothing else on the chart has, so it
    closed neatly onto its words across and sat in a band of empty space
    down.
  - Pointing at a portrait that is *keeping* its card open no longer sets
    the transient card to it, redraws the layer and replays the card's
    entrance animation under the pointer.
  - A card no longer pops up over the chart because the pointer crossed a
    portrait while another entry's settings were open.
  - Double-clicking the card opens the words on it for editing — the card
    *is* the portrait's text, and every other piece of text here opens on a
    double click.

## 0.9.13 — "The merge belongs to its lineages" — 2026-09-04

- **Where an amalgam STANDS says nothing about its merge.** Two things tied
  the two together, and both are gone.
  - A ceiling on how far the bar could hang, **measured from the entry**.
    The bar is meant to hang from the lineages — AMALGAM_LEAD clear of the
    lowest of them — and inside the ceiling it did; past it the bar simply
    sat a fixed distance above the amalgam and travelled with it, taking
    the lineages' drops onto it, the sides they left by, and any callout
    hanging off one of those connectors along with it. A ceiling measured
    from the entry is the entry deciding where the bar goes after all. The
    only floor left is the one the shape imposes: the bar may not be inside
    the entry it feeds.
  - The pass that straightens two nearly-aligned ports **against each
    other**. For a lineage feeding a merge that tied its port to the
    AMALGAM's own port, so sliding the entry sideways slid its parents'
    connectors along their edges to chase it — the coupling the bar's
    arithmetic had just been freed of, put back one step earlier. Where a
    lineage lands is the bar's business, and drawAmalgam already spends the
    port's slack on it.
  - Swept across six positions on the chart: every drop, the bar's span and
    height, the junction, and a callout on one of those connectors come out
    identical to the pixel.
- **A portrait's card is no wider than its words.** Wrapping it to the
  narrowest width that holds the text is only half the answer — that width
  is where the text was allowed to break, and the widest line it actually
  made is usually narrower still. A card stands beside the drawing rather
  than in the flow of it, so every pixel it does not need is a pixel of
  chart it is covering.
- **It is up for as long as its panel is.** Whether it opened used to
  depend on how the entry had been reached: clicking the circle opened it;
  arriving by the search box, an undo or the keyboard did not, and the
  panel then discussed a card nobody could see.
- **And a portrait can be asked to keep its card open.** A checkbox in its
  panel; as many portraits may keep one as want to, where the layer used to
  hold exactly one card and could not show a kept one and a hovered one at
  the same time.
- **A remark about a connector is written in the connector's ink**, and
  there is nowhere left to overrule it — the colour control is gone from
  the callout's card and from the connector plate's. A gradient is a paint
  server and serves a fill as it serves a stroke, so a connector running
  through two colours writes its note in both; changing the line's colour
  changes the words at once.
- **The Add form's Label row is shut for a picture**, as the entry drawer's
  already was.
- **Every sheet of a local multiverse covers the same ground in the same
  time.** Each used to travel only as far as its own place, so with one
  duration the far sheet moved at twice the speed of the near one and the
  procession came out as two sheets and then a wait. They all start behind
  the entry now and run out to where the outermost one stands, which is the
  limit the decoration already occupies — same span, same time, same speed,
  and a stagger of one turn divided by their number puts an even gap
  between them.

## 0.9.12 — "One ink, one size, one card" — 2026-09-03

- **A callout with no colour of its own is drawn in its CONNECTOR's.**
  Border and words alike, in the same paint its leader already used — a
  card in the chart's default ink with its leader in the line's colour was
  one object painted two ways. Same rule the leader follows: the border the
  connector leaves from, or the colour set on the connector, or the source
  entry's. A callout given a colour of its own still keeps it.
- **And its words are at full strength.** They were set at 86% of the same
  hex, which came out a lighter grey than the border above them and than
  the words in the box beside them: two blacks on one chart, for no reason
  a reader could name.
- **A character bio is a modest size, and resizable.** Half again the
  shortest a default entry may be, rather than twice it; a corner grip at
  each of its four corners like every other entry; and it stays a circle
  while it is dragged — the larger of the two movements is taken as the
  size, because a box drawn as a circle inscribed in its shorter side does
  not move at all when it is only widened, and the grip appeared to do
  nothing.
- **Its silhouette is drawn to the circle.** It was set for a fifty-pixel
  one: the shoulders' own corners sat twenty-seven pixels from the middle
  of a twenty-five pixel radius, so they crossed the rim before anything
  had even been resized.
- **The card beside it is sized to its words**, like every other box on the
  chart. At a fixed width a two-word name sat in a card wide enough for a
  paragraph, and a paragraph was wrapped into a column narrower than it
  needed.
- **A free-standing caption is edited in its own card.** Double-clicking
  one used to open the entry drawer and put the cursor in its Label — a
  form about lineage, archetype, colours and tags, none of which a caption
  has, and which still showed the last ENTRY that had been open in it. A
  picture, having no text at all, opens on its file picker as before.
- **Its angle turns as the slider moves.** The angle was committed on a
  pause and the chart rebuilt from the entry, so the caption sat still
  while the slider travelled and jumped to its new angle a tenth of a
  second after the hand stopped — no use at all for the one control whose
  whole purpose is to be aimed by eye.
- **A picture offers no Label to write in.** The drawer has one form for
  every archetype, and on an Image element the Label row and its B / I /
  Ruby / colour toolbar were live but pointless: whatever was typed there
  was thrown away on save.
- **A local multiverse's sheets leave from behind the entry.** Each sheet
  is drawn at its own distance, so one start offset could not do for both:
  at minus eleven the near sheet began behind the box and the far one began
  eleven pixels DOWN AND LEFT of it, out in the open on the wrong side,
  which is what read as a sheet appearing in front. Each is now given its
  own start, in the units its own offset is measured in. The cycle is a
  third quicker besides.

### Reviewed rather than reported

- **A wavy underline is a `<path>`**, so inside an entry it was taking the
  border's weight, the panel fill and — on a selected entry — the
  selection's glow, and came out as a thick filled blob. Named in the
  stylesheet, and its weight moved from an attribute (which a rule beats)
  to an inline style (which no rule beats).
- **Underlines were being drawn into the hidden element the layout is
  MEASURED in**, and that element is measured with getBBox — so every
  underlined entry came out a pixel or two taller than the words in it
  actually are. The measuring text draws no rules now.
- The pass that draws them asks the cheapest question first, so text with
  no rule in it and none left from a previous pass costs one query that
  stops at the first match.

## 0.9.11 — "A portrait you can put your hand on" — 2026-09-03

- **A character bio can be picked up by its middle.** Its border and the
  invisible pad that catches the pointer are both circles inside one group,
  and the stylesheet could only tell them apart by ORDER — "the first
  circle is filled, the rest are not". The pad is added first, so the pad
  took the fill and the border was left hollow, and a hollow border is
  nothing to click on: an empty portrait could not be picked up except by
  its two-pixel rim. The rings carry a name of their own now.
- **Its card holds itself open while the pointer is on it.** Reading the
  card meant moving onto it, and moving onto it meant leaving the portrait
  — which is what closed it.
- **The stub between the two touches the rim.** It used to start clear of
  the border's outer edge so the strokes would not overlap, which left a
  gap at the one place the eye is certain to look; the card read as a thing
  floating near the portrait rather than as the portrait's own.
- **A portrait keeps its picture when it is moved.** The clip it is cut to
  went into the page's permanent defs under a name derived from the entry,
  and nothing ever removed the old one. A fragment reference resolves to
  the FIRST element with that name, which after the first render is always
  the stalest: a moved portrait was still being clipped to the circle it
  used to stand in, so the picture vanished. Entry clips — portraits and
  overlong labels alike — now live in a group that is cleared with every
  render.
- **A portrait wears neither scenery tag.** An echo spreading out of a face
  and a stack of near-identical worlds behind one are both saying something
  about a REALITY; on a person they say nothing, and the rectangles they
  are drawn as do not even follow the circle. They are no longer offered on
  a portrait, and are dropped from an entry that is changed into one.
- **A fan-fiction weave travels with its entry.** It sits in a layer below
  even the scenery, and it was the one thing a drag left behind: the entry
  slid out of its own patch for the whole of every drag and caught up only
  when it was dropped.
- **The selection's glow is the border's and nothing else's.** The pointer
  pad was being lit too — a rounded rectangle, or on a portrait a ring, of
  light around a shape the entry is not. And the glow itself was wider than
  a pocket reality's ripple is deep, so the wave was smoothed away and what
  showed was the halo of a shape the entry does not have. A tight shadow
  traces the outline; a wider one behind it carries the presence.
- **An underline is drawn rather than decorated, so it runs through the
  descenders.** The browser breaks a text decoration around every y, у, р,
  ф and g — right for a paragraph of prose, wrong here: at this size the
  pieces left between two descenders are a few pixels long and read as a
  full stop after each letter. On HTML that is one property away; on SVG
  text the property, its -webkit- spelling, the presentation attribute and
  text-underline-offset are all ignored, so the only way to draw a rule
  that runs under the words is to draw it. Each underlined run is measured
  once it is laid out and given a line of its own — solid, double, dashed,
  dotted or wavy, in the run's own colour, exactly as long as the words
  are. A line THROUGH the words stays a decoration: it crosses at
  mid-height, where there is no ink to skip.
- **Shift+Enter breaks the line once.** The surface is set in pre-wrap, so
  a break inside a block is a real newline character — and when the caret
  is at the end of a block the browser writes TWO, one for the break and
  one to stand where the caret now is, because a block's last newline is
  not drawn. Read back literally, the second became a blank line in the
  value: one keystroke moved everything down two lines. A newline
  immediately before a block boundary is now understood to say nothing,
  which is true whatever put it there.
- **A connector touching a pocket reality routes the same whatever arrows
  it carries.** A head needs a straight run to sit in, so an end that has
  one is given a longer run-out — and on a rippled border that difference
  was enough to change which crossbar the router picked. The same two
  entries were joined by three different shapes depending on which
  arrowheads happened to be switched on, and only the one with both was
  right. An arrowhead is a decoration on a relationship, not part of it:
  the routing is done at the longer clearance always, and the arrows go on
  deciding only what is drawn — where the line stops at the border, and
  whether there is a head there at all.
- **A tag category is renamed by double-clicking its name.** The pencil
  that did it sat a few pixels from the ✕ that removes the category.

## 0.9.10 — "Nothing bends that need not" — 2026-09-03

- **A route found by the search is straightened before it is drawn.** The
  stock joining shapes are two corners at most, so nothing they produce can
  be simplified. The lattice search is different: it is asked for a way
  THROUGH and answers with one, and its answer is a staircase — steps of
  eight or ten pixels, one after another, down a corridor wide enough for a
  single straight run. Nothing was in the way of that run; the search walks
  a grid and never looked for it, because every grid step is as cheap as
  the last. So the route is worked over afterwards: any three consecutive
  segments that can be replaced by two are, provided the shorter route
  still clears everything and still leaves and arrives the way it did.
  Repeated until nothing more will collapse, that turns a staircase into
  the L or the Z the corridor could always have held.
- **A callout’s anchor stays where it was put.** A fraction of a polyline
  is a place on that polyline and nowhere else: lengthen one leg of a
  connector and every fraction along it slides, so dragging an entry
  dragged the anchor along the line with it — away from the thing the
  reader had aimed it at, which is a place on the drawing rather than a
  proportion of a route. What the anchor MEANS is a point, so the point is
  what is kept: the fraction is recomputed from it on every pass and
  written back to the entry, so a saved chart opens where it closed. A
  connector that merely moved carries its anchor along; one that changed
  shape leaves it where it was, on the nearest part of its new self.
- **Sliding the anchor no longer tilts the leader.** The card is carried by
  the dot, keeping an offset the reader aimed once — and it was being
  re-snapped to whole pixels on release, moving it up to half a pixel
  sideways and turning the leader by a fraction of a degree, every time.
- **Moving an amalgam along its own bar leaves its lineages alone.** A cap
  held every landing within a fixed distance of the ENTRY. It could not do
  the thing it was for — the bar spans its landings, and the landings are
  where the lineages are — and it did something else instead: sliding the
  entry moved every landing near the limit, so the parents’ connectors
  shuffled sideways in step with an entry that has nothing to do with where
  they come down.
- **Two more things to line up on, under Shift.** Lining the BOXES up does
  not straighten a connector: what has to meet is the two ports, and a port
  sits at its own share of the side it is on. So the far end of a connector
  leaving the entry is offered — the offset that makes that connector
  straight — and so is any other connector’s run of the same orientation,
  since a drop that lands a few pixels off the drop beside it reads as a
  mistake and there was nothing on the chart to line it up against. An
  amalgam is offered the middle of its own bar besides: that is where the
  merged arrow leaves from, and nothing else marks it.
- **The anchor’s dot grows under the pointer**, and while it is being
  carried. The handle that catches the pointer is four times the dot
  across, so without this the cursor changed over a patch of blank line and
  nothing said what it was over.
- **The fan-fiction weave reads as gold at rest.** At the old strength it
  only became a colour when the light crossed it, and the light only
  crosses it under the pointer — so at every other moment the mark did not
  say what it was.
- **The panel: the fold chevron at the right of its heading**, where the
  thing it folds away is, and References set apart from the tags rather
  than reading as a subtitle in the middle of one list.

## 0.9.9 — "Out of the hand’s way" — 2026-09-03

- **Entries can be carried again.** A callout that has followed its
  connector is drawn where it USED to be, because the entries are drawn
  before the connectors they hang from are routed; 0.9.8 corrected that by
  asking for a fresh render on the next frame. Every connector on a chart
  is routed around every entry, so moving ANY entry can re-route an edge
  somewhere else, move that edge’s callout, and ask for that render — on
  every frame of every drag. A render builds new groups, and the drag went
  on writing transforms onto the ones it had captured at mousedown: an
  entry could be pushed sideways and would not go down at all, on a chart
  with a single callout anywhere on it. Nothing is re-rendered now. The
  whole of the correction is a translation of one group, which is what it
  always was; it is remembered on the element, so it accumulates across a
  drag’s redraws and is thrown away by itself when a real render replaces
  the group.
- **A callout’s anchor can be picked up.** The handle was drawn among the
  connectors — where every connector also lays down a wide invisible path
  to be clickable by, and the ones routed after the leader covered its dot
  completely. It has a layer of its own now, above every connector and
  below every entry, so the order the edges happen to be drawn in cannot
  decide whether a handle works.
- **One click selects a callout, two open its card.** The same pair of
  gestures every other entry answers to. Opening the card on the first
  click put a form over the drawing every time a reader reached for the
  thing to move or delete it.
- **The light on a fan-fiction weave loops without a jump.** It swept from
  one visible edge of the patch to the other, so the band was on the patch
  at both ends of the cycle and vanished from the right to reappear at the
  left every few seconds. The travel now starts and ends with the band
  clear of the patch, and the glint is faded out at both ends besides:
  whatever the exact geometry, the frame the loop restarts on is a frame
  with nothing drawn on it.
- **A tag’s point is exactly as tall as its label.** Drawn at a fixed
  eleven pixels it was a hair taller than the shape at one font size and a
  hair shorter at another, so its corners missed the label’s own corners
  and the outline showed a step where the two met. A square whose diagonal
  IS the label’s outer height lands on them at every size.
- **A comment with nothing in it offers nothing to expand.** The ⤢ was a
  control that could only show an empty card.
- **A re-encoded clip plays.** A data: URL is split at its FIRST comma —
  everything before it is the media type, everything after is the payload
  — and the type a browser’s own recorder writes has one in the middle of
  it: `video/webm;codecs=vp9,opus`. Written through verbatim, the type came
  out as `video/webm;codecs=vp9` and the payload began `opus;base64,…`,
  read as percent-encoded text rather than as base64. The bytes were all
  there and no player could make anything of them. The clip is handed on
  typed for its container alone, which is where the codecs are written down
  anyway.

## 0.9.8 — "Everything stays where it was put" — 2026-09-02

- **No decoration animation grows what it decorates.** The hub's echo swept
  out half again past its outermost ring and the local multiverse's sheets
  sailed past the stack they belong to, so an entry that was a fixed size at
  rest reached across its neighbours the moment the pointer touched it — the
  chart moved under the reader's hand. Each ring now opens from near the box
  to exactly where it is drawn, and each sheet comes out from behind the
  entry to its own place; the whole performance happens inside the space the
  decoration already occupies.
- **The light crosses the fan-fiction weave left to right.** The band is a
  mask wider than the patch it lies on, and a percentage position aligns the
  same fraction of the image with the same fraction of the box — so with the
  image the larger of the two, raising the percentage slides it LEFT.
  Written the obvious way round it swept backwards. The band is narrower
  too: at two and a half times the patch it had to be flung far off either
  side to get out of the way, and most of the cycle showed nothing at all.
- **A crossbar stays where it was drawn, whichever end is dragged.**
  Anchoring it to the source keeps the knee still while the target moves;
  anchoring it to the target does the reverse; offering both, as the last
  version did, only picks whichever scores better on the frame. The bar's
  real requirement has nothing to do with which end it is measured from — it
  should stay where it was — so where it was is remembered per connector,
  offered back as the first candidate, and taken whenever it is still legal
  and no worse. Dragging either entry then lengthens that entry's own leg.
- **Pulling an empty entry's corner inward makes it smaller.** A resize was
  clamped to the size a NEW entry is created at (84×40) rather than the size
  an auto-sized one settles to (52×24), so the first pixel of a corner drag
  jumped a small box to a big one: pulling inward made it bigger. The two
  floors are different on purpose — one is how big a box arrives, the other
  is how small a box may be — and it is the second that bounds a resize.
- **The Management panel folds and searches.** Every category shuts at a
  click on its heading, with a chevron saying which way it will go, and a
  box at the top of the list finds a tag by name — a chart of any age has
  more tags than fit on the panel, and scrolling a list for a name you
  already know is the one thing a list is worst at. While a search is
  running the categories are held open, since a match hidden inside a folded
  one is a search that answers "nothing found" while holding the answer.
- **Untagged is written plainly, and nothing is italic.** Untagged is where
  entries with no tags show up — a bucket, not a label anybody wrote — and
  drawing it as a tag invited the reader to look for a tag by that name.
- **A comment opens at full size.** The drawer is a column three hundred
  pixels wide, which is right for a caption and wrong for a page of prose
  with figures standing in it; the ⤢ beside the note opens it in the same
  card About uses. Read-only on purpose: writing happens in the drawer,
  where the toolbar is, and two editors on one field is two answers to the
  question of which version gets saved.
- **An entry with no tags no longer says so.** "Untagged" took a strip of
  the drawer to announce an absence, on every panel of a chart where most
  entries carry no tags.
- **A clip too big for the page is re-encoded to fit rather than refused.**
  There is no fixed size limit any more, because a fixed limit is the wrong
  shape of answer: what matters is not how big the file is but whether the
  page can still be published with it in, which depends on everything else
  the chart is carrying. Over the budget, the clip is played through a
  canvas at a smaller size and recorded at the bitrate that lands on it —
  which takes as long as the clip lasts, and says how far along it is. Below
  a floor bitrate the honest answer is still a link. The budget itself rose
  to 13.5 MB, near the host's own ceiling.
  - A clip written by a browser's own recorder reports no duration, and the
    bitrate is worked out from the duration; seeking past the end forces the
    decoder to find the real one.
  - Such a clip also carries a media type with a comma in it
    (`;codecs=vp9,opus`), which no single expression reads without also
    swallowing the payload — the gate splits on `;base64,` instead.
- **The callout, brought the rest of the way in line.**
  - Set at the plate's size and wrapping at the plate's width: a callout and
    a connector's note are two forms of the same remark, and at an entry's
    own size the pair read as two different kinds of thing.
  - **Connectors no longer bend to avoid one.** A callout is a remark ABOUT
    the drawing, placed by hand beside the very connector it belongs to — so
    treating it as an obstacle made every connector detour around the note
    explaining it.
  - **The card travels with its connector.** Moving either entry moved the
    anchor and left the card, so the leader stretched and swung. The OFFSET
    is what is kept, and the card is placed from the anchor every time —
    chasing the anchor by adding up its movements let the rounding in each
    step accumulate, and the card crept away from where it had been aimed.
  - **The anchor is a real handle**: a hit target sized in screen pixels
    rather than chart units, and a drag that writes the position the
    renderer reads back, so the card follows rather than the leader
    stretching. Shift offers a place every twentieth of the line, not five.
  - **Clicking it no longer takes the keyboard**, so Delete deletes it. A
    double-click puts the cursor in the text.
  - **Its own Delete button works.** The outside-click closer listens in the
    capture phase — it has to, or a click on the drawing would be swallowed
    before reaching it — and capture runs before the target's own handler:
    pressing Delete closed the card first, clearing the callout it was
    about, and the button then had nothing to delete.

## 0.9.7 — "A tag looks like a tag" — 2026-09-02

- **Save says what actually went wrong.** "Save failed: request failed" was
  the host's own words passed through, and named nothing anybody could act
  on. The two failures that really happen now answer for themselves: a
  chart too large to publish names the picture or the clip that is making
  it large, and a figure that would take the page past that limit is
  refused while the file is still in the reader's hand rather than at save
  time, hours of work later. The publish itself no longer assumes which
  shape of page the host wants either — for most of this chart's life the
  host wrapped a fragment in its own skeleton, and a newer runtime refuses
  anything that does not begin with a doctype. It offers one shape and, if
  the host complains about the shape rather than about the content, offers
  the other; whichever is accepted is remembered.
- **A callout has a card of its own.** Clicking one used to open the entry
  editor — an archetype dropdown, a link field, border colours, tags,
  language tabs — a form about a thing that has none of those. It gets the
  words and a Delete, which is the whole of what a callout has, and it is
  no longer offered as an archetype anybody can pick.
  - **Carrying it swings it about its anchor.** Shift holds the angle to
    eighths of a turn and draws the eight rays it is snapping to — the same
    guides the placing gesture offers — and Ctrl comes off the grid. The
    entry-to-entry alignment guides are not offered: lining a comment card
    up with the edge of an unrelated box says nothing, and it was pulling
    the card off the ray it had been aimed along.
  - **The dot is a handle too.** Where a callout attaches could only ever
    be set once, during the placing gesture; to move it a reader had to
    delete the card and make another. It slides along the connector now,
    carrying the card with it: plain steps by the grid, Shift offers the
    two ends, the quarters and the middle, Ctrl is free.
  - The side its own leader arrives at **offers no port** — something is
    already attached there — and selecting either end of a connector lights
    its callouts, while selecting a callout lights the connector it is a
    remark about.
- **A dragged source lengthens its connector instead of re-shaping it.**
  The crossbar of an elbow was always anchored to the source, which keeps
  the knee still while the FAR entry moves and is the right default. It
  answers only half the question: drag the source and the bar has to come
  along, which on a chart with anything in the way means the route is
  thrown out and replaced by one that clears everything — the bar leaps to
  a new height and a twenty-pixel drag redraws the whole connector. The
  same bar anchored to the far end is now offered as well, so where the
  near one is blocked the crossbar stays exactly where the reader last saw
  it and the source's own leg takes up the difference.
- **Tags are drawn as tags** — a luggage label with a pointed end and an
  eyelet — on the Management panel, in an entry's settings and in the
  drawer alike, so a tag is never mistaken for a category, a title or a
  reference. Built from a real border and a rotated square rather than a
  clip-path, which cuts the border off with the corner and leaves the point
  drawn in fill alone.
- **The last group is Special, in italic.** It holds *Untagged*, anything
  nobody has filed, and every tag that *does* something — collected there
  whatever else claims it, because filing "fan-fiction" under "Eras" would
  say it is a kind of era, which it is not. `multiversal hub` and `local
  multiverse` are written without their hyphens; charts using the old
  spelling are corrected as they open.
- **The fan-fiction weave is gold.** At #b8912a it was a warm grey visible
  only if you already knew it was there, which is no use for a mark whose
  job is to say "this is not canon" across a crowded chart.
- **A special tag's decoration performs what it means** while the entry is
  under the pointer or open in the panel — and only then, because a page
  where a dozen things are quietly moving is a page nobody can read. The
  hub's echo goes out ring by ring and fades; a band of light crosses the
  fan-fiction weave, brightening the lattice where it falls; the local
  multiverse's sheets stream out from behind the entry and dissolve a
  little way off. Reduced-motion settings get the pictures, still.
- **A figure in a comment is placed and sized by hand.** Carried by its own
  body to any line in the text, with the place it will land drawn as a rule
  across the column, and sized by the corner that appears on hover — as a
  percentage of the column, so a figure set to half the width stays half
  the width in the drawer, in an export and at any window size. Neither
  gesture goes through the browser's drag-and-drop, which inside a
  contenteditable is a negotiation the editor can lose in several invisible
  ways.
- **A long comment scrolls** instead of growing without limit and pushing
  the lineage and the connections off the bottom of the panel.
- **A press that armed the click-swallow and never got its click** could
  swallow an unrelated click any length of time afterwards — one click
  silently ignored, long after the thing that armed it. The claim expires.

## 0.9.6 — "A callout is an entry" — 2026-09-02

- **A pocket reality's other borders now behave like its outermost one.**
  Two things were wrong once an entry carried more than one rippled ring.
  The clip that cuts an arrowhead off at the border was built from ring 0
  alone, so a head pulled from the second or third ring was cut at the box
  it had already crossed and arrived a whole ring too deep. And the deep
  sink that carries a headless line under the border — invisible, because
  the entry's fill covers it — only ever had a fill to hide under on ring
  0: on every ring beyond it the line came out the far side and hung in the
  gap. The clip is now built per ring, from the very path the ring is drawn
  with; outside ring 0 a headless line stops seven tenths of a pixel under
  the border, which the border's own 1.6px stroke covers completely while
  still guaranteeing contact at any phase of the wave. Verified across 120
  cases — four sides, three rings, headed and headless, five wave phases.
- **A callout is an entry now, not a property of a connector.** It used to
  be one field on one connector's style, which made it rationed (a
  connector could carry exactly one) and entangled (it shared the `note`
  field with the plate the connector wears, so writing one erased the
  other). It is an archetype of its own, so there can be any number of them
  on one connector, ordinary notes and callouts no longer know about each
  other, and — because the router cannot tell a callout from a reality —
  **connectors attach to them exactly as they attach to an entry**. They are
  dragged, coloured, tagged, resized, copied, undone and saved like anything
  else on the chart. All that remains of the old arrangement is the anchor:
  which connector the card points at, and where along it. Charts written
  when a leader note was a connector's own field are converted as they open,
  and the whole re-aiming apparatus — a grip laid over the card, a direction
  and a distance measured from the anchor — is gone: one drag gesture on the
  whole chart.
- **An entry's comment is drawn like every other formatted text.** The
  locked state of a text field set its contents in a dimmed italic of its
  own, so a comment was the one piece of formatted text on the page that did
  not look like what it was: the face, the weight and the colour the reader
  had written in all arrived under a slant they had not asked for, and
  pressing the pencil changed how their own words looked. Only the form's
  chrome is dropped now.
- **And a comment can carry figures.** The ▣ button on its toolbar places a
  picture or a video clip in the flow of the text, the way a figure stands
  in a document. Embedded as a `data:` URI, so it travels with the chart and
  needs nothing from the network — a still is redrawn to a sensible column
  width first, and a clip too large to carry can be given as a link instead.
  A new `MEDIA` region holds them, keyed, so the same picture used in three
  comments is stored once; the token is `{{m:key}}` and it is dropped by
  every reader that draws text rather than a document, because a video
  cannot be drawn into SVG.
- **A multiversal hub and a local multiverse have stopped being
  archetypes.** Neither was ever an outline — a hub is a box with an echo
  spreading out of it, a local multiverse a box with copies stacked behind —
  and an echo or a stack is something an entry HAS, not something it IS. As
  archetypes they were exclusive and took away the entry's second and third
  borders; as the tags `multiversal-hub` and `local-multiverse` they compose
  with everything, and the scenery steps out beyond whatever the entry is
  already wearing. Charts written when they were shapes are converted as
  they open.

## 0.9.5 — "The pad was the culprit" — 2026-09-02

- **The pocket-reality connector bug, found at last, and it was never the
  wave arithmetic.** Every entry carries an invisible "hover pad" — a frame
  around its border, there so the four edges can be grabbed. The stylesheet
  says `.node-hover-pad{fill:none}`, but a few rules above it
  `.node > rect, .node > polygon, .node > ellipse, .node > path` sets
  `fill:var(--panel)`, and a class *and* an element beats a class alone. The
  pad was therefore a solid white rectangle, reaching past the border by a
  ring's depth — and by a whole ripple on a pocket reality — laid over the
  last pixels of every connector arriving at that entry. Named at matching
  specificity, it is a frame again, and connectors meet the ripple exactly
  at every phase of the wave and for any number of connectors on a side.
  Verified by sampling the rendered pixels rather than by reading geometry.
- The same trap was filling the **character-bio placeholder** figure, which
  is meant to be a hairline drawing; it is an outline again. A regression
  test now guards the whole family: nothing an entry draws may be painted
  over its own connectors.
- **Leader lines** are carried a few pixels into their card, so a card
  reached near one of its rounded corners can no longer leave the line
  hanging short of it.
- **The drawing no longer selects text.** A double-click on an entry or on
  empty ground, and a pan that wanders across the page, leave the browser's
  selection alone; every panel, form and field keeps it.
- **The merged-lineage note apparatus is gone** — the fan's ground as a box
  to avoid, every line of the construction collected to test a card
  against, a direction per lineage. It existed to *guess* a good spot, and
  guessing is not what happens any more: a leader is aimed by hand and keeps
  the angle it was given. With it went a now-dead `guide` parameter threaded
  through both note painters.

## 0.9.4 — "Nothing crosses the border" — 2026-09-01

- **About scrolls.** The panel has grown a long way past the few paragraphs
  it started as; the heading stays put and the prose scrolls under it.
- **Even ports *and* straight lineages.** The two are not in tension once
  you move the right thing: a lineage's landing on the merged bar was placed
  under the middle of its entry, while the lineage leaves by a port that
  shares the edge evenly with its neighbours. The landing is ours to place
  and the port is not, so the landing moved. A fan now leaves evenly spaced
  and every line drops straight.
- **Pocket reality, the last of it.** Two things were still crossing the
  border. The ring cap began where the *line* stops, which on a rippled
  border is deliberately a few pixels under the fill — invisible, until a
  cap is drawn from that point in the layer above the entry, where it became
  a stub sticking through the border. It now begins where the border is. And
  every arrowhead meeting a ripple is clipped to the entry's outline: a head
  is as wide as the ripple's whole period, so drawn under the entry the fill
  bites a curve out of it and drawn over it the head reads as having gone
  in. Clipped, it stops exactly at the border — which is what a plain
  entry's fill does for it.
- **Leader cards** are picked up anywhere on them rather than along a
  hairline of border, and the press is cancelled so carrying one no longer
  paints the rest of the page in selection blue. Double-click still opens
  the note for writing.
- **Exports are standards-mode.** A document serialised from the DOM never
  carries a doctype, and quirks mode changes what `contenteditable`
  produces — `<span style="font-weight:700">` instead of `<b>`, which the
  markup reader does not recognise as the same thing. Any exported document
  now gets one. Injected editor surfaces captured into a saved copy are also
  dropped on load rather than stacked with new ones.

## 0.9.3 — "Even ground" — 2026-09-01

- **Even ports.** The spacing along a side is an even share, and that
  evenness is itself information — it says the connectors belong together.
  Letting each one wander to straighten itself spent that: two lineages out
  of an amalgam's parent drifted toward each other and ended up bunched and
  off centre. A shared side now keeps its arithmetic; a lone connector still
  moves as far as its side allows.
- **Readings keep the word's dress.** Placing a reading took the selection's
  bare characters, so bold, colour, underline and strike were silently
  dropped — over a whole label, the whole label. It also stripped every `]`
  and `|` out of the base, a rule left over from before both halves learned
  to escape them, so `asdasd[1]` came back a character short. The selected
  content is moved into the reading exactly as it stands.
- **Pocket reality, debugged from every side.** A headless line ends at the
  *deepest* the ripple ever reaches rather than at the wave's offset for
  that point: a line has width and a direction of its own, so an exact
  contact still left a sliver of paper where the wave curves away. The
  overlap is hidden by the entry's own fill. And the cap that redraws the
  stretch an outer ring is painted over now reaches past that ring's *wave*
  — measured to its baseline, it stopped inside the ripple, which broke a
  connector into a line, a gap and a stub. Arrowheads are unchanged: tip
  exactly on the wave, drawn above the entry.
- **Leader cards** answer a double-click again. Making the card's own
  rectangle the drag handle took its whole interior out of the page; the
  handle is now a separate invisible border laid over it.
- **Clearing an entry's text** empties it instead of restoring the old
  words. Entries are allowed to hold no text, so an empty field is a
  decision rather than a half-finished one.

## 0.9.2 — "The knee stays put" — 2026-09-01

- **The elbow is anchored.** A crossbar at the midpoint of a run moves
  whenever either end moves, so dragging an entry re-shaped its connector
  rather than lengthening it — both legs changed at once and the corner slid
  across the chart. It now sits a fixed distance past the entry the
  connector leaves, so the near leg is a constant and the far leg takes up
  whatever the drag adds. The midpoint still applies on short runs, where
  the two are within a few pixels of each other anyway.
- **Port alignment** reaches further (26px, still governed by each side's
  own spacing), so two entries in a column twenty pixels out of true are
  joined by one straight line instead of a step.
- **Pocket arrowheads.** An arrowhead is about as wide as the ripple's whole
  period, so a head drawn *under* the entry had its own fill cut a curve
  across one flank — the clipped arrows. Heads meeting a rippled border are
  drawn above the entry again, with their tips still exactly on the wave.
- **Headless connectors** are carried two pixels under a rippled border, so
  the join is covered by the entry's own fill instead of leaving a sliver of
  paper where the wave curves away.
- **Nothing written is allowed.** An entry can be created with no label (it
  comes out the size of an empty box, not the width of a paragraph), and a
  leader note placed by hand is kept whether or not anything is typed into
  it. A plate note with no words is still tidied away, since an empty plate
  is indistinguishable from a drawing fault.

## 0.9.1 — "Straight lines" — 2026-09-01

- **Pocket reality.** A connector now ends on the ripple *itself*. The border
  is a band, not a line, so "where the border is" has one answer per point;
  it is computed from the same phase grid the border is drawn from, which
  removes both the gap at a trough and the overshoot at a crest.
- **Near-alignment.** Two entries a few pixels out of true are joined by a
  straight line: a port's place along its side is the chart's choice, so a
  little of it is spent closing the gap. A step is drawn only for an offset
  large enough to mean something. A lineage feeding a merge lines up with
  its landing on the bar the same way.
- **Colour.** Connector lines were drawn at 0.85 opacity while every
  arrowhead, every merged bar and every merged arrow were at 1 — one colour
  in two shades, on the same connector. Everything is full strength; the
  fade is what dimming is for.
- **Leader notes.** Placing one works again: the popover's outside-click
  closer was taking the first click of the gesture and cancelling it, and
  the click that finished the gesture was dropping the note it had just
  made. Escape now leaves at either stage with nothing written down, and
  Shift shows the eight directions it snaps to — both while placing a note
  and while swinging one already on the chart.
- **Smart guides** prefer a middle-to-middle alignment over an edge that
  happens to be a pixel nearer, which is what makes a connector between two
  differently sized entries run straight.
- **Resize grips.** An entry at a negative x coordinate kept losing its
  top-left grip: an empty chip row reported its reach as `0`, which is a
  perfectly good coordinate. A corner is now given up only where a link
  badge or a language chip is genuinely on it.
- **Reference marks** are set smaller, so a citation reads as a mark beside
  the text rather than a second word in it.

## 0.9.0 — "Rhizome" — 2026-09-01

- Renamed from Axiom Nexus. Saved charts and exported files are unaffected:
  storage keys and the `@@EDIT@@` region names are unchanged.
- **Routing.** An orthogonal route can no longer reach the paper as a
  diagonal — a repair pass squares up any segment that is not on an axis —
  and a run-out is now always long enough to hold the arrowhead put on it,
  so a head can never be left standing away from its own line.
- **Pocket reality.** Connectors into a rippled border are drawn out of the
  same parts as every other connector: the arrowhead stops at the border
  instead of being sunk into the box, there is no cap stub through the
  border, and the run-out is the ordinary one.
- **Connector line styles.** A "double" style, matching the double underline.
- **Labels.** A label written on one line is no longer folded at a character
  count: the box widens to hold it, and past the width a box may reach the
  text is clipped at the border. A break typed by the author still breaks.
- **Text fields.** Enter settles the field and hands the keyboard back;
  Shift+Enter breaks the line. In the add form Enter is Add, in the note
  editor it is Apply, in comments it is Post.
- **Readings.** Typing at the head of a reading goes into the reading rather
  than into the text in front of it, and at the head of an annotation into
  the annotation rather than onto the end of the word underneath.
- **Smart guides** are offered while Shift is held rather than on every drag.
- **Resize grips** on all four corners, each holding the opposite corner
  still; a corner already occupied by the link badge or a language chip has
  no grip, so the badge stays clickable.
- **Leader notes** are aimed rather than guessed: pick the point on the
  connector, then move away and click again to draw the leader — Shift snaps
  the angle to eighths of a turn, Ctrl takes the length off the grid. Drag
  the card's border afterwards to swing it; the anchor stays put.
- **Wavy connectors** take a tighter wave with shorter quiet stretches at
  their corners.
- Growth is centred against the height an ordinary entry actually has, so an
  entry that gains a line spreads either side of where it sits again.
