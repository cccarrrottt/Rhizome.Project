/* ---------------------------------------------------------------------
   About modal
   ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Which version of the project this page is.

   Kept here, in one place, and shown in the About panel — the page is
   handed around as a file and published as a page, so a reader looking at
   a copy has no other way of telling which one they have. The log below
   is written newest first and is the only record: everything before 0.9.0
   was built without version numbers, so the history starts here rather
   than pretending to earlier releases it cannot name.
   ------------------------------------------------------------------ */
const APP_VERSION = '0.9.25';
const APP_NAME = 'Rhizome Project';
const VERSION_LOG = [
  {v:'0.9.25', date:'2026-09-17', title:'Places to put things', notes:[
'The drawing can be dark. The moon in the top bar turns the page over: the panels take a dark palette, and the chart is drawn exactly as on paper and then inverted with its hues turned back, so a red lineage is still red and a portrait still looks like itself. The choice is remembered in the browser.',
'Shift along a connector offers three kinds of place, drawn three ways: the twentieths, the middle of each straight leg, and the middle of the whole connector as a ring. The two ends are no longer offered. A note being slid shows which place it has taken, and a note on the middle stays on the middle however long the connector grows.',
'Shift on a merge marks the places on its bar — its middle, the points halfway between lineages, and for the amalgam itself each lineage — and the entry in the hand snaps to them. A parent carried along its bar stops short of its neighbours and of the bar’s ends, and passes over callouts and notes without moving them. Two parents selected together get a swap button, even when they feed different merges.',
'Centring one entry on another works. Shift put the entry back on the ruled grid before the alignments were weighed, and two boxes of different heights have their middles between grid lines — so only the tops and bottoms were ever on offer. The alignments are weighed at the pointer now. A connector’s own offer was also read from routes a frame old, which put its guide where nothing had been aligned.',
'No more half-unit kinks. The search router works on whole units and a port on a box of odd width sits on a half, so a searched route left its entry on a slant; its ends are put back on their true coordinates, and any run a unit or less out of true is levelled rather than stepped.',
'A hand-set bend that the route no longer needs is removed when an entry is dropped, not only when the bend itself is let go: if the connector without its bends would be the line already drawn, the bends go.',
'The unreleased ruling is drawn with the weave’s pen, and its glare is softer. Both grounds are drawn in their entry’s own coordinates, so the pattern no longer jumps when a carried entry is dropped; their light no longer restarts on the drop or skips when the entry is pressed — a running animation was being sought again on every selection change and every frame of a drag.',
'A sticker or a citation can be put into an entry’s words from the toolbar. The press on the picker closed the field first, because the pickers were excused by class names nothing on the page carried.',
'The wavy line is a squiggle: short, shallow half-sines, on connectors and on a pocket reality’s border alike, instead of a row of half-ellipses.',
  ]},
  {v:'0.9.24', date:'2026-09-17', title:'Nothing moves that was not touched', notes:[
'Nothing moves because something else was moved. That is the whole of this release, found nine ways.',
'Sliding one lineage of a merge along its bar leaves the others where they land. Two lineages closer than a pitch were spread apart and the whole row was then shifted back onto its mean — so the moment a carried parent came near a neighbour, every drop on the bar stepped sideways and the callouts hanging off them went too. Only the lineages that actually crowd each other are spread now, and among them the one in the hand is the one that gives way.',
'A connector’s note stays where it was put. It rode a fraction of its route, and a fraction slides whenever the route changes length, so an edit anywhere that re-routed the line carried the note along it and round corners. It is kept as a point now, as a callout’s anchor already was. And it no longer dodges: the test for an entry in its way used the widest plate a note can ever have, so a three-letter remark stepped away from boxes it was nowhere near and flipped from above its line to below it.',
'A bend a few units off the run out of its port is drawn on that run. Ports move when their side gains a connector or their entry is resized, and a bend stored on the ruled grid then sat three units to one side — out, across, and on: a knee that did not meet. Anything under a grid step is squared away every time the route is drawn. A bend that bends nothing is taken out when it is let go; 0.9.22 said this and the program did not do it.',
'A group carries the bends of the connectors it holds whole. Moving a lasso’s worth of entries re-drew the lines between them out of their new ports and back through their old points.',
'Undo undoes a drag. A bend, a note sliding along its line, and a carried group all change the chart live, so the snapshot taken when they were dropped was a snapshot of the result. They take it on the first frame now. And the same state pushed twice is one step, not two, so the first Ctrl+Z after an edit no longer looks as if it did nothing.',
'Sliding a callout’s anchor lifts that dot and no other; the mark was a class on the page, which every dot matched. A drag no longer puts up the ruled grid when it is switched off. A dimmed connector does not open its panel over a selection — the click lets go of the selection, as a click on the canvas does; the lit ones still open.',
'A local multiverse’s two sheets are half a turn apart. The stagger was written in milliseconds and read in seconds, which made it 500 whole turns: the sheets travelled on top of each other and read as one tab at a time.',
'The unreleased ground is ruled on the weave’s own step instead of half of it, and the light that crosses it is a pale glare rather than a colour. An underline or a sticker under a label too long for its box is cut at the same border as the words.',
  ]},
  {v:'0.9.23', date:'2026-09-15', title:'One place to write', notes:[
'The Label box is gone from an entry’s settings. Its words are written ON the entry — double-click it and the field opens where the text is drawn, in the entry’s own face, size and ink — and keeping a second copy of them in a drawer at the other side of the screen meant two places to type one sentence, joined by a live preview whose only job was to connect them. Everything an entry has that is NOT its words is still in the drawer, unchanged.',
'Nothing was lost with it. The floating toolbar over the field is not a smaller version of the box’s: it is the same one. Every formatting toolbar on this page is fitted out by a single pass — face, size, the rule and the strike with their kind between them, the sticker and the citation — and the field on the entry has always been on that list. Twelve controls, the same twelve.',
'Four controls that nobody could reach went with it. An entry’s own face and size were a hidden pair beside the Label box and a second hidden pair mirroring them in the language rows; none of the four was ever shown, so the drawer was reading its own unreachable values back on every commit, which is the only reason those settings survived at all. They survive by being carried, which is what was meant.',
'And a picture says so in the only place it can now: the field refuses to open on it. The drawer used to answer that by greying out a Label row — the same statement, made where the reader is pointing.'
  ]},
  {v:'0.9.22', date:'2026-09-15', title:'A remark that rides where you put it', notes:[
'A connector’s note is started from its panel and then slides along the line. Its words go on the plate, which left a connector carrying no note with nothing to double-click and so no way to write a first one at all: the panel now puts an empty plate on the middle of the line with the caret in it, and nothing typed means no note. Drag the plate to move it along; Shift offers the places along the line a remark usually wants, the same ones a callout’s anchor is offered.',
'The field breaks the text where the thing under it breaks it, and nowhere else. An entry’s label is drawn on one line and allowed to run past the box, and the field wrapped it at its own border instead — so what you typed and what you got were two different shapes. It now keeps the line breaks that are in the text, invents none, and grows both ways from the entry’s middle exactly as the entry’s own words do. A portrait’s card and a connector’s plate do wrap, so on those the field goes on wrapping at their width.',
'A portrait’s card no longer shuts while its words are being written on it. The card is drawn in SVG and the field is laid over the top, so moving from one to the other LEAVES the card as far as the page is concerned — and leaving it is what closed it, mid-sentence.',
'A lineage cannot be carried through its own merge bar. The bar hangs a fixed clearance short of the nearest parent and may not be pushed inside the entry it feeds, so a parent dragged far enough simply walked through it and came back round the outside. It stops where the bar would.',
'A bend dropped back where it came from puts the connector back the way it was. A bend steps by the ruled grid and the run it was dragged out of does not, so it landed a few units off the line and the route went along, stepped three pixels across, and went on. Within half a grid step the run wins; and a bend that bends nothing is taken out rather than left in the list as a handle to catch on.',
'The unreleased ground is a close grid rather than a comb of bars, and dark enough for the light crossing it to have something to brighten. And a hub’s echoes are all the same echo: each ring used to grow from a little under its own size to its own size, so what left the entry was a small wave, a middling one and a large one in turn. They now cover the same ground, one after another; a local multiverse’s sheets overlap properly for the same reason — the next is at full strength before the last has gone.',
'Typing in a language tab no longer brings the whole chart back. Every entry is rebuilt as you type and what is hidden is a class put on afterwards, which this one preview forgot to put back — so a tag filter came undone on the first keystroke. And a tab’s words are now written on the entry like every other piece of text: switch an entry to a tab, double-click it, and the field opens on THAT tab and writes back to it, leaving the label and the other tabs alone.',
'The callout’s panel has lost the line of prose explaining how to write on the card. A caption that explains a gesture is read every time the panel opens, forever, by somebody who learned the gesture the first time.'
  ]},
  {v:'0.9.21', date:'2026-09-14', title:'One program, thirty-five files', notes:[
'The program is written in thirty-five files instead of one of eighteen thousand lines. Nothing about it changed: the page is still one scope, assembled by writing those files out one after another in a declared order, and the file that comes out of the build is byte for byte the file that came out of it before — which is the proof, rather than the hope, that this was a move and not a rewrite.',
'It is deliberately not a module system, and the reason is in the program rather than in anybody’s taste: drawing, routing and editing call one another in every direction, so there is no order in which each part only uses what came before it. One scope is what a web with cycles in it actually is. Modules would also have needed a bundler, and a bundler would have destroyed the @@EDIT@@ markers the chart is saved through — so the page could no longer save itself, which is the one thing it must be able to do. What was wanted was a file you can hold in your head; that is what this is.',
'The build refuses three ways for the order to quietly stop being true: a part the manifest names and the folder does not have, a part the folder has and the manifest does not name, and the document you develop against running them in a different order from the built page. A part left out of an assembled program does not fail loudly — it fails as a function that is simply not there — so none of the three may produce a page.',
'And the linter now runs against the assembled program rather than against the parts, because “nothing defines this name” and “nothing reads this name” are questions that have no answer about a part on its own. Each complaint is carried back to the file and line it came from; the arithmetic is exact, the assembly being nothing but concatenation.'
  ]},
  {v:'0.9.20', date:'2026-09-14', title:'Nothing quiet left in it', notes:[
'A release with no new drawing in it. Every item below is something the program did wrongly, or expensively, or silently — and silently is the word that ties them together: not one of these had a symptom anybody could have reported.',
'Two entries can no longer share a clipping mask. The masks that hold a portrait’s picture, a card and a caption inside their own outlines were named by replacing every character an SVG id cannot carry with an underscore — which is not a reversible rule and not a unique one either: “Ark 2” and “Ark.2” came out as the same name, and two entries written in Cyrillic came out as the same row of underscores. The second definition then overwrote the first and one entry was clipped by the other’s shape. Nothing warned, because a repeated id inside defs is legal SVG: the last one simply wins. A short hash of the original id now goes on the end, and the readable part is kept so a definition is still recognisable in an inspector.',
'An entry’s id is checked for the one thing it truly cannot be. A control character or a line break survives neither an attribute nor the saved file, and is invisible in every place a reader would look for the mistake. Everything else is allowed — any script, any punctuation, quotes and brackets included — because a chart whose entries are named in Russian is a chart this program has to be able to open. The awkwardness of such a name is handled where it is actually awkward: in the selectors and in the definitions, both of which escape it.',
'The chart survives the project’s change of name. Every key this page writes into a browser still carried the old one, and among them is the key holding THE CHART for anybody keeping their only copy in a browser or on a file they host themselves. The keys are renamed and each one reads the old key first, writing the new one only if it is empty, and never deleting the old — so nothing is lost, newer work is never overwritten by a stale copy, and an older copy of this same file still opens. The exported file is named after the project too.',
'A sticker’s bytes are stored once instead of once per undo step. Every edit takes a snapshot, and a snapshot re-encoded the whole sticker library and the media shelf as text — about a megabyte per keystroke on a modest library, kept sixty times over in the undo stack. Those two are now snapshotted as structure: the record is copied, the base64 is not, so an unchanged image is the same string in the history as on the page and is compared by identity rather than by reading a megabyte. The comparison is exactly as exact as it was, including for an image replaced in place, and anything it cannot speak for falls back to the text form rather than guessing.',
'The build refuses to lose work quietly. Pulling the chart out of a saved page used to skip, in silence, any region the file did not carry — and skipping it reverts that part of the chart to the seed data in the sources. It now stops and names what is missing, stops again if a region arrives emptied or with most of its contents gone, and reports what it carried and how much of it. Both refusals can be overridden deliberately; neither can be walked past by accident. And the two files that hold the chart’s contents — the sources’ copy and the built page a plain rebuild carries from — are put aside before either is written over, three generations deep, for the damage a guard cannot recognise.',
'And eleven bindings that nothing read are gone, along with a second copy of the function that escapes a value for a selector — the lossy one, which was the one being called in some places. The project now carries a linter set to exactly three rules, all three about this class of mistake, and a test for the build script’s refusals, which is the one part of the project the browser suite cannot reach.'
  ]},
  {v:'0.9.19', date:'2026-09-08', title:'One field for every kind of text', notes:[
    'The in-node field now opens on everything on this chart that IS a piece of text: an entry\u2019s label, a portrait\u2019s card, a caption, a connector\u2019s note and a callout. Double-click any of them and the words open where they are drawn, in that thing\u2019s own face and size, with the toolbar floating above. The three panels that used to hold a second copy of those words \u2014 the connector\u2019s Note box, the callout\u2019s card, the caption\u2019s Text box \u2014 have lost them; each keeps everything about its subject that is not the words. A remark on a connector still offers no colour box, because it is written in the line\u2019s own ink.',
    'The field and its words scale together. The floor on its width was a flat 120 screen pixels while the type inside it scaled with the drawing, so zooming out left a wide box with a line of ants in it, several times the size of the entry underneath. The padding and the border scale too.',
    'A portrait\u2019s grips are back on the corners of the square it is drawn inside, where its ports are and where every other entry\u2019s are. 0.9.16 moved them onto the rim because reaching for a corner let go of the hover that was showing them; the cause is fixed instead \u2014 the square answers the pointer now, so the ports and the grips stay up until the pointer leaves the BOX. A double click on the circle opens the settings, since a portrait holds a picture; its words are on the card, and a double click there opens them. And the field opens on the card itself rather than beside it: the card\u2019s group also holds the stub joining it to the portrait, so measuring the group put the field half a card to the left.',
    'Selecting an entry no longer redraws its border heavier. Three pixels instead of the entry\u2019s own weight is a change to the drawing rather than a mark on it: a dashed border\u2019s dashes thicken, a double border\u2019s rails close up, a ripple flattens, and the box grows by most of a pixel on every side. The glow says "this one" instead, a little stronger \u2014 which is what a portrait has done since 0.9.18, and is right for every archetype.',
    'A local multiverse\u2019s stack copies the entry\u2019s outline in EVERY border style. Only the ripple was carried across, so a dashed entry stood in front of a stack of solid rectangles \u2014 three boxes meant to read as one world seen three times, drawn three different ways.',
    'A new tag that acts: "unreleased". It lays a cold grey comb of straight verticals under the entry, where fan-fiction lays a warm gold lattice \u2014 the same patch, the same fade, the same performance, a different ruling, because the two say the same kind of thing about a reality and belong in one visual language. An entry can carry both. The fan-fiction weave is set back to about half the strength 0.9.18 gave it: the ground has to stay the ground.',
    'A line break inside formatted words no longer breaks the words. The stored value was split on its newlines and each line was read on its own \u2014 correct only while no piece of formatting spans a break, and the instant one does, which is what Shift+Enter in the middle of an underlined phrase does, one line held an opening with no end and the next an end with no opening. Neither parsed, so both were printed as the literal characters: the markup itself appearing in the text.',
    'And the middle of a merge\u2019s bar is a guide rather than a mark. Evenly spaced lineages hand the bar over at one and the same place \u2014 its middle \u2014 so every seam of such a merge resolved to that one point, and the bar carried two or three beads stacked on the same pixel. The middle is drawn only while the entry is carried with Shift held, as the thing being lined up on; a bead is drawn there only if the colour really changes across it.'
  ]},
  {v:'0.9.18', date:'2026-09-05', title:'Written where it is drawn', notes:[
    'An entry\u2019s words are written ON the entry. Double-click one and a field opens on the entry itself \u2014 at its width, in its face, its size and its ink, with the toolbar floating just above it. Enter settles it; so does a click anywhere else. The words used to be typed into the settings drawer at the other side of the screen, with a live preview as the only thing connecting the two \u2014 which is to say, with the reader watching two places at once. A portrait\u2019s field opens on its CARD, because that is where a portrait\u2019s words are. The drawer still holds everything an entry has that is not its words, and its Label field still works exactly as it did; a caption and a picture keep the card they already had, which stands beside them and carries the same toolbar.',
    'A tag is made where it will stand. There is a bin under the search box for tags no category claims: press + and an empty tag shape appears in it with the caret already in it, exactly as a category is renamed on its own heading. Type the name, press Enter, and drag it onto whichever category it belongs to. Nothing typed, Escape, or a click anywhere else, and no tag was made at all. Dropping a tag INTO that bin is how one comes back out of a category \u2014 a gesture there was no way to make before. A new category is written the same way, and Untagged is set in italic, since it is a bin and not a name anybody typed.',
    'The Delete key has stopped dying. Picking an entry up calls preventDefault on its mousedown \u2014 so the browser never starts selecting text as the entry is carried \u2014 and that also cancels the focus change the press would have made, so whatever field was last typed in kept the keyboard: click into a label, click back onto the chart, press Delete, nothing. The chart now remembers where the last press landed, which is what a reader means by which of the two they are working in. A drop-down holding focus no longer counts as typing either, which is why Delete did nothing on a connector whose Path menu had just been used.',
    'The scenery no longer flashes while another entry is being written. A tag\u2019s decorations are rebuilt on every redraw, and the renderer measures text as it works \u2014 a measurement resolves the new element at full strength, and the .dim class arriving a moment later was a real change that started a real fade. Every decoration on the chart flaring and sinking back on every keystroke somewhere else. Nothing about an entry\u2019s own box has ever faded; its scenery now behaves the same way.',
    'And the drawing no longer lurches when a portrait\u2019s card leads into its settings. The canvas was in a container that could still be scrolled by the browser even though nobody could scroll it by hand \u2014 so focusing a field in the drawer the instant it slid in had the browser shove the whole chart 326 pixels sideways to \u201creveal\u201d a panel that was arriving anyway, and slide it back as it landed.',
    'The fan-fiction weave reads as gold from across the chart rather than only to a reader already looking for it \u2014 short of opaque, deliberately, since it is the ground an entry stands on and the entry has to stay the thing you read first.',
    'A portrait\u2019s card is written in the entry\u2019s own ink, and takes the entry\u2019s background. Every other entry writes its label in its own colour; this one was set in the plain body ink, so recolouring a portrait repainted its rim, its stub and its card\u2019s border and left the words inside black.',
    'The marks for bending a connector come up WITH its panel. They were drawn at the end of a redraw, and opening a panel redraws nothing \u2014 nothing about the chart has changed \u2014 so they appeared on the first edit and were gone again next time the panel was opened without one.',
    'And the merged connector beads every seam on its bar again. 0.9.17 skipped the seams where the two lineages meeting are the same colour, which on a chart of mostly default ink took every bead off every bar. The doubled dot that started all this was never a same-colour seam: it was the seam the junction bead is already standing on, which is what the clearance around the junction deals with.'
  ]},
  {v:'0.9.17', date:'2026-09-05', title:'Bent by hand', notes:[
    'A connector takes corners where you put them. Drag one of the pale marks that appear along a line whose panel is open and the line bends there; drag the mark again to move the corner, double-click it to take it out, or press Straighten to lose the lot. A hand-laid corner does not stop the route being a set of right angles — what it changes is which way round the corners go, which is the one thing an automatic router cannot know. Holding Shift lines a corner up with the OTHER connectors and with nothing else: a bend has no edge of its own to match against a box’s, and what it can usefully be level with is the corridor another route already occupies. Corners are written down with the chart and come back with it.',
    'The guides now offer two entries’ MIDDLES before their edges. Two boxes of different heights are close to each other in several places at once, so an edge-to-edge alignment a pixel nearer always won, and the alignment that makes the connector between them run dead straight — the one a reader is nearly always reaching for — could not be reached at all.',
    'A portrait’s card keeps up with the portrait. It used to be redrawn only when the resize finished, so growing a portrait left its card sitting where the old rim used to be for the whole of the drag. Where it hangs is now a choice as well: left, right, or left to the chart — which puts it on whichever side is free.',
    'And every connector into a portrait finishes ON the circle. The ports were worked out from the square the circle is inscribed in, which is the same point for one line and three different gaps for three — the more lines a portrait had, the more visible the wedge of daylight between them and its rim. Picking a portrait out no longer thickens its rim either; the border is a property now, and a selection that quietly redraws it two pixels heavier reads as a size change.',
    'Decorations no longer blink while you type. A tag’s scenery lives in layers that are rebuilt whenever anything on the chart is redrawn — and typing in an entry’s settings redraws it on every keystroke — so an echo half-way out jumped back to the box and a sheet half-way across vanished and set off again. Each performance now remembers when it began and a rebuilt decoration is handed exactly how far through it was.',
    'The merged connector beads only where the colour ACTUALLY changes: three lineages of one colour make one plain bar rather than a bar with two dots on it marking nothing.',
    'And a merge’s entry cannot be carried off the end of its own bar. The leash that used to PULL it back towards its lineages is still gone — a position written into the chart is honoured exactly — but the hand is held to the length of the bar, because past the end there is no bar for the stem to leave from.'
  ]},
  {v:'0.9.16', date:'2026-09-04', title:'Properties, not archetypes', notes:[
    'Two archetypes have become properties, and every entry may now have both. A "mirror reality" was an entry filled with its own border colour and a "pocket reality" was an entry whose border rippled \u2014 two claims about how an entry LOOKS standing where a claim about what it IS belongs, each of them locking out every other archetype for the sake of one visual trait. An entry now has a BACKGROUND (one colour fills the box, more than one make a gradient across it) and a BORDER STYLE (the same six the connectors offer: solid, dashed, dotted, dash-dotted, double, and the wavy edge a pocket reality used to be). Charts written with the old archetypes open with the new properties set to exactly what they used to draw.',
    'The background reaches everything a box has: an entry, a card, a portrait circle, an amalgam, a comment card. A connector\u2019s note plate has one of its own in the connector\u2019s panel \u2014 its INK is the line\u2019s and is not the reader\u2019s to set, but what it is written on is. And a label that would be lost against its own ground takes the plain contrasting ink instead, which is how a migrated mirror comes out looking exactly as it did.',
    'The five archetypes that remain are chosen by their pictures in the Add form: a box, a portrait circle, two lineages merging into a box, a box with a T in it, a box with a picture in it. Every one of them is a SHAPE, which is the one thing a drop-down of words cannot say.',
    'A caption is turned by a round arrow at its own top-left corner, not by a slider in a panel \u2014 aiming by eye at one end of the screen while the number changed at the other was never the way to set an angle. Shift steps in eighths of a turn; a double-click puts it back level.',
    'A tag category is renamed where it stands: double-click the name, type over it, press Enter. It used to open a modal with one field in it.',
    'An amalgam goes wherever it is put. The drag used to be clamped so the entry could not leave its bar\u2019s reach \u2014 a limit that belonged to a merge whose bar was tied to the entry, which it has not been since 0.9.15. All the clamp still did was stop the hand while the pointer carried on, and pushing further went on shortening the very stem it was meant to protect.',
    'And the doubled dot on the merged connector is gone: the junction bead travels along the bar with the entry, so sooner or later it lands on a joint, and two beads a few pixels apart read as one mark drawn twice. The junction\u2019s is the larger and carries every colour, so where they meet it is the one that stays.',
    'A portrait\u2019s resize grips sit on its rim rather than on the corners of the square it is inscribed in. They are live only while the entry is hovered, and what answers the pointer for a circle is the circle \u2014 so the corner of the bounding box was outside the entry, and on an enlarged portrait it could not be reached at all.'
  ]},
  {v:'0.9.15', date:'2026-09-04', title:'Follow the deeper one', notes:[
    'Two ports facing the same way share one level, and that level now follows whichever of them is DEEPER and stops there. It used to be worked out from the two run-outs as shortened — which is the right answer for ports facing EACH OTHER, where two long run-outs would march past one another, and means nothing for two facing the same way. So the level tracked the deeper port until the entries crossed and then dropped to the other one\u2019s bare minimum, a few pixels clear of its border; a few pixels will not pass a neighbouring box, so every stock shape was rejected, the search took over, and the run leapt to wherever it landed. Drag an entry up past its neighbour now and the bend shrinks to one run-out and stays there, with only the moving entry\u2019s own leg growing.',
    'A callout swung about its anchor keeps the angle it was snapped to, exactly. Its corner was rounded to a whole pixel and a port rarely sits on one, so the card\u2019s centre — which is what the leader is drawn to — landed up to half a pixel off and every snap came out at 89.9\u00b0. On a merge, whose ports sit on halves, it came out wrong every time. Two decimals, the same as the anchor drag already kept for exactly this reason.',
    'A portrait\u2019s card no longer blinks. The card layer is cleared and rebuilt whenever anything on the chart is redrawn, and a rebuilt card replayed its entrance — so a portrait keeping its card open flashed it at the reader on every click and every keystroke anywhere. A card that was already up comes back up with no animation; only a new one is introduced.',
    'And it steps back with the portrait it belongs to. The cards sit in a layer of their own that the selection\u2019s wash never reached, so a faded portrait had a card at full strength floating beside it. It also stays away entirely while another entry is selected — not only while that entry\u2019s settings are open, since a selection has already faded the chart around it and a card appearing over that is the same interruption either way.',
    'A tag\u2019s decoration performs while its entry is SELECTED, not only while its settings are open. Clicking an entry is the reader asking what this one is; the form is a second click past that.',
    'Shift on the rotation slider turns a caption in eighths of a turn rather than in fives — the angles a caption actually wants are level, on its side and the four diagonals, which is the same set a leader snaps to.'
  ]},
  {v:'0.9.14', date:'2026-09-04', title:'What the entry decides, and what it does not', notes:[
    'A merge has two points on its bar, not one, and insisting they were the same thing is what the last two versions each got wrong from opposite ends. The SEAM \u2014 where one lineage hands the bar over to the next and the colours change \u2014 belongs to the merge and stands still however the entry is dragged, which is what keeps a callout anchored on a lineage exactly where it was put. The JUNCTION \u2014 where the merged arrow leaves the bar \u2014 is the stem of a connector, and a connector reaches the thing it feeds: it stands in front of the entry, clamped to the bar, and travels along it as the entry moves. Eight positions across the chart: every drop, the bar\u2019s span and the callout identical to the pixel, and the gradient stem and its bead following the entry the whole way.',
    'Formatting a caption no longer fades the chart. The live preview repaints the highlight after every keystroke, and a free-standing picture or caption is related to nothing \u2014 so it dimmed the entire drawing to a ghost until the commit half a second later redrew it. A flash of transparency across the map on every press of every formatting button, and the reason a colour set on a caption looked like it had done nothing at all.',
    'The \u27f2 button is back on a connector\u2019s note and on a callout, where it went away with the colour box it used to stand beside \u2014 taking with it the only way to undo a face, a size, a bold or a rule. It clears everything the reader can set and leaves the inherited ink alone, which is the one thing on those two fields that is not theirs to choose. And that ink now reaches the card the moment the connector\u2019s colour changes, rather than waiting for something else to redraw the entries; the plate around a note wears it too.',
    'Selecting words and then typing a colour for them is one gesture again. A document has one selection and the hex box takes it, so the run being coloured stopped looking chosen the instant the box was clicked \u2014 the range was remembered and applied correctly, but nothing on screen said so. It is painted in the same wash by a highlight that does not own the selection.',
    'Holding Shift on the rotation slider turns a caption in fives and rounds whatever it is showing to the nearest one \u2014 the same modifier that snaps a dragged entry to the grid, on the one control that has no grid.',
    'A pocket reality\u2019s local-multiverse sheets are rippled like the outline they are copies of, instead of a stack of plain rectangles standing behind a wavy box.',
    'Four things about a portrait\u2019s card: it is as tall as its words and no taller, by the same arithmetic that already made it as wide as them; pointing at a portrait that is keeping its card open no longer replays the card\u2019s entrance under the pointer; a card no longer pops up over the chart because the pointer crossed a portrait while another entry\u2019s settings were open; and double-clicking the card opens the words on it for editing, which is what a double click does to every other piece of text here.'
  ]},
  {v:'0.9.13', date:'2026-09-04', title:'The merge belongs to its lineages', notes:[
    'Where an amalgam STANDS now says nothing about its merge. Two things tied the two together and both are gone: a ceiling on how far the bar could hang, measured from the entry — past it the bar simply sat a fixed distance above the amalgam and travelled with it, taking the lineages\u2019 drops, the sides they left by and any callout on one of those connectors along; and the pass that straightens two nearly-aligned ports against each other, which for a lineage feeding a merge tied its port to the AMALGAM\u2019s and slid it along its own edge to chase the entry sideways. The bar hangs from the lowest lineage and nothing else. Six positions across the chart, and every drop, the bar, the junction and the callout are identical to the pixel.',
    'A portrait\u2019s card is no wider than its words: it is wrapped to the narrowest width that holds them and then closed onto the ink, the way an entry is, because a card standing beside the drawing covers chart with every pixel it does not need. It is up for as long as its panel is, however the entry was reached, and a checkbox in that panel asks for it always — as many portraits may keep one open as want to.',
    'A remark about a connector is written in the connector\u2019s ink, and there is nowhere left to overrule it: the colour control is gone from both the callout\u2019s card and the plate\u2019s. A gradient serves a fill as it serves a stroke, so a connector running through two colours writes its note in both, and changing the line\u2019s colour changes the words at once.',
    'The Add form\u2019s Label row is shut for a picture, as the entry drawer\u2019s already was.',
    'Every sheet of a local multiverse covers the same ground in the same time. Each used to travel only as far as its own place, so the far one moved at twice the speed of the near one and the procession came out as two sheets and then a wait; they all now start behind the entry and run out to where the outermost one stands, which is the limit the decoration already occupies.'
  ]},
  {v:'0.9.12', date:'2026-09-03', title:'One ink, one size, one card', notes:[
    'A callout with no colour of its own is drawn in its CONNECTOR\u2019s — border and words alike, the same paint its leader already used. And its words are at full strength: they were set at 86% of the same hex, which came out a lighter grey than the border above them and than the entry beside them, so one chart carried two blacks for no reason a reader could name.',
    'A character bio is half again the shortest a default entry may be rather than twice it, has a corner grip at each of its four corners, and stays a circle while it is dragged \u2014 the larger of the two movements is the size, since a box drawn as a circle inscribed in its shorter side does not move at all when it is only widened. Its silhouette is drawn TO the circle: it was set for a fifty-pixel one, so the shoulders crossed the rim before anything was even resized. The card beside it is sized to its words like every other box, rather than to a fixed width whatever it holds.',
    'A free-standing caption is edited in its own card. Double-clicking one used to open the entry drawer \u2014 a form about lineage, archetype, colours and tags, none of which a caption has, and still showing the last ENTRY that had been open in it. Its angle now turns as the slider moves rather than a tenth of a second after the hand stops, which is the whole point of a control aimed by eye. And a picture offers no Label to write in, since whatever was typed there was thrown away on save.',
    'A local multiverse\u2019s sheets leave from behind the entry. Each sheet stands at its own distance, so one start offset could not do for both: the near one began behind the box and the far one began that same distance DOWN AND LEFT of it, out in the open on the wrong side. Each is now given its own start, and the cycle is a third quicker.',
    'Two things the last version\u2019s drawn underlines got wrong, found by reviewing them rather than by seeing them: a wavy rule is a <path>, so inside an entry it took the border\u2019s weight, the panel fill and the selection\u2019s glow \u2014 and every rule was being drawn into the hidden element the layout is MEASURED in, which made every underlined entry a little taller than its words.'
  ]},
  {v:'0.9.11', date:'2026-09-03', title:'A portrait you can put your hand on', notes:[
    'A character bio can be picked up by its middle again. Its border and the invisible pad that catches the pointer are both circles inside one group, and the stylesheet could only tell them apart by ORDER — "the first circle is filled, the rest are not" — but the pad is added first, so the pad took the fill and the border was left hollow. A hollow border is nothing to click on. The rings are named now.',
    'The card beside a portrait holds itself open while the pointer is on it — reading it meant moving onto it, and moving onto it meant leaving the portrait, which is what closed it. The stub joining the two starts ON the rim rather than a pixel clear of it, so the card reads as the portrait\u2019s own rather than as something floating beside it.',
    'A portrait keeps its picture when it is moved. The clip it is cut to was written into the page\u2019s permanent defs under a name derived from the entry, and nothing ever removed the old one; a fragment reference resolves to the FIRST element with that name, which after the first render is always the stalest — so a moved portrait was still being clipped to the circle it used to stand in. Entry clips live in a group cleared with every render now.',
    'A portrait wears neither scenery tag. An echo spreading out of a face and a stack of near-identical worlds behind one are both saying something about a REALITY, and the rectangles they are drawn as do not even follow the circle. They are no longer offered on a portrait, and are dropped from one that is changed into a portrait.',
    'A fan-fiction weave travels with the entry it belongs to. It sits in a layer below even the scenery, and it was the one thing a drag left behind: the entry slid out of its own patch for the whole of every drag and only caught up when it was dropped.',
    'The selection\u2019s glow is the border\u2019s and nothing else\u2019s. The pointer pad was being lit too — a rounded rectangle, or on a portrait a ring, of light around a shape the entry is not — and the glow itself was wider than a pocket reality\u2019s ripple is deep, so the wave was smoothed away. A tight shadow traces the outline; a wider one behind it gives the selection its presence.',
    'An underline is drawn rather than decorated, so it runs through the descenders. The browser breaks a decoration around every y, у, р and g — and on SVG text the property that would stop it, its -webkit- spelling, the presentation attribute and text-underline-offset are all ignored, so the rule is measured off the run and drawn: solid, double, dashed, dotted or wavy, in the run\u2019s own colour, exactly as long as the words are.',
    'Shift+Enter breaks the line once. The surface is set in pre-wrap, so a break inside a block is a newline character — and at the end of a block the browser writes two of them, one for the break and one to stand where the caret now is. Read back literally, the second became a blank line in the value.',
    'A connector touching a pocket reality is routed the same whatever arrowheads it carries. A head needs a straight run to sit in, so an end that has one is given a longer run-out — and on a rippled border that was enough to change which crossbar the router picked, so the same two entries were joined by three different shapes depending on which arrows happened to be on.',
    'A tag category is renamed by double-clicking its name. The pencil that did it sat a few pixels from the ✕ that removes the category.'
  ]},
  {v:'0.9.10', date:'2026-09-03', title:'Nothing bends that need not', notes:[
    'A route found by the search is straightened before it is drawn. The stock joining shapes are two corners at most; the lattice search is different — it is asked for a way THROUGH and answers with a staircase, steps of eight or ten pixels one after another down a corridor wide enough for one straight run. Nothing was in the way of that run: the search walks a grid and never looked for it. Any three segments that can be replaced by two now are, provided the shorter route still clears everything and still leaves and arrives the way it did.',
    'A callout’s anchor stays where it was put. A fraction of a polyline is a place on that polyline and nowhere else, so lengthening one leg of a connector slid every fraction along it and dragging an entry dragged the anchor with it. The anchor is a POINT now; the fraction is recomputed from it on every pass and written back, so a connector that merely moved carries its anchor along and one that changed shape leaves it where it was.',
    'Sliding the anchor no longer tilts the leader. The card is carried by the dot, keeping an offset the reader aimed once — and it was being re-snapped to whole pixels on release, moving it up to half a pixel sideways every time.',
    'Moving an amalgam along its own bar leaves its lineages alone. A cap held every landing within a fixed distance of the ENTRY, so sliding the entry moved every landing near the limit and the parents’ connectors shuffled sideways in step with something that has nothing to do with where they come down.',
    'Carrying an entry with Shift offers two more things to line up on: the far end of a connector leaving it, which is the offset that makes that connector straight, and any other connector’s run of the same orientation, so two lines that nearly agree can be made to read as one. An amalgam is offered the middle of its own bar, which is where the merged arrow leaves from and which nothing else on the chart marks.',
    'The anchor’s dot grows under the pointer and while it is being carried — the handle that catches the pointer is four times the dot across, so without it the cursor changed over blank line and nothing said what it was over.',
    'The fan-fiction weave is visible enough at rest to be read as gold. At the old strength it only became a colour when the light crossed it, and the light only crosses it under the pointer.',
    'A tag category’s fold chevron sits at the right of its heading, and References is set apart from the tags above it rather than reading as a subtitle in the middle of one list.'
  ]},
  {v:'0.9.9', date:'2026-09-03', title:'Out of the hand’s way', notes:[
    'Entries can be carried again. A callout that had followed its connector was drawn where it used to be, so the last version asked for a fresh render on the next frame to correct it — and every connector on this chart is routed around every entry, so moving ANY entry could re-route an edge somewhere else, move that edge’s callout, and ask for that render, on every frame of every drag. A render builds new groups: the drag went on writing to the ones it had captured when the mouse went down, and an entry could be pushed sideways but would not go down at all. Nothing is re-rendered now — the correction is a translation of one group, which is all it ever was.',
    'A callout’s anchor can be picked up. The handle was drawn among the connectors, where every connector also lays down a wide invisible path to be clickable by; the ones routed after it covered the handle completely. It has a layer of its own now, above every connector and below every entry, so the order the edges happen to be drawn in cannot decide whether it works.',
    'One click selects a callout and two open its card — the pair of gestures every other entry answers to. Opening the card on the first click put a form over the drawing every time a reader reached for the thing to move it.',
    'The light on a fan-fiction weave leaves and returns off the patch, and fades out at both ends of its travel besides, so the frame the loop restarts on is a frame with nothing drawn on it. It was crossing from one visible edge to the other and jumping back every cycle.',
    'A tag’s point is exactly as tall as the label it belongs to. Drawn at a fixed eleven pixels it missed the label’s corners at every other size and the outline showed a step where the two met.',
    'A comment with nothing in it no longer offers to be opened at full size.',
    'A re-encoded clip plays. A data: URL is split at its first comma, and the type a browser’s recorder writes — video/webm;codecs=vp9,opus — has one in the middle of it, so the payload was being read as text rather than as base64. The bytes were all there and no player could make anything of them; the clip is handed on typed for its container alone, which is where the codecs are written down anyway.'
  ]},
  {v:'0.9.8', date:'2026-09-02', title:'Everything stays where it was put', notes:[
    'No decoration animation grows what it decorates any more: the hub’s echo opens to where its rings are drawn and no further, and the local multiverse’s sheets come out from behind the entry to their own places rather than sailing past them. The light on a fan-fiction weave crosses it left to right — the mask is wider than the patch, so the position had to count down, and written the obvious way round it swept backwards.',
    'A crossbar now stays where it was drawn whichever end of the connector is dragged. Anchoring it to one end answered half the question and created the other half; the bar’s real requirement is not which end it is measured from but that it should not move, so where it was is remembered and offered back first.',
    'Pulling an empty entry’s corner inward makes it smaller. It was clamped to the size a NEW entry is created at rather than the size an auto-sized one settles to, so the first pixel of the drag jumped a small box to a big one.',
    'The Management panel folds and searches: every category shuts at a click on its heading, and the box at the top finds a tag by name. Untagged is written plainly rather than drawn as a tag — it is a bucket, not a label anybody wrote — and nothing on the panel is set in italic.',
    'A comment opens at full size in the card About uses, with the ⤢ beside it; an entry with no tags no longer carries a line saying so; and a clip too big for the page is re-encoded to fit instead of being refused, with no fixed size limit at all — what matters is whether the page can still be published, which depends on everything else the chart is carrying.',
    'A callout is set at the plate’s size, connectors no longer bend to avoid one, and moving either entry carries the card along with its connector so the leader keeps the length and angle it was aimed at. Its anchor is a real handle now — it slides along the line and takes the card with it, with a place every twentieth of the line under Shift — clicking the card no longer takes the keyboard, so Delete deletes it, and its own Delete button works: the outside-click closer ran in the capture phase and had already cleared the card before the button’s handler saw it.'
  ]},
  {v:'0.9.7', date:'2026-09-02', title:'A tag looks like a tag', notes:[
    'Save says what actually went wrong. "Save failed: request failed" named nothing anybody could act on; a chart too big to publish now names the picture or clip that is making it big, and a figure that would take the page past that limit is refused while the file is still in your hand rather than at save time. The publish itself no longer assumes which shape of page the host wants — it offers one, and if the host complains about the shape it offers the other.',
    'A callout has a card of its own: the words and a Delete, instead of the entry editor’s archetype, link, colours, tags and language tabs, none of which a callout has. It is no longer offered as an archetype either. Carrying one swings it about the place it points at, with Shift holding the angle to eighths of a turn and drawing the rays it snaps to; the dot on the connector is a handle as well, so where a callout attaches slides along the line and takes the card with it. The side its leader arrives at no longer offers a port, and selecting either end of a connector lights its callouts — and a callout lights the connector it is about.',
    'A connector whose source is dragged lengthens instead of re-shaping: the crossbar can now be held at the FAR end, so moving an entry adds to its own leg rather than lifting the whole knee to a new height.',
    'Tags are drawn as tags — a luggage label with a pointed end and an eyelet — on the panel, in an entry’s settings and in the drawer alike. The last group is Special, in italic: it holds Untagged, anything unfiled, and every tag that does something, whatever else claims it. "multiversal hub" and "local multiverse" are written without their hyphens, and charts using the old spelling are corrected as they open.',
    'The fan-fiction weave is drawn in gold rather than a warm grey that could barely be seen. And a special tag’s decoration performs what it means while the entry is under the pointer or open in the panel: the hub’s echo goes out and fades, a band of light crosses the weave, the local multiverse’s sheets stream away and dissolve.',
    'A figure in a comment is carried to any line in the text and sized by its corner, and a comment too long for the panel scrolls instead of pushing the sections under it off the screen.',
    'A press that armed the click-swallow and never got its click could swallow an unrelated click any length of time later. The claim expires.'
  ]},
  {v:'0.9.6', date:'2026-09-02', title:'A callout is an entry', notes:[
    'A pocket reality’s OTHER borders behave like its outermost one. An arrowhead pulled from an inner ring is cut off at that ring rather than at the box, and a headless line meeting any ring but the innermost stops just under it instead of coming out the far side — the deep sink that hides a line under the entry’s fill only ever had a fill to hide under on ring 0.',
    'A callout is no longer a property of a connector but an entry in its own right. There can be any number of them on one connector, they no longer share a field with the plate a connector wears, and — because they are entries — connectors attach to them exactly as they attach to a reality. They are dragged, coloured, tagged, resized, copied and undone like anything else on the chart. Charts written when a leader note was a connector’s own field are converted as they open.',
    'An entry’s comment is drawn like every other formatted text on the page. It used to be set in a dimmed italic of its own, so the face, the weight and the colour a reader wrote in arrived under a slant nobody asked for.',
    'And a comment can carry pictures and video clips in the flow of it, the way a figure stands in a document. A file is embedded, so it travels with the chart; a clip too large to carry can be given as a link. Figures belong to the comment and never reach the drawing.',
    'A multiversal hub and a local multiverse have stopped being archetypes and become tags. Both were scenery an entry HAS rather than an outline it IS, and as tags they compose: a pocket reality can be a hub, a mirror reality can be a local multiverse, and each keeps its own border, its own colours and its own ports.'
  ]},
  {v:'0.9.5', date:'2026-09-02', title:'The pad was the culprit', notes:[
    'Connectors meet a pocket reality\u2019s rippled border exactly, at every phase of the wave and however many connectors share the side. The cause was never the wave arithmetic: an entry\u2019s invisible hover pad was being painted as a solid rectangle over the last pixels of every connector arriving at it, because `.node > rect` is a more specific selector than the class that was supposed to keep it unfilled.',
    'The same specificity trap was filling the character-bio placeholder figure; it is an outline again.',
    'A leader line is carried a few pixels into its card, so a card reached near a corner can no longer leave the line hanging in the air.',
    'The drawing no longer selects text: a double-click on an entry or on empty ground, and a pan across the page, leave the browser\u2019s selection alone. Panels and fields keep it.',
    'The apparatus that used to steer a merged lineage\u2019s note out of the fan is gone \u2014 it existed to guess a good spot, and a leader is aimed by hand now.'
  ]},
  {v:'0.9.4', date:'2026-09-01', title:'Nothing crosses the border', notes:[
    'The About panel scrolls instead of running off the bottom of the screen.',
    'A fan of connectors keeps its even share of an edge AND drops straight onto the bar: a lineage feeding a merge now lands under its own port rather than under the middle of its entry, so the landing moves and the port does not.',
    'Nothing crosses a rippled border any more. A cap begins where the border is rather than where the line stops \u2014 which on a pocket reality is deliberately under the fill \u2014 and every arrowhead meeting a ripple is cut off at the outline, so it touches without entering, exactly as an ordinary entry\u2019s fill cuts one.',
    'A leader card is picked up anywhere on it, not only along its border, and carrying one no longer paints the rest of the page in selection blue.',
    'An exported page is always a standards-mode document. A page serialised from the DOM carries no doctype, and quirks mode changes what the text editors produce.'
  ]},
  {v:'0.9.3', date:'2026-09-01', title:'Even ground', notes:[
    'Connectors sharing one side of an entry keep their even share of it \u2014 the straightening nudge was bunching an amalgam parent\u2019s lineages and pulling them off centre.',
    'Putting a reading over a word keeps everything the word was wearing, and every character of it: bold, colour, rules and brackets all survived only until a reading was placed over them.',
    'Pocket reality, from every side and at every ring: a headless line now runs to the deepest the ripple ever reaches, so no phase of the wave can leave it short, and the cap that crosses an outer ring reaches past that ring\u2019s own wave rather than stopping inside it.',
    'Double-clicking a leader card opens its text again \u2014 the whole card had become a hairline handle; the handle is now an invisible border laid over it.',
    'Clearing an entry\u2019s text leaves it empty instead of putting the old words back.'
  ]},
  {v:'0.9.2', date:'2026-09-01', title:'The knee stays put', notes:[
    'A connector\u2019s corner is anchored to the entry it leaves rather than sitting halfway along: dragging the far entry now lengthens the far leg and leaves the corner where it was.',
    'Two entries up to about twenty pixels out of true are joined by one straight line \u2014 the ports have more room to take it up than they were being allowed.',
    'Arrowheads on a pocket reality are whole again: the ripple\u2019s period is the width of an arrowhead, so an entry\u2019s own fill was cutting a curve across every head drawn under it. They stand on the wave instead.',
    'A connector with no arrowhead is carried a couple of pixels under a rippled border, so it meets it rather than stopping a hair short of it.',
    'An entry can be created with nothing written in it, and a connector\u2019s leader note can stay empty.'
  ]},
  {v:'0.9.1', date:'2026-09-01', title:'Straight lines', notes:[
    'A connector into a pocket reality now ends on the ripple itself, worked out at the exact point it arrives — no gap at a trough, no overshoot at a crest.',
    'Two entries a few pixels out of true are joined by a straight line: the ports slide along their own sides to close the gap, and a step is drawn only for an offset large enough to mean something.',
    'A lineage feeding a merge comes straight down onto its landing on the bar instead of stepping across to it.',
    'One colour renders as one colour: a connector\u2019s line was drawn a shade weaker than its own arrowhead and than a merged construction beside it.',
    'Leader notes can be made again — the first click of the gesture was closing the very popover that started it. Escape leaves at either stage, and Shift shows the eight directions it snaps to, while placing one and while swinging one already on the chart.',
    'Smart guides prefer lining two entries up by their middles over an edge that happens to be a pixel nearer, which is what makes a connector between two differently sized entries run straight.',
    'An entry at a negative coordinate keeps its top-left resize grip, and a corner is given up only where a badge or a chip is genuinely on it.',
    'Reference marks are set smaller, so a citation reads as a mark beside the text rather than a second word in it.'
  ]},
  {v:'0.9.0', date:'2026-09-01', title:'Rhizome', notes:[
    'Renamed from Axiom Nexus. Saved charts and exported files are unaffected.',
    'Connectors: an orthogonal route can no longer be drawn on a slant, and a run-out is always long enough to hold the arrowhead put on it.',
    'Pocket reality entries take the same connectors as every other archetype — no sunken arrowheads, no stub through the border, no longer run-out.',
    'A "double" connector line style, matching the double underline.',
    'A label written on one line is no longer folded: the box widens to hold it, and clips past the width a box may reach.',
    'Enter settles a text field and hands the keyboard back; Shift+Enter breaks the line.',
    'Typing at the head of a reading goes into the reading rather than the text in front of it.',
    'Smart guides are offered while Shift is held rather than on every drag.',
    'Resize grips on all four corners, skipping any corner a link badge or a language chip already occupies.',
    'A tighter wave on the wavy connector style, with shorter quiet stretches at its corners.'
  ]}
];
function renderVersionInfo(){
  const line = document.getElementById('aboutVersion');
  if(line) line.textContent = `${APP_NAME} · version ${APP_VERSION}`;
  const log = document.getElementById('versionLog');
  if(!log) return;
  log.innerHTML = '<h3>Version history</h3>' + VERSION_LOG.map(r=>
    `<div class="version-entry"><div class="version-head">` +
    `<b>${escapeHtml(r.v)}</b>${r.title ? ' — ' + escapeHtml(r.title) : ''}` +
    `<span class="version-date">${escapeHtml(r.date)}</span></div>` +
    `<ul>${r.notes.map(t=> `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>`
  ).join('') +
  '<p class="version-foot">Releases before 0.9.0 were not numbered.</p>';
}
/* ---------------------------------------------------------------------
   A comment, read at full size.

   The drawer is a column three hundred pixels wide. That is right for a
   caption and wrong for what a comment has become: a page of prose with
   figures standing in it, which in a column that narrow is a ribbon of
   two-word lines with the pictures shrunk to postage stamps. The reader
   opens it in the same card About uses — the widest thing this page has —
   and reads it there.

   Deliberately read-only. Writing happens in the drawer, where the toolbar
   is; this is the other half of the pair, and giving it an editor too
   would be two editors on one field with no way to tell which one holds
   the version that will be saved. */
const noteOverlay = document.getElementById('noteOverlay');
function openNoteOverlay(id){
  const n = nodes.get(id);
  if(!n || !noteOverlay) return;
  document.getElementById('noteOverlayTitle').innerHTML = inlineToHtml(n.label || '') || 'Note';
  const body = document.getElementById('noteOverlayBody');
  const text = (n.note || '').trim();
  body.innerHTML = text
    ? markupToRichHtml(n.note)
    : '<p class="note-overlay-empty">This entry has no note yet.</p>';
  noteOverlay.classList.add('open');
}
if(noteOverlay){
  document.getElementById('noteOverlayClose').onclick = ()=> noteOverlay.classList.remove('open');
  noteOverlay.addEventListener('click', ev=>{
    if(ev.target === noteOverlay) noteOverlay.classList.remove('open');
  });
}
{
  const btn = document.getElementById('detailNoteExpand');
  if(btn) btn.onclick = (ev)=>{
    ev.stopPropagation();
    /* Whatever is still sitting in the typing pause is what the reader
       wrote, so it is settled before it is shown back to them. */
    if(typeof flushDetailNoteCommit === 'function') flushDetailNoteCommit();
    if(selectedId) openNoteOverlay(selectedId);
  };
}
const aboutOverlay = document.getElementById('aboutOverlay');
renderVersionInfo();
document.getElementById('aboutToggle').onclick = ()=>{
  closeToolbarMenus('aboutOverlay');
  aboutOverlay.classList.add('open');
};
document.getElementById('aboutClose').onclick = ()=> aboutOverlay.classList.remove('open');
aboutOverlay.addEventListener('click', e=>{ if(e.target===aboutOverlay) aboutOverlay.classList.remove('open'); });

/* ---------------------------------------------------------------------
   Live data plumbing — lets the in-page controls below (add node,
   connect, per-node quick edit, edge style) read the live NODES /
   EDGESTYLES regions from this page's own source and publish a patched
   version back, via the `artifact` capability.
   ------------------------------------------------------------------ */
const capArtifactPromise = (async()=>{
  if(!HOSTED) return null;
  try{ return (await claude.use('artifact')) || null; }catch(e){ return null; }
})();

/* This document's own bytes.

   Fetching is the honest way to get them when it works: on a host that
   publishes new versions, the file on the server may already be newer than
   the copy this tab loaded, and patching a stale one would quietly undo
   somebody else's change. So fetch first — and fall back to the snapshot
   taken at load when there is nothing to fetch from, which is the case for
   a page opened straight off a disk. */
/* The page's own content, and nothing else.
 *
 * build.py brackets everything this page is made of between PAGE_BEGIN and
 * PAGE_END. Cutting between them matters most on the fallback path: when a
 * host refuses the fetch, the only other source is the live DOM, and that
 * contains whatever the HOST also put in the document. Saving that embedded
 * the host's own runtime into the chart — so the next load ran it twice —
 * and a downloaded copy carried references to things that were not there,
 * which is how a save could leave a page that rendered half a chart and
 * responded to nothing.
 *
 * What comes out is a FRAGMENT by construction, which is exactly what the
 * artifact host expects to be handed back. */
/* Assembled from pieces on purpose. Written whole, these literals would
   appear in this file — which is inside the very <script> being searched —
   and indexOf would find the constant declaration instead of the real
   marker further up the document. */
const PAGE_BEGIN_MARK = '<!-- @@PAGE' + ':BEGIN@@ -->';
const PAGE_END_MARK = '<!-- @@PAGE' + ':END@@ -->';
function ownContent(src){
  if(typeof src !== 'string') return null;
  const a = src.indexOf(PAGE_BEGIN_MARK);
  if(a < 0) return null;
  const b = src.lastIndexOf(PAGE_END_MARK);
  if(b >= a) return src.slice(a, b + PAGE_END_MARK.length);
  /* No closing marker. That is the normal state of PRISTINE_HTML: it is
     serialised from inside the page's own <script>, and the parser has not
     reached the marker after that script yet. Everything from the opening
     marker to the end of the document IS this page's content — all that
     needs removing is the wrapper the serialiser closes it with. */
  return src.slice(a).replace(/(?:\s*<\/(?:body|html)>)+\s*$/i, '') + '\n' + PAGE_END_MARK;
}
async function readOwnSource(){
  let raw = null;
  try{
    const res = await fetch(location.href, {cache:'no-store'});
    if(res.ok) raw = await res.text();
  }catch(e){ /* file:// and a host that refuses both land here */ }
  let mine = ownContent(raw);
  if(mine) return mine;
  mine = ownContent(PRISTINE_HTML);
  if(mine) return mine;
  /* Neither source carried the markers. Rather than hand back something
     that might be the host's document, say so — a refused save the user
     can see beats a save that quietly breaks the page. */
  if(raw && extractRegion(raw, 'NODES') !== null) return raw;
  throw new Error('Could not read this page\u2019s own source.');
}
/* The artifact host wraps our markup in its own <!doctype>/<html>/<head>/<body>
   skeleton at publish time, so the source we read back is a *fragment*. A
   browser will happily rescue a fragment in quirks mode, but a file the user
   downloads and keeps should be a real document: standards mode, a declared
   charset, a lang attribute, and a <title> the OS can show. Wrapping is done
   only on the export path — what we hand back to cap.publish() must stay a
   fragment, or the host would end up nesting one document inside another. */
function isFullDocument(src){
  /* Look only at the opening bytes. Scanning the whole file for a document
     tag cannot work here: this file CONTAINS the code that writes those
     tags, so a naive search finds its own source and concludes, wrongly,
     that the fragment is already a document. A real document declares
     itself in its first line; anything further down is program text. */
  const head = src.slice(0, 1024);
  return /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\s+html/i.test(head)
      || /<html[\s>]/i.test(head);
}
function ensureFullDocument(src){
  if(isFullDocument(src)){
    /* A document that opens with <html> and no <!doctype> is a QUIRKS-mode
       document, and quirks mode is not a cosmetic difference here: it
       changes what contenteditable produces. Chromium's execCommand emits
       <span style="font-weight:700"> instead of <b> in quirks mode, table
       and box metrics shift, and the page the reader downloaded behaves
       subtly unlike the one they exported it from. PRISTINE_HTML is
       serialised from the DOM, which never carries the doctype, so this is
       exactly the shape that reaches here on the fallback path. */
    return /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype/i.test(src.slice(0, 1024))
      ? src : '<!doctype html>\n' + src;
  }
  let head = src, body = '';
  /* Everything up to the first element that renders belongs in <head>; the
     rest is body. Splitting on the first <div>/<svg>/<main> is crude but the
     document we generate is our own, so its shape is known. */
  const m = src.match(/<(div|svg|main|header|section|nav|button)[\s>]/i);
  if(m){ head = src.slice(0, m.index); body = src.slice(m.index); }
  return '<!doctype html>\n<html lang="en">\n<head>\n'
       + (/<meta\s+charset/i.test(head) ? '' : '<meta charset="utf-8">\n')
       + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
       + head.trim() + '\n</head>\n<body>\n' + body.trim() + '\n</body>\n</html>\n';
}
function extractRegion(src, name){
  const start = `/* @@EDIT:${name}:START@@ */`, end = `/* @@EDIT:${name}:END@@ */`;
  const i = src.indexOf(start), j = src.indexOf(end);
  if(i===-1 || j===-1 || j<i) return null;
  return src.slice(i+start.length, j).trim();
}
function patchRegion(src, name, newText){
  const start = `/* @@EDIT:${name}:START@@ */`, end = `/* @@EDIT:${name}:END@@ */`;
  const i = src.indexOf(start), j = src.indexOf(end);
  if(i===-1 || j===-1 || j<i) throw new Error(`Could not find the ${name} markers in the live page — it may have been edited outside this tool.`);
  return src.slice(0, i+start.length) + '\n' + newText + '\n' + src.slice(j);
}
/* The chart as data, and as a document.

   Everything that can be edited lives in four marked regions of this
   file. `chartData` is that same content as plain values, which is what
   the standalone backend stores; `writeChart` is the other direction —
   the four regions rendered back into a copy of the page. */
function chartData(){
  return {v:1, nodes: workingNodes, edgeStyles: EDGE_STYLES,
          stickers: STICKERS, media: MEDIA, comments: COMMENTS,
          tagCats: TAG_CATS, refs: REFS, settings: SETTINGS};
}
/* The seven regions and what each one is written as. One list, so a
   region cannot be added to the document and forgotten by the writer —
   the same reasoning as SAVED_REGIONS, which must stay in step with it. */
const REGION_NAMES = ['NODES','EDGESTYLES','STICKERS','MEDIA','COMMENTS','TAGCATS','REFS','SETTINGS'];
function writeChartParts(){
  return {
    NODES:      serializeNodes(workingNodes),
    EDGESTYLES: serializeEdgeStyles(EDGE_STYLES),
    STICKERS:   serializeStickers(STICKERS),
    MEDIA:      serializeMedia(MEDIA),
    COMMENTS:   serializeComments(COMMENTS),
    TAGCATS:    serializeTagCats(TAG_CATS),
    REFS:       serializeRefs(REFS),
    SETTINGS:   serializeSettings(SETTINGS)
  };
}
function writeChart(src){
  let out = src;
  if(extractRegion(out, 'NODES') === null){
    throw new Error('could not find the editable data in the page.');
  }
  const parts = writeChartParts();
  REGION_NAMES.forEach(name=>{
    if(extractRegion(out, name) !== null) out = patchRegion(out, name, parts[name]);
  });
  return out;
}

/* ---------------------------------------------------------------------
   Save / reload indicator.

   Saving here means publishing a new version of this very page, after
   which the artifact host reloads the view. From the outside those two
   steps are indistinguishable from the page simply flickering, so this
   pill in the top bar narrates them: it goes busy the moment a publish
   starts and stays busy — deliberately never resetting to "saved and
   done" — because the publish is followed by a reload that replaces this
   document entirely. If the reload somehow doesn't come, the message
   changes to say the change is saved and a refresh is safe, rather than
   leaving a spinner up forever. Failures stop and say so.
   ------------------------------------------------------------------ */
const saveStateEl = document.getElementById('saveState');
const saveStateTextEl = document.getElementById('saveStateText');
let saveStateTimer = null;
function setSaveState(kind, msg){
  clearTimeout(saveStateTimer);
  if(!kind){ saveStateEl.className = 'save-state'; saveStateTextEl.textContent = ''; return; }
  saveStateEl.className = 'save-state show ' + kind;
  saveStateTextEl.textContent = msg;
}

