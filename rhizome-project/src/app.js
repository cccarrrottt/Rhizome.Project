/* =========================================================================
   WHERE THE CHART IS KEPT
   -----------------------------------------------------------------------
   This page began life as a claude.ai artifact, and for a while the only
   way it could save was the one that host provides: publish a new version
   of yourself. That made the chart a hostage of a single website. Opened
   from a disk, or served from anywhere else, it drew perfectly and then
   refused to remember anything.

   It now keeps its work through whichever of two backends is actually
   available, decided at load:

     artifact  — running inside claude.ai with write access. Saving
                 publishes a new version of this page, exactly as before,
                 and the host reloads the view afterwards.
     standalone— everywhere else: a file on a disk, a plain web server, a
                 local dev build. Saving writes the chart to this browser's
                 storage for this document, and takes effect immediately
                 with no reload.

   The standalone backend keeps DATA, not source code: the four editable
   regions are stored as JSON and read back with JSON.parse, so nothing
   stored can ever be executed. Export writes the whole thing back out as a
   fresh self-contained page — that is the copy you keep, move to another
   machine, or publish anywhere at all.

   The restore below runs before anything else, because the model is built
   from these arrays a few hundred lines down and has to see the right
   contents the first time.
   ========================================================================= */
const STORE_PREFIX = 'axiomNexus.chart:';
// One chart per document, so two charts served side by side keep their own
// work rather than overwriting each other.
const STORE_KEY = STORE_PREFIX + (location.pathname + location.search || 'default');

// `claude` is a bare global the host injects. Its absence is the signal
// that nothing here can publish, and it is worth knowing synchronously:
// the boot-time restore below cannot wait on a promise.
const HOSTED = typeof claude !== 'undefined' && claude && typeof claude.use === 'function';

function storageOk(){
  try{
    const k = '__axiomNexusProbe';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return true;
  }catch(e){ return false; }
}
const STORAGE_OK = storageOk();

/* Replace the contents of an array in place. The rest of the page holds
   references to these arrays — EDGE_STYLES especially is captured by
   closures all over — so they must never be reassigned, only refilled. */
function refill(arr, items){
  arr.length = 0;
  if(Array.isArray(items)) items.forEach(x=> arr.push(x));
}

function readStoredChart(){
  if(!STORAGE_OK) return null;
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return (data && typeof data === 'object' && Array.isArray(data.nodes)) ? data : null;
  }catch(e){ return null; }
}

/* Work saved in this browser wins over what is baked into the file — that
   is what saving means. It is applied only when this page has no way to
   publish, so on claude.ai the published document always speaks for
   itself and a stale local copy can never shadow it. */
if(!HOSTED){
  const stored = readStoredChart();
  if(stored){
    /* A region the stored copy does not carry is a region it has nothing
       to say about — not an instruction to empty the one baked into this
       file. `refill` clears before it fills, so an unguarded call against
       a missing key threw away every connector style, sticker and comment
       the document shipped with: a chart written by an older build, or a
       payload edited by hand, opened having quietly "lost its
       formatting", with nothing to explain it. */
    if(Array.isArray(stored.nodes)) refill(NODES, stored.nodes);
    if(Array.isArray(stored.edgeStyles)) refill(EDGE_STYLES, stored.edgeStyles);
    if(Array.isArray(stored.stickers)) refill(STICKERS, stored.stickers);
    if(Array.isArray(stored.media)) refill(MEDIA, stored.media);
    if(Array.isArray(stored.comments)) refill(COMMENTS, stored.comments);
    if(Array.isArray(stored.tagCats)) refill(TAG_CATS, stored.tagCats);
    if(Array.isArray(stored.refs)) refill(REFS, stored.refs);
    if(stored.settings && typeof stored.settings === 'object') Object.assign(SETTINGS, stored.settings);
  }
}

/* The page's own source, captured before a single element has been added
   to it. Export needs the real bytes of this document and cannot always
   fetch them — a page opened from a disk cannot fetch itself at all — but
   at the moment this script starts running the parser has already built
   the whole document, including this script's own text, so the DOM IS the
   source. Read it now, before the chart starts drawing into it. */
const PRISTINE_HTML = (()=>{
  try{ return '<!doctype html>\n' + document.documentElement.outerHTML; }
  catch(e){ return null; }
})();

const DEFAULT_EDGE_STYLE = { routing: 'orthogonal', dash: 'solid', arrow: true, arrowIn: false,
                             sinusoid: false, note: '', notePos: 'above', noteAt: 0.5,
                             noteBg: null, bends: null,
                             noteDir: null, noteLen: null,
                             fromSide: null, toSide: null,
                             fromRing: 0, toRing: 0, gradient: null };
function edgeStyleFor(from, to){
  const o = EDGE_STYLES.find(s=>s.from===from && s.to===to);
  if(!o) return DEFAULT_EDGE_STYLE;
  return {
    routing: o.routing || DEFAULT_EDGE_STYLE.routing,
    dash: o.dash || DEFAULT_EDGE_STYLE.dash,
    arrow: o.arrow !== undefined ? o.arrow : DEFAULT_EDGE_STYLE.arrow,
    // An arrowhead at the source end too, for a mutual or reversed link.
    arrowIn: !!o.arrowIn,
    sinusoid: !!o.sinusoid,
    note: typeof o.note === 'string' ? o.note : '',
    // 'above' | 'on' | 'below'. 'on' lays the note across the connector,
    // its plate covering the line — the right choice on a crowded chart,
    // where a note floating beside its line can read as belonging to the
    // connector next to it.
    notePos: ['above','on','below'].includes(o.notePos) ? o.notePos
             : (o.noteBelow ? 'below' : 'above'),
    /* Where along the connector a leader note is pinned, 0 at the source
       end and 1 at the target. Kept as a FRACTION rather than a point,
       because the connector is re-routed whenever anything moves — an
       absolute point would be left behind the moment a node was dragged,
       while a fraction stays where the reader put it, relative to the line
       it belongs to. */
    noteAt: (typeof o.noteAt === 'number' && o.noteAt >= 0 && o.noteAt <= 1) ? o.noteAt : 0.5,
    /* And which way, and how far, the leader itself runs — drawn by the
       reader rather than searched for. An angle in degrees measured the
       way SVG measures them (0 to the right, growing clockwise) and a
       distance in chart units from the anchor to the card's centre.
       Absent means the card has never been aimed by hand, and the
       automatic search that has always placed it still does. */
    /* The plate's own ground. Its INK is the connector's and is not the
       reader's to set — a remark on a line belongs to the line — but what
       it is written on is, and on a crowded chart a note usually wants
       something to sit on. */
    noteBg: (typeof o.noteBg === 'string' && o.noteBg) ? o.noteBg : null,
    /* Points this connector has to pass through, set by hand — see
       handBends. In chart coordinates, in order from the source end. */
    bends: (Array.isArray(o.bends) && o.bends.length) ? o.bends : null,
    noteDir: (typeof o.noteDir === 'number' && isFinite(o.noteDir)) ? o.noteDir : null,
    noteLen: (typeof o.noteLen === 'number' && o.noteLen > 0) ? o.noteLen : null,
    color: o.color || null,
    // Whether that colour was CHOSEN here rather than inherited from the
    // border the connector was drawn out of. See currentPaint.
    colorFixed: !!o.colorFixed,
    // Explicit sides, set by dragging a connector between two side
    // handles. Absent means "work it out from the geometry".
    fromSide: SIDES.includes(o.fromSide) ? o.fromSide : null,
    toSide: SIDES.includes(o.toSide) ? o.toSide : null,
    // Which border ring each end attaches to on a multi-coloured node.
    fromRing: typeof o.fromRing === 'number' ? o.fromRing : 0,
    toRing: typeof o.toRing === 'number' ? o.toRing : 0,
    // Two hex colours to sweep between along the connector, or null.
    gradient: (Array.isArray(o.gradient) && o.gradient.length===2 &&
               o.gradient.every(c=>typeof c==='string')) ? o.gradient.slice() : null
  };
}

/* ---------------------------------------------------------------------
   Layout engine
   ------------------------------------------------------------------ */
const COLW = 210, ROWH = 118, BOXW = 178, ROOTMARGIN = 70;
// Diameter of a character-bio circle — matched to the height of a default
// box so a row of mixed archetypes lines up.
/* Half again the shortest a default entry may be — a portrait beside a
   row of entries, not a medallion twice their height. */
const BIO_SIZE = 36;
/* Archetypes whose drawing already carries a second layer — the echo, the
   stack — take one border colour and no more. A second ring would have to
   thread between the rings of the echo or the edges of the sheets, where it
   reads as a mistake rather than as a second lineage. The extra colours are
   trimmed on the way into the data, not merely hidden, so the entry says
   what it means. */
/* Archetypes that take exactly one border colour however many are set.
 *
 * A multiversal hub and a local multiverse used to be here. They are no
 * longer archetypes at all — they are tags now, and a tag decorates
 * whatever archetype the entry already wears, so it cannot take that
 * entry's second and third borders away from it. */
const SINGLE_BORDER_SHAPES = new Set([]);
/* How far apart the rings of a multi-coloured border sit — and, since they
   step OUTWARD, the amount the entry's silhouette grows per extra colour.
   The first colour in the list is the entry's own outline; every colour
   after it is drawn around the one before, so the list reads from the
   centre out in exactly the order it is written. Drawing them inward, as
   this did first, meant the last colour was the one buried in the middle
   and a long list ate the box from inside. */
const RING_STEP = 4;
/* A pocket reality's rings sit exactly as far apart as any other
   archetype's. What makes that possible is the shallower ripple below: an
   amplitude of half a step means a ring's wave stays inside its own share
   of the gap, so nothing has to be spread out to keep the frames apart. */
const POCKET_RING_STEP = RING_STEP;
/* ---------------------------------------------------------------------
   How an entry's border is DRAWN.
 *
 * This used to be part of the archetype: a "pocket reality" was an entry
 * whose border rippled, and that was the whole of what made it one. But an
 * archetype is a claim about what an entry IS, and "its edge wiggles" is a
 * claim about how it looks — so an entry could not be a pocket reality and
 * anything else at the same time, and the only way to get a dashed border
 * was to not have one. The ripple is a border STYLE now, alongside the
 * four the connectors have always offered, and any entry may wear it.
 *
 * The names and the dash patterns are the connectors' own, so a dashed
 * border and a dashed connector are dashed the same way. `wavy` is the old
 * pocket border, unchanged in every particular — same wavelength, same
 * amplitude, same phase grid, same ports, same clipping of the arrowheads
 * that meet it.
   ------------------------------------------------------------------ */
const BORDER_STYLES = {
  solid:   {label:'Solid',        dash:null},
  dashed:  {label:'Dashed',       dash:'7 5'},
  dotted:  {label:'Dotted',       dash:'1.5 4'},
  dashdot: {label:'Dash-dotted',  dash:'9 4 1.5 4'},
  double:  {label:'Double',       dash:null},
  wavy:    {label:'Wavy',         dash:null}
};
const BORDER_DOUBLE_GAP = 2.4;   // between the two lines of a double border
function borderStyleOf(n){
  const k = (n && n.border) || 'solid';
  return BORDER_STYLES[k] ? k : 'solid';
}
/* Whether this entry's outline ripples. Card layout replaces the outline
   with a card, so a card is never wavy however its border is set — the
   same rule the pocket archetype followed. */
function isWavyBorder(n){ return !!n && borderStyleOf(n) === 'wavy' && !n.card; }
function ringStepFor(n){ return isWavyBorder(n) ? POCKET_RING_STEP : RING_STEP; }
/* How many borders an entry is drawn with. Rings step OUTWARD — ring 0 is
   the box itself and every further ring stands a step beyond the last — so
   this is also which ring is the outermost one, and how much of an entry's
   own decoration a connector meeting an inner ring has to get past. The
   archetypes that paint their scenery from the first colour only ever have
   one. */
function ringCountOf(n){
  const shape = (n && n.shape) || '';
  if(shape === 'amalgam') return 1;
  if(n && n.card) return 1;
  return (n && n.colors && n.colors.length) ? n.colors.length : 1;
}
/* Written the way they are read. A hyphen is how a tag has to be written
   when it is a key in a program; these are neither — they are two words a
   reader types and a reader sees. */
const HUB_TAG = 'multiversal hub';
const LOCAL_TAG = 'local multiverse';
/* What they used to be called, so a chart written under the old spelling
   opens with its scenery intact rather than with two tags that name
   nothing. See migrateTagSpellings. */
const TAG_RENAMES = {'multiversal-hub': HUB_TAG, 'local-multiverse': LOCAL_TAG};

/* Where each connector's crossbar was last drawn; see joinCandidates.
   Declared here rather than beside it because the first buildModel runs
   long before that part of the file. */
const routeBars = new Map();     // edge key -> {axis:'x'|'y', v:number}
/* Where each callout's anchor actually IS, and what each connector looked
   like when it was put there. */
const leaderAnchors = new Map();   // callout id -> {x, y, at}
const leaderRoutes = new Map();    // edge key -> the route as last drawn  (same reason)
/* And every connector's route, for the drag that wants to line one up with
   another. Filled in as they are drawn; cleared with the rest. */
const drawnRoutes = new Map();     // edge key -> the route as last drawn

/* A free-standing element — a picture, a bare line of text — is scenery on
   the chart rather than an entry in it: no ports, no connectors, and none
   of the decoration an entry can carry. */
function isFreeShape(shape){ return shape === 'image' || shape === 'textbox'; }
/* ---------------------------------------------------------------------
   Callouts.

   A callout is a comment card standing off the chart with a line drawn to
   whatever it is talking about. It used to be a PROPERTY of a connector —
   one field on one connector's style — which made it two things it should
   never have been: rationed (a connector could carry exactly one) and
   entangled (it shared the `note` field with the plate a connector wears,
   so writing one erased the other).

   It is an ENTRY now, with an archetype of its own. Everything an entry
   can do it can do: there can be any number of them, they are dragged,
   coloured, tagged, sized, copied, undone and saved like anything else on
   the chart — and connectors attach to them exactly as they attach to a
   reality, because they are attached to an entry and the router cannot
   tell the difference.

   All that remains of the old arrangement is the ANCHOR: which connector
   the card points at, and where along it. That is drawn as a leader line
   in redrawEdges, once the connector's route is known.
   ------------------------------------------------------------------ */
function calloutAnchorOf(opts){
  const L = opts && opts.leader;
  if(!L || typeof L !== 'object') return null;
  if(typeof L.from !== 'string' || typeof L.to !== 'string') return null;
  const at = (typeof L.at === 'number' && L.at >= 0 && L.at <= 1) ? L.at : 0.5;
  return {from: L.from, to: L.to, at};
}
function isCalloutNode(n){ return !!n && (n.shape || '') === 'callout'; }
/* Which face of a box a point outside it is seen through. The same slab
   test rectBorderPoint solves, answered as a side rather than as a point,
   so a card and its leader can never disagree about which edge the line
   arrives at. */
function sideFacing(n, px, py){
  const dx = px - (n.x + n.w/2), dy = py - (n.y + n.h/2);
  const tx = dx ? (n.w/2) / Math.abs(dx) : Infinity;
  const ty = dy ? (n.h/2) / Math.abs(dy) : Infinity;
  if(tx < ty) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}
/* The side a callout's leader arrives at — the one side of it that is
   already spoken for.
 *
 * Read from the last time the leader was actually drawn, because the exact
 * anchor is a fraction of a routed line and the routes are not known while
 * the entries are being drawn. Before there is one — the very first frame,
 * or a callout whose connector is off the chart — the two entries it joins
 * give a good enough bearing, and the drawn answer replaces it a frame
 * later. */
const calloutLeaderSides = new Map();
function calloutLeaderSide(n){
  if(!n || !n.leader) return null;
  const seen = calloutLeaderSides.get(n.id);
  if(seen) return seen;
  const a = nodes.get(n.leader.from), b = nodes.get(n.leader.to);
  if(!a || !b) return null;
  return sideFacing(n, ((a.x + a.w/2) + (b.x + b.w/2)) / 2,
                       ((a.y + a.h/2) + (b.y + b.h/2)) / 2);
}
/* Which callouts hang off which connector, rebuilt with the model. */
const calloutsByEdge = new Map();
function rebuildCalloutIndex(){
  calloutsByEdge.clear();
  nodes.forEach(n=>{
    if(!isCalloutNode(n) || !n.leader) return;
    const key = calloutEdgeKey(n.leader.from, n.leader.to);
    if(!calloutsByEdge.has(key)) calloutsByEdge.set(key, []);
    calloutsByEdge.get(key).push(n);
  });
}
function capColors(list, shape){
  return SINGLE_BORDER_SHAPES.has(shape) ? list.slice(0, 1) : list;
}
// A multiversal hub's echo: how many rings step out of the box, and how far
// apart. Kept small — the rings have to read as an aura around the entry,
// not as a target the entry happens to sit in.
const HUB_ECHOES = 3, HUB_ECHO_STEP = 6;
// A local multiverse's stack: how many sheets sit behind the front one, and
// how far each is offset up and to the right.
const LOCAL_SHEETS = 2, LOCAL_SHEET_STEP = 5;
/* A card's proportions. The picture band is a fixed height so a row of
   cards lines up along its headings rather than stepping about; the two
   text bands grow with what is in them. The body sits at a smaller size
   than the heading, which is what makes the heading read as a heading. */
const CARD_MINW = 132, CARD_MAXW = 210;
const CARD_IMG_H = 66, CARD_BODY_SCALE = 0.82;
const CARD_PAD_Y = 9;
// Default box for a free-standing picture before anyone resizes it.
const IMAGE_DEFAULT_W = 180, IMAGE_DEFAULT_H = 120;
// A loose caption may run much wider than a chart entry before it wraps.
const TEXTBOX_MAXW = 420;
// Bounds a text box is allowed to take. MAXW is the old fixed width, so a
// long label looks exactly as it always did; short ones now shrink.
/* Whether this view may edit at all. Declared up here with the rest of the
   module's state rather than beside the code that SETS it: the panels are
   built while the page loads, and a panel that asks "am I read-only?"
   before the answer exists throws — which is exactly what happened the
   moment a section heading started carrying an editing control. */
let readOnlyView = false;
const NODE_MINW = 84, NODE_MAXW = 178, NODE_MINH = 40;
/* How wide a one-line entry may grow before its text is clipped instead.
   Wider than NODE_MAXW, which is the ceiling for a label the measurer is
   allowed to FOLD: a line that cannot be folded needs somewhere to go. */
const NODE_LINE_MAXW = 300;
/* How far the border stands off the text's own ink. Small and fixed: what
   varies is the ink, which is measured (see measureTextBlock), so a bigger
   glyph or a descender moves the border rather than eating into the gap. */
const NODE_PAD_X = 7, NODE_PAD_Y = 5;
/* The smallest an auto-sized box is allowed to get, whatever its text.
   Not a padding — a floor, so that a one-letter entry is still a box with
   room for its ports and its resize grip rather than a chip. NODE_MINH
   above is no longer that floor: it is the height an entry is CREATED and
   RESIZED at, which is why it is larger — a new entry should arrive as a
   box with room in it, and a corner drag should not be able to crush one
   to a sliver. What an entry settles to once it has closed on its own text
   is this. */
const NODE_FIT_MINW = 52, NODE_FIT_MINH = 24;
// The smallest a portrait may be dragged to; below this it is a dot.
const BIO_MIN_SIZE = 20;
/* The height a box's GROWTH is measured from — see growShift.
 *
 * It used to be NODE_MINH, which was right while an ordinary one-line entry
 * came out exactly that tall. Closing the borders onto the ink made a
 * one-line entry a good deal shorter than that, and the reference did not
 * follow: every box on the chart was now below it, so growth was measured
 * from a height nothing had and NOTHING was compensated. An entry that
 * gained a line kept its top and dropped its bottom — the very thing the
 * offset exists to prevent, back again by arithmetic rather than by
 * intent.
 *
 * The smallest a box can be IS the height an ordinary entry has, so growth
 * is measured from there. A one-line entry takes no offset, exactly as it
 * took none before, so no stored position moves; only a box that is
 * genuinely taller than the ordinary one is re-centred, which is the case
 * the rule was written for. */
const NODE_GROW_REF = NODE_FIT_MINH;
// How many lines a label is allowed to wrap to before the box is widened
// instead — three keeps entries compact without turning long titles into
// very wide boxes.
const NODE_MAX_LINES = 3;

const DEFAULT_NODE_COLOR = '#20242b';
// Kept in step with --emoji in the stylesheet.
const EMOJI_FAMILY = "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif";
/* The chip standing for an entry's default text.
 *
 * It was the 🇺🇸 emoji, which Windows does not draw: the regional-indicator
 * pair falls back to the two letters "US" in a box, or to nothing. Flags
 * are the one emoji family Windows has never shipped glyphs for, so no
 * font stack rescues it. It is drawn as a few rectangles instead — a
 * dozen bytes of SVG that look the same everywhere. */
const DEFAULT_LANG_CHIP = '\uD83C\uDDFA\uD83C\uDDF8';   // 🇺🇸

const nodes = new Map();   // id -> node record
const structEdges = [];    // {from,to,color,label}
const componentMeta = []; // [{ids, origin:{x,y}, bbox}]


/* ---------------------------------------------------------------------
   The working copy of the chart data.

   NODES is the literal saved in the page; workingNodes is the live,
   editable version of it that everything on screen is built from. Edits
   change workingNodes and rebuild the view immediately — nothing is
   written back to the page until Save. See the save/dirty section for
   why that's the right shape for this platform.
   ------------------------------------------------------------------ */
let workingNodes = NODES.map(item=> item.slice());

/* Charts saved before the hub and the local multiverse became tags.
 *
 * Both were archetypes then, stored in the tuple's shape slot, and an
 * entry that was one could not also be a pocket reality or wear a second
 * border. Reading such a chart now, each becomes what it always described:
 * an ordinary box carrying the tag that draws its scenery. Nothing is lost
 * — the entry keeps its colour, its card, its position and its links — and
 * the tag is filed under a category so the legend can show it.
 *
 * Done on the working copy rather than at render time, so saving the chart
 * writes the new form and the migration happens exactly once per chart. */
/* Charts saved while a fill and a border style were archetypes.
 *
 * A "mirror reality" was an entry filled with its own border colour and a
 * "pocket reality" was an entry whose border rippled — two claims about
 * how an entry LOOKS, standing where a claim about what it IS belongs, and
 * each of them locking out every other archetype for the sake of one
 * visual property. Both are properties now, and any entry may carry them:
 * a mirror becomes an ordinary entry with a background, a pocket becomes
 * an ordinary entry with a wavy border, and both come out looking exactly
 * as they did. Done once, on the working copy, so saving writes the new
 * form. */
function migrateArchetypeLooks(list){
  let moved = 0;
  (list || []).forEach(item=>{
    const shape = item && item[5];
    if(shape !== 'mirror' && shape !== 'pocket') return;
    item[5] = null;
    const opts = (item[6] && typeof item[6] === 'object') ? item[6] : (item[6] = {});
    if(shape === 'mirror'){
      /* Its fill WAS its border colour, so that is the background it keeps
         — and the label, which a mirror drew in contrasting ink, goes on
         being drawn that way because readableOn sees the two are the
         same colour. */
      const c = (Array.isArray(opts.colors) && opts.colors[0]) || DEFAULT_NODE_COLOR;
      if(!Array.isArray(opts.bg) || !opts.bg.length) opts.bg = [c];
    } else {
      if(!opts.border) opts.border = 'wavy';
    }
    moved++;
  });
  return moved;
}
function migrateLegacyArchetypes(list){
  let moved = 0;
  (list || []).forEach(item=>{
    const shape = item && item[5];
    if(shape !== 'hub' && shape !== 'local') return;
    item[5] = null;
    const opts = (item[6] && typeof item[6] === 'object') ? item[6] : (item[6] = {});
    const tag = shape === 'hub' ? HUB_TAG : LOCAL_TAG;
    const tags = Array.isArray(opts.tags) ? opts.tags : (opts.tags = []);
    if(tags.indexOf(tag) < 0) tags.push(tag);
    moved++;
  });
  if(moved && typeof TAG_CATS !== 'undefined'){
    [HUB_TAG, LOCAL_TAG].forEach(tag=>{
      if(TAG_CATS.some(c=> c.tags.indexOf(tag) >= 0)) return;
      let bin = TAG_CATS.find(c=> c.name === '__ungrouped__');
      if(!bin){ bin = {name:'__ungrouped__', tags:[]}; TAG_CATS.push(bin); }
      bin.tags.push(tag);
    });
  }
  return moved;
}

/* Charts written while a leader note was a connector's own property.
 *
 * Each such note becomes a callout entry pointing at the same place on the
 * same connector, and the connector gets its note field back. The card's
 * position is the one it was aimed at — the direction and distance were
 * measured from the anchor, and the anchor is a fraction of a route that
 * is not known until the connector is drawn, so the entry is created with
 * a placeholder position and redrawEdges puts it where it belongs the
 * first time that connector is routed. See placePendingCallouts. */
const pendingCallouts = new Map();   // callout id -> {from, to, at, dir, len}
function migrateLeaderNotes(){
  let moved = 0;
  EDGE_STYLES.forEach(st=>{
    if(!st || st.notePos !== 'leader') return;
    const text = typeof st.note === 'string' ? st.note : '';
    const at = (typeof st.noteAt === 'number' && st.noteAt >= 0 && st.noteAt <= 1) ? st.noteAt : 0.5;
    const dir = typeof st.noteDir === 'number' ? st.noteDir : -90;
    const len = (typeof st.noteLen === 'number' && st.noteLen > 0) ? st.noteLen : 68;
    const ids = new Set(workingNodes.map(it=> it[0]));
    const id = uniqueId('callout', ids);
    workingNodes.push([id, text.trim(), null, null, null, 'callout',
                       {pos:[0, 0], leader:{from: st.from, to: st.to, at}}]);
    pendingCallouts.set(id, {from: st.from, to: st.to, at, dir, len});
    delete st.note; delete st.notePos;
    delete st.noteAt; delete st.noteDir; delete st.noteLen;
    moved++;
  });
  return moved;
}

/* Tags whose spelling changed. Renamed everywhere they can be written
   down: on the entries that carry them and in the categories that file
   them. Runs with the other migrations, so a chart written under the old
   spelling is corrected once and saved in the new form. */
function migrateTagSpellings(list){
  let moved = 0;
  const fix = (tags)=>{
    if(!Array.isArray(tags)) return;
    for(let i = 0; i < tags.length; i++){
      const to = TAG_RENAMES[tags[i]];
      if(!to) continue;
      /* Renaming onto a tag the entry already carries would leave it with
         the same tag twice, which the filter would then count twice. */
      if(tags.indexOf(to) >= 0) tags.splice(i--, 1);
      else tags[i] = to;
      moved++;
    }
  };
  (list || []).forEach(item=>{ if(item && item[6]) fix(item[6].tags); });
  if(typeof TAG_CATS !== 'undefined') TAG_CATS.forEach(c=> fix(c && c.tags));
  return moved;
}

function buildModel(){
  // A rebuilt chart is a new chart as far as the routes are concerned.
  routeBars.clear();
  /* Anchors go with them. Everything the memory holds has already been
     written into the entries it came from, so dropping it costs nothing
     and stops an undo or an import being second-guessed by a position
     remembered from the chart that was there before it. */
  leaderAnchors.clear();
  leaderRoutes.clear();
  drawnRoutes.clear();
  migrateLegacyArchetypes(workingNodes);
  migrateArchetypeLooks(workingNodes);
  migrateTagSpellings(workingNodes);
  if(typeof EDGE_STYLES !== 'undefined') migrateLeaderNotes();
  nodes.clear();
  structEdges.length = 0;
  componentMeta.length = 0;

workingNodes.forEach(item=>{
  let [id,label,parent,edgeLabel,note,shape,opts] = item;
  let parents;
  if(parent===undefined || parent===null){
    parents = [];
  } else if(Array.isArray(parent)){
    parents = parent;
  } else {
    parents = [parent];
  }
  const tags = (opts && Array.isArray(opts.tags) && opts.tags.length) ? opts.tags : null;
  const colors = (opts && Array.isArray(opts.colors) && opts.colors.length) ? opts.colors : null;
  nodes.set(id,{
    id, label, note:note||null,
    // A character bio is a small circle rather than a box: it carries a
    // portrait, not a paragraph, so it is sized by BIO_SIZE and its text
    // lives in a card that opens beside it.
    shape:shape||null, parents, edgeLabel: edgeLabel||null, rank:0, col:0, x:0,y:0,
    /* A callout's anchor: the connector it points at and where along it.
       Absent on every other entry, and absent on a callout that has been
       cut loose from its connector — which is still a perfectly good
       comment card, just one that points at nothing. */
    leader: calloutAnchorOf(opts),
    w: (shape==='ellipse' ? BIO_SIZE : BOXW), h:56,
    children:[],
    link: (opts && opts.link) || null,
    colors,
    color: (colors && colors[0]) || DEFAULT_NODE_COLOR,
    /* What the entry is filled with. One colour is a flat ground; more
       than one is a gradient across the box, the same way an amalgam's
       border runs through its lineages' colours. Absent is the paper. */
    bg: (opts && Array.isArray(opts.bg) && opts.bg.length) ? opts.bg : null,
    /* And how its outline is drawn: solid, dashed, dotted, dash-dotted,
       double, or the wavy edge a pocket reality used to be. */
    border: (opts && typeof opts.border === 'string' && BORDER_STYLES[opts.border])
            ? opts.border : null,
    tags,
    font: (opts && opts.font) || null,
    fontSize: (opts && typeof opts.fontSize==='number') ? opts.fontSize : null,
    multiLang: !!(opts && opts.multiLang),
    langTabs: (opts && Array.isArray(opts.langTabs) && opts.langTabs.length) ? opts.langTabs : null,
    // A hand-placed position, set by dragging the node. When present it
    // overrides whatever the auto-layout computed for this node (applied
    // just after the layout pass below); when absent the node keeps
    // flowing with the automatic layout as it always has.
    pos: (opts && Array.isArray(opts.pos) && opts.pos.length===2 &&
          typeof opts.pos[0]==='number' && typeof opts.pos[1]==='number') ? {x:opts.pos[0], y:opts.pos[1]} : null,
    // Portrait for a character bio: any URL the page may load, or an
    // embedded data: URI.
    image: (opts && typeof opts.image==='string' && opts.image) ? opts.image : null,
    // Stacking order for free-standing images: 0 is the normal node layer,
    // -1 puts the element behind the connectors as a backdrop, +1 puts it
    // over everything else. Only images use it; nothing else needs to be
    // layered by hand.
    z: (opts && typeof opts.z==='number' && Number.isFinite(opts.z)) ? opts.z : 0,
    /* Card layout: this entry is drawn as three stacked bands — a picture,
       the label as a heading, the note as body text — instead of a box with
       its label centred in it. It is a per-entry choice, not a chart-wide
       mode, so a chart can mix plain entries and cards freely. Any archetype
       that is a box can wear it; a character bio and the free-standing
       elements cannot, since they have no box to divide. */
    card: !!(opts && opts.card),
    /* A portrait's card, asked to stay. Off, the card opens under the
       pointer and while the entry's panel is open on it; on, it is part
       of the drawing and is always there. */
    bioCard: !!(opts && opts.bioCard),
    /* Which side that card stands on: 'auto' works it out from what is in
       the way, 'left' and 'right' are the reader's own answer. */
    bioSide: (opts && (opts.bioSide === 'left' || opts.bioSide === 'right'))
             ? opts.bioSide : null,
    // Degrees clockwise about the element's own centre. Only a loose text
    // block uses it — a caption set at an angle across the chart.
    rot: (opts && typeof opts.rot==='number' && Number.isFinite(opts.rot))
         ? ((opts.rot % 360) + 360) % 360 : 0,
    // A hand-set box size, from dragging a node's corner. Absent means the
    // box sizes itself to its text.
    size: (opts && Array.isArray(opts.size) && opts.size.length===2 &&
           opts.size.every(v=>typeof v==='number' && Number.isFinite(v)))
          ? {w:opts.size[0], h:opts.size[1]} : null
  });
});

// Build structEdges only now that every node exists. label/color come from
// the CHILD end's own data, so every parent->this-node edge shares them —
// that's a deliberate simplification (an edgeLabel describes "how this
// entry came to be", which is the same regardless of which of its several
// parents you're looking from).
nodes.forEach(n=>{
  n.parents.forEach(p=>{
    if(nodes.has(p)){
      structEdges.push({from:p, to:n.id, color:n.color, label:n.edgeLabel});
    }
  });
});

// link children arrays
structEdges.forEach(e=>{
  if(nodes.has(e.from) && nodes.has(e.to)){
    nodes.get(e.from).children.push(e.to);
  }
});


/* ---------------------------------------------------------------------
   Connected components — there's no declared grouping any more (tags are
   for filtering, not layout), so unrelated trees are told apart the only
   way that's still meaningful: nodes reachable from each other via ANY
   parent/child edge (direction ignored) are laid out together as one
   auto-detected group, so two unconnected diagrams never get tangled into
   the same rank/column grid, and are then spread apart in pixel space by
   the collision pass below exactly like continuities used to be.
   ------------------------------------------------------------------ */
(function findComponents(){
  const adjacency = new Map();
  nodes.forEach((n,id)=> adjacency.set(id, new Set()));
  structEdges.forEach(e=>{
    if(adjacency.has(e.from) && adjacency.has(e.to)){
      adjacency.get(e.from).add(e.to);
      adjacency.get(e.to).add(e.from);
    }
  });
  const seen = new Set();
  nodes.forEach((n,startId)=>{
    if(seen.has(startId)) return;
    const ids = [];
    const queue = [startId];
    seen.add(startId);
    while(queue.length){
      const id = queue.shift();
      ids.push(id);
      adjacency.get(id).forEach(nb=>{
        if(!seen.has(nb)){ seen.add(nb); queue.push(nb); }
      });
    }
    componentMeta.push({ids, origin:{x:0,y:0}});
  });
})();

// ---- rank computation per component (longest path) ----
componentMeta.forEach(comp=>{
  const ids = comp.ids;
  const idSet = new Set(ids);
  const rankOf = new Map();
  function computeRank(id, seen){
    if(rankOf.has(id)) return rankOf.get(id);
    if(seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const n = nodes.get(id);
    const parentsInComp = n.parents.filter(p=>idSet.has(p));
    let r = 0;
    parentsInComp.forEach(p=>{ r = Math.max(r, computeRank(p,seen)+1); });
    rankOf.set(id,r);
    return r;
  }
  ids.forEach(id=>computeRank(id,new Set()));
  ids.forEach(id=>{ nodes.get(id).rank = rankOf.get(id); });

  // assign columns per rank, preserving order, barycenter pass
  const byRank = {};
  ids.forEach(id=>{
    const r = nodes.get(id).rank;
    (byRank[r] = byRank[r]||[]).push(id);
  });
  const maxRank = Math.max(0,...Object.keys(byRank).map(Number));
  for(let r=0;r<=maxRank;r++){
    const layer = byRank[r]||[];
    layer.forEach((id,i)=>{ nodes.get(id).col = i; });
  }
  // barycenter smoothing (two passes) based on in-component parents
  for(let pass=0; pass<3; pass++){
    for(let r=1;r<=maxRank;r++){
      const layer = byRank[r]||[];
      const scored = layer.map(id=>{
        const n = nodes.get(id);
        const parentsInComp = n.parents.filter(p=>idSet.has(p));
        const avg = parentsInComp.length ?
          parentsInComp.reduce((s,p)=>s+nodes.get(p).col,0)/parentsInComp.length :
          n.col;
        return {id,avg};
      });
      scored.sort((a,b)=>a.avg-b.avg);
      scored.forEach((s,i)=>{ nodes.get(s.id).col = i; });
    }
  }

  // compute pixel positions (left-anchored first pass, ordering only)
  ids.forEach(id=>{
    const n = nodes.get(id);
    n.x = comp.origin.x + n.col*COLW;
    n.y = comp.origin.y + ROOTMARGIN + n.rank*ROWH;
    // Width is decided by the renderer now (text-fitted, or hand-set), so
    // the layout pass only places boxes — it no longer resizes them. It
    // does record the slot it placed each node in, though: boxes are no
    // longer all one width, so the renderer re-centres each one inside its
    // slot rather than leaving narrow entries hugging the left edge of it.
    n.slotX = n.x;
    n.slotW = BOXW;

  });

  // center each rank's siblings under their shared parent, instead of
  // always hugging the left edge - e.g. an 8-way fan-out now spreads
  // evenly left/right of the box it branches from, not off to its right.
  for(let r=1;r<=maxRank;r++){
    const layer = (byRank[r]||[]).slice().sort((a,b)=>nodes.get(a).col-nodes.get(b).col);
    if(!layer.length) continue;
    // split the (already left-to-right ordered) layer into runs that
    // share the same primary in-component parent
    const groups = [];
    let curParent, curGroup;
    layer.forEach(id=>{
      const n = nodes.get(id);
      const parentsInComp = n.parents.filter(p=>idSet.has(p));
      const primary = parentsInComp[0] || null;
      if(!curGroup || primary !== curParent){
        curGroup = {parent:primary, ids:[]};
        groups.push(curGroup);
        curParent = primary;
      }
      curGroup.ids.push(id);
    });
    const GAP = COLW - BOXW;
    let cursorX = -Infinity;
    groups.forEach(g=>{
      const width = (g.ids.length-1)*COLW + BOXW;
      const p = g.parent && nodes.has(g.parent) ? nodes.get(g.parent) : null;
      let startX = p ? (p.x + p.w/2) - width/2 : nodes.get(g.ids[0]).x;
      if(startX < cursorX) startX = cursorX;
      g.ids.forEach((id,i)=>{ nodes.get(id).x = startX + i*COLW; });
      cursorX = startX + width + GAP;
    });
  }

  // A node with 2+ in-component parents (an amalgam merge, most notably)
  // was, up to here, positioned as a child of just its "primary" (first-
  // listed) parent — the grouping pass above only knows how to hang a run
  // of siblings under one shared parent. Re-center any such node under the
  // average of ALL its parents instead, then resolve whatever same-row
  // overlap that shift introduces by nudging siblings apart left-to-right,
  // same spacing (COLW) as everywhere else in the grid.
  for(let r=1;r<=maxRank;r++){
    const layer = byRank[r]||[];
    if(!layer.length) continue;
    layer.forEach(id=>{
      const n = nodes.get(id);
      const parentsInComp = n.parents.filter(p=>idSet.has(p));
      if(parentsInComp.length < 2) return;
      const avgCenterX = parentsInComp.reduce((s,p)=>{
        const pn = nodes.get(p);
        return s + pn.x + pn.w/2;
      }, 0) / parentsInComp.length;
      n.x = avgCenterX - n.w/2;
    });
    const ordered = layer.slice().sort((a,b)=>nodes.get(a).x-nodes.get(b).x);
    for(let i=1;i<ordered.length;i++){
      const prev = nodes.get(ordered[i-1]), cur = nodes.get(ordered[i]);
      const minX = prev.x + COLW;
      if(cur.x < minX) cur.x = minX;
    }
  }

  const xs = ids.map(id=>nodes.get(id).x);
  const minX = Math.min(...xs), maxX = Math.max(...xs.map((x,i)=>x+BOXW));
  comp.bbox = {
    x0: minX - 20, y0: comp.origin.y,
    x1: maxX + 20,
    y1: comp.origin.y + ROOTMARGIN + (maxRank+1)*ROWH
  };
});

/* ---------------------------------------------------------------------
   Collision resolution — nudge whole components apart so their
   auto-computed boxes never overlap.
   ------------------------------------------------------------------ */
(function resolveComponentOverlaps(){
  const PAD = 70;
  const offsets = componentMeta.map(()=> ({dx:0,dy:0}));

  function currentBox(i){
    const cm = componentMeta[i], o = offsets[i];
    return {
      x0: cm.bbox.x0+o.dx, y0: cm.bbox.y0+o.dy,
      x1: cm.bbox.x1+o.dx, y1: cm.bbox.y1+o.dy
    };
  }

  for(let iter=0; iter<400; iter++){
    let moved = false;
    for(let i=0;i<componentMeta.length;i++){
      for(let j=i+1;j<componentMeta.length;j++){
        if(!componentMeta[i].bbox || !componentMeta[j].bbox) continue;
        const a = currentBox(i), b = currentBox(j);
        const ax0=a.x0-PAD, ax1=a.x1+PAD, ay0=a.y0-PAD, ay1=a.y1+PAD;
        const overlapX = Math.min(ax1,b.x1) - Math.max(ax0,b.x0);
        const overlapY = Math.min(ay1,b.y1) - Math.max(ay0,b.y0);
        if(overlapX>0 && overlapY>0){
          moved = true;
          const oa = offsets[i], ob = offsets[j];
          if(overlapX < overlapY){
            const push = overlapX/2 + 1;
            if(a.x0 < b.x0){ oa.dx -= push; ob.dx += push; }
            else { oa.dx += push; ob.dx -= push; }
          } else {
            const push = overlapY/2 + 1;
            if(a.y0 < b.y0){ oa.dy -= push; ob.dy += push; }
            else { oa.dy += push; ob.dy -= push; }
          }
        }
      }
    }
    if(!moved) break;
  }

  componentMeta.forEach((cm,i)=>{
    const o = offsets[i];
    if(o.dx===0 && o.dy===0) return;
    cm.bbox.x0+=o.dx; cm.bbox.x1+=o.dx; cm.bbox.y0+=o.dy; cm.bbox.y1+=o.dy;
    cm.ids.forEach(id=>{
      const n = nodes.get(id);
      n.x += o.dx; n.y += o.dy;
    });
  });
})();

/* ---------------------------------------------------------------------
   Hand-placed positions. Everything above computes an automatic layout;
   this is the last word on where a node actually sits. Dragging a node
   writes opts.pos into its saved entry, and from then on that entry
   ignores the computed slot and stays exactly where it was put. Nodes
   with no opts.pos keep flowing with the auto-layout — so a chart can mix
   both freely, and clearing a node's pos hands it straight back to the
   layout engine. Every hand-placed coordinate is a multiple of GRID (the
   drag snaps to it), which is what keeps a hand-arranged chart aligned
   instead of merely scattered.
   ------------------------------------------------------------------ */
nodes.forEach(n=>{
  if(n.pos){ n.x = n.pos.x; n.y = n.pos.y; }
});
rebuildCalloutIndex();

}  // end buildModel
const GRID = 10;
function snapToGrid(v){ return Math.round(v/GRID)*GRID; }
buildModel();

/* ---------------------------------------------------------------------
   Inline label markup — **bold**, *italic*, [[base|ruby]] — plus the
   text-wrap helper built on top of it. A "word" here is a wrap unit:
   plain/bold/italic runs split on whitespace, but a ruby unit never
   splits (its base+annotation always stay on one line).
   ------------------------------------------------------------------ */
// {{#hex|text}} colours a run of text. The braces are doubled so a lone
// brace in ordinary prose is never mistaken for markup.
/* A reference is {{r:key}}. It is deliberately NOT "[3]".
 *
 * Typing [3] by hand must stay ordinary text — a chart about fiction is
 * full of bracketed numbers that are not citations, and a system that
 * silently claimed them would be worse than none. So a reference is a token
 * like every other piece of markup here, and the [3] a reader sees is
 * RENDERED, never stored: the number is the reference's position in the
 * list at the moment of drawing. Reorder the list and every mark in the
 * chart renumbers itself, which is the whole reason to store a key rather
 * than a number.
 *
 * The new alternative is appended rather than inserted, so the existing
 * capture-group numbers below are untouched. */
/* `opts.media` keeps embedded figures in the run list.
 *
 * They are dropped by default, and that default is what makes the rest of
 * the chart safe: every other reader of a run list — the box that measures
 * a label, the SVG that draws it, the search index, the plain-text
 * stripper — is drawing TEXT, and a figure is not text. Only the two
 * readers that render a document ask for them. */
function tokenizeLabel(label, opts){
  const out = [];
  parseMarkupInto(String(label === null || label === undefined ? '' : label), {}, out);
  return (opts && opts.media) ? out : out.filter(t=> t.type !== 'media');
}
/* Where the closing `}}` of a wrapper is, counting nested ones. */
function matchWrapEnd(src, from){
  let depth = 0;
  for(let i = from; i < src.length - 1; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){ depth++; i++; continue; }
    if(src[i] === '}' && src[i+1] === '}'){
      if(depth === 0) return i;
      depth--; i++;
    }
  }
  return -1;
}
/* Where the next run of at least `len` asterisks starts, skipping escaped
   ones and anything inside a `{{…}}` wrapper. */
function matchStarRun(src, from, len){
  for(let i = from; i < src.length; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){
      const e = matchWrapEnd(src, i + 2);
      if(e < 0) return -1;
      i = e + 1; continue;
    }
    /* A reading is stepped over whole, the same way a wrapper is. Its two
       halves carry markup of their own now, so the asterisks inside one of
       them are not the closing pair of a bold run that began outside it —
       and reading them as such split `**Bold [[**base**|…]] tail**` at the
       wrong place and left the whole label as plain text. */
    if(src[i] === '[' && src[i+1] === '['){
      const bar = rubySplit(src, i + 2);
      const end = bar >= 0 ? rubyEnd(src, bar + 1) : -1;
      if(end >= 0){ i = end + 1; continue; }
    }
    if(src[i] !== '*') continue;
    let run = 0;
    while(src[i + run] === '*') run++;
    if(run >= len) return i;
    i += run - 1;
  }
  return -1;
}
/* The markup, parsed as a TREE and flattened into runs that each carry
   everything true of them at once.
 *
 * It used to be one regular expression producing a flat list where a run
 * was bold OR coloured OR set in a face, never two of them — and the
 * editor could not know that. Pressing Bold and then Italic on the same
 * word wrote `***text***`, which the flat grammar read as a stray asterisk,
 * a bold run and another stray asterisk, and the chart showed the
 * asterisks. Choosing a face and then a size wrote a wrapper inside a
 * wrapper, whose body the flat pattern `[^}]*` cut short at the inner
 * closing brace, and the chart showed the raw `{{z:14|word}}`. Both are
 * two ordinary clicks.
 *
 * A run of asterisks is read by its LENGTH — three means bold and italic
 * together, which is what the editor writes for both — and a wrapper's
 * body is found by matching braces rather than by stopping at the first
 * one. A backslash escapes the character after it, so an entry that says
 * `2 \* 3` is two, an asterisk, three. */
/* The kinds of line the text engine can draw under a word or through it.
 *
 * The same variety a connector offers, as far as type allows: a browser
 * draws a text decoration in one of five styles and dash-dot is not among
 * them, so the connector's ─· is answered here by a double rule, which is
 * the one classical text line the connector has no use for. Each key is
 * what the markup stores, so these names are part of the saved format. */
const LINE_STYLES = {
  solid:  {label:'\u2500\u2500', css:'solid'},
  dashed: {label:'\u254C\u254C', css:'dashed'},
  dotted: {label:'\u2508\u2508', css:'dotted'},
  double: {label:'\u2550\u2550', css:'double'},
  wavy:   {label:'\u223F',        css:'wavy'}
};
/* The `|` that divides a reading's two halves, and the `]]` that ends it —
   found by scanning, so that a half containing a `{{…}}` wrapper (whose
   body may hold anything) does not end the unit early. Escapes are
   honoured; neither half may hold a bare `|` or `]` of its own, which is
   what the writer guarantees. */
function rubySplit(src, from){
  for(let i = from; i < src.length; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){
      const e = matchWrapEnd(src, i + 2);
      if(e < 0) return -1;
      i = e + 1; continue;
    }
    if(src[i] === ']') return -1;
    if(src[i] === '|') return i;
  }
  return -1;
}
function rubyEnd(src, from){
  for(let i = from; i < src.length - 1; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){
      const e = matchWrapEnd(src, i + 2);
      if(e < 0) return -1;
      i = e + 1; continue;
    }
    if(src[i] === ']' && src[i+1] === ']') return i;
  }
  return -1;
}
// The words a run list says, with nothing of how they are set.
function runsText(runs){
  return (runs || []).map(t=> t.type === 'plain' ? t.text
    : t.type === 'ruby' ? t.base : '').join('');
}
function parseMarkupInto(src, st, out){
  let i = 0, buf = '';
  const flush = ()=>{
    if(!buf) return;
    out.push(Object.assign({type:'plain', text:buf}, st));
    buf = '';
  };
  while(i < src.length){
    const ch = src[i];
    if(ch === '\\' && i + 1 < src.length){ buf += src[i+1]; i += 2; continue; }
    if(ch === '{' && src[i+1] === '{'){
      /* A figure may carry a width, as a percentage of the column it
         stands in: `{{m:key@60}}`. A percentage rather than pixels because
         the same comment is read in a drawer, in an exported page and in
         whatever width the reader's window happens to be — a figure set to
         "half the column" stays half the column everywhere, and a figure
         set to 380px is right in exactly one of them. */
      const atomic = /^\{\{([srm]):([A-Za-z0-9_-]+)(?:@(\d{1,3}))?\}\}/.exec(src.slice(i));
      if(atomic){
        flush();
        const kind = {s:'sticker', r:'ref', m:'media'}[atomic[1]];
        const tok = Object.assign({type: kind, key: atomic[2]}, st);
        if(kind === 'media' && atomic[3]) tok.w = clampFigureWidth(+atomic[3]);
        out.push(tok);
        i += atomic[0].length;
        continue;
      }
      const head = /^\{\{(#[0-9a-fA-F]{3,8}|f:[A-Za-z0-9_-]+|z:\d{1,2}(?:\.\d)?|[ut]:[a-z]+)\|/.exec(src.slice(i));
      if(head){
        const bodyAt = i + head[0].length;
        const endAt = matchWrapEnd(src, bodyAt);
        if(endAt >= 0){
          flush();
          const tag = head[1];
          const next = Object.assign({}, st);
          if(tag[0] === '#') next.color = tag;
          else if(tag[0] === 'f') next.font = tag.slice(2);
          else if(tag[0] === 'z') next.size = +tag.slice(2);
          // A line UNDER the words or THROUGH them, in one of the same
          // kinds of line a connector can be drawn in. See LINE_STYLES.
          else if(tag[0] === 'u') next.under = LINE_STYLES[tag.slice(2)] ? tag.slice(2) : 'solid';
          else next.strike = LINE_STYLES[tag.slice(2)] ? tag.slice(2) : 'solid';
          parseMarkupInto(src.slice(bodyAt, endAt), next, out);
          i = endAt + 2;
          continue;
        }
      }
      buf += ch; i++; continue;
    }
    if(ch === '[' && src[i+1] === '['){
      /* A reading, whose two halves are markup in their own right.
       *
       * They used to be plain strings, and the unit took the look of the
       * run around it whole — so an annotation written over a bold red
       * word was bold and red because the word was, and there was no way
       * to say otherwise. Each half is parsed on its own now: the base
       * still inherits the run it sits in, and the annotation starts from
       * the run too but can be given anything of its own on top.
       *
       * Scanned rather than matched by a pattern, because a half may now
       * contain `{{…}}` wrappers with braces of their own. */
      const bar = rubySplit(src, i + 2);
      if(bar >= 0){
        const end = rubyEnd(src, bar + 1);
        if(end >= 0){
          flush();
          const baseRuns = [], annoRuns = [];
          parseMarkupInto(src.slice(i + 2, bar), Object.assign({}, st), baseRuns);
          parseMarkupInto(src.slice(bar + 1, end), Object.assign({}, st), annoRuns);
          out.push(Object.assign({type:'ruby',
            base: runsText(baseRuns), anno: runsText(annoRuns),
            baseRuns, annoRuns}, st));
          i = end + 2;
          continue;
        }
      }
    }
    if(ch === '*'){
      let run = 0;
      while(src[i + run] === '*') run++;
      const use = Math.min(run, 3);
      const closeAt = matchStarRun(src, i + use, use);
      if(closeAt >= 0){
        flush();
        const next = Object.assign({}, st);
        if(use >= 2) next.bold = true;
        if(use === 1 || use === 3) next.italic = true;
        parseMarkupInto(src.slice(i + use, closeAt), next, out);
        i = closeAt + use;
        continue;
      }
    }
    buf += ch; i++;
  }
  flush();
}
/* The inverse: text as it would be WRITTEN, with anything that would
   otherwise be read as markup escaped. Typing "2 * 3 = 6 and 4 * 5 = 20"
   used to store those asterisks raw, and the chart rendered the middle of
   the sentence in italics with both of them swallowed. */
function escapeMarkup(text){
  /* Braces, one at a time.
   *
     `}}` closes a wrapper, and it was not escaped at all: colouring `a}}b`
     wrote `{{#c23b22|a}}b}}`, which reads back as a red `a` followed by a
     plain `b}}` — the styling stopping halfway through the run with a pair
     of braces printed on the chart.
   *
     Escaping the PAIR is not enough either, because the pairs are matched
     without overlapping: `}}}` would become `\}}` + `}`, and the scanner
     that finds where a wrapper's body ends — which reads a backslash as
     covering exactly one character — would step over the first brace and
     stop on the next two. One backslash per brace is the only form that
     survives any number of them in a row. */
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/([{}])/g, '\\$1')
    .replace(/\[\[/g, '\\[[');
}
/* Splitting a text into wrap units, and remembering which of them were
   written with no space between.
 *
 * Every unit used to start a fresh word, so the layout put an inter-word
 * space in front of each one. For a citation written flush against the
 * word it cites — "Uprising{{r:bw}}", which is how a citation is always
 * written — that produced "Uprising [1]", floating the mark away from the
 * thing it belongs to. Same for a sticker mid-word.
 *
 * `glue` says "no space before this one". It already existed for the
 * character-split fallback; here it is set from the source text, so the
 * rendered spacing matches what was typed. */
function expandForWrap(tokens){
  const words = [];
  let glue = false;   // the next unit continues the previous one
  /* A break that has not landed on a word yet.
   *
   * `br` is carried on the FIRST word after the newline, and until this it
   * was a per-token local — so a break that fell at the end of a run, or
   * between two runs, was set on a token that then pushed no more words
   * and was thrown away with it. `one\ntwo` broke; `one\n**two**` did not,
   * and neither did a line beginning with a colour, a sticker or a
   * citation. The editor showed two lines and the chart drew one. */
  let brk = false;
  const push = w=>{
    words.push(Object.assign(w, {glue: glue && words.length > 0, br: brk}));
    brk = false;
    glue = true;
  };
  tokens.forEach(tok=>{
    /* A ruby unit, a sticker and a reference mark are each one indivisible
       wrap unit. A reference in particular must never break: "[" at the end
       of one line and "12]" at the start of the next would read as two
       different things. */
    if(tok.type==='ruby' || tok.type==='sticker' || tok.type==='ref'){
      push(Object.assign({}, tok));
      return;
    }
    /* A newline is a line break, not a character inside a word.
     *
     * Pressing Enter in the editor writes one, and the field showed the
     * break — but the chart did not: the text was split on spaces only, so
     * "one\ntwo" stayed one wide unbreakable word that the wrapper then
     * pushed around trying to fit. The break is carried on the first word
     * after it and honoured where the lines are actually assembled. */
    const text = tok.text || '';
    text.split('\n').forEach((chunk, ci)=>{
      if(ci > 0){ brk = true; glue = false; }
      chunk.split(' ').forEach((w, i)=>{
        // An empty fragment IS the space: it breaks the glue and draws nothing.
        if(w === ''){ glue = false; return; }
        if(i > 0) glue = false;
        // Everything the run carries travels with each of its words: a word
        // can be bold AND coloured AND set at its own size at once.
        push(Object.assign({}, tok, {text:w}));
      });
    });
  });
  return words;
}
// A sticker occupies about two characters' worth of the character-count
// wrap pass; the pixel pass below measures it exactly.
function wordLen(w){
  if(w.type==='sticker') return 2;
  if(w.type==='ref') return refMarkText(w.key).length;
  return w.type==='ruby' ? w.base.length : w.text.length;
}
/* What a reference mark reads as. A key with no reference behind it still
   draws something — "[?]" — rather than vanishing: a dangling mark is a
   mistake the author should be able to see and fix, and silently dropping
   it would hide the very thing that needs attention. */
/* A citation is a mark, not a word: it should read as a superscript beside
   the text rather than as a second, slightly smaller word standing in it.
   At 0.72 of the body it was still large enough to compete with what it
   cites — on an entry's own label, where the type is already small, a
   bracketed number took as much room as a syllable. */
const REF_FS_SCALE = 0.56;   // marks are set smaller than the text they cite
const REF_RISE = 0.38;       // ...and raised by this much of the body size
function refIndex(key){
  for(let i=0;i<REFS.length;i++) if(REFS[i].key === key) return i;
  return -1;
}
/* One colour for every citation on the chart.
 *
 * It used to be per-reference, which made the marks a rainbow: the number
 * in a sentence is a citation FIRST and a particular source second, and
 * having each one a different colour said the opposite. It is a chart-wide
 * setting now, and lives in SETTINGS with the other chart-wide choices. */
const DEFAULT_REF_COLOR = '#c23b22';
function refColor(){
  return (SETTINGS && SETTINGS.refColor) || DEFAULT_REF_COLOR;
}
function refMarkText(key){
  const i = refIndex(key);
  return i < 0 ? '[?]' : '[' + (i+1) + ']';
}
// A sticker draws as a square a little taller than the text it sits in,
// so it reads as a glyph rather than as an illustration.
/* A sticker stands in a sentence as a letter does, so it is set to the
   height of a CAPITAL of the text around it. It used to be one and a half
   times the type size — taller than any letter in the line, so a sticker
   dropped into a label pushed the whole line apart to make room for
   itself. The cap height of the faces used here is about seven tenths of
   the size; a hair over that keeps a square picture reading as the same
   weight as a capital rather than slightly lighter. */
const STICKER_CAP = 0.78;
function stickerBox(fontSize){ return (fontSize || NODE_FS) * STICKER_CAP; }
// Real rendered width of one wrapped line's word list, including the
// inter-word spaces (glued fragments sit flush, so they contribute none) —
// the same arithmetic layoutLine uses to place them.
/* How wide a reading's half comes out, set the way it will be drawn: each
   of its runs measured in its own face, weight and size. */
function runsWidth(runs, fallback, family){
  return (runs || []).reduce((w, t)=>{
    if(t.type !== 'plain') return w + 0;
    return w + measureText(t.text, {bold: !!t.bold, italic: !!t.italic,
      fontSize: t.size || fallback,
      family: t.font ? fontFamilyFor(t.font) : family});
  }, 0);
}
function lineWidth(words, fontOpts){
  const fontSize = (fontOpts && fontOpts.fontSize) || undefined;
  const family = (fontOpts && fontOpts.family) || undefined;
  const SPACE_W = measureText(' ', {fontSize, family}) || 3;
  let total = 0;
  words.forEach((w,i)=>{
    if(i>0 && !w.glue) total += SPACE_W;
    total += w.type==='sticker' ? stickerBox(w.size || fontSize)
      : w.type==='ruby'
      ? runsWidth(w.baseRuns, w.size || fontSize, family)
      : w.type==='ref'
      ? measureText(refMarkText(w.key), {fontSize:(w.size || fontSize || NODE_FS)*REF_FS_SCALE, family})
      : measureText(w.text, {bold: !!w.bold, italic: !!w.italic,
                             fontSize: w.size || fontSize,
                             family: w.font ? fontFamilyFor(w.font) : family});
  });
  return total;
}
// `fit`, when given as {maxWidth, fontSize, family}, adds a second wrap
// pass measured in real pixels. The primary pass counts characters, which
// is right for Latin text and is what every label on this chart has always
// used — but a character count assumes every glyph is about one Latin
// character wide, and full-width scripts (CJK, Hangul) are roughly double
// that, so a "24-character" line of Japanese ran well past the node's
// border. The measured pass only ever splits a line further, so labels
// that already fit keep byte-for-byte the layout they had before.
function wrapLabel(label, maxChars, fit){
  let words = expandForWrap(tokenizeLabel(label));
  /* A label written on ONE line stays on one line.
   *
     Wrapping is for text the author laid out as a paragraph; a name typed
     straight across is a name, and breaking it in half at whatever
     character the box happened to end on read as a mistake in the chart
     rather than a fact about the entry. So a single-line text is never
     broken by the measurer: the box widens to hold it, and past the width
     a box is allowed to reach the text is simply clipped at the border —
     the same bargain a spreadsheet cell makes. Breaks the author typed
     still break, because those ARE the author's layout. */
  const noWrap = !!(fit && fit.noWrap);
  // A "word" that could never fit on a line by itself (nothing to break on
  // — CJK/Hangul running text has no spaces, or it's simply one long
  // unbroken run) gets split into individual characters, glued together
  // with no inter-character space, so it wraps like everything else
  // instead of silently overflowing the node's boundary.
  words = words.flatMap(w=>{
    if(noWrap) return [w];
    if(w.type==='ruby' || w.type==='sticker' || w.type==='ref' || wordLen(w) <= maxChars) return [w];
    // The first character keeps whatever glue the whole word had, or the
    // split would reintroduce the space this word was written without.
    return Array.from(w.text).map((ch,i)=>
      Object.assign({}, w, {text:ch, glue: i>0 || !!w.glue}));
  });
  let lines = [];
  let cur = [], curLen = 0;
  words.forEach(w=>{
    // A break the author typed wins over anything the measuring says.
    if(w.br && cur.length){ lines.push(cur); cur = []; curLen = 0; }
    const len = wordLen(w);
    const gap = (cur.length && !w.glue) ? 1 : 0;
    const testLen = curLen + gap + len;
    if(!noWrap && testLen > maxChars && cur.length){
      lines.push(cur); cur = [w]; curLen = len;
    } else {
      cur.push(w); curLen = testLen;
    }
  });
  if(cur.length) lines.push(cur);

  if(fit && fit.maxWidth > 0 && !noWrap){
    const fontOpts = {fontSize: fit.fontSize, family: fit.family};
    const refit = [];
    lines.forEach(lineWords=>{
      if(lineWidth(lineWords, fontOpts) <= fit.maxWidth){ refit.push(lineWords); return; }
      let acc = [];
      lineWords.forEach(w=>{
        const test = acc.concat([w]);
        if(acc.length && lineWidth(test, fontOpts) > fit.maxWidth){
          refit.push(acc); acc = [w];
        } else {
          acc = test;
        }
      });
      if(acc.length) refit.push(acc);
    });
    lines = refit;
  }
  return lines.map(words=>({
    words,
    hasRuby: words.some(w=>w.type==='ruby'),
    hasSticker: words.some(w=>w.type==='sticker')
  }));
}
function stripMarkup(label){
  return tokenizeLabel(label).map(t=>{
    if(t.type==='ruby') return t.base;
    if(t.type==='sticker') return '';
    return t.text;
  }).join('');
}
/* A link on an entry becomes a real <a href>, and a chart can now arrive
   from a file someone else wrote — so the two are no longer independent.
   "javascript:" and "data:" hrefs both execute on click, which would turn
   opening a shared chart into running its author's code. Only the schemes
   that merely navigate are allowed through; anything else renders as no
   link at all rather than as a link that quietly does something else.
   Protocol-relative and relative URLs resolve against this page, which is
   why they are resolved here rather than pattern-matched. */
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'ftp:']);
function safeUrl(raw){
  if(typeof raw !== 'string') return null;
  const t = raw.trim();
  if(!t) return null;
  let u;
  try{ u = new URL(t, location.href); }
  catch(e){ return null; }
  return SAFE_URL_SCHEMES.has(u.protocol) ? u.href : null;
}
/* Text going into HTML — including into an ATTRIBUTE, which is why the
   quotes are here. Chart data is not all typed by the person looking at
   it: a file brought in from somewhere else carries whatever it carries,
   and a reference title or a sticker name holding a `"` would otherwise
   close the attribute it was written into and let the rest of the value
   be read as markup. */
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ---------------------------------------------------------------------
   The sticker library.

   A sticker is a small square picture that can be dropped into any text on
   the chart the way an emoji can — inside an entry's label, a note, a
   language tab, a loose text block. The library itself is a flat list of
   {key, name, src}; a text refers to one by key, so the same picture used
   in twenty places is stored once.
   ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Embedded media.

   A comment on an entry is a piece of prose, and prose that describes a
   reality wants to be able to SHOW it — a frame from the episode, a clip
   of the scene. So a comment may carry figures the way a document does:
   they stand in the flow of the text, on lines of their own, at whatever
   width the column gives them.

   The store is a flat list of {key, name, kind, src}, exactly like the
   sticker library, and a comment refers to one by key — so the same
   picture used in three comments is stored once. `src` is normally an
   embedded data: URI, which is what keeps the chart a single file that
   needs nothing from the network; a link is allowed too, for a clip too
   large to embed, and then the chart needs the network to show it.

   Figures are for the COMMENT, not for the chart's own drawing: an entry's
   box holds a name, and a video cannot be drawn into SVG text. So the
   token is parsed everywhere and rendered only where there is a document
   to put it in — see tokenizeLabel, which drops it for every other reader.
   ------------------------------------------------------------------ */
const MEDIA_KINDS = new Set(['image', 'video']);
function sanitizeMedia(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(m=>{
    if(!m || typeof m !== 'object') return;
    const key = typeof m.key === 'string' ? m.key.trim() : '';
    if(!key || !/^[A-Za-z0-9_-]+$/.test(key) || seen.has(key)) return;
    const src = typeof m.src === 'string' ? m.src.trim() : '';
    if(!mediaSrcOk(src)) return;
    seen.add(key);
    out.push({key, name: typeof m.name === 'string' ? m.name : key,
              kind: MEDIA_KINDS.has(m.kind) ? m.kind : 'image', src});
  });
  return out;
}
/* A figure is either carried in the file or fetched from the web, and
   nothing else. `data:` is how an embedded one travels; http(s) is how a
   linked one is reached. Everything else — javascript:, blob:, a bare
   file path — is refused, for the same reason an entry's link is: a chart
   can arrive from someone else, and opening it must not run their code. */
function mediaSrcOk(src){
  if(typeof src !== 'string' || !src) return false;
  /* An embedded one, header and all. Split on the marker rather than
     matched in one pattern: a real media type can carry parameters, and a
     browser's own recorder writes `;codecs=vp9,opus` — a comma inside the
     header, which no single expression reads without also swallowing the
     payload. What matters is what stands before `;base64,`. */
  const at = src.indexOf(';base64,');
  if(at > 5 && src.slice(0, 5).toLowerCase() === 'data:'){
    return /^(image|video)\/[a-z0-9.+-]+/i.test(src.slice(5, at));
  }
  return !!safeUrl(src) && /^https?:/i.test(safeUrl(src));
}
const mediaMap = new Map();
function rebuildMediaMap(){
  mediaMap.clear();
  (typeof MEDIA !== 'undefined' ? MEDIA : []).forEach(m=>{
    if(m && m.key && m.src) mediaMap.set(m.key, m);
  });
}
rebuildMediaMap();
function mediaOf(key){ return mediaMap.get(key) || null; }
function uniqueMediaKey(base){
  let k = String(base || 'fig').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '').slice(0, 24) || 'fig';
  if(!mediaMap.has(k)) return k;
  let i = 2;
  while(mediaMap.has(k + '-' + i)) i++;
  return k + '-' + i;
}
/* One figure as HTML. It is contenteditable="false" so the caret steps
   over the whole thing rather than into it, and it carries its key so the
   writer can read it back out — the same contract a citation chip keeps. */
/* A figure's width, as a percentage of the column. Bounded at both ends:
   below a tenth it is a smudge nobody can see and cannot be grabbed to be
   made bigger again, and past the column there is nothing to gain. */
const FIGURE_MIN_W = 10;
function clampFigureWidth(v){
  const n = Math.round(Number(v));
  if(!Number.isFinite(n)) return null;
  return Math.max(FIGURE_MIN_W, Math.min(100, n));
}
function mediaFigureHtml(key, width){
  const m = mediaOf(key);
  if(!m){
    return `<span class="media-missing" data-media="${escapeHtml(key)}" contenteditable="false"` +
           ` title="This figure is no longer in the chart">\u25a2 figure</span>`;
  }
  const cap = escapeHtml(m.name || key);
  const inner = m.kind === 'video'
    ? `<video src="${escapeHtml(m.src)}" controls preload="metadata" playsinline></video>`
    : `<img src="${escapeHtml(m.src)}" alt="${cap}">`;
  const w = clampFigureWidth(width);
  /* The width is written on the element AND kept on a data attribute. The
     style is what the reader sees; the attribute is what the writer reads
     back, and reading a percentage back out of a style string is exactly
     the kind of round trip that loses a figure's size the first time a
     browser normalises it. */
  const sized = w ? ` data-w="${w}" style="width:${w}%"` : '';
  return `<span class="rich-figure" data-media="${escapeHtml(key)}"${sized} contenteditable="false"` +
         ` title="${cap}">${inner}<i class="fig-grip"></i></span>`;
}
const stickerMap = new Map();
function rebuildStickerMap(){
  stickerMap.clear();
  (typeof STICKERS !== 'undefined' ? STICKERS : []).forEach(s=>{
    if(s && s.key && s.src) stickerMap.set(s.key, s);
  });
}
rebuildStickerMap();
function stickerSrc(key){ const s = stickerMap.get(key); return s ? s.src : null; }
function stickerName(key){ const s = stickerMap.get(key); return s ? (s.name || key) : key; }
function stickerImgHtml(key){
  const src = stickerSrc(key);
  /* A sticker whose picture has been removed still carries its key. The
     placeholder used to be a bare span, so the editor could not tell it
     from a typed character: opening the entry and touching one key wrote
     the placeholder back as the literal ▢ and the citation was gone for
     good — even though deleting a sticker deliberately leaves the token
     behind so re-adding the picture brings it back. */
  if(!src) return `<span class="sticker-missing-inline" data-sticker="${escapeHtml(key)}" title="This sticker is no longer in the library">▢</span>`;
  return `<img class="sticker-inline" data-sticker="${escapeHtml(key)}" src="${escapeHtml(src)}" alt="${escapeHtml(stickerName(key))}">`;
}
/* A citation inside an editing surface is one atomic chip: contenteditable
   false, so the caret steps over it whole and a stray keystroke cannot
   leave "[1" behind. It shows the CURRENT number but carries the key, and
   only the key is read back out — see richHtmlToMarkup. */
function refChipHtml(key){
  const c = refColor();
  const style = c ? ` style="color:${escapeHtml(c)}"` : '';
  return `<span class="ref-chip" data-ref="${escapeHtml(key)}" contenteditable="false"${style} title="${escapeHtml(refTitle(key))}">${escapeHtml(refMarkText(key))}</span>`;
}
function refTitle(key){
  const i = refIndex(key);
  if(i < 0) return 'This reference no longer exists';
  return refBodyText(REFS[i]) || `Reference [${i+1}]`;
}
/* One run list as editor HTML. inlineToHtml is this, applied to a whole
   label; a reading's two halves go through it as well, which is what makes
   what is typed inside a reading look like what will be drawn. */
/* What a reading's half adds to the run it sits in.
 *
 * Both halves inherit that run — a reading inside a bold phrase is bold —
 * and the wrappers around the whole unit already say so. Writing the
 * inherited part again inside them said it twice, and every trip through
 * the editor wrapped it once more: `[[base|anno]]` in a bold phrase came
 * back as `[[**base**|**anno**]]`, then `[[****base****|…]]`, growing
 * without limit for as long as the label was edited. */
function rubyHalfRuns(unit, runs){
  const OWN = ['bold','italic','color','font','size','under','strike'];
  return (runs || []).map(rt=>{
    const c = Object.assign({}, rt);
    OWN.forEach(k=>{ if(unit[k] !== undefined && c[k] === unit[k]) delete c[k]; });
    return c;
  });
}
function runsToHtml(runs){
  return (runs || []).map(runToHtml).join('');
}
/* HTML is the one place a figure can actually be shown, so this is the one
   reader that asks for them. */
function inlineToHtml(label){
  return runsToHtml(tokenizeLabel(label, {media:true}));
}
function runToHtml(t){
  {
    /* Everything the run carries, wrapped from the outside in. A sticker
       and a citation are pictures rather than text, so bold, italic and
       colour are made inert on them by the stylesheet — but the SIZE
       wrapper still has to reach them, because both are drawn in `em` and
       that wrapper is how either of them is enlarged. */
    const inner =
      t.type === 'ref' ? refChipHtml(t.key) :
      t.type === 'media' ? mediaFigureHtml(t.key, t.w) :
      t.type === 'sticker' ? stickerImgHtml(t.key) :
      t.type === 'ruby'
        ? `<ruby>${runsToHtml(rubyHalfRuns(t, t.baseRuns))}` +
          `<rt>${runsToHtml(rubyHalfRuns(t, t.annoRuns))}</rt></ruby>` :
      escapeHtml(t.text);
    /* A figure takes no run dressing at all. Bold, a colour or a face on
       a paragraph says nothing about a picture inside it, and a size
       wrapper — which is how a sticker is enlarged — would fight the
       column width the figure is already sized to. */
    if(t.type === 'media') return inner;
    if(t.type === 'ref' || t.type === 'sticker'){
      return t.size
        ? `<span style="font-size:${t.size}px" data-size="${t.size}">${inner}</span>`
        : inner;
    }
    let html = inner;
    if(t.under || t.strike){
      const lines = [t.under ? 'underline' : '', t.strike ? 'line-through' : ''].filter(Boolean);
      const key = t.under || t.strike;
      const css = (LINE_STYLES[key] || LINE_STYLES.solid).css;
      html = `<span style="text-decoration-line:${lines.join(' ')};text-decoration-style:${css}"` +
             `${t.under ? ` data-under="${escapeHtml(t.under)}"` : ''}` +
             `${t.strike ? ` data-strike="${escapeHtml(t.strike)}"` : ''}>${html}</span>`;
    }
    if(t.italic) html = `<i>${html}</i>`;
    if(t.bold) html = `<b>${html}</b>`;
    if(t.size) html = `<span style="font-size:${t.size}px" data-size="${t.size}">${html}</span>`;
    if(t.font) html = `<span style="font-family:${escapeHtml(fontFamilyFor(t.font))}" data-font="${escapeHtml(t.font)}">${html}</span>`;
    if(t.color) html = `<span style="color:${escapeHtml(t.color)}">${html}</span>`;
    return html;
  }
}

/* ---------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------ */
const svg = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  if(parent) parent.appendChild(e);
  return e;
}

// Off-canvas <text> reused to get real, per-font/weight/style advance
// widths for node label layout (so bold/italic runs and ruby annotations
// line up on their actual rendered width, not a guessed character count).
/* LINE_H is the distance from one baseline to the next. At 15 against
   11.5pt type it was a third again as tall as the type, which is right for
   a paragraph of prose and far too airy for a two-word label in a box —
   the box was mostly the gap between its own lines. 12.8 is a little over
   1.1, which is as close as lines of this size go before the descenders of
   one row start meeting the ascenders of the next.
   RUBY_EXTRA is what a line carrying a reading adds on top, and it is
   untouched: the annotation needs its own storey whatever the leading is,
   and closing the lines up must not take it away. */
const NODE_FS = 11.5, RUBY_FS = 7.5, LINE_H = 12.8, RUBY_GAP = 8, RUBY_EXTRA = 9;
/* The annotation over a ruby unit is set against the size of the run the
   unit sits in, not against the entry's own size — a phrase set bigger
   takes its readings up with it. */
const RUBY_SCALE = RUBY_FS / NODE_FS;
const RUBY_RISE  = RUBY_GAP / NODE_FS;
/* Every look a run can carry, written onto one tspan. Bold, italic, face
   and colour are independent — a word can be all of them at once — and
   face and colour have to share a single style attribute, because the
   `.node text{}` rule sets a fill and a family of its own and a
   presentation attribute loses to a stylesheet. Assigning them one at a
   time through `.style` let the browser rewrite the colour into `rgb(…)`,
   so the value that came back out was no longer the value that went in. */
function applyRunStyle(t, w, skipSize){
  if(w.bold) t.setAttribute('font-weight','700');
  if(w.italic) t.setAttribute('font-style','italic');
  if(!skipSize && w.size) t.setAttribute('font-size', w.size);
  const bits = [];
  if(w.font) bits.push('font-family:' + fontFamilyFor(w.font));
  if(w.color) bits.push('fill:' + w.color);
  /* A rule under the words or through them. Both lines at once is a
     legitimate thing to ask for, so they are written as one declaration —
     `text-decoration-line` takes them together — and the style follows the
     UNDERLINE when the two disagree, since a browser paints one style for
     the whole element and the underline is the one being read along. */
  /* The UNDERLINE is not one of them any more.
   *
   * Chrome breaks an underline around every descender — "skip ink", which
   * is right for a paragraph of prose and wrong at this size, where the
   * pieces left between two y's are a few pixels long and read as a full
   * stop after each letter. On HTML that is one property away; on SVG text
   * the property, its -webkit- spelling, the presentation attribute and
   * text-underline-offset are all ignored, so the only way to draw a rule
   * that actually runs under the words is to draw it. See paintUnderlines,
   * which finds these runs once the text has been laid out.
   *
   * A line THROUGH the words stays a decoration: it crosses the letters at
   * mid-height, where there is no ink to skip, and it is drawn correctly
   * as it is. */
  if(w.strike){
    bits.push('text-decoration-line:line-through');
    bits.push('text-decoration-style:' + ((LINE_STYLES[w.strike] || LINE_STYLES.solid).css));
    if(w.color) bits.push('text-decoration-color:' + w.color);
  }
  if(w.under){
    t.setAttribute('data-ul', w.under);
    if(w.color) t.setAttribute('data-ul-color', w.color);
  }
  if(bits.length) t.setAttribute('style', bits.join(';') + ';');
}

// A small curated set of free Google Fonts a node's text can opt into
// (loaded via the <link> tag in <head>). Key is what's stored in a node's
// opts.font; value is the CSS font-family stack applied via inline style
// (a plain font-family attribute loses to the .node text{} stylesheet
// rule, so callers must set it as `style="font-family:...;"`, not as an
// attribute).
const FONT_OPTIONS = [
  { key:'arial',     label:'Arial (default)',         family:"Arial, Helvetica, sans-serif" },
  { key:'times',     label:'Times New Roman',          family:"'Times New Roman', Times, serif" },
  { key:'plex',      label:'IBM Plex Sans',            family:"'IBM Plex Sans', sans-serif" },
  { key:'serif',     label:'Merriweather (serif)',     family:"'Merriweather', serif" },
  { key:'grotesk',   label:'Space Grotesk (modern)',   family:"'Space Grotesk', sans-serif" },
  { key:'orbitron',  label:'Orbitron (sci-fi)',         family:"'Orbitron', sans-serif" },
  { key:'hand',      label:'Caveat (handwritten)',      family:"'Caveat', cursive" },
  // Embedded as a data: URI in the @font-face block up top, not fetched
  // from a font host — see the note there.
  { key:'autobot',   label:'Autobot Characters',        family:"'Autobot Characters', 'IBM Plex Sans', sans-serif" },
];
function fontFamilyFor(key){
  const opt = FONT_OPTIONS.find(f=>f.key===key);
  return opt ? opt.family : FONT_OPTIONS[0].family;
}

const measureEl = el('text',{x:-9999,y:-9999,visibility:'hidden',
  'font-family':"'IBM Plex Sans',sans-serif"}, svg);
/* A whole BLOCK of text, laid out off-canvas exactly as it will be drawn,
   so its real ink can be measured — every line, every run in its own face
   and size, the annotations over its readings and the stickers among its
   words included. A width taken glyph by glyph cannot answer how far the
   tallest character reaches above the line or the lowest tail below it,
   and those are exactly what the border has to clear. */
const measureBlockG = el('g', {visibility:'hidden'}, svg);
/* The measuring text draws no underlines.
 *
 * They are separate elements laid out beside the text, and this group is
 * measured with getBBox — so a rule under a word would have been counted
 * as part of the block and every underlined entry would have come out a
 * pixel or two taller than the words in it actually are. */
const measureBlockText = el('text', {x:0, y:0, 'data-no-rules':'1'}, measureBlockG);
/* Measured text widths, remembered.

   Every width on this chart comes from putting the string into a hidden
   <text> and asking the browser how wide it came out. That is the only way
   to get a true answer — it accounts for the actual font, its kerning and
   whatever fallback face is really in use — but each call forces the
   browser to lay the element out, and laying out synchronously in a loop
   is the classic way to make a page crawl.

   One render of a 120-entry chart asked 3,360 times and asked about only
   124 DIFFERENT strings: the same labels, the same single space between
   words, the same font at the same size, over and over, because the width
   search steps a candidate box up in tens and re-measures every word at
   every width. Remembering the answers turns almost all of that into a map
   lookup.

   The cache is dropped wholesale once it grows past a sane size rather
   than evicted one entry at a time. Entries go stale in only one way — the
   web fonts finishing loading, which changes every width at once — and
   that is handled by clearing it when they land, below. */
const measureCache = new Map();
const MEASURE_CACHE_MAX = 6000;
function measureText(text, {bold, italic, fontSize, family}={}){
  const size = fontSize || NODE_FS;
  const face = family || "'IBM Plex Sans',sans-serif";
  const key = text + '\u0000' + (bold?1:0) + (italic?1:0) + size + '\u0000' + face;
  const hit = measureCache.get(key);
  if(hit !== undefined) return hit;
  measureEl.setAttribute('font-size', size);
  measureEl.setAttribute('font-weight', bold ? '700' : '500');
  measureEl.setAttribute('font-style', italic ? 'italic' : 'normal');
  measureEl.setAttribute('font-family', face);
  measureEl.textContent = text;
  const w = measureEl.getComputedTextLength() || text.length*6.5;
  if(measureCache.size >= MEASURE_CACHE_MAX) measureCache.clear();
  measureCache.set(key, w);
  return w;
}
/* Widths measured before a web font arrives are the fallback face's, not
   the real one's. When the fonts land every remembered width is wrong at
   once, so the cache is emptied and the chart redrawn — otherwise entries
   would keep their first-paint sizes for the rest of the session. */
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{
    measureCache.clear();
    if(typeof rebuildChart === 'function' && nodes && nodes.size) rebuildChart();
  }).catch(()=>{});
}
// Lays out one wrapped line's word-tokens into `textEl`, centered on
// centerX, with each word placed at its real measured width so a ruby
// annotation can be centered exactly over its base word.
function layoutLine(textEl, words, centerX, baselineY, fontOpts){
  const fontSize = (fontOpts && fontOpts.fontSize) || undefined;
  const family = (fontOpts && fontOpts.family) || undefined;
  const SPACE_W = measureText(' ', {fontSize, family}) || 3;
  // A sticker and a citation are set at the size of the run they sit in,
  // so making a phrase bigger takes them with it.
  const widths = words.map(w => w.type==='sticker' ? stickerBox(w.size || fontSize)
    : w.type==='ruby'
    ? runsWidth(w.baseRuns, w.size || fontSize, family)
    : w.type==='ref'
    ? measureText(refMarkText(w.key), {fontSize:(w.size || fontSize || NODE_FS)*REF_FS_SCALE, family})
    : measureText(w.text, {bold: !!w.bold, italic: !!w.italic,
                           fontSize: w.size || fontSize,
                           family: w.font ? fontFamilyFor(w.font) : family}));
  // Glued word-fragments (the character-split CJK/long-run fallback in
  // wrapLabel) sit flush against the previous fragment — no inter-word gap
  // before them, unlike an ordinary word boundary.
  const gaps = words.map((w,i)=> (i===0 || w.glue) ? 0 : SPACE_W);
  const lineWidth = widths.reduce((a,b)=>a+b,0) + gaps.reduce((a,b)=>a+b,0);
  let cursorX = centerX - lineWidth/2;
  words.forEach((w,i)=>{
    cursorX += gaps[i];
    const width = widths[i];
    if(w.type==='sticker'){
      /* An <image> can't live inside <text>, so it is drawn as a sibling
         at the spot the text layout reserved for it — the wrap and width
         maths above already treated it as a glyph, so it lands in the run
         of words rather than on top of them. */
      const src = stickerSrc(w.key);
      const box = width;         // measured at this run's own size above
      const holder = textEl.parentNode;
      if(src && holder){
        const img = el('image', {
          x: cursorX, y: baselineY - box*0.8, width: box, height: box,
          class: 'sticker-glyph', preserveAspectRatio: 'xMidYMid meet'
        }, holder);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
        img.setAttribute('href', src);
      } else if(holder){
        // A sticker whose picture is gone leaves a quiet placeholder
        // rather than a hole in the sentence.
        el('rect', {x:cursorX, y:baselineY - box*0.8, width:box, height:box,
                    rx:3, class:'sticker-missing'}, holder);
      }
    } else if(w.type==='ref'){
      /* The mark, and ONLY the mark, is clickable.
       *
       * Text on this chart is inert by design — a label is dragged, not
       * pressed — so pointer-events are off for the <text> as a whole and
       * turned back on for this one tspan. That is what keeps "click the
       * little number" from becoming "click anywhere in the sentence",
       * which would collide with dragging the entry the text belongs to.
       *
       * It is set smaller and raised off the baseline, and given a low
       * opacity in the stylesheet, so a sentence carrying four citations
       * still reads as a sentence. */
      // Sized and raised against the run it sits in, so a citation in a
      // phrase set larger grows with the phrase.
      const own = w.size || fontSize || NODE_FS;
      const size = own * REF_FS_SCALE;
      const t = el('tspan', {
        x: cursorX, y: baselineY - own * REF_RISE,
        'font-size': size.toFixed(2), class: 'ref-mark', 'data-ref': w.key
      }, textEl);
      /* Its own colour, set inline so the surrounding text's colour cannot
         reach it — a citation belongs to the reference, not to the
         sentence it sits in. */
      const rc = refColor();
      if(rc) t.setAttribute('style', `fill:${rc};`);
      t.textContent = refMarkText(w.key);
      if(refIndex(w.key) < 0) t.classList.add('ref-missing');
    } else if(w.type==='ruby'){
      /* A reading is two rows of runs, not two strings.
       *
         The base sits on the line and the annotation is centred over it,
         and each of them is laid out run by run — so an annotation can be
         coloured, emboldened or set in another face without the word
         underneath it changing, and the other way round. Both start from
         the look of the run the whole unit sits in, which is what keeps a
         reading inside a bold phrase bold unless it is told otherwise. */
      const own = w.size || fontSize || NODE_FS;
      const drawRow = (runs, startX, y, scale, cls)=>{
        let cx2 = startX;
        (runs || []).forEach(t=>{
          if(t.type !== 'plain') return;
          const size = (t.size || own) * scale;
          const tw = measureText(t.text, {bold: !!t.bold, italic: !!t.italic,
            fontSize: t.size || own,
            family: t.font ? fontFamilyFor(t.font) : family}) * scale;
          const el2 = el('tspan', {x: cx2.toFixed(2), y: y.toFixed(2)}, textEl);
          if(cls) el2.setAttribute('class', cls);
          applyRunStyle(el2, t, true);
          el2.setAttribute('font-size', size.toFixed(2));
          el2.textContent = t.text;
          cx2 += tw;
        });
      };
      drawRow(w.baseRuns, cursorX, baselineY, 1, null);
      const annoW = runsWidth(w.annoRuns, own, family) * RUBY_SCALE;
      drawRow(w.annoRuns, cursorX + width/2 - annoW/2,
              baselineY - own*RUBY_RISE, RUBY_SCALE, 'ruby-anno');
    } else {
      const t = el('tspan',{x:cursorX, y:baselineY}, textEl);
      applyRunStyle(t, w);
      t.textContent = w.text;
    }
    cursorX += width;
  });
}

// background/edge/node layers (no per-continuity labels anymore — tags
// are shown per-node in the legend/filter UI instead, see below)
const bgLayer = el('g',{id:'bgLayer'}, viewport);
// Free-standing images sent behind the arrows land here, between the grid
// and the connectors.
// The fan-fiction weave sits under everything, including the connectors.
const fanLayer = el('g',{id:'fanLayer', style:'pointer-events:none;'}, bgLayer);
/* Scenery that belongs to an entry but is not the entry: a multiversal
   hub's echo rings, a local multiverse's stack of sheets behind its front
   face. It lives BELOW the connectors, because a connector heading for the
   front face has to cross it — drawn with the entry, the sheets tinted
   every line that passed under them and the arrow looked as though it had
   stopped at the back of the stack rather than reaching the front. */
const auraLayer = el('g',{id:'auraLayer', style:'pointer-events:none;'}, bgLayer);
const backLayer = el('g',{id:'backLayer'}, viewport);
const edgeLayer = el('g',{id:'edgeLayer'}, viewport);
/* The handles on the callout anchors, and nothing else.
 *
 * They were drawn with their own leaders, inside edgeLayer — where every
 * connector ALSO lays down a wide invisible path to be clickable by, and
 * the ones routed after the leader covered its dot completely: the handle
 * was there, the cursor changed nowhere, and the anchor could not be
 * picked up at all. A layer of its own, above every connector and below
 * every entry, is the only arrangement in which the order the edges
 * happen to be drawn in cannot decide whether a handle works. */
const leaderHitLayer = el('g',{id:'leaderHitLayer'}, viewport);
const nodeLayer = el('g',{id:'nodeLayer'}, viewport);
/* Arrowheads live ABOVE the entries, not with their own lines. A connector
   stops at the outermost border of the entry it points into, so on an
   entry with a second or third border ring the tip would otherwise be
   buried under those rings and the arrow would look like it stopped short.
   Drawn here, the head lands on top of the border it is pointing at. */
const arrowLayer = el('g',{id:'arrowLayer', style:'pointer-events:none;'}, viewport);
// An image set "in front" goes above even the arrowheads — that is what
// being in front means.
const frontLayer = el('g',{id:'frontLayer'}, viewport);
// Node groups live in two layers now (backdrop images sit under the
// connectors), so every lookup that used to walk nodeLayer walks both.
function qNodes(sel){
  return [...nodeLayer.querySelectorAll(sel),
          ...backLayer.querySelectorAll(sel),
          ...frontLayer.querySelectorAll(sel)];
}
// Connectors live in two layers as well: the lines below the entries, the
// arrowheads and the short caps that reach past a border ring above them.
function qEdges(sel){
  return [...edgeLayer.querySelectorAll(sel), ...arrowLayer.querySelectorAll(sel)];
}
function qNode(sel){
  return nodeLayer.querySelector(sel) || backLayer.querySelector(sel) || frontLayer.querySelector(sel);
}

/* ---------------------------------------------------------------------
   Multi-language text tabs. A node with opts.multiLang + opts.langTabs
   keeps its usual main `label` as the default text, plus a small set of
   alternate texts (e.g. per-language translations) the viewer can switch
   between live, on-canvas, via tiny clickable "symbol" chips tucked into
   the node's top-left corner (the same corner-badge treatment as the
   n.link icon at top-right, just on the other side). Switching is purely
   an in-browser UI toggle (activeLangTab below) — it never touches the
   saved node data or triggers a relayout, so the node's box stays a fixed
   size sized to fit the TALLEST of all its texts (see hasLangTabs in the
   main node-render loop) no matter which text is currently showing.
   ------------------------------------------------------------------ */
const activeLangTab = new Map(); // node id -> 0-based index into n.langTabs, or null for the default/main label
function wrapAndMeasure(text, maxChars, lineH, fontScale, fit){
  const lines = wrapLabel(text, maxChars, fit);
  // A line carrying a sticker needs room for a glyph taller than the text.
  const slots = lines.map(l => lineH + (l.hasRuby ? RUBY_EXTRA*fontScale : 0)
                              + (l.hasSticker ? Math.max(0, stickerBox(NODE_FS*fontScale) - lineH*0.85) : 0));
  const totalH = slots.reduce((a,b)=>a+b,0);
  return { lines, slots, totalH };
}

/* The narrowest box that still holds this node's longest text in at most
   NODE_MAX_LINES lines. Walks up in small steps and measures for real
   rather than estimating from a character count, because a character
   count is exactly what gets glyph widths wrong (see wrapLabel's `fit`).
   Snapped to the grid so hand-placed and auto-sized nodes still line up. */
function autoNodeWidth(texts, fontSize, family, maxLines, maxWidth){
  const lines = maxLines || NODE_MAX_LINES;
  const cap = maxWidth || NODE_MAXW;
  const fontScale = fontSize / NODE_FS;
  const lineH = LINE_H * fontScale;
  for(let w = NODE_MINW; w < cap; w += 10){
    const fit = { maxWidth: w - NODE_PAD_X*2, fontSize, family };
    const chars = Math.max(8, Math.round((w - NODE_PAD_X*2) / (fontSize*0.55)));
    const worst = Math.max(...texts.map(t=> wrapAndMeasure(t, chars, lineH, fontScale, fit).lines.length));
    if(worst <= lines) return w;
  }
  return cap;
}
/* How much room a block of text actually takes, measured rather than
   estimated.
 *
 * The box used to be sized from a line count times a nominal line height
 * plus two round numbers — 16 across, 26 down — which meant the padding
 * was whatever those numbers happened to leave over. On ordinary text that
 * was a lot; on a line carrying a large glyph, an annotation over a
 * reading, or a letter with a descender it could be too little, and the
 * ink ran into the border. Neither is a padding anyone chose.
 *
 * So the text is laid out off-canvas first and its ink box asked for. What
 * comes back already accounts for the ascenders of the tallest run and the
 * tails of the lowest, and the border is then set a fixed small distance
 * outside it. Make a character bigger or give it a descender and the box
 * follows, because the thing being measured has changed. */
function measureTextBlock(text, maxChars, lineH, fontScale, fontOpts, fit){
  while(measureBlockG.firstChild !== measureBlockText && measureBlockG.firstChild){
    measureBlockG.removeChild(measureBlockG.firstChild);
  }
  Array.from(measureBlockG.childNodes).forEach(c=>{
    if(c !== measureBlockText) measureBlockG.removeChild(c);
  });
  /* Set in the same face and size the entry will be drawn in. Without
     this the measuring element inherited the document's own 16px default,
     and every box was sized for text a third larger than the text it was
     going to hold. */
  const fs = (fontOpts && fontOpts.fontSize) || NODE_FS;
  const fam = (fontOpts && fontOpts.family) || "'IBM Plex Sans',sans-serif";
  measureBlockText.setAttribute('font-size', fs);
  measureBlockText.setAttribute('font-weight', '500');
  measureBlockText.style.fontFamily = fam;
  measureBlockText.style.textAnchor = 'start';
  renderNodeText(measureBlockText, text, 0, 0, maxChars, lineH, fontScale, fontOpts, fit);
  let bb;
  try{ bb = measureBlockG.getBBox(); }
  catch(e){ bb = null; }
  if(!bb || !Number.isFinite(bb.width) || !Number.isFinite(bb.height)){
    // No layout available (a detached document, a test harness): fall back
    // to the arithmetic this replaced, so nothing collapses to nothing.
    const m = wrapAndMeasure(text, maxChars, lineH, fontScale, fit);
    return {width: 0, height: m.totalH, mid: 0};
  }
  /* Where the middle of the ink ended up, measured from the point the
     block was laid out on. It is not zero: a line of type has more above
     its baseline than below, and a reading or a tall glyph pulls it
     further off. Handing this back lets the drawing centre the INK on the
     box rather than the line grid, which is what stops a word with a
     descender sitting high in its border. */
  return {width: bb.width, height: bb.height, mid: bb.y + bb.height/2};
}
function textForActive(n, activeIdx){
  if(activeIdx===null || activeIdx===undefined || !n.langTabs) return n.label;
  const t = n.langTabs[activeIdx];
  return t ? t.text : n.label;
}
// (Re)lays out one node's <text> element for whichever text is currently
// active, vertically centered on textAreaCenterY (the center of the
// node's fixed text area, i.e. excluding any reserved symbol-chip strip).
// Reused both for the initial render and for every live tab switch.
function renderNodeText(txtEl, text, textAreaCenterY, centerX, maxChars, lineH, fontScale, fontOpts, fit){
  while(txtEl.firstChild) txtEl.removeChild(txtEl.firstChild);
  const { lines, slots, totalH } = wrapAndMeasure(text, maxChars, lineH, fontScale, fit);
  const centerOffset = (totalH - lineH)/2;
  /* Half the cap height, so the block sits centred on the point it was
     given. It used to be a flat +4, tuned for an entry's 11.5px text — on
     the 8.5px text of a connector's note that pushed the line low in its
     plate, which is what made a comment look badly aligned in its box. */
  const capNudge = ((fontOpts && fontOpts.fontSize) || NODE_FS) * 0.35;
  let baselineY = textAreaCenterY - centerOffset + capNudge;
  lines.forEach((line,i)=>{
    if(i>0){ baselineY += slots[i]; }
    layoutLine(txtEl, line.words, centerX, baselineY, fontOpts);
  });
  paintUnderlines(txtEl);
}
/* Rules under the words, drawn rather than decorated.
 *
 * One line per underlined run, measured off the run itself once it has
 * been laid out — start and end of the glyphs, and the baseline they sit
 * on — so it is exactly as long as the words are and follows them through
 * wrapping, rotation and every font size. The five kinds of line the
 * markup offers are drawn here rather than named to the browser: solid and
 * double as strokes, dashed and dotted through a dash pattern, wavy as a
 * small sine along the run.
 *
 * The lines go in beside the text rather than inside it, because <text>
 * may hold only text — so they are appended to whatever the text itself
 * hangs in, immediately after it. */
function paintUnderlines(txtEl){
  if(!txtEl || txtEl.getAttribute('data-no-rules')) return;
  const host = txtEl.parentNode;
  if(!host) return;
  /* Almost no text on a chart is underlined, and this runs for every piece
     of text on every render — so the cheapest possible question is asked
     first, and a text with no rules in it and none left over from a
     previous pass costs one querySelector that stops at the first match. */
  const runs = [...txtEl.querySelectorAll('tspan[data-ul]')];
  if(!runs.length && !txtEl.dataset.ulKey) return;
  // Whatever an earlier pass over this same text element left behind.
  [...host.querySelectorAll(':scope > .text-underline')].forEach(e=>{
    if(e.dataset.forText === (txtEl.dataset.ulKey || '')) e.remove();
  });
  if(!runs.length) return;
  const key = txtEl.dataset.ulKey || (txtEl.dataset.ulKey = 'ul' + (++underlineSeq));
  runs.forEach(run=>{
    const n = (run.textContent || '').length;
    if(!n) return;
    let a, b, size;
    try{
      a = run.getStartPositionOfChar(0);
      b = run.getEndPositionOfChar(n - 1);
      size = parseFloat(getComputedStyle(run).fontSize) || NODE_FS;
    }catch(e){ return; }
    if(!a || !b || Math.abs(b.x - a.x) < 0.4) return;
    const w = Math.max(0.7, size * 0.055);
    const y = a.y + size * 0.14 + w/2;
    const ink = run.getAttribute('data-ul-color') ||
                getComputedStyle(run).fill || 'currentColor';
    const kind = run.getAttribute('data-ul') || 'solid';
    /* The width goes in an inline STYLE, not an attribute: the rule that
       gives every shape inside an entry its border weight — and the
       thicker one a selected entry gets — would otherwise win over it,
       and a wavy underline would come out as thick as a border. */
    const put = (attrs)=>{
      const e = el(kind === 'wavy' ? 'path' : 'line',
        Object.assign({class:'text-underline', stroke:ink,
                       style:`fill:none;stroke-width:${w.toFixed(2)};`}, attrs), host);
      e.dataset.forText = key;
      return e;
    };
    if(kind === 'wavy'){
      const amp = Math.max(0.6, size * 0.05), step = Math.max(2, size * 0.22);
      let d = `M${a.x.toFixed(2)},${y.toFixed(2)}`;
      for(let x = a.x, k = 0; x < b.x; x += step, k++){
        const nx = Math.min(b.x, x + step);
        d += ` Q${(x + step/2).toFixed(2)},${(y + (k % 2 ? amp : -amp)).toFixed(2)} ${nx.toFixed(2)},${y.toFixed(2)}`;
      }
      put({d});
      return;
    }
    const dash = kind === 'dashed' ? `${(w*3).toFixed(2)} ${(w*2.4).toFixed(2)}`
               : kind === 'dotted' ? `${w.toFixed(2)} ${(w*1.8).toFixed(2)}`
               : null;
    const base = {x1:a.x.toFixed(2), x2:b.x.toFixed(2)};
    const rows = kind === 'double' ? [y, y + w*2.2] : [y];
    rows.forEach(ry=>{
      const attrs = Object.assign({}, base, {y1:ry.toFixed(2), y2:ry.toFixed(2)});
      if(dash) attrs['stroke-dasharray'] = dash;
      if(kind === 'dotted') attrs['stroke-linecap'] = 'round';
      put(attrs);
    });
  });
}
let underlineSeq = 0;

/* ---------------------------------------------------------------------
   Orthogonal (90°) edge routing.
   Picks an exit port (top/bottom/left/right) on each box based on how
   the two boxes actually sit relative to each other — boxes stacked in
   the same column connect top-to-bottom; boxes sitting beside each
   other (same timespan, different branch) connect side-to-side — then
   joins the two ports with axis-aligned segments only.
   ------------------------------------------------------------------ */
const SIDES = ['top','right','bottom','left'];
const OPPOSITE_SIDE = {top:'bottom', bottom:'top', left:'right', right:'left'};
// Unit vector pointing straight out of a node through that side.
const SIDE_NORMAL = {
  top:   {x:0,  y:-1},
  bottom:{x:0,  y: 1},
  left:  {x:-1, y: 0},
  right: {x: 1, y: 0}
};
function sideIsVertical(side){ return side==='top' || side==='bottom'; }

// Picks which side of each box a connector should leave from and arrive at
// when the edge hasn't been given explicit sides by hand.
//
// The rule is simply "whichever axis the two boxes are actually separated
// along". Comparing the two gaps (negative when the boxes overlap on that
// axis) is what makes side-by-side boxes connect side-to-side and stacked
// boxes connect top-to-bottom. The old version could only ever return
// top/bottom for lineage edges, which is why two boxes sitting next to
// each other had their connector climb over the target's roof to reach a
// port on top of it, overlapping the box on the way.
function autoSides(a,b){
  const ax0=a.x, ax1=a.x+a.w, ay0=a.y, ay1=a.y+a.h;
  const bx0=b.x, bx1=b.x+b.w, by0=b.y, by1=b.y+b.h;
  const gapX = Math.max(bx0-ax1, ax0-bx1);   // >0 only when separated horizontally
  const gapY = Math.max(by0-ay1, ay0-by1);   // >0 only when separated vertically

  // Facing sides, when the two boxes are far enough apart on that axis for
  // a connector to live in between.
  if(gapX > gapY && gapX >= MIN_SIDE_GAP){
    return bx0 >= ax1 ? {from:'right', to:'left'} : {from:'left', to:'right'};
  }
  if(gapY >= MIN_SIDE_GAP){
    return (b.y+b.h/2) >= (a.y+a.h/2) ? {from:'bottom', to:'top'} : {from:'top', to:'bottom'};
  }

  // Neither gap can hold a connector — the boxes are side by side almost
  // touching, or stacked almost touching, or overlapping. Squeezing a stub
  // into a gap that small produces a stunted line with its arrowhead
  // jammed against both boxes; the readable answer is to leave the crowded
  // gap alone and wrap around the outside, arriving on the SAME side of
  // the target as it left on the source.
  //
  // The wrap has to go around the axis the boxes are NOT crowded on, or it
  // just runs through the target instead: two boxes side by side wrap over
  // the top or under the bottom, two stacked boxes wrap out to the left or
  // right. Between the two directions, the one whose edges are closest to
  // level wins, since that route has the least climbing to do.
  const overlapX = Math.min(ax1,bx1) - Math.max(ax0,bx0);
  const overlapY = Math.min(ay1,by1) - Math.max(ay0,by0);
  const wrapVertically = overlapY > overlapX;
  if(wrapVertically){
    return Math.abs(ay1-by1) <= Math.abs(ay0-by0)
      ? {from:'bottom', to:'bottom'}
      : {from:'top', to:'top'};
  }
  return Math.abs(ax0-bx0) <= Math.abs(ax1-bx1)
    ? {from:'left', to:'left'}
    : {from:'right', to:'right'};
}

// Where along a side a port sits, given it is index `i` of `count` ports
// sharing that side. Evenly spaced at (i+1)/(count+1) of the side's length,
// so any number of connectors can share a side and they simply pack closer
// together — there's no fixed pool of slots to run out of. A lone connector
// lands at the exact middle, which is what a single arrow has always done.
// The strip of border for one side of one ring: `show` is the thin band
// that lights up, `hit` the wider invisible strip that catches the pointer.
// The hit strip is only a little wider than the visible band. Rings sit 4
// units apart, so a generous strip made the two overlap and the outer one
// always won — picking the inner border became a matter of luck. Narrow
// enough that each ring owns its own space, and the bands are drawn from
// the inside out so the inner one is on top where they still touch.
// The visible band is barely wider than the border it sits on, so lighting
// one up reads as the border brightening rather than as a stripe pasted
// over it. The hit strip stays wider — easy to grab, quiet to look at.
const BAND_W = 2.6, BAND_HIT_DEFAULT = 5;
function sideBandRect(n, h, side, inset, hitW){
  const x = n.x + inset, y = n.y + inset;
  const w = n.w - inset*2, hh = h - inset*2;
  const BAND_HIT = (typeof hitW === 'number' && hitW > 0) ? hitW : BAND_HIT_DEFAULT;
  switch(side){
    case 'top': {
      /* The language chips sit ON the top edge, and they are a control of
         their own — but they are drawn AFTER the handles and therefore lie
         over them, so a pointer on a chip reaches the chip without the
         edge having to give up any of itself.
       *
         It used to give up a great deal: the hit strip started past the
         last chip, so an entry whose chips reached across its width had no
         top edge to drag from at all, and one whose chips were removed
         kept the hole until the whole chart was rebuilt. Both showed up as
         a top edge that lit on hover and started nothing. */
      return {show:{x, y:y-BAND_W/2, width:w, height:BAND_W},
              hit: {x, y:y-BAND_HIT/2, width:w, height:BAND_HIT}};
    }
    case 'bottom': return {show:{x, y:y+hh-BAND_W/2, width:w, height:BAND_W},
                           hit: {x, y:y+hh-BAND_HIT/2, width:w, height:BAND_HIT}};
    case 'left':   return {show:{x:x-BAND_W/2, y, width:BAND_W, height:hh},
                           hit: {x:x-BAND_HIT/2, y, width:BAND_HIT, height:hh}};
    default:       return {show:{x:x+w-BAND_W/2, y, width:BAND_W, height:hh},
                           hit: {x:x+w-BAND_HIT/2, y, width:BAND_HIT, height:hh}};
  }
}

// `ring` insets the port to sit on that border ring rather than the outer
// one, so a connector meets the ring it was drawn from.
/* How far the ripple stands off its baseline at one exact place on a
   pocket reality's border.
 *
 * A rippled border is not a line, it is a band — so "where the border is"
 * has no single answer for the whole side, only one answer per point. Both
 * previous attempts avoided the question and both left something on the
 * paper: sinking every arrowhead the full amplitude buried the ones that
 * arrived at a crest, and leaving every one on the baseline left the ones
 * that arrived at a trough hanging in clear air. The connector meets its
 * border at ONE point, and the shape of the border at that point is known
 * exactly, so it is worked out rather than approximated.
 *
 * The arithmetic mirrors wavySideCommands and waveRun exactly — the same
 * corner radius, the same shared phase grid, the same alternating bulge —
 * because it has to answer for the very curve those two draw. Each arc is
 * a cubic whose two control points sit a whole amplitude off the baseline,
 * so its offset at parameter t is 3·lift·t·(1−t), peaking at three
 * quarters of the amplitude; and its progress ALONG the side is a
 * smoothstep of t rather than t itself, which is why the parameter has to
 * be solved for rather than read off. Six Newton steps land well inside a
 * hundredth of a pixel. */
function wavyDropAt(n, side, ring){
  if(!isWavyBorder(n)) return 0;
  const step = ringStepFor(n);
  const inset = -(ring || 0) * step;
  const x = n.x + inset, y = n.y + inset;
  const w = n.w - inset*2, h = n.h - inset*2;
  const grow = (ring || 0) * step;
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const len = (side === 'top' || side === 'bottom') ? w : h;
  const straight = len - r*2;
  const flat = Math.min(POCKET_CORNER_FLAT, straight/4);
  const runLen = straight - flat*2;
  if(runLen < POCKET_WAVELEN * 1.5) return 0;
  const W = POCKET_WAVELEN;
  const absAtSx = -grow + r;
  const firstIdx = Math.ceil((absAtSx + flat) / W);
  const start = firstIdx * W - absAtSx;
  const bumps = Math.floor((runLen + flat - start) / W);
  if(bumps < 1) return 0;
  const phase = ((firstIdx % 2) + 2) % 2;
  /* Where the port sits, measured from the corner THIS side starts at —
     which is not the same corner for all four: wavyRectPath walks the
     frame clockwise, so the bottom is drawn right-to-left and the left
     bottom-to-top, and a distance measured the other way would read the
     phase grid backwards. */
  return function(px, py){
    let dist;
    if(side === 'top') dist = px - x;
    else if(side === 'bottom') dist = (x + w) - px;
    else if(side === 'right') dist = py - y;
    else dist = (y + h) - py;
    const u = dist - (r + start);
    if(u < 0 || u > bumps * W) return 0;
    const j = Math.min(bumps - 1, Math.floor(u / W));
    const local = (u - j*W) / W;
    const lift = ((j + phase) % 2 === 0) ? POCKET_LIFT : -POCKET_LIFT;
    let t = local;
    for(let k = 0; k < 6; k++){
      const hh = t*t*(3 - 2*t), dh = 6*t*(1 - t);
      if(Math.abs(dh) < 1e-6) break;
      t = Math.max(0, Math.min(1, t - (hh - local)/dh));
    }
    return 3 * lift * t * (1 - t);
  };
}
function portOnSide(n, side, i, count, ring){
  const t = (i+1)/(count+1);
  // Carried on the port so a ring cap knows how far it has to reach back
  // across the rings — which is not the same distance on every archetype.
  const step = ringStepFor(n);
  // Carried on the port so a ring cap knows whether the border it meets
  // ripples, and by how much.
  const wavy = isWavyBorder(n);
  const inset = -(ring || 0) * step;
  const x = n.x + inset, y = n.y + inset;
  const w = n.w - inset*2, h = n.h - inset*2;
  /* On a card the top band is a picture, and a connector meeting the middle
     of a photograph reads as an accident. Ports along the two upright sides
     are therefore spread over the text bands only; the top and bottom sides
     are unaffected, since there the picture is simply the edge the arrow
     arrives at. */
  const skip = (n.cardTop && (side === 'left' || side === 'right'))
    ? Math.min(n.cardTop, h - 12) : 0;
  const sideY = y + skip + (h - skip) * t;
  /* Carried on the port so a cap and a run-out both know how much of the
     entry's own border still stands OUTSIDE this ring. */
  const rings = ringCountOf(n);
  const at = {
    top:    {x:x + w*t, y},
    bottom: {x:x + w*t, y:y + h},
    left:   {x,         y:sideY},
    right:  {x:x + w,   y:sideY}
  }[side] || {x:x + w, y:sideY};
  /* And, on a rippled border, how far the ripple stands off the baseline
     at exactly this point — carried on the port so the line's end and its
     arrowhead can both meet the border where it really is. Zero on every
     other archetype, which is what makes them all behave the same. */
  const drop = wavy ? (wavyDropAt(n, side, ring || 0) || (()=>0))(at.x, at.y) : 0;
  /* A portrait is a CIRCLE, and a point on the side of the square it is
     inscribed in is not on it.
   *
     One connector lands at the middle of a side, which is the one place
     the square and the circle touch, so a single arrow met the rim
     exactly and nothing looked wrong. Give the portrait a second and the
     two share the side — a third and a two-thirds of the way along it —
     and both of them stopped at the square, a good few pixels short of
     the border they were pointing at, with clear paper between the head
     and the entry. The point is carried radially out to the rim: the
     share along the side is kept (that evenness is information), and what
     changes is only how far out it sits. */
  if((n.shape || '') === 'ellipse'){
    const ccx = n.x + n.w/2, ccy = n.y + n.h/2;
    const rr = n.w/2 + (ring || 0) * step;
    const vx = at.x - ccx, vy = at.y - ccy;
    const len = Math.hypot(vx, vy);
    if(len > 0.01){ at.x = ccx + vx/len*rr; at.y = ccy + vy/len*rr; }
  }
  /* Enough about where this port sits on its side to move it a little
     later without landing on a neighbour — see nudgePortAlong. `span` is
     the length actually shared out, `slots` how many connectors are
     sharing it, `slot` which one this is. */
  return {x:at.x, y:at.y, side, ring:ring||0, step, wavy, rings, drop,
          owner: n.id, span: sideIsVertical(side) ? w : (h - skip),
          slot: i, slots: count};
}
/* How far a port may travel along its own side.
 *
 * A port's exact place on a side is the chart's choice, not the reader's:
 * they chose the SIDE, and the spacing is arithmetic. So a few pixels of
 * it can be spent on making a connector run straight — but only a few, and
 * never so many that two connectors sharing a side end up on top of each
 * other. Not quite half the gap to a neighbour is the limit, so even if
 * two adjacent ports both move toward each other they keep most of it. */
const PORT_NUDGE_MAX = 22;
function portSlack(p){
  if(!p || !(p.span > 0)) return 0;
  /* A side with more than one connector on it gives nothing.
   *
     The spacing along an edge is an even share — a fan of three leaves at
     a quarter, a half and three quarters of it — and that evenness is
     itself information: it says the connectors belong together and none of
     them is special. Letting each one wander to straighten itself spent
     that: two lineages out of an amalgam's parent drifted toward each
     other and the pair ended up bunched and off centre, which reads as a
     mistake in the drawing. A lone connector has nobody to be even WITH,
     so it may move as much as its side allows; a shared side keeps its
     arithmetic, and only the last pixel or two are still taken (see
     PORT_SQUEEZE), which is below the threshold of noticing. */
  if((p.slots || 1) > 1) return 0;
  return Math.min(PORT_NUDGE_MAX, (p.span / 2) * 0.45);
}
/* Moves a port along its side by `delta`, as far as its slack allows, and
   returns how far it actually went. A rippled border's offset is worked out
   again at the new place, because it is different at every point. */
function movePortAlong(p, delta){
  if(!p || !delta) return 0;
  if(sideIsVertical(p.side)) p.x += delta; else p.y += delta;
  if(p.wavy){
    const n = nodes.get(p.owner);
    const f = n && wavyDropAt(n, p.side, p.ring || 0);
    p.drop = f ? f(p.x, p.y) : 0;
  }
  return delta;
}
/* The last pixel or two are taken whatever the slack says.
 *
 * A residual smaller than this is not a misalignment worth a corner — it is
 * the arithmetic not quite coming out, and drawn as a step it is two arcs
 * of half a pixel each: a visible wobble in the middle of a straight line,
 * which is worse than anything moving a port this far could cause. Two
 * pixels cannot put two connectors on top of one another. */
const PORT_SQUEEZE = 4;
function nudgePortAlong(p, delta){
  const room = portSlack(p);
  if(!room || !delta) return 0;
  const move = Math.max(-room, Math.min(room, delta));
  if(Math.abs(move) < 0.01) return 0;
  return movePortAlong(p, move);
}
function roundedPath(pts, r){
  if(pts.length<=2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  const segLen=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  let d = `M${pts[0].x},${pts[0].y}`;
  for(let i=1;i<pts.length-1;i++){
    const prev=pts[i-1], cur=pts[i], next=pts[i+1];
    const l1=segLen(prev,cur), l2=segLen(cur,next);
    /* Two corners sharing a leg each get half of it, so their arcs cannot
       run into one another. A leg that ends at a PORT has no corner at its
       far end to share with, so the arc may use all of it — which is what
       keeps the bend the same shape whether the run-out from the entry is
       long or short. Without that, a connector between two close entries
       had its corners squeezed down to nearly square while a long one kept
       generous ones, and the two read as different kinds of line. */
    const cap1 = (i === 1) ? l1 : l1/2;
    const cap2 = (i === pts.length-2) ? l2 : l2/2;
    const rr=Math.max(0, Math.min(r, cap1, cap2));
    const ax = l1 ? (prev.x-cur.x)/l1 : 0, ay = l1 ? (prev.y-cur.y)/l1 : 0;
    const bx = l2 ? (next.x-cur.x)/l2 : 0, by = l2 ? (next.y-cur.y)/l2 : 0;
    /* Not every point in the list is a corner. The run-out points are kept
       through the tidy pass on purpose — the clearance check identifies
       them by position — so a connector that leaves an entry and goes
       straight on arrives here with two or three points sitting on one
       line, and each of them was written out as its own curve. Straight
       curves, so nothing showed; but the connector was three commands
       longer than it needed to be for every one of them, and any rounding
       in the arithmetic had somewhere to become a visible kink. A point
       whose two legs point the same way is passed straight through. */
    if(Math.abs(ax + bx) < 1e-6 && Math.abs(ay + by) < 1e-6) continue;
    d += ` L${cur.x+ax*rr},${cur.y+ay*rr} Q${cur.x},${cur.y} ${cur.x+bx*rr},${cur.y+by*rr}`;
  }
  const last = pts[pts.length-1];
  d += ` L${last.x},${last.y}`;
  return d;
}
// Corner radius for edge elbows - a fixed constant that echoes the rx:5 on
// node boxes; not user-adjustable (routing/line-style are, per edge).
// Small enough that the shortest run-out a connector is ever given still
// has room for the full arc, so every elbow on the chart is the same shape.
const EDGE_CORNER_R = 6;

/* ---------------------------------------------------------------------
   A rectangle whose four sides ripple — the 'pocket reality' archetype,
   echoing the wavy connector style.

   Each side carries a whole number of arcs, laid out from its own corner,
   so a side starts and ends on the baseline and the four corners meet
   without a step. The arcs alternate which way they bulge, and they are
   set shallower here than on a connector: a border has to read as an edge
   that ripples rather than as a row of scallops stuck to a box, and a
   shallow ripple is also what lets two rings nest at the ordinary spacing.
   ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Waves, drawn as real curves.

   Both the pocket-reality border and the wavy connector used to be a sine
   sampled into a few dozen points and then pushed through a Catmull-Rom
   smoother. Two rounds of approximation, and the second one rounded the
   crests off the first: the result was low, soft and slightly uneven —
   more of a wobble than a wave.

   Here each half-wave is one cubic Bezier with its control points placed
   exactly, which is how a wave is drawn in a vector program (and the
   technique behind the CSS wavy-shape recipes): a cubic from baseline to
   baseline whose two controls sit at 4/3 of the target amplitude peaks at
   exactly that amplitude. Whole bumps only, so a wave always begins and
   ends on the baseline and adjacent runs meet exactly.
   ------------------------------------------------------------------ */
/* From a sine to a coil.
 *
 * The shape of a half-wave is decided entirely by where its two control
 * points sit ALONG the run. Inset them (the old 0.36 / 0.64) and the curve
 * leaves the baseline at a slope, which is precisely what makes a sine look
 * like a sine. Put them directly above the two endpoints and the curve
 * leaves the baseline vertically: the hump becomes a half-ellipse, and a
 * row of them reads as the arcs of an inductor symbol rather than a ripple.
 *
 * The direction alternates: every second arc turns over, so a run reads as
 * a wave rather than as the row of same-way humps it was for a while. The
 * side the FIRST arc takes is the caller's, and `phase` carries that
 * choice across a run that had to be cut short — see wavyPath, where the
 * arcs an arrowhead covers are dropped without moving the rest.
 *
 * A cubic cannot BE a half-circle, but controls at 4/3 of the amplitude
 * make it peak at exactly `amp` and stay within about 3% of the true arc
 * everywhere else, which is nowhere near visible at these sizes. Because
 * `amp` is free of the step width, the arcs are half-ELLIPSES: numerous
 * and shallow, which is what was asked for — a true half-circle's height
 * is locked to half its width and would be far too tall. */
const WAVE_K = 4/3;
/* Amplitude is DERIVED from the spacing unless a caller says otherwise. A
   semicircle's height is half its width, so once the spacing is chosen the
   radius follows — and letting the two be set independently at every call
   site is how the old wave drifted into looking like a squashed sine. One
   dial, how long an arc should be, and the shape comes out consistent.

   The one caller that overrides it is the pocket border (POCKET_LIFT),
   which needs a deliberately shallower ripple for the reasons given there.

   This also self-regulates on short runs: `bumps` is rounded from the run
   length, so `step` never strays far from the target and the radius cannot
   blow up on a stub. */
/* The arc pitch is FIXED, never fitted to the run.
 *
 * It used to be runLen/bumps, so every run stretched or squeezed its arcs
 * a little to come out even. That made the texture depend on the length of
 * the run it happened to be on — and, worse, on whether the connector had
 * arrowheads, since a head shortens the run: adding one visibly re-pitched
 * the whole pattern. An arc is now always EDGE_WAVE_LEN long wherever it
 * appears, and the leftover goes to the flats at either end, so the same
 * connector keeps the same texture whatever is attached to it. */
/* `phase` is which side the FIRST arc of this run bulges to, so a run that
   is really the continuation of another can carry on alternating instead
   of starting over. */
function waveRun(ax, ay, ux, uy, nx, ny, from, bumps, step, phase, liftOverride){
  const at = (dist, off)=>
    `${(ax + ux*dist + nx*off).toFixed(2)},${(ay + uy*dist + ny*off).toFixed(2)}`;
  const lift = (typeof liftOverride === 'number') ? liftOverride : (step / 2) * WAVE_K;
  const start = phase || 0;
  let d = '';
  for(let j=0; j<bumps; j++){
    const s = from + j*step, e = s + step;
    // Every second arc turns over. Half-circles all bulging the same way
    // read as a coil; alternating them reads as a wave, and the line keeps
    // the same pitch and the same amplitude either way.
    const side = ((j + start) % 2 === 0) ? lift : -lift;
    d += ` C${at(s, side)} ${at(e, side)} ${at(e, 0)}`;
  }
  return d;
}
/* How many arcs fit in `len` at roughly `target` each. Each arc begins and
   ends on the baseline whichever side it bulges to, so the count does not
   have to come out even — which lets the spacing land closer to the target
   and keeps adjacent runs consistent. */
// How many WHOLE arcs of `target` fit. The remainder is not squeezed into
// them — it is left as flat, so the pitch never varies.
function waveBumps(len, target){
  return Math.max(1, Math.floor(len / target));
}

// Many small scallops rather than a few big ones: a fine ripple reads as
// a deliberate frame, where a long slow wave just looks like a wobbly box.
const POCKET_WAVELEN = 8;
// How far a ripple stands off its own baseline — the height of one
// half-wave, and so how deep a pocket reality's border really is. Declared
// here rather than up beside the other border constants because it is
// derived from the two above it.
/* Shallower than a connector's, deliberately.
 *
 * A connector's wave is the whole of the line — it can afford to swing.
 * A pocket's is a BORDER: it has to read as an edge that ripples, not as a
 * row of scallops stuck to a box, and at a connector's 5.3 the crests were
 * tall enough to be shapes in their own right. At 1.6 they were barely
 * there. This sits between the two, and is only possible because the rings
 * share one phase grid (see wavySideCommands) and so stay exactly the ring
 * spacing apart however deep the ripple is. */
const POCKET_LIFT = 3.1;
/* The frame borrows the connector's arrangement: a short flat stretch at
   each corner, an even row of scallops between them. Running the wave all
   the way into the corner put a crest exactly where two sides meet, which
   softened the corner into a blob and made the box lose its shape; a
   corner that stays square reads as a box with a wavy edge, which is what
   a pocket reality is meant to look like. Like the connector's, these
   flats give way on a short side rather than eating it. */
const POCKET_CORNER_FLAT = 0;
/* One side of the pocket frame, from just past one corner to just short of
   the next. The radius is held back at both ends so wavyRectPath can turn
   the corner with an arc, the way every other box on the chart does. */
/* One side of the frame. `phaseBase` is where this side begins measured
   along its own axis from the ENTRY's own corner — which is what lets two
   rings of the same entry lay their arcs on one shared grid.
 *
 * Centring each side's arcs in its own length, as this did, put every ring
 * on a phase of its own: a ring is longer than the one inside it, so their
 * crests drifted apart and met again around the frame, and two rings four
 * pixels apart could touch wherever they fell out of step. That is what
 * forced the ripple to be shallow enough to be barely visible. Anchored to
 * a shared grid the rings are parallel curves, exactly the ring spacing
 * apart at every point, and the ripple can have some depth again. */
function wavySideCommands(x1, y1, x2, y2, outX, outY, r, phaseBase){
  const len = Math.hypot(x2-x1, y2-y1);
  if(len < 2) return ` L${x2},${y2}`;
  const ux = (x2-x1)/len, uy = (y2-y1)/len;
  const sx = x1 + ux*r, sy = y1 + uy*r;          // start, past the last corner
  const ex = x2 - ux*r, ey = y2 - uy*r;          // end, short of the next one
  const straight = len - r*2;
  const flat = Math.min(POCKET_CORNER_FLAT, straight/4);
  const runLen = straight - flat*2;
  if(runLen < POCKET_WAVELEN * 1.5) return ` L${ex.toFixed(2)},${ey.toFixed(2)}`;
  const W = POCKET_WAVELEN;
  // Where `sx` sits on the entry's own grid, and the first grid line at or
  // past the point the arcs may begin.
  const absAtSx = (phaseBase || 0) + r;
  const firstIdx = Math.ceil((absAtSx + flat) / W);
  const start = firstIdx * W - absAtSx;
  const bumps = Math.floor((runLen + flat - start) / W);
  if(bumps < 1) return ` L${ex.toFixed(2)},${ey.toFixed(2)}`;
  // Which way the first drawn arc bulges, so neighbouring rings agree.
  const phase = ((firstIdx % 2) + 2) % 2;
  let d = ` L${(sx + ux*start).toFixed(2)},${(sy + uy*start).toFixed(2)}`;
  d += waveRun(sx, sy, ux, uy, outX, outY, start, bumps, W, phase, POCKET_LIFT);
  d += ` L${ex.toFixed(2)},${ey.toFixed(2)}`;
  return d;
}
/* Held back from the rx an ordinary entry's rectangle uses. The radius and
   the corner flat are both dead ground as far as the ripple is concerned —
   between them they took sixteen pixels out of every side, which is two
   whole scallops the frame never got to have, and the corners were the one
   part of the border that stayed straight. */
const POCKET_CORNER_R = 2.5;
/* One side of that same wavy outline, on its own and left open. The edge
   you grab to draw a connector is drawn as the border it lights up, so on
   a pocket reality it has to wave exactly as the border does — a straight
   bar across a rippled edge read as a separate object laid over the box.
   Built from the same wavySideCommands the whole outline is built from, so
   the two can never drift apart. */
function wavySideOpenPath(x, y, w, h, side, grow){
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const c = {
    top:    [x,     y,     x+w,   y,      0, -1],
    right:  [x+w,   y,     x+w,   y+h,    1,  0],
    bottom: [x+w,   y+h,   x,     y+h,    0,  1],
    left:   [x,     y+h,   x,     y,     -1,  0]
  }[side];
  if(!c) return '';
  const len = Math.hypot(c[2]-c[0], c[3]-c[1]) || 1;
  const ux = (c[2]-c[0])/len, uy = (c[3]-c[1])/len;
  const sx = c[0] + ux*r, sy = c[1] + uy*r;
  return `M${sx.toFixed(2)},${sy.toFixed(2)}` +
    wavySideCommands(c[0], c[1], c[2], c[3], c[4], c[5], r, -(grow || 0));
}
/* `grow` is how far outside the entry's own box this ring sits, which is
   all the shared grid needs: a ring `g` out starts each of its sides `g`
   before the entry's corner. */
function wavyRectPath(x, y, w, h, grow){
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const g = grow || 0;
  const corners = [
    [x,     y,     x+w,   y,      0, -1],   // top,    bulging up
    [x+w,   y,     x+w,   y+h,    1,  0],   // right,  bulging right
    [x+w,   y+h,   x,     y+h,    0,  1],   // bottom, bulging down
    [x,     y+h,   x,     y,     -1,  0]    // left,   bulging left
  ];
  let d = `M${(x + r).toFixed(2)},${y}`;
  corners.forEach((c, i)=>{
    d += wavySideCommands(c[0], c[1], c[2], c[3], c[4], c[5], r, -g);
    // Round into the next side.
    const nxt = corners[(i+1) % corners.length];
    const nl = Math.hypot(nxt[2]-nxt[0], nxt[3]-nxt[1]) || 1;
    const vx = (nxt[2]-nxt[0])/nl, vy = (nxt[3]-nxt[1])/nl;
    d += ` Q${c[2]},${c[3]} ${(c[2] + vx*r).toFixed(2)},${(c[3] + vy*r).toFixed(2)}`;
  });
  return d + ' Z';
}

// ---- obstacle-avoiding orthogonal routing -------------------------------
// If an elbow's direct path would cut straight through some OTHER node's
// box (one it isn't actually connecting to), it should skirt around that
// node instead of overlapping it. Only orthogonal routing gets this — a
// straight or sinusoid line has no axis-aligned segments to reroute.
function segIntersectsRect(x1,y1,x2,y2,rect){
  if(Math.abs(x1-x2) < 0.5){ // vertical segment at x=x1
    const x=x1, segY0=Math.min(y1,y2), segY1=Math.max(y1,y2);
    if(x < rect.x0 || x > rect.x1) return false;
    return segY1 > rect.y0 && segY0 < rect.y1;
  }
  if(Math.abs(y1-y2) < 0.5){ // horizontal segment at y=y1
    const y=y1, segX0=Math.min(x1,x2), segX1=Math.max(x1,x2);
    if(y < rect.y0 || y > rect.y1) return false;
    return segX1 > rect.x0 && segX0 < rect.x1;
  }
  return false; // diagonal segments never occur in orthogonal routing
}
/* Does a straight run cross an axis-aligned box? Liang–Barsky, so a
   DIAGONAL run counts — the router's own test above answers "no" to
   everything that is not level or upright, which is every lineage of an
   amalgam. */
function segHitsBox(x1, y1, x2, y2, bx0, by0, bx1, by1){
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - bx0, bx1 - x1, y1 - by0, by1 - y1];
  for(let i = 0; i < 4; i++){
    if(Math.abs(p[i]) < 1e-9){ if(q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if(p[i] < 0){ if(r > t1) return false; if(r > t0) t0 = r; }
    else       { if(r < t0) return false; if(r < t1) t1 = r; }
  }
  return true;
}
function pathClearOf(pts, obstacles){
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    for(const rect of obstacles){
      if(segIntersectsRect(a.x,a.y,b.x,b.y,rect)) return false;
    }
  }
  return true;
}
// Bounding boxes (with a small margin) of every node except the ones this
// edge actually connects — those are excluded since the path is *supposed*
// to touch them.
/* The boxes a connector has to keep out of.

   Every edge asks for this twice — once for the full set and once with its
   own two endpoints left out — so on a chart of 120 entries a single
   redraw was building twenty-eight THOUSAND rectangle objects, all of them
   identical from one edge to the next. The set only changes when the
   entries move, and the entries only move between redraws, so it is built
   once per pass and then shared: asking for a subset now filters that one
   array instead of walking every node again.

   `obstacleEpoch` is bumped wherever geometry changes, which is the same
   moment redrawEdges is about to run. */
let obstacleEpoch = 0;
let obstacleAllCache = null, obstacleAllEpoch = -1;
function invalidateObstacles(){ obstacleEpoch++; }
function obstacleAll(){
  if(obstacleAllEpoch === obstacleEpoch && obstacleAllCache) return obstacleAllCache;
  obstacleAllCache = buildObstacleRects();
  obstacleAllEpoch = obstacleEpoch;
  return obstacleAllCache;
}
function obstacleRects(excludeIds){
  const all = obstacleAll();
  if(!excludeIds || !excludeIds.size) return all;
  return all.filter(r=> !excludeIds.has(r.id));
}
function buildObstacleRects(){
  const rects = [];
  nodes.forEach((n,id)=>{
    // Free-standing pictures and text blocks are decoration laid over the
    // chart, not stations on it. Routing around them would bend the
    // lineage out of shape to dodge a caption — and a backdrop image would
    // make the whole area impassable — so the router simply doesn't see
    // them; a connector crosses them the way it crosses the grid.
    if(n.shape === 'image' || n.shape === 'textbox') return;
    /* Nor a callout. It is a remark ABOUT the drawing rather than a part
       of what the drawing describes, and it is placed by hand beside the
       very connector it belongs to — so treating it as something to route
       around made every connector bend to avoid the note explaining it. A
       line crosses a callout the way it crosses a caption. */
    if(n.shape === 'callout') return;
    rects.push({id, x0:n.x-6, y0:n.y-6, x1:n.x+n.w+6, y1:n.y+n.h+6});
  });
  return rects;
}
/* ---------------------------------------------------------------------
   Orthogonal router.

   Every connector now leaves and arrives perpendicular to a known side,
   so routing is done between two "stub" points pushed STUB units straight
   out of each port rather than between the ports themselves. That single
   change is what makes an arrow always meet its node head-on instead of
   grazing along the border, and it gives the router two free interior
   coordinates to bend through.

   Rather than one hard-coded shape per port-pair, a spread of candidate
   polylines is generated and each is SCORED, cheapest wins. The score
   charges for the things that actually make a diagram hard to read, in
   descending order of how much they hurt: crossing a node box, running
   along on top of a connector that's already been routed, sheer number of
   bends, then length. Because edges are routed in order and each one
   registers its own segments, later edges actively steer around earlier
   ones instead of stacking on them.
   ------------------------------------------------------------------ */
const STUB = 18;               // how far a connector runs straight out of its port
// A connector needs room to actually be a line: a stub out of each node,
// plus enough between them to read as a connection and carry an arrowhead.
// A gap narrower than this can't hold one, and autoSides routes around
// instead of cramming a stub into it.
const MIN_SIDE_GAP = STUB*2 + 16;
const PENALTY_NODE = 1000;     // crossing a node box: never acceptable if avoidable
const PENALTY_OVERLAP = 240;   // sharing a lane with an already-drawn connector
const PENALTY_BEND = 22;       // each extra corner

// Segments of every connector routed so far this pass. redrawEdges() clears
// this before it starts, so it only ever describes the picture being drawn.
let routedSegments = [];
function resetRoutedSegments(){ routedSegments = []; }
function registerRoutedSegments(pts){
  for(let i=0;i<pts.length-1;i++){
    routedSegments.push({x1:pts[i].x, y1:pts[i].y, x2:pts[i+1].x, y2:pts[i+1].y});
  }
}
// Two axis-aligned segments "overlap" when they're collinear on the same
// axis and their spans intersect over a real length — i.e. they'd be drawn
// as one thick line and the reader can't tell there are two connectors.
// Merely crossing at right angles is fine and very common, so it isn't
// counted.
const OVERLAP_TOL = 3;
function segmentsOverlap(a, b){
  const aVert = Math.abs(a.x1-a.x2) < 0.5, bVert = Math.abs(b.x1-b.x2) < 0.5;
  const aHorz = Math.abs(a.y1-a.y2) < 0.5, bHorz = Math.abs(b.y1-b.y2) < 0.5;
  if(aVert && bVert){
    if(Math.abs(a.x1-b.x1) > OVERLAP_TOL) return 0;
    const lo = Math.max(Math.min(a.y1,a.y2), Math.min(b.y1,b.y2));
    const hi = Math.min(Math.max(a.y1,a.y2), Math.max(b.y1,b.y2));
    return Math.max(0, hi-lo);
  }
  if(aHorz && bHorz){
    if(Math.abs(a.y1-b.y1) > OVERLAP_TOL) return 0;
    const lo = Math.max(Math.min(a.x1,a.x2), Math.min(b.x1,b.x2));
    const hi = Math.min(Math.max(a.x1,a.x2), Math.max(b.x1,b.x2));
    return Math.max(0, hi-lo);
  }
  return 0;
}
function pathLength(pts){
  let t=0;
  for(let i=0;i<pts.length-1;i++) t += Math.abs(pts[i+1].x-pts[i].x) + Math.abs(pts[i+1].y-pts[i].y);
  return t;
}
function countBends(pts){
  let bends = 0;
  for(let i=1;i<pts.length-1;i++){
    const inVert = Math.abs(pts[i].x-pts[i-1].x) < 0.5;
    const outVert = Math.abs(pts[i+1].x-pts[i].x) < 0.5;
    if(inVert !== outVert) bends++;
  }
  return bends;
}
function scorePath(pts, obstacles){
  let score = pathLength(pts) + countBends(pts)*PENALTY_BEND;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    for(const rect of obstacles){
      if(segIntersectsRect(a.x,a.y,b.x,b.y,rect)) score += PENALTY_NODE;
    }
    const seg = {x1:a.x,y1:a.y,x2:b.x,y2:b.y};
    for(const other of routedSegments){
      const shared = segmentsOverlap(seg, other);
      // Short shared stretches (a few px where two lanes graze) aren't worth
      // reshaping a whole connector over.
      if(shared > 8) score += PENALTY_OVERLAP;
    }
  }
  return score;
}
// Drops points that repeat, and collapses a run of three collinear points
// into two, so bend counting and the rounded-corner renderer both see a
// clean polyline.
function tidyPoints(pts){
  const out = [];
  for(const p of pts){
    const last = out[out.length-1];
    if(last && !p.keep && Math.abs(last.x-p.x)<0.5 && Math.abs(last.y-p.y)<0.5) continue;
    out.push({x:p.x, y:p.y, side:p.side, ring:p.ring, keep:p.keep});
  }
  // Stub points are load-bearing, not decoration: the clearance check
  // identifies the two port-to-stub segments by position, so collapsing a
  // stub away (which happens whenever port, stub and the rest of the route
  // all sit on one line) would silently turn the whole connector into one
  // "endpoint" segment and exempt it from ever being checked.
  for(let i=1;i<out.length-1;i++){
    if(out[i].keep) continue;
    const a=out[i-1], b=out[i], c=out[i+1];
    const abVert = Math.abs(a.x-b.x)<0.5, bcVert = Math.abs(b.x-c.x)<0.5;
    const abHorz = Math.abs(a.y-b.y)<0.5, bcHorz = Math.abs(b.y-c.y)<0.5;
    if((abVert && bcVert) || (abHorz && bcHorz)){ out.splice(i,1); i--; }
  }
  return out;
}
/* A route ends ON the border it meets, wherever that border happens to be.
 *
 * For every archetype but one that is the port itself and this does
 * nothing. A pocket reality's border ripples, so the line has to reach a
 * little further out at a crest and stop a little shorter at a trough —
 * see wavyDropAt, which works out which by how much. Moving the endpoint
 * ALONG the port's own normal keeps the route square, because the segment
 * that ends there is the run-out and the run-out is along that normal. */
/* How far a headless line is pushed PAST the ripple, into the entry.
 *
 * A line that stops exactly on the wave is touching it, and touching is not
 * quite meeting: the line has width, the border has width, and where the
 * wave curves away from the line's own direction the two leave a sliver of
 * paper between them — which reads as a connector hanging just short of the
 * box. The line is under the entry's fill, so a couple of pixels of overlap
 * cost nothing and settle the join for good. A line that ends in an
 * ARROWHEAD is left alone: there the head is the thing that meets the
 * border, and the line stops at the head's back edge. */
const POCKET_BITE = 1.5;
/* How far a ripple actually reaches either side of its baseline.
 *
 * Not POCKET_LIFT: that is where the two control points of each arc sit,
 * and a cubic only ever reaches three quarters of the way to them. This is
 * the real amplitude, and it is what anything that has to clear the wave —
 * a line ending under it, a cap crossing it — has to be measured against.
 * Using the lift instead left every such thing about a pixel short. */
const POCKET_DEEP = POCKET_LIFT * 0.75;
/* How far under an OUTER ring a headless line is carried.
 *
 * A border is a stroke 1.6 wide, so it covers eight tenths of a pixel
 * either side of the curve it is drawn along. Stopping this far in is
 * therefore invisible — the border itself is painted over it — while
 * still guaranteeing contact wherever on the ripple the line lands, and
 * at whatever angle the wave happens to be crossing at that point. */
const POCKET_UNDERLAP = 0.7;
function sinkEnds(pts, p1, p2){
  if(!pts || pts.length < 2) return pts;
  const out = pts.map(q=> ({...q}));
  const put = (idx, port)=>{
    const nrm = port && SIDE_OUT[port.side];
    if(!nrm) return;
    /* Two different questions, and they had been answered with the same
       number.
     *
       An ARROWHEAD asks "where exactly is the border here", because its
       tip is a point and it is drawn above the entry where every pixel of
       it shows: it goes on the wave, at the offset worked out for that
       exact place.
     *
       A LINE with no head asks something else: "where can I stop and be
       sure of touching". A line has width and a direction of its own, and
       where the wave curves away from it a contact at the exact offset
       still leaves a sliver of paper. It goes to the DEEPEST the ripple
       ever reaches, and a hair further — always inside the wave, always
       under the entry's own fill, which hides the overlap completely. No
       phase of the ripple can leave it short. */
    /* ...and that last sentence only holds for ring 0.
     *
       The entry's FILL is ring 0's, and only ring 0's: every further ring
       is an open outline with nothing but paper behind it. So a headless
       line carried an amplitude and a half past the SECOND border was not
       buried at all — it came out the far side and hung in the gap between
       that ring and the one within, which is the stub of connector seen
       poking through a pocket reality's outer borders.
     *
       Outside ring 0 it stops just under the border instead: far enough
       that no phase of the ripple can leave it short of contact, and well
       inside the border's own stroke, which is drawn over it. */
    const off = port.wavy
      ? (port.head ? (port.drop || 0)
         : ((port.ring || 0) > 0
            ? (port.drop || 0) - POCKET_UNDERLAP
            : -(POCKET_DEEP + POCKET_BITE)))
      : (port.drop || 0);
    if(!off) return;
    out[idx] = Object.assign({}, out[idx],
      {x: out[idx].x + nrm[0]*off, y: out[idx].y + nrm[1]*off});
  };
  put(0, p1); put(out.length-1, p2);
  return out;
}
/* The last word on an orthogonal route: every segment runs along an axis.
 *
 * This is a REPAIR pass, not a routing step, and it should normally have
 * nothing to do. It exists because a connector drawn on a slant is not a
 * cosmetic slip on this chart — it says the two entries are joined by
 * something other than the ninety-degree lineage every other pair is
 * joined by, and it drags the arrowhead round with it, since a head takes
 * its angle from the last segment of the line. Whatever new case turns up
 * in the router, it will not reach the paper as a diagonal.
 *
 * A pair of points that differs on both axes is broken into two segments.
 * Which one comes first is chosen so the connector still LEAVES its entry
 * and ARRIVES at the far one along the ports' own normals: those two are
 * the segments the reader reads as "out of here" and "into there", and
 * turning either of them sideways is what makes a connector look like it
 * is attached to the wrong edge. In between, the direction already being
 * travelled wins, so the repair adds one corner rather than a staircase. */
function squareUp(pts, p1, p2){
  if(!pts || pts.length < 2) return pts;
  const vert = (side)=> side === 'top' || side === 'bottom';
  const out = [pts[0]];
  for(let i = 1; i < pts.length; i++){
    const a = out[out.length-1], b = pts[i];
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if(dx > 0.5 && dy > 0.5){
      let cameVert;
      if(i === 1 && p1 && p1.side) cameVert = vert(p1.side);
      else if(i === pts.length-1 && p2 && p2.side) cameVert = !vert(p2.side);
      else {
        const prev = out[out.length-2];
        cameVert = prev ? Math.abs(prev.x - a.x) < 0.5 : dy >= dx;
      }
      out.push(cameVert ? {x:a.x, y:b.y} : {x:b.x, y:a.y});
    }
    out.push(b);
  }
  return out;
}
// Every reasonable way to join two stub points, given which axis each stub
// arrives on. The candidates that don't respect a stub's axis are filtered
// out by the caller's scoring (they'd need an extra bend right at the port),
// so this can afford to be generous and let the score decide.
/* ELBOW_LEAD is how far past its run-out a connector turns when the turn
   has to happen somewhere along an open run — and the answer is "near the
   entry it came from", not "halfway".
 *
 * A crossbar at the midpoint moves whenever either end moves, so dragging
 * an entry did not lengthen its connector so much as re-shape it: both
 * legs changed at once and the corner slid across the chart, which is
 * exactly what makes a drag feel like it is fighting you. Anchored to the
 * source instead, the near leg is a constant and the FAR leg takes up
 * whatever the drag adds — the connector grows in order, from the knee
 * outward, and the corner stays where the reader last saw it.
 *
 * Only when there is comfortably room for it: on a short run the anchored
 * bar and the midpoint one are within a few pixels of each other anyway,
 * and the midpoint is the tidier of the two. */
const ELBOW_LEAD = 34;
/* Where each connector's crossbar was last drawn.
 *
 * Anchoring the bar to one end answers half the question and creates the
 * other half. Held at the source it stays put while the target is dragged
 * and leaps when the source is; held at the target, the other way round.
 * Offering both, as the previous version did, only picks whichever happens
 * to score better on the frame — so dragging one entry still moved the bar
 * whenever the anchored candidate stopped being legal.
 *
 * The bar's real requirement has nothing to do with which end it is
 * measured from: it should stay WHERE IT WAS. So where it was is
 * remembered, offered back as a candidate first, and taken whenever it is
 * still legal and no worse. Dragging either entry then lengthens that
 * entry's own leg, which is what a connector being made longer looks like.
 *
 * Cleared with the model, so a chart that has been rebuilt from scratch —
 * an import, an undo, a fresh load — starts from the geometry rather than
 * from a memory of a chart that no longer exists. */
function routeBarKey(p1, p2){
  if(!p1 || !p2 || !p1.owner || !p2.owner) return null;
  return `${p1.owner}\u0000${p1.side}\u0000${p2.owner}\u0000${p2.side}`;
}
/* The lane a four-point candidate runs through, if it has one. */
function barOfMid(mid){
  if(!mid || mid.length !== 2) return null;
  const a = mid[0], b = mid[1];
  if(Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5) return {axis:'x', v:a.x};
  if(Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5) return {axis:'y', v:a.y};
  return null;
}
function joinCandidates(s1, s2, extraLanes, remembered){
  const mx = (s1.x+s2.x)/2, my = (s1.y+s2.y)/2;
  const list = [];
  /* First of all: exactly where the bar was. Offered before every stock
     shape so that where it scores the same as one of them — which is the
     usual case, since it IS one of them, one frame older — it is the one
     taken. */
  if(remembered){
    if(remembered.axis === 'x') list.push([s1, {x:remembered.v, y:s1.y}, {x:remembered.v, y:s2.y}, s2]);
    else list.push([s1, {x:s1.x, y:remembered.v}, {x:s2.x, y:remembered.v}, s2]);
  }
  /* The anchored bars come first, so that where they score the same as the
     midpoint ones — same length, same number of turns, which is the usual
     case — they are the ones taken. */
  const dx = s2.x - s1.x, dy = s2.y - s1.y;
  if(Math.abs(dx) > ELBOW_LEAD*3){
    const ax = s1.x + Math.sign(dx)*ELBOW_LEAD;
    list.push([s1, {x:ax,y:s1.y}, {x:ax,y:s2.y}, s2]);
  }
  if(Math.abs(dy) > ELBOW_LEAD*3){
    const ay = s1.y + Math.sign(dy)*ELBOW_LEAD;
    list.push([s1, {x:s1.x,y:ay}, {x:s2.x,y:ay}, s2]);
  }
  /* And the same bar anchored to the FAR end.
   *
   * Anchoring to the source is what keeps a knee still while the far entry
   * is dragged about, and that is the right default. But it answers only
   * half the question, because the source gets dragged too — and when it
   * does, the bar anchored to it has to come along, which on a chart with
   * anything in the way means the route is thrown out and replaced by one
   * that clears everything: the bar leaps to a new height, and a drag of
   * twenty pixels redraws the whole connector.
   *
   * Held at the far end instead, the bar stays exactly where the reader
   * last saw it and the SOURCE's own leg takes up the difference — the
   * connector lengthens rather than re-shaping. Offered second, so where
   * both are legal the source-anchored one still wins and nothing about
   * dragging the far entry changes. */
  if(Math.abs(dx) > ELBOW_LEAD*3){
    const bx = s2.x - Math.sign(dx)*ELBOW_LEAD;
    list.push([s1, {x:bx,y:s1.y}, {x:bx,y:s2.y}, s2]);
  }
  if(Math.abs(dy) > ELBOW_LEAD*3){
    const by = s2.y - Math.sign(dy)*ELBOW_LEAD;
    list.push([s1, {x:s1.x,y:by}, {x:s2.x,y:by}, s2]);
  }
  list.push(
    [s1, {x:mx,y:s1.y}, {x:mx,y:s2.y}, s2],   // H–V–H through a vertical lane
    [s1, {x:s1.x,y:my}, {x:s2.x,y:my}, s2],   // V–H–V through a horizontal lane
    [s1, {x:s2.x,y:s1.y}, s2],                // single elbow, horizontal first
    [s1, {x:s1.x,y:s2.y}, s2]                 // single elbow, vertical first
  );
  // Offset lanes let two connectors that would otherwise share the exact
  // same mid-line each take their own, which is most of what stops parallel
  // connectors merging into one visual line.
  (extraLanes||[]).forEach(off=>{
    list.push([s1, {x:mx+off,y:s1.y}, {x:mx+off,y:s2.y}, s2]);
    list.push([s1, {x:s1.x,y:my+off}, {x:s2.x,y:my+off}, s2]);
  });
  return list;
}
/* How far a connector runs straight out of its port before it may turn.

   A fixed distance is right for two entries that are a comfortable way
   apart, and wrong for two that are close: once the gap between the ports
   is not much more than two stubs, the pair of straight run-outs overshoot
   each other and the route has to fold back on itself to reconnect — the
   little hook that appeared whenever an entry was dragged near its
   neighbour. Letting the stub shrink with the distance keeps the run-out
   long enough to leave the border cleanly while giving the elbow somewhere
   to go, so a short connector stays a plain step instead of breaking. */
const STUB_MIN = 6;
/* …and never shorter than the entry's own border is deep.
 *
 * A run-out is measured against how much room lies in front of the port,
 * which for two ports facing away from each other is none — so it collapses
 * to STUB_MIN and the route turns six pixels out. Six pixels is outside a
 * plain box and INSIDE a pocket reality, whose edge wanders three either
 * side of its baseline, and inside the outer borders of an entry drawn with
 * more than one. The turn then happened within the entry's own decoration,
 * and the connector ran along its border as a second line laid over it. */
/* Just the extra BORDER rings standing in front of a port — the ripple of a
   pocket reality's single edge is not one of them. See stubLength. */
function ringClearance(p){
  if(!p) return 0;
  const outside = Math.max(0, ((p.rings || 1) - 1) - (p.ring || 0));
  return outside * (p.step || RING_STEP);
}
function portClearance(p){
  if(!p) return 0;
  /* A ripple is not a border to clear. It is ONE border, drawn as a line
     that wanders about three pixels either side of where a plain border
     would be — well inside the run-out every connector already takes. It
     used to be charged as though it were an extra ring, and everything
     downstream of that inherited the mistake: a longer run-out, a stub
     that could not be pulled back where every other one could, and a whole
     archetype whose connectors turned in a different place from their
     neighbours' for no reason a reader could see. */
  const outside = Math.max(0, ((p.rings || 1) - 1) - (p.ring || 0));
  return outside * (p.step || RING_STEP);
}
function stubLength(p, other){
  /* Deep enough to clear the border, plus a corner's radius, plus an
     arrowhead: otherwise the arc starts the moment the line is clear and
     the head is laid over the arc, so the connector reads as curving out
     of the entry rather than leaving it, turning, and arriving. An entry
     with one plain border has nothing to clear and keeps the old minimum
     exactly, which is what keeps two entries side by side connected by a
     plain step rather than a detour. */
  /* Extra BORDERS and a rippled edge are two different problems, and
     lumping them together is what made a pocket reality's connectors read
     as a different kind of line from everything else on the chart.
   *
     Extra rings genuinely need the long run-out described above: the line
     has to get past several concentric strokes before there is anywhere
     for a corner to happen, so the clearance, the corner's radius and the
     arrowhead all have to fit end to end.
   *
     A ripple is not that. It is one border that wanders about three pixels
     either side of where a plain border would be — less than the ordinary
     minimum run-out already clears. Charging it the ring treatment gave
     every pocket reality a run-out three times longer than its neighbours
     got, so a connector between two ordinary entries stepped across
     directly while the very same connector into a pocket marched out,
     turned late and came back: the same relationship drawn two ways. It
     now takes the ordinary minimum, widened only if the ripple is somehow
     deeper than that. */
  const rings = ringClearance(p);
  const dec = portClearance(p);
  /* An end that carries an arrowhead needs a straight run at least as long
     as the head, plus the radius of the corner behind it.
   *
     A head is drawn along the port's own normal, from the port outwards.
     If the connector turns before the head ends, the head sticks out past
     the corner into open ground while the line it belongs to has already
     gone off sideways — and the line is cut back by the head's length as
     well, so what is left is a triangle at the border and a line starting
     somewhere past it, with clear paper in between. That is the detached
     arrowhead: not a drawing fault but a run-out too short to hold the
     head that was put on it. */
  const headRoom = p.head ? ARROW_LEN + EDGE_CORNER_R : 0;
  const floor = Math.max(headRoom,
    rings ? dec + EDGE_CORNER_R + ARROW_LEN : Math.max(STUB_MIN, dec + 1));
  if(!other) return Math.max(STUB, floor);
  const nrm = SIDE_NORMAL[p.side];
  if(!nrm) return Math.max(STUB, floor);
  /* What matters is not how far away the other end is, but how much room
     lies in FRONT of this port — the distance to the other end measured
     along the direction this port faces. Two entries can be far apart
     overall and still have almost nothing between their facing edges, and
     it was exactly that case that broke: both run-outs marched past each
     other into the gap and the elbow had to doubled back to reconnect.
     Ports that face away from each other get the shortest run-out of all,
     since the route has to go around regardless and a long one only makes
     the detour bigger. */
  const room = (other.x - p.x) * nrm.x + (other.y - p.y) * nrm.y;
  if(room <= 0) return floor;
  return Math.max(floor, Math.min(STUB, room / 2.4));
}
function stubPoint(p, other){
  const nrm = SIDE_NORMAL[p.side] || {x:0,y:0};
  // A port may name its own run-out length; the amalgam bar does, because
  // it needs a shorter one than the geometry would otherwise pick.
  const len = (typeof p.stub === 'number') ? p.stub : stubLength(p, other);
  return {x: p.x + nrm.x*len, y: p.y + nrm.y*len, keep: true};
}

/* ---------------------------------------------------------------------
   Guaranteed obstacle-free routing (A* over a coordinate lattice).

   The handful of stock shapes above cover the ordinary cases beautifully
   and cost almost nothing, but they can only ever bend twice — so when a
   node sits squarely in the way there are arrangements none of them can
   solve, and the connector had no choice but to run over the box. This is
   the fallback for exactly those cases, and unlike the old fixed sweep of
   bypass lanes it will find a route whenever one exists, with as many 90°
   bends as it takes.

   The lattice is the standard construction for orthogonal diagram
   routing: take the interesting X coordinates (each obstacle's two
   margins, plus both endpoints) and the interesting Y coordinates, and
   cross them. Any obstacle-free orthogonal path can be deformed onto that
   grid without crossing anything new, so searching it loses nothing — and
   it stays small (a few dozen lines each way) no matter how large the
   chart's actual coordinates are.

   Cost is length plus a turn charge, so among equally clear routes it
   returns the straightest one rather than a staircase.
   ------------------------------------------------------------------ */
const LATTICE_MARGIN = 14;      // clearance kept around each obstacle
const LATTICE_TURN_COST = 30;   // how much a corner costs, in path-length units
const LATTICE_MAX = 46;         // cap per axis, so the search can't blow up

/* `must` names coordinates the result may not thin away, whatever else it
   drops — the two endpoints, which the search looks up by value and cannot
   start or finish without. Thinning the MIDDLE is what this does, and the
   endpoints sit in the middle of a sorted list as often as not: lose one
   and the lookup returns undefined, the search gives up, and the connector
   quietly goes back to being drawn over whatever is in the way. */
function uniqSorted(values, limit, must){
  const out = Array.from(new Set(values.map(v=>Math.round(v)))).sort((a,b)=>a-b);
  if(out.length <= limit) return out;
  // Too many lines: keep the ends and thin the middle evenly rather than
  // truncating one side of the chart away.
  const step = out.length/limit, kept = [];
  for(let i=0;i<limit;i++) kept.push(out[Math.floor(i*step)]);
  kept[kept.length-1] = out[out.length-1];
  (must || []).forEach(v=> kept.push(Math.round(v)));
  return Array.from(new Set(kept)).sort((a,b)=>a-b);
}
function pointInsideAny(x, y, obstacles){
  for(const r of obstacles){
    if(x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true;
  }
  return false;
}
function segmentBlocked(x1, y1, x2, y2, obstacles){
  for(const r of obstacles){
    if(segIntersectsRect(x1,y1,x2,y2,r)) return true;
  }
  return false;
}
// s1/s2 are the stub points; the returned polyline runs between them.
/* How far outside the two endpoints' bounding box a box can sit and still
   matter to the route between them. Generous, so a connector can still be
   sent well around an obstruction, but finite. */
const LATTICE_CORRIDOR = 240;
function latticeRoute(s1, s2, allObstacles){
  /* Only the boxes anywhere near this pair take part.

     This is not merely an economy. The lattice is capped at LATTICE_MAX
     lines per axis, and it used to be fed the edges of EVERY box on the
     chart — so on a busy chart the relevant coordinates, the ones actually
     around these two entries, were thinned out to fit alongside coordinates
     from boxes hundreds of units away that no route between these two could
     ever touch. The search was doing far more work on a far worse map.
     Confining it to the corridor spends the whole budget where the route
     is. */
  const lo = {x: Math.min(s1.x, s2.x) - LATTICE_CORRIDOR, y: Math.min(s1.y, s2.y) - LATTICE_CORRIDOR};
  const hi = {x: Math.max(s1.x, s2.x) + LATTICE_CORRIDOR, y: Math.max(s1.y, s2.y) + LATTICE_CORRIDOR};
  const obstacles = allObstacles.filter(r=>
    r.x1 >= lo.x && r.x0 <= hi.x && r.y1 >= lo.y && r.y0 <= hi.y);

  const xs = [s1.x, s2.x], ys = [s1.y, s2.y];
  obstacles.forEach(r=>{
    xs.push(r.x0 - LATTICE_MARGIN, r.x1 + LATTICE_MARGIN);
    ys.push(r.y0 - LATTICE_MARGIN, r.y1 + LATTICE_MARGIN);
  });
  // A corridor midway between the two endpoints on each axis gives the
  // search a natural lane to use when it has to go the long way round.
  xs.push((s1.x+s2.x)/2); ys.push((s1.y+s2.y)/2);
  const X = uniqSorted(xs, LATTICE_MAX, [s1.x, s2.x]);
  const Y = uniqSorted(ys, LATTICE_MAX, [s1.y, s2.y]);
  const xi = new Map(X.map((v,i)=>[v,i])), yi = new Map(Y.map((v,i)=>[v,i]));
  const startX = xi.get(Math.round(s1.x)), startY = yi.get(Math.round(s1.y));
  const goalX  = xi.get(Math.round(s2.x)), goalY  = yi.get(Math.round(s2.y));
  if(startX===undefined || startY===undefined || goalX===undefined || goalY===undefined) return null;

  const W = X.length, H = Y.length;
  const blocked = new Uint8Array(W*H);
  for(let i=0;i<W;i++) for(let j=0;j<H;j++){
    if(pointInsideAny(X[i], Y[j], obstacles)) blocked[j*W+i] = 1;
  }
  const idx = (i,j)=> j*W+i;
  const startI = idx(startX,startY), goalI = idx(goalX,goalY);
  blocked[startI] = 0; blocked[goalI] = 0;

  const dist = new Float64Array(W*H).fill(Infinity);
  const prev = new Int32Array(W*H).fill(-1);
  const dirOf = new Int8Array(W*H).fill(-1);   // 0 = arrived horizontally, 1 = vertically
  const seen = new Uint8Array(W*H);
  dist[startI] = 0;
  const heuristic = (i,j)=> Math.abs(X[i]-X[goalX]) + Math.abs(Y[j]-Y[goalY]);

  /* The frontier, as a binary heap.

     It used to be a linear scan over every cell of the lattice to find the
     next one to expand — simple, and fine on the handful of cells the
     search was originally written for, but the lattice can reach a couple
     of thousand cells and the scan then runs once per expansion: quadratic
     in the size of the map, and by far the most expensive thing the router
     did. A heap answers the same question in log time and picks exactly the
     same cell, so the routes are unchanged.

     Stale entries are left in the heap rather than removed — a cell whose
     distance improves is simply pushed again, and the copy with the worse
     score is skipped when it surfaces, since by then the cell is settled. */
  /* Room for every cell to be pushed once per neighbour that can improve
     it, which on a four-connected lattice is four times — the price of
     leaving stale entries in rather than removing them. Sized for one
     copy per cell, the guard below started dropping frontier entries on a
     busy chart, and the search returned a worse route or none at all. */
  const heapCap = W*H*4 + 8;
  const heapK = new Int32Array(heapCap);
  const heapF = new Float64Array(heapCap);
  let heapN = 0;
  function heapPush(k, f){
    if(heapN >= heapK.length) return;          // the heap is sized for the worst case
    let i = heapN++;
    heapK[i] = k; heapF[i] = f;
    while(i > 0){
      const parent = (i-1) >> 1;
      if(heapF[parent] <= heapF[i]) break;
      const tk = heapK[parent], tf = heapF[parent];
      heapK[parent] = heapK[i]; heapF[parent] = heapF[i];
      heapK[i] = tk; heapF[i] = tf;
      i = parent;
    }
  }
  function heapPop(){
    if(!heapN) return -1;
    const top = heapK[0];
    heapN--;
    if(heapN){
      heapK[0] = heapK[heapN]; heapF[0] = heapF[heapN];
      let i = 0;
      for(;;){
        const l = i*2+1, r = l+1;
        let m = i;
        if(l < heapN && heapF[l] < heapF[m]) m = l;
        if(r < heapN && heapF[r] < heapF[m]) m = r;
        if(m === i) break;
        const tk = heapK[m], tf = heapF[m];
        heapK[m] = heapK[i]; heapF[m] = heapF[i];
        heapK[i] = tk; heapF[i] = tf;
        i = m;
      }
    }
    return top;
  }
  heapPush(startI, heuristic(startX, startY));

  for(;;){
    let best = -1;
    while(heapN){
      const k = heapPop();
      if(!seen[k]){ best = k; break; }
    }
    if(best === -1) return null;
    if(best === goalI) break;
    seen[best] = 1;
    const bi = best%W, bj = (best-bi)/W;
    const neighbours = [[bi-1,bj,0],[bi+1,bj,0],[bi,bj-1,1],[bi,bj+1,1]];
    for(const [ni,nj,ndir] of neighbours){
      if(ni<0||nj<0||ni>=W||nj>=H) continue;
      const nk = idx(ni,nj);
      if(blocked[nk] || seen[nk]) continue;
      if(segmentBlocked(X[bi],Y[bj],X[ni],Y[nj],obstacles)) continue;
      const step = Math.abs(X[ni]-X[bi]) + Math.abs(Y[nj]-Y[bj]);
      const turn = (dirOf[best]!==-1 && dirOf[best]!==ndir) ? LATTICE_TURN_COST : 0;
      const nd = dist[best] + step + turn;
      if(nd < dist[nk]){
        dist[nk] = nd; prev[nk] = best; dirOf[nk] = ndir;
        heapPush(nk, nd + heuristic(ni, nj));
      }
    }
  }
  const path = [];
  for(let k = goalI; k !== -1; k = prev[k]){
    const i = k%W, j = (k-i)/W;
    path.push({x:X[i], y:Y[j]});
    if(k === startI) break;
  }
  path.reverse();
  return path.length ? path : null;
}

// p1/p2 carry a .side; lane is a small per-edge offset that keeps sibling
// connectors off each other's mid-lines.
// Clearance is judged in two parts. The first and last segments run from a
// port to its own stub — they cross their own node's border by definition,
// so they're only checked against OTHER nodes. Everything in between is
// checked against every node including the two being connected, which is
// what makes a connector actually go around its target instead of through
// it when both ends use the same side (right to right, bottom to bottom,
// and so on). Before this, the endpoints' own boxes were excluded from the
// whole path, so such a route could tunnel straight through the node it
// was arriving at and nothing objected.
function pathClearParts(pts, midObstacles, endObstacles){
  for(let i=0;i<pts.length-1;i++){
    const a = pts[i], b = pts[i+1];
    const isEnd = (i === 0 || i === pts.length-2);
    const rects = isEnd ? endObstacles : midObstacles;
    for(const rect of rects){
      if(segIntersectsRect(a.x,a.y,b.x,b.y,rect)) return false;
    }
  }
  return true;
}

/* Which way a segment runs, or nothing if it runs both ways at once. */
function segDir(a, b){
  const dx = b.x - a.x, dy = b.y - a.y;
  if(Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
  if(Math.abs(dx) < 0.5) return {x:0, y: dy > 0 ? 1 : -1};
  if(Math.abs(dy) < 0.5) return {x: dx > 0 ? 1 : -1, y:0};
  return null;
}
function isOrthPath(pts){
  for(let i = 0; i < pts.length - 1; i++) if(!segDir(pts[i], pts[i+1])) return false;
  return true;
}
/* The two ends are not negotiable: a connector leaves a port at right
   angles to the side it is on and arrives at one the same way, and a
   simplification that turns the last leg sideways has drawn a different
   connector rather than a tidier one. */
function sameEndDirs(a, b){
  const a0 = segDir(a[0], a[1]), b0 = segDir(b[0], b[1]);
  const a1 = segDir(a[a.length-2], a[a.length-1]);
  const b1 = segDir(b[b.length-2], b[b.length-1]);
  if(!a0 || !b0 || !a1 || !b1) return false;
  return a0.x === b0.x && a0.y === b0.y && a1.x === b1.x && a1.y === b1.y;
}
/* Take the bends out of a route that does not need them.
 *
 * The stock joining shapes are two corners at most, so nothing they
 * produce can be simplified. The lattice search is different: it is asked
 * for a way THROUGH and answers with one, and its answer is a staircase —
 * steps of eight or ten pixels, one after another, in a corridor wide
 * enough for a single straight run. Nothing is in the way of that run; the
 * search simply never looked for it, because it walks a grid and every
 * grid step is as cheap as the last.
 *
 * So the route is worked over afterwards: any three consecutive segments
 * that can be replaced by two are, provided the shorter route still clears
 * everything and still leaves and arrives the way it did. Repeated until
 * nothing more will collapse, that turns a staircase into the L or the Z
 * the corridor could always have held.
 */
function straightenOrth(pts, ok){
  if(!pts || pts.length < 5) return pts;
  let cur = pts;
  for(let pass = 0; pass < 8; pass++){
    let changed = false;
    for(let i = 0; i + 3 < cur.length && !changed; i++){
      const A = cur[i], D = cur[i+3];
      for(const mid of [{x:A.x, y:D.y}, {x:D.x, y:A.y}]){
        const cand = tidyPoints(cur.slice(0, i+1).concat([mid], cur.slice(i+3)));
        if(cand.length >= cur.length) continue;
        if(!isOrthPath(cand) || !sameEndDirs(cand, pts)) continue;
        if(!ok(cand)) continue;
        cur = cand; changed = true; break;
      }
    }
    if(!changed) break;
  }
  return cur;
}
function orthPointsAvoiding(p1, p2, excludeIds, lane){
  const endObstacles = obstacleRects(excludeIds);   // everything but the two endpoints
  const midObstacles = obstacleRects(null);         // every node, endpoints included
  let s1 = stubPoint(p1, p2), s2 = stubPoint(p2, p1);
  /* Two ports facing the SAME way share one run-out level.
   *
   * Both ends of a connector between two entries side by side leave
   * upwards, say, and the joining shape then has to bridge them: it picks
   * a level between the two stub points, which is BEHIND each of them. So
   * each end ran out past the level it then came back to — a fold of a few
   * pixels at both ends, drawn as a corner going one way immediately
   * followed by a corner going the other. It looked like a second line
   * poking out of the connector, and it got worse the longer the run-out
   * was made.
   *
   * Levelling the two is enough: with both stub points the same distance
   * out, the bridge is a straight run between them and neither end folds
   * back. The one that has to grow is the shorter, so neither ends up
   * inside its own entry's border. */
  const n1 = SIDE_NORMAL[p1.side], n2 = SIDE_NORMAL[p2.side];
  if(n1 && n2 && n1.x === n2.x && n1.y === n2.y){
    /* The same LEVEL, not the same distance: the two ports rarely sit at
       the same height, so equal run-outs still land on different lines and
       the bridge between them still folds. */
    const proj = (q)=> q.x*n1.x + q.y*n1.y;
    /* Measured from the PORTS with a full run-out each, not from the stub
       points as they came.
     *
       A stub is shortened when there is little room in front of the port —
       which is the right answer for two ports FACING each other, where a
       long run-out from both would have them march past one another. Two
       ports facing the SAME way never do that: they share one level, and
       whatever room lies between them is not room the run-out has to fit
       into. Taking the shortened stubs anyway made the level depend on
       which port was deeper: with the shallower one carrying an arrowhead
       — which has a run-out floor of its own — the shared level tracked
       the deeper port until the two crossed and then dropped to the
       OTHER's bare minimum, a few pixels clear of its border. A few pixels
       is not enough to pass a neighbouring box, so every stock shape was
       rejected and the search took over, and the run jumped to wherever
       the search happened to put it. From the outside: dragging an entry
       up past its neighbour, the bend shrank, shrank, and then leapt.
     *
       A full run-out from each port, and the deeper one wins. The level is
       then max(port) + STUB whichever way round they are, so it follows
       the deeper port down and stops — and past that the only thing that
       grows is the moving entry's own leg, which is what a reader dragging
       an entry away expects to see. A port that names its own run-out (the
       amalgam bar does) still gets the one it asked for. */
    const runOut = (p)=> (typeof p.stub === 'number') ? p.stub : stubLength(p, null);
    const lvl = Math.max(proj(p1) + runOut(p1), proj(p2) + runOut(p2));
    const put = (p)=>{
      const d = lvl - proj(p);
      return {x: p.x + n1.x*d, y: p.y + n1.y*d, keep: true};
    };
    s1 = put(p1); s2 = put(p2);
  }
  const lanes = [];
  if(lane) lanes.push(lane, -lane);
  // Not crossing a node is a hard requirement, not one term in a total —
  // blending it into the score meant a route that cleared every box could
  // still lose to one that didn't, just by grazing enough other
  // connectors. So clearance is compared first and the score only breaks
  // ties between candidates that are equally clear.
  let best = null, bestScore = Infinity, bestClear = false, bestMid = null;
  const consider = joins=>{
    for(const mid of joins){
      const pts = tidyPoints([p1, ...mid, p2]);
      const clear = pathClearParts(pts, midObstacles, endObstacles);
      if(bestClear && !clear) continue;
      const sc = scorePath(pts, endObstacles);
      if(clear && !bestClear){ bestClear = true; bestScore = sc; best = pts; bestMid = mid; continue; }
      if(sc < bestScore){ bestScore = sc; best = pts; bestMid = mid; }
    }
  };
  const barKey = routeBarKey(p1, p2);
  consider(joinCandidates(s1, s2, lanes, barKey ? routeBars.get(barKey) : null));
  // Only fall back to the search when no stock shape got through — it's
  // much more work than the four candidates above, and for most
  // connectors one of them is already perfect. The search runs against the
  // full obstacle set, so the route it finds already goes around both
  // endpoint boxes rather than needing to be checked for it afterwards.
  if(!bestClear){
    const routed = latticeRoute(s1, s2, midObstacles);
    if(routed){
      const pts = tidyPoints([p1, ...routed, p2]);
      // Take it whenever it actually clears the boxes, however long or
      // bendy — a connector that reads correctly beats a short one drawn
      // straight over a node. Bendy is then taken out of it: see
      // straightenOrth for why the search leaves steps behind.
      if(pathClearParts(pts, midObstacles, endObstacles)){
        best = straightenOrth(pts,
          cand=> pathClearParts(cand, midObstacles, endObstacles));
        bestClear = true;
      }
    }
  }
  /* What was drawn is what the next frame starts from. A route that had to
     fall through to the search has no crossbar to remember, so the memory
     is cleared rather than left pointing at a lane this connector no longer
     uses. */
  if(barKey){
    const bar = barOfMid(bestMid);
    if(bar) routeBars.set(barKey, bar); else routeBars.delete(barKey);
  }
  return unfoldEnds(best || tidyPoints([p1, s1, s2, p2]), p1, p2);
}
/* No end may run out PAST the line it then comes back to.
 *
 * The joining shapes bridge two run-out points, and where the bridge falls
 * short of one of them that end goes out, turns, comes back the way it
 * came, and turns again — a fold of a few pixels drawn as two corners on
 * top of each other. It reads as a second line poking out of the
 * connector, and it is what a run-out being made longer makes worse rather
 * than better.
 *
 * Fixing it is a matter of pulling the run-out back to the level the route
 * actually uses — never closer to the entry than its own border needs,
 * which is what portClearance answers. */
function unfoldEnds(pts, p1, p2){
  if(!pts || pts.length < 3) return pts;
  const out = pts.map(q=> ({...q}));
  const fix = (iPort, iStub, iNext, port)=>{
    const a = out[iPort], bq = out[iStub], c = out[iNext];
    const nx = bq.x - a.x, ny = bq.y - a.y;
    const len = Math.hypot(nx, ny);
    if(len < 0.01) return;
    const ux2 = nx/len, uy2 = ny/len;
    const over = (bq.x - c.x)*ux2 + (bq.y - c.y)*uy2;
    if(over <= 0.01) return;
    /* Never all the way back onto the port.
     *
       The pull used to floor at portClearance, which for an ordinary entry
       with one plain border is ZERO — so an end could be pulled until its
       run-out sat exactly on the port, the tidy pass then merged the two
       coincident points, and what was left was a two-point path between
       two ports that are almost never aligned: a DIAGONAL, drawn on a
       chart whose every other line turns square corners. The arrowhead,
       which takes its angle from that last segment, then came in at a
       slant too. Both are visible in an entry feeding a merge alongside
       other connectors, which is where the case arises.
     *
       A run-out is what makes a connector leave its entry square-on, so it
       is kept — the fold this function exists to remove is worth removing
       only down to that point. */
    const floor = Math.max(STUB_MIN, portClearance(port));
    const pull = Math.min(over, Math.max(0, len - floor));
    bq.x -= ux2*pull; bq.y -= uy2*pull;
  };
  fix(0, 1, 2, p1);
  fix(out.length-1, out.length-2, out.length-3, p2);
  return tidyPoints(out);
}
/* The wavy connector style, built from the same exact half-waves as the
   pocket border. Each straight run of the skeleton keeps a flat lead-in
   and lead-out — a long one at the two true ends, a short one at each
   elbow — so the line reads as straight, then wavy, then straight, and
   every corner is met on the baseline from both sides with nothing to
   reconcile. The old version faded a sampled sine in and out with an
   envelope and then smoothed the samples, which is where its softness and
   its faint kinks at the corners came from. */
// One dial: how long each semicircle is. Its height follows.
const EDGE_WAVE_LEN = 5.4;
/* The wave goes quiet well before a bend and only picks up again well
   after it. A corner is where the eye reads the line's direction, and a
   crest sitting on it hides that; a plain elbow with the ripple resuming
   further along still reads as one continuous wavy line. */
/* The quiet stretches at the ends and around a bend. They exist so a
   crest never lands exactly on a corner (where it hides the direction the
   line turns) or on an arrowhead — but they were sized for the old, much
   longer sine, and against a 7-unit semicircle they read as long bald
   patches. Cut to about the length of a single arc: enough to keep a
   corner legible, short enough that the line reads as wavy throughout. */
const EDGE_WAVE_END_FLAT = 2, EDGE_WAVE_CORNER_FLAT = 2.5;
/* Collinear points are not corners.
 *
 * A routed connector always carries a short stub at each end, standing the
 * line off the entry's border before it turns. On a straight run those
 * stubs are collinear with the middle — the "corner" between them is a
 * corner of nothing — but wavyPath treated each as its own run, and that
 * cost twice over. It spent a corner flat at each false join, so a short
 * connector was mostly bald with a couple of arcs marooned in the middle;
 * and the direction vote read the collinear neighbour as a turn, where the
 * dot product is exactly zero and there is nothing to learn.
 *
 * Merging them first makes a straight connector one run again — waved end
 * to end, and with no interior point to vote wrongly about which way. */
function mergeCollinear(pts){
  if(pts.length < 3) return pts;
  const out = [pts[0]];
  for(let i=1;i<pts.length-1;i++){
    const a = out[out.length-1], b = pts[i], c = pts[i+1];
    const ux = b.x-a.x, uy = b.y-a.y, vx = c.x-b.x, vy = c.y-b.y;
    // |cross| is the area of the parallelogram: zero when the three are in
    // line. Scaled by the leg lengths so the tolerance means the same
    // thing on a long run as on a short one.
    const cross = Math.abs(ux*vy - uy*vx);
    const scale = Math.hypot(ux,uy) * Math.hypot(vx,vy);
    const sameWay = (ux*vx + uy*vy) > 0;
    if(scale > 0 && sameWay && cross / scale < 0.002) continue;   // drop b
    out.push(b);
  }
  out.push(pts[pts.length-1]);
  return out;
}
/* `trimIn`/`trimOut` are how much of each end an arrowhead will cover.
   They are handled HERE rather than by shortening the point list, because
   shortening it moves the wave: every run lays its arcs out relative to
   its own length, so a run that lost 8px at one end had its whole ripple
   slide by half that. Laying the arcs out on the FULL geometry and then
   simply not drawing the ones an arrowhead sits on keeps every crest
   exactly where it was — turning a head on hides a ripple, it never
   shifts the pattern. */
function wavyPath(rawPts, trimIn, trimOut){
  const cutIn = Math.max(0, trimIn || 0), cutOut = Math.max(0, trimOut || 0);
  const pts = mergeCollinear(rawPts);
  let total = 0;
  for(let i=0;i<pts.length-1;i++) total += Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y);
  const last = pts[pts.length-1];
  if(total < 4) return `M${pts[0].x},${pts[0].y} L${last.x},${last.y}`;

  // The visible path begins and ends inside the geometry the wave is laid
  // out on, by however much the arrowheads cover.
  const headStart = (()=>{
    const b = pts[1] || last, L = Math.hypot(b.x-pts[0].x, b.y-pts[0].y) || 1;
    const k = Math.min(cutIn, L);
    return {x: pts[0].x + (b.x-pts[0].x)/L*k, y: pts[0].y + (b.y-pts[0].y)/L*k};
  })();
  let d = `M${headStart.x.toFixed(2)},${headStart.y.toFixed(2)}`;
  for(let i=0;i<pts.length-1;i++){
    const a = pts[i], b = pts[i+1];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if(len < 0.5) continue;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;
    let nx = -uy, ny = ux;
    /* Which side the arcs bulge toward.
     *
     * The left normal is an arbitrary choice, and on an elbow it was the
     * wrong one: both runs ended up bulging into the corner the connector
     * turns around, so the arcs crowded the inside of the bend and the
     * elbow read as pinched. They belong on the outside, where there is
     * room and where they follow the line's own sweep.
     *
     * "Outside" is decided by where the path goes next. At the far end, the
     * following run heads to the inside of the turn, so the normal is
     * flipped when it agrees with that direction; at the near end the run
     * we came FROM is on the inside, so the test is the same one reversed.
     * A run bent at both ends votes twice — the two agree on an elbow, and
     * cancel on an S-bend, where neither side is outside and the default
     * stands. */
    let vote = 0;
    const nextP = pts[i+2], prevP = pts[i-1];
    /* A neighbour that continues straight on has a dot product of exactly
       zero with the normal. That is not a vote for the far side — it is no
       vote at all, and counting it as one (which `> 0 ? 1 : -1` did) was
       enough to keep a straight connector from ever reaching its default. */
    const VOTE_EPS = 1e-6;
    if(nextP){
      const d = (nextP.x - b.x)*nx + (nextP.y - b.y)*ny;
      if(Math.abs(d) > VOTE_EPS) vote += d > 0 ? 1 : -1;
    }
    if(prevP){
      const d = (prevP.x - a.x)*nx + (prevP.y - a.y)*ny;
      if(Math.abs(d) > VOTE_EPS) vote += d > 0 ? 1 : -1;
    }
    if(vote > 0){ nx = -nx; ny = -ny; }
    else if(vote === 0){
      /* A straight connector has no turn to take its cue from, and the
         left normal is not a meaningful default — on a horizontal run it
         points DOWN, so an unbent connector hung its arcs below the line
         when everything else on the chart (a note, a leader card) sits
         above it. Same convention as those: up for a horizontal run, left
         for a vertical one. */
      if(Math.abs(ny) > Math.abs(nx) ? ny > 0 : nx > 0){ nx = -nx; ny = -ny; }
    }
    /* Corners are rounded here exactly as they are on a plain connector.
       A wavy line used to turn square while every other line on the chart
       turned with a radius, so a chart mixing the two looked like two
       different drawings. The radius is taken out of the run at each end
       that HAS a corner, and the flat sits inside what is left — so the
       wave still stops short of the bend rather than running into the arc. */
    const isFirst = (i === 0), isLast = (i === pts.length-2);
    const prevSeg = isFirst ? 0 : Math.hypot(a.x-pts[i-1].x, a.y-pts[i-1].y);
    const nextSeg = isLast  ? 0 : Math.hypot(pts[i+2].x-b.x, pts[i+2].y-b.y);
    // Two corners sharing this leg get half of it each, so their arcs
    // cannot overlap — the same rule roundedPath uses.
    const rIn  = isFirst ? 0 : Math.min(EDGE_CORNER_R, len/2, prevSeg/2);
    const rOut = isLast  ? 0 : Math.min(EDGE_CORNER_R, len/2, nextSeg/2);
    const straight = len - rIn - rOut;

    const cap = straight / 3;
    const flatIn  = Math.min(isFirst ? EDGE_WAVE_END_FLAT : EDGE_WAVE_CORNER_FLAT, cap);
    const flatOut = Math.min(isLast  ? EDGE_WAVE_END_FLAT : EDGE_WAVE_CORNER_FLAT, cap);
    const runLen = straight - flatIn - flatOut;
    const from = rIn + flatIn;
    // Where this segment's drawing stops: short of the corner by its radius.
    const stopX = b.x - ux*rOut, stopY = b.y - uy*rOut;

    /* What an arrowhead covers on THIS leg, as distances measured from a.
       Only the two outermost legs have a head on them. */
    const lo = isFirst ? cutIn : 0;
    const hi = isLast ? Math.max(lo, len - cutOut) : len;
    const stopAt = Math.min(hi, len - rOut);
    const ptAt = (t)=> `${(a.x + ux*t).toFixed(2)},${(a.y + uy*t).toFixed(2)}`;
    if(runLen < EDGE_WAVE_LEN * 1.5){
      // Too short to carry a whole wave: this run stays straight.
      d += ` L${ptAt(stopAt)}`;
    } else {
      const bumps = waveBumps(runLen, EDGE_WAVE_LEN);
      // Whole arcs only; whatever is left over pads both ends equally, so
      // the ripple stays centred on the run it belongs to.
      const start = from + (runLen - bumps*EDGE_WAVE_LEN) / 2;
      // Only the arcs that lie clear of both arrowheads are drawn. The
      // rest of the leg is flat, and every drawn arc keeps the exact
      // position it would have had with no heads at all.
      let first = 0, count = bumps;
      while(first < bumps && start + first*EDGE_WAVE_LEN < lo - 0.01) first++;
      while(count > first && start + count*EDGE_WAVE_LEN > hi + 0.01) count--;
      if(count > first){
        const s0 = start + first*EDGE_WAVE_LEN;
        d += ` L${ptAt(Math.max(lo, Math.min(s0, stopAt)))}`;
        /* Carrying the phase across the arcs an arrowhead covers. The arcs
           alternate sides, and the run is drawn starting from whichever
           one is first VISIBLE — so without this the whole ripple flipped
           over the moment a head hid an odd number of arcs, which is the
           pattern shifting all over again by another route. */
        d += waveRun(a.x, a.y, ux, uy, nx, ny, s0, count - first, EDGE_WAVE_LEN, first % 2);
      }
      d += ` L${ptAt(stopAt)}`;
    }
    if(!isLast){
      // Around the corner and onto the next leg.
      const c = pts[i+2];
      const nl = Math.hypot(c.x-b.x, c.y-b.y) || 1;
      const vx = (c.x-b.x)/nl, vy = (c.y-b.y)/nl;
      d += ` Q${b.x},${b.y} ${(b.x + vx*rOut).toFixed(2)},${(b.y + vy*rOut).toFixed(2)}`;
    }
  }
  return d;
}
// The arrowhead's "overall direction" is the tangent of the underlying
// straight/elbowed SKELETON path at its very last point — never the
// rendered (possibly wavy) curve's local tangent, which is what SVG's
// orient="auto-start-reverse" would otherwise follow. Walks backward past
// any zero-length segment so a degenerate last point can't produce NaN.
function endAngleDeg(pts){
  for(let i=pts.length-1;i>0;i--){
    const a = pts[i-1], b = pts[i];
    const dx = b.x-a.x, dy = b.y-a.y;
    if(Math.hypot(dx,dy) > 0.01) return Math.atan2(dy,dx) * 180/Math.PI;
  }
  return 90;
}
// Builds a path string (plus the fixed arrowhead angle described above)
// between two already-picked ports, per the edge's style. routing (the
// path SHAPE: 90° elbows vs. a direct line) and sinusoid (an independent
// wavy-line STYLE) compose freely — split out from routeEdge so any future
// caller that already has two ports in hand can reuse the same styling
// without going through pickPorts.
/* ---------------------------------------------------------------------
   Bends set by hand.

   A connector may carry a list of points it has to pass through. They are
   stored in chart coordinates, in order from the source end, and the route
   is built from them directly: out of the first port along its own normal,
   through every bend at right angles, and into the last port along its
   normal. Nothing is searched and nothing is avoided — a route somebody
   placed by hand is the answer, not a suggestion.
   ------------------------------------------------------------------ */
function handBends(style){
  const list = (style && Array.isArray(style.bends)) ? style.bends : null;
  if(!list || !list.length) return [];
  return list
    .filter(b=> Array.isArray(b) && b.length === 2 &&
                Number.isFinite(b[0]) && Number.isFinite(b[1]))
    .map(b=> ({x: b[0], y: b[1]}));
}
/* The polyline through those points, turned into right angles.
 *
 * Each leg between two consecutive points becomes an L, and which way
 * round the L goes is decided by continuity: the first leg has to leave
 * along the source port's own normal, the last has to arrive along the
 * target's, and every leg in between starts on whichever axis the leg
 * before it finished on — so the run reads as one line turning corners
 * rather than as a chain of separate elbows. */
function bentRoute(p1, p2, bends){
  const s1 = stubPoint(p1, bends[0]);
  const s2 = stubPoint(p2, bends[bends.length - 1]);
  const chain = [s1, ...bends, s2];
  const out = [p1, s1];
  // Which axis the previous leg arrived on: 'x' means it was horizontal.
  const n1 = SIDE_NORMAL[p1.side] || {x:0, y:-1};
  let arrived = n1.x ? 'x' : 'y';
  for(let i = 1; i < chain.length; i++){
    const a = chain[i-1], b = chain[i];
    const last = (i === chain.length - 1);
    let firstAxis;
    if(last){
      // The final leg must ARRIVE along the target port's normal, so it
      // leaves this corner on the other axis.
      const n2 = SIDE_NORMAL[p2.side] || {x:0, y:-1};
      firstAxis = n2.x ? 'y' : 'x';
    } else {
      // Carry on across the axis the last leg ended on.
      firstAxis = arrived === 'x' ? 'y' : 'x';
    }
    const corner = firstAxis === 'x' ? {x:b.x, y:a.y} : {x:a.x, y:b.y};
    out.push(corner, b);
    arrived = firstAxis === 'x' ? 'y' : 'x';
  }
  out.push(p2);
  return tidyPoints(out);
}
function pathFromPorts(p1,p2,style,excludeIds,lane){
  style = style || DEFAULT_EDGE_STYLE;
  /* The router is told which ends carry an arrowhead, because a head needs
     a straight run to sit in — see stubLength. The port records themselves
     are left alone; only the copies the routing sees learn about it. */
  const r1 = Object.assign({}, p1, {head: !!style.arrowIn});
  const r2 = Object.assign({}, p2, {head: style.arrow !== false});
  /* …but where a pocket reality is at either end, the ROUTE is worked out
     as though both ends carried one.
   *
     A head needs a straight run to sit in, so an end that has one is given
     a longer run-out — and on a rippled border that difference is enough
     to change which crossbar the router picks. The consequence was that
     the same two entries were joined by three different shapes depending
     on which arrowheads happened to be switched on, and only the shape
     with both of them was right. An arrowhead is a decoration on a
     relationship, not part of it: the route it is drawn along should be
     the same either way. So the routing is done at the longer clearance
     always, and the arrows go on affecting only what is DRAWN — where the
     line stops at the border, and whether there is a head there at all. */
  const nearWave = !!(p1 && p1.wavy) || !!(p2 && p2.wavy);
  const q1 = nearWave ? Object.assign({}, r1, {head: true}) : r1;
  const q2 = nearWave ? Object.assign({}, r2, {head: true}) : r2;
  /* Bends set BY HAND take the route over.
   *
   * The automatic router is very good at "get from here to there without
   * crossing anything", and no good at all at the other thing a reader
   * wants from a connector: to make it go a particular way, because that
   * way says something. A line taken deliberately round the outside of a
   * group, or brought down a corridor two other lines already use, is a
   * statement about the chart; the shortest clear route is not. So a
   * connector may be given points it must pass through, and where it has
   * them they ARE the route — no search, no avoidance, no second-guessing
   * a placement somebody made on purpose. */
  const hand = handBends(style);
  const pts = sinkEnds(
    hand.length ? bentRoute(q1, q2, hand)
      : style.routing === 'straight' ? [p1,p2]
      : squareUp(orthPointsAvoiding(q1,q2,excludeIds,lane), q1, q2),
    r1, r2);
  if(style.routing !== 'straight' || hand.length) registerRoutedSegments(pts);
  const d = style.sinusoid ? wavyPath(pts) : roundedPath(pts, EDGE_CORNER_R);
  return { d, angleDeg: endAngleDeg(pts), pts };
}
// ports is {p1, p2, lane} from resolvePorts(); when absent, fall back to
// the automatic sides at each side's midpoint.
function routeEdge(a,b,style,ports){
  let p1, p2, lane = 0;
  if(ports){ p1 = ports.p1; p2 = ports.p2; lane = ports.lane || 0; }
  else {
    const sides = autoSides(a,b);
    p1 = portOnSide(a, sides.from, 0, 1);
    p2 = portOnSide(b, sides.to, 0, 1);
  }
  return pathFromPorts(p1,p2,style,new Set([a.id,b.id]),lane);
}

/* ---------------------------------------------------------------------
   Port assignment.

   Resolves, for every lineage edge in one pass: which side of each node it
   uses (its own saved fromSide/toSide if it has them, otherwise the
   geometric guess), and then where along that side it sits. Ports sharing
   a side are ordered by where the far end of each connector actually lies
   along that side's axis, so a fan of connectors reads left-to-right (or
   top-to-bottom) in the same order as the nodes they run to — which is
   what keeps them from crossing each other on the way out.

   Spacing is purely (i+1)/(count+1) of the side, so a side holds any
   number of connectors; they just sit closer together as more arrive.
   ------------------------------------------------------------------ */
/* `sideOverrides`, when given, is edge -> {fromSide, toSide}: sides
   decided somewhere else that this assignment has to know about.
 *
 * A lineage feeding a merge is the case. Which side of its own entry it
 * leaves by is chosen by the merge, from where the bar hangs — and until
 * that answer reached here, the assignment spaced the ports of that side
 * without counting it. The merged connector then took the middle of the
 * edge for itself while an ordinary connector on the same edge was placed
 * as though it were alone: two lines a few pixels apart, one centred and
 * one not, on a side they were supposed to be sharing. */
/* A connector sent to the side a callout's leader arrives at is moved to
   the next best one. Chosen rather than refused: the reader asked for a
   connection, and a connection that arrives one edge round is a far better
   answer than one that does not arrive at all — or one that lands on top
   of the leader and reads as a single line running through the card. */
const SIDE_FALLBACK = {top:['bottom','right','left'], bottom:['top','right','left'],
                       left:['right','top','bottom'], right:['left','top','bottom']};
function avoidLeaderSide(n, side){
  if(!isCalloutNode(n)) return side;
  const taken = calloutLeaderSide(n);
  if(!taken || taken !== side) return side;
  return (SIDE_FALLBACK[side] || [])[0] || side;
}
function resolvePorts(edgesList, sideOverrides){
  const ends = [];   // one entry per edge end
  edgesList.forEach(e=>{
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if(!a || !b) return;
    const style = edgeStyleFor(e.from, e.to);
    const auto = autoSides(a,b);
    const over = sideOverrides && sideOverrides.get(e);
    let fromSide = (over && over.fromSide) || style.fromSide || auto.from;
    let toSide = (over && over.toSide) || style.toSide || auto.to;
    /* …but never the side a callout's own leader already occupies. */
    fromSide = avoidLeaderSide(a, fromSide);
    toSide = avoidLeaderSide(b, toSide);
    ends.push({edge:e, end:'from', nodeId:e.from, node:a, side:fromSide, ring:style.fromRing, other:b});
    ends.push({edge:e, end:'to',   nodeId:e.to,   node:b, side:toSide,   ring:style.toRing,   other:a});
  });

  /* One family per SIDE, whatever ring each connector attaches to. The
     rings are only a few pixels apart, so treating them as separate
     families meant two connectors on the same edge of an entry could be
     spaced as if the other did not exist and end up all but on top of each
     other. Sharing the spacing keeps them apart across the whole edge;
     each port still sits on its own ring's line, so a connector still
     visibly belongs to the border it was drawn from. */
  const groups = new Map();  // "nodeId|side" -> [end, ...]
  ends.forEach(en=>{
    const key = en.nodeId + '|' + en.side;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(en);
  });

  const result = new Map();  // edge -> {p1, p2, lane}
  groups.forEach(list=>{
    // Along a top/bottom side the ports run left-to-right, so order them by
    // the other node's x; along a left/right side they run top-to-bottom,
    // so order by its y.
    const byX = sideIsVertical(list[0].side);
    list.sort((m1,m2)=> byX
      ? (m1.other.x+m1.other.w/2) - (m2.other.x+m2.other.w/2)
      : (m1.other.y+m1.other.h/2) - (m2.other.y+m2.other.h/2));
    list.forEach((en,i)=>{
      const p = portOnSide(en.node, en.side, i, list.length, en.ring||0);
      if(!result.has(en.edge)) result.set(en.edge, {lane:0});
      const rec = result.get(en.edge);
      if(en.end==='from'){ rec.p1 = p; }
      else { rec.p2 = p; rec.toSide = en.side; rec.toRing = en.ring||0; }
      // Index within the busiest of its two sides becomes the edge's lane
      // offset, so connectors leaving a crowded side each bend through
      // their own mid-line rather than all sharing one.
      rec.lane = Math.max(rec.lane, i*12);
    });
  });
  alignFacingPorts(result);
  return result;
}

/* Two ports that very nearly line up are made to line up exactly.
 *
 * A connector between two entries whose facing edges are a few pixels out
 * of true has to get from one to the other somehow, and an orthogonal
 * router's only answer is a step: out, across four pixels, and on. Two
 * corners and a stub, for a misalignment nobody meant and nobody can see —
 * it reads as a fault in the drawing rather than as a fact about the
 * chart, and it is the first thing anyone notices on a page full of
 * otherwise straight lines. Drawing tools handle this at the port rather
 * than in the router, and so does this: a port's place along its side is
 * ours to choose, so a few pixels of that freedom are spent closing the
 * gap and the connector comes out dead straight.
 *
 * Only ports that FACE each other, only a misalignment small enough to be
 * an accident, and only as far as each side's spacing allows — a side with
 * four connectors on it has almost no room and gives almost none. Past
 * that the step stays, because then it is a real offset and hiding it
 * would move the connector somewhere it does not belong. */
/* Whether an entry is a merge with lineages actually flowing into it —
   the case whose ports belong to the bar rather than to the pair. */
function isAmalgamTarget(id){
  const n = nodes.get(id);
  return !!n && (n.shape || '') === 'amalgam' &&
         Array.isArray(n.parents) && n.parents.length > 1;
}
/* How far apart two facing ports may be and still be brought into line.
   Raised from fourteen once the slack calculation proved to be the real
   limiter: a side with one connector on it has room to spare, and an
   offset of twenty pixels between two entries in a column is exactly the
   accident this exists to absorb. A side with several connectors still
   gives almost nothing, because portSlack still governs. */
const PORT_ALIGN_MAX = 26;
function alignFacingPorts(result){
  result.forEach((rec, e)=>{
    const p1 = rec.p1, p2 = rec.p2;
    if(!p1 || !p2) return;
    /* A lineage feeding a MERGE is not straightened against the entry.
     *
     * Where it lands is decided by the bar — which hangs from the
     * lineages themselves — and drawAmalgam spends the port's slack on
     * that landing. Spending it here first tied the port to the AMALGAM'S
     * own port instead, so sliding the entry sideways slid its parents'
     * connectors along their edges to chase it: the coupling the bar's
     * arithmetic had just been freed of, put back one step earlier. */
    if(e && e.to && isAmalgamTarget(e.to)) return;
    const n1 = SIDE_NORMAL[p1.side], n2 = SIDE_NORMAL[p2.side];
    if(!n1 || !n2) return;
    if(n1.x !== -n2.x || n1.y !== -n2.y) return;
    const key = sideIsVertical(p1.side) ? 'x' : 'y';
    const off = p2[key] - p1[key];
    if(!off || Math.abs(off) > PORT_ALIGN_MAX) return;
    // Both give way, so neither is dragged the whole distance off centre.
    const moved = nudgePortAlong(p1, off/2);
    nudgePortAlong(p2, -(off - moved));
    // And whatever the two sides' slack could not close is closed anyway,
    // if it is small enough that a step would be a wobble. See PORT_SQUEEZE.
    const rest = p2[key] - p1[key];
    if(Math.abs(rest) > 0.01 && Math.abs(rest) <= PORT_SQUEEZE) movePortAlong(p1, rest);
  });
}

// Reality-archetype rendering helpers. 'mirror' fills the box with its own
// border color, so the label needs a contrast-checked text color instead of
// the fixed ink color; 'amalgam' paints the border/text with a gradient
// built from the node's colors (falls back to a flat color with <2 colors).
const svgDefs = document.getElementById('svgDefs');
// Defs created once per page-load node render (the amalgam-shape node
// border gradients) live directly in svgDefs and are never cleared. Defs
// created every time edges are (re)drawn — the merge-stem gradient and
// every edge's arrowhead marker — live in this nested group instead, so
// redrawEdges() can wipe just this group each call without also deleting
// the node-render-time gradients nodes still reference.
const edgeDefs = el('g', {id:'edgeDefs'}, svgDefs);
/* And the clips the ENTRIES make — one per picture, one per overlong
   label — in a group of their own, cleared with every render.
 *
 * They used to go straight into svgDefs, which is never cleared, so every
 * pass left another clipPath carrying the same id behind it. A fragment
 * reference resolves to the FIRST element with that id, which after the
 * first render is always the stalest one: move an entry with a portrait in
 * it and the picture was still being clipped to the circle it used to
 * stand in, so it vanished. */
const nodeDefs = el('g', {id:'nodeDefs'}, svgDefs);

/* ---------------------------------------------------------------------
   The fan-fiction weave.

   An entry tagged "fan-fiction" is not a different KIND of thing — it is
   still a reality, with the same archetype, ports and connectors as any
   other — so it keeps its own shape and gets a texture behind it instead:
   a diagonal lattice, faint, spreading a little way past the box and
   fading out. It reads at a glance across a crowded chart without adding
   another border or another colour to decode.

   One pattern and one fade serve every tagged entry: the mask works in the
   masked element's own bounding box, so the same definition centres itself
   on each entry it is used by.
   ------------------------------------------------------------------ */
const FANFIC_TAG = 'fan-fiction';
/* Tags that DO something.
 *
 * Almost every tag on this chart is a label: it names a thing the reader
 * can filter by and changes nothing about the entry that carries it.
 * A few are not — "fan-fiction" lays a weave on the canvas around every
 * entry that has it — and from the panel the two kinds looked identical,
 * so nothing said why one tag redrew the chart and its neighbour did not.
 *
 * This is the register of the ones that act. Each names what it does, in a
 * sentence the panel shows when the reader asks. Adding a tag with an
 * effect means adding it here in the same change, and the star appears on
 * its own. */
/* Two archetypes that stopped being archetypes.
 *
 * "Multiversal hub" and "local multiverse" were shapes, and being shapes
 * they were exclusive: an entry could be a hub or a pocket reality, never
 * both, and choosing one threw the other's outline away. But neither was
 * ever really an OUTLINE — a hub is a box with an echo spreading out of
 * it, a local multiverse a box with copies of itself stacked behind — and
 * an echo or a stack is something an entry HAS, not something it IS.
 *
 * As tags they compose: a pocket reality can be a hub, a mirror reality
 * can be a local multiverse, a bio can be both, and every one of them
 * keeps its own border, its own colours and its own ports. */
const SPECIAL_TAGS = {
  [FANFIC_TAG]: 'Entries with this tag are drawn standing on a woven ground.',
  [HUB_TAG]: 'Entries with this tag are drawn with an echo spreading out of them.',
  [LOCAL_TAG]: 'Entries with this tag are drawn with a stack of near-identical worlds behind them.'
};
function nodeHasTag(n, tag){ return !!(n && n.tags && n.tags.indexOf(tag) >= 0); }
function tagIsSpecial(tag){ return Object.prototype.hasOwnProperty.call(SPECIAL_TAGS, tag); }
/* One tag, drawn as a tag. `special` and `reserved` are the two kinds that
   are set in italic: the ones that act on the entries carrying them, and
   the Untagged bucket, which is not a tag anybody wrote. */
function tagShapeHtml(text, opts){
  /* Untagged is not a tag. It is where entries with none of them show up —
     a bucket, not a label anybody wrote — so it is not drawn as a label
     either; a tag shape around it said there was a tag called "Untagged"
     and invited the reader to look for it. */
  if(opts && opts.reserved) return `<span class="tag-bucket">${escapeHtml(text)}</span>`;
  const italic = '';
  /* The star rides INSIDE the label. Set beside it, it was a separate word
     as far as the line was concerned, and on a narrow panel it wrapped to
     a line of its own — a lone asterisk under the tag it was supposed to
     be marking. */
  const star = (opts && opts.special)
    ? `<span class="tag-special" title="${escapeHtml(opts.why || '')}">*</span>` : '';
  return `<span class="tag-shape${italic}"><i class="tag-eye"></i>${escapeHtml(text)}${star}</span>`;
}
/* How far past the box the weave reaches. It has to clear the box by a
   good margin: the entry's own fill covers the middle of the patch, so
   everything you actually see of the weave is the band around it. */
const FANFIC_HALO = 38;
(function defineFanficWeave(){
  const p = el('pattern', {id:'fanfic-weave', width:13, height:13,
                           patternUnits:'userSpaceOnUse',
                           patternTransform:'rotate(45)'}, svgDefs);
  el('path', {d:'M0,0 H13 M0,0 V13', class:'fanfic-line'}, p);
  /* The same lattice, on the same grid, drawn as it looks under a light.
     A second pattern rather than a filter, so what sweeps across the weave
     is the weave itself rather than a wash of colour over it. */
  const lit = el('pattern', {id:'fanfic-weave-lit', width:13, height:13,
                             patternUnits:'userSpaceOnUse',
                             patternTransform:'rotate(45)'}, svgDefs);
  el('path', {d:'M0,0 H13 M0,0 V13', class:'fanfic-line fanfic-line-lit'}, lit);
  const grad = el('radialGradient', {id:'fanfic-fade'}, svgDefs);
  el('stop', {offset:'0%',   'stop-color':'#ffffff'}, grad);
  el('stop', {offset:'72%',  'stop-color':'#ffffff'}, grad);
  el('stop', {offset:'100%', 'stop-color':'#000000'}, grad);
  const mask = el('mask', {id:'fanfic-mask', maskContentUnits:'objectBoundingBox'}, svgDefs);
  el('rect', {x:0, y:0, width:1, height:1, fill:'url(#fanfic-fade)'}, mask);
})();

/* ---------------------------------------------------------------------
   The alignment grid.

   A ruled grid in the chart's own coordinates — the same GRID a drag snaps
   to — so it is a real reference for lining entries up rather than
   decoration. Every fifth line is drawn stronger, which is what makes it
   possible to count squares instead of merely seeing them.

   It lives in the chart's coordinate space, so it pans and zooms with the
   drawing and a line always falls exactly where an entry will snap. The
   line weights are re-divided by the zoom on every view change so they
   stay hairlines on screen at any magnification, and the fine grid steps
   aside for the coarse one once its lines would be too close together to
   tell apart.
   ------------------------------------------------------------------ */
const ALIGN_SPAN = 60000;   // world units the grid covers, centred on the origin
const alignFine = el('path', {d:`M0,0 H${GRID} M0,0 V${GRID}`, class:'align-line'},
  el('pattern', {id:'align-grid', width:GRID, height:GRID, patternUnits:'userSpaceOnUse'}, svgDefs));
const alignMajor = el('path', {d:`M0,0 H${GRID*5} M0,0 V${GRID*5}`, class:'align-line align-line-major'},
  el('pattern', {id:'align-grid-major', width:GRID*5, height:GRID*5, patternUnits:'userSpaceOnUse'}, svgDefs));
const alignGrid = el('g', {id:'alignGrid', style:'display:none;pointer-events:none;'}, bgLayer);
bgLayer.insertBefore(alignGrid, bgLayer.firstChild);
const alignGridFine = el('rect', {x:-ALIGN_SPAN/2, y:-ALIGN_SPAN/2,
  width:ALIGN_SPAN, height:ALIGN_SPAN, fill:'url(#align-grid)'}, alignGrid);
const alignGridMajor = el('rect', {x:-ALIGN_SPAN/2, y:-ALIGN_SPAN/2,
  width:ALIGN_SPAN, height:ALIGN_SPAN, fill:'url(#align-grid-major)'}, alignGrid);

const ALIGN_GRID_KEY = 'axiomNexus.alignGrid';
let alignGridOn = false;
try{ alignGridOn = localStorage.getItem(ALIGN_GRID_KEY) === '1'; }catch(e){}
// Deliberately `var`: applyTransform calls syncAlignGrid, and a `let` here
// would be unreachable — not merely false — if anything ever moved the view
// before this block ran.
var alignGridReady = true;
// Set while a drag is borrowing the grid; see showDragGrid.
var dragGridShowing = false;

// Called on every view change: keeps the ruling a hairline whatever the
// zoom, and drops the fine lines once they would read as a solid wash.
function syncAlignGrid(){
  if(!alignGridReady) return;
  const showing = alignGridOn || dragGridShowing;
  alignGrid.style.display = showing ? '' : 'none';
  if(!showing) return;
  const s = (typeof vs === 'number' && vs > 0) ? vs : 1;
  const fineVisible = s * GRID >= 5;
  alignGridFine.style.display = fineVisible ? '' : 'none';
  alignFine.style.strokeWidth = (0.55 / s).toFixed(3);
  alignMajor.style.strokeWidth = (0.95 / s).toFixed(3);
}
function setAlignGrid(on){
  alignGridOn = !!on;
  try{ localStorage.setItem(ALIGN_GRID_KEY, alignGridOn ? '1' : '0'); }catch(e){}
  const btn = document.getElementById('gridToggle');
  if(btn) btn.classList.toggle('active', alignGridOn);
  syncAlignGrid();
}
function hexLuminance(hex){
  const c = String(hex).replace('#','');
  const full = c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c.padEnd(6,'0').slice(0,6);
  const r = parseInt(full.slice(0,2),16)||0, g = parseInt(full.slice(2,4),16)||0, b = parseInt(full.slice(4,6),16)||0;
  return (0.299*r + 0.587*g + 0.114*b)/255;
}
function contrastTextColor(hex){
  return hexLuminance(hex) > 0.55 ? '#141c2b' : '#ffffff';
}
/* The colour asked for, unless it would be lost against the ground it is
   written on — in which case the plain contrasting ink. Only real hex
   values are judged: a gradient reference or a CSS variable is left alone,
   since there is no one colour to compare. */
function readableOn(want, bg){
  if(typeof want !== 'string' || typeof bg !== 'string') return want;
  if(want.charAt(0) !== '#' || bg.charAt(0) !== '#') return want;
  return Math.abs(hexLuminance(want) - hexLuminance(bg)) < 0.3
    ? contrastTextColor(bg) : want;
}
let gradientSeq = 0;
function makeGradient(colors, vertical, target){
  const id = 'grad-' + (gradientSeq++);
  const dir = vertical ? {x1:'0%', y1:'0%', x2:'0%', y2:'100%'} : {x1:'0%', y1:'0%', x2:'100%', y2:'0%'};
  const grad = el('linearGradient', {id, ...dir}, target || svgDefs);
  const n = colors.length;
  colors.forEach((c,i)=>{
    el('stop', {offset: `${n>1 ? (i/(n-1))*100 : 0}%`, 'stop-color': c}, grad);
  });
  return `url(#${id})`;
}
// Arrowheads are drawn as ordinary paths in the arrow layer above the
// entries (see drawArrowHead), not as SVG <marker>s: a marker draws in
// its own tiny coordinate box, which both broke gradient continuity and
// pinned the head to its line's stacking position.
/* ---------------------------------------------------------------------
   A connector painted with a gradient rather than one flat colour.

   The line's gradient runs along the path's own bounding box, so it reads
   as travelling from source to target. The arrowhead needs its own
   gradient: a marker draws in its own tiny coordinate box and cannot
   sample the line's, so it gets a matching two-stop fill of its own,
   oriented along the marker. Both are rebuilt every redraw alongside the
   markers, which is why they live in edgeDefs.
   ------------------------------------------------------------------ */
let edgeGradSeq = 0;
function makeEdgeGradient(colors, pts){
  const id = 'edgegrad-' + (edgeGradSeq++);
  const list = colors.length >= 2 ? colors : [colors[0], colors[0]];
  // Along the straight line between the connector's two ends, in user
  // space, so the sweep follows the direction of travel rather than the
  // arbitrary orientation of a bounding box.
  const a = pts[0], b = pts[pts.length-1];
  const grad = el('linearGradient', {
    id, gradientUnits:'userSpaceOnUse',
    x1:a.x, y1:a.y, x2:b.x, y2:b.y
  }, edgeDefs);
  list.forEach((c,i)=>{
    el('stop', {offset:`${(i/(list.length-1))*100}%`, 'stop-color':c}, grad);
  });
  return `url(#${id})`;
}
/* A gradient connector cannot use markers for its arrowheads. A marker's
   contents are drawn in the marker's own tiny coordinate system, so a
   gradient inside it is a separate sweep that restarts at the arrow —
   which is exactly the seam that made the head look bolted on rather than
   part of the line. Drawing the heads as ordinary paths in the same user
   space as the connector lets them share the one gradient, so the colour
   runs continuously from the tail through the tip. */
const ARROW_LEN = 9.5, ARROW_HALF = 4.2;
/* The head's three corners are worked out in ABSOLUTE chart coordinates
   rather than drawn in a little rotated coordinate system of their own.
   That matters for a gradient connector: a userSpaceOnUse gradient is
   resolved in the local space of whatever references it, so a translated,
   rotated group dragged the gradient along with it — the tail ran the
   right way and each head sampled the sweep from a different, wrong place.
   With the corners already absolute there is no local space to distort,
   and one gradient covers the line and both heads seamlessly. */
/* ---------------------------------------------------------------------
   A note riding on a connector.

   Placed at the halfway point of the line measured by length — not by
   vertex count, so an elbowed connector puts its note where the eye reads
   the middle rather than at whichever bend happens to be third. It is set
   just off the line, on whichever side reads as "above" for that stretch's
   direction, and drawn on a small plate so it stays legible where it
   crosses the grid or another connector. Horizontal, never rotated along
   the line: a label you have to tilt your head to read is not a label.
   ------------------------------------------------------------------ */
// A point a given fraction of the way along a polyline, with the unit
// direction of the segment it lands on.
function pointAtFraction(pts, f){
  let total = 0;
  const lens = [];
  for(let i=0;i<pts.length-1;i++){
    const l = Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y);
    lens.push(l); total += l;
  }
  if(!total) return {x:pts[0].x, y:pts[0].y, dx:1, dy:0};
  const want = total * Math.max(0, Math.min(1, f));
  let run = 0;
  for(let i=0;i<lens.length;i++){
    if(run + lens[i] >= want || i === lens.length-1){
      const t = lens[i] ? (want - run)/lens[i] : 0;
      const a = pts[i], b = pts[i+1];
      return {x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t,
              dx: (b.x-a.x)/(lens[i]||1), dy: (b.y-a.y)/(lens[i]||1)};
    }
    run += lens[i];
  }
  return {x:pts[0].x, y:pts[0].y, dx:1, dy:0};
}
function pointAtHalfLength(pts){ return pointAtFraction(pts, 0.5); }
/* The fraction along a polyline nearest an arbitrary point — the inverse of
   pointAtFraction, which is what turns a pointer position into an anchor.
   Every segment is tested rather than only the nearest vertex: on an elbow
   the closest vertex is often on a different limb from the closest point. */
function fractionNearest(pts, px, py){
  let total = 0; const lens = [];
  for(let i=0;i<pts.length-1;i++){
    const l = Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y);
    lens.push(l); total += l;
  }
  if(!total) return 0;
  let best = 0, bestD = Infinity, run = 0;
  for(let i=0;i<lens.length;i++){
    const a = pts[i], b = pts[i+1], L = lens[i];
    if(L > 0){
      let t = ((px-a.x)*(b.x-a.x) + (py-a.y)*(b.y-a.y)) / (L*L);
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + (b.x-a.x)*t, qy = a.y + (b.y-a.y)*t;
      const d = (px-qx)*(px-qx) + (py-qy)*(py-qy);
      if(d < bestD){ bestD = d; best = (run + L*t) / total; }
    }
    run += L;
  }
  return best;
}
const EDGE_NOTE_OFFSET = 11;
// Kept in step with .edge-note-text in the stylesheet.
/* Set in the same face the entries are set in. A connector's note is a
   piece of the same chart, and giving it a monospace of its own made it
   read as a different kind of object — a code comment on a diagram rather
   than a remark about the connector. */
const EDGE_NOTE_FS = 8.5, EDGE_NOTE_FAMILY = "'IBM Plex Sans',sans-serif";
const EDGE_NOTE_MAXW = 150, EDGE_NOTE_LINE_H = 11;
/* The leader line of a callout.
 *
 * A callout is an entry (see calloutAnchorOf) and is drawn with the rest of
 * them; what cannot be drawn there is the line joining it to the point on
 * the connector it is talking about, because that point is a fraction of a
 * route and the routes are not known until the connectors are drawn. So it
 * is drawn here, once per connector, for every callout hanging off it.
 *
 * Into the CONNECTOR layer, below the entries: the card is an entry and is
 * painted over the last few pixels of its own leader, which is what makes
 * the line arrive at the card rather than stop beside it — the same thing
 * an entry's fill does for every connector meeting it. */
const LEADER_DOT_R = 2.6;
function placePendingCallouts(from, to, pts){
  if(!pendingCallouts.size) return;
  let moved = false;
  pendingCallouts.forEach((want, id)=>{
    if(want.from !== from || want.to !== to) return;
    const n = nodes.get(id);
    pendingCallouts.delete(id);
    if(!n) return;
    const m = pointAtFraction(pts, want.at);
    const a = want.dir * Math.PI / 180;
    const cx = m.x + Math.cos(a) * want.len, cy = m.y + Math.sin(a) * want.len;
    const found = workingEntry(id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    opts.pos = [Math.round(cx - n.w/2), Math.round(cy - n.h/2)];
    putEntry(found.index, found.entry, opts);
    moved = true;
  });
  if(moved) requestAnimationFrame(()=> rebuildChart());
}
function calloutEdgeKey(from, to){ return from + '::' + to; }
/* Whether the reader has hold of this callout right now — its anchor or
   the card itself. Both drag states are declared much further down the
   file than the first draw, so they are reached by name at call time
   rather than read at load time. */
/* The view's scale, safely. `vs` is declared with the pan/zoom state far
   below the first draw, and a draw that happens before then only needs a
   sensible default. */
function currentZoom(){
  try{ return vs; }catch(e){ return 1; }
}
/* The colour a callout borrows when it has none: its connector's.
   Worked out the same way routeEdge works it out, so the card, the leader
   and the line are always the one colour. */
function calloutInheritedColor(n){
  if(!n || !n.leader) return null;
  try{
    const st = edgeStyleFor(n.leader.from, n.leader.to) || {};
    if(st.colorFixed && st.color) return st.color;
    const a = nodes.get(n.leader.from);
    const ring = st.fromRing || 0;
    return (a ? portRingColor(a, ring) : null) || st.color || (a && a.color) || null;
  }catch(e){ return null; }
}
function calloutBeingMoved(id){
  try{
    if(anchorDrag && anchorDrag.id === id) return true;
    /* A group carry counts as well as a solitary one: the members all hold
       their offsets to each other, and a card quietly re-placed from its
       anchor in the middle of that would break the set apart. */
    if(nodeDragState && nodeDragState.members &&
       nodeDragState.members.some(m=> m.id === id)) return true;
    if(nodeDragState && nodeDragState.node && nodeDragState.node.id === id) return true;
  }catch(e){ /* neither exists yet: nothing is being dragged */ }
  return false;
}
/* A card that has just followed its anchor is drawn where it WAS, because
   the entries were drawn before the connectors they hang from were routed.
   The whole of the correction is a translation of one group, so that is
   what is applied — not another render.
 *
 * This used to re-render: renderNodes, then the edges, then the highlights,
 * on a frame. It looked right in isolation and broke dragging outright.
 * Every connector on the chart is routed around every entry, so moving ANY
 * entry can re-route an edge somewhere else, move that edge's callout, and
 * ask for the re-render — in the middle of a drag, on every frame. Rebuilt
 * groups are new elements: the drag went on writing transforms onto the
 * detached ones it had captured at mousedown, the entry stopped following
 * the pointer, and a chart with a single callout on it could no longer be
 * arranged at all.
 *
 * The translation is remembered on the element itself, so it accumulates
 * across the redraws of a drag and is thrown away, correctly and by
 * itself, the moment a real render replaces the group. */
function nudgeCalloutCard(id, dx, dy){
  if(!dx && !dy) return;
  let g = null;
  try{ g = qNode(`.node[data-id="${CSS.escape(id)}"]`); }catch(e){}
  if(!g) return;
  const tx = (+g.dataset.followDX || 0) + dx;
  const ty = (+g.dataset.followDY || 0) + dy;
  g.dataset.followDX = tx; g.dataset.followDY = ty;
  g.setAttribute('transform',
    `translate(${tx.toFixed(2)},${ty.toFixed(2)}) ${g.dataset.rotTransform || ''}`.trim());
  let aura = null;
  try{ aura = auraLayer.querySelector(`.node-aura[data-id="${CSS.escape(id)}"]`); }catch(e){}
  if(aura) aura.setAttribute('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)})`);
}
/* How far each callout stands off its own anchor.
 *
 * A callout stands off the point it points at by a direction and a
 * distance the reader chose. Move the connector — drag either entry it
 * joins, restyle it, let the router take it a different way — and the
 * point moves while the card stays, so the leader stretched and swung and
 * the remark ended up pointing at its own line from across the chart.
 *
 * The OFFSET is what is remembered, not the anchor's old position, and the
 * card is placed from the anchor every time. Chasing the anchor by adding
 * up its movements instead let the rounding in each step accumulate: over
 * a few frames of a drag the card crept a pixel or two away from where it
 * had been aimed, and the offset the reader set was not quite the offset
 * they kept. Measured afresh from a point that is itself exact, it cannot
 * drift at all. */
const calloutOffsets = new Map();
/* Did this connector simply MOVE?
 *
 * Every point shifted by the same vector means both entries were carried
 * together and the drawing is the one that was there before, somewhere
 * else. Anything else — one entry dragged, a knee re-routed, a port
 * reassigned — is a connector of a different shape, and the two cases want
 * opposite things from an anchor on it. */
function routeShift(prev, now){
  if(!prev || !now || prev.length !== now.length || !now.length) return null;
  const dx = now[0].x - prev[0].x, dy = now[0].y - prev[0].y;
  for(let i = 1; i < now.length; i++){
    if(Math.abs((now[i].x - prev[i].x) - dx) > 0.01) return null;
    if(Math.abs((now[i].y - prev[i].y) - dy) > 0.01) return null;
  }
  return {dx, dy};
}
/* The fraction is how an anchor is WRITTEN DOWN, not what it means.
 *
 * A fraction of a polyline is a place on that polyline and nowhere else:
 * lengthen one leg of a connector and every fraction along it slides,
 * so dragging an entry down dragged the callout's anchor along the line
 * with it — away from the thing the reader had aimed it at, which was
 * usually a place on the drawing rather than a proportion of a route.
 *
 * What the anchor means is a POINT. So the point is what is kept: the
 * fraction is recomputed from it on every pass, and written back to the
 * entry so a saved chart opens where it closed. A connector that merely
 * moved carries its anchor along; one that changed shape leaves it where
 * it was, on the nearest part of its new self. */
function persistLeaderAt(id, at){
  const found = workingEntry(id);
  if(!found) return;
  const o = entryOpts(found.entry);
  if(!o.leader) return;
  o.leader = Object.assign({}, o.leader, {at: +at.toFixed(4)});
  putEntry(found.index, found.entry, o);
}
function drawCalloutLeaders(from, to, pts, paint){
  if(pts && pts.length > 1){
    drawnRoutes.set(calloutEdgeKey(from, to),
                    {from, to, pts: pts.map(q=> ({x:q.x, y:q.y}))});
  }
  placePendingCallouts(from, to, pts);
  const list = calloutsByEdge.get(calloutEdgeKey(from, to));
  if(!list || !list.length || !pts || pts.length < 2) return;
  const routeKey = calloutEdgeKey(from, to);
  const shift = routeShift(leaderRoutes.get(routeKey), pts);
  leaderRoutes.set(routeKey, pts.map(q=> ({x:q.x, y:q.y})));
  list.forEach(n=>{
    let m;
    const held = leaderAnchors.get(n.id);
    /* Unless somebody else has set the fraction since — an undo, a paste,
       the reader's own drag of the dot — in which case the fraction is
       the newer of the two and the point is rebuilt from it. */
    const mine = held && Math.abs(held.at - n.leader.at) < 1e-6;
    if(mine && !calloutBeingMoved(n.id)){
      const wx = held.x + (shift ? shift.dx : 0);
      const wy = held.y + (shift ? shift.dy : 0);
      const f = fractionNearest(pts, wx, wy);
      if(Math.abs(f - n.leader.at) > 1e-4){
        n.leader.at = f;
        persistLeaderAt(n.id, f);
      }
      m = pointAtFraction(pts, f);
    } else {
      m = pointAtFraction(pts, n.leader.at);
    }
    leaderAnchors.set(n.id, {x: m.x, y: m.y, at: n.leader.at});
    /* While the reader has hold of either the card or the dot, what the
       offset should be is exactly what they are setting — so it is read
       rather than applied. Every other frame it is applied. */
    const busy = calloutBeingMoved(n.id);
    const off = calloutOffsets.get(n.id);
    /* The card standing somewhere other than where this left it means
       something else moved it — a paste, an undo, an import, a position
       written straight into the entry. Following would drag it back to
       where the offset says it belongs, quietly undoing whatever just
       happened; instead the offset yields, and the new arrangement is the
       one that is kept. */
    const movedElsewhere = off &&
      (Math.abs(n.x - off.setX) > 0.25 || Math.abs(n.y - off.setY) > 0.25);
    if(!off || busy || movedElsewhere){
      calloutOffsets.set(n.id, {dx: n.x - m.x, dy: n.y - m.y, setX: n.x, setY: n.y});
    } else {
      const wx = m.x + off.dx, wy = m.y + off.dy;
      if(Math.abs(wx - n.x) > 0.25 || Math.abs(wy - n.y) > 0.25){
        nudgeCalloutCard(n.id, wx - n.x, wy - n.y);
        n.x = wx; n.y = wy;
        n.pos = {x: wx, y: wy + (n.growShift || 0)};
        const found = workingEntry(n.id);
        if(found){
          const o = entryOpts(found.entry);
          /* Two decimals, not whole numbers: a followed card is placed by
             arithmetic rather than by hand, and rounding it to the grid on
             every frame is exactly how the drift got in. */
          o.pos = [+wx.toFixed(2), +(wy + (n.growShift || 0)).toFixed(2)];
          putEntry(found.index, found.entry, o);
        }
        calloutOffsets.set(n.id, {dx: off.dx, dy: off.dy, setX: wx, setY: wy});
      }
    }
    const cx = n.x + n.w/2, cy = n.y + n.h/2;
    /* Which edge the line ends up meeting, kept for the next render — see
       calloutLeaderSide, and the port it stops from existing. */
    calloutLeaderSides.set(n.id, sideFacing(n, m.x, m.y));
    /* Carried a little INTO the card. rectBorderPoint answers for a sharp
       rectangle and the card's corners are rounded, so a leader arriving
       near a corner ended at the square corner — a line hanging in the air
       a few pixels short of the card it belongs to. */
    const rim = rectBorderPoint(n.x, n.y, n.w, n.h, cx, cy, m.x, m.y);
    const dx = cx - rim.x, dy = cy - rim.y;
    const len = Math.hypot(dx, dy);
    const into = Math.min(6, len);
    const edge = len < 0.01 ? rim : {x: rim.x + dx/len*into, y: rim.y + dy/len*into};
    /* The card belongs to its connector, so the leader is painted in the
       connector's own stroke — a gradient included, which is a paint
       server reference and works as a stroke. A callout with a colour of
       its own overrules that: it was chosen. */
    const ink = (n.colors && n.colors.length) ? n.colors[0] : (paint || 'var(--line)');
    const g = el('g', {class:'callout-leader', 'data-id':n.id,
                       'data-from':from, 'data-to':to}, edgeLayer);
    el('line', {class:'leader-line', x1:m.x.toFixed(2), y1:m.y.toFixed(2),
                x2:edge.x.toFixed(2), y2:edge.y.toFixed(2), stroke:ink}, g);
    el('circle', {class:'leader-dot', cx:m.x.toFixed(2), cy:m.y.toFixed(2),
                  r:LEADER_DOT_R, fill:ink}, g);
    /* The dot is a handle. Where a callout ATTACHES is as much a decision
       as where it stands, and until now it could only be set once, in the
       second half of the placing gesture — to move it a reader had to
       delete the card and make another. It slides along the connector, and
       the card comes with it, so the pair keep the offset they were aimed
       at. A separate invisible circle catches the pointer, because a dot
       two and a half pixels across is not something anyone can hit. */
    if(!readOnlyView){
      /* Sized in SCREEN pixels. A radius in chart units is a generous
         target zoomed in and a two-pixel speck zoomed out, which is
         exactly when a reader is most likely to be re-aiming things. */
      const hit = el('circle', {class:'leader-dot-hit', 'data-id':n.id,
                                cx:m.x.toFixed(2), cy:m.y.toFixed(2),
                                r: Math.max(5, 11 / (currentZoom() || 1))}, leaderHitLayer);
      el('title', {}, hit).textContent =
        'Drag along the connector to move where this callout attaches';
      /* The dot grows under the pointer. The handle is a good deal bigger
         than the mark it stands for, so without this the cursor changed
         over a patch of blank line and nothing said what it was over. The
         two are in different layers now, so this is done by hand rather
         than with a :hover rule. */
      const dot = g.querySelector('.leader-dot');
      if(dot){
        hit.addEventListener('mouseenter', ()=> dot.classList.add('lifted'));
        hit.addEventListener('mouseleave', ()=> dot.classList.remove('lifted'));
      }
      const route = pts.map(q=> ({x:q.x, y:q.y}));
      hit.addEventListener('mousedown', ev=> beginAnchorDrag(ev, n.id, route));
    }
  });
}
/* ---------------------------------------------------------------------
   Sliding a callout's anchor along its connector.

   The same three ways of placing everything else on this chart: a plain
   drag steps in grid-sized pieces along the line, Ctrl comes off the grid,
   and Shift offers the five places a callout usually wants — the two ends,
   the quarters and the middle — drawn as beads while the key is down, so
   the snap is something you aim at rather than something that happens to
   you.

   The card travels with the dot. The reader aimed the leader once; sliding
   where it attaches is not an invitation to re-aim it, so the offset from
   the anchor to the card is what is held constant.
   ------------------------------------------------------------------ */
let anchorDrag = null;
function beginAnchorDrag(ev, id, pts){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation(); ev.preventDefault();
  const n = nodes.get(id);
  if(!n || !n.leader || !pts || pts.length < 2) return;
  const at = pointAtFraction(pts, n.leader.at);
  anchorDrag = {id, pts, moved:false,
                startX: ev.clientX, startY: ev.clientY,
                offX: n.x - at.x, offY: n.y - at.y,
                at: n.leader.at};
}
function anchorFractionAt(ev, st){
  const p = clientToWorld(ev.clientX, ev.clientY);
  let f = fractionNearest(st.pts, p.x, p.y);
  if(ev.shiftKey){
    let best = LEADER_SNAPS[0];
    LEADER_SNAPS.forEach(v=>{ if(Math.abs(v - f) < Math.abs(best - f)) best = v; });
    return best;
  }
  if(ev.ctrlKey || ev.metaKey) return f;
  /* A plain drag steps. The step is the ruled grid's, measured along the
     line, so a point placed by hand lands on the same rhythm everything
     else on the chart is placed on. */
  const total = polylineLength(st.pts);
  if(total > 0){
    const step = GRID / total;
    f = Math.round(f / step) * step;
  }
  return Math.max(0, Math.min(1, f));
}
function polylineLength(pts){
  let t = 0;
  for(let i = 1; i < pts.length; i++) t += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
  return t;
}
window.addEventListener('mousemove', ev=>{
  const st = anchorDrag;
  if(!st) return;
  if(!st.moved){
    if(Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < DRAG_THRESHOLD) return;
    st.moved = true;
    document.body.classList.add('leader-reaiming');
  }
  const n = nodes.get(st.id);
  if(!n) return;
  st.at = anchorFractionAt(ev, st);
  const at = pointAtFraction(st.pts, st.at);
  n.leader.at = st.at;
  /* `pos` as well as x/y. The renderer reads a hand-placed entry's y back
     out of `pos` on every pass — that is what keeps a box that has grown
     centred on where it was put — so setting only x and y moved the card
     sideways and left it at its old height: the leader stretched instead
     of the card following. */
  n.x = at.x + st.offX;
  n.y = at.y + st.offY;
  n.pos = {x: n.x, y: n.y + (n.growShift || 0)};
  document.body.classList.toggle('leader-snapping', !!ev.shiftKey);
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(ev.shiftKey){
    LEADER_SNAPS.forEach(v=>{
      const q = pointAtFraction(st.pts, v);
      el('circle', {class:'leader-snap', cx:q.x.toFixed(2), cy:q.y.toFixed(2), r:2.6}, leaderPickLayer);
    });
  }
  renderNodes();
  redrawEdges();
  applyVisibility();
  if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
  paintMultiSelection();
});
window.addEventListener('mouseup', ()=>{
  const st = anchorDrag;
  anchorDrag = null;
  if(!st) return;
  document.body.classList.remove('leader-reaiming');
  document.body.classList.remove('leader-snapping');
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(!st.moved) return;
  /* The click that ends this drag would otherwise reach the canvas and
     close the card the reader is working in. */
  leaderJustPlaced = true;
  setTimeout(()=>{ leaderJustPlaced = false; }, 0);
  const n = nodes.get(st.id);
  if(!n) return;
  pushUndo();
  applyEdit(()=>{
    const found = workingEntry(st.id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    opts.leader = Object.assign({}, opts.leader, {at: +st.at.toFixed(4)});
    /* Two decimals, not whole pixels. The card is not being placed by
       hand here — it is being carried by the dot, keeping an offset the
       reader aimed once — so rounding it to the grid on release moved it
       up to half a pixel sideways and tilted the leader by a fraction of
       a degree, every time, cumulatively. */
    opts.pos = [+n.x.toFixed(2), +(n.y + ((n && n.growShift) || 0)).toFixed(2)];
    putEntry(found.index, found.entry, opts);
  });
});
/* Where the segment from an outside point to a rectangle's centre crosses
   the rectangle's border. Solved as a ray/slab intersection rather than by
   testing four edges: one expression, and it cannot fall between two edges
   at a corner the way the four-way test does. */
function rectBorderPoint(x, y, w, h, cx, cy, fromX, fromY){
  const dx = cx - fromX, dy = cy - fromY;
  if(!dx && !dy) return {x:cx, y:cy};
  const tx = dx ? (w/2) / Math.abs(dx) : Infinity;
  const ty = dy ? (h/2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return {x: cx - dx*t, y: cy - dy*t};
}

/* A note opens its own editor on a double click, the same gesture that
   opens an entry's. Reaching a note's text used to mean finding the
   connector's own thin line, opening its popover, and then finding the
   note field in it — three steps to correct a typo you were already
   pointing at. */
function wireNoteEditing(g, from, to){
  g.style.pointerEvents = 'auto';
  g.style.cursor = 'text';
  g.addEventListener('mousedown', ev=> ev.stopPropagation());
  g.addEventListener('click', ev=> ev.stopPropagation());
  g.addEventListener('dblclick', ev=>{
    ev.stopPropagation(); ev.preventDefault();
    if(readOnlyView) return;
    openEdgeStylePopover(from, to, ev);
    const rec = richFields.get('styleNote');
    if(rec) setTimeout(()=> placeCaretIn(rec.surface), 60);
  });
}
/* A connector's note is a PLATE: a few words laid on, above or below the
   line at its midpoint. The card standing off on a leader is not a
   placement of this note any more — it is a callout, an entry of its own,
   and there can be any number of them on one connector. */
function drawEdgeNote(text, pts, pos, from, to, at, paint, bg){
  if(!text) return;
  const m = pointAtHalfLength(pts);
  // The perpendicular, flipped so it always points away from the viewer's
  // idea of "under" the line — up for a horizontal run, left for a
  // vertical one — and then flipped again if the note belongs below.
  let px = -m.dy, py = m.dx;
  if(Math.abs(py) > Math.abs(px) ? py > 0 : px > 0){ px = -px; py = -py; }
  // Zero offset puts the plate squarely on the line, which is the point of
  // the "on" setting: the note interrupts its own connector, so there is
  // no doubt which line it belongs to.
  let off = pos === 'on' ? 0 : (pos === 'below' ? -EDGE_NOTE_OFFSET : EDGE_NOTE_OFFSET);
  let x = m.x + px * off;
  let y = m.y + py * off;
  /* A note that lands on an entry is unreadable and hides the entry too.
     "on" is a deliberate choice to sit across the connector, so it is left
     alone; the other two are only asking for a side, and either side will
     do. Try further out, then the other side, and keep the first placement
     that is clear — if nothing is, it stays where it was asked to go
     rather than wandering somewhere that no longer reads as belonging to
     this connector. */
  if(pos !== 'on'){
    const half = EDGE_NOTE_MAXW/2, tall = EDGE_NOTE_LINE_H;
    // Corners, not width and height, so a rounded plate cannot leave a gap.
    const clear = (cx, cy)=> !obstacleAll().some(r=>
      cx + half > r.x0 && cx - half < r.x1 && cy + tall > r.y0 && cy - tall < r.y1);
    if(!clear(x, y)){
      const tries = [];
      for(const dir of [1, -1]){
        for(const dist of [EDGE_NOTE_OFFSET, EDGE_NOTE_OFFSET*2.2, EDGE_NOTE_OFFSET*3.4]){
          tries.push(Math.sign(off || 1) * dir * dist);
        }
      }
      for(const t of tries){
        const nx2 = m.x + px * t, ny2 = m.y + py * t;
        if(clear(nx2, ny2)){ x = nx2; y = ny2; break; }
      }
    }
  }

  const g = el('g', {class:'edge-note', 'data-from':from, 'data-to':to}, arrowLayer);
  wireNoteEditing(g, from, to);
  const plate = el('rect', {class:'edge-note-plate', rx:3}, g);
  const t = el('text', {class:'edge-note-text', x, y}, g);
  /* Written in the CONNECTOR'S ink, whatever that is at this moment — a
     remark on a line belongs to the line, and a plate in the chart's
     default black hanging off a coloured connector read as a second,
     unrelated thing. There is no colour control on it for the same
     reason: the answer is never the reader's to give. A gradient is a
     paint server and serves a fill just as it serves a stroke, so a
     connector running through two colours writes its note in both. */
  /* And the ground it is written on, when the connector names one. The ink
     is the connector's and is not the reader's to choose; the plate's
     background is, and it is the one thing a remark on a busy part of the
     chart usually needs — something to sit on. */
  if(bg) plate.style.fill = bg;
  if(paint){
    t.style.fill = paint;
    /* And so is the plate around them. The words already took the
       connector's ink; the border they sit in stayed the chart's default
       line colour, so a remark on a red connector was red type inside a
       grey box — two objects where there is one. Same paint, so a gradient
       runs round the plate exactly as it runs through the text. */
    plate.style.stroke = paint;
  }
  /* Laid out through the same renderer every other piece of text on the
     chart uses, so a connector's note takes bold, italic, ruby, colour and
     stickers exactly as an entry's label does — one text engine, one set of
     rules, rather than a second impoverished kind of text that happens to
     live on a line. renderNodeText clears the element and centres the block
     on the point it is given, which is the anchor already computed above.

     text-anchor:middle in the stylesheet centres a plain string, but every
     tspan this produces is placed at an absolute x, so the centring has to
     come from the layout — hence the explicit anchor override. */
  /* Inline style, not the presentation attribute. .edge-note-text sets
     text-anchor:middle in the stylesheet, and a stylesheet rule beats a
     presentation attribute — so the attribute was silently ignored and
     every tspan re-centred on its own absolute x, sliding each word half
     its width to the left and printing them on top of one another. */
  t.style.textAnchor = 'start';
  const fit = { maxWidth: EDGE_NOTE_MAXW, fontSize: EDGE_NOTE_FS, family: EDGE_NOTE_FAMILY };
  const maxChars = Math.max(10, Math.round(EDGE_NOTE_MAXW / (EDGE_NOTE_FS * 0.58)));
  renderNodeText(t, text, y, x, maxChars, EDGE_NOTE_LINE_H, EDGE_NOTE_FS / NODE_FS,
                 {fontSize: EDGE_NOTE_FS, family: EDGE_NOTE_FAMILY}, fit);
  // Sized from what the text actually measures, so the plate fits the
  // words rather than a guess at their width.
  const bb = t.getBBox();
  const px2 = bb.x - 4, py2 = bb.y - 2, pw = bb.width + 8, ph = bb.height + 4;
  plate.setAttribute('x', px2.toFixed(2));
  plate.setAttribute('y', py2.toFixed(2));
  plate.setAttribute('width', pw.toFixed(2));
  plate.setAttribute('height', ph.toFixed(2));
  /* The PLATE is placed, not the text's anchor.
   *
     A line of type is not centred on the point it is laid out from — there
     is more of it above the baseline than below — so a plate drawn around
     it sits low by that difference. Offsetting the anchor by the same
     amount either side of the line therefore put the plate a hair above
     the line for "above" and five times as far below it for "below": the
     two settings were meant to mirror each other and visibly did not.
     Measuring the drawn box and shifting the whole note by the difference
     makes them mirror images, and puts "on" squarely on the line. */
  const dx = x - (px2 + pw/2), dy = y - (py2 + ph/2);
  if(Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01){
    g.setAttribute('transform', `translate(${dx.toFixed(2)},${dy.toFixed(2)})`);
  }
}

// The outward normal of the side a port sits on.
const SIDE_OUT = {top:[0,-1], bottom:[0,1], left:[-1,0], right:[1,0]};
/* Where an arrowhead's tip goes: on the port. Always, and for every
   archetype — a rippled border included.
 *
 * A pocket reality used to be handled specially at every step of the way,
 * and each of those steps left something on the paper. The tip was sunk a
 * whole amplitude INTO the box so that it would touch the wave wherever
 * along the ripple the connector arrived: at a crest that buried the head
 * two amplitudes deep, lying over the border it was supposed to be
 * arriving at. The head was moved above the entry so the ripple could not
 * be drawn across it, which is what made the burial visible. And a short
 * cap of the line was drawn above the entry too, to cover the trough —
 * which, once the tip came back out, was simply a stub of the connector
 * poking through the border into the box.
 *
 * All of it is gone. A ripple is a border like any other: the line stops
 * at it, the head stands on it, and the border is drawn over the head's
 * tip exactly as a plain rectangle's border is. The wave crosses the last
 * pixel of the arrow either side of the baseline, which is what a line
 * meeting a rippled edge should look like. */
function portTip(port){
  /* The point the route already ends at. sinkEnds has moved that end onto
     the border's real position — the ripple included — before the path was
     built, so the head is simply put where the line stops. Adding the drop
     a second time here is what buried a pocket's arrowheads an amplitude
     too deep and left every line 0.85px short of its own head. */
  return {x: port.x, y: port.y};
}
/* Every piece a connector is made of carries which two entries it belongs
   to. The arrowheads and the ring caps live in a layer of their own, above
   the entries, and until they were labelled this way the tag filter could
   not find them: hiding a tag took away the entries and the lines but left
   a scatter of arrowheads hanging in the empty chart. */
function drawRingCap(port, paint, dash, from, to, dbl){
  const ring = (port && port.ring) || 0;
  const out = port && SIDE_OUT[port.side];
  if(!out) return;
  /* How much of the entry's own border still stands between this port and
     the open chart.
   *
     Rings step OUTWARD: ring 0 is the box and every further ring is a step
     beyond the last. So a connector meeting an INNER ring has to pass
     under every ring outside it — each of those strokes is drawn over the
     connector layer and takes a bite out of the line — and a connector
     meeting the OUTERMOST ring has nothing over it at all.
   *
     This had it exactly the wrong way round: the reach was measured from
     the connector's own ring number, so a line meeting the outermost
     border got a stub of itself drawn five pixels PAST the entry — the
     second line seen poking out of a connector — while a line meeting the
     innermost one, the case the cap exists for, got no cap whatsoever.
   *
     A rippled border adds its own: it is not where its baseline is, it
     wanders a whole amplitude either side, so a connector meeting a pocket
     reality stopped at the line the wave crosses rather than at the wave. */
  const outside = Math.max(0, ((port && port.rings) || 1) - 1 - ring);
  /* Far enough to get past the OUTERMOST ring, ripple and all.
   *
     The cap redraws the stretch of connector that the rings outside this
     one are drawn over. Measured to their baselines it stopped inside a
     rippled ring's own wave, so a connector meeting an inner ring of a
     pocket reality came apart into a line, a gap, and a short stub — which
     is what the caps were introduced to prevent in the first place. */
  const wave = (port && port.wavy) ? POCKET_DEEP + 1.5 : 0;
  const reach = outside ? outside * (port.step || RING_STEP) + 1 + wave : 0;
  if(reach <= 0) return;
  /* A rippled border is a BAND, not a line: it wanders a full amplitude
     either side of the baseline the port sits on. A cap that started at
     the baseline therefore stopped in mid-air wherever the wave happened
     to be at a trough. It starts one amplitude further IN, so it meets the
     border whichever part of the ripple it lands on. */
  /* The cap starts ON the border, not where the LINE stops.
   *
     A headless line is deliberately carried past a rippled border and left
     under the entry's fill (see sinkEnds), which is invisible — until a
     cap is drawn from that same point in the layer ABOVE the entry, where
     the buried stretch is suddenly on top of everything: a stub of
     connector sticking through the border into the box. The cap's job
     begins where the border is, and runs outward from there. */
  const startDrop = (port.wavy && typeof port.drop === 'number') ? port.drop : 0;
  const sx = port.x + out[0]*startDrop, sy = port.y + out[1]*startDrop;
  const attrs = {
    class: 'edge struct edge-cap',
    d: `M${sx.toFixed(2)},${sy.toFixed(2)} L${(port.x + out[0]*reach).toFixed(2)},${(port.y + out[1]*reach).toFixed(2)}`,
    stroke: paint, 'data-from': from || '', 'data-to': to || ''
  };
  if(dash) attrs['stroke-dasharray'] = dash;
  /* The cap is a stretch of the connector, so it wears the connector's
     line style — a doubled line that went back to a single rail for its
     last few pixels over the border read as two lines meeting one. */
  if(dbl){
    el('path', Object.assign({}, attrs, {class: attrs.class + ' dbl-outer'}), arrowLayer);
    const inner = Object.assign({}, attrs, {class: attrs.class + ' dbl-inner'});
    delete inner.stroke;
    el('path', inner, arrowLayer);
    return;
  }
  el('path', attrs, arrowLayer);
}
/* Which layer an arrowhead belongs in.

   An arrow that meets an entry's outermost border goes UNDER the entry, so
   the border draws over the very tip: the arrow arrives AT the box rather
   than sitting on top of it, which is how an arrow meeting a shape is
   supposed to read.

   An arrow that belongs to an INNER border ring is the exception. Rings
   step outward, so its tip sits under every ring beyond it and would be
   drawn over — so that one goes above, where it can be seen reaching the
   ring it was pulled from. The short cap drawn alongside it covers the
   same buried stretch of its line.

   A rippled border is the other exception, for the same reason at a
   smaller scale. Its line is not where its baseline is — it wanders a
   whole amplitude either side — so a head laid at the baseline had the
   crests of the ripple drawn straight across it, and the tidy triangle
   arrived at the entry with a bite taken out of it. Putting it above lets
   it land ON the ripple, which is what an arrow meeting a wavy edge is
   supposed to look like; the tip stays on the baseline, so the head always
   meets the border rather than hanging short of a trough. */
function arrowLayerFor(ring, port){
  const outside = Math.max(0, ((port && port.rings) || 1) - 1 - (ring || 0));
  /* A head meeting a RIPPLED border goes above the entry.
   *
     Not because its tip is anywhere unusual — that now sits exactly on the
     wave, worked out point by point — but because the head is eight pixels
     wide and the ripple's whole period is eight. Across the width of one
     arrowhead the border swings from a crest to a trough, so a head drawn
     UNDER the entry had the fill cut a curve across its flanks: a triangle
     with a bite out of one side, which is what a clipped arrow on a pocket
     reality was. Above the entry it is a whole triangle standing on the
     wave, which is what an arrow meeting a rippled edge should look like.

     A straight border does not have this problem — it takes at most the
     last pixel of a tip — so every other archetype keeps its heads under
     the entry, where the border is drawn over them. */
  return (outside > 0 || (port && port.wavy)) ? arrowLayer : edgeLayer;
}

/* Stop the line where the arrowhead starts.

   The head is a filled triangle laid over the last stretch of its own line.
   Solid colours hide the overlap completely, but a gradient does not: the
   line and the head sample the sweep at slightly different places and are
   drawn with different paint types, and the line shows through the head as
   a seam down its middle. Ending the line at the head's back edge leaves
   nothing underneath to show through — and costs nothing on a solid
   connector, where the two met invisibly anyway.

   The trim is a shade shorter than the head so the two still overlap by a
   hair; a perfect butt joint would let the background through the seam. */
const ARROW_TRIM = ARROW_LEN - 1.2;
function arrowTrimmed(from, to, trim){
  const t = (typeof trim === 'number') ? trim : ARROW_TRIM;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if(t <= 0 || len <= t) return {x: to.x, y: to.y};
  return {x: to.x - dx/len*t, y: to.y - dy/len*t};
}
/* How much of the line an arrowhead at this end covers.
 *
 * The head is laid over the last stretch of its own line, and the line is
 * cut back to the head's back edge so a gradient has nothing underneath to
 * show through. It is the same for every entry on the chart, a pocket
 * reality included: every head now stops at its port (see portTip), so
 * every head covers the same stretch of line. The parameter is kept so
 * that a future end-treatment that does move its tip has somewhere to say
 * so — and so the call sites do not have to change again. */
function headCut(port){
  return ARROW_TRIM;
}
// The same trim applied to the end (or start) of a routed point list, so a
// rounded or wavy path can be built already short of its arrowhead.
function trimForHeads(pts, headIn, headOut, portIn, portOut){
  if(!headIn && !headOut) return pts;
  const out = pts.map(p=>({...p}));
  if(headOut && out.length >= 2){
    const t = arrowTrimmed(out[out.length-2], out[out.length-1], headCut(portOut));
    out[out.length-1] = {...out[out.length-1], x:t.x, y:t.y};
  }
  if(headIn && out.length >= 2){
    const t = arrowTrimmed(out[1], out[0], headCut(portIn));
    out[0] = {...out[0], x:t.x, y:t.y};
  }
  return out;
}
// The merged arrow of an amalgam, which has no single source entry.
function drawAmalgamArrow(port, cx, cy, ring, paint, toId){
  const tip = portTip(port);
  /* Cut off at the border it arrives at, exactly as an ordinary arrowhead
     is. A merged lineage landing on a pocket reality used to be the one
     head on the chart that was allowed through the ripple. */
  drawArrowHead(arrowLayerFor(ring, port), tip.x, tip.y,
                Math.atan2(port.y - cy, port.x - cx) * 180/Math.PI, paint, '', toId,
                (port && port.wavy) ? toId : null, (port && port.ring) || 0);
}
/* Everything OUTSIDE an entry's own outline, as a clip path.
 *
 * An arrowhead is a triangle nine pixels long and eight wide, and on a
 * rippled border the wave swings from crest to trough across that width.
 * Drawn UNDER the entry the fill takes a curved bite out of one flank;
 * drawn OVER it the whole head lies across the border and, wherever the
 * wave dips inward, reads as an arrow that has gone into the box. Neither
 * is what an arrow meeting a shape looks like.
 *
 * So it is drawn over the entry and cut off at the outline: the head stops
 * exactly where the border is, whatever the border is doing at that point.
 * That is precisely what a plain entry's fill does for it, done explicitly
 * because a rippled border cannot do it by being painted over.
 *
 * The clip is a huge rectangle with the entry's own outline punched out of
 * it by the even-odd rule. Built once per entry per redraw and cached, so
 * a fan of arrows into one pocket costs one path. */
/* Keyed by entry AND ring. An entry drawn with three borders has three
   rippled outlines, one inside the next, and a connector that meets the
   middle one has to be cut off at the MIDDLE one — cutting it at the
   innermost let an arrowhead that had already crossed its own border keep
   going, so a head pulled from the second ring of a three-ring pocket
   reality arrived a whole ring too deep and sat in the gap beyond it. */
const outsideClips = new Map();
function outsideClipId(nodeId, ring){
  const r = Math.max(0, Math.round(ring || 0));
  const key = nodeId + '|' + r;
  if(outsideClips.has(key)) return outsideClips.get(key);
  const n = nodes.get(nodeId);
  if(!isWavyBorder(n)){ outsideClips.set(key, null); return null; }
  const id = 'outside-' + String(nodeId).replace(/[^a-zA-Z0-9_-]/g, '_') + '-r' + r;
  const clip = el('clipPath', {id, clipPathUnits:'userSpaceOnUse'}, edgeDefs);
  const pad = 4000;
  /* Rings step OUTWARD, so ring r's own outline is the entry's box grown
     by r steps — the very path renderNodes draws for it, built the same
     way so the cut and the border can never be a pixel apart. */
  const grow = r * ringStepFor(n);
  const rx = n.x - grow, ry = n.y - grow, rw = n.w + grow*2, rh = n.h + grow*2;
  const box = `M${rx-pad},${ry-pad} H${rx+rw+pad} V${ry+rh+pad} H${rx-pad} Z `;
  el('path', {d: box + wavyRectPath(rx, ry, rw, rh, grow), 'clip-rule':'evenodd'}, clip);
  outsideClips.set(key, id);
  return id;
}
function drawArrowHead(parent, x, y, angleDeg, fill, from, to, clipTo, clipRing){
  const a = angleDeg * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const at = (lx, ly)=> `${(x + lx*cos - ly*sin).toFixed(2)},${(y + lx*sin + ly*cos).toFixed(2)}`;
  const attrs = {class:'edge-arrow', 'data-from': from || '', 'data-to': to || ''};
  const clip = clipTo ? outsideClipId(clipTo, clipRing || 0) : null;
  if(clip) attrs['clip-path'] = `url(#${clip})`;
  const g = el('g', attrs, parent);
  el('path', {d:`M${at(0,0)} L${at(-ARROW_LEN,-ARROW_HALF)} L${at(-ARROW_LEN,ARROW_HALF)} z`, fill}, g);
  return g;
}
// The direction an arrowhead at the START should point: back out of the
// source, i.e. the reverse of the first segment's heading.
function startAngleDeg(pts){
  for(let i=1;i<pts.length;i++){
    const dx = pts[i].x - pts[0].x, dy = pts[i].y - pts[0].y;
    if(Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5){
      return Math.atan2(-dy, -dx) * 180 / Math.PI;
    }
  }
  return 0;
}

// nodes
function renderNodes(){
while(nodeDefs.firstChild) nodeDefs.removeChild(nodeDefs.firstChild);
while(nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
while(backLayer.firstChild) backLayer.removeChild(backLayer.firstChild);
while(frontLayer.firstChild) frontLayer.removeChild(frontLayer.firstChild);
while(fanLayer.firstChild) fanLayer.removeChild(fanLayer.firstChild);
while(auraLayer.firstChild) auraLayer.removeChild(auraLayer.firstChild);
/* Drawn in stacking order rather than in the order the entries happen to be
   listed, so "send to back" and "bring to front" mean something. Anything
   sent behind the connectors is drawn into a layer of its own that sits
   under the arrows — that's what makes a backdrop image work as a backdrop
   rather than as a lid over the whole chart. */
[...nodes.values()].sort((a,b)=> (a.z||0) - (b.z||0)).forEach(n=>{
  const shape = n.shape || 'rect';
  const isBio = shape==='ellipse';
  const isImage = shape==='image';
  const isTextbox = shape==='textbox';
  // A multiversal hub is an ordinary entry that something radiates out of,
  // drawn as the usual box with echo rings spreading from it. A local
  // multiverse is a stack of boxes — several near-identical worlds — with
  // only the front one belonging to the chart's geometry.
  /* Read off the entry's TAGS, not its shape. Free-standing elements — a
     picture, a bare line of text — are not entries and take no scenery. */
  /* A portrait takes none of it either. An echo spreading out of a face
     and a stack of near-identical worlds behind one are both saying
     something about a REALITY; on a character they say nothing, and the
     rectangles they are drawn as do not even follow the circle. */
  const isHub = !isFreeShape(shape) && !isBio && nodeHasTag(n, HUB_TAG);
  const isLocal = !isFreeShape(shape) && !isBio && nodeHasTag(n, LOCAL_TAG);
  const isAmalgam = shape==='amalgam';
  /* A comment card. Drawn by the default branch — a rounded box, one ring
     per colour — so its ports, its edge handles and everything a connector
     does with it are literally the same code. Only the stylesheet knows it
     is a callout, which is all the difference there should be. */
  const isCallout = shape==='callout';
  // Free-standing elements: they sit on the chart but are not part of its
  // lineage — no connector edges, no ports, no link badge, no language tabs.
  const isFree = isImage || isTextbox;
  // Only a boxed entry can be divided into bands.
  const isCard = !!n.card && !isBio && !isFree;
  /* Which of the six ways this entry's border is drawn, and whether that
     is the rippled one — the old pocket-reality edge, now a style any
     entry may wear. */
  const borderKey = borderStyleOf(n);
  const borderDash = (BORDER_STYLES[borderKey] || BORDER_STYLES.solid).dash;
  const isWavy = isWavyBorder(n);
  const z = n.z || 0;
  const g = el('g',{class:'node', 'data-id':n.id},
                 z < 0 ? backLayer : z > 0 ? frontLayer : nodeLayer);
  if(isBio) g.classList.add('node-bio');
  if(isCallout) g.classList.add('node-callout');
  if(isFree) g.classList.add('node-free');
  if(isImage) g.classList.add('node-image');
  if(isTextbox) g.classList.add('node-textbox');
  if(isCard) g.classList.add('node-card');
  const fontFamily = fontFamilyFor(n.font);
  /* A callout and a connector's plate are two forms of the same remark, so
     they are set the same: the plate's size, in the plate's face, wrapping
     at the plate's width. Left at an entry's own size a callout came out
     half again as large as the note beside it on the same connector, and
     the pair read as two different kinds of thing. */
  const isCalloutShape = (n.shape || '') === 'callout';
  const fontSize = (n.fontSize && n.fontSize>=6 && n.fontSize<=28) ? n.fontSize
                 : (isCalloutShape ? EDGE_NOTE_FS : NODE_FS);
  const fontScale = fontSize / NODE_FS;
  const lineH = LINE_H * fontScale;
  n.chipLeft = null; n.chipRight = null;
  let chipGroup = null;
  /* The chip row belongs to the SETTING, not to the tabs: switching
     multi-language on shows the default text's own chip straight away, so
     the row is visibly there to add tabs to rather than appearing out of
     nowhere with the second language. */
  const langTabList = (n.multiLang && Array.isArray(n.langTabs)) ? n.langTabs : [];
  const hasLangTabs = !!n.multiLang;
  const allTexts = hasLangTabs ? [n.label, ...langTabList.map(t=>t.text)] : [n.label];

  /* Size follows the text. A short label gets a small box and a long one a
     wide box, instead of every entry being stamped out at the same fixed
     width with empty space around most of them — which is both tidier and
     a lot less chart to draw. The width is the narrowest that keeps the
     longest of the node's texts within MAX_LINES lines, found by measuring
     rather than guessing, then clamped between MINW and MAXW; the height
     then follows from how that text actually wraps.

     opts.size overrules all of it: a node dragged by its corner keeps
     exactly the size it was given. */
  const manual = n.size;
  /* Whether this entry's text was written as one line.
   *
     If none of its texts carries a break the author typed, the box widens
     to hold the longest of them rather than folding it at a character
     count — see wrapLabel. A text with breaks in it is a small paragraph
     and keeps the wrapping it always had. */
  const noWrap = allTexts.every(t=> String(t == null ? '' : t).indexOf('\n') < 0);
  /* A portrait is a circle, so its two sides are one number: whichever of
     a hand-set width and height is smaller, which is what a corner drag
     naturally produces. */
  const bioSide = isBio
    ? (manual ? Math.max(BIO_MIN_SIZE, Math.round((manual.w + manual.h) / 2)) : BIO_SIZE)
    : 0;
  let w = isBio ? bioSide
        : isImage ? (manual ? manual.w : IMAGE_DEFAULT_W)
        // A loose text block is a caption, not a boxed entry: it wants to
        // run on one line and can be much wider than a chart node before
        // it wraps. Drag its corner to overrule that.
        : isTextbox ? (manual ? manual.w : autoNodeWidth(allTexts, fontSize, fontFamily, 1, TEXTBOX_MAXW))
        // A card needs room for a picture as well as words, so it starts
        // wider than a plain entry and is allowed to grow further.
        : isCard ? (manual ? manual.w : Math.max(CARD_MINW,
                      autoNodeWidth(allTexts, fontSize, fontFamily, 2, CARD_MAXW)))
        /* A one-line label starts at the widest a box may become and is
           then closed onto its own ink a few lines down, so it comes out
           exactly as wide as the words in it — or, past that width, stays
           at the ceiling with the text clipped at the border. */
        /* …and a callout wraps where the plate wraps, rather than running
           on to an entry's full width. */
        : isCalloutShape ? (manual ? manual.w
            : Math.min(EDGE_NOTE_MAXW, autoNodeWidth(allTexts, fontSize, fontFamily, 4, EDGE_NOTE_MAXW)))
        : (manual ? manual.w : noWrap ? NODE_LINE_MAXW : autoNodeWidth(allTexts, fontSize, fontFamily));
  // Re-centre in the layout slot, unless this node was placed by hand — a
  // hand-placed node's x IS the answer and must not drift.
  if(!n.pos && typeof n.slotX === 'number'){
    n.x = n.slotX + (n.slotW - w)/2;
  }
  n.w = w;
  const maxChars = noWrap ? Infinity : Math.max(8, Math.round((w - NODE_PAD_X*2) / (fontSize*0.55)));
  // Hard pixel ceiling for a line of this node's text, so no script's
  // glyph widths can push a label past the border (see wrapLabel's `fit`).
  const fit = { maxWidth: w - NODE_PAD_X*2, fontSize, family: fontFamily, noWrap };
  // Height is sized to fit the TALLEST of every text this node can show
  // (main label + every language tab) so switching tabs never needs a
  // relayout of the rest of the chart — only whichever text is showing
  // is re-centered within that fixed area.
  /* The ink every one of this entry's texts actually makes — the main
     label and every language tab, so switching tabs never resizes the box
     and re-lays the chart around it. Measured, not counted: see
     measureTextBlock. */
  const blocks = allTexts.map(t=>
    measureTextBlock(t, maxChars, lineH, fontScale,
                     {fontSize, family: fontFamily}, fit));
  const maxTotalH = Math.max(...blocks.map(bq=> bq.height));
  const maxInkW = Math.max(...blocks.map(bq=> bq.width));
  /* And the box closes on it.
   *
     The width above is the one the text was WRAPPED at — the narrowest
     that holds it in the allowed number of lines. The widest line it
     actually produced is usually narrower than that, and the difference
     was left as padding nobody chose. Shrinking to the ink cannot change
     the wrap, since every line already fits inside the widest of them. */
  if(!manual && !isBio && !isImage && !isCard && !isFree){
    /* An entry with nothing written in it makes no ink at all, so there is
       nothing to close on — and a one-line entry starts out at the widest
       a box may become, which is how an empty box came out three hundred
       pixels across. With no ink it takes the ordinary minimum instead,
       which is the size an empty box should be. */
    const want = maxInkW > 0 ? Math.ceil(maxInkW) + NODE_PAD_X*2 : NODE_MINW;
    n.w = w = Math.max(NODE_FIT_MINW, Math.min(w, want));
    if(!n.pos && typeof n.slotX === 'number') n.x = n.slotX + (n.slotW - w)/2;
  }
  /* Whether what is about to be drawn is wider than what will hold it.
     Only then is the text clipped — a clip path on every entry would cost
     the chart a few hundred of them for nothing, and would quietly shave
     the overhang off any glyph that legitimately leans past its advance. */
  const clipText = maxInkW > (w - NODE_PAD_X*2) + 0.5;
  // A bio circle is a fixed size that owes nothing to its text — the text
  // isn't drawn in it at all.
  /* A card's height is the three bands added up: the fixed picture, the
     heading as it wraps, and the note as it wraps at the smaller body size.
     With no note there is no third band and the card is simply shorter. */
  const cardBodyFS = fontSize * CARD_BODY_SCALE;
  const cardBodyScale = cardBodyFS / NODE_FS;
  const cardBodyLineH = LINE_H * cardBodyScale;
  const cardBody = isCard ? String(n.note || '').trim() : '';
  const cardBodyFit = { maxWidth: w - 14, fontSize: cardBodyFS, family: fontFamily };
  const cardBodyChars = Math.max(8, Math.round((w - 14) / (cardBodyFS*0.55)));
  const cardHeadH = isCard ? Math.max(22, CARD_PAD_Y + maxTotalH) : 0;
  const cardBodyH = cardBody
    ? CARD_PAD_Y + wrapAndMeasure(cardBody, cardBodyChars, cardBodyLineH, cardBodyScale, cardBodyFit).totalH
    : 0;

  const h = isBio ? bioSide
          : isImage ? (manual ? manual.h : IMAGE_DEFAULT_H)
          : isTextbox ? (manual ? manual.h : Math.max(16, Math.ceil(maxTotalH) + NODE_PAD_Y*2))
          : isCard ? (manual ? manual.h : CARD_IMG_H + cardHeadH + cardBodyH)
          : (manual ? manual.h : Math.max(NODE_FIT_MINH, Math.ceil(maxTotalH) + NODE_PAD_Y*2));
  n.h = h;
  /* A hand-placed entry grows about its MIDDLE, not downward from its top.
   *
   * The stored position is the entry's top-left, so a box that got taller —
   * one more line of text — kept its top and pushed its bottom down, moving
   * its centre with it. A connector meeting the middle of its side then
   * shifted too, and a line that had been laid out straight developed a jog
   * for no reason the reader could see.
   *
   * The position is therefore read as the top of a DEFAULT-height box, and
   * the real box is centred on that one. An entry at the default height is
   * unmoved, which is nearly all of them; a taller one spreads evenly
   * either side of where it was placed and its ports stay put. */
  /* The offset is RECORDED, because saving a dropped position has to undo
     it. opts.pos is the top of the default-height box; n.y is the top of
     the real one. A drag reads n.y and wrote it straight back as pos, so
     every drop shifted the entry up by this much again — and a resized
     entry, which takes no offset at all, was the one case that behaved.
     See saveNodePositions, which adds it back. */
  n.growShift = 0;
  if(n.pos && !manual && !isBio && !isImage){
    /* Quantised to whole grid steps.
     *
     * Half the extra height is almost never a round number — a
     * default-height entry is 41px tall, not 40 — so every entry on the
     * chart was drawn at some fraction of a step above where it was
     * placed, and each at a DIFFERENT fraction, since the offset follows
     * the entry's own height. The ruled grid was drawn at whole steps, as
     * it should be, and nothing on the chart lined up with it.
     *
     * Rounding the offset keeps the entry on the grid its position was
     * snapped to, and keeps growth centred to within half a step, which is
     * what the rule was for: an entry that gains a line spreads either
     * side of where it sits instead of dropping its bottom edge. An entry
     * placed off the grid on purpose (Ctrl) keeps its own offset — the
     * shift is rounded, not the position. */
    /* Only GROWTH is spread either side of the stored position. A box that
       came out shorter than the reference keeps its top-left where it was
       put — a negative offset would have slid every entry on every
       existing chart downward the day the boxes learned to hug their
       text. */
    n.growShift = snapToGrid(Math.max(0, h - NODE_GROW_REF) / 2);
    n.y = n.pos.y - n.growShift;
  }
  // Where the two rules across the card fall, once its height is settled.
  // Recorded on the node because the connector router reads it: see
  // portOnSide, which keeps side ports off the picture.
  const cardImgB = isCard ? n.y + (manual ? Math.min(CARD_IMG_H, h*0.5) : CARD_IMG_H) : 0;
  const cardHeadB = isCard
    ? (cardBody ? Math.min(h + n.y - 14, cardImgB + Math.max(22, h - (cardImgB - n.y) - cardBodyH)) : n.y + h)
    : 0;
  n.cardTop = isCard ? cardImgB - n.y : 0;

  // The weave for a fan-fiction entry, laid on the canvas under everything
  // else so the entry itself and its connectors stay perfectly crisp.
  if(!isFree && n.tags && n.tags.includes(FANFIC_TAG)){
    const box = {
      x: n.x - FANFIC_HALO, y: n.y - FANFIC_HALO,
      width: n.w + FANFIC_HALO*2, height: h + FANFIC_HALO*2,
      rx: FANFIC_HALO
    };
    el('rect', Object.assign({}, box, {
      class: 'fanfic-weave', 'data-id': n.id,
      fill: 'url(#fanfic-weave)', mask: 'url(#fanfic-mask)'
    }), fanLayer);
    /* And a second copy of the same weave, drawn brighter and shown only
       where a band of light crosses it. It is invisible until the entry is
       under the pointer or open in the panel; then the band sweeps across,
       and the weave is momentarily more legible wherever the light is —
       see the fanfic-sweep animation. Kept as its own element rather than
       done to the weave itself, because the sweep is a MASK and the weave
       already wears one. */
    el('rect', Object.assign({}, box, {
      class: 'fanfic-glint', 'data-id': n.id,
      fill: 'url(#fanfic-weave-lit)'
    }), fanLayer);
  }

  // Border: one ring per color in n.colors (an entry with more than one
  // manually-assigned color), or a single outline in the node's resolved
  // color — except for 'mirror' (fill = border color) and 'amalgam'
  // (gradient border), which always draw as a single outline regardless
  // of shape archetype.
  /* A hub and a local multiverse each have a second visual layer of their
     own — the echo rings, the stack behind — and a second and third border
     colour on top of that would be unreadable, so they take exactly one
     colour however many are set. */
  /* An amalgam joins its lineages into ONE bar meeting one port. A second
     border colour on it is a colour, not a second lineage channel, so it
     must not bring a second ring of ports with it — that offered a place
     to connect that the archetype cannot honour. Same reasoning as a hub's
     echo and a local multiverse's stack. */
  /* Two different questions, which used to share one answer.
   *
   * PAINT is every colour the entry carries: an amalgam's border and text
   * are a gradient across all of them, which is the whole point of the
   * archetype — the lineages that merged are visible in the entry itself.
   * PORTS are the rings you can pull a connector from, and there a hub, a
   * local multiverse and an amalgam take exactly one however many colours
   * they carry: each of those has a second visual layer of its own, and a
   * second ring of ports on top of it offers a place to connect that the
   * archetype cannot honour.
   *
   * Collapsing the two was what quietly took the gradient off every
   * amalgam on the chart. */
  /* An amalgam takes its colours from the LINEAGES that merged into it —
     the very colours its bar is tiled in — rather than from a list set on
     the entry. That is what the archetype means: the entry is what those
     lineages became, and reading its gradient tells you which they were.
     A colour of its own would be a second, contradictory answer to the
     same question, which is why the entry offers no colour field at all. */
  /* A callout with no colour of its own takes the CONNECTOR'S.
   *
   * It is a remark about that connector and it is tied to it by a leader
   * drawn in the connector's own paint — so a card drawn in the chart's
   * default ink, with its leader in the line's colour, was one object
   * painted two ways. Same rule the leader already follows: the border
   * the connector leaves from, or the colour set on the connector, or the
   * source entry's. */
  const paintColors = isAmalgam ? amalgamInheritedColors(n)
    : (n.colors && n.colors.length) ? n.colors
    : (isCallout ? [calloutInheritedColor(n) || n.color] : [n.color]);
  /* What the entry is FILLED with, as opposed to what it is outlined in.
   *
   * This used to be one thing an archetype decided for you: a "mirror
   * reality" was an entry filled with its own border colour, and that was
   * the only way any entry on the chart could be anything but white. Fill
   * is not a claim about what an entry is, though — it is a colour — so it
   * became a property, and a mirror reality is now what it always looked
   * like: an ordinary entry with a background. More than one colour makes
   * a gradient, exactly as an amalgam's border does.
   *
   * Kept in nodeDefs rather than the page's own defs, because a gradient
   * is created per entry per render and the shared defs are never cleared. */
  const bgPaint = (n.bg && n.bg.length)
    ? (n.bg.length > 1 ? makeGradient(n.bg, false, nodeDefs) : n.bg[0])
    : null;
  const bgFillStyle = bgPaint ? `fill:${bgPaint};` : '';
  /* One ring of the border, drawn in whatever style the entry wears.
     `make(inset)` gives the geometry for an outline that far inside the
     ring's own line, which is what a DOUBLE border needs a second of. */
  const borderRing = (tag, make, colour, fillStyle)=>{
    const a = Object.assign({}, make(0), {stroke: colour});
    if(fillStyle) a.style = fillStyle;
    if(borderDash) a['stroke-dasharray'] = borderDash;
    const first = el(tag, a, g);
    if(borderKey === 'double'){
      const b = Object.assign({}, make(BORDER_DOUBLE_GAP),
                              {stroke: colour, class: 'border-inner'});
      b.style = 'fill:none;';
      el(tag, b, g);
    }
    return first;
  };
  const ringColors = isAmalgam ? [paintColors[0]] : paintColors;
  /* An archetype's scenery — a hub's echo, a local multiverse's stack —
     belongs to the entry, not to the particular outline it wears, so it is
     drawn before the box and survives card layout. The OUTLINE is what card
     layout replaces: a card is a card whatever archetype it started as, and
     the archetype keeps only its colour and whatever it draws around
     itself. */
  if(isHub || isLocal){
    const c = ringColors[0];
    const aura = el('g', {class:'node-aura', 'data-id':n.id}, auraLayer);
    /* The scenery starts OUTSIDE whatever the entry itself is drawn with.
       As an archetype a hub was always a plain single-bordered box, so the
       echo could step straight out of n.x; as a tag it can sit on an entry
       already wearing three borders and a rippled edge, and stepping out
       of the box would have drawn the first echo straight through them. */
    const own = (ringCountOf(n) - 1) * ringStepFor(n)
              + (isWavy ? POCKET_LIFT : 0);
    if(isHub){
      for(let i = HUB_ECHOES; i >= 1; i--){
        const grow = own + i * HUB_ECHO_STEP;
        el('rect', {
          x: n.x - grow, y: n.y - grow,
          width: n.w + grow*2, height: h + grow*2,
          rx: 5 + grow, stroke: c, class: 'hub-echo',
          style: `fill:none;opacity:${(0.42 - (i-1)*0.12).toFixed(2)};stroke-width:${(1.5 - (i-1)*0.32).toFixed(2)};`
        }, aura);
      }
    }
    if(isLocal){
      /* A sheet is a COPY of the entry's own outline standing behind it,
         so on a pocket reality it has to be rippled like the outline it
         copies. Drawn as a plain rounded rectangle it read as a stack of
         ordinary boxes behind a wavy one — two different shapes claiming
         to be the same entry seen twice. Same width, same height, same
         corner radius, shifted; only the path differs. */
      /* Card layout replaces the outline with a card, rippled archetype or
         not, so the sheets go back to plain rectangles with it. */
      const sheetShape = (x, y)=> isWavy
        ? {tag:'path', attrs:{d: wavyRectPath(x, y, n.w, h, 0)}}
        : {tag:'rect', attrs:{x, y, width:n.w, height:h, rx:3}};
      for(let i = LOCAL_SHEETS; i >= 1; i--){
        const off = i * LOCAL_SHEET_STEP;
        const shp = sheetShape(n.x + own + off, n.y - own - off);
        el(shp.tag, {
          ...shp.attrs,
          stroke: c, class: 'local-sheet',
          /* Two numbers for the animation: its own distance from the box,
             which is where it stands and therefore where it must START
             (behind the entry, that far back); and the distance of the
             OUTERMOST sheet, which is where every one of them travels to.
           *
             Each used to travel only as far as its own place, so with the
             same duration the far sheet moved twice as fast as the near
             one and the two arrived unevenly — a sheet, a sheet, then a
             wait. Same span and the same time is the same speed, and a
             stagger of one turn divided by their number then puts an even
             gap between them. The far sheet's place is still the limit, so
             nothing travels past what the decoration is drawn as. */
          style: `fill:none;opacity:${(0.42 - (i-1)*0.12).toFixed(2)};` +
                 `stroke-width:${(1.5 - (i-1)*0.32).toFixed(2)};` +
                 `--sheet-off:${(own + off).toFixed(2)}px;` +
                 `--sheet-far:${(own + LOCAL_SHEETS * LOCAL_SHEET_STEP).toFixed(2)}px;`
        }, aura);
      }
    }
  }

  /* An entry's text is written in its own first border colour. A coloured
     border is how an entry says which line it belongs to, and its label
     saying it too is what makes a chart of a dozen colours readable at a
     glance; ink for everything turned every entry into the same entry.
     An entry with no colour of its own resolves to the default ink here
     anyway, so nothing changes for a plain one. */
  let textFill = paintColors[0] || 'var(--ink)';

  /* An invisible frame around the borders, drawn before everything else so
     nothing it covers is a control.
   *
     Hovering an entry is what wakes its edge handles — `.node-handles` are
     pointer-transparent until `.node:hover` — and until now the only thing
     that could BE hovered was the entry's own fill. The four strips you
     grab an edge by therefore woke up only once the pointer was already
     inside the box, which is fine for the left, right and bottom edges,
     because that is the direction you come from. It is not how anyone
     reaches the TOP edge: you come down from above, where the connector
     is, and cross nothing but empty ground until you are past the border
     and into the box — by which point you have gone straight through the
     strip you were aiming for. On an entry with extra borders it was
     worse, since the outer rings sit entirely outside the fill and the
     only live pixels on them were the hairline of the stroke itself: the
     rings you could see were not the rings you could grab, and the entry
     answered a hover by lighting ALL of its edges faintly and none of
     them firmly — the whole border, and no port.
   *
     So the region around the borders is made part of the entry. It is a
     frame rather than a filled box: the middle is already the fill's, and
     a pad reaching this far into a neighbour would be rude. */
  if(!isFree){
    const rings = Math.max(0, ringColors.length - 1) * ringStepFor(n);
    const outer = rings + BAND_HIT_DEFAULT/2
                + (isWavy ? POCKET_LIFT + 1 : 0);
    const inner = BAND_HIT_DEFAULT/2;
    const T = outer + inner, c = (outer - inner)/2;
    if(isBio){
      el('circle', {cx:n.x + n.w/2, cy:n.y + h/2, r: Math.max(1, n.w/2 + c),
                    class:'node-hover-pad', style:`stroke-width:${T.toFixed(2)};`}, g);
    } else {
      el('rect', {x:n.x - c, y:n.y - c, width:n.w + c*2, height:h + c*2, rx:5,
                  class:'node-hover-pad', style:`stroke-width:${T.toFixed(2)};`}, g);
    }
  }

  if(isCard){
    /* Three bands inside one border. The picture is clipped to the card's
       own outline, so its top corners round with the box and it never
       overhangs; two hairlines rule off the heading and the body. There is
       no second border colour here — the rules already divide the card, and
       nested rings on top of them would be noise. */
    const c = ringColors[0];
    const clipId = 'cardclip-' + n.id.replace(/[^a-zA-Z0-9_-]/g,'_');
    const clip = el('clipPath', {id:clipId}, nodeDefs);
    el('rect', {x:n.x, y:n.y, width:w, height:h, rx:5}, clip);
    // The card's own ground, under the three bands.
    el('rect', {x:n.x, y:n.y, width:w, height:h, rx:5,
                style:(bgFillStyle || 'fill:var(--panel);') + 'stroke:none;'}, g);

    if(n.image){
      const img = el('image', {
        x:n.x, y:n.y, width:w, height:cardImgB - n.y,
        'clip-path': `url(#${clipId})`,
        preserveAspectRatio: 'xMidYMid slice'
      }, g);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.image);
      img.setAttribute('href', n.image);
    } else {
      // An empty slot still reads as a slot, so a card without a picture
      // yet looks unfinished rather than broken.
      el('rect', {x:n.x, y:n.y, width:w, height:cardImgB - n.y,
                  'clip-path': `url(#${clipId})`, class:'card-slot'}, g);
      const midX = n.x + w/2, midY = n.y + (cardImgB - n.y)/2;
      el('path', {d:`M${midX-15},${midY+8} L${midX-4},${midY-3} L${midX+3},${midY+3} `+
                     `L${midX+9},${midY-2} L${midX+16},${midY+8} z`, class:'card-slot-mark'}, g);
      el('circle', {cx:midX-9, cy:midY-7, r:3, class:'card-slot-mark'}, g);
    }

    borderRing('rect', (i)=>({x:n.x+i, y:n.y+i, width:w-i*2, height:h-i*2, rx:Math.max(0,5-i)}),
               c, 'fill:none;');
    el('line', {x1:n.x, y1:cardImgB, x2:n.x+w, y2:cardImgB, stroke:c, class:'card-rule'}, g);
    if(cardBody){
      el('line', {x1:n.x, y1:cardHeadB, x2:n.x+w, y2:cardHeadB, stroke:c, class:'card-rule'}, g);
    }
  } else if(isImage){
    /* A picture with nothing around it: no box, no border, no words. It is
       a thing you place on the chart, not an entry in the continuity. */
    if(n.image){
      const img = el('image', {
        x:n.x, y:n.y, width:n.w, height:h,
        preserveAspectRatio: 'xMidYMid meet'
      }, g);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.image);
      img.setAttribute('href', n.image);
    } else {
      // An empty frame, so a picture you haven't chosen yet is still
      // something you can find, move and click.
      el('rect', {x:n.x, y:n.y, width:n.w, height:h, rx:4, class:'image-empty'}, g);
      el('path', {d:`M${n.x+n.w*0.2},${n.y+h*0.72} L${n.x+n.w*0.42},${n.y+h*0.44} `+
                     `L${n.x+n.w*0.58},${n.y+h*0.62} L${n.x+n.w*0.72},${n.y+h*0.48} `+
                     `L${n.x+n.w*0.86},${n.y+h*0.72} z`, class:'image-empty-mark'}, g);
      el('circle', {cx:n.x+n.w*0.3, cy:n.y+h*0.32, r:h*0.07, class:'image-empty-mark'}, g);
    }
  } else if(isTextbox){
    /* Words on the chart with no box around them — a caption, a heading, a
       margin note. The faint outline only shows on hover, so you can still
       grab it without it drawing a box you didn't ask for. */
    el('rect', {x:n.x, y:n.y, width:n.w, height:h, rx:3, class:'textbox-frame'}, g);
    if(n.colors && n.colors.length) textFill = n.colors[0];
  } else if(shape==='amalgam'){
    const paint = paintColors.length>1 ? makeGradient(paintColors, false, nodeDefs) : paintColors[0];
    // fill is set via inline style, not the plain attribute, because the
    // .node rect{fill:var(--panel)} stylesheet rule otherwise wins over it
    borderRing('rect', (i)=>({x:n.x+i, y:n.y+i, width:n.w-i*2, height:h-i*2, rx:Math.max(0,5-i)}),
               paint, bgFillStyle);
    textFill = paint;
  } else if(isBio){
    // A portrait clipped to the circle, with the ring drawn over its edge
    // so the border stays crisp. Without an image the circle is simply
    // empty — the chart still reads, it just has no face yet.
    const cx = n.x+n.w/2, cy = n.y+h/2, r = n.w/2;
    if(n.image){
      const clipId = 'bioclip-' + n.id.replace(/[^a-zA-Z0-9_-]/g,'_');
      const clip = el('clipPath', {id:clipId}, nodeDefs);
      el('circle', {cx, cy, r:r-1}, clip);
      const img = el('image', {
        x: cx-r, y: cy-r, width: r*2, height: r*2,
        'clip-path': `url(#${clipId})`,
        preserveAspectRatio: 'xMidYMid slice'
      }, g);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.image);
      img.setAttribute('href', n.image);
    }
    /* Named. A portrait's border and the invisible pad that catches the
       pointer are both circles inside the same group, and the stylesheet
       could only tell them apart by ORDER — "the first circle is filled,
       the rest are not". The pad is added before the border, so the pad
       took the fill and the border lost it: a portrait with no picture in
       it had nothing under the pointer at all in its middle, and could
       not be picked up except by its two-pixel rim. */
    ringColors.forEach((c,i)=>{
      const grow = i*RING_STEP;
      borderRing('circle',
        (ins)=>({cx, cy, r: Math.max(0.5, r + grow - ins), class:'bio-ring'}),
        c, (i>0 || n.image) ? 'fill:none;' : bgFillStyle);
    });
    if(!n.image){
      /* A neutral silhouette so an empty portrait still reads as one — and
         drawn TO the circle rather than at a fixed size, so it stays
         inside it at every size the circle is dragged to. It used to be
         set for a fifty-pixel circle: the shoulders' own corners sat
         twenty-seven pixels from the middle of a twenty-five pixel
         radius, so they crossed the rim even before anything was
         resized. */
      const u = r / 25;                       // the size it was drawn for
      el('circle', {cx, cy: cy - 5.5*u, r: 7.6*u, class:'bio-placeholder',
                    style:`stroke-width:${(1.6*u).toFixed(2)};`}, g);
      el('path', {d:`M${(cx-13.2*u).toFixed(2)},${(cy+17.5*u).toFixed(2)} ` +
                    `a${(13.2*u).toFixed(2)},${(11.6*u).toFixed(2)} 0 0 1 ${(26.4*u).toFixed(2)},0`,
                  class:'bio-placeholder',
                  style:`stroke-width:${(1.6*u).toFixed(2)};`}, g);
    }
  } else if(isWavy){
    /* The rippled border — the old pocket-reality edge, now one of the six
       styles any entry may wear. Same box as the plain one, drawn with
       sine-wave sides. */
    ringColors.forEach((c,i)=>{
      const grow = i*POCKET_RING_STEP;
      borderRing('path',
        (ins)=>({d: wavyRectPath(n.x-grow+ins, n.y-grow+ins,
                                 n.w+grow*2-ins*2, h+grow*2-ins*2, grow)}),
        c, i>0 ? 'fill:none;' : (bgFillStyle || 'fill:var(--panel);'));
    });
  } else {
    ringColors.forEach((c,i)=>{
      const grow = i*RING_STEP;
      borderRing('rect',
        (ins)=>({x:n.x-grow+ins, y:n.y-grow+ins,
                 width:n.w+grow*2-ins*2, height:h+grow*2-ins*2,
                 rx:Math.max(0, 5+grow-ins)}),
        c, i>0 ? 'fill:none;' : bgFillStyle);
    });
  }

  /* And the words stay readable on whatever the entry is filled with.
   *
   * An entry writes its label in its own border colour, which is right on
   * white paper and can be invisible on anything else — most obviously on
   * a background set to that same colour, which is exactly what a "mirror
   * reality" was. Where the two are too close to tell apart the label
   * takes the plain contrasting ink instead, so the old archetype comes
   * out of the new properties looking exactly as it did. */
  if(!isFree) textFill = readableOn(textFill, (n.bg && n.bg.length) ? n.bg[0] : null);

  /* A rotated text block turns about its own centre. Only the drawing
     turns: the box the chart reasons with — for dragging, selecting and
     the marquee — stays upright, which keeps every other part of the page
     simple and is invisible at the angles a caption actually uses. */
  if(isTextbox && n.rot){
    g.dataset.rotTransform = `rotate(${n.rot},${(n.x+n.w/2).toFixed(2)},${(n.y+h/2).toFixed(2)})`;
    g.setAttribute('transform', g.dataset.rotTransform);
  }

  const centerX = n.x+n.w/2;
  // On a card the label is a heading in its own band, not a label centred
  // in the whole box.
  const textAreaCenterY = isCard ? (cardImgB + cardHeadB)/2 : n.y + h/2;
  // font-family must be an inline style, not a plain attribute — the
  // .node text{font-family:'IBM Plex Sans',...} stylesheet rule beats a
  // presentation attribute but loses to inline style.
  const txt = el('text',{x:centerX, y:0, 'font-size':fontSize, fill:textFill,
    style:`font-family:${fontFamily};`}, g);
  /* A line too long for its box is cut off at the border rather than run
     out over the chart. The window is the box less its own padding, so the
     text stops exactly where every other entry's text stops — and it is
     only built for the entries that actually overflow (see clipText). */
  if(clipText && !isBio && !isImage){
    const clipId = 'textclip-' + n.id.replace(/[^a-zA-Z0-9_-]/g,'_');
    const clip = el('clipPath', {id: clipId}, nodeDefs);
    el('rect', {x: n.x + NODE_PAD_X/2, y: n.y, width: Math.max(1, n.w - NODE_PAD_X),
                height: h}, clip);
    txt.setAttribute('clip-path', `url(#${clipId})`);
  }
  const fontOpts = {fontSize, family:fontFamily};
  // A bio circle shows a portrait, not words: its text belongs to the card
  // that opens beside it when clicked, so nothing is drawn inside.
  if(isBio || isImage){ txt.remove(); }
  else {
    /* Centred on its INK, not on its line grid.
     *
       A line of type has more above its baseline than below it, and a
       reading over a word or a glyph set larger pulls the ink further off
       centre still. Centring the grid therefore left the words sitting
       high in the box by a couple of pixels — a gap at the bottom and none
       at the top, on every entry, which is exactly the uneven padding the
       borders were supposed to have stopped having. */
    const active = textForActive(n, activeLangTab.get(n.id));
    const mb = measureTextBlock(active, maxChars, lineH, fontScale, fontOpts, fit);
    renderNodeText(txt, active, textAreaCenterY - (mb.mid || 0),
                   centerX, maxChars, lineH, fontScale, fontOpts, fit);
  }

  // The card's body: the note, set smaller and quieter than the heading.
  if(isCard && cardBody){
    const bodyEl = el('text', {x:centerX, y:0, 'font-size':cardBodyFS,
      class:'card-body', style:`font-family:${fontFamily};`}, g);
    renderNodeText(bodyEl, cardBody, (cardHeadB + n.y + h)/2, centerX,
                   cardBodyChars, cardBodyLineH, cardBodyScale,
                   {fontSize:cardBodyFS, family:fontFamily}, cardBodyFit);
  }

  if(hasLangTabs && !isBio && !isFree){
    // Tiny clickable "symbol" chips — one for the default/main text ("•")
    // plus one per language tab, using that tab's own short tag as its
    // symbol — tucked into the node's top-left corner, the same
    // corner-badge treatment as the n.link icon at top-right. Clicking one
    // is a purely live, in-canvas swap: it updates the ephemeral
    // activeLangTab map and re-renders just this node's <text>, never the
    // saved data and never the surrounding layout.
    /* The active chip is drawn at full size and the rest a little smaller,
       so which one is showing reads from the shape alone — the colour is
       then a reinforcement rather than the only signal. */
    const CHIP_H = 11, CHIP_GAP = 3, CHIP_FS = 6.3, CHIP_PAD = 4;
    const CHIP_IDLE = 0.82;             // how much smaller an unselected chip is
    const CHIP_R = 2.5;                 // rounded rectangle, not a pill
    const activeIdxNow = activeLangTab.get(n.id) ?? null;
    /* The default text's chip is the US flag rather than a filled dot.
       A dot said nothing about what it switched to, and an orange fill was
       already doing the job of marking which chip is ACTIVE — so the two
       collided, and the default chip looked permanently selected. A flag
       names the language the way every other chip does. */
    const chipLabels = [DEFAULT_LANG_CHIP, ...langTabList.map(t=>t.tag)];
    // On a card they belong to the heading they switch, so they sit on the
    // rule above it rather than at the top of the whole card.
    const chipY = isCard ? cardImgB : n.y;
    let cursorX = n.x + 3;
    // One group, so the whole row can be raised above the edge handles.
    chipGroup = el('g', {class:'lang-chips'}, g);
    chipLabels.forEach((lbl, idx)=>{
      const tabIdx = idx===0 ? null : idx-1;
      const isActive = tabIdx === activeIdxNow;
      const k = isActive ? 1 : CHIP_IDLE;
      const fs = CHIP_FS * k, hh = CHIP_H * k;
      const textW = measureText(lbl, {fontSize:fs, family: lbl === DEFAULT_LANG_CHIP ? EMOJI_FAMILY : undefined});
      const chipW = Math.max(hh, textW + CHIP_PAD*k*2);
      const cx = cursorX + chipW/2;
      const chipG = el('g', {class:'lang-chip' + (isActive ? ' active' : ''),
                             transform:`translate(${cx},${chipY})`}, chipGroup);
      el('rect', {x:-chipW/2, y:-hh/2, width:chipW, height:hh, rx:CHIP_R,
                  class:'lang-chip-bg'}, chipG);
      const chipLabelEl = el('text', {x:0, y:2.1*k, 'text-anchor':'middle', 'font-size':fs,
                                      class:'lang-chip-label' + (lbl === DEFAULT_LANG_CHIP ? ' emoji' : '')}, chipG);
      chipLabelEl.textContent = lbl;
      el('title',{},chipG).textContent = idx===0 ? 'Show the default text' : `Show the "${lbl}" text`;
      chipG.addEventListener('click', ev=>{
        ev.stopPropagation();
        activeLangTab.set(n.id, tabIdx);
        /* The chips change SIZE with the selection, so switching has to
           re-lay them out — toggling a class is no longer enough. */
        renderNodes();
      });
      cursorX += chipW + CHIP_GAP;
    });
    // How far the chips reach along the top edge — reported for the panel
    // and the tests; the edge itself no longer gives up any of its strip
    // for them, since they are drawn over it (see sideBandRect).
    if(chipY === n.y){ n.chipLeft = n.x + 3; n.chipRight = cursorX; }
  }

  /* Corner grips: drag one to give this box a size of its own, overruling
     the text-fitted one. A portrait has them too — it has no text to fit,
     but it has a picture, and how big that picture stands on the chart is
     as much a decision as how big a box is.

     All four corners, not just the bottom-right. A box is resized from
     whichever corner is nearest the hand, and the OPPOSITE corner is what
     stays still — grabbing the top-left and pulling up should grow the box
     upward, the way it does in every drawing program, rather than moving
     the whole entry and resizing it away from the pointer.

     But two of the corners are already spoken for on some entries. The
     link badge sits on the top-right of a plain entry and on the top-left
     of a card; the language chips run along the top edge from the left.
     A grip underneath one of those is a grip the reader cannot hit and,
     worse, one that steals the click from the thing they were aiming at —
     so a covered corner simply has no grip, and its neighbours still do. */
  {
    const linkTopRight = !!(n.link && safeUrl(n.link) && !isFree && !isCard);
    const linkTopLeft  = !!(n.link && safeUrl(n.link) && !isFree && isCard);
    /* How far along the top edge the language chips actually run, or
       nothing when there are none.
     *
       This used to be read as "0 when there are none", and 0 is a
       perfectly good chart coordinate: every entry sitting at a negative x
       — which on this chart is most of the left-hand side — compared its
       own left edge against a reach of zero, decided the chips covered it,
       and quietly lost its top-left grip. A row of chips that does not
       exist reaches nowhere, and `null` is how you say that. */
    const chipL = (typeof n.chipLeft === 'number') ? n.chipLeft : null;
    const chipR = (typeof n.chipRight === 'number' && n.chipRight > (n.chipLeft ?? 0))
      ? n.chipRight : null;
    /* And a corner is only given up where something is genuinely ON it.
       The grip is a small square tucked inside the corner, so the test is
       whether the chip row overlaps THAT square — not whether it starts
       anywhere near the edge. A single chip no longer costs an entry a
       grip at the other end of a two-hundred-pixel box. */
    const GRIP = 10;
    const chipsOver = (cornerX)=>{
      if(chipL === null || chipR === null) return false;
      const gx0 = Math.min(cornerX, cornerX + (cornerX === n.x ? GRIP : -GRIP));
      const gx1 = gx0 + GRIP;
      return chipR > gx0 && chipL < gx1;
    };
    const CORNERS = [
      {key:'se', sx: 1, sy: 1, x: n.x + w, y: n.y + h, blocked:false},
      {key:'sw', sx:-1, sy: 1, x: n.x,     y: n.y + h, blocked:false},
      {key:'ne', sx: 1, sy:-1, x: n.x + w, y: n.y,
       blocked: linkTopRight || chipsOver(n.x + w)},
      {key:'nw', sx:-1, sy:-1, x: n.x,     y: n.y,
       blocked: linkTopLeft || chipsOver(n.x)}
    ];
    /* A portrait's grips sit ON THE RIM, not on the corners of the square
       it is inscribed in.
     *
       The grips are only live while the entry is hovered, and what answers
       the pointer for a circle is the circle — so a corner of the bounding
       box is outside the entry, and reaching for it let go of the hover
       that was showing it. At the default size the corner is close enough
       to the rim that the pointer never leaves; enlarge the portrait and
       the gap grows with the radius, until the grip could not be reached
       at all. On the rim, at the four diagonals, the pointer is still on
       the entry the whole way. */
    if(isBio){
      const cxm = n.x + w/2, cym = n.y + h/2, rr = w/2, k = Math.SQRT1_2;
      CORNERS.forEach(c=>{
        c.x = cxm + c.sx * rr * k;
        c.y = cym + c.sy * rr * k;
      });
    }
    CORNERS.forEach(c=>{
      if(c.blocked) return;
      const grip = el('g', {class:'node-resize node-resize-' + c.key,
        'data-corner': c.key,
        transform:`translate(${c.x},${c.y}) scale(${c.sx},${c.sy})`}, g);
      /* The strip you can grab is the mark you can see, plus a hair. It used
         to reach two pixels PAST the corner and three inside the box, so the
         pointer became a resize handle over ground where nothing was drawn —
         and picking the entry up by its bottom-right corner resized it. */
      el('rect', {x:-9.5, y:-9.5, width:10, height:10, class:'node-resize-hit'}, grip);
      el('path', {d:'M-8,-1 L-1,-8 M-4,-1 L-1,-4', class:'node-resize-mark'}, grip);
      el('title',{},grip).textContent = 'Drag to resize; double-click to fit the text again';
      grip.addEventListener('mousedown', ev=> beginNodeResize(ev, n, g, c));
      grip.addEventListener('click', ev=> ev.stopPropagation());
      grip.addEventListener('dblclick', ev=>{
        ev.stopPropagation();
        if(readOnlyView) return;
        applyEdit(()=>{
          const found = workingEntry(n.id);
          if(!found) return;
          const opts = entryOpts(found.entry);
          delete opts.size;
          putEntry(found.index, found.entry, opts);
        });
      });
    });
    /* And a caption gets one more handle: the round arrow that turns it.
       Only a caption — an entry belongs to a chart that reads left to
       right, and a picture turned on its side is a thing to crop rather
       than to spin. It stands off the top-left corner, where a corner grip
       would be, so the two read as one family of handles. */
    if(isTextbox){
      const rx = n.x - 4, ry = n.y - 4;
      const rot = el('g', {class:'node-rotate', transform:`translate(${rx},${ry})`}, g);
      el('circle', {cx:-5, cy:-5, r:8, class:'node-rotate-hit'}, rot);
      /* Three quarters of a circle with a head on it — the mark every
         drawing program uses, so nobody has to be told what it is. */
      el('path', {d:'M-9.5,-3 A5,5 0 1 1 -3,-1.2', class:'node-rotate-mark'}, rot);
      el('path', {d:'M-1.2,-4.2 L-2.4,0.2 L-6,-1.6 Z', class:'node-rotate-head'}, rot);
      el('title',{},rot).textContent =
        'Drag to turn; hold Shift for eighths of a turn; double-click to put it back level';
      rot.addEventListener('mousedown', ev=> beginNodeRotate(ev, n, g));
      rot.addEventListener('click', ev=> ev.stopPropagation());
      rot.addEventListener('dblclick', ev=>{
        ev.stopPropagation(); ev.preventDefault();
        if(readOnlyView) return;
        applyEdit(()=>{
          const found = workingEntry(n.id);
          if(!found) return;
          const opts = entryOpts(found.entry);
          delete opts.rot;
          putEntry(found.index, found.entry, opts);
        });
      });
    }
  }

  if(n.link && safeUrl(n.link) && !isFree){
    // A real SVG <a> (not a JS window.open() call) — the artifact host
    // renders this page inside a sandboxed iframe, which silently blocks
    // script-initiated window.open() but allows a genuine user-clicked
    // hyperlink through, so the link only works reliably as one.
    const linkWrap = el('a', {href:safeUrl(n.link), target:'_blank', rel:'noopener'}, g);
    // A plain entry wears the badge at its top-right corner; a card wears
    // it at the top-left of its picture, where it reads as belonging to the
    // picture rather than hovering over the heading.
    const lg = el('g',{class:'node-link',
      transform: isCard ? `translate(${n.x+9},${n.y+9})` : `translate(${n.x+n.w},${n.y})`}, linkWrap);
    el('circle',{r:7, cx:0, cy:0}, lg);
    el('path',{d:'M-2.4,2.4 L2.4,-2.4 M-0.8,-2.4 L2.4,-2.4 L2.4,0.8', fill:'none'}, lg);
    el('title',{},lg).textContent = 'Open linked page ↗';
    linkWrap.addEventListener('click', ev=>{ ev.stopPropagation(); });
  }

  // Grab a SIDE, not a point: hovering a node lights up whichever edge the
  // pointer is nearest, and dragging from it draws a connector out of that
  // edge. Ports along the edge are worked out by the router, so there is
  // nothing to aim at — the whole edge is the target.
  //
  // A node with more than one border color has one band per ring, each
  // grabbable in its own right: pull from the black ring and the connector
  // comes out black, from the grey ring and it comes out grey. That's what
  // makes a two-colour node able to carry two differently-coloured
  // lineages without them being confused for one.
  const handles = isFree ? null : el('g', {class:'node-handles'}, g);
  /* The side a callout's own leader arrives at is not a side you can
     connect to. Something is already attached there — the line back to the
     place on the connector this card is talking about — and a second line
     landing on the same edge reads as one line passing through the card.
     The other three sides behave exactly as any entry's do. */
  const takenSide = isCallout ? calloutLeaderSide(n) : null;
  if(!isFree) SIDES.forEach(side=>{
    if(side === takenSide) return;
    // Innermost ring first, so where two hit strips still graze each other
    // the inner one is the one on top and stays reachable.
    ringColors.map((c,i)=>[c,i]).reverse().forEach(([ringColor, ring])=>{
      // Rings step outward, so ring 1 sits OUTSIDE the box — a negative
      // inset is what sideBandRect wants for that.
      const inset = -ring*ringStepFor(n);
      /* A rippled border is not a line but a band a whole ripple deep, so
         the strip you grab it by has to be that deep too — a 5px strip on
         the baseline missed every crest, and the border you could see was
         mostly not the border you could grab. */
      const band = sideBandRect(n, h, side, inset,
                                isWavy
                                  ? Math.max(BAND_HIT_DEFAULT, POCKET_LIFT*2 + 2)
                                  : BAND_HIT_DEFAULT);
      const hg = el('g', {class:'node-handle', 'data-side':side,
                          'data-ring':ring, 'data-id':n.id}, handles);
      // A wide invisible strip catches the pointer; the visible highlight
      // is the thinner one drawn on the border itself.
      el('rect', Object.assign({class:'node-handle-hit'}, band.hit), hg);
      if(isWavy){
        const grow = ring*POCKET_RING_STEP;
        el('path', {class:'node-handle-band wave',
                    d: wavySideOpenPath(n.x-grow, n.y-grow, n.w+grow*2, h+grow*2, side, grow),
                    style:`fill:none;stroke:${ringColor};stroke-width:${BAND_W};`}, hg);
      } else {
        el('rect', Object.assign({class:'node-handle-band', style:`fill:${ringColor};`}, band.show), hg);
      }
      el('title',{},hg).textContent = ringColors.length > 1
        ? `Drag from this ${side} edge (${ringColor}) to connect`
        : `Drag from the ${side} edge to connect`;
      hg.addEventListener('mousedown', ev=> beginConnectorDrag(ev, n, side, ring, ringColor));
      hg.addEventListener('click', ev=> ev.stopPropagation());
    });
  });

  /* The chips are built before the connector handles, so they would sit
     under them. Moving them to the end puts them back on top: the edge's
     highlight sweeps behind the chips, and the chips stay clickable. */
  if(chipGroup && chipGroup.parentNode === g) g.appendChild(chipGroup);

  /* A tag that DOES something to its entry says so when you look at the
     entry. The decorations are still, and still is right for a chart being
     read — a page of things quietly moving is a page nobody can read — but
     under the pointer, and while the entry is open in the panel, each one
     performs what it means: the hub's echo goes out, the weave catches the
     light, the stack streams away. Hover and open are the same gesture in
     two speeds, so both drive it; see syncTagLiveliness, which is what
     reaches the decorations, since they live in layers of their own and no
     stylesheet can reach a sibling three parents away. */
  g.addEventListener('mouseenter', ()=>{ hoverLivelyId = n.id; syncTagLiveliness(); });
  g.addEventListener('mouseleave', ()=>{
    if(hoverLivelyId === n.id){ hoverLivelyId = null; syncTagLiveliness(); }
  });
  g.addEventListener('mousedown', ev=> beginNodeDrag(ev, n, g));
  g.addEventListener('click',(ev)=>{
    ev.stopPropagation();
    // A drag that actually moved the node ends with a click event too —
    // swallow that one so letting go of a node doesn't also re-select it.
    if(suppressNodeClick){ suppressNodeClick = false; return; }
    // Ctrl/Cmd-click adds to or removes from the selection instead of
    // replacing it.
    if(ev.ctrlKey || ev.metaKey){ toggleInSelection(n.id); return; }
    /* Selecting is immediate — that is what the entry looks like being
       pressed. Opening a PANEL waits to see whether a second click is
       coming: a double click means "edit this", and the panel the first
       click would have opened flashed up and was replaced a moment later,
       which read as the wrong menu opening by mistake. */
    /* A callout is not opened in the entry panel. It has no lineage, no
       archetype, no tags and no note — the whole of it is the words on the
       card — so the panel that would open is a form about a thing that
       does not exist. It gets a card of its own instead, and opens at
       once: there is no second click to wait for, because the only other
       gesture on a callout is carrying it. */
    /* One click picks it up, two open it — the same pair of gestures every
       other entry answers to. Opening the card on the first click meant a
       reader could not simply select a callout to move or delete it
       without a form appearing over the drawing each time. */
    if(isCallout){
      selectNode(n.id, {quiet:true});
      paintMultiSelection();
      closeCalloutPopover();
      return;
    }
    selectNode(n.id);
    paintMultiSelection();
    clearTimeout(nodeClickTimer);
    const wantsBio = isBio, wantsFree = isFree, evForMenu = ev;
    nodeClickTimer = setTimeout(()=>{
      nodeClickTimer = null;
      if(wantsBio) openBioCard(n.id, true); else closeBioCard();
      if(wantsFree) openFreeMenu(n.id, evForMenu); else closeFreeMenu();
    }, DOUBLE_CLICK_GRACE);
  });
  /* Double-click is the shortcut everyone tries first: it skips the
     select-then-find-the-pencil dance and drops the cursor straight into
     this entry's text, with the box itself updating as you type. */
  g.addEventListener('dblclick', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    // The pending single-click panel never happens: this was a double.
    clearTimeout(nodeClickTimer); nodeClickTimer = null;
    if(document.body.classList.contains('read-only')) return;
    /* A free-standing element is edited in its OWN card, not in the
       entry drawer.
     *
       Double-clicking a loose caption used to open the drawer's entry
       form and put the cursor in its Label — a form about lineage,
       archetype, colours and tags, none of which a caption has, and which
       still showed the last ENTRY that was open in it. A caption's text
       lives in the free card, so that is what a double click opens, with
       the cursor in the words. A picture has no text at all, so for one
       the card opens on its file picker. */
    if(isFree){
      selectNode(n.id); paintMultiSelection();
      openFreeMenu(n.id, ev);
      if(!isImage){
        const rec = richFields.get('freeMenuText');
        const surface = rec ? rec.surface : document.getElementById('freeMenuText');
        if(surface){
          surface.focus({preventScroll:true});
          try{
            const sel = window.getSelection(), r = document.createRange();
            r.selectNodeContents(surface); r.collapse(false);
            sel.removeAllRanges(); sel.addRange(r);
          }catch(e){}
        }
      }
      return;
    }
    // A callout's text is already one click away, in its own card.
    if(isCallout){ selectNode(n.id, {quiet:true}); paintMultiSelection(); openCalloutPopover(n.id, ev); return; }
    /* On the entry itself, where the words are. The drawer's Label field
       is still there and still works; it is no longer the only way in. */
    if(openNodeEditor(n.id)) return;
    openLabelEditor(n.id);
  });
  if(isBio){
    // The card is a reading aid, so it appears on hover — clicking is only
    // needed when you want it to stay while you work elsewhere.
    g.addEventListener('mouseenter', ()=>{
      if(bioCardPinned) return;
      if(!bioHoverWanted(n.id)) return;
      openBioCard(n.id);
    });
    g.addEventListener('mouseleave', ()=>{
      if(bioCardPinned || bioCardNodeId !== n.id) return;
      // A short grace period so crossing the gap to the card doesn't
      // flicker it away.
      bioHoverTimer = setTimeout(()=>{ if(!bioCardPinned) closeBioCard(); }, 160);
    });
    g.addEventListener('mouseenter', ()=> clearTimeout(bioHoverTimer));
  }
  g.addEventListener('mouseenter',()=>g.classList.add('hover'));
  g.addEventListener('mouseleave',()=>g.classList.remove('hover'));
});
}
renderNodes();

// draw edge paths now that node heights are known. Style (routing + line
// pattern) is per-edge via edgeStyleFor(from,to) — see EDGE_STYLES above.
// Each visible path gets an invisible wider "hit" path layered with it so
// clicking anywhere near the line (not just exactly on a thin stroke) opens
// that edge's style popover. redrawEdges() is also called by the popover to
// live-preview a change without touching node layout.
const DASH_PATTERNS = { solid: null, dashed: '7 5', dotted: '1.5 4', dashdot: '9 4 1.5 4', double: null };

/* A "double" connector is one line with a gutter down its middle — the same
   shape `text-decoration-style: double` draws under a word, which is why it
   is offered here: the connector styles and the text underline styles are
   meant to be the same vocabulary.

   SVG has no double stroke, so it is drawn as two: the connector at extra
   width in its own paint, and a narrower stroke of the paper colour laid
   over it, which leaves two rails with a gap between them. The overlay is
   given the SAME classes and the same data-from/data-to as the line it
   splits, so the tag filter, the selection dimming and the highlight treat
   the pair as one connector and never light one rail without the other.
   Its own paint attribute is dropped — .edge.dbl-inner names the paper
   colour in the stylesheet, which is what lets a double line follow the
   page's theme instead of being frozen to whatever white it was born on. */
function isDoubleDash(style){ return !!style && style.dash === 'double'; }
function edgePath(attrs, style, layer){
  const target = layer || edgeLayer;
  if(!isDoubleDash(style)) return el('path', attrs, target);
  const cls = attrs.class || 'edge';
  const outer = el('path', Object.assign({}, attrs, {class: cls + ' dbl-outer'}), target);
  const inner = Object.assign({}, attrs, {class: cls + ' dbl-inner'});
  delete inner.stroke;
  delete inner['stroke-dasharray'];
  delete inner['stroke-dashoffset'];
  el('path', inner, target);
  return outer;
}

function edgeHit(d, from, to){
  const hit = el('path', {class:'edge-hit', d, 'data-from':from, 'data-to':to}, edgeLayer);
  hit.addEventListener('click', ev=>{ ev.stopPropagation(); openEdgeStylePopover(from, to, ev); });
  return hit;
}

/* A connector is built from nothing on every redraw, so it is born at full
   strength and only learns a moment later — when the selection highlight
   is painted back on — that it is one of the dimmed ones. Opacity carries
   a fade, and that moment is long enough to see: press ⟲, or type a letter
   into a label, and every faded connector on the chart flared up and sank
   back. The fade belongs to a filter being CHANGED, not to a line being
   drawn for the first time, so it is held off for the frame the lines are
   new in. */
let edgeFadeFrame = 0;
function silenceEdgeFade(){
  edgeLayer.classList.add('no-fade');
  arrowLayer.classList.add('no-fade');
  if(edgeFadeFrame) cancelAnimationFrame(edgeFadeFrame);
  edgeFadeFrame = requestAnimationFrame(()=>{
    edgeFadeFrame = requestAnimationFrame(()=>{
      edgeFadeFrame = 0;
      edgeLayer.classList.remove('no-fade');
      arrowLayer.classList.remove('no-fade');
    });
  });
}
function redrawEdges(){
  silenceEdgeFade();
  while(edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
  while(leaderHitLayer.firstChild) leaderHitLayer.removeChild(leaderHitLayer.firstChild);
  // Every gradient/marker made below is re-created fresh each call, so the
  // group holding them is cleared first — otherwise every live-preview
  // edit (routing/color/etc. change while the popover is open) would leak
  // another orphaned <linearGradient>/<marker> into the defs forever.
  while(arrowLayer.firstChild) arrowLayer.removeChild(arrowLayer.firstChild);
  while(edgeDefs.firstChild) edgeDefs.removeChild(edgeDefs.firstChild);
  // The clips live in edgeDefs, so the cache goes with them.
  outsideClips.clear();

  // Routing is order-sensitive: each connector avoids the ones already
  // drawn (see scorePath), so the record of what's been drawn has to start
  // empty on every redraw or a live preview would steer around ghosts.
  resetRoutedSegments();
  // Entries have just been laid out or moved; the obstacle set is stale.
  invalidateObstacles();
  let ports = resolvePorts(structEdges);

  /* Amalgamation. An amalgam reality is one made OF other realities, and
     its connectors are drawn to say so: where several lineages arrive at
     the same edge of an amalgam entry, they stop short of it and line up
     into a single bar — one continuous line divided into a stretch of each
     parent's own colour, laid end to end and never overlapping — and a
     single arrow carrying all those colours as a gradient runs from the
     middle of that bar into the entry. Two arrows meeting the same edge of
     an ordinary entry stay two arrows; merging only happens where the
     archetype says these lineages combine into one thing. */
  const amalgamGroups = new Map();   // "to|side|ring" -> [edge, ...]
  const merged = new Set();
  amalgamMemberKeys.clear();
  structEdges.forEach(e=>{
    const b = nodes.get(e.to);
    if(!b || (b.shape||'') !== 'amalgam') return;
    const rec = ports.get(e);
    if(!rec || !rec.p2) return;
    /* Grouped by the entry and the border ring, NOT by which side each
       lineage happens to arrive on. Sides are chosen per connector from
       where its source sits, so dragging an amalgam far enough sideways
       used to put one lineage on the top edge and another on the left —
       two different keys, no group, and the merged bar silently came
       apart into ordinary connectors halfway through a drag. An amalgam
       is one bar into one port by definition; the side is settled once
       for the whole group, in drawAmalgam. */
    const key = e.to + '|' + (rec.toRing||0);
    if(!amalgamGroups.has(key)) amalgamGroups.set(key, []);
    amalgamGroups.get(key).push(e);
  });
  amalgamGroups.forEach(list=>{
    if(list.length <= 1) return;
    list.forEach(e=>{ merged.add(e); amalgamMemberKeys.add(edgePairKey(e.from, e.to)); });
  });

  /* Ports, a second time, now that the merges have had their say.
   *
   * Which side of its own entry a lineage leaves by is decided by where
   * the bar hangs, and that answer only exists once the group is known.
   * The first pass could not know it, so a side carrying both a merged
   * lineage and an ordinary connector spaced them as if each were alone —
   * the merged one taking the middle, the other one placed beside a
   * neighbour it could not see. Handing the decision back and resolving
   * again puts every connector on that side into one row. */
  const sideOverrides = new Map();
  amalgamGroups.forEach(list=>{
    if(list.length <= 1) return;
    const geo = amalgamGeometry(list, ports);
    if(!geo) return;
    list.forEach(e=>{
      const a = nodes.get(e.from);
      if(!a) return;
      sideOverrides.set(e, {fromSide: amalgamFromSide(a, geo, edgeStyleFor(e.from, e.to)),
                            toSide: geo.side});
    });
  });
  if(sideOverrides.size) ports = resolvePorts(structEdges, sideOverrides);

  structEdges.forEach(e=>{
    if(merged.has(e)) return;
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if(!a||!b) return;
    const style = edgeStyleFor(e.from, e.to);
    const { d, angleDeg, pts } = routeEdge(a,b,style,ports.get(e));
    const dash = DASH_PATTERNS[style.dash];
    const grad = style.gradient;
    /* The colour a connector takes when it was not given one: the border
       ring it LEAVES from. A connector is drawn out of a border, and that
       border is what says which lineage it carries — which is already how
       an amalgam's members are coloured, so an ordinary connector taking
       the colour of the entry it happens to point AT made the two read as
       different kinds of line on the same chart. */
    const edgeColor = style.colorFixed ? style.color
      : (portRingColor(a, style.fromRing) || style.color || e.color);
    // One gradient serves the line and both heads, so the colour runs
    // through the whole connector without a seam at the tips.
    const paint = grad ? makeEdgeGradient(grad, pts) : edgeColor;
    // Arrowheads point in the connector's overall (skeleton-path)
    // direction, never the local tangent of its rendered (possibly wavy)
    // curve.
    const headOut = style.arrow !== false, headIn = !!style.arrowIn;
    /* The drawn line stops where its arrowheads begin — see trimForHeads.
       A wavy line is not shortened but told where its heads are, so its
       ripple is laid out on the full geometry and stays put; see wavyPath. */
    const rec = ports.get(e) || {};
    const cutIn = headIn ? headCut(rec.p1) : 0, cutOut = headOut ? headCut(rec.p2) : 0;
    const drawPts = style.sinusoid ? pts
      : trimForHeads(pts, headIn, headOut, rec.p1, rec.p2);
    const drawD = style.sinusoid ? wavyPath(pts, cutIn, cutOut)
      : drawPts === pts ? d
      : style.routing === 'straight'
        ? `M${drawPts[0].x},${drawPts[0].y} L${drawPts[drawPts.length-1].x},${drawPts[drawPts.length-1].y}`
        : roundedPath(drawPts, EDGE_CORNER_R);
    const attrs = {class:'edge struct', d: drawD, stroke: paint, 'data-from':e.from,'data-to':e.to};
    if(dash){
      attrs['stroke-dasharray'] = dash;
      /* A dash pattern is measured from the path's start, so a line that
         gave up its first few pixels to an arrowhead had its whole pattern
         slide along by that much. Offsetting the pattern by the same
         amount puts every dash back where it was: turning a head on now
         changes only where the line begins, never its rhythm. */
      if(cutIn) attrs['stroke-dashoffset'] = cutIn.toFixed(2);
    }
    edgePath(attrs, style, edgeLayer);
    const last = pts[pts.length-1], first = pts[0];
    /* A connector pulled from an inner border ring ends INSIDE the outer
       rings, which are drawn over the connector layer — so its last few
       pixels were hidden and it looked like it stopped at the outer border
       instead of reaching the ring it belongs to. An arrowhead happened to
       cover that gap; a plain line had nothing to cover it with. These
       short caps redraw exactly that buried stretch above the entry, so a
       connector visibly meets its own ring whether or not it has a head. */
    /* Capped from the PORT records, not from the routed points. The router
       returns plain {x,y} for its path, so the side and ring the cap needs
       to know about were lost on the way — which is why a cap only ever
       appeared when the route happened to hand its endpoints back
       untouched. */
    const dbl = isDoubleDash(style);
    /* The PORT records, not the drawn endpoints. The two differ on a
       rippled border — the drawn end is carried under the fill — and it is
       the border the cap has to start from. */
    drawRingCap(rec.p1 || {x:first.x, y:first.y}, paint, dash, e.from, e.to, dbl);
    drawRingCap(rec.p2 || {x:last.x, y:last.y}, paint, dash, e.from, e.to, dbl);
    const tipOut = rec.p2 ? portTip(Object.assign({}, rec.p2, {x:last.x, y:last.y})) : last;
    const tipIn  = rec.p1 ? portTip(Object.assign({}, rec.p1, {x:first.x, y:first.y})) : first;
    if(headOut) drawArrowHead(arrowLayerFor(last.ring, rec.p2), tipOut.x, tipOut.y,
                              angleDeg, paint, e.from, e.to,
                              rec.p2 && rec.p2.wavy ? e.to : null,
                              rec.p2 ? rec.p2.ring : 0);
    if(headIn) drawArrowHead(arrowLayerFor(first.ring, rec.p1), tipIn.x, tipIn.y,
                             startAngleDeg(pts), paint, e.from, e.to,
                             rec.p1 && rec.p1.wavy ? e.from : null,
                             rec.p1 ? rec.p1.ring : 0);
    if(style.note) drawEdgeNote(style.note, pts, style.notePos, e.from, e.to, style.noteAt, paint, style.noteBg);
    // Every callout hanging off this connector, now that its route is known.
    drawCalloutLeaders(e.from, e.to, pts, paint);
    edgeHit(d, e.from, e.to);
  });

  amalgamGroups.forEach(list=>{ if(list.length > 1) drawAmalgam(list, ports); });
  flushPendingCallouts();
  // The bend handles stand on the route that has just been drawn.
  drawBendHandles();
}
/* Any converted callout whose connector was never drawn.
 *
 * A chart can carry a style for a pair of entries that are no longer joined
 * — deleting a connector leaves its settings behind — and a leader note on
 * such a style became a callout pointing at a route that is never computed.
 * Left in the map it would sit at the origin for ever. It is placed beside
 * whichever of its two named entries can be found instead, and stops being
 * pending; the card is then an ordinary loose comment, which is exactly
 * what it now is. */
function flushPendingCallouts(){
  if(!pendingCallouts.size) return;
  let moved = false;
  [...pendingCallouts.entries()].forEach(([id, want])=>{
    pendingCallouts.delete(id);
    const n = nodes.get(id);
    const near = nodes.get(want.from) || nodes.get(want.to);
    const found = workingEntry(id);
    if(!n || !found) return;
    const cx = near ? near.x + near.w/2 : 0;
    const cy = near ? near.y + near.h + 60 : 0;
    const opts = entryOpts(found.entry);
    opts.pos = [Math.round(cx - n.w/2), Math.round(cy)];
    delete opts.leader;
    putEntry(found.index, found.entry, opts);
    moved = true;
  });
  if(moved) requestAnimationFrame(()=> rebuildChart());
}

/* AMALGAM_GAP is the closest the bar is ever allowed to sit to the entry;
   AMALGAM_LEAD is the clearance it keeps below the nearest parent, which is
   what it actually hangs from. Anchoring the bar to the parents rather than
   to the entry is what lets the merged arrow behave like a real connector:
   drag the amalgam away and the arrow lengthens, drag it closer and the
   arrow shortens, while the bar stays put where the lineages meet.

   Both are kept small so that the bar stays anchored to the parents over as
   much of the chart as possible: the clearance floor only takes over when
   the entry has been dragged right up under them, and until then moving the
   entry changes nothing but the length of the merged arrow. */
const AMALGAM_GAP = 24, AMALGAM_LEAD = 34, AMALGAM_PITCH = 30;
// The furthest the shared bar may stand off its entry, and the furthest
// along that bar a lineage may land.
/* The span cap stops the bar growing across the chart — but it is also
   what forces a lineage to step sideways before it can drop onto its
   landing, because the landing is no longer under the parent. At 150 that
   step showed up on quite ordinary layouts. Wide enough now that a normal
   arrangement lands each lineage straight below its parent and comes down
   in one clean run; a genuinely sprawling one still gets a bounded bar and
   a visible, rounded step. */
/* Where each merge's bar last ran, along its own axis and in chart
   coordinates. Filled in by drawAmalgam; read by a drag that offers to
   centre the entry on its own bar. */
const amalgamBars = new Map();
/* How far a lineage runs straight down before it touches the bar. Two
   corner radii and a little over, so the bend onto the bar always has a
   full radius of leg to sit in and can never square off. */
const AMALGAM_APPROACH = EDGE_CORNER_R * 2 + 4;
// The joint beads between neighbouring stretches of the bar. A shade
// smaller than the junction's, so the point the merged arrow leaves from
// still reads as the principal one.
const AMALGAM_JOINT_R = 3.1;
// Wide enough to cover where the members, the bar and the arrow meet.
const AMALGAM_BEAD_R = 3.6;
/* How close two beads may come before they stop reading as two marks.
   A little more than the pair's own widths: touching is one mark, and a
   sliver of bar between two dots reads as a mistake rather than as two
   things worth telling apart. */
const AMALGAM_BEAD_CLEAR = 13;

/* Which connectors are currently drawn as part of a merge. Rebuilt on every
   redraw and read by the style popover, which greys out the arrowhead
   toggles for them: a lineage feeding an amalgam has no arrowhead of its
   own — it runs into the shared bar, and the one arrow into the entry
   belongs to the merge. Offering a switch that does nothing is worse than
   offering none. */
const amalgamMemberKeys = new Set();
// One place builds the key, so the two ends can never drift apart.
function edgePairKey(from, to){ return from + '\u0000' + to; }
function isAmalgamMember(from, to){ return amalgamMemberKeys.has(edgePairKey(from, to)); }

/* The colour of one border ring of an entry — what the port on that ring
   is drawn in, and so what a connector leaving it inherits. */
function portRingColor(node, ring){
  if(!node) return null;
  if(node.colors && node.colors.length) return node.colors[ring || 0] || node.colors[0];
  return node.color || null;
}
/* The colours an amalgam wears: one per lineage feeding it, in the order
   they lie along its bar. Falls back to whatever the entry itself carries
   while it has fewer than two lineages and is not yet a merge at all. */
function amalgamInheritedColors(n){
  const parents = (n.parents || []).map(id=> nodes.get(id)).filter(Boolean);
  if(parents.length < 2) return (n.colors && n.colors.length) ? n.colors : [n.color];
  return parents
    .slice()
    .sort((p, q)=> (p.x + p.w/2) - (q.x + q.w/2) || (p.y + p.h/2) - (q.y + q.h/2))
    .map(p=> amalgamMemberColor({from: p.id, to: n.id}));
}
function amalgamMemberColor(e){
  const style = edgeStyleFor(e.from, e.to);
  if(style.colorFixed && style.color) return style.color;
  // The ring the connector was pulled from is the lineage it represents,
  // so a two-coloured parent contributes the colour of that ring — the
  // same rule every other connector follows.
  return portRingColor(nodes.get(e.from), style.fromRing) || style.color || '#20242b';
}

/* Where a merge's bar hangs, and which way it runs — worked out from the
   entry and the lineages alone, so it can be asked BEFORE the ports are
   assigned as well as while the thing is being drawn. */
function amalgamGeometry(list, ports){
  const b = nodes.get(list[0].to);
  if(!b) return null;
  const rec0 = ports.get(list[0]);
  if(!rec0) return null;
  const ring = rec0.toRing || 0;
  /* One side for the whole merge — whichever most of the lineages already
     chose, so the bar lands where the group naturally wants it and the
     odd one out is routed round to join it. */
  const sideVotes = new Map();
  list.forEach(e=>{
    const r = ports.get(e);
    if(!r || !r.toSide) return;
    sideVotes.set(r.toSide, (sideVotes.get(r.toSide) || 0) + 1);
  });
  let side = rec0.toSide;
  let best = -1;
  SIDES.forEach(sName=>{
    const v = sideVotes.get(sName) || 0;
    if(v > best){ best = v; side = sName; }
  });
  const nrm = SIDE_NORMAL[side] || {x:0, y:-1};
  // The bar runs along the side, so its axis is the side's own direction.
  const ux = sideIsVertical(side) ? 1 : 0;
  const uy = sideIsVertical(side) ? 0 : 1;
  // The single port everything funnels into: the middle of that edge.
  const port = portOnSide(b, side, 0, 1, ring);
  let nearest = Infinity;
  list.forEach(e=>{
    const sN = nodes.get(e.from);
    if(!sN) return;
    [[sN.x, sN.y], [sN.x+sN.w, sN.y], [sN.x, sN.y+sN.h], [sN.x+sN.w, sN.y+sN.h]]
      .forEach(([px, py])=>{
        const d = (px - port.x) * nrm.x + (py - port.y) * nrm.y;
        if(d < nearest) nearest = d;
      });
  });
  /* The bar hangs from the LINEAGES, not from the entry.
   *
   * It is the level they arrive at and hand over on, so its distance is
   * measured from the lowest of them — AMALGAM_LEAD clear of it — and the
   * entry's own position has nothing to say about it. There used to be a
   * ceiling on that distance as well, and a ceiling measured from the
   * ENTRY is the entry deciding where the bar goes after all: past it the
   * bar simply sat a fixed distance above the amalgam and travelled with
   * it, so dragging the entry dragged the whole merge — the bar, the
   * lineages' drops onto it, the sides they left by, and any callout
   * hanging off one of those connectors. The only floor left is the one
   * the shape itself imposes: the bar may not be inside the entry it
   * feeds. */
  const barDist = Math.max(AMALGAM_GAP,
    Number.isFinite(nearest) ? nearest - AMALGAM_LEAD : AMALGAM_GAP);
  return {b, ring, side, nrm, ux, uy, port, nearest, barDist,
          cx: port.x + nrm.x * barDist, cy: port.y + nrm.y * barDist};
}
/* Which side of its own entry a lineage leaves by.
 *
 * Three cases, not two. An entry BEYOND the bar comes back towards the
 * merge and leaves by the side facing it; one SHORT of the bar goes out to
 * it and leaves by the side facing away. The third is the one that used to
 * be missing: an entry standing LEVEL with the bar — its box spanning the
 * height the bar runs at, which happens the moment one is dragged
 * alongside the merge. Neither of the first two is available there, and
 * picking one anyway sent the line out of the box and straight back over
 * itself: the loop around the outside that the lineages at the ends of a
 * bar kept drawing while the ones in the middle came down cleanly. Level
 * with the bar, a lineage leaves SIDEWAYS, by the side facing the merge,
 * and runs onto the bar end-on. A side set by hand still wins over all
 * three. */
function amalgamFromSide(a, geo, style){
  if(SIDES.includes(style && style.fromSide)) return style.fromSide;
  const {cx, cy, nrm, ux, uy, side} = geo;
  const normOf = (px, py)=> (px - cx)*nrm.x + (py - cy)*nrm.y;
  const corners = [[a.x, a.y], [a.x+a.w, a.y], [a.x, a.y+a.h], [a.x+a.w, a.y+a.h]];
  const ns = corners.map(([px, py])=> normOf(px, py));
  const lo = Math.min(...ns), hi = Math.max(...ns);
  if(lo < 0 && hi > 0){
    // Level with the bar: leave by the side pointing back at the merge.
    const along = (a.x + a.w/2 - cx)*ux + (a.y + a.h/2 - cy)*uy;
    if(sideIsVertical(side)) return along > 0 ? 'left' : 'right';
    return along > 0 ? 'top' : 'bottom';
  }
  const pc = {x: a.x + a.w/2, y: a.y + a.h/2};
  return normOf(pc.x, pc.y) >= 0 ? OPPOSITE_SIDE[side] : side;
}

function drawAmalgam(list, ports){
  const geo = amalgamGeometry(list, ports);
  if(!geo) return;
  const {b, ring, side, nrm, ux, uy, port} = geo;

  // Members read along the bar in the order their sources actually lie, so
  // the lines fan in without crossing each other.
  let members = list.slice().sort((m1,m2)=>{
    const s1 = nodes.get(m1.from), s2 = nodes.get(m2.from);
    if(!s1 || !s2) return 0;
    return sideIsVertical(side)
      ? (s1.x + s1.w/2) - (s2.x + s2.w/2)
      : (s1.y + s1.h/2) - (s2.y + s2.h/2);
  });
  /* A straight lineage keeps its PLACE on the bar and gives up only its
     elbows: it lands exactly where it would have landed with corners —
     its own stretch of the bar, between its neighbours' — and simply runs
     to that landing in one line instead of coming down onto it and
     turning. Leaving it out of the bar's arithmetic, which is what this
     did first, moved it onto the nearest handover BEAD instead: a point
     that belongs to a neighbour's turn, not to this lineage at all.
     With every lineage straight there is no bar to keep a place on, and
     the merge takes its other form entirely — see drawStraightAmalgam. */
  const allMembers = members;
  const allStraight = allMembers.every(e=> edgeStyleFor(e.from, e.to).routing === 'straight');
  const n = members.length;
  /* Where the bar hangs — see amalgamGeometry, which works it out from the
     entry and its lineages alone so that the answer is available before
     the ports are assigned as well as here. */
  const {barDist, cx, cy} = geo;
  /* The junction, where the bar hands over to the merged arrow.
   *
   * This used to be pulled a little towards the entry, and the innermost
   * members curved down into it, so the bar sagged where the arrow left
   * it. The intent was to make the junction read as lineages POURING into
   * the arrow rather than three lines that happen to touch — but it only
   * ever worked from one side, and against a straight bar the sag showed
   * as a hook on the left of the joint and nothing on the right.
   *
   * The bead does that job now, and does it symmetrically. So the members
   * run straight onto the bar, the arrow leaves from the bar's own centre,
   * and the bead covers the meeting. One decoration instead of two that
   * disagreed. */
  // Filled in once the landings are known: the junction has to sit ON the
  // bar, and where the bar is depends on where the lineages come from.
  let dimple = {x: cx, y: cy};

  /* The straight merge.
   *
   * The bar exists to give elbowed lineages somewhere to turn onto: they
   * come down, turn once, run along it, and hand over. A lineage routed
   * STRAIGHT does none of that — it runs from its entry to wherever it is
   * going in one line — so a bar under a fan of straight lines is a level
   * nothing needs, with a stub of it left over at either end and a right
   * angle written into a construction that has no right angles anywhere
   * else in it.
   *
   * So when every lineage of a merge is straight, there is no bar: each
   * one runs directly to the point where the colours hand over, which is
   * where the merged arrow leaves from and where the bead already sits.
   * Mix the routings and the bar comes back — the elbowed ones still need
   * it, and half a bar would be worse than all of it. */
  if(allStraight){
    drawStraightAmalgam(allMembers, ports, b, port, ring, {x:cx, y:cy}, ux, uy, nrm, side);
    return;
  }

  /* The bar runs from the first parent's line to the last and no further —
     it is the span the lineages actually cover, not a row of equal tiles
     with half a tile sticking out at either end. Landing offsets are
     symmetric about the entry's centre, so the merged arrow leaves from the
     bar's true middle. Each member owns the stretch from the midpoint with
     its previous neighbour to the midpoint with the next. */
  /* Where each lineage lands on the bar.
   *
   * These used to be fixed slots spread symmetrically about the entry's
   * own centre, regardless of where the lineages actually were. That is
   * right when they sit above the entry, and wrong the moment they do not:
   * with every parent off to one side, the leftmost slot still sat to the
   * LEFT of the entry, so the member assigned to it ran past the junction
   * and doubled back — the stub of bar reaching out to nothing that shows
   * up as soon as an amalgam is dragged away from its lineages.
   *
   * Each member now lands where it actually approaches from, so the bar
   * spans the ground the lineages really cover, and neighbours keep at
   * least AMALGAM_PITCH between them, so two lineages arriving from nearly
   * the same place still get their own stretch of bar.
   *
   * `members` is already sorted by approach, so spacing them out is a
   * single forward pass — and a backward pass to pull the row back inside
   * the span if the forward one pushed its tail past the end. */
  /* The cap is never tighter than the ground the lineages themselves
     cover. It exists to stop the bar chasing an entry dragged away from
     its lineages — not to pull a lineage off the line it comes down on,
     which is what a fixed cap did as soon as the parents stood further
     apart than the cap: the outer ones had to step sideways before they
     could drop onto their landing. */

  /* Where each lineage lands on the bar: under the PORT it leaves by, not
     under the middle of the entry it leaves.
   *
     These are two different points whenever an entry carries more than one
     connector on that edge — the ports share the edge out evenly, and only
     the middle one of an odd fan is at the centre. Landing every lineage
     under the entry's centre therefore asked it to come down, step
     sideways by the difference, and turn: a small jog at the top of the
     line, on the very connectors that should be the tidiest on the chart.
   *
     The obvious fix — slide the port to meet the landing — is the wrong
     one, because the even share along an edge is itself information and
     must not be spent (see portSlack). The landing is ours to place and
     the port is not, so the landing moves. Both properties then hold at
     once: the fan leaves evenly spaced AND every lineage drops straight
     onto the bar. */
  const alongOf = (e)=>{
    const rec = ports.get(e);
    const p = rec && rec.p1;
    const src = nodes.get(e.from);
    let c;
    if(p) c = sideIsVertical(side) ? p.x : p.y;
    else if(src) c = sideIsVertical(side) ? src.x + src.w/2 : src.y + src.h/2;
    else return 0;
    const base = sideIsVertical(side) ? cx : cy;
    /* Straight under the lineage, and nothing else.
     *
     * There used to be a cap here holding every landing within a fixed
     * distance of the ENTRY, meant to stop the bar chasing an amalgam
     * dragged away from its lineages. It could not do that — the bar
     * spans its landings, and the landings are where the lineages are —
     * and it did something else instead: because the cap was measured
     * from the entry, sliding the entry ALONG its own bar moved every
     * landing that was near the limit, so the parents' connectors
     * shuffled sideways in step with an entry that has nothing to do with
     * where they come down. The bar's length is already bounded by the
     * ground the lineages cover, and how far the entry may be dragged from
     * them is not this arithmetic's business, and is no longer
     * anybody's: an entry goes where it is put. */
    return c - base;
  };
  const landings = members.map(alongOf);
  const wanted = landings.slice();
  // One forward pass gives every neighbour its minimum separation.
  for(let i = 1; i < n; i++){
    landings[i] = Math.max(landings[i], landings[i-1] + AMALGAM_PITCH);
  }
  /* Then the row is re-centred on where the lineages actually are.
   *
   * There used to be a backward pass here, said to "pull the row back
   * inside the span if the forward one pushed its tail past the end" — but
   * after the forward pass every neighbour is already at least a pitch
   * apart, so `min(landings[i], landings[i+1] - PITCH)` is always
   * `landings[i]` and the loop provably did nothing at all. Meanwhile the
   * thing it was supposed to prevent was real: spacing out a tight cluster
   * only ever pushes to the RIGHT, so five lineages five pixels apart grew
   * a bar reaching a hundred and twenty pixels past the last of them.
   *
   * Shifting the whole row by the difference between where it wanted to
   * sit and where it ended up spreads that growth evenly to both sides, so
   * the bar stays centred on its lineages however tightly they are
   * packed. */
  const mean = (list)=> list.reduce((a,b)=> a+b, 0) / (list.length || 1);
  const drift = mean(wanted) - mean(landings);
  if(drift) for(let i = 0; i < n; i++) landings[i] += drift;
  /* The junction, where the bar hands over to the merged arrow: the
     MIDDLE of the ground the lineages cover.
   *
     It used to want to be straight in front of the entry — offset 0,
     clamped into the span — which reads well and made the stem vertical,
     but it is one more thing about the merge that the entry decides. The
     junction is where the colours hand over, so it sets how much bar each
     lineage owns; sliding the entry sideways therefore lengthened one
     lineage's stretch and shortened another's, and a callout anchored on
     one of those stretches was carried along with it. Nothing about a
     merge should move because the entry it feeds was put somewhere else.
     The stem leans instead, which is what a connector does. */
  /* Two points, not one — which is what the last two rounds kept getting
     wrong by insisting they were the same thing.
   *
     The SEAM is where the lineages hand the bar over to one another and
     where the colours change: it belongs to the merge, so it is the middle
     of the ground the lineages cover and it does not move when the entry
     does. That is what keeps a callout anchored on a lineage's stretch of
     bar exactly where it was put.
   *
     The JUNCTION is where the merged arrow leaves the bar. That is the
     stem of the connector into the entry, and a connector's job is to
     reach the thing it feeds — so it stands in front of the entry,
     clamped to the bar it has to leave from, and travels along the bar as
     the entry is dragged. Nothing else on the merge depends on it. */
  const seam = (landings[0] + landings[n-1]) / 2;
  const junction = Math.max(landings[0], Math.min(landings[n-1], 0));
  /* Where the bar is, kept for the drag that wants to centre the entry on
     it — see alignGuides. In chart coordinates, along the bar's own axis. */
  amalgamBars.set(b.id, {
    axis: ux ? 'x' : 'y',
    lo: (ux ? cx : cy) + landings[0],
    hi: (ux ? cx : cy) + landings[n-1]
  });
  /* The bar is STRAIGHT. It was straight before two rounds of trying to
     give it a shape, and neither shape was ever the point: a bow away from
     the entry and a sag towards it are both a bend in a line that is meant
     to be the level the lineages arrive at. The lineages come down, they
     turn onto it, they run along it, and the merged arrow leaves from the
     middle. The only thing that has to be right is the TURN — see the
     corner guarantee below. */
  const barPt = (off)=> ({x: cx + ux*off, y: cy + uy*off});
  dimple = barPt(junction);
  /* Each lineage's stretch of the bar: from the midpoint with its previous
     neighbour to the midpoint with the next.

     The turn onto the bar is a rounded corner, and a rounded corner needs
     LEG to hold its radius on both sides of the bend. Both legs are
     guaranteed: the run-up is a stub of AMALGAM_APPROACH, and the run
     along the bar is half the gap to the nearest neighbour, which the
     spacing passes above keep at AMALGAM_PITCH or more however the entry
     is dragged. Neither can collapse, so the corner cannot square off. */
  /* Where each lineage's colour runs to.
   *
   * A colour travels along the bar from where its lineage lands TOWARDS
   * the junction, and it keeps the bar until the next lineage joins and
   * takes over. So a lineage owns the stretch between its own landing and
   * its neighbour's on the junction side — not the two half-stretches
   * either side of it, which is what this did first. The difference shows
   * wherever the lineages are unevenly spaced: the seams sat at the
   * midpoints, in open bar, instead of at the landings where one lineage
   * actually hands over to the next.
   *
   * The pair straddling the junction hand over AT the junction, since past
   * it a colour would be travelling away from the arrow it feeds. The
   * lineage sitting on the junction itself owns no bar at all — it lands
   * exactly where the merged arrow leaves. */
  const bounds = landings.map((o, i)=>{
    if(o < seam){
      const nxt = (i+1 < n) ? landings[i+1] : o;
      return {lo: o, hi: Math.min(nxt, seam)};
    }
    if(o > seam){
      const prv = (i > 0) ? landings[i-1] : o;
      return {lo: Math.max(prv, seam), hi: o};
    }
    return {lo: o, hi: o};
  });

  /* A note on a lineage of a merge is a note like any other.
   *
     There used to be a whole apparatus here for placing them: the fan's
     ground as a box to stay out of, every line of the construction
     collected so a card could be tested against all of them, a direction
     worked out per lineage from which end of the bar it sat on, and the
     notes drawn last so they could be judged against the finished shape.
     All of it existed to GUESS a good spot, and guessing is no longer what
     happens — a leader is aimed by hand, and keeps the angle and distance
     it was given (see noteAimOf). The apparatus had become an elaborate
     way of computing an answer nobody reads. */

  members.forEach((e, i)=>{
    const a = nodes.get(e.from);
    const recM = ports.get(e);
    if(!a || !recM || !recM.p1) return;
    const style = edgeStyleFor(e.from, e.to);
    const color = amalgamMemberColor(e);
    const dash = DASH_PATTERNS[style.dash];
    const o = landings[i];
    const {lo, hi} = bounds[i];

    /* Where this lineage meets the bar, and where its colour runs to.

       It comes STRAIGHT DOWN onto its own landing and turns once, inward
       along the bar — one 90° bend with a full radius on either side of
       it, exactly the corner every other connector on the chart turns.

       It used to arrive along the bar instead, from beyond its landing,
       which meant the router had to bring it to bar level a stub's length
       PAST the landing and walk it back: down, a jog outward, then a
       180° reversal into the bar. There is no radius that can round a
       reversal — which is why the turn onto the bar stayed a hard corner
       however the bar itself was shaped, and why it broke completely when
       dragging an entry left the jog nothing to happen in.

       The stretch of bar OUTSIDE the landing — the half it shares with
       its outer neighbour — is drawn as its own straight run in the same
       colour, collinear with the turn, so the colours still tile the bar
       end to end with nothing left uncovered and nothing overlapping. */
    /* Its whole stretch lies on the junction side of its landing, so the
       line comes down, turns once, and runs to the end of it. There is no
       second half on the far side to cover any more — the neighbour out
       there owns the bar right up to this landing. */
    const inward = (o < seam) ? hi : lo;
    const land = barPt(o);

    /* It leaves its entry by the side amalgamFromSide chose, at the slot
       the shared port assignment gave it — the same assignment every other
       connector on that side went through, which is what keeps a merged
       lineage and an ordinary connector leaving the same edge from lining
       up as one row instead of one taking the middle and the other being
       placed beside a neighbour it could not see. */
    const p1 = recM.p1 || portOnSide(a, amalgamFromSide(a, geo, style), 0, 1, style.fromRing || 0);
    /* And it comes down STRAIGHT onto its landing where it can.
     *
       A lineage's landing on the bar is set by the order the parents lie
       in, and the port it leaves by is set by the spacing along its own
       edge. The two agree to within a few pixels far more often than they
       agree exactly — and those few pixels became a step: down, four
       across, down again, right at the top of the line, which is the bend
       marked on the chart as unwanted. The port has a little room along
       its own side (see nudgePortAlong), so it is spent lining the lineage
       up with the landing it is going to; past that room the step stays,
       because then the landing really is somewhere else. */
    {
      const axis = sideIsVertical(p1.side) ? 'x' : 'y';
      nudgePortAlong(p1, land[axis] - p1[axis]);
      const rest = land[axis] - p1[axis];
      if(Math.abs(rest) > 0.01 && Math.abs(rest) <= PORT_SQUEEZE) movePortAlong(p1, rest);
    }
    // Approached head-on, from the side the lineages are on.
    const target = {x: land.x, y: land.y, side, ring: 0, stub: AMALGAM_APPROACH};
    const { pts } = pathFromPorts(p1, target, style, new Set([a.id, b.id]), recM.lane || 0);
    /* Only the two lineages at the ENDS of the bar round their turn onto
       it. For them the bar starts where they land, and a rounded corner is
       what any connector turning a corner does. For every lineage between
       them the bar runs straight THROUGH the landing — its own colour one
       way, its neighbour's the other — so the join is a T, and rounding a
       T bends the upright away from the crossbar as though the line went
       somewhere it does not. */
    const onEnd = (i === 0 || i === n-1);
    const bar = Math.abs(inward - o) > 0.5 ? barPt(inward) : null;
    const joined = (bar && onEnd) ? pts.concat([bar]) : pts;
    let d = style.sinusoid ? wavyPath(joined) : roundedPath(joined, EDGE_CORNER_R);
    if(bar && !onEnd) d += ` L${bar.x.toFixed(2)},${bar.y.toFixed(2)}`;
    /* What the reader sees, whichever way the corner was drawn. `joined`
       carries the bar leg only for the two end lineages, so anchoring a
       note on it put a note on a MIDDLE lineage back on the short routed
       line — the very bug the anchor was changed to fix, still there for
       every lineage that was not at one end of the bar. */
    const notePts = bar ? pts.concat([bar]) : pts;
    const attrs = {class:'edge struct amalgam-member', d, stroke: color,
                   'data-from':e.from, 'data-to':e.to};
    if(dash) attrs['stroke-dasharray'] = dash;
    edgePath(attrs, style, edgeLayer);
    drawRingCap(pts[0], color, dash, e.from, e.to, isDoubleDash(style));
    /* The note is anchored on the line the reader actually sees, bar leg
       and all. It used to be anchored on the routed part alone, so a point
       picked halfway along a merged lineage landed halfway along a shorter
       line — the note appeared somewhere the reader had not pointed at. */
    if(style.note) drawEdgeNote(style.note, notePts, style.notePos, e.from, e.to,
                                style.noteAt, color, style.noteBg);
    drawCalloutLeaders(e.from, e.to, notePts, color);
    edgeHit(d, e.from, e.to);
  });

  /* And the one arrow out of the middle of the bar into the entry, carrying
     every contributing colour.

     It is deliberately left with no source entry of its own. This stretch
     belongs to the merge, not to any single lineage: filtering away one
     parent should take that parent's line and its stretch of the bar and
     nothing else, leaving the merged arrow to carry whatever is still
     there. Naming a source here — it used to name the first member — meant
     hiding one tag could delete the arrow the whole amalgam hangs from. */
  const colors = allMembers.map(amalgamMemberColor);
  // It leaves from a point ON the bar, so the bar and the arrow are one
  // continuous shape rather than a line crossing another line.
  const outPts = [dimple, {x:port.x, y:port.y}];
  const paint = makeEdgeGradient(colors, outPts);
  const tip = arrowTrimmed(dimple, {x:port.x, y:port.y});
  el('path', {class:'edge struct amalgam-out',
              d:`M${dimple.x.toFixed(2)},${dimple.y.toFixed(2)} L${tip.x.toFixed(2)},${tip.y.toFixed(2)}`,
              stroke:paint, 'data-from':'', 'data-to':b.id}, edgeLayer);
  drawRingCap(port, paint, null, '', b.id);
  drawAmalgamArrow(port, dimple.x, dimple.y, ring, paint, b.id);

  /* The bead over the junction.
   *
   * Where the members' curves, the bar and the merged arrow all meet, three
   * strokes of three different colours end at very nearly the same point.
   * However carefully the tangents are matched, the meeting shows: a nick
   * where two curves part by a fraction of a pixel, a corner of one colour
   * poking past another. Rather than keep chasing the geometry, the joint
   * is covered by something that belongs there — a bead carrying every
   * lineage's colour, which is exactly what the junction MEANS.
   *
   * Its gradient runs across the bead along the bar, not along the arrow,
   * so all the colours appear in it. Painted last, so it covers whatever
   * it is hiding, and given the merged arrow's own from/to so the tag
   * filter treats it as part of the merge. */
  /* A bead at every joint, not only at the middle.
   *
   * Where two lineages' stretches of the bar meet, one colour ends and the
   * next begins — a hard seam in the middle of what reads as one line. The
   * junction has always been covered by a bead carrying every colour;
   * these do the same job at the same scale for the two colours that
   * actually meet there, so the bar reads as a chain of lineages joined at
   * marked points rather than a line that changes colour for no reason.
   * Drawn before the junction's own bead, which stays the one carrying the
   * whole gradient and sits on top wherever the two coincide. */
  /* Every joint except one the junction bead is already standing on.
   *
   * The junction moves along the bar with the entry, so sooner or later it
   * passes a joint — and two beads a few pixels apart, one of them carrying
   * every colour and the other two of them, read as one dot that has been
   * drawn twice. That is the doubled mark on the merged connector. The
   * junction's bead is the larger of the two and carries the whole
   * gradient, so where they land together it is the one that stays. */
  for(let i = 0; i < n - 1; i++){
    const jAt = bounds[i].hi;                       // == bounds[i+1].lo
    if(Math.abs(jAt - junction) < AMALGAM_BEAD_CLEAR) continue;
    const jp = barPt(jAt);
    const r = AMALGAM_JOINT_R;
    const pair = [amalgamMemberColor(members[i]), amalgamMemberColor(members[i+1])];
    /* A seam is marked whether or not the colour changes across it.
     *
       0.9.17 skipped the ones where the two lineages meeting are the same
       colour, on the reasoning that a bead there marks nothing. It marks
       the JOIN — which lineage hands the bar over to which — and on a
       chart whose entries mostly share the default ink that reasoning took
       every bead off every bar and left the construction unreadable. The
       doubled dot was never this; it was the seam the junction bead is
       already standing on, and the clearance above is what deals with it. */
    const jointPaint = makeEdgeGradient(pair, [
      {x: jp.x - ux*r, y: jp.y - uy*r},
      {x: jp.x + ux*r, y: jp.y + uy*r}
    ]);
    el('circle', {class:'amalgam-bead amalgam-joint', cx:jp.x.toFixed(2), cy:jp.y.toFixed(2),
                  r, fill:jointPaint, 'data-from':'', 'data-to':b.id}, edgeLayer);
  }

  const beadR = AMALGAM_BEAD_R;
  const beadPaint = makeEdgeGradient(colors, [
    {x: dimple.x - ux*beadR, y: dimple.y - uy*beadR},
    {x: dimple.x + ux*beadR, y: dimple.y + uy*beadR}
  ]);
  el('circle', {class:'amalgam-bead amalgam-junction', cx:dimple.x.toFixed(2), cy:dimple.y.toFixed(2),
                r:beadR, fill:beadPaint, 'data-from':'', 'data-to':b.id}, edgeLayer);

}
/* A merge whose every lineage is routed straight: no bar, one meeting
   point. See the note in drawAmalgam that sends us here. */
function drawStraightAmalgam(members, ports, b, port, ring, meet, ux, uy, nrm, side){
  const colors = members.map(amalgamMemberColor);
  members.forEach(e=>{
    const a = nodes.get(e.from);
    const recM = ports.get(e);
    if(!a || !recM || !recM.p1) return;
    const style = edgeStyleFor(e.from, e.to);
    const color = amalgamMemberColor(e);
    const dash = DASH_PATTERNS[style.dash];
    /* It leaves its entry by the side that faces the meeting point — the
       same rule the barred form uses, for the same reason: chosen from the
       two entries' positions alone, a lineage feeding a merge can leave by
       the side pointing away from it and have to run back around its own
       box. A side set by hand on the connector still wins. */
    const p1 = recM.p1;
    /* Stopped at the bead rather than at its centre, so the colours meet
       under it instead of piling up in a point that then shows through. */
    const pts = [p1, edgeShortened(p1, meet, AMALGAM_BEAD_R * 0.7)];
    const d = style.sinusoid ? wavyPath(pts)
            : `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)} L${pts[1].x.toFixed(2)},${pts[1].y.toFixed(2)}`;
    const attrs = {class:'edge struct amalgam-member', d, stroke: color,
                   'data-from':e.from, 'data-to':e.to};
    if(dash) attrs['stroke-dasharray'] = dash;
    edgePath(attrs, style, edgeLayer);
    drawRingCap(p1, color, dash, e.from, e.to, isDoubleDash(style));
    if(style.note) drawEdgeNote(style.note, pts, style.notePos, e.from, e.to,
                                style.noteAt, color, style.noteBg);
    drawCalloutLeaders(e.from, e.to, pts, color);
    edgeHit(d, e.from, e.to);
  });

  // And the one arrow out of the meeting point, carrying every colour.
  const outPts = [meet, {x:port.x, y:port.y}];
  const paint = makeEdgeGradient(colors, outPts);
  const tip = arrowTrimmed(meet, {x:port.x, y:port.y});
  el('path', {class:'edge struct amalgam-out',
              d:`M${meet.x.toFixed(2)},${meet.y.toFixed(2)} L${tip.x.toFixed(2)},${tip.y.toFixed(2)}`,
              stroke:paint, 'data-from':'', 'data-to':b.id}, edgeLayer);
  drawRingCap(port, paint, null, '', b.id);
  drawAmalgamArrow(port, meet.x, meet.y, ring, paint, b.id);

  /* The bead. There is only ever one here — with no bar there are no
     stretches of it for lineages to hand over along, so the junction is
     the single place every colour meets. Its gradient runs ACROSS the
     merged arrow, so all of them appear in it. */
  const beadR = AMALGAM_BEAD_R;
  const beadPaint = makeEdgeGradient(colors, [
    {x: meet.x - ux*beadR, y: meet.y - uy*beadR},
    {x: meet.x + ux*beadR, y: meet.y + uy*beadR}
  ]);
  el('circle', {class:'amalgam-bead amalgam-junction', cx:meet.x.toFixed(2), cy:meet.y.toFixed(2),
                r:beadR, fill:beadPaint, 'data-from':'', 'data-to':b.id}, edgeLayer);
}
/* A point `back` short of `to`, along the line from `from`. */
function edgeShortened(from, to, back){
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if(len <= back) return {x: to.x, y: to.y};
  return {x: to.x - dx/len*back, y: to.y - dy/len*back};
}

redrawEdges();

/* ---------------------------------------------------------------------
   Legend — tag-based filtering. Every user-assigned tag (opts.tags) gets
   a row; nodes with no tags at all fall into an implicit "Untagged"
   bucket so they're still filterable. A node is visible as long as at
   least one of its effective tags (its own tags, or the Untagged
   pseudo-tag if it has none) isn't hidden.
   ------------------------------------------------------------------ */
const UNTAGGED = '__untagged__';
function effectiveTags(n){
  return (n.tags && n.tags.length) ? n.tags : [UNTAGGED];
}
const tagCounts = new Map(); // tag -> count
// Which tags the user has switched off. Survives a rebuild — a filter is a
// view preference, not part of the data, so adding a node shouldn't quietly
// un-hide everything.
const hiddenTags = new Set();
let allTags = [];
const legendList = document.getElementById('legendList');

/* ---- tags and their categories -------------------------------------
 *
 * Two things had to change here. A tag used to exist only because some
 * entry carried it: the list was derived from the chart every rebuild, so
 * there was no way to make a tag before the entry that would wear it, and
 * no place to record how tags relate to each other.
 *
 * TAG_CATS is that place. A category names a set of tags, and a tag it
 * names counts as existing whether or not any entry carries it yet — which
 * is what lets you set up a vocabulary first and apply it afterwards. A tag
 * belongs to at most one category; the rest gather under "Ungrouped".
 *
 * Categories are chart data, not a view setting, so they live in their own
 * @@EDIT@@ region and travel with an export. What stays a view setting is
 * which tags are hidden — that is still `hiddenTags`, still per-browser,
 * and still nothing to do with this. */
const UNGROUPED = '__ungrouped__';
function sanitizeTagCats(list){
  /* Imported data decides the shape of the tag panel, so it is normalized
     once here rather than guarded at each of the places that read it: a
     category needs a name, its tags must be strings, and a tag may not sit
     in two categories at once (the first claim wins, so the result can
     never render one tag twice). */
  /* The one entry allowed to bear the reserved name is the loose bin —
     see looseBin below. It is not a category and is never shown as one,
     but it is a real entry of this list because it is the only thing that
     persists a tag no entry carries and no category claims. */
  const seenCat = new Set(), claimed = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(c=>{
    if(!c || typeof c !== 'object') return;
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if(!name || seenCat.has(name)) return;
    seenCat.add(name);
    const tags = [];
    (Array.isArray(c.tags) ? c.tags : []).forEach(t=>{
      if(typeof t !== 'string') return;
      const tag = t.trim();
      if(!tag || tag === UNTAGGED || claimed.has(tag)) return;
      claimed.add(tag); tags.push(tag);
    });
    out.push({name, tags});
  });
  return out;
}
/* The loose bin, and the real categories.
 *
 * A tag that belongs to no category still has to be kept somewhere, or it
 * would not survive the next rebuild: TAG_CATS is the only thing that
 * remembers a tag nobody carries. So the uncategorised ones are kept in an
 * entry of TAG_CATS under the reserved name, and everything that asks
 * "what categories are there" asks realCategories instead. The bin is
 * never listed, renamed, removed or offered as a place to file into. */
function looseBin(make){
  let bin = TAG_CATS.find(c=> c.name === UNGROUPED);
  if(!bin && make){ bin = {name: UNGROUPED, tags: []}; TAG_CATS.push(bin); }
  return bin;
}
function realCategories(){ return TAG_CATS.filter(c=> c.name !== UNGROUPED); }
function categoryOf(tag){
  for(const c of realCategories()) if(c.tags.indexOf(tag) >= 0) return c.name;
  return UNGROUPED;
}
// Every tag that exists: the ones entries carry, plus the ones a category
// declares but nothing wears yet.
function knownTags(){
  const set = new Set(tagCounts.keys());
  set.delete(UNTAGGED);
  TAG_CATS.forEach(c=> c.tags.forEach(t=> set.add(t)));
  return Array.from(set).sort((a,b)=> a.localeCompare(b));
}
function tagExists(tag){ return tagCounts.has(tag) || TAG_CATS.some(c=> c.tags.indexOf(tag) >= 0); }
// Puts a tag in a category, taking it out of whichever one held it before.
// '' or UNGROUPED means "no category".
function assignTagCategory(tag, catName){
  TAG_CATS.forEach(c=>{ const i = c.tags.indexOf(tag); if(i >= 0) c.tags.splice(i, 1); });
  if(!catName || catName === UNGROUPED){ looseBin(true).tags.push(tag); return; }
  const cat = TAG_CATS.find(c=> c.name === catName);
  if(cat) cat.tags.push(tag);
  else looseBin(true).tags.push(tag);
}
/* There is no longer a mode. "Organize" existed to fold the editing
   controls away and leave a panel that only filtered — but every row now
   carries its own eye and its own cross, so the panel is an editor either
   way and a switch that revealed two more controls was one more thing to
   find. What it used to hide is simply always there. */

/* ---- references -----------------------------------------------------
 *
 * A reference is {key, title, detail, url}. The key is what a text stores;
 * the number the reader sees is the position in this list, computed at
 * draw time by refIndex(). Nothing anywhere stores a number, which is what
 * makes reordering safe.
 *
 * The panel sits beside the tag panel and shares its shape deliberately:
 * both are lists of things the chart refers to, and both are opened from
 * the same corner of the toolbar. */
function sanitizeRefs(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(r=>{
    if(!r || typeof r !== 'object') return;
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    if(!key || !/^[A-Za-z0-9_-]+$/.test(key) || seen.has(key)) return;
    seen.add(key);
    out.push({
      key,
      title: typeof r.title === 'string' ? r.title : '',
      detail: typeof r.detail === 'string' ? r.detail : '',
      // Run through the same gate as an entry's link: a reference is a
      // place a reader is invited to click, so it may only navigate.
      url: (typeof r.url === 'string' && safeUrl(r.url)) ? r.url : ''
    });
  });
  return out;
}
function uniqueRefKey(base){
  let k = String(base || 'ref').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'ref';
  if(refIndex(k) < 0) return k;
  let i = 2;
  while(refIndex(k + '-' + i) >= 0) i++;
  return k + '-' + i;
}
// Every text on the chart that could carry a citation, so a reference can
// report how many places use it — and warn before deleting a used one.
function refUsageCount(key){
  const token = '{{r:' + key + '}}';
  let n = 0;
  const scan = t=>{ if(typeof t === 'string' && t.indexOf(token) >= 0) n++; };
  workingNodes.forEach(t=>{
    scan(t[1]); scan(t[4]);
    const opts = t[6];
    if(opts && Array.isArray(opts.langTabs)) opts.langTabs.forEach(x=> scan(x && x.text));
  });
  EDGE_STYLES.forEach(e=> scan(e && e.note));
  COMMENTS.forEach(c=> scan(c && c.text));
  REFS.forEach(r=>{ scan(r.detail); });
  return n;
}
function stripRefToken(text, key){
  return typeof text === 'string' ? text.split('{{r:' + key + '}}').join('') : text;
}

/* One panel, two lists. Rebuilt together because they share a container
   and because a change to either can affect what the other shows — a tag
   deleted here, a reference renumbered there. */
/* A section heading, and the controls that belong to that section.
   Both lists used to be worked from one row of buttons at the top of the
   panel, which meant a single + that had to ask which of three things you
   meant and one eye that could only ever mean "tags". Each heading now
   carries what acts on the list under it, so the button says what it does
   by where it is. */
function sectionHead(title, count){
  const head = document.createElement('div');
  head.className = 'legend-group-head legend-section-head';
  head.innerHTML = `<span class="legend-group-name">${escapeHtml(title)}</span>` +
                   `<span class="legend-group-count">${count}</span>`;
  return head;
}
function makePlusButton(title){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'icon-action plus-mini'; b.title = title;
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  return b;
}
// The two-item menu the Tags + opens, parked under whichever heading asked
// for it. One element, moved, rather than one per rebuild.
function openTagAddMenu(afterEl){
  const menu = document.getElementById('legendAddMenu');
  if(!menu) return;
  if(!menu.hidden && menu.previousSibling === afterEl){ menu.hidden = true; return; }
  afterEl.parentNode.insertBefore(menu, afterEl.nextSibling);
  menu.hidden = false;
}
function buildManagement(){
  buildLegend();
  const head = sectionHead('References', REFS.length);
  /* Set apart from the tags above it. Two lists in one panel, with only
     the usual heading rule between them, read as one list with a subtitle
     in the middle of it. */
  head.classList.add('legend-section-split');
  if(!readOnlyView){
    const add = makePlusButton('Add a reference');
    add.addEventListener('click', ev=>{ ev.stopPropagation(); addRef(); });
    head.appendChild(add);
  }
  legendList.appendChild(head);
  /* The citation colour is a setting OF the references, so it sits with
     them — and above the list rather than below it, where a long list of
     references would otherwise push it out of sight. */
  const colorRow = document.getElementById('refColorRow');
  if(colorRow && !readOnlyView){ colorRow.hidden = false; legendList.appendChild(colorRow); }
  else if(colorRow) colorRow.hidden = true;
  buildRefsInto(legendList);
  syncLegendEye();
}
function buildLegend(){
  tagCounts.clear();
  nodes.forEach(n=>{
    effectiveTags(n).forEach(t=> tagCounts.set(t, (tagCounts.get(t)||0)+1));
  });
  allTags = knownTags();
  if(tagCounts.has(UNTAGGED)) allTags.push(UNTAGGED);
  /* A tag can now outlive the last entry carrying it, so long as a category
     still declares it — dropping it from hiddenTags on that basis would
     silently un-hide it. Only a tag that has stopped existing altogether is
     forgotten. */
  Array.from(hiddenTags).forEach(t=>{
    if(t !== UNTAGGED && !tagExists(t)) hiddenTags.delete(t);
    if(t === UNTAGGED && !tagCounts.has(UNTAGGED)) hiddenTags.delete(t);
  });

  // Group the tags for display: declared categories in their own order,
  // then whatever is left.
  /* The last bucket is SPECIAL, and it is not merely "whatever is left".
     The tags that DO something — the ones that put a weave under an entry
     or an echo around it — belong together and belong nowhere else: filing
     one under "Eras" would say it is a kind of era, which it is not. They
     are collected here whatever else claims them, along with the Untagged
     bucket and any tag nobody has filed yet. */
  const reserved = new Set(allTags.filter(t=> t === UNTAGGED || tagIsSpecial(t)));
  const groups = realCategories().map(c=> ({
    name: c.name,
    tags: c.tags.filter(t=> allTags.indexOf(t) >= 0 && !reserved.has(t))
                .sort((a,b)=> a.localeCompare(b))
  }));
  const grouped = new Set();
  groups.forEach(g=> g.tags.forEach(t=> grouped.add(t)));
  /* Two different kinds of "not in a category", which used to share one
     bucket at the foot of the panel. SPECIAL is a real group — the tags
     that DO something, collected together whatever else claims them, and
     the Untagged bin. UNCATEGORISED is not a group at all: it is where a
     tag sits before anybody has decided where it goes, which is where
     every tag starts and where a tag dragged out of a category lands. It
     belongs at the TOP, under the search box, because it is a staging area
     and not an archive. */
  const uncategorised = allTags.filter(t=> !grouped.has(t) && !reserved.has(t));
  const special = allTags.filter(t=> reserved.has(t));
  if(special.length) groups.push({name: UNGROUPED, tags: special});

  /* The add menu and the citation-colour row are moved INTO this list on
     every build, so they have to be rescued before it is emptied or they
     would be destroyed along with it. */
  const parked = document.getElementById('legend');
  ['legendAddMenu', 'refColorRow'].forEach(id=>{
    const elm = document.getElementById(id);
    if(elm && parked) parked.appendChild(elm);
  });
  const addMenu = document.getElementById('legendAddMenu');
  if(addMenu) addMenu.hidden = true;
  legendList.innerHTML = '';
  const tagHead = sectionHead('Tags', allTags.length);
  const globalEye = makeEyeButton(everythingHidden(),
    everythingHidden() ? 'Show every tag' : 'Hide every tag');
  globalEye.id = 'legendEye';
  globalEye.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(everythingHidden()) hiddenTags.clear();
    else allTags.forEach(t=> hiddenTags.add(t));
    applyVisibility(); buildManagement();
  });
  tagHead.insertBefore(globalEye, tagHead.firstChild);
  if(!readOnlyView){
    const add = makePlusButton('Add a tag or a category');
    add.addEventListener('click', ev=>{ ev.stopPropagation(); openTagAddMenu(tagHead); });
    tagHead.appendChild(add);
  }
  legendList.appendChild(tagHead);
  legendList.appendChild(buildTagFilterRow());
  legendList.appendChild(buildLooseBlock(uncategorised.filter(tagMatchesFilter)));
  const shown = groups.map(g=> ({name:g.name, tags:g.tags.filter(tagMatchesFilter)}));
  let any = false;
  shown.forEach(group=>{
    if(!group.tags.length && group.name === UNGROUPED && TAG_CATS.length) return;
    /* While a search is running, a category with nothing matching in it is
       not an empty category — it is one the reader is not looking at. */
    if(tagFilterText && !group.tags.length) return;
    any = true;
    legendList.appendChild(buildCategoryBlock(group));
  });
  if(pendingNewCat) legendList.appendChild(buildNewCategoryBlock());
  if(tagFilterText && !any && !uncategorised.length){
    const none = document.createElement('div');
    none.className = 'legend-empty';
    none.textContent = `No tag matches \u201c${tagFilterText}\u201d.`;
    legendList.appendChild(none);
  }
}

/* ---- where a tag lives before it is filed ---------------------------
 *
 * A headless block, directly under the search box, holding every tag no
 * category claims — and the place a brand-new tag is made and named. It is
 * also a drop target, which is the gesture for taking a tag back OUT of a
 * category: there was none before, and a filing decision you cannot undo
 * by hand is not a filing decision. */
function buildLooseBlock(tags){
  const wrap = document.createElement('div');
  wrap.id = 'legendLoose';
  wrap.className = 'legend-group legend-loose' + (readOnlyView ? '' : ' drop-zone');
  wrap.dataset.cat = UNGROUPED;
  tags.forEach(tag=> wrap.appendChild(buildTagRow(tag, UNGROUPED)));
  if(pendingNewTag) wrap.appendChild(buildNewTagRow());
  else if(!tags.length){
    const hint = document.createElement('div');
    hint.className = 'legend-loose-hint';
    hint.textContent = readOnlyView
      ? 'Every tag is filed under a category.'
      : 'Tags with no category appear here. Drag one out of a category to bring it back.';
    wrap.appendChild(hint);
  }
  return wrap;
}
/* Naming a thing where it stands: the same gesture the category headings
   already use, shared so the two cannot drift apart. */
function focusNaming(box){
  if(!box) return;
  box.focus({preventScroll:true});
  try{
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(box);
    sel.removeAllRanges(); sel.addRange(r);
  }catch(e){}
}
/* Making a tag where it will live.
 *
 * A tag used to be made in a dialog — a window, a field, an OK button —
 * and then appeared somewhere else on the panel, under whichever category
 * happened to be first. It is written into an empty tag shape in the
 * uncategorised block instead, exactly as a category is renamed on its own
 * heading, and carried into a category afterwards if it wants one. Nothing
 * typed, Escape, or a click anywhere else, and no tag was ever made. */
let pendingNewTag = false, pendingNewCat = false;
function startNewTagEntry(){
  if(readOnlyView) return;
  pendingNewCat = false;
  pendingNewTag = true;
  buildManagement();
  focusNaming(document.querySelector('#legendLoose .tag-naming-text'));
}
function startNewCategoryEntry(){
  if(readOnlyView) return;
  pendingNewTag = false;
  pendingNewCat = true;
  buildManagement();
  focusNaming(document.querySelector('.legend-group-new .legend-group-name'));
}
function buildNewTagRow(){
  const row = document.createElement('div');
  row.className = 'legend-item legend-item-new';
  row.innerHTML =
    `<div class="swatch" style="background:var(--accent)"></div>` +
    `<div class="name"><span class="tag-shape"><i class="tag-eye"></i>` +
    `<span class="tag-naming-text" contenteditable="plaintext-only" spellcheck="false"></span>` +
    `</span></div><div class="count">0</div>`;
  row.insertBefore(makeEyeButton(false, 'A new tag'), row.firstChild);
  const box = row.querySelector('.tag-naming-text');
  let done = false;
  const finish = (keep)=>{
    if(done) return;
    done = true;
    const typed = (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    pendingNewTag = false;
    if(keep && typed) createTag(typed);
    else buildManagement();
  };
  box.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  });
  // Anywhere else is "never mind", which is what a half-typed name means.
  box.addEventListener('blur', ()=> finish(false));
  box.addEventListener('click', ev=> ev.stopPropagation());
  box.addEventListener('mousedown', ev=> ev.stopPropagation());
  return row;
}
function buildNewCategoryBlock(){
  const wrap = document.createElement('div');
  wrap.className = 'legend-group legend-group-new';
  const head = document.createElement('div');
  head.className = 'legend-group-head';
  head.innerHTML =
    `<span class="legend-group-name renaming" contenteditable="plaintext-only" spellcheck="false"></span>` +
    `<span class="legend-group-fold">\u2304</span><span class="legend-group-count">0</span>`;
  head.insertBefore(makeEyeButton(false, 'A new category'), head.firstChild);
  const box = head.querySelector('.legend-group-name');
  let done = false;
  const finish = (keep)=>{
    if(done) return;
    done = true;
    const typed = (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    pendingNewCat = false;
    if(keep && typed) createCategory(typed);
    else buildManagement();
  };
  box.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  });
  box.addEventListener('blur', ()=> finish(false));
  box.addEventListener('click', ev=> ev.stopPropagation());
  box.addEventListener('mousedown', ev=> ev.stopPropagation());
  wrap.appendChild(head);
  return wrap;
}
/* The search. A chart of any age has more tags than fit on the panel, and
   scrolling a list to find a name you already know is the one thing a list
   is worst at. Typing narrows it; clearing it puts everything back, folded
   categories and all — and while anything is typed the categories are held
   open, since a match hidden inside a folded category is a search that
   answers "nothing found" while holding the answer. */
function buildTagFilterRow(){
  const row = document.createElement('div');
  row.className = 'legend-filter';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'legendFilter';
  input.placeholder = 'Find a tag\u2026';
  input.spellcheck = false;
  input.value = tagFilterText;
  input.addEventListener('input', ()=>{
    tagFilterText = input.value.trim().toLowerCase();
    buildManagement();
    const again = document.getElementById('legendFilter');
    if(again){ again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
  });
  input.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key === 'Escape'){ input.value = ''; tagFilterText = ''; buildManagement(); }
  });
  input.addEventListener('click', ev=> ev.stopPropagation());
  row.appendChild(input);
  return row;
}

/* The eye, at every scale. One shape for "this is showing / this is
   hidden" — the whole panel's eye, a category's, a single tag's — so the
   control reads the same wherever it appears instead of the top button
   being an eye and the rows being dots. */
const EYE_OPEN_SVG = '<svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const EYE_SHUT_SVG = '<svg class="eye-shut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.8-6.5 10-6.5c2 0 3.7.7 5.1 1.5M22 12s-3.8 6.5-10 6.5c-2 0-3.7-.7-5.1-1.5"/><circle cx="12" cy="12" r="2.8"/><line x1="3.5" y1="20.5" x2="20.5" y2="3.5"/></svg>';
function makeEyeButton(shut, title){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-action eye-mini' + (shut ? ' shut' : '');
  b.title = title;
  b.innerHTML = EYE_OPEN_SVG + EYE_SHUT_SVG;
  return b;
}

/* Which categories are folded shut, and what the reader is looking for.
 *
 * Both belong to the session rather than to the chart: they are how
 * somebody is reading the list right now, not something about the list. A
 * chart opened tomorrow shows every category, which is the right default
 * for a panel whose job is to say what tags exist. */
const collapsedCats = new Set();
let tagFilterText = '';
function tagMatchesFilter(tag){
  if(!tagFilterText) return true;
  const name = tag === UNTAGGED ? 'untagged' : tag;
  return name.toLowerCase().indexOf(tagFilterText) >= 0;
}
let headDblTimer = 0;
function buildCategoryBlock(group){
  const isLoose = group.name === UNGROUPED;
  const wrap = document.createElement('div');
  // Ungrouped is where a tag with no category shows up, not a category to
  // file one into — so it is marked, and never accepts a drop.
  wrap.className = 'legend-group' + (isLoose || readOnlyView ? '' : ' drop-zone');
  wrap.dataset.cat = group.name;

  const head = document.createElement('div');
  head.className = 'legend-group-head';
  /* What the eye acts on is every tag the category DECLARES, not only the
     ones some entry happens to carry. A category whose tags are all unused
     shows as empty, and judging the eye by what is on the panel left it
     pointing at nothing: it drew as open, and clicking it did nothing at
     all. A category is a filing decision, and it keeps that decision
     whether or not anything is filed under it today. */
  const owned = isLoose ? group.tags
    : (TAG_CATS.find(c=> c.name === group.name) || {tags: group.tags}).tags;
  const allOff = owned.length > 0 && owned.every(t=> hiddenTags.has(t));
  if(isLoose) head.classList.add('legend-group-special');
  /* Folded shut, a category is one line instead of twenty. A chart can
     carry more tags than a panel has room for, and the reader is almost
     always working inside one of them at a time. The chevron says which
     way it will go; the whole heading is the target, because a heading is
     what anybody would click. */
  const shut = collapsedCats.has(group.name) && !tagFilterText;
  wrap.classList.toggle('collapsed', shut);
  head.innerHTML =
    `<span class="legend-group-name">${escapeHtml(isLoose ? 'Special' : group.name)}</span>` +
    `<span class="legend-group-fold">${shut ? '\u2039' : '\u2304'}</span>` +
    `<span class="legend-group-count">${group.tags.length}</span>`;
  head.classList.add('foldable');
  head.title = (shut ? 'Show this category' : 'Fold this category away') +
               (isLoose || readOnlyView ? '' : ' — double-click the name to rename it');
  head.addEventListener('click', ev=>{
    if(ev.target.closest('button')) return;
    if(headDblTimer){ clearTimeout(headDblTimer); headDblTimer = 0; return; }
    /* A moment's wait, because the second click of a double means
       "rename", and folding the category away underneath the cursor
       first is the wrong answer to it. */
    headDblTimer = setTimeout(()=>{
      headDblTimer = 0;
      if(collapsedCats.has(group.name)) collapsedCats.delete(group.name);
      else collapsedCats.add(group.name);
      buildManagement();
    }, DOUBLE_CLICK_GRACE);
  });
  /* Renaming is a double click on the name, like every other name on this
     page. It used to have a pencil of its own in the heading, next to the
     ✕ that removes the category — two buttons a few pixels apart, one of
     which edits and one of which deletes. */
  if(!isLoose && !readOnlyView){
    head.addEventListener('dblclick', ev=>{
      if(ev.target.closest('button')) return;
      ev.preventDefault(); ev.stopPropagation();
      if(headDblTimer){ clearTimeout(headDblTimer); headDblTimer = 0; }
      startCategoryRename(head, group.name);
    });
  }
  const groupEye = makeEyeButton(!!allOff, owned.length
    ? (allOff ? 'Show' : 'Hide') + ' this whole category'
    : 'This category is empty — drag a tag onto it');
  // Nothing to show or hide: the eye stays, so the heading still reads
  // like every other heading, but it cannot be pressed.
  if(!owned.length) groupEye.disabled = true;
  groupEye.addEventListener('click', ev=>{
    ev.stopPropagation();
    // One gesture for the group: if any of it is showing, hide it all;
    // otherwise bring it all back.
    if(allOff) owned.forEach(t=> hiddenTags.delete(t));
    else owned.forEach(t=> hiddenTags.add(t));
    applyVisibility(); buildManagement();
  });
  head.insertBefore(groupEye, head.firstChild);
  if(!isLoose && !readOnlyView){
    const tools = document.createElement('span');
    tools.className = 'legend-group-tools';
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕'; del.title = 'Remove this category (its tags stay)';
    del.addEventListener('click', ev=>{ ev.stopPropagation(); removeCategory(group.name); });
    tools.appendChild(del);
    head.appendChild(tools);
  }
  wrap.appendChild(head);

  if(!shut) group.tags.forEach(tag=> wrap.appendChild(buildTagRow(tag, group.name)));
  return wrap;
}

function buildTagRow(tag, catName){
  const row = document.createElement('div');
  row.className = 'legend-item' + (hiddenTags.has(tag) ? ' off' : '');
  row.dataset.tag = tag;
  const count = tagCounts.get(tag) || 0;
  const displayName = tag === UNTAGGED ? 'Untagged' : tag;
  const hidden = hiddenTags.has(tag);
  /* A star on the ones that act. It is a mark on the NAME, not a column of
     its own, so the rows still line up and a chart with no special tags in
     it looks exactly as it did. */
  row.innerHTML =
    `<div class="swatch" style="background:var(--accent)"></div>` +
    `<div class="name">${tagShapeHtml(displayName, {special: tagIsSpecial(tag),
                                                    reserved: tag === UNTAGGED,
                                                    why: SPECIAL_TAGS[tag]})}</div>` +
    `<div class="count">${count}</div>`;
  /* Showing and hiding is the eye, here as everywhere else. It used to be
     the whole row, which meant the row could not also carry a delete
     button without every attempt to remove a tag hiding it first. */
  const eye = makeEyeButton(hidden, (hidden ? 'Show' : 'Hide') + ' this tag');
  eye.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(hiddenTags.has(tag)) hiddenTags.delete(tag);
    else hiddenTags.add(tag);
    applyVisibility();
    // The category's own eye reflects its tags, so it has to be repainted.
    buildManagement();
  });
  row.insertBefore(eye, row.firstChild);
  /* The Untagged bucket is not a tag anyone wrote — it is where entries
     with no tags at all show up — so it cannot be filed or deleted. */
  if(tag !== UNTAGGED){
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'legend-tag-del';
    del.textContent = '\u2715';
    del.title = count ? `Remove this tag from all ${count} entries carrying it` : 'Delete this unused tag';
    del.addEventListener('click', ev=>{ ev.stopPropagation(); deleteTagEverywhere(tag, count); });
    row.appendChild(del);
  }
  if(tag !== UNTAGGED && !readOnlyView){
    /* Filing a tag is carrying it: pick the row up and drop it on the
       category it belongs to. The dropdown that used to sit here said the
       same thing in the abstract — a list of names, none of which was the
       category you were looking at — and every tag on the panel carried a
       copy of the whole list. */
    row.classList.add('draggable-row');
    row.title = 'Drag onto a category to file this tag there';
    row.addEventListener('mousedown', ev=> beginListDrag(ev, 'tag', tag, displayName));
  }
  return row;
}

/* ---- dragging a row out of one list and into another ----------------
 *
 * Two lists in the Management panel are arrangements rather than
 * collections: which category a tag belongs to, and what order the
 * references are in. Both were operated by proxy — a dropdown beside the
 * tag, a pair of arrows beside the reference — and in both cases the thing
 * being changed is a POSITION, which a control that is not the row itself
 * can only describe. So the row is the control: pick it up and put it
 * where it goes.
 *
 * Pointer events rather than the HTML drag-and-drop API. This page is
 * rendered inside a sandboxed frame, and the drag API's behaviour there
 * depends on the host: the drag image, the cursor and whether a drop fires
 * at all vary in ways the rest of the chart's dragging — nodes, connector
 * ends, leader points — does not. One mechanism for every drag on the
 * page is worth more than the API's free drag image.
 */
let listDrag = null;
const LIST_DRAG_THRESHOLD = 4;

function beginListDrag(ev, kind, key, label){
  if(ev.button !== 0 || readOnlyView) return;
  /* Not on a control. A row carries an eye, a delete button, a select —
     pressing one of those is pressing it, not picking the row up. */
  if(ev.target.closest('button, select, input, a')) return;
  ev.preventDefault();
  listDrag = {kind, key, label, startX:ev.clientX, startY:ev.clientY,
              moved:false, ghost:null, target:null, where:null};
}
function listDragGhost(){
  if(listDrag.ghost) return listDrag.ghost;
  const g = document.createElement('div');
  g.className = 'list-drag-ghost';
  g.textContent = listDrag.label;
  document.body.appendChild(g);
  listDrag.ghost = g;
  document.body.classList.add('list-dragging');
  return g;
}
function clearListDragMarks(){
  document.querySelectorAll('.drop-into, .drop-before, .drop-after')
    .forEach(e=> e.classList.remove('drop-into','drop-before','drop-after'));
}
function listDropUnder(x, y){
  const under = document.elementFromPoint(x, y);
  if(!under || !under.closest) return null;
  if(listDrag.kind === 'tag'){
    const grp = under.closest('.legend-group');
    if(!grp) return null;
    /* The uncategorised block IS a place to drop: dropping there is how a
       tag comes back OUT of a category, which nothing offered before. The
       Special group is not — what is in it is there because of what it is,
       not because anybody filed it. */
    if(grp.dataset.cat === UNGROUPED && !grp.classList.contains('legend-loose')) return null;
    return {el: grp, where: 'into'};
  }
  const row = under.closest('.ref-item');
  if(!row || row.dataset.key === listDrag.key) return null;
  const r = row.getBoundingClientRect();
  return {el: row, where: y < r.top + r.height/2 ? 'before' : 'after'};
}
window.addEventListener('mousemove', ev=>{
  if(!listDrag) return;
  if(!listDrag.moved){
    if(Math.hypot(ev.clientX - listDrag.startX, ev.clientY - listDrag.startY) < LIST_DRAG_THRESHOLD) return;
    listDrag.moved = true;
  }
  const g = listDragGhost();
  g.style.left = (ev.clientX + 12) + 'px';
  g.style.top  = (ev.clientY + 12) + 'px';
  clearListDragMarks();
  const hit = listDropUnder(ev.clientX, ev.clientY);
  listDrag.target = hit ? hit.el : null;
  listDrag.where = hit ? hit.where : null;
  if(hit) hit.el.classList.add('drop-' + hit.where);
});
window.addEventListener('mouseup', ()=>{
  const st = listDrag;
  listDrag = null;
  if(!st) return;
  if(st.ghost) st.ghost.remove();
  document.body.classList.remove('list-dragging');
  clearListDragMarks();
  if(!st.moved || !st.target) return;
  if(st.kind === 'tag'){
    const cat = st.target.dataset.cat;
    if(!cat) return;
    if(cat === UNGROUPED){
      if(!st.target.classList.contains('legend-loose')) return;
      applyEdit(()=> assignTagCategory(st.key, ''));
      buildManagement();
      setLegendStatus('ok', `“${st.key}” is out of its category.`);
      return;
    }
    applyEdit(()=> assignTagCategory(st.key, cat));
    buildManagement();
    setLegendStatus('ok', `“${st.key}” is now under ${cat}.`);
  } else if(st.kind === 'ref'){
    reorderRef(st.key, st.target.dataset.key, st.where);
  }
});

/* ---- asking the user something -------------------------------------
 *
 * window.prompt and window.confirm are unusable in this application. The
 * artifact viewer runs the page in a sandboxed frame without allow-modals,
 * where prompt() returns null and confirm() returns false — silently, with
 * no error to catch. Every dialog built on them therefore looked like a
 * button that did nothing, which is exactly how "Add a reference" failed.
 *
 * askFields() resolves with an object of values, or null if dismissed.
 * askConfirm() resolves true/false. Both are promises so the calling code
 * reads the same way the prompt-based version did.
 */
const askOverlay = document.getElementById('askOverlay');
const askFieldsEl = document.getElementById('askFields');
let askResolve = null;
function closeAsk(value){
  askOverlay.classList.remove('open');
  const done = askResolve; askResolve = null;
  if(done) done(value);
}
function askFields(title, fields, message){
  return new Promise(resolve=>{
    // A second dialog would orphan the first one's promise, so the one
    // already open is dismissed rather than stacked.
    if(askResolve) closeAsk(null);
    document.getElementById('askTitle').textContent = title;
    document.getElementById('askMessage').textContent = message || '';
    askFieldsEl.innerHTML = '';
    fields.forEach(f=>{
      const wrap = document.createElement('div');
      wrap.className = 'ask-field';
      const lab = document.createElement('label');
      lab.textContent = f.label;
      const input = document.createElement(f.multiline ? 'textarea' : 'input');
      if(!f.multiline) input.type = 'text';
      input.value = f.value || '';
      if(f.placeholder) input.placeholder = f.placeholder;
      if(f.maxLength) input.maxLength = f.maxLength;
      input.spellcheck = false;
      input.dataset.name = f.name;
      wrap.appendChild(lab); wrap.appendChild(input);
      askFieldsEl.appendChild(wrap);
    });
    askOverlay.classList.add('open');
    askResolve = resolve;
    /* Something inside the dialog has to hold the keyboard.
     *
       A confirmation has no fields, so nothing in it was focusable and the
       focus stayed wherever it had been — on the chart. Escape and Enter
       never reached the dialog's own handler, and Delete went straight
       past it to the chart: a question about removing one tag, still on
       screen, while the entry behind it was being deleted. The OK button
       is what takes the keys when there is nothing to type in. */
    const first = askFieldsEl.querySelector('input,textarea')
               || document.getElementById('askOk');
    if(first){ first.focus(); first.select && first.select(); }
  });
}
function askConfirm(title, message){
  return askFields(title, [], message).then(v=> v !== null);
}
function readAskValues(){
  const out = {};
  askFieldsEl.querySelectorAll('[data-name]').forEach(el=>{ out[el.dataset.name] = el.value; });
  return out;
}
document.getElementById('askOk').onclick = ()=> closeAsk(readAskValues());
document.getElementById('askCancel').onclick = ()=> closeAsk(null);
askOverlay.addEventListener('click', ev=>{ if(ev.target === askOverlay) closeAsk(null); });
askOverlay.addEventListener('keydown', ev=>{
  // Enter accepts from a single-line field; a textarea keeps Enter for
  // newlines, which is the whole reason it is a textarea.
  if(ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA'){ ev.preventDefault(); closeAsk(readAskValues()); }
  if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); closeAsk(null); }
});

/* ---- the references panel ---- */
/* References render into the Management panel's one list, below the tags.
   `refsPanel` is that panel — the same element the tag list lives in. */
const refsPanel = document.getElementById('legend');
function setRefsStatus(kind, msg){
  const el = document.getElementById('refsStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'legend-status' + (kind ? ' ' + kind : '');
}
function openRefsPanel(focusKey){
  refsPanel.classList.add('open');
  buildManagement();
  if(focusKey){
    const row = legendList.querySelector(`.ref-item[data-key="${cssEscape(focusKey)}"]`);
    if(row){
      row.scrollIntoView({block:'nearest'});
      // A brief highlight rather than a permanent selection: the reader was
      // sent here by a mark, and what they need is to be shown WHICH entry,
      // not to have one selected for some later action.
      row.classList.add('flash');
      setTimeout(()=> row.classList.remove('flash'), 1400);
    } else {
      setRefsStatus('err', 'That mark points at a reference that no longer exists.');
    }
  }
}
function buildRefsInto(host){
  if(!REFS.length){
    const empty = document.createElement('p');
    empty.className = 'legend-status';
    empty.textContent = 'No references yet. Add one with +, then cite it with the [n] button on any text toolbar.';
    host.appendChild(empty);
    return;
  }
  REFS.forEach((r, i)=>{
    const row = document.createElement('div');
    row.className = 'ref-item';
    row.dataset.key = r.key;
    const used = refUsageCount(r.key);
    /* No heading. A reference is identified by its NUMBER — that is what
       the mark in the text says and what the reader looks for — so a
       second name above the text said the same thing twice and left every
       reference written without one reading "(untitled)". */
    const body = refBodyText(r);
    row.innerHTML =
      `<div class="ref-head"><span class="ref-num" style="color:${escapeHtml(refColor())}">[${i+1}]</span>` +
      `<span class="ref-detail">${escapeHtml(body) || '<em>empty</em>'}</span>` +
      `<span class="ref-uses" title="How many texts cite this">${used}</span></div>` +
      (r.url ? `<a class="ref-link" href="${escapeHtml(safeUrl(r.url) || '')}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>` : '');
    if(!readOnlyView){
      const tools = document.createElement('div');
      tools.className = 'ref-tools';
      const mk = (label, title, fn)=>{
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.title = title;
        b.addEventListener('click', ev=>{ ev.stopPropagation(); fn(); });
        return b;
      };
      tools.appendChild(mk('✎', 'Edit this reference', ()=> editRef(r.key)));
      tools.appendChild(mk('✕', 'Delete this reference', ()=> deleteRef(r.key)));
      row.appendChild(tools);
      /* The number is not a field: it is where the reference sits in the
         list, so it is changed by putting the reference somewhere else.
         The arrows that used to do this are gone — they moved a reference
         one step per press, which is a poor way to say "third". */
      row.classList.add('draggable-row');
      row.title = 'Drag above or below another reference to renumber';
      row.addEventListener('mousedown', ev=> beginListDrag(ev, 'ref', r.key, `[${i+1}]`));
    }
    host.appendChild(row);
  });
}
/* What a reference SAYS. A chart written before references lost their
   heading may still carry one; it is shown, and folded into the text the
   next time the reference is edited, so nothing anyone typed is lost and
   nothing is shown twice. */
function refBodyText(r){
  if(!r) return '';
  const d = (r.detail || '').trim(), t = (r.title || '').trim();
  if(d && t && d.indexOf(t) < 0) return t + ' — ' + d;
  return d || t;
}
async function refPrompt(existing, title){
  const got = await askFields(title, [
    {name:'detail', label:'Reference',        value: refBodyText(existing), multiline:true},
    {name:'url',    label:'Link (optional)',  value: existing ? existing.url : '',    placeholder:'https://…'}
  ]);
  if(!got) return null;
  const url = (got.url || '').trim();
  // title:'' on the way out — see refBodyText.
  if(url && !safeUrl(url)){
    setRefsStatus('err', 'That link was not saved: only http, https, mailto and ftp addresses are allowed.');
    return {title:'', detail:(got.detail||'').trim(), url:''};
  }
  return {title:'', detail:(got.detail||'').trim(), url};
}
async function addRef(){
  const got = await refPrompt(null, 'New reference');
  if(!got || (!got.detail && !got.url)) return;
  const key = uniqueRefKey(got.detail || 'ref');
  applyEdit(()=> REFS.push({key, title:got.title, detail:got.detail, url:got.url}));
  buildManagement(); rebuildChart();
  setRefsStatus('ok', `Added [${REFS.length}].`);
}
async function editRef(key){
  const i = refIndex(key);
  if(i < 0) return;
  const got = await refPrompt(REFS[i], 'Edit reference');
  if(!got) return;
  applyEdit(()=> Object.assign(REFS[i], got));
  buildManagement(); rebuildChart();
}
/* Put a reference where another one is. A reference's number IS its place
   in this list, so moving the row is the only way to change it — and every
   mark after it on the chart has just been renumbered too, which is why
   the whole chart is redrawn and not only the panel. What a mark stores is
   the reference's own key, so this renumbers the text rather than breaking
   the link. */
function reorderRef(key, overKey, where){
  applyEdit(()=>{
    const i = refIndex(key);
    if(i < 0) return;
    const [it] = REFS.splice(i, 1);
    const j = REFS.findIndex(r=> r.key === overKey);
    if(j < 0){ REFS.splice(i, 0, it); return; }
    REFS.splice(where === 'after' ? j + 1 : j, 0, it);
  });
  buildManagement(); rebuildChart();
}
async function deleteRef(key){
  const used = refUsageCount(key);
  if(used && !await askConfirm('Delete this reference?',
      `${used} ${used===1?'text cites':'texts cite'} it. Deleting removes those marks from the text as well.`)) return;
  applyEdit(()=>{
    const i = refIndex(key);
    if(i >= 0) REFS.splice(i, 1);
    /* The marks go too. Leaving them would leave "[?]" scattered through
       the chart pointing at nothing — a deletion that quietly damages the
       text is worse than one that cleans up after itself. */
    workingNodes.forEach(t=>{
      t[1] = stripRefToken(t[1], key);
      t[4] = stripRefToken(t[4], key);
      const opts = t[6];
      if(opts && Array.isArray(opts.langTabs)){
        opts.langTabs.forEach(x=>{ if(x) x.text = stripRefToken(x.text, key); });
      }
    });
    EDGE_STYLES.forEach(e=>{ if(e && e.note) e.note = stripRefToken(e.note, key); });
    COMMENTS.forEach(c=>{ if(c && c.text) c.text = stripRefToken(c.text, key); });
    REFS.forEach(r=>{ r.detail = stripRefToken(r.detail, key); });
  });
  buildManagement(); rebuildChart();
  setRefsStatus('ok', 'Deleted.');
}
{
  // Kept working for anything that still calls it, though the button it
  // was on is gone: references live in the Management panel now.
  const t = document.getElementById('refsToggle');
  if(t) t.onclick = (ev)=>{
    ev.stopPropagation();
    if(refsPanel.classList.contains('open')) refsPanel.classList.remove('open');
    else openRefsPanel(null);
  };
}


/* A click on a reference mark, anywhere on the chart.
 *
 * One delegated listener on the canvas rather than a handler per mark:
 * marks are re-created on every redraw, and there are as many of them as
 * there are citations. The capture phase is used so the entry's own drag
 * and selection handlers never see the event — the mark is a control that
 * happens to sit inside a label, and pressing it must not also press the
 * label. */
svg.addEventListener('mousedown', ev=>{
  const mark = ev.target && ev.target.closest ? ev.target.closest('.ref-mark') : null;
  if(!mark) return;
  ev.preventDefault(); ev.stopPropagation();
  openRefsPanel(mark.dataset.ref);
}, true);

function setLegendStatus(kind, msg){
  const el = document.getElementById('legendStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'legend-status' + (kind ? ' ' + kind : '');
}

function createTag(raw){
  const tag = (raw || '').trim();
  if(!tag) return;
  if(tag === UNTAGGED){ setLegendStatus('err', 'That name is reserved.'); return; }
  if(tagExists(tag)){ setLegendStatus('err', `“${tag}” already exists.`); return; }
  /* A new tag belongs to no category yet, and choosing one for it is a
     second decision — so it is made in the uncategorised bin and carried
     into a category afterwards, which is a drag rather than a form. It
     used to be filed into whichever category happened to be first, which
     was a filing decision the chart made on the reader's behalf and
     usually the wrong one. */
  applyEdit(()=>{ looseBin(true).tags.push(tag); });
  buildManagement();
  setLegendStatus('ok', `Added “${tag}” — drag it onto a category to file it.`);
}

function createCategory(raw){
  const name = (raw || '').trim();
  if(!name) return;
  if(name === UNGROUPED){ setLegendStatus('err', 'That name is reserved.'); return; }
  if(realCategories().some(c=> c.name === name)){ setLegendStatus('err', `“${name}” already exists.`); return; }
  applyEdit(()=> TAG_CATS.push({name, tags:[]}));
  buildManagement();
  setLegendStatus('ok', `Added category “${name}”.`);
}

/* Renaming a category happens ON the heading.
 *
 * It used to open a small dialog with one field in it — a modal, a
 * backdrop and two buttons to change one word — which is a great deal of
 * apparatus for the gesture everybody already knows: double-click the
 * name, type over it, press Enter. So the name itself becomes editable
 * where it stands, with the whole of it selected, exactly as renaming a
 * file does. Enter and clicking away keep the new name; Escape puts the
 * old one back. */
function startCategoryRename(head, oldName){
  const el0 = head && head.querySelector('.legend-group-name');
  if(!el0 || el0.isContentEditable) return;
  el0.contentEditable = 'plaintext-only';
  el0.spellcheck = false;
  el0.classList.add('renaming');
  el0.textContent = oldName;
  el0.focus();
  try{
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(el0);
    sel.removeAllRanges(); sel.addRange(r);
  }catch(e){}
  let done = false;
  const finish = (keep)=>{
    if(done) return;
    done = true;
    const typed = (el0.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    el0.contentEditable = 'false';
    el0.classList.remove('renaming');
    el0.removeEventListener('keydown', onKey);
    el0.removeEventListener('blur', onBlur);
    if(!keep || !typed || typed === oldName){ buildManagement(); return; }
    if(typed === UNGROUPED || realCategories().some(c=> c.name === typed)){
      setLegendStatus('err', `“${typed}” already exists.`);
      buildManagement();
      return;
    }
    applyEdit(()=>{ const c = TAG_CATS.find(c=> c.name === oldName); if(c) c.name = typed; });
    /* The folded/unfolded state is remembered by NAME, so a renamed
       category that was open would have come back folded — and one that
       was folded would have sprung open. */
    if(collapsedCats.has(oldName)){ collapsedCats.delete(oldName); collapsedCats.add(typed); }
    buildManagement();
  };
  function onKey(ev){
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  }
  function onBlur(){ finish(true); }
  el0.addEventListener('keydown', onKey);
  el0.addEventListener('blur', onBlur);
  // A click inside the name being typed is not a click on the heading.
  el0.addEventListener('click', ev=> ev.stopPropagation());
  el0.addEventListener('dblclick', ev=> ev.stopPropagation());
}

function removeCategory(name){
  /* Deleting a category must not delete the tags in it, or removing a bit
     of organisation would silently strip entries of their tags. The tags
     drop back to Ungrouped; only the grouping goes. */
  applyEdit(()=>{
    const i = TAG_CATS.findIndex(c=> c.name === name);
    if(i < 0) return;
    const freed = TAG_CATS[i].tags.slice();
    TAG_CATS.splice(i, 1);
    // Its tags keep existing, so they have to keep having somewhere to be.
    if(freed.length) looseBin(true).tags.push(...freed);
  });
  buildManagement();
  setLegendStatus('ok', `Removed category “${name}”. Its tags are now uncategorised.`);
}

async function deleteTagEverywhere(tag, count){
  if(count && !await askConfirm('Delete this tag?',
      `It is on ${count} ${count===1?'entry':'entries'}, and will be removed from ${count===1?'it':'them'}.`)) return;
  applyEdit(()=>{
    TAG_CATS.forEach(c=>{ const i = c.tags.indexOf(tag); if(i >= 0) c.tags.splice(i, 1); });
    workingNodes.forEach(t=>{
      const opts = t[6];
      if(!opts || !Array.isArray(opts.tags)) return;
      const i = opts.tags.indexOf(tag);
      if(i >= 0) opts.tags.splice(i, 1);
      if(!opts.tags.length) delete opts.tags;
    });
  });
  hiddenTags.delete(tag);
  buildManagement();
  setLegendStatus('ok', `Deleted “${tag}”.`);
}
buildManagement();
/* One eye instead of Show all / Hide all.
 *
 * The two buttons were never both useful: whichever state the chart was
 * in, one of them did nothing. A single control that reads the current
 * state and offers the other one is smaller, and it also SHOWS that state
 * — the crossed-out eye means "everything is hidden", which the old pair
 * could not say at all. */
function everythingHidden(){
  return allTags.length > 0 && allTags.every(t=> hiddenTags.has(t));
}
function syncLegendEye(){
  const btn = document.getElementById('legendEye');
  if(!btn) return;
  const shut = everythingHidden();
  btn.classList.toggle('shut', shut);
  btn.title = shut ? 'Show every tag' : 'Hide every tag';
}
/* The Tags +. Two things can be made here — a tag and a category — so it
   opens a two-item menu; references have their own + and only one thing to
   make, so that one acts at once. */
{
  const menu = document.getElementById('legendAddMenu');
  menu.addEventListener('click', async ev=>{
    const b = ev.target.closest('button[data-add]');
    if(!b) return;
    ev.stopPropagation();
    menu.hidden = true;
    /* Written where it will stand, not in a window of its own — the same
       gesture that renames a category, for the same reason. */
    if(b.dataset.add === 'tag') startNewTagEntry();
    else startNewCategoryEntry();
  });
  document.addEventListener('mousedown', ev=>{
    if(menu.hidden) return;
    if(menu.contains(ev.target) || ev.target.closest('.plus-mini')) return;
    menu.hidden = true;
  });
}

/* Organize mode. The panel's day job is filtering, so the editing controls
   are folded away until asked for rather than crowding every row with a
   dropdown and a delete button nobody wanted. */
/* The chart's one citation colour, in the panel the citations live in. */
{
  const box = document.getElementById('refColorInput');
  const reset = document.getElementById('refColorReset');
  if(box){
    const sync = ()=>{
      box.value = refColor();
      box.classList.remove('bad');
      box.style.setProperty('--swatch', refColor());
    };
    const commit = ()=>{
      const v = box.value.trim();
      const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
      box.classList.toggle('bad', !ok);
      if(!ok) return;
      box.style.setProperty('--swatch', v);
      applyEdit(()=>{ SETTINGS.refColor = v; });
      rebuildChart();
      buildManagement();
    };
    box.addEventListener('input', commit);
    box.addEventListener('click', ev=> ev.stopPropagation());
    if(reset) reset.addEventListener('click', ev=>{
      ev.stopPropagation();
      applyEdit(()=>{ SETTINGS.refColor = DEFAULT_REF_COLOR; });
      sync(); rebuildChart(); buildManagement();
    });
    sync();
  }
}

function nodeHidden(n){
  /* One hidden tag is enough. Hiding a tag means "take these off the
     chart", and an entry that carries it IS one of these — waiting until
     every one of its tags was hidden meant switching off "fan-fiction"
     left every fan-fiction entry that also carried another tag sitting
     there, which reads as the switch not working. */
  return effectiveTags(n).some(t=> hiddenTags.has(t));
}
/* ---------------------------------------------------------------------
   Which entry's decorations are performing.

   A tag with an effect draws something around its entry — a weave, an
   echo, a stack of sheets — and until now those were still pictures. Still
   is right for the chart at rest: a page where a dozen things are moving
   at once is a page nobody can read, and the movement would be saying
   nothing that the picture does not already say.

   It is worth something at exactly two moments: when the pointer is on the
   entry, and while the entry is open in the panel. Both are the reader
   asking "what is this one?", and the answer each decoration gives is the
   thing it means — the echo goes out, the light crosses the weave, the
   stack streams away and dissolves.

   Driven from here rather than from the stylesheet because the decorations
   do not live inside the entry: they are in layers of their own, under the
   connectors, and no selector reaches a sibling three parents away.
   ------------------------------------------------------------------ */
let hoverLivelyId = null;
function syncTagLiveliness(){
  /* The entry whose settings are open counts as being looked at for as
     long as they are open — that is the whole of "sitting in its menu". */
  /* Selected counts, not only "settings open".
   *
     The rule was meant to be "while the reader is looking at this one",
     and the panel was taken as the sign of that — but clicking an entry
     already fades the rest of the chart around it, which is the same
     statement made louder, and the settings form is a second click past
     it. An entry that has been picked out is the one being looked at,
     whether or not its form has been opened on top. */
  const live = new Set([hoverLivelyId, selectedId].filter(Boolean));
  /* When each entry's performance began.
   *
   * The decorations live in layers that are cleared and rebuilt whenever
   * anything on the chart is redrawn — and typing in an entry's settings
   * redraws it on every keystroke. A CSS animation on a brand-new element
   * starts at its first frame, so every keystroke put every performing
   * decoration back to the beginning: an echo half-way out jumped back to
   * the box, a sheet half-way across vanished and set off again. From the
   * outside, decorations blinking while you type.
   *
   * So the START is remembered per entry, and a decoration rebuilt part-way
   * through is given a negative delay of exactly how far through it was.
   * The animation then carries on from where the old element left off and
   * nothing on screen registers that anything was replaced. */
  livelyStart.forEach((_, id)=>{ if(!live.has(id)) livelyStart.delete(id); });
  live.forEach(id=>{ if(!livelyStart.has(id)) livelyStart.set(id, performance.now()); });
  [...auraLayer.querySelectorAll('.node-aura'),
   ...fanLayer.querySelectorAll('.fanfic-weave, .fanfic-glint')].forEach(e=>{
    const on = live.has(e.dataset.id);
    e.classList.toggle('tag-lively', on);
    if(!on){ resumeAnimation(e, null, 0); return; }
    const since = performance.now() - (livelyStart.get(e.dataset.id) || performance.now());
    if(e.classList.contains('fanfic-glint')) resumeAnimation(e, LIVELY_CYCLE.glint, since);
    else {
      /* The rings and the sheets each carry their own stagger in the
         stylesheet, and an inline delay replaces it — so the stagger is
         re-applied here rather than lost. Their order in the group is the
         order the stylesheet counts them in. */
      const rings = [...e.querySelectorAll('.hub-echo')];
      rings.forEach((r,i)=> resumeAnimation(r, LIVELY_CYCLE.echo, since, -i * LIVELY_CYCLE.echo / HUB_ECHOES));
      const sheets = [...e.querySelectorAll('.local-sheet')];
      sheets.forEach((r,i)=> resumeAnimation(r, LIVELY_CYCLE.sheet, since, -i * LIVELY_CYCLE.sheet / LOCAL_SHEETS));
    }
  });
}
/* How long one turn of each performance takes, in milliseconds. Kept in
   step with the @keyframes durations in the stylesheet. */
const LIVELY_CYCLE = {echo: 2700, sheet: 1700, glint: 3400};
const livelyStart = new Map();     // entry id -> when its decorations woke
function resumeAnimation(elm, period, since, stagger){
  if(!elm) return;
  if(!period){ elm.style.removeProperty('animation-delay'); return; }
  const into = ((since % period) + period) % period;
  elm.style.animationDelay = (((stagger || 0) - into / 1000)).toFixed(3) + 's';
}
function applyVisibility(){
  syncTagLiveliness();
  qNodes('.node').forEach(g=>{
    const n = nodes.get(g.dataset.id);
    g.style.display = (n && nodeHidden(n)) ? 'none' : '';
  });
  // The weave and the scenery both belong to their entry and go when it does.
  [...fanLayer.querySelectorAll('.fanfic-weave, .fanfic-glint'),
   ...auraLayer.querySelectorAll('.node-aura')].forEach(r=>{
    const n = nodes.get(r.dataset.id);
    r.style.display = (n && nodeHidden(n)) ? 'none' : '';
  });
  // Every piece of a connector, not only its line: the arrowheads, the ring
  // caps and the notes live in the layer above the entries, and hiding a
  // tag used to leave them behind as orphans floating over an empty chart.
  qEdges('.edge, .edge-hit, .edge-arrow, .edge-note').forEach(p=>{
    const a = nodes.get(p.dataset.from), b = nodes.get(p.dataset.to);
    const hide = (a && nodeHidden(a)) || (b && nodeHidden(b));
    p.style.display = hide ? 'none' : '';
  });
  /* A callout's leader answers to THREE entries: the two its connector
     joins, and the callout itself — hide any of them and a line pointing
     at nothing from nothing is what would be left. */
  edgeLayer.querySelectorAll('.callout-leader').forEach(g=>{
    const a = nodes.get(g.dataset.from), b = nodes.get(g.dataset.to);
    const c = nodes.get(g.dataset.id);
    const hide = (a && nodeHidden(a)) || (b && nodeHidden(b)) || (c && nodeHidden(c));
    g.style.display = hide ? 'none' : '';
  });
}

/* ---------------------------------------------------------------------
   Pan / zoom
   ------------------------------------------------------------------ */
let vx=0, vy=0, vs=1;
let dragging=false, dragStart=null;

function computeBounds(){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  nodes.forEach(n=>{
    minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
    maxX=Math.max(maxX,n.x+n.w); maxY=Math.max(maxY,n.y+n.h);
  });
  return {minX,minY,maxX,maxY};
}
/* Deliberately NOT cached.
 *
 * This used to be `const bounds = computeBounds()`, evaluated once while
 * the file loaded, and fitToView() read it forever after. So "zoom to fit"
 * fitted the chart as it was when the page opened: every entry added,
 * deleted or dragged since was outside the frame it computed, and on a
 * chart that had been worked on for a while the button simply pointed the
 * camera at empty space. Bounds are cheap — one pass over the entries —
 * and the only caller runs on a click, so there is nothing to cache. */

function applyTransform(){
  viewport.setAttribute('transform',`translate(${vx},${vy}) scale(${vs})`);
  if(typeof syncAlignGrid === 'function') syncAlignGrid();
  // The bio card is an HTML overlay in screen space, so it has to be
  // re-anchored whenever the drawing moves under it.
  if(typeof positionBioCard === 'function') positionBioCard();
  /* The in-node field stands on its entry, so it moves with the drawing.
     Its type is scaled by the zoom as well, which is what keeps what is
     being typed the same size as what it will be. */
  if(typeof nodeEditorTarget !== 'undefined' && nodeEditorTarget){
    syncNodeEditorLook(nodes.get(nodeEditorTarget));
    positionNodeEditor();
  }
  document.getElementById('coord').textContent =
    `x${Math.round(-vx/vs)} · y${Math.round(-vy/vs)} · z${vs.toFixed(2)}`;
}

function fitToView(padding){
  padding = padding||60;
  const rect = svg.getBoundingClientRect();
  const bounds = computeBounds();
  if(!Number.isFinite(bounds.minX)) return;   // nothing to fit
  const w = Math.max(1, bounds.maxX-bounds.minX), h = Math.max(1, bounds.maxY-bounds.minY);
  const sx = (rect.width-padding*2)/w, sy=(rect.height-padding*2)/h;
  vs = Math.min(sx,sy, 1);
  vx = -bounds.minX*vs + padding;
  vy = -bounds.minY*vs + padding;
  applyTransform();
}


function flyToNode(id){
  const n = nodes.get(id);
  if(!n) return;
  const rect = svg.getBoundingClientRect();
  vs = Math.max(vs, 0.85);
  vx = -(n.x+n.w/2)*vs + rect.width/2;
  vy = -(n.y+n.h/2)*vs + rect.height/2;
  applyTransform();
}

/* Dragging the empty canvas either pans it or draws a selection box. Held
   plainly it pans, as it always has; held with Shift (or started on the
   canvas with Ctrl/Cmd down) it rubber-bands a rectangle and selects every
   node that ends up inside it. Keeping pan as the unmodified gesture
   matters — panning is what you do constantly, selecting is occasional. */
let marqueeState = null;
let suppressCanvasClick = false;
const marqueeRect = el('rect', {class:'marquee', style:'display:none;'}, viewport);

svg.addEventListener('mousedown', ()=>{ keyboardOnChart = true; }, true);
svg.addEventListener('mousedown', e=>{
  if(e.target.closest('.node')) return;
  if(e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey) && !readOnlyView){
    const w = clientToWorld(e.clientX, e.clientY);
    marqueeState = { x0: w.x, y0: w.y, additive: e.ctrlKey || e.metaKey };
    marqueeRect.style.display = '';
    marqueeRect.setAttribute('x', w.x);
    marqueeRect.setAttribute('y', w.y);
    marqueeRect.setAttribute('width', 0);
    marqueeRect.setAttribute('height', 0);
    e.preventDefault();
    return;
  }
  dragging = true; dragStart = {x:e.clientX,y:e.clientY,vx,vy};
  /* A pan is a pan, not the start of a text selection. Without this the
     browser began selecting the moment the pointer moved, and a pan that
     wandered over a panel painted its words in selection blue. */
  e.preventDefault();
  svg.classList.add('grabbing');
});

window.addEventListener('mousemove', e=>{
  if(!marqueeState) return;
  const w = clientToWorld(e.clientX, e.clientY);
  const x = Math.min(marqueeState.x0, w.x), y = Math.min(marqueeState.y0, w.y);
  const width = Math.abs(w.x - marqueeState.x0), height = Math.abs(w.y - marqueeState.y0);
  marqueeRect.setAttribute('x', x);
  marqueeRect.setAttribute('y', y);
  marqueeRect.setAttribute('width', width);
  marqueeRect.setAttribute('height', height);
  marqueeRect.setAttribute('stroke-width', 1/vs);
  marqueeState.box = {x, y, width, height};
});

window.addEventListener('mouseup', ()=>{
  const st = marqueeState;
  marqueeState = null;
  if(!st) return;
  marqueeRect.style.display = 'none';
  const box = st.box;
  // A click with no drag behind it is not a selection gesture.
  if(!box || (box.width < 3 && box.height < 3)) return;
  suppressCanvasClick = true;
  setTimeout(()=>{ suppressCanvasClick = false; }, 0);
  const hits = [];
  nodes.forEach(n=>{
    if(nodeHidden(n)) return;
    // Anything the box touches counts, not only what it fully contains —
    // matching how a lasso reads to the hand.
    if(n.x < box.x + box.width && n.x + n.w > box.x &&
       n.y < box.y + box.height && n.y + n.h > box.y) hits.push(n.id);
  });
  if(!hits.length){ if(!st.additive) deselect(); return; }
  if(st.additive) hits.forEach(id=> multiSelection.add(id));
  setSelection(st.additive ? Array.from(multiSelection) : hits, hits[0]);
});
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  vx = dragStart.vx + (e.clientX-dragStart.x);
  vy = dragStart.vy + (e.clientY-dragStart.y);
  applyTransform();
});
window.addEventListener('mouseup', ()=>{ dragging=false; svg.classList.remove('grabbing'); });

svg.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect = svg.getBoundingClientRect();
  const mx = e.clientX-rect.left, my = e.clientY-rect.top;
  const factor = Math.exp(-e.deltaY*0.0016);
  const newScale = Math.min(3, Math.max(0.08, vs*factor));
  const wx = (mx - vx)/vs, wy=(my-vy)/vs;
  vx = mx - wx*newScale; vy = my - wy*newScale;
  vs = newScale;
  applyTransform();
},{passive:false});

// touch support (basic pinch + pan)
let touchState=null;
svg.addEventListener('touchstart', e=>{
  if(e.touches.length===1){
    touchState={mode:'pan',x:e.touches[0].clientX,y:e.touches[0].clientY,vx,vy};
  } else if(e.touches.length===2){
    const [a,b]=e.touches;
    touchState={mode:'pinch',d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),vs,
      cx:(a.clientX+b.clientX)/2, cy:(a.clientY+b.clientY)/2, vx,vy};
  }
},{passive:true});
svg.addEventListener('touchmove', e=>{
  if(!touchState) return;
  if(touchState.mode==='pan' && e.touches.length===1){
    vx = touchState.vx + (e.touches[0].clientX-touchState.x);
    vy = touchState.vy + (e.touches[0].clientY-touchState.y);
    applyTransform();
  } else if(touchState.mode==='pinch' && e.touches.length===2){
    const [a,b]=e.touches;
    const d = Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    const factor = d/touchState.d;
    vs = Math.min(3,Math.max(0.08, touchState.vs*factor));
    applyTransform();
  }
},{passive:true});

// The alignment grid is a way of looking at the chart, not a change to it:
// it belongs to this reader, is remembered for them alone, and is offered
// to everyone including read-only viewers.
document.getElementById('gridToggle').onclick = ()=> setAlignGrid(!alignGridOn);
setAlignGrid(alignGridOn);

document.getElementById('zoomIn').onclick = ()=>{ vs=Math.min(3,vs*1.25); applyTransform(); };
document.getElementById('zoomOut').onclick = ()=>{ vs=Math.max(0.08,vs*0.8); applyTransform(); };
document.getElementById('zoomReset').onclick = ()=> fitToView();

/* ---------------------------------------------------------------------
   Dragging nodes.

   Every node's shapes and text are drawn at absolute world coordinates, so
   moving one during a drag is a translate() on its <g> rather than a
   re-render — cheap enough to redraw all the edges on every mousemove, so
   the connectors follow the node live. n.x/n.y are kept in step with the
   translate the whole time, which is what lets routeEdge() see the new
   position without knowing a drag is happening at all.

   Position snaps to the GRID set up next to the layout engine; a faint
   grid appears under the chart while dragging so the snap targets are
   visible, and disappears on release rather than permanently changing how
   the chart looks at rest. On release the new spot is written to the
   node's saved entry as opts.pos, which this page re-reads on reload.
   ------------------------------------------------------------------ */
let nodeDragState = null;
let suppressNodeClick = false;
/* How long a single click waits to see whether it is really half of a
   double one. Comfortably under the ~500ms a system double-click allows,
   and short enough that a genuine single click still feels immediate. */
const DOUBLE_CLICK_GRACE = 220;
let nodeClickTimer = null;
// Declared up here, not with the rest of the bio-card code far below,
// because applyTransform() re-anchors the card on every viewport change —
// including the initial fitToView(), which runs before that code does.
let bioCardNodeId = null;
// A clicked card stays put; a hovered one comes and goes with the pointer.
let bioCardPinned = false;
let bioHoverTimer = null;
const DRAG_THRESHOLD = 4; // px of pointer travel before a click becomes a drag

/* The ruling that appears while you drag is the alignment grid itself,
   simply switched on for the duration. It used to be a second, hand-drawn
   grid with its own spacing and weight, so the lines you lined an entry up
   against while dragging were not the lines you saw when the grid was on —
   two different rulings for one snap. Sharing the real one removes the
   discrepancy by construction: there is only ever one grid. */
/* Ctrl (or Cmd) is the off-grid modifier. Shift used to be, and was moved
   because Shift is now "put it back on the grid" — the two are opposites
   and wanted to be different keys. */
function dragIsFree(e){ return !!(e.ctrlKey || e.metaKey); }
/* How far a NEW amalgam is placed from its lineages — see bringAmalgamHome.
 *
 * It used to be a leash as well, and a leash of two kinds. One held the
 * entry within a fixed DISTANCE of its furthest lineage, by pulling it
 * back along the line between them — so pushing further actually dragged
 * the entry closer, shortening the very stem it was meant to protect. That
 * one is gone: the bar hangs from the lineages and stays where they are,
 * and the merged arrow simply reaches further.
 *
 * The other held the entry between the bar's own ENDS, and that one is
 * right and stays. The merged arrow leaves from a point on the bar and
 * runs to the entry, so an entry taken past the last lineage has no bar
 * left to leave from: the arrow stops being a stem dropping out of the
 * merge and becomes a long diagonal running away from it, which is not a
 * shape anything else on this chart draws. Perpendicular to the bar the
 * entry goes as far as it likes. */
const AMALGAM_LEASH = 520;
function amalgamBarClamp(st, offX, offY){
  let out = null;
  if(!st || !st.members) return null;
  st.members.forEach(m=>{
    const n = m.node;
    if(!n || (n.shape||'') !== 'amalgam') return;
    const parents = (n.parents || []).map(id=> nodes.get(id))
      .filter(p=> p && !st.members.some(o=> o.id === p.id));
    // One lineage is an ordinary connector with no bar to stay on.
    if(parents.length < 2) return;
    const homeX = m.originX + n.w/2, homeY = m.originY + n.h/2;
    let cx = homeX + offX, cy = homeY + offY;
    let held = false;
    const cxs = parents.map(p=> p.x + p.w/2);
    const cys = parents.map(p=> p.y + p.h/2);
    const spanX = Math.max(...cxs) - Math.min(...cxs);
    const spanY = Math.max(...cys) - Math.min(...cys);
    // The bar runs along whichever axis the lineages are spread out on.
    if(spanX >= spanY){
      const held2 = Math.max(Math.min(...cxs), Math.min(Math.max(...cxs), cx));
      if(held2 !== cx){ cx = held2; held = true; }
    } else {
      const held2 = Math.max(Math.min(...cys), Math.min(Math.max(...cys), cy));
      if(held2 !== cy){ cy = held2; held = true; }
    }
    if(held) out = {x: cx - homeX, y: cy - homeY};
  });
  return out;
}
function showDragGrid(){
  if(dragGridShowing || alignGridOn) return;
  dragGridShowing = true;
  syncAlignGrid();
}
function hideDragGrid(){
  if(!dragGridShowing) return;
  dragGridShowing = false;
  syncAlignGrid();
}

/* Where a carried callout's leader is pinned, in chart coordinates.
 *
 * Only for a callout carried ALONE: a group drag is a group drag, and one
 * member swinging about a point of its own while the rest translate would
 * pull the set apart. Read from the leader as it is currently drawn, so
 * the card swings about the dot the reader can see rather than about a
 * fraction recomputed from a route that is being redrawn under them. */
function calloutDragAnchor(st){
  if(!st || !st.node || st.members.length !== 1) return null;
  const n = st.node;
  if(!isCalloutNode(n) || !n.leader) return null;
  const dot = edgeLayer.querySelector(
    `.callout-leader[data-id="${CSS.escape(n.id)}"] .leader-dot`);
  if(!dot) return null;
  return {x: +dot.getAttribute('cx'), y: +dot.getAttribute('cy')};
}
function beginNodeDrag(ev, n, g){
  if(ev.button !== 0 || readOnlyView) return;
  // The chips and link badge riding on the node are their own controls.
  if(ev.target.closest('.lang-chip, a, .node-handle, .node-resize')) return;
  ev.stopPropagation();   // don't let the canvas start a pan underneath
  // …nor the browser start selecting text as the entry is carried about.
  ev.preventDefault();
  // Dragging any member of a multi-selection moves the whole set, keeping
  // their relative positions.
  const group = (multiSelection.size > 1 && multiSelection.has(n.id))
    ? Array.from(multiSelection)
    : [n.id];
  /* Where in the card the press landed, so a swung callout keeps that
     point under the pointer instead of snapping its middle to it. */
  const grabAt = clientToWorld(ev.clientX, ev.clientY);
  nodeDragState = {
    node: n, g,
    startClientX: ev.clientX, startClientY: ev.clientY,
    grabDX: (n.x + n.w/2) - grabAt.x,
    grabDY: (n.y + n.h/2) - grabAt.y,
    originX: n.x, originY: n.y,
    members: group.map(id=>{
      const m = nodes.get(id);
      return { id, node: m, g: qNode(`.node[data-id="${CSS.escape(id)}"]`),
               // The scenery behind an entry — a hub's echo, a stack's back
               // sheets — lives in its own layer and has to travel too.
               aura: auraLayer.querySelector(`.node-aura[data-id="${CSS.escape(id)}"]`),
               /* …and so does the fan-fiction weave, which is in a layer
                  below even that one. It was left behind for the whole of
                  every drag and only caught up when the entry was dropped:
                  the entry slid out of its own patch. */
               fan: [...fanLayer.querySelectorAll(
                       `.fanfic-weave[data-id="${CSS.escape(id)}"], .fanfic-glint[data-id="${CSS.escape(id)}"]`)],
               originX: m.x, originY: m.y };
    }),
    moved: false
  };
}

window.addEventListener('mousemove', e=>{
  if(!nodeDragState) return;
  const st = nodeDragState;
  const dxScreen = e.clientX - st.startClientX, dyScreen = e.clientY - st.startClientY;
  if(!st.moved && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
  if(!st.moved){
    st.moved = true;
    st.g.classList.add('dragging');
    if(!dragIsFree(e)) showDragGrid();
  }
  /* Screen pixels -> world units: undo the viewport scale (translation
     cancels out in a delta). The snap is applied to the DRAGGED node and
     the same whole-number offset given to the rest, so a group keeps its
     internal spacing exactly instead of each member snapping separately.

     Three ways to place an entry:

     Ctrl lifts it off the grid entirely. The grid keeps a hand-arranged
     chart tidy, but it makes some things impossible: two connected entries
     of different heights have their ports at whatever offset their sizes
     give them, and if that offset is not a whole number of grid steps no
     amount of snapped dragging will ever line them up. Ctrl is the way out.

     Plain dragging snaps the MOVEMENT, not the position. This is the fix
     for the thing that made Ctrl nearly useless: lining two entries up and
     then nudging one anywhere else used to re-snap it to absolute grid
     coordinates, throwing the alignment away. Snapping the delta instead
     moves in tidy grid steps while carrying whatever fine offset the entry
     already has, so an alignment survives every later move.

     Shift is how you deliberately give that offset up — it snaps the
     position itself, putting the entry back on the grid proper. */
  /* A callout is carried about its ANCHOR, not about the ruled grid.
   *
     What a reader adjusts on a callout is which way it stands off the
     place it points at and how far — that is the whole of its position,
     and it is the pair the placing gesture asked for in the first place.
     So the same two keys mean here what they meant there: Shift snaps the
     ANGLE to eighths of a turn and draws the eight rays it is snapping to,
     Ctrl comes off the grid, and a plain carry snaps the distance. The
     entry-to-entry alignment guides are not offered at all: lining a
     comment card up with the edge of some unrelated box says nothing, and
     it was taking the card off the ray it had been aimed along. */
  const anchor = calloutDragAnchor(st);
  if(anchor){
    const p = clientToWorld(e.clientX, e.clientY);
    const half = {x: st.node.w/2, y: st.node.h/2};
    let dir = Math.atan2((p.y + st.grabDY) - anchor.y, (p.x + st.grabDX) - anchor.x) * 180/Math.PI;
    let len = Math.hypot((p.x + st.grabDX) - anchor.x, (p.y + st.grabDY) - anchor.y);
    if(e.shiftKey) dir = Math.round(dir / LEADER_AIM_STEP) * LEADER_AIM_STEP;
    if(!dragIsFree(e)) len = snapToGrid(len);
    len = Math.max(LEADER_AIM_MIN, len);
    const a = dir * Math.PI / 180;
    const cx = anchor.x + Math.cos(a) * len, cy = anchor.y + Math.sin(a) * len;
    /* To the hundredth, not to the whole pixel.
     *
       A card swung about its anchor is placed by arithmetic — an angle and
       a distance — and a port rarely lands on a whole pixel, so rounding
       the card's corner to one moved its CENTRE up to half a pixel
       sideways. The leader is drawn to that centre, so an angle the reader
       had just snapped to exactly ninety degrees came out at 89.9, every
       time; on a merge, where the bar's ports sit on halves, it came out
       wrong at every snap. The same reasoning as the release of an anchor
       drag, which already keeps two decimals for exactly this. */
    const px2 = (v)=> Math.round(v * 100) / 100;
    const dOffX = px2(cx - half.x) - st.originX;
    const dOffY = px2(cy - half.y) - st.originY;
    clearGuides();
    document.body.classList.toggle('leader-snapping', !!e.shiftKey);
    if(e.shiftKey) paintLeaderAim(anchor, {dir, len}, true);
    else while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
    st.members.forEach(m=>{
      m.node.x = m.originX + dOffX;
      m.node.y = m.originY + dOffY;
      if(m.g) m.g.setAttribute('transform',
        `translate(${dOffX},${dOffY}) ${m.g.dataset.rotTransform || ''}`.trim());
      if(m.aura) m.aura.setAttribute('transform', `translate(${dOffX},${dOffY})`);
      (m.fan || []).forEach(f=> f.setAttribute('transform', `translate(${dOffX},${dOffY})`));
    });
    queueDragRedraw(st);
    return;
  }
  const free = dragIsFree(e);
  const rawX = st.originX + dxScreen/vs, rawY = st.originY + dyScreen/vs;
  const placedX = free ? Math.round(rawX)
    : e.shiftKey ? snapToGrid(rawX)
    : st.originX + snapToGrid(rawX - st.originX);
  const placedY = free ? Math.round(rawY)
    : e.shiftKey ? snapToGrid(rawY)
    : st.originY + snapToGrid(rawY - st.originY);
  let offX = placedX - st.originX, offY = placedY - st.originY;
  /* An amalgam cannot be dragged off the end of its own bar.
   *
   * The bar stands a bounded distance in front of the entry, so past that
   * distance the entry stops taking its lineages with it and the merged
   * arrow just gets longer and longer across the chart. Rather than draw
   * that, the drag stops: the entry may go as far as the bar can follow
   * and no further, which is a limit the shape itself imposes. */
  /* Guides first, then the leash. An alignment is an offer; the leash is a
     limit the shape imposes, and a limit outranks an offer. */
  /* And the guides are asked for, not volunteered.
   *
     A guide that appears by itself takes the entry a few pixels off where
     the hand put it, which is right when lining things up and wrong the
     rest of the time — and there is no way to tell which from the drag
     alone. Held Shift says "line this up", the same key that already means
     "put this back on the ruled grid": both are the reader asking for a
     tidy position rather than the exact one under the pointer, and the
     guide is the more specific of the two, so it wins where it applies. */
  const snapped = e.shiftKey && !free
    ? alignGuides(st, offX, offY, free)
    : (clearGuides(), {x: offX, y: offY});
  offX = snapped.x; offY = snapped.y;
  /* A merge's entry stays between its bar's ends — see amalgamBarClamp.
     Guides are an offer; this is a limit the shape imposes, and a limit
     outranks an offer. */
  const barHeld = amalgamBarClamp(st, offX, offY);
  if(barHeld){ offX = barHeld.x; offY = barHeld.y; clearGuides(); }
  st.members.forEach(m=>{
    m.node.x = m.originX + offX;
    m.node.y = m.originY + offY;
    // Compose with the element's own rotation rather than replacing it.
    if(m.g) m.g.setAttribute('transform',
      `translate(${offX},${offY}) ${m.g.dataset.rotTransform || ''}`.trim());
    if(m.aura) m.aura.setAttribute('transform', `translate(${offX},${offY})`);
    (m.fan || []).forEach(f=> f.setAttribute('transform', `translate(${offX},${offY})`));
  });
  /* The entries themselves move on every pointer event — that is a
     transform on a handful of groups and costs nothing. The CONNECTORS are
     rebuilt from nothing, every one of them re-routed around every other,
     and that is by far the most expensive thing this application does: at
     a few hundred entries a pointer stream at 120Hz asks for it twice per
     frame and the drag turns to treacle. Once per frame is all a drag can
     show, so that is how often it is done. */
  queueDragRedraw(st);
});
let dragRedrawFrame = 0;
function queueDragRedraw(st){
  if(dragRedrawFrame) return;
  dragRedrawFrame = requestAnimationFrame(()=>{
    dragRedrawFrame = 0;
    redrawEdges();
    applyVisibility();
    /* Every connector has just been rebuilt from nothing, so none of them
       remembers being faded — and the highlight is what says which of them
       belong to the entry being looked at. Without putting it back, picking
       an entry up lit the whole chart for as long as the mouse was down and
       let it settle again the moment it was released. */
    if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
    paintMultiSelection();
    // A portrait's card is anchored beside its circle, so it has to travel
    // with it. Without this it sat where the circle used to be until the
    // mouse came up, and then jumped. Any card at all, since a portrait
    // asked to keep one open has it whether or not it is the one hovered.
    if(st.members.some(m=>{
         const n = m.node;
         return n && ((m.id === bioCardNodeId) || ((n.shape || '') === 'ellipse' && n.bioCard));
       })) drawBioCard();
  });
}

window.addEventListener('mouseup', ()=>{
  const st = nodeDragState;
  nodeDragState = null;
  if(!st) return;
  // A frame still owing from the drag would draw over what settling the
  // drag is about to draw, from a state that no longer exists.
  if(dragRedrawFrame){
    cancelAnimationFrame(dragRedrawFrame); dragRedrawFrame = 0;
    /* But the drawing it owed is what tells the callouts on these
       connectors where their anchors ended up, and that has to be written
       down before the chart is rebuilt from the entries — a rebuild starts
       the anchors again from what the entries say. So the frame is not
       dropped, it is taken now. */
    if(st.moved) redrawEdges();
  }
  st.g.classList.remove('dragging');
  hideDragGrid();
  clearGuides();
  // The rays a swung callout was snapping to go with the gesture.
  document.body.classList.remove('leader-snapping');
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(!st.moved) return;
  // The browser fires a click right after this mouseup, which would
  // otherwise re-select the node you just dropped. The flag is cleared on
  // the next tick rather than by that click, because a drag doesn't always
  // produce one — and a flag left standing would silently swallow the next
  // real click on any node.
  suppressNodeClick = true;
  setTimeout(()=>{ suppressNodeClick = false; }, 0);
  if(st.node.x===st.originX && st.node.y===st.originY) return; // snapped back to where it started
  saveNodePositions(st.members.map(m=>({id:m.id, x:m.node.x, y:m.node.y})));
});

// Writes the dropped position into the node's saved entry. Deliberately
// quiet on success — the page reloads itself after a publish, and a node
// snapping into place is its own confirmation; only failures speak up.
// One undo step for the whole move, however many nodes it covered.
function saveNodePositions(list){
  applyEdit(()=>{
    list.forEach(({id, x, y})=>{
      const found = workingEntry(id);
      if(!found) return;
      const opts = entryOpts(found.entry);
      // Back into the co-ordinate opts.pos is written in: the top of a
      // default-height box, not the top of this one. Without this the
      // entry climbed by half its extra height on every single drop.
      const n = nodes.get(id);
      /* Two decimals. Every ordinary drag hands whole numbers in and gets
         them back unchanged; a callout swung about its anchor does not,
         and rounding its corner here would put back exactly the half-pixel
         tilt the drag was careful not to introduce. */
      opts.pos = [+(+x).toFixed(2), +(y + ((n && n.growShift) || 0)).toFixed(2)];
      putEntry(found.index, found.entry, opts);
    });
  });
}

/* ---------------------------------------------------------------------
   Drawing a connector by dragging between side handles.

   Grab the handle on the side a connector should leave from, drag to the
   side of another node it should arrive at, let go. Both chosen sides are
   saved with the edge, so the connector keeps entering and leaving where
   you put it instead of being re-guessed from the geometry — and because
   ports are spaced by fraction of the side, any number of connectors can
   share the one you pick.

   The click-two-nodes connect mode in the toolbar still exists and still
   leaves both sides on Auto; this is the precise version of the same act.
   ------------------------------------------------------------------ */
let connectorDragState = null;
const rubberBand = el('path', {class:'connector-rubber', style:'display:none;'}, viewport);

// Pointer position in world (pre-transform) coordinates.
function clientToWorld(clientX, clientY){
  const rect = svg.getBoundingClientRect();
  return { x: (clientX - rect.left - vx)/vs, y: (clientY - rect.top - vy)/vs };
}
// Which side of a box a point is closest to — how a drop decides where the
// arrow lands when it wasn't released exactly on one of the handles.
function nearestSide(n, wx, wy){
  const d = {
    left:   Math.abs(wx - n.x),
    right:  Math.abs(wx - (n.x + n.w)),
    top:    Math.abs(wy - n.y),
    bottom: Math.abs(wy - (n.y + n.h))
  };
  return SIDES.reduce((best,s)=> d[s] < d[best] ? s : best, 'top');
}

/* Resizing a box. Like dragging, this updates the live record and redraws
   as you go, then writes opts.size once on release — so the connectors
   re-route around the new shape while you're still holding the mouse. */
let nodeResizeState = null;
function beginNodeResize(ev, n, g, corner){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation();
  ev.preventDefault();
  nodeResizeState = {
    node: n, g,
    // Which corner is being pulled, as a pair of signs: which way this
    // corner has to move for the box to get bigger. The corner diagonally
    // opposite is the one that stays where it is.
    corner: corner || {key:'se', sx:1, sy:1},
    startClientX: ev.clientX, startClientY: ev.clientY,
    // The shift the entry is currently drawn with. Giving it a fixed size
    // takes that shift away, so the stored position has to lose it too or
    // the box drops by exactly that much the moment you resize it.
    growShift: n.growShift || 0,
    originX: n.x, originY: n.y,
    originW: n.w, originH: n.h, moved: false
  };
}
window.addEventListener('mousemove', e=>{
  if(!nodeResizeState) return;
  const st = nodeResizeState;
  const dx = (e.clientX - st.startClientX)/vs, dy = (e.clientY - st.startClientY)/vs;
  if(!st.moved && Math.hypot(dx*vs, dy*vs) < DRAG_THRESHOLD) return;
  st.moved = true;
  const c = st.corner;
  /* The floor is the one an auto-sized box settles to, not the one a NEW
     box is created at.
   *
     An entry with nothing written in it closes onto its own (absent) ink
     and comes out 52 by 24. Clamped to the creation size instead, the very
     first pixel of a corner drag jumped it to 84 by 40 — pulling the
     corner INWARD made the box suddenly bigger, which is the opposite of
     what the hand just did. The two floors are different on purpose (see
     NODE_FIT_MINW): one is how big a box arrives, the other is how small a
     box may be, and it is the second that a resize is bounded by. */
  let w = Math.max(NODE_FIT_MINW, snapToGrid(st.originW + dx*c.sx));
  let h = Math.max(NODE_FIT_MINH, snapToGrid(st.originH + dy*c.sy));
  /* A portrait is a circle, and a circle has one measurement.
   *
     Left to the ordinary two, dragging a corner sideways widened a box
     that is drawn as a circle inscribed in its shorter side — so the
     circle did not move at all and the grip appeared to do nothing. The
     larger of the two movements is taken as the size, which is what the
     hand means by pulling a corner outward, and both sides are set to it
     so the shape stays what it is. */
  if((st.node.shape || '') === 'ellipse'){
    const side = Math.max(BIO_MIN_SIZE,
      snapToGrid(st.originW + Math.max(dx*c.sx, dy*c.sy)));
    w = h = side;
  }
  st.node.size = {w, h};
  /* Pulling a top or left corner holds the opposite one still, which means
     the entry's own origin travels as the box grows. An entry whose origin
     moves has to be written down as placed by hand — otherwise the next
     redraw reads it back out of the layout and puts it where the layout
     wants it, which is not where the reader just dragged its corner to. */
  if(c.sx < 0 || c.sy < 0){
    const nx = c.sx < 0 ? st.originX + (st.originW - w) : st.originX;
    const ny = c.sy < 0 ? st.originY + (st.originH - h) : st.originY;
    // Both: `pos` is what the next full rebuild reads, `x`/`y` are what
    // this redraw draws — a redraw does not go back to `pos` for a box
    // that already has one.
    st.node.pos = {x: nx, y: ny};
    st.node.x = nx; st.node.y = ny;
  }
  renderNodes();
  redrawEdges();
  applyVisibility();
  if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
  paintMultiSelection();
  /* A portrait's card is anchored beside its circle and sized in step with
     it, so it has to be redrawn as the circle is dragged bigger. Without
     this it sat at the old radius until the mouse came up and then jumped
     — the one gesture where the card and the entry it belongs to were
     visibly two different objects. */
  drawBioCard();
});
window.addEventListener('mouseup', ()=>{
  const st = nodeResizeState;
  nodeResizeState = null;
  if(!st || !st.moved) return;
  const size = st.node.size;
  applyEdit(()=>{
    const found = workingEntry(st.node.id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    opts.size = [size.w, size.h];
    const moved = st.corner.sx < 0 || st.corner.sy < 0;
    if(moved){
      // A fixed size takes no growth offset, so the drawn top-left IS the
      // position to write down.
      opts.pos = [st.node.x, st.node.y];
    } else if(st.growShift && Array.isArray(opts.pos)){
      opts.pos = [opts.pos[0], opts.pos[1] - st.growShift];
    }
    putEntry(found.index, found.entry, opts);
  });
});

/* ---------------------------------------------------------------------
   Turning a caption by hand.
 *
 * The angle used to be a slider in the caption's own card: a control in a
 * panel for a property of a thing on the drawing, which meant aiming by
 * eye at one end of the screen while the number changed at the other. A
 * caption is turned the way everything else on this chart is sized — by
 * taking hold of the thing itself. The handle stands off the top-left
 * corner, exactly where the corner grips stand off their corners, and
 * carries the same round arrow every drawing program puts there.
 *
 * Shift steps in eighths of a turn and rounds to the nearest one, the same
 * modifier and the same set the slider used to offer; a double-click puts
 * the caption back level.
   ------------------------------------------------------------------ */
let nodeRotateState = null;
function beginNodeRotate(ev, n, g){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation();
  ev.preventDefault();
  nodeRotateState = {
    node: n, g,
    cx: n.x + n.w/2, cy: n.y + n.h/2,
    start: n.rot || 0, moved: false,
    startClientX: ev.clientX, startClientY: ev.clientY
  };
  // Where the hand took hold, as an angle about the centre — so the
  // caption turns BY what the hand turns rather than jumping to it.
  const p = clientToWorld(ev.clientX, ev.clientY);
  nodeRotateState.grab = Math.atan2(p.y - nodeRotateState.cy, p.x - nodeRotateState.cx) * 180/Math.PI;
  document.body.classList.add('rotating');
}
function applyNodeRotation(n, g, deg){
  const a = ((Math.round(deg) % 360) + 360) % 360;
  n.rot = a || undefined;
  if(!g) return a;
  const t = a ? `rotate(${a},${(n.x + n.w/2).toFixed(2)},${(n.y + n.h/2).toFixed(2)})` : '';
  if(t){ g.dataset.rotTransform = t; g.setAttribute('transform', t); }
  else { delete g.dataset.rotTransform; g.removeAttribute('transform'); }
  return a;
}
window.addEventListener('mousemove', e=>{
  const st = nodeRotateState;
  if(!st) return;
  if(!st.moved){
    if(Math.hypot(e.clientX - st.startClientX, e.clientY - st.startClientY) < DRAG_THRESHOLD) return;
    st.moved = true;
  }
  const p = clientToWorld(e.clientX, e.clientY);
  const now = Math.atan2(p.y - st.cy, p.x - st.cx) * 180/Math.PI;
  let deg = st.start + (now - st.grab);
  if(e.shiftKey) deg = Math.round(deg / ROT_SNAP) * ROT_SNAP;
  st.at = applyNodeRotation(st.node, st.g, deg);
});
window.addEventListener('mouseup', ()=>{
  const st = nodeRotateState;
  nodeRotateState = null;
  if(!st) return;
  document.body.classList.remove('rotating');
  if(!st.moved) return;
  // The click that ends the drag must not also select or open anything.
  suppressNodeClick = true;
  setTimeout(()=>{ suppressNodeClick = false; }, 0);
  applyEdit(()=>{
    const found = workingEntry(st.node.id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    if(st.at) opts.rot = st.at; else delete opts.rot;
    putEntry(found.index, found.entry, opts);
  });
});

function beginConnectorDrag(ev, n, side, ring, ringColor){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation();
  ev.preventDefault();
  connectorDragState = {
    from: n, fromSide: side, fromRing: ring || 0, color: ringColor || null,
    start: portOnSide(n, side, 0, 1, ring || 0)
  };
  svg.classList.add('connector-dragging');
  // The rubber band wears the colour the finished connector will have.
  rubberBand.setAttribute('stroke', ringColor || 'var(--accent)');
  rubberBand.style.display = '';
}

function connectorDropTarget(clientX, clientY){
  // The rubber band and the handles' own hit circles sit under the cursor;
  // the band is pointer-events:none, and a handle resolves to its node
  // anyway, so closest('.node') gives the right answer either way.
  const el0 = document.elementFromPoint(clientX, clientY);
  const nodeG = el0 && el0.closest && el0.closest('.node');
  if(!nodeG) return null;
  const target = nodes.get(nodeG.dataset.id);
  if(!target) return null;
  const handle = el0.closest('.node-handle');
  const w = clientToWorld(clientX, clientY);
  return {
    node: target,
    side: handle ? handle.dataset.side : nearestSide(target, w.x, w.y),
    ring: handle ? Number(handle.dataset.ring) || 0 : 0,
    handle,
    g: nodeG
  };
}

window.addEventListener('mousemove', e=>{
  if(!connectorDragState) return;
  const st = connectorDragState;
  const w = clientToWorld(e.clientX, e.clientY);
  rubberBand.setAttribute('d', `M${st.start.x},${st.start.y} L${w.x},${w.y}`);
  const hit = connectorDropTarget(e.clientX, e.clientY);
  qNodes('.node.connect-target').forEach(g=>g.classList.remove('connect-target'));
  qNodes('.node-handle.drop-target').forEach(h=>h.classList.remove('drop-target'));
  if(hit && hit.node.id !== st.from.id){
    hit.g.classList.add('connect-target');
    if(hit.handle) hit.handle.classList.add('drop-target');
  }
});

window.addEventListener('mouseup', e=>{
  const st = connectorDragState;
  if(!st) return;
  connectorDragState = null;
  svg.classList.remove('connector-dragging');
  rubberBand.style.display = 'none';
  rubberBand.removeAttribute('d');
  qNodes('.node.connect-target').forEach(g=>g.classList.remove('connect-target'));
  qNodes('.node-handle.drop-target').forEach(h=>h.classList.remove('drop-target'));
  const hit = connectorDropTarget(e.clientX, e.clientY);
  if(!hit) return;                                   // released on empty canvas
  if(hit.node.id === st.from.id) return;             // released back on itself
  connectNodes(st.from.id, hit.node.id, {
    fromSide: st.fromSide, toSide: hit.side,
    fromRing: st.fromRing, toRing: hit.ring,
    color: st.color
  });
});

/* ---------------------------------------------------------------------
   Selection / highlighting / detail panel
   ------------------------------------------------------------------ */
let selectedId = null;
/* Multi-selection. selectedId stays the "primary" one — the entry the
   detail drawer describes and the single-node commands act on — while
   multiSelection holds every id currently picked, including that one. A
   selection of one behaves exactly as it always did. */
/* Everything that fades when one entry is being looked at. The lines
   themselves, an amalgam's bar and its merged arrow all carry `.edge` and
   were always covered; the arrowheads and the beads are their own shapes
   in their own layer and were not, so selecting an entry faded the chart
   around it and left every arrowhead on top at full strength. An amalgam's
   pieces name the entry they merge into but no single source, so a bar is
   lit whenever the entry it feeds is — which is what it means. */
const DIMMABLE_EDGE_PARTS = '.edge, .edge-note, .edge-arrow, .amalgam-bead, .callout-leader';
const multiSelection = new Set();
function isMultiSelected(id){ return multiSelection.has(id); }
/* Which entries and connectors are lit, and which step back.
 *
 * Pulled out of selectNode because the LIVE PREVIEW needs it too. Typing
 * in a label redraws every entry from scratch to show the words as they
 * are typed, and a freshly drawn entry carries no highlight — so the whole
 * chart came back to full strength on every keystroke and dimmed again a
 * moment later when the edit settled. From the outside: the chart flashing
 * at you while you type. */
function paintSelectionHighlight(id){
  const n = nodes.get(id);
  if(!n) return;
  /* A picture or a loose caption belongs to no lineage, so there is
     nothing for it to light and nothing that should step back for it.
   *
     It used to fall through to the arithmetic below, which found it
     related to exactly itself and faded the ENTIRE chart out behind it.
     Nobody saw that from a click, because selectNode returns early for a
     free element and never reaches here — but the live text preview calls
     this directly on every keystroke, so colouring a word in a caption, or
     bolding it, or pressing the reset button, dimmed the whole drawing to
     a ghost until the commit a half-second later redrew it. A flash of
     transparency across the chart, on every press of every formatting
     button. It clears the wash instead, which is also the right answer
     when a free element is selected after an entry that had dimmed
     things. */
  if(isFreeShape(n.shape || '')){
    qNodes('.node').forEach(g=>{
      g.classList.toggle('selected', g.dataset.id === id);
      g.classList.remove('dim');
    });
    auraLayer.querySelectorAll('.node-aura').forEach(g=> g.classList.remove('dim'));
    qEdges(DIMMABLE_EDGE_PARTS).forEach(p=>{ p.classList.remove('lit'); p.classList.remove('dim'); });
    if(typeof paintBioCardDim === 'function') paintBioCardDim();
    syncTagLiveliness();
    return;
  }
  const related = new Set([id]);
  n.parents.forEach(p=>related.add(p));
  n.children.forEach(c=>related.add(c));
  /* A callout is part of the connector it points at.
   *
     Selecting an entry lights the lines that reach it and steps everything
     else back — and a remark ABOUT one of those lines was being stepped
     back with the rest of the chart, so picking an entry faded out the
     very note explaining how it is joined to its neighbour. Whatever is
     lit takes its callouts with it. */
  nodes.forEach(c=>{
    if(!isCalloutNode(c) || !c.leader) return;
    if(c.leader.from === id || c.leader.to === id ||
       (multiSelection.size > 1 && (related.has(c.leader.from) || related.has(c.leader.to)))){
      related.add(c.id);
    }
  });
  /* And it works the other way too: a callout selected lights the
     connector it is a remark about, since that is the only thing on the
     chart it is related to. Without this, clicking a callout faded out
     everything the reader had clicked it to look at. */
  if(isCalloutNode(n) && n.leader){
    related.add(n.leader.from);
    related.add(n.leader.to);
  }
  /* Everything in a multi-selection counts as related. Dimming is about
     the ONE entry being looked at; when a dozen have been picked out with
     a lasso, dimming eleven of them and lighting the twelfth's neighbours
     put the selection highlight underneath the dim wash, and only a few of
     the picked entries looked picked at all. */
  if(multiSelection.size > 1) multiSelection.forEach(x=> related.add(x));

  qNodes('.node').forEach(g=>{
    g.classList.toggle('selected', g.dataset.id===id);
    g.classList.toggle('dim', !related.has(g.dataset.id));
  });
  auraLayer.querySelectorAll('.node-aura').forEach(g=>{
    g.classList.toggle('dim', !related.has(g.dataset.id));
  });
  /* EVERY piece of a connector, not only its line. The arrowheads, the
     ring caps, an amalgam's members, its merged arrow and its beads all
     live in their own layers under their own classes — so selecting an
     entry faded the lines of the chart around it and left every arrowhead
     and every merged bar at full strength on top. */
  /* The leaders live in the connector layer and are found by qEdges, but
     they answer to the callout they belong to as well as to the connector
     they hang off — a leader with its card faded away is a line pointing
     out of nothing. */
  edgeLayer.querySelectorAll('.callout-leader').forEach(g=>{
    const lit = related.has(g.dataset.id);
    g.classList.toggle('lit', lit);
    g.classList.toggle('dim', !lit);
  });
  qEdges(DIMMABLE_EDGE_PARTS).forEach(p=>{
    if(p.classList.contains('callout-leader')) return;
    const src = p.dataset.from, dst = p.dataset.to;
    /* An amalgam's beads and its merged arrow name the entry they feed but
       no single source — the whole point is that they belong to the merge
       rather than to any one lineage. Judged by their source they matched
       nothing and were dimmed away to invisibility while the coloured bar
       around them stayed lit, so selecting a merged construction appeared
       to delete its junctions. They follow the entry they feed instead. */
    /* A callout selected lights the one connector it is about — the two
       entries it joins are in `related` for exactly this. */
    const aboutMe = isCalloutNode(n) && n.leader &&
      src === n.leader.from && dst === n.leader.to;
    const lit = src===id || dst===id || aboutMe ||
      (!src && related.has(dst)) ||
      (multiSelection.size > 1 && related.has(dst) && (!src || related.has(src)));
    p.classList.toggle('lit', lit);
    p.classList.toggle('dim', !lit);
  });
  if(typeof paintBioCardDim === 'function') paintBioCardDim();
  syncTagLiveliness();
}
function paintMultiSelection(){
  qNodes('.node').forEach(g=>{
    g.classList.toggle('multi', multiSelection.size > 1 && multiSelection.has(g.dataset.id));
  });
}
function setSelection(ids, primary){
  multiSelection.clear();
  ids.forEach(id=>{ if(nodes.has(id)) multiSelection.add(id); });
  const first = primary && multiSelection.has(primary) ? primary : multiSelection.values().next().value;
  if(first) selectNode(first);
  else deselect();
  paintMultiSelection();
}
function toggleInSelection(id){
  if(multiSelection.has(id)){
    multiSelection.delete(id);
    if(selectedId === id){
      const next = multiSelection.values().next().value;
      if(next) selectNode(next); else deselect();
    }
  } else {
    multiSelection.add(id);
    selectNode(id);
  }
  paintMultiSelection();
}

// opts.keepEditForm is used by rebuildChart(): re-selecting after an edit
// must not slam the edit form shut, which is what a normal click does.
function selectNode(id, opts){
  selectedId = id;
  const n = nodes.get(id);
  if(!n) return;
  // A picture or a loose block of text has no lineage, no tags and no note
  // — the entry panel would be almost entirely empty for it — so it is
  // selected (draggable, resizable, deletable) without opening one.
  const free = n.shape === 'image' || n.shape === 'textbox';
  if(free){
    /* The entry form belongs to the entry it was opened for, and this is
       no longer that entry — so it closes, exactly as it does when any
       other selection is made.
     *
       It used to return before reaching that, leaving the form open on
       screen showing one entry's fields while `selectedId` had already
       moved to the picture. The next keystroke in the label box committed
       the whole form onto the picture: its archetype and its image URL
       replaced by another entry's label and colours, with the free
       element's own menu open on top at the same time. Two editors, one
       target, and a picture destroyed by typing. */
    if(!(opts && opts.keepEditForm)) closeEditForm();
    if(!(opts && opts.keepSelection)){
      if(!multiSelection.has(id)){ multiSelection.clear(); multiSelection.add(id); }
    }
    /* Through the shared painter, which for a free element marks it
       selected and clears the dim wash — so picking a caption after an
       entry does not leave the rest of the chart faded out behind it. */
    paintSelectionHighlight(id);
    return;
  }
  // A plain selection replaces the set; the multi-select paths add to it
  // themselves before calling in here.
  if(!(opts && opts.keepSelection)){
    if(!multiSelection.has(id)){ multiSelection.clear(); multiSelection.add(id); }
  }
  if(!(opts && opts.keepEditForm) && typeof closeEditForm === 'function') closeEditForm();
  paintSelectionHighlight(id);
  /* A callout says everything it has to say on the card. Opening the entry
     drawer beside it would fill the right-hand third of the screen with a
     title, an empty tag line, an empty note and two empty lineage lists —
     so it is selected, highlighted and carryable, with no drawer. */
  if(opts && opts.quiet){
    document.getElementById('detail').classList.remove('open');
    updateZoomCtlPosition();
    return;
  }

  document.getElementById('detailSwatch').style.background = n.color;
  document.getElementById('detailTitle').innerHTML = inlineToHtml(n.label);
  /* The form is only refilled as it OPENS, so a field shut for one
     archetype has to be reconsidered whenever the selection moves —
     otherwise a picture's shut Label row stayed shut on the next entry. */
  if(typeof syncLabelFieldForShape === 'function') syncLabelFieldForShape(null);
  if(typeof syncBioCardField === 'function' && typeof editShapeInput !== 'undefined'){
    /* The same reconsideration the Label row gets: a field offered for one
       archetype has to be taken away again on the next entry. */
    syncBioCardField({value: n.shape || 'rect'});
  }
  /* A portrait's panel is about the words on its card, so the card is up
     for as long as the panel is. It used to depend on how the entry had
     been reached: clicking the circle opened it, arriving by the search
     box, an undo or the keyboard did not, and the panel then discussed a
     card nobody could see. */
  if((n.shape || '') === 'ellipse') openBioCard(n.id, true);
  else if(bioCardPinned) closeBioCard();
  {
    /* No tags, no line. "Untagged" said nothing an empty row does not say
       already, and it took a strip of the drawer to say it — on a chart
       where most entries carry no tags, every panel opened with a label
       announcing an absence. */
    const line = document.getElementById('detailTags');
    const has = !!(n.tags && n.tags.length);
    line.style.display = has ? '' : 'none';
    line.innerHTML = has
      ? n.tags.map(t=> tagShapeHtml(t, {special: tagIsSpecial(t), why: SPECIAL_TAGS[t]})).join('')
      : '';
  }

  /* Anything still sitting in the typing pause belongs to the entry it was
     written for, not to this one. It is settled before the field is handed
     over — and the field is not reset out from under someone who is still
     writing in it. */
  if(detailNoteEditing && detailNoteOwner && detailNoteOwner !== id) flushDetailNoteCommit();
  if(!(detailNoteEditing && detailNoteOwner === id)) showDetailNote(n.note || '');

  const parentsWrap = document.getElementById('detailParents');
  const childrenWrap = document.getElementById('detailChildren');
  parentsWrap.innerHTML = '<h3>Derives from</h3>';
  childrenWrap.innerHTML = '<h3>Leads to</h3>';

  function addRow(wrap, targetId, note, arrow){
    const t = nodes.get(targetId);
    if(!t) return;
    const row = document.createElement('div');
    row.className='conn-row';
    row.innerHTML = `<div class="conn-arrow">${arrow}</div><div class="conn-text"><span class="conn-label">${inlineToHtml(t.label)}</span>${note?`<div class="conn-note">${escapeHtml(note)}</div>`:''}</div>`;
    row.addEventListener('click',()=>{ selectNode(targetId); flyToNode(targetId); });
    wrap.appendChild(row);
  }
  const edgeLabelFor = (a,b) => { const e = structEdges.find(e=>e.from===a&&e.to===b); return e?e.label:null; };

  if(n.parents.length===0){ parentsWrap.innerHTML += '<div class="conn-empty">Root node</div>'; }
  n.parents.forEach(p=> addRow(parentsWrap, p, edgeLabelFor(p,id), '←'));
  if(n.children.length===0){ childrenWrap.innerHTML += '<div class="conn-empty">No known continuation</div>'; }
  n.children.forEach(c=> addRow(childrenWrap, c, edgeLabelFor(id,c), '→'));

  /* The entry panel describes ONE entry. With several selected there is no
     single subject for it to describe, and it would only be in the way of
     the thing you are actually doing — moving them as a group — so it
     stays shut until the selection narrows back to one. */
  const many = multiSelection.size > 1;
  document.getElementById('detail').classList.toggle('open', !many);
  if(many && typeof closeEditForm === 'function') closeEditForm();
  updateZoomCtlPosition();
}

svg.addEventListener('click', ()=>{
  if(typeof closeFreeMenu === 'function') closeFreeMenu();
  // A finished marquee ends with a click on the canvas, which would
  // otherwise immediately clear the selection it just made.
  if(suppressCanvasClick){ suppressCanvasClick = false; return; }
  closeBioCard();
  deselect();
});
function deselect(){
  selectedId=null;
  multiSelection.clear();
  qNodes('.node.multi').forEach(g=>g.classList.remove('multi'));
  qNodes('.node').forEach(g=>{ g.classList.remove('selected'); g.classList.remove('dim'); });
  auraLayer.querySelectorAll('.node-aura').forEach(g=> g.classList.remove('dim'));
  qEdges(DIMMABLE_EDGE_PARTS).forEach(p=>{ p.classList.remove('lit'); p.classList.remove('dim'); });
  if(typeof paintBioCardDim === 'function') paintBioCardDim();
  syncTagLiveliness();
  document.getElementById('detail').classList.remove('open');
  if(typeof closeEditForm === 'function') closeEditForm();
  /* A picture's or a caption's menu belongs to the element it was opened
     for. With nothing selected there is no such element, and leaving the
     menu up left a live Delete button — and a text field that still
     committed — pointing at something the reader had just let go of. */
  if(typeof closeFreeMenu === 'function') closeFreeMenu();
  updateZoomCtlPosition();
}
document.getElementById('detailClose').onclick = (e)=>{ e.stopPropagation(); deselect(); };

function updateZoomCtlPosition(){
  const open = document.getElementById('detail').classList.contains('open');
  document.getElementById('zoomctl').classList.toggle('shifted', open);
}

/* ---------------------------------------------------------------------
   Legend toggle
   ------------------------------------------------------------------ */
const legendPanel = document.getElementById('legend');

/* One surface at a time from the top bar. Each of these opens from a
   button standing next to the others, so two of them open at once is two
   panels covering each other rather than two things you asked for: opening
   any one of them closes whichever was already up. Looked up by id at call
   time because they are created all over this file. */
const TOOLBAR_SURFACES = ['legend', 'filePopover', 'stickerOverlay', 'addNodeOverlay', 'aboutOverlay'];
function closeToolbarMenus(keep){
  TOOLBAR_SURFACES.forEach(id=>{
    if(id === keep) return;
    const elm = document.getElementById(id);
    if(elm) elm.classList.remove('open');
  });
  if(keep !== 'legend'){
    const c = document.getElementById('coord');
    if(c) c.classList.remove('shifted');
  }
}

document.getElementById('legendToggle').onclick = ()=>{
  const willOpen = !legendPanel.classList.contains('open');
  closeToolbarMenus('legend');
  legendPanel.classList.toggle('open', willOpen);
  document.getElementById('coord').classList.toggle('shifted', willOpen);
};
document.getElementById('legendClose').onclick = ()=> {
  legendPanel.classList.remove('open');
  document.getElementById('coord').classList.remove('shifted');
};

/* ---------------------------------------------------------------------
   Search
   ------------------------------------------------------------------ */
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  if(q.length<2){ searchResults.classList.remove('show'); return; }
  const matches = [];
  nodes.forEach(n=>{ if(stripMarkup(n.label).toLowerCase().includes(q)) matches.push(n); });
  matches.sort((a,b)=>stripMarkup(a.label).length-stripMarkup(b.label).length);
  searchResults.innerHTML='';
  matches.slice(0,30).forEach(n=>{
    const tagsLabel = (n.tags && n.tags.length) ? n.tags.join(', ') : '';
    const row = document.createElement('div');
    row.className='row';
    /* The colour goes in escaped, like everything else here. It comes from
       the chart's data rather than from anything typed in this box, and a
       file brought in from elsewhere is not obliged to have put a real
       colour there at all. */
    row.innerHTML = `<div class="dot" style="background:${escapeHtml(n.color || '')}"></div><div>${inlineToHtml(n.label)}</div><div class="cl">${escapeHtml(tagsLabel)}</div>`;
    row.addEventListener('click', ()=>{
      selectNode(n.id); flyToNode(n.id);
      searchResults.classList.remove('show'); searchInput.value = stripMarkup(n.label);
    });
    searchResults.appendChild(row);
  });
  searchResults.classList.toggle('show', matches.length>0);
});
searchInput.addEventListener('blur', ()=> setTimeout(()=>searchResults.classList.remove('show'),150));
/* Whether the keyboard currently belongs to something being typed in. The
   shortcuts below all defer to it: a key that means "delete the entry" or
   "jump to search" on the chart means the character itself in a field. */
let keyboardOnChart = false;
/* Which kinds of INPUT actually swallow a keystroke. A colour well, a
   checkbox, a radio, a range or a file button hold focus without taking
   any text, and Delete means the chart's Delete while one of them is
   focused, not "erase a character" in a field that has none. */
const TEXT_INPUT_TYPES = new Set(
  ['text','search','url','tel','password','email','number','date','time','month','week']);
function typingInField(){
  const ae = document.activeElement;
  if(!ae) return false;
  // The last press was on the drawing, so the drawing is what the keys mean.
  if(keyboardOnChart) return false;
  if(ae.isContentEditable) return true;
  if(ae.tagName === 'TEXTAREA') return true;
  /* A drop-down is NOT typing.
   *
     A native select keeps focus after a choice is made, and it used to
     count here — so picking Orthogonal from a connector's Path menu and
     then pressing Delete did nothing at all, on a connector whose panel
     was open with its own Delete button sitting in it. Nothing is being
     typed into a list of five words. */
  if(ae.tagName === 'SELECT') return false;
  if(ae.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((ae.type || 'text').toLowerCase());
  return false;
}
/* Who the keyboard belongs to: the drawing, or a field.
 *
 * Picking an entry up calls preventDefault on its mousedown — so the
 * browser never starts selecting text as the entry is carried — and
 * preventDefault on a mousedown also cancels the focus change that press
 * would otherwise have made. So whatever field was last typed in KEPT the
 * keyboard: click into a label, click back onto the chart, press Delete,
 * and nothing happens, because as far as the shortcut could tell you were
 * still typing. That is the Delete key "sometimes stopping".
 *
 * Blurring the field on that press is the obvious answer and the wrong
 * one: a blur commits what was typed, a commit redraws the chart, and the
 * entry under the pointer is replaced between the press and the release —
 * so no click ever completes on it and the press selects nothing. What is
 * actually wanted is not to move the focus but to know where the LAST
 * press was, which is what a reader means by which of the two they are
 * working in. */
document.addEventListener('focusin', ev=>{
  const t = ev.target;
  if(t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')){
    keyboardOnChart = false;
  }
});
document.addEventListener('keydown', e=>{
  // A modal question owns the keyboard while it is up. Without this,
  // Escape closed the panel behind it and Delete deleted the entry behind
  // it, both while the question was still on screen waiting for an answer.
  if(askOverlay.classList.contains('open')) return;
  /* The search shortcut goes by key position too, for the same reason as
     the Ctrl combinations below — and, like them, not while something is
     being typed. It used to check only that the search box itself did not
     have focus, so the first `/` of any URL, path or date typed anywhere
     in the application was swallowed and the rest of the line went into
     the search box. */
  if((e.code==='Slash' || e.key==='/') && !e.ctrlKey && !e.metaKey &&
     document.activeElement!==searchInput && !typingInField()){
    e.preventDefault(); searchInput.focus();
  }
  if(e.key==='Escape'){
    // Same effect as that panel's own close (✕) button — whichever panel
    // is topmost/open gets closed first, most-specific first, so Escape
    // never skips past an open popover straight to deselecting the chart.
    if(nodeEditorTarget){ closeNodeEditor(true); return; }
    if(addNodeOverlay.classList.contains('open')){ addNodeOverlay.classList.remove('open'); return; }
    if(commentsOverlay.classList.contains('open')){ commentsOverlay.classList.remove('open'); return; }
    if(bioCardNodeId){ closeBioCard(); return; }
    if(noteOverlay && noteOverlay.classList.contains('open')){ noteOverlay.classList.remove('open'); return; }
    if(aboutOverlay.classList.contains('open')){ aboutOverlay.classList.remove('open'); return; }
    if(calloutPopover.classList.contains('open')){ closeCalloutPopover(); return; }
    if(edgePopover.classList.contains('open')){ closeEdgePopover(); return; }
    // A picture's or a caption's own menu is a panel like any other, and
    // was the one Escape never reached — so it stayed open, still holding
    // a Delete button, over an element that was no longer selected.
    if(freeMenu.classList.contains('open')){ closeFreeMenu(); return; }
    if(detailEditForm.style.display==='block'){ closeEditForm(); return; }
    if(legendPanel.classList.contains('open')){
      legendPanel.classList.remove('open');
      document.getElementById('coord').classList.remove('shifted');
      return;
    }
    deselect(); searchResults.classList.remove('show'); searchInput.blur();
  }
  if(readOnlyView && (e.key==='Delete' || e.key==='Backspace')) return;
  if(e.key==='Delete' || e.key==='Backspace'){
    // Same effect as clicking that context's own "Delete" button — never
    // hijacked while the user is actually typing (Backspace has to keep
    // erasing text in every field, including these two keys' own textareas).
    if(typingInField()) return;
    /* A callout's own card is open on it, so Delete means that card —
       exactly as it means the connector's when the connector's card is
       open. It reads its own Delete button rather than reaching for
       deleteNodes, so the panel closes with it. */
    if(calloutPopover.classList.contains('open') && calloutTarget){
      e.preventDefault();
      document.getElementById('calloutDelete').click();
      return;
    }
    if(edgePopover.classList.contains('open') && currentEdgeStyleTarget){
      e.preventDefault();
      styleDeleteBtn.click();
      return;
    }
    if(multiSelection.size > 1){
      e.preventDefault();
      deleteNodes(Array.from(multiSelection));
      return;
    }
    if(selectedId){
      e.preventDefault();
      deleteNode(selectedId);
      return;
    }
  }
  // ---- clipboard + undo ------------------------------------------------
  // Same guard as Delete/Backspace above: inside any text field these keys
  // belong to the field, where the browser's own copy/paste/undo is what
  // the user means.
  if(e.ctrlKey || e.metaKey){
    const ae = document.activeElement;
    const typing = ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable);
    if(typing) return;
    /* Read the PHYSICAL key, not the character it produces. On a Cyrillic
       layout Ctrl+C is Ctrl+С — a different character entirely — and every
       shortcut on this page silently stopped working the moment the layout
       changed. `e.code` names the key by its position ("KeyC"), which is
       the same key on every layout, so the shortcuts belong to the keyboard
       rather than to the alphabet. e.key is kept as the fallback for the
       rare input device that reports no code. */
    const key = (/^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : (e.key || '')).toLowerCase();
    // Copy stays available to readers — it only fills the clipboard.
    if(readOnlyView && key !== 'c') return;
    if(key==='c'){
      if(!selectedId) return;
      e.preventDefault();
      if(copySelectedNode() && detailEditForm.style.display==='block') setEditStatus('ok', 'Copied.');
      return;
    }
    if(key==='x'){
      if(!selectedId) return;
      e.preventDefault();
      cutSelectedNode();
      return;
    }
    if(key==='v'){
      e.preventDefault();
      pasteClipboardNode();
      return;
    }
    // Ctrl+Z steps back, Ctrl+Y steps forward again — and Ctrl+Shift+Z as
    // well, because that is the other habit people have for redo.
    if(key==='z'){
      e.preventDefault();
      if(e.shiftKey) redoLastEdit(); else undoLastEdit();
      return;
    }
    if(key==='y'){
      e.preventDefault();
      redoLastEdit();
      return;
    }
    if(key==='s'){
      // The browser's own Ctrl+S would offer to download this page, which
      // is never what's meant on a document that has its own Save.
      e.preventDefault();
      saveNow();
      return;
    }
  }
});

/* ---------------------------------------------------------------------
   Stats + init
   ------------------------------------------------------------------ */
function updateStats(){
  document.getElementById('statNodes').textContent = nodes.size;
  document.getElementById('statEdges').textContent = structEdges.length;
  document.getElementById('statClusters').textContent = allTags.filter(t=>t!==UNTAGGED).length;
}
updateStats();

/* ---------------------------------------------------------------------
   Redraw everything from the working data.

   Called after every edit. Deliberately does NOT touch the viewport — an
   edit shouldn't yank the chart out from under you — and re-selects the
   node you had selected if it still exists, so the drawer doesn't shut
   itself every time you change something in it.
   ------------------------------------------------------------------ */
function rebuildChart(){
  const keepSelected = selectedId;
  buildModel();
  renderNodes();
  redrawEdges();
  buildManagement();
  updateStats();
  applyVisibility();
  // The selection survives a rebuild, minus anything that no longer exists.
  Array.from(multiSelection).forEach(id=>{ if(!nodes.has(id)) multiSelection.delete(id); });
  if(keepSelected && nodes.has(keepSelected)) selectNode(keepSelected, {keepEditForm:true, keepSelection:true});
  else if(keepSelected) deselect();
  paintMultiSelection();
  if(bioCardNodeId && !nodes.has(bioCardNodeId)) closeBioCard();
  else drawBioCard();
}

/* The zoom controls are positioned against whatever part of the canvas the
   panels have left showing, so a window that changes size has to have them
   placed again. This listener was here with an empty body — registered, so
   it read as handled, and doing nothing: resize a window with the
   Management panel open and the controls sat where the old edge used to
   be, under the panel. */
window.addEventListener('resize', ()=> updateZoomCtlPosition());
fitToView();
applyVisibility();

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
const APP_VERSION = '0.9.18';
const APP_NAME = 'Rhizome Project';
const VERSION_LOG = [
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

/* ---------------------------------------------------------------------
   Editing model: local edits, one explicit Save.

   Why this shape rather than continuous autosave: saving here means
   publishing a new version of this very page, and the host then reloads
   the view. That reload is inherent to publishing — it is not something a
   nicer implementation could hide. So Google-Docs-style "save silently as
   you type" would mean reloading the page every few seconds, which is
   strictly worse than saving by hand. Batching instead gives the best of
   both: every edit is instant and local with no reload at all, and the
   single unavoidable reload happens once, when you ask for it.

   Everything on screen is therefore built from workingNodes + EDGE_STYLES
   in memory. An edit mutates those, rebuilds the view, and marks the page
   dirty. Save is the only thing that touches the published document.
   ------------------------------------------------------------------ */
const saveBtn = document.getElementById('saveBtn');

// Undo is now a plain in-memory stack of snapshots — there is no reload to
// survive any more, so it needs no persistence and can be far deeper.
const LOCAL_UNDO_LIMIT = 60;
const undoStack = [];
/* Redo holds the changes undo has walked back past. It is filled only by
   undo and emptied by any fresh edit, which is the rule people already
   expect: step back, step forward again, but the moment you change
   something new the forward branch is gone. */
const redoStack = [];
let savedParts = null;

/* The saved state, kept as four separate strings rather than one.
 *
 * "Is this chart dirty?" is asked after every single edit — every keystroke
 * in a text field included — and it used to be answered by serializing all
 * four regions into one string and comparing it. That is exact, and it stays
 * exact through an undo back to the saved state, which a mutation flag never
 * would; the derived answer is the right design and is kept.
 *
 * What it cost was hidden in the stickers. A sticker is a base64 data URI, so
 * a modest library of forty small images serializes to about a megabyte —
 * measured at 1.24 ms of the 1.39 ms each check took, and a megabyte of
 * garbage per keystroke — to re-confirm bytes that had not changed since the
 * page loaded.
 *
 * The fix is to compare region by region and stop at the first difference,
 * cheapest and likeliest-to-differ first. Editing changes entries, so the
 * first comparison (0.02 ms) almost always settles it and the stickers are
 * never touched. The alternative — an epoch counter bumped wherever STICKERS
 * is written — would be faster still in the clean case, and would quietly
 * start lying the day someone adds a write site and forgets to bump it. This
 * version cannot rot: it has no invariant for a future edit to break. */
/* EVERY region the save writes, and nothing else.
 *
 * This list and writeChart's must agree, and for three regions they did
 * not: references, tag categories and the chart's own settings were saved
 * but never snapshotted. Nothing that touched them counted as a change, so
 * the Save button stayed greyed out reading "Saved", Ctrl+S returned
 * without doing anything, the beforeunload guard stayed quiet, and the
 * work was gone on the next reload. Undo had the mirror of the same hole:
 * deleting a cited reference strips its marks from the labels, and undoing
 * put the marks back while leaving the reference deleted.
 *
 * One list, used by the snapshot, the comparison and the restore, so the
 * three cannot drift apart again. */
const SAVED_REGIONS = [
  {k:'n', get: ()=> workingNodes,  set: v=>{ workingNodes = v; }},
  {k:'e', get: ()=> EDGE_STYLES,   set: v=> refill(EDGE_STYLES, v)},
  {k:'c', get: ()=> COMMENTS,      set: v=> refill(COMMENTS, v)},
  {k:'t', get: ()=> TAG_CATS,      set: v=> refill(TAG_CATS, v)},
  {k:'r', get: ()=> REFS,          set: v=> refill(REFS, v)},
  {k:'g', get: ()=> SETTINGS,      set: v=>{ Object.keys(SETTINGS).forEach(x=> delete SETTINGS[x]);
                                             Object.assign(SETTINGS, v); }},
  // Last, and behind a cheap length check: a library of forty small images
  // serializes to about a megabyte, and re-confirming those bytes on every
  // keystroke was the whole cost this ordering exists to avoid.
  {k:'s', get: ()=> STICKERS,      set: v=>{ refill(STICKERS, v); rebuildStickerMap(); }},
  // Same reasoning as the stickers, and for the same reason it goes last:
  // an embedded clip is the largest single thing this chart can carry.
  {k:'m', get: ()=> MEDIA,         set: v=>{ refill(MEDIA, v); rebuildMediaMap(); }}
];
function snapshotParts(){
  const out = {sn: STICKERS.length, mn: MEDIA.length};
  SAVED_REGIONS.forEach(r=>{ out[r.k] = JSON.stringify(r.get()); });
  return out;
}
function partsDiffer(saved){
  if(!saved) return false;
  /* Cheap exact negative before the expensive one: a sticker added or removed
     changes the count, and no serialization is needed to see it. */
  if(saved.sn !== undefined && saved.sn !== STICKERS.length) return true;
  if(saved.mn !== undefined && saved.mn !== MEDIA.length) return true;
  for(const r of SAVED_REGIONS){
    if(JSON.stringify(r.get()) !== saved[r.k]) return true;
  }
  return false;
}
function takeSnapshot(){ return snapshotParts(); }
function restoreSnapshot(s){
  SAVED_REGIONS.forEach(r=>{
    if(s[r.k] === undefined) return;
    r.set(JSON.parse(s[r.k]));
  });
}
// Dirty is derived, never a flag that can drift: undoing back to exactly
// what was last published correctly leaves nothing to save.
function isDirty(){ return savedParts !== null && partsDiffer(savedParts); }
function refreshSaveUI(){
  const d = isDirty();
  saveBtn.disabled = !d;
  saveBtn.textContent = d ? 'Save' : 'Saved';
  if(d) setSaveState('dirty', 'Unsaved changes');
  else setSaveState(null);
}

// The single wrapper every edit goes through: snapshot for undo, mutate,
// redraw, update the Save button.
function applyEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  rebuildChart();
  refreshSaveUI();
}
// Every edit records where it started, and abandons any forward history.
function pushUndo(){
  undoStack.push(takeSnapshot());
  while(undoStack.length > LOCAL_UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}
// A short message in the top bar, then back to whatever the save state is.
function flashStatus(msg){
  setSaveState('ok', msg);
  setTimeout(refreshSaveUI, 1600);
}
function undoLastEdit(){
  if(!undoStack.length){ setSaveState('ok', 'Nothing to undo'); setTimeout(refreshSaveUI, 1200); return; }
  redoStack.push(takeSnapshot());
  while(redoStack.length > LOCAL_UNDO_LIMIT) redoStack.shift();
  restoreSnapshot(undoStack.pop());
  rebuildChart();
  repaintOpenPanels();
  refreshSaveUI();
}
function redoLastEdit(){
  if(!redoStack.length){ setSaveState('ok', 'Nothing to redo'); setTimeout(refreshSaveUI, 1200); return; }
  undoStack.push(takeSnapshot());
  while(undoStack.length > LOCAL_UNDO_LIMIT) undoStack.shift();
  restoreSnapshot(redoStack.pop());
  rebuildChart();
  repaintOpenPanels();
  refreshSaveUI();
}
/* An undo restores the DATA; anything showing that data has to be told.
   rebuildChart redraws the chart and the Management panel, but the sticker
   library is its own overlay — so undoing a sticker's deletion put the
   sticker back in the chart while the library it was deleted from went on
   showing an empty grid until it was closed and opened again. */
function repaintOpenPanels(){
  if(typeof renderStickerLibrary === 'function' &&
     stickerOverlay && stickerOverlay.classList.contains('open')){
    renderStickerLibrary();
  }
}

function workingIndex(id){ return workingNodes.findIndex(it=>it[0]===id); }
// Node entries are fixed-length tuples; this hands back a padded, mutable
// copy so callers can assign to any slot without worrying about length.
function workingEntry(id){
  const i = workingIndex(id);
  if(i === -1) return null;
  const it = workingNodes[i];
  const out = [];
  for(let k=0;k<7;k++) out[k] = (k < it.length ? it[k] : undefined);
  return {index:i, entry:out};
}
function entryOpts(entry){
  return (entry[6] && typeof entry[6]==='object') ? Object.assign({}, entry[6]) : {};
}
function putEntry(index, entry, opts){
  entry[6] = (opts && Object.keys(opts).length) ? opts : undefined;
  workingNodes[index] = entry;
}

/* Publishing a new version of this page. Only available where a host
   offers it; everywhere else the standalone backend below takes over. */
/* The mirror of ensureFullDocument: the host wraps what it is given in its
   own <!doctype>/<html>/<head>/<body>, so handing it a whole document
   nests one inside the other. */
function ensureFragment(src){
  if(!isFullDocument(src)) return src;
  const mine = ownContent(src);
  if(mine) return mine;
  try{
    const doc = new DOMParser().parseFromString(src, 'text/html');
    return doc.head.innerHTML + '\n' + doc.body.innerHTML;
  }catch(e){ return src; }
}
/* Which shape of page this host wants, once one of them has worked.
 *
 * For most of this chart's life the answer was settled: the artifact host
 * wrapped whatever it was given in its own <!doctype>/<html>/<head>/<body>,
 * so what went back had to be a FRAGMENT or the host would nest one
 * document inside another. That is no longer universally true — a newer
 * runtime refuses anything that does not begin with a doctype — and a page
 * that guesses wrong does not degrade, it simply cannot be saved.
 *
 * So it is not guessed. The first save of a session tries one shape and,
 * if the host complains about the SHAPE of what it was given, tries the
 * other; whichever is accepted is remembered for the rest of the session.
 * Complaints that are not about shape — a conflict, a size, a permission —
 * are passed straight out, because retrying those would be both useless
 * and, in the case of a conflict, actively wrong. */
let publishShape = null;          // 'fragment' | 'document'
/* Errors where trying the other shape is pointless or harmful. */
const PUBLISH_FINAL = new Set(['conflict', 'not_writer', 'not_declared', 'not_granted',
                               'too_large', 'rate_limited', 'read_only_path',
                               'capability_disabled', 'capability_removed']);
async function publishOwnPage(cap, whole){
  const shapes = {
    fragment: ()=> ensureFragment(whole),
    document: ()=> ensureFullDocument(whole)
  };
  const order = publishShape === 'document' ? ['document', 'fragment'] : ['fragment', 'document'];
  let firstError = null;
  for(const name of order){
    let body;
    try{ body = shapes[name](); }catch(e){ if(!firstError) firstError = e; continue; }
    try{
      await cap.publish(body);
      publishShape = name;
      return;
    }catch(e){
      if(!firstError) firstError = e;
      if(PUBLISH_FINAL.has(e && e.code)) throw e;
    }
  }
  throw firstError || new Error('the host refused the page.');
}
async function saveToArtifact(cap){
  const src = await readOwnSource();
  await publishOwnPage(cap, writeChart(src));
  savedParts = snapshotParts();
  saveBtn.textContent = 'Saved';
  setSaveState('busy', 'Saved - reloading...');
  // The host reloads after a publish. If it somehow doesn't, stop
  // claiming to be mid-refresh and say the save itself went through.
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(()=> setSaveState('ok', 'Saved'), 6000);
}

/* What is making this chart big, in one sentence.
 *
 * Almost always the answer is one embedded picture or clip: everything
 * else on this chart is text, and text does not reach a megabyte. Naming
 * the heaviest thing turns "too large" from a dead end into an
 * instruction. */
function heaviestPartOfChart(){
  const items = [];
  (typeof MEDIA !== 'undefined' ? MEDIA : []).forEach(m=>{
    if(m && typeof m.src === 'string') items.push({what:`the figure “${m.name || m.key}”`, n:m.src.length});
  });
  (typeof STICKERS !== 'undefined' ? STICKERS : []).forEach(x=>{
    if(x && typeof x.src === 'string') items.push({what:`the sticker “${x.name || x.key}”`, n:x.src.length});
  });
  workingNodes.forEach(it=>{
    const img = it && it[6] && it[6].image;
    if(typeof img === 'string') items.push({what:`the picture on “${stripMarkup(it[1] || it[0])}”`, n:img.length});
  });
  if(!items.length) return 'the chart itself has grown past what can be published.';
  items.sort((a,b)=> b.n - a.n);
  const mb = (items[0].n / 1048576).toFixed(1);
  return `${items[0].what} alone is about ${mb} MB. Remove or shrink it, then save again;`;
}

/* Saving with no host at all: the chart goes into this browser's storage
   for this document. No reload, because nothing about the page changed —
   only what it will find next time it opens.

   Browser storage is a convenience, not an archive: it belongs to one
   browser on one machine and a cleared cache takes it with it. Export is
   the real save, and the failure message says so rather than pretending
   the work is safe. */
function saveToBrowser(){
  if(!STORAGE_OK) throw new Error('this browser will not let the page store anything. Use Export to keep your work.');
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(chartData()));
  }catch(e){
    const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new Error(full
      ? 'the chart is larger than this browser will store (embedded pictures are the usual reason). Use Export to keep it as a file.'
      : 'could not write to this browser\u2019s storage.');
  }
  savedParts = snapshotParts();
  saveBtn.textContent = 'Saved';
  setSaveState('ok', 'Saved in this browser');
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(refreshSaveUI, 2600);
}

async function saveNow(){
  if(!isDirty()) return;
  const cap = await capArtifactPromise;
  setSaveState('busy', 'Saving...');
  saveBtn.disabled = true;
  try{
    if(cap) await saveToArtifact(cap);
    else saveToBrowser();
  }catch(e){
    const code = e && e.code;
    /* Nothing in this page reloads, so saying it is about to was a
       message describing something that would never happen — and it wore
       the BUSY style, which reads as "in progress" rather than "your work
       is still unsaved". The reader is told what actually happened and
       what to do about it, and the Save button comes back enabled. */
    if(code==='conflict'){
      setSaveState('err', 'Someone else published a newer version — export your copy, then reload');
    }
    else if(isReadOnlyError(e)){
      markReadOnly(isPermanentRefusal(e));
      setSaveState('err', 'This chart is read-only for you');
    }
    /* Say what actually went wrong. "Save failed: request failed" told the
       reader nothing they could act on — and the two failures that really
       happen have very different answers: a chart too big to publish needs
       something taken out of it, a transient host error just needs trying
       again. The code is named either way, so a report of one is
       diagnosable. */
    else if(code === 'too_large'){
      setSaveState('err', 'Too large to publish — ' + heaviestPartOfChart() +
                          ' Export keeps the whole thing as a file.');
    }
    else if(code === 'rate_limited'){
      setSaveState('err', 'Saving too often — wait a moment and press Save again.');
    }
    else {
      setSaveState('err', 'Save failed' + (code ? ` (${code})` : '') + ': ' +
                          (e && e.message ? e.message : 'unknown error'));
    }
    saveBtn.disabled = false;
  }
}
saveBtn.onclick = saveNow;

/* ---------------------------------------------------------------------
   The chart as a file.

   Export is what actually frees this page from any host: it writes the
   current chart back into a complete copy of the document and hands it to
   you as a download. That file is the whole thing — drawing, editor,
   contents — and opens with no server, no account and no runtime. Import
   is the way back in: point it at any Rhizome Project page and this one takes
   on that chart.

   Import reads only the four marked regions, and parses them with a JSON
   reader rather than by running them. A chart file is data someone may
   have sent you; it should not be able to run code just because you opened
   it here.
   ------------------------------------------------------------------ */
const filePopover = document.getElementById('filePopover');
const fileStatusEl = document.getElementById('fileStatus');
const fileImportInput = document.getElementById('fileImportInput');

function setFileStatus(kind, msg){
  fileStatusEl.className = 'editor-status show ' + kind;
  fileStatusEl.textContent = msg;
}
function clearFileStatus(){ fileStatusEl.className = 'editor-status'; fileStatusEl.textContent = ''; }

function chartFileName(){
  const stamp = new Date().toISOString().slice(0,10);
  return `axiom-nexus-${stamp}.html`;
}

/* Handing the viewer a file takes two entirely different routes.
 *
 * Outside claude.ai the page is just a page: a blob URL on an <a download>
 * saves the file, no permission involved. Inside the artifact viewer that
 * link is inert — and inert SILENTLY, with no event to catch, which is the
 * worst possible failure for a Save-your-work button. The viewer mediates
 * file offers through the downloads capability instead, which asks the
 * person before anything is written.
 *
 * So: use the capability when it is there, the link when it is not, and
 * never report a save that may not have happened. */
const capDownloadsPromise = (async()=>{
  if(!HOSTED) return null;
  try{ return (await claude.use('downloads')) || null; }catch(e){ return null; }
})();

function saveViaLink(text, name){
  const url = URL.createObjectURL(new Blob([text], {type:'text/html'}));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 30000);
}

/* The chart's CONTENTS, without the page around them.
 *
 * A full export is the whole application — six hundred kilobytes of
 * drawing code wrapped around a few kilobytes of entries — which is the
 * right thing to keep, and the wrong thing to hand to somebody who is
 * going to rebuild the page anyway. This writes the seven data regions and
 * nothing else, carrying the same markers, so the build step reads it with
 * exactly the same code it reads a full export with.
 *
 * It is small enough to attach to a message, which is the point: it is how
 * work done in the browser gets back to whoever maintains the sources
 * without anyone having to move six hundred kilobytes around. */
function chartDataOnly(){
  const parts = writeChartParts();
  return [
    '/* Rhizome Project — chart contents only.',
    '   Not a page: the entries, connector styles, stickers, tags,',
    '   references and settings, in the form the page stores them.',
    '   Rebuild with:  python3 build.py --pull <this file>',
    '   Or open the chart and use Import, which reads this too. */',
    ''
  ].join('\n') + '\n' + REGION_NAMES.map(name=>
    `/* @@EDIT:${name}:START@@ */\n${parts[name]}\n/* @@EDIT:${name}:END@@ */`
  ).join('\n\n') + '\n';
}
async function exportChartData(){
  clearFileStatus();
  let out, name;
  try{
    out = chartDataOnly();
    name = chartFileName().replace(/\.html?$/i, '') + '-data.js';
  }catch(e){
    setFileStatus('err', 'Export failed: ' + (e && e.message ? e.message : 'unknown error'));
    return;
  }
  const dl = await capDownloadsPromise;
  if(!dl){
    saveViaLink(out, name);
    setFileStatus(HOSTED ? '' : 'ok', HOSTED
      ? 'This copy cannot hand you a file. Open the editable copy and export from there.'
      : 'Exported as ' + name + '.');
    return;
  }
  setFileStatus('', 'Waiting for you to confirm the download\u2026');
  try{
    await dl.save({filename:name, data:out});
    setFileStatus('ok', 'Exported as ' + name + '.');
  }catch(e){
    if(e && e.code === 'declined'){ setFileStatus('', 'Export cancelled.'); return; }
    saveViaLink(out, name);
    setFileStatus('ok', 'Exported as ' + name + '.');
  }
}

async function exportChart(){
  clearFileStatus();
  let out, name;
  try{
    out = ensureFullDocument(writeChart(await readOwnSource()));
    name = chartFileName();
  }catch(e){
    setFileStatus('err', 'Export failed: ' + (e && e.message ? e.message : 'unknown error'));
    return;
  }

  const dl = await capDownloadsPromise;
  if(!dl){
    /* No capability. Off claude.ai that is normal and the link simply works.
       On claude.ai it means this copy was published without the downloads
       capability — the read-only share copy is, deliberately, because
       declaring any capability at all is what stops a page being shared
       publicly. The link is then almost certainly inert, and saying
       "Exported" would be a lie. Try it anyway, since it costs nothing and
       may work, but describe it as an attempt. */
    saveViaLink(out, name);
    setFileStatus(HOSTED ? '' : 'ok', HOSTED
      ? 'This copy of the chart cannot hand you a file: it is published without download permission so that it stays publicly shareable. If no download appeared, open the editable copy and export from there.'
      : 'Exported as ' + name + '.');
    return;
  }

  setFileStatus('', 'Waiting for you to confirm the download\u2026');
  try{
    await dl.save({filename:name, data:out});
    setFileStatus('ok', 'Exported as ' + name + '.');
    return;
  }catch(e){
    const code = e && e.code;
    if(code === 'declined'){ setFileStatus('', 'Export cancelled.'); return; }
    if(code === 'rate_limited'){ setFileStatus('err', 'Another download prompt is still open \u2014 finish that one, then try again.'); return; }
    if(code === 'too_large'){ setFileStatus('err', 'This chart is too large for the viewer to hand over. Open it outside claude.ai and export there.'); return; }
    if(code !== 'rejected_extension' && code !== 'extension_not_enabled'){
      setFileStatus('err', 'Export failed: ' + ((e && e.message) || 'the viewer would not save the file') + '.');
      return;
    }
  }

  /* .html is not in every viewer's allowed set. The contents are what
     matter and they are unchanged, so offer the same bytes under .txt and
     say plainly that it needs renaming — a file the person has to rename
     beats no file at all. */
  const alt = name.replace(/\.html$/i, '') + '.html.txt';
  try{
    await capDownloadsPromise.then(d => d.save({filename:alt, data:out}));
    setFileStatus('ok', 'This viewer will not save .html files, so it saved ' + alt +
                        ' instead. Rename it to ' + name + ' and it will open as the chart.');
  }catch(e2){
    if(e2 && e2.code === 'declined'){ setFileStatus('', 'Export cancelled.'); return; }
    setFileStatus('err', 'This viewer would not save the file. Open the chart outside claude.ai and export there.');
  }
}

/* Pull the four regions out of another Rhizome Project page.

   The regions are JavaScript literals in the file, but they are read here
   as JSON — the two overlap for exactly the shapes this chart stores, and
   a JSON reader cannot execute anything. Anything that is not plain data
   is rejected instead of being run. */
function readRegionArray(src, name){
  const body = extractRegion(src, name);
  if(body === null) return null;
  const open = body.indexOf('[');
  const close = body.lastIndexOf(']');
  if(open === -1 || close < open) return null;
  const literal = jsLiteralToJson(body.slice(open, close+1));
  try{
    const val = JSON.parse(literal);
    return Array.isArray(val) ? val : null;
  }catch(e){ return null; }
}

/* The array literal this file writes, read back as JSON.
 *
 * This used to be four regular expressions run over the whole text, and
 * every one of them reached inside string contents it had no business
 * touching. `key:` -> `"key":` turned a label reading `Hello {{s:cat}}`
 * into `Hello {{"s":cat}}`, destroying the sticker; it quoted the `b:` in
 * an ordinary sentence like `Note: a, b: c`. The un-escaper knew `\'` and
 * `\\` but not `\n`, so every multi-line note came back with a visible
 * backslash-n in it. Import is the ONE path that does not need this page's
 * host to work, which makes silently rewriting the text it imports the
 * worst place in the file for a bug like this.
 *
 * So it is a scanner rather than a search-and-replace: it knows when it is
 * inside a string and when it is not, which is precisely the knowledge the
 * regular expressions lacked. It handles the subset this file emits —
 * strings, numbers, booleans, null, undefined, arrays, objects with bare
 * keys, comments and trailing commas — and nothing else, because nothing
 * else is ever written. */
function jsLiteralToJson(src){
  const isIdStart = c=> /[A-Za-z_$]/.test(c);
  const isIdPart  = c=> /[A-Za-z0-9_$]/.test(c);
  // Pieces, so the trailing-comma pass below can tell a comma in the
  // structure from one inside a string.
  const parts = [];                     // {s:string, str:boolean}
  let i = 0;
  const n = src.length;
  while(i < n){
    const ch = src[i];
    if(ch === "'" || ch === '"'){
      const quote = ch;
      let val = '';
      i++;
      while(i < n && src[i] !== quote){
        if(src[i] === '\\'){
          const e = src[i+1];
          i += 2;
          if(e === 'n') val += '\n';
          else if(e === 'r') val += '\r';
          else if(e === 't') val += '\t';
          else if(e === 'b') val += '\b';
          else if(e === 'f') val += '\f';
          else if(e === 'v') val += '\v';
          else if(e === '0') val += '\0';
          else if(e === 'u'){
            if(src[i] === '{'){
              const end = src.indexOf('}', i);
              val += String.fromCodePoint(parseInt(src.slice(i+1, end), 16) || 0);
              i = end + 1;
            } else { val += String.fromCharCode(parseInt(src.substr(i, 4), 16) || 0); i += 4; }
          }
          else if(e === 'x'){ val += String.fromCharCode(parseInt(src.substr(i, 2), 16) || 0); i += 2; }
          else if(e === '\n'){ /* a line continuation contributes nothing */ }
          else val += e;                 // \' \" \\ and anything else stands for itself
        } else { val += src[i]; i++; }
      }
      i++;                               // the closing quote
      parts.push({s: JSON.stringify(val), str: true});
      continue;
    }
    if(ch === '/' && src[i+1] === '/'){ while(i < n && src[i] !== '\n') i++; continue; }
    if(ch === '/' && src[i+1] === '*'){ const e = src.indexOf('*/', i+2); i = e < 0 ? n : e + 2; continue; }
    if(isIdStart(ch)){
      let j = i;
      while(j < n && isIdPart(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while(k < n && /\s/.test(src[k])) k++;
      if(src[k] === ':'){                // a bare object key, and only there
        parts.push({s: JSON.stringify(word) + ':', str: false});
        i = k + 1;
        continue;
      }
      // The tuple slots that read `undefined` mean "absent"; JSON says null.
      parts.push({s: (word === 'undefined') ? 'null' : word, str: false});
      i = j;
      continue;
    }
    parts.push({s: ch, str: false});
    i++;
  }
  /* Trailing commas, resolved on the pieces rather than on the text: a
     comma inside a string is part of somebody's sentence. */
  for(let a = 0; a < parts.length; a++){
    if(parts[a].str || parts[a].s.trim() !== ',') continue;
    for(let b = a + 1; b < parts.length; b++){
      if(parts[b].str) break;
      const t = parts[b].s.trim();
      if(t === '') continue;
      if(t === ']' || t === '}') parts[a].s = '';
      break;
    }
  }
  return parts.map(x=> x.s).join('');
}

// The same reader, for the one region that holds an object rather than a
// list. Wrapped in brackets so the scanner sees a value in a position it
// understands, then unwrapped.
function readRegionObject(src, name){
  const body = extractRegion(src, name);
  if(body === null) return null;
  const open = body.indexOf('{'), close = body.lastIndexOf('}');
  if(open === -1 || close < open) return null;
  try{
    const val = JSON.parse(jsLiteralToJson('[' + body.slice(open, close+1) + ']'));
    return (Array.isArray(val) && val[0] && typeof val[0] === 'object') ? val[0] : null;
  }catch(e){ return null; }
}
function importChartFromText(text){
  const nodesIn = readRegionArray(text, 'NODES');
  if(!nodesIn || !nodesIn.length){
    throw new Error('that file has no Rhizome Project chart in it.');
  }
  const stylesIn = readRegionArray(text, 'EDGESTYLES') || [];
  const stickersIn = readRegionArray(text, 'STICKERS') || [];
  const mediaIn = sanitizeMedia(readRegionArray(text, 'MEDIA') || []);
  const commentsIn = readRegionArray(text, 'COMMENTS') || [];
  /* Older exports predate categories and simply have no such region. That
     is not a broken file — it is a chart with no categories — so it reads
     as an empty list rather than refusing the import. */
  const catsIn = sanitizeTagCats(readRegionArray(text, 'TAGCATS') || []);
  const refsIn = sanitizeRefs(readRegionArray(text, 'REFS') || []);
  /* And the chart's own settings, which import used to skip — so a chart
     brought in from a file quietly kept the OPEN chart's citation colour
     and lost its own. */
  const settingsIn = readRegionObject(text, 'SETTINGS');
  // Validate before replacing anything, so a bad file leaves the open
  // chart untouched rather than half-overwritten.
  validateNodes(nodesIn);
  applyEdit(()=>{
    workingNodes = nodesIn;
    refill(EDGE_STYLES, stylesIn);
    refill(STICKERS, stickersIn);
    refill(MEDIA, mediaIn);
    refill(COMMENTS, commentsIn);
    refill(TAG_CATS, catsIn);
    refill(REFS, refsIn);
    if(settingsIn && typeof settingsIn.refColor === 'string' &&
       /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(settingsIn.refColor)){
      SETTINGS.refColor = settingsIn.refColor;
    }
    rebuildStickerMap();
    rebuildMediaMap();
  });
  return nodesIn.length;
}

fileImportInput.addEventListener('change', ()=>{
  const file = fileImportInput.files && fileImportInput.files[0];
  fileImportInput.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onerror = ()=> setFileStatus('err', 'Could not read that file.');
  reader.onload = ()=>{
    try{
      /* A read-only viewer's applyEdit is a no-op, so the import silently
         did nothing while this line congratulated them on it. */
      if(readOnlyView){
        setFileStatus('err', 'This copy is read-only, so nothing was imported.');
        return;
      }
      const n = importChartFromText(String(reader.result));
      setFileStatus('ok', `Imported ${n} ${n === 1 ? 'entry' : 'entries'}. Press Save to keep it.`);
    }catch(e){
      setFileStatus('err', 'Import failed: ' + (e && e.message ? e.message : 'unknown error'));
    }
  };
  reader.readAsText(file);
});

/* Whether Export can deliver anything is knowable before the button is
   pressed, so it is settled before the button is offered. On the read-only
   share copy — published with no capabilities at all, so that it stays
   publicly shareable — nothing can hand the viewer a file, and a button
   that explains its own failure after the click is worse than a button
   that was never live. Resolved once, on first open of the panel. */
let exportGateDone = false;
async function gateExport(){
  if(exportGateDone) return;
  exportGateDone = true;
  if(!HOSTED) return;
  const btn = document.getElementById('fileExport');
  if(!btn) return;
  if(await capDownloadsPromise) return;
  btn.disabled = true;
  btn.title = 'This copy cannot hand you a file.';
  const note = document.getElementById('fileWhere');
  if(note) note.textContent = note.textContent +
    ' This copy cannot save a file to your computer \u2014 it is published without download permission so that it stays publicly shareable.';
}
function describeWhereItSaves(){
  const el = document.getElementById('fileWhere');
  if(!el) return;
  el.textContent = HOSTED
    ? 'Save publishes a new version of this page on claude.ai.'
    : (STORAGE_OK
        ? 'Save keeps this chart in this browser, for this file. Export to move it anywhere else.'
        : 'This browser will not let the page store anything, so Export is the only way to keep your work.');
}

document.getElementById('fileToggle').onclick = ()=>{
  const willOpen = !filePopover.classList.contains('open');
  closeToolbarMenus('filePopover');
  clearFileStatus();
  describeWhereItSaves();
  gateExport();
  const forget = document.getElementById('fileForget');
  forget.style.display = (!HOSTED && STORAGE_OK && readStoredChart()) ? '' : 'none';
  filePopover.classList.toggle('open', willOpen);
};
document.getElementById('fileClose').onclick = ()=> filePopover.classList.remove('open');
filePopover.addEventListener('click', ev=> ev.stopPropagation());
document.getElementById('fileExport').onclick = (ev)=>{ ev.stopPropagation(); exportChart(); };
document.getElementById('fileExportData').onclick = (ev)=>{ ev.stopPropagation(); exportChartData(); };
document.getElementById('fileImport').onclick = (ev)=>{ ev.stopPropagation(); fileImportInput.click(); };
document.getElementById('fileForget').onclick = (ev)=>{
  ev.stopPropagation();
  try{ localStorage.removeItem(STORE_KEY); }catch(e){}
  setFileStatus('ok', 'Forgotten. Reload to go back to what is in the file itself.');
};

/* ---------------------------------------------------------------------
   Who may edit.

   Write access is decided by the platform, not by this page: publishing
   runs with the viewer's own authority, and a viewer without write access
   is rejected with not_writer / not_granted no matter what the page does.
   So this is not a lock — it can't be picked, because there is nothing
   here to pick. It is the page telling the truth about a permission it
   does not control: once the platform has refused a write, every control
   that writes is hidden and the chart becomes a reader.

   There is no way to ask in advance without attempting a write (which
   would mint a version), so the first refusal is the signal — exactly
   what the capability's own guidance prescribes. The answer is then
   remembered per artifact, so a reader never sees editing controls again
   after their first visit. The owner is never refused and so never
   notices any of this.
   ------------------------------------------------------------------ */
/* Keyed per document. It used to be one flag for the whole origin, so
   being a reader of one chart could make every other chart on the same
   origin look read-only too. */
const READONLY_KEY = 'axiomNexus.readOnly:' + (location.pathname || 'default');
/* `sticky` is false for refusals that may not be about permission at all.
   The old code remembered EVERY refusal forever, so one transient failure
   — a consent prompt dismissed, a capability that failed to load — locked
   this browser out of editing permanently, with no way back. Only a plain
   "you are not a writer" is worth remembering. */
function markReadOnly(sticky){
  if(readOnlyView) return;
  readOnlyView = true;
  document.body.classList.add('read-only');
  if(sticky){ try{ localStorage.setItem(READONLY_KEY, '1'); }catch(e){} }
  setSaveState(null);
  // This can run during load (from the remembered answer below), before
  // the panels it tidies up have been declared — nothing is open that
  // early anyway, so each one is attempted separately and skipped if it
  // isn't there yet.
  try{ closeEditForm(); }catch(e){}
  try{ closeEdgePopover(); }catch(e){}
}
function isReadOnlyError(e){
  const code = e && e.code;
  return code === 'not_writer' || code === 'not_granted' ||
         code === 'not_declared' || code === 'consent_required';
}
// Only these two actually mean "this viewer may not write".
function isPermanentRefusal(e){
  const code = e && e.code;
  return code === 'not_writer' || code === 'not_granted';
}
/* Remembered read-only applies only where a host decides who may write.
   Off-platform there is no such authority — the page saves into this
   browser — so a flag left over from a hosted visit must not follow the
   file onto a disk and make it look frozen. */
if(HOSTED){
  try{ if(localStorage.getItem(READONLY_KEY) === '1') markReadOnly(true); }catch(e){}
}

// Comments panel.
/* ---------------------------------------------------------------------
   Suggestions.

   Every suggestion is signed with a name and labelled as a correction, an
   addition or a deletion, and the owner can relabel, resolve or remove any
   of them. They are stored with the chart and published by the same Save
   button as the drawing.

   One thing this panel cannot do, and says so plainly rather than
   pretending otherwise: a reader without edit access cannot post into the
   list. Writing to this page means publishing a new version of it, and the
   platform only lets its owner and editors do that — no arrangement of
   code here can change that, because the refusal happens on the server
   side of the publish, not in this page. So a read-only reader gets the
   next best thing: the same form, and a button that hands them their
   suggestion already signed and labelled, ready to paste into the comment
   thread the viewer keeps beside this page. The owner can then post it
   into the list with one paste of their own.
   ------------------------------------------------------------------ */
const SUGGESTIONS_ENABLED = false;
const commentsOverlay = document.getElementById('commentsOverlay');
const commentNick = document.getElementById('commentNick');
const commentKind = document.getElementById('commentStatus');
const commentText = document.getElementById('commentText');
const commentList = document.getElementById('commentList');
const commentMsgEl = document.getElementById('commentStatusMsg');
const COMMENT_KINDS = ['correction','addition','deletion'];
const COMMENT_NICK_KEY = 'axiomNexus.nick';
let commentFilter = 'open';

function setCommentMsg(kind, msg){
  commentMsgEl.className = 'editor-status show ' + kind;
  commentMsgEl.textContent = msg;
}
function clearCommentMsg(){ commentMsgEl.className = 'editor-status'; commentMsgEl.textContent = ''; }

function applyCommentEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  renderComments();
  refreshSaveUI();
}

// A stable-enough id without a clock the page can rely on being unique.
function newCommentId(){
  let id, n = 0;
  const taken = new Set(COMMENTS.map(c=>c.id));
  do { id = 'c' + (Date.now().toString(36)) + (n ? '-' + n : ''); n++; } while(taken.has(id));
  return id;
}
function todayStamp(){
  const d = new Date();
  const p = v=> String(v).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function readComposer(){
  const nick = commentNick.value.trim();
  const text = commentText.value.trim();
  const kind = COMMENT_KINDS.includes(commentKind.value) ? commentKind.value : 'correction';
  if(!nick){ setCommentMsg('err', 'Sign it with a name first — the owner needs to know who a suggestion came from.'); return null; }
  if(!text){ setCommentMsg('err', 'Say what should change.'); return null; }
  try{ localStorage.setItem(COMMENT_NICK_KEY, nick); }catch(e){}
  return {nick, text, kind};
}

/* The same bargain as the rich fields: Enter posts, Shift+Enter breaks the
   line. A plain textarea answers Enter with a newline of its own, so the
   default has to be taken away before the button is pressed. */
commentText.addEventListener('keydown', ev=>{
  if(ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
  ev.preventDefault();
  const btn = document.getElementById('commentSubmit');
  commentText.blur();
  if(btn && !btn.disabled) btn.click();
});
document.getElementById('commentSubmit').onclick = ()=>{
  clearCommentMsg();
  const c = readComposer();
  if(!c) return;
  applyCommentEdit(()=>{
    COMMENTS.unshift({id:newCommentId(), nick:c.nick, kind:c.kind, at:todayStamp(), text:c.text});
  });
  commentText.value = '';
  commentFilter = 'open';
  paintCommentFilter();
  renderComments();
  setCommentMsg('ok', 'Added — press Save in the top bar to publish it with the chart.');
};

document.getElementById('commentCopy').onclick = async ()=>{
  clearCommentMsg();
  const c = readComposer();
  if(!c) return;
  const block = `[${c.kind.toUpperCase()}] ${c.nick}\n\n${c.text}`;
  try{
    await navigator.clipboard.writeText(block);
    setCommentMsg('ok', 'Copied. Paste it into the comment thread in the viewer around this page.');
  }catch(e){
    // Clipboard access can be refused inside the sandboxed frame; falling
    // back to selecting the text is better than a dead button.
    commentText.value = block;
    commentText.focus(); commentText.select();
    setCommentMsg('ok', 'Selected below — copy it and paste it into the comment thread in the viewer around this page.');
  }
};

function paintCommentFilter(){
  document.querySelectorAll('#commentFilter .editor-btn').forEach(b=>{
    b.classList.toggle('on', b.dataset.filter === commentFilter);
  });
}
document.querySelectorAll('#commentFilter .editor-btn').forEach(b=>{
  b.addEventListener('click', ()=>{ commentFilter = b.dataset.filter; paintCommentFilter(); renderComments(); });
});

function renderComments(){
  commentList.innerHTML = '';
  const shown = COMMENTS.filter(c=>
    commentFilter === 'all' ? true : commentFilter === 'done' ? !!c.done : !c.done);
  if(!shown.length){
    const p = document.createElement('div');
    p.className = 'comment-empty';
    p.textContent = commentFilter === 'done'
      ? 'Nothing resolved yet.'
      : COMMENTS.length ? 'Nothing open — everything here has been resolved.' : 'No suggestions yet.';
    commentList.appendChild(p);
    return;
  }
  shown.forEach(c=>{
    const item = document.createElement('div');
    item.className = 'comment-item k-' + (COMMENT_KINDS.includes(c.kind) ? c.kind : 'correction') + (c.done ? ' done' : '');

    const head = document.createElement('div');
    head.className = 'comment-head';
    const who = document.createElement('span');
    who.className = 'comment-who'; who.textContent = c.nick || 'anonymous';
    const kind = document.createElement('span');
    kind.className = 'comment-kind'; kind.textContent = c.kind || 'correction';
    const when = document.createElement('span');
    when.textContent = c.at || '';
    head.append(who, kind, when);
    if(c.done){
      const done = document.createElement('span');
      done.textContent = '· resolved';
      head.appendChild(done);
    }

    const body = document.createElement('div');
    body.className = 'comment-body';
    body.textContent = c.text || '';

    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const sel = document.createElement('select');
    COMMENT_KINDS.forEach(k=>{
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
    sel.value = COMMENT_KINDS.includes(c.kind) ? c.kind : 'correction';
    sel.title = 'Relabel this suggestion';
    sel.addEventListener('change', ()=>{
      applyCommentEdit(()=>{ const t = COMMENTS.find(x=>x.id===c.id); if(t) t.kind = sel.value; });
    });
    const resolve = document.createElement('button');
    resolve.type = 'button'; resolve.className = 'editor-btn';
    resolve.textContent = c.done ? 'Reopen' : 'Resolve';
    resolve.onclick = ()=>{
      applyCommentEdit(()=>{
        const t = COMMENTS.find(x=>x.id===c.id);
        if(t){ if(t.done) delete t.done; else t.done = true; }
      });
    };
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'editor-btn';
    del.textContent = 'Delete';
    del.onclick = ()=>{
      applyCommentEdit(()=>{
        const i = COMMENTS.findIndex(x=>x.id===c.id);
        if(i>=0) COMMENTS.splice(i,1);
      });
    };
    actions.append(sel, resolve, del);
    item.append(head, body, actions);
    commentList.appendChild(item);
  });
}

document.getElementById('commentsToggle').onclick = ()=>{
  if(!SUGGESTIONS_ENABLED) return;
  clearCommentMsg();
  try{
    const saved = localStorage.getItem(COMMENT_NICK_KEY);
    if(saved && !commentNick.value) commentNick.value = saved;
  }catch(e){}
  paintCommentFilter();
  renderComments();
  commentsOverlay.classList.add('open');
};
document.getElementById('commentsClose').onclick = ()=> commentsOverlay.classList.remove('open');
commentsOverlay.addEventListener('click', e=>{ if(e.target===commentsOverlay) commentsOverlay.classList.remove('open'); });

// The baseline everything is compared against: whatever the page was
// carrying when it loaded. Set once, and again after each successful save.
savedParts = snapshotParts();
refreshSaveUI();

// Leaving with unsaved work should ask first - everything lives in this
// tab until Save, so a stray refresh would otherwise take it all.
window.addEventListener('beforeunload', e=>{
  if(!isDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

/* ---------------------------------------------------------------------
   Clipboard (Ctrl+C / Ctrl+X / Ctrl+V).

   Also localStorage-backed, for the same reason as the undo stack: a cut
   publishes (and so reloads) before the paste ever happens, so an
   in-memory clipboard would always be empty by the time it was needed.

   A copied node carries its own look and content but not its connections —
   the same as duplicating a shape in any drawing tool. It's pasted as a
   free-standing entry with a fresh id, hand-placed a step down-right of
   the original so it lands visibly beside what it was copied from rather
   than wherever the auto-layout would have put a new orphan.
   ------------------------------------------------------------------ */
const CLIP_KEY = 'axiomNexus.clipboard';
function writeClipboard(payload){
  try{ localStorage.setItem(CLIP_KEY, JSON.stringify(payload)); }catch(e){}
}
function readClipboard(){
  try{ const raw = localStorage.getItem(CLIP_KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function validateNodes(val){
  if(!Array.isArray(val) || val.length===0) throw new Error('must be a non-empty array of node entries.');
  const ids = new Set();
  val.forEach((it,j)=>{
    if(!Array.isArray(it) || it.length<2 || typeof it[0]!=='string' || typeof it[1]!=='string'){
      throw new Error(`node #${j+1} needs at least [id, label] (both strings).`);
    }
    if(ids.has(it[0])) throw new Error(`duplicate node id "${it[0]}".`);
    ids.add(it[0]);
    const parent = it[2];
    if(parent!==undefined && parent!==null && typeof parent!=='string' &&
       !(Array.isArray(parent) && parent.every(p=>typeof p==='string'))){
      throw new Error(`node "${it[0]}": parent must be a string, an array of strings, or omitted.`);
    }
    const opts = it[6];
    if(opts!==undefined && opts!==null){
      if(typeof opts!=='object') throw new Error(`node "${it[0]}": opts must be an object.`);
      if(opts.link!==undefined && typeof opts.link!=='string') throw new Error(`node "${it[0]}": opts.link must be a string.`);
      if(opts.colors!==undefined && !(Array.isArray(opts.colors) && opts.colors.every(c=>typeof c==='string'))) throw new Error(`node "${it[0]}": opts.colors must be an array of strings.`);
      if(opts.bg!==undefined && !(Array.isArray(opts.bg) && opts.bg.every(c=>typeof c==='string'))) throw new Error(`node "${it[0]}": opts.bg must be an array of strings.`);
      if(opts.border!==undefined && !(typeof opts.border==='string' && BORDER_STYLES[opts.border])) throw new Error(`node "${it[0]}": opts.border must be one of ${Object.keys(BORDER_STYLES).join(', ')}.`);
      if(opts.tags!==undefined && !(Array.isArray(opts.tags) && opts.tags.every(t=>typeof t==='string'))) throw new Error(`node "${it[0]}": opts.tags must be an array of strings.`);
      if(opts.font!==undefined && typeof opts.font!=='string') throw new Error(`node "${it[0]}": opts.font must be a string.`);
      if(opts.fontSize!==undefined && typeof opts.fontSize!=='number') throw new Error(`node "${it[0]}": opts.fontSize must be a number.`);
      if(opts.image!==undefined && typeof opts.image!=='string') throw new Error(`node "${it[0]}": opts.image must be a string.`);
      if(opts.size!==undefined && !(Array.isArray(opts.size) && opts.size.length===2 && opts.size.every(v=>typeof v==='number' && Number.isFinite(v)))){
        throw new Error(`node "${it[0]}": opts.size must be a [w, h] pair of numbers.`);
      }
      if(opts.multiLang!==undefined && typeof opts.multiLang!=='boolean') throw new Error(`node "${it[0]}": opts.multiLang must be a boolean.`);
      if(opts.pos!==undefined && !(Array.isArray(opts.pos) && opts.pos.length===2 && opts.pos.every(v=>typeof v==='number' && Number.isFinite(v)))){
        throw new Error(`node "${it[0]}": opts.pos must be a [x, y] pair of numbers.`);
      }
      if(opts.langTabs!==undefined){
        if(!Array.isArray(opts.langTabs) || !opts.langTabs.every(t=>t && typeof t==='object' && typeof t.tag==='string' && typeof t.text==='string')){
          throw new Error(`node "${it[0]}": opts.langTabs must be an array of {tag, text} string pairs.`);
        }
      }
    }
  });
}
/* ---------------------------------------------------------------------
   Pretty-printer for NODES — turns a parsed NODES value back into the
   same style of JS source the hand-written region uses. Used by the
   per-node quick-edit below to save a single item's change without
   requiring the user to open the raw-text editor.
   ------------------------------------------------------------------ */
// Newlines have to be escaped, not emitted raw: a JavaScript string
// literal cannot span lines, and both labels and suggestions can contain
// them. U+2028/2029 are line terminators to a JS parser too.
/* A string, as JavaScript source, safe to sit inside this page's own
   script element.
 *
 * The chart is saved by rewriting regions of the document it is running
 * in, and those regions live inside a script element. An HTML parser ends
 * that element at the first closing script tag it sees, wherever it
 * appears — including in the middle of a string literal. So an entry
 * whose label happened to contain one published a page whose script
 * stopped halfway through the data: not a corrupted chart but an
 * unopenable one, with no way back in to fix it.
 *
 * Escaping "<" as \x3c costs nothing — the parsed string is identical —
 * and no sequence of characters a reader can type can close the element
 * any more. (This comment cannot contain the tag it is about, for exactly
 * the reason it describes.) */
function jsStr(s){
  return "'" + String(s)
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/</g,'\\x3c')
    .replace(/\n/g,'\\n')
    .replace(/\r/g,'\\r')
    .replace(/\u2028/g,'\\u2028')
    .replace(/\u2029/g,'\\u2029') + "'";
}
function jsVal(v){
  if(v===null || v===undefined) return 'null';
  if(typeof v==='string') return jsStr(v);
  if(typeof v==='number' || typeof v==='boolean') return String(v);
  if(Array.isArray(v)) return '[' + v.map(jsVal).join(', ') + ']';
  if(typeof v==='object'){
    const keys = Object.keys(v).filter(k=>v[k]!==undefined);
    return '{' + keys.map(k=>`${k}:${jsVal(v[k])}`).join(', ') + '}';
  }
  return JSON.stringify(v);
}
function serializeItem(it){
  const arr = it.slice();
  while(arr.length && arr[arr.length-1]===undefined) arr.pop();
  return '[' + arr.map(x => x===undefined ? 'undefined' : jsVal(x)).join(', ') + ']';
}
function serializeNodes(nodesVal){
  let out = 'const NODES = [\n';
  nodesVal.forEach(it=>{ out += '  ' + serializeItem(it) + ',\n'; });
  out += '];';
  return out;
}

/* ---------------------------------------------------------------------
   Per-node quick edit — click the ✎ in the detail drawer to edit that
   entry's label/note/link/border colors/tags/font in place, without
   opening the full raw-text editor. Saves straight to the live page by
   re-parsing the live NODES region, patching just this one item, and
   publishing.
   ------------------------------------------------------------------ */
const detailEditToggle = document.getElementById('detailEditToggle');
const detailEditForm = document.getElementById('detailEditForm');
/* The note belongs to the entry's own panel, not to its settings.
 *
 * It used to sit below the settings form and stay on screen while that form
 * was open, which put a second, differently-shaped editor — its own toolbar,
 * its own Apply button — inside a form where every other control commits by
 * itself. Two editing idioms in one panel, and the note visually captured by
 * a form it was never part of. It is hidden while settings are open and
 * comes back when they close; nothing about the note itself changed. */
const detailNoteBlock = document.getElementById('detailNoteBlock');
function showNoteBlock(on){ if(detailNoteBlock) detailNoteBlock.style.display = on ? '' : 'none'; }
const editLabelInput = document.getElementById('editLabelInput');
const editLinkInput = document.getElementById('editLinkInput');
const editColorsInput = document.getElementById('editColorsInput');
/* Back to the default outline. Emptying the field by hand did this
   already, but only if you knew that an empty field meant "the default"
   rather than "no border at all" — and the field refills itself with the
   resolved hex the moment it commits, so the emptying looked as though it
   had not taken. One button that says what it does. */
{
  const reset = document.getElementById('editColorsReset');
  /* An entry with no colours of its own has nothing to put back, so the
     button is a control that cannot act rather than one that pretends to.
     Pressed anyway it wrote the same absence again — an edit that changed
     nothing, marked the chart unsaved and cost a step of undo to discover
     that it had done so. */
  function syncColorsResetState(){
    if(!reset) return;
    reset.disabled = !editColorsInput.value.trim();
    reset.title = reset.disabled
      ? 'These borders are already the default'
      : 'Back to the default outline';
  }
  if(reset){
    reset.addEventListener('click', ev=>{
      ev.stopPropagation();
      if(!editColorsInput.value.trim()) return;
      editColorsInput.value = '';
      editColorsInput.dispatchEvent(new Event('input', {bubbles:true}));
      if(typeof paintEditSwatches === 'function') paintEditSwatches();
      flushNodeEditCommit();
      syncColorsResetState();
    });
    editColorsInput.addEventListener('input', syncColorsResetState);
    window.syncColorsResetState = syncColorsResetState;
  }
}
const editShapeInput = document.getElementById('editShapeInput');
const editBgInput = document.getElementById('editBgInput');
// Which side a portrait's card hangs on — see bioSideOf.
const editBioSide = makeChoiceGroup('editBioSide', ()=>{ queueNodeEditCommit(0); });
/* An entry's border style, picked rather than typed — the same six the
   connectors offer, drawn as the lines they are. Declared here beside the
   colour fields it belongs with; makeChoiceGroup is a function declaration
   further down the file and is hoisted. */
const editBorderStyle = makeChoiceGroup('editBorderStyle', ()=>{
  queueNodeEditCommit(0);
});
const editTagsInput = document.getElementById('editTagsInput');
const editFontInput = document.getElementById('editFontInput');
const editFontSizeInput = document.getElementById('editFontSizeInput');
const editFontMirror = document.getElementById('editFontMirror');
const editFontSizeMirror = document.getElementById('editFontSizeMirror');
linkMirroredControl(editFontInput, editFontMirror);
linkMirroredControl(editFontSizeInput, editFontSizeMirror);
const editCardCheck = document.getElementById('editCardCheck');
const editCardField = document.getElementById('editCardField');
/* Card layout only means something for an entry that IS a box. A character
   bio is a portrait circle and the free-standing elements are a bare
   picture and a bare line of text — none of them has anything to divide
   into bands, so the switch is taken away rather than left there to do
   nothing. */
const CARD_CAPABLE = new Set(['rect','amalgam']);
/* Whether the entry was on card layout when the form was opened, kept
   apart from the checkbox.
 *
 * Some archetypes cannot carry a card, so the field is taken away for
 * them — and clearing the checkbox while it was hidden turned a passing
 * look at another archetype into a decision: choose ellipse, change your
 * mind, choose rect again, and the card layout was gone with nothing on
 * screen to say so. The choice is only lost when the entry is actually
 * left on an archetype that cannot hold it. */
let cardWanted = false;
function syncCardFieldVisibility(){
  const shape = editShapeInput.value || 'rect';
  const ok = CARD_CAPABLE.has(shape);
  editCardField.style.display = ok ? '' : 'none';
  editCardCheck.checked = ok && cardWanted;
}
function setTextColorControls(target, on){
  document.querySelectorAll(`[data-hex-for="${target}"], [data-hex-reset="${target}"]`)
    .forEach(elm=>{ elm.hidden = !on; });
}
function syncTextColorVisibility(){
  /* An amalgam paints its own text and offers no say in it: it wears the
     gradient of the lineages that merged into it — the same reason it has
     no border colour field either. A hand-set colour there is a second,
     contradictory answer to a question the merge has already settled.
   *
     A mirror reality used to be the other case, since its fill was its
     border and its ink was picked for contrast against that. It is not an
     archetype any more, and a background is now something any entry may
     have — so the colour control stays and readableOn steps in only where
     the ink would actually be lost. */
  const shape = editShapeInput.value || 'rect';
  const on = shape !== 'amalgam';
  ['editLabelInput', '__editLangTabs__', 'detailNoteInput'].forEach(t=> setTextColorControls(t, on));
}
/* An amalgam has no border colour of its own to set: it wears the colours
   of the lineages that merged into it, and a field offering a second
   answer to that question could only ever disagree with the bar. */
function syncColorFieldVisibility(){
  const field = document.getElementById('editColorsField');
  if(field) field.hidden = (editShapeInput.value || 'rect') === 'amalgam';
}
const editMultiLangCheck = document.getElementById('editMultiLangCheck');
const editLangTabsField = document.getElementById('editLangTabsField');
const editLangTabList = document.getElementById('editLangTabList');
document.getElementById('editLangTabAdd').onclick = (ev)=>{ ev.stopPropagation(); makeLangTabRow(editLangTabList, null); };
const detailEditStatusEl = document.getElementById('detailEditStatus');
editMultiLangCheck.addEventListener('change', ()=>{
  editLangTabsField.style.display = editMultiLangCheck.checked ? '' : 'none';
});

// Shared by the detail-edit form and the Add Node form — both offer the
// same curated font list.
function populateFontOptions(selectEl){
  selectEl.innerHTML = '';
  FONT_OPTIONS.forEach(f=>{
    const opt = document.createElement('option');
    opt.value = f.key; opt.textContent = f.label;
    selectEl.appendChild(opt);
  });
}

/* ---------------------------------------------------------------------
   Font family/size appear in two toolbars per form — above the Label box
   and above the language-tabs box — because you shouldn't have to scroll
   back up to change the typeface of the text you're currently editing.
   There is still only ONE font per node, so the second pair are mirrors:
   editing either writes to both, and the save logic keeps reading the
   primary pair alone and never has to know the mirrors exist.
   ------------------------------------------------------------------ */
function linkMirroredControl(primary, mirror){
  if(!primary || !mirror) return;
  const copy = (from, to)=>{ if(to.value !== from.value) to.value = from.value; };
  primary.addEventListener('input', ()=>copy(primary, mirror));
  primary.addEventListener('change', ()=>copy(primary, mirror));
  mirror.addEventListener('input', ()=>copy(mirror, primary));
  mirror.addEventListener('change', ()=>copy(mirror, primary));
}
// Called whenever a form is (re)populated, to bring the mirrors in line
// with the values just written into the primaries.
function syncFontMirrors(primarySel, mirrorSel, primaryNum, mirrorNum){
  if(mirrorSel){ populateFontOptions(mirrorSel); mirrorSel.value = primarySel.value; }
  if(mirrorNum) mirrorNum.value = primaryNum.value;
}
function parseTagsField(raw){
  return raw.trim() ? raw.split(',').map(s=>s.trim()).filter(Boolean) : [];
}
/* ---------------------------------------------------------------------
   Language-tab editor.

   One row per tab: a short tag on the left, the tab's own text on the
   right, and a button to drop the row. "+ Add tab" appends an empty one.
   The text side is a formatting-capable surface like the Label box, so a
   translation can carry its own bold/italic/ruby; the B/I/Ruby buttons in
   the toolbar above act on whichever row's text you last had the cursor
   in, which is why the active row is tracked.
   ------------------------------------------------------------------ */
const langTabActiveSurface = new Map();   // list element -> the row surface last focused

function makeLangTabRow(list, tab){
  const row = document.createElement('div');
  row.className = 'lang-tab-row';

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'lang-tab-tag';
  tagInput.placeholder = 'EN';
  tagInput.maxLength = 8;
  tagInput.value = (tab && tab.tag) || '';

  const text = document.createElement('div');
  text.className = 'lang-tab-text rich-surface';
  text.contentEditable = 'true';
  text.spellcheck = false;
  text.dataset.placeholder = 'Text for this tab';
  text.innerHTML = markupToRichHtml((tab && tab.text) || '');
  text.addEventListener('focus', ()=> langTabActiveSurface.set(list, text));
  text.addEventListener('paste', ev=>{
    ev.preventDefault();
    const plain = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, plain);
  });
  /* These rows are built at runtime, so they missed the sweep that wired
     every field in the entry editor to the auto-commit when the Apply
     buttons were taken away. The result was a form that looked like it was
     working — rows appeared, text could be typed — while nothing ever
     reached the entry. Both fields commit on input, like every other
     control in this form.
     `commitLangTabs` is used rather than queueNodeEditCommit directly so
     the "add" and "remove" buttons can settle immediately: adding a row is
     a discrete act, not typing, and waiting out a typing pause for it just
     looks broken. */
  /* Typing a tab shows on the entry as it is typed, exactly as typing the
     label does. The debounced commit still does the real write (and owns
     the undo step); this only paints the live entry so the chips and the
     switched text keep up with the form. Without it a tab only appeared
     after the typing pause, which made the two halves of the same form
     behave differently for no reason the user could see. */
  const preview = ()=>{
    const n = selectedId && nodes.get(selectedId);
    if(!n) return;
    const tabs = collectLangTabs(list);
    n.langTabs = tabs.length ? tabs : null;
    n.multiLang = true;
    // A tab that has just lost its tag or text stops existing, so an
    // index pointing past the end has to come back to the default.
    const active = activeLangTab.get(n.id);
    if(active != null && (!n.langTabs || active >= n.langTabs.length)) activeLangTab.set(n.id, null);
    renderNodes();
  };
  const commit = ()=>{
    preview();
    if(typeof queueNodeEditCommit === 'function') queueNodeEditCommit();
  };
  tagInput.addEventListener('input', commit);
  text.addEventListener('input', commit);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'lang-tab-del';
  del.textContent = '×';
  del.title = 'Remove this tab';
  del.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(langTabActiveSurface.get(list) === text) langTabActiveSurface.delete(list);
    row.remove();
    preview();
    if(typeof queueNodeEditCommit === 'function') queueNodeEditCommit(0);
  });

  row.appendChild(tagInput);
  row.appendChild(text);
  row.appendChild(del);
  list.appendChild(row);
  return row;
}
function fillLangTabs(list, tabs){
  list.innerHTML = '';
  langTabActiveSurface.delete(list);
  (tabs && tabs.length ? tabs : [null]).forEach(t=> makeLangTabRow(list, t));
}
// Rows with no tag or no text are simply not tabs yet, so they're dropped
// rather than reported as an error — an empty row is how a new one starts.
function collectLangTabs(list){
  const out = [];
  list.querySelectorAll('.lang-tab-row').forEach(row=>{
    const tag = row.querySelector('.lang-tab-tag').value.trim();
    const text = richHtmlToMarkup(row.querySelector('.lang-tab-text')).trim();
    if(tag && text) out.push({tag, text});
  });
  return out;
}

function setEditStatus(kind, msg){ detailEditStatusEl.className = 'editor-status show ' + kind; detailEditStatusEl.textContent = msg; }
function clearEditStatus(){ detailEditStatusEl.className = 'editor-status'; detailEditStatusEl.textContent = ''; }
function closeEditForm(){
  // A change still sitting in the typing pause is a change the user made;
  // closing settles it rather than throwing it away.
  if(typeof flushNodeEditCommit === 'function') flushNodeEditCommit();
  if(typeof endLabelPreview === 'function') endLabelPreview(false);
  detailEditForm.style.display = 'none';
  detailEditToggle.classList.remove('active');
  showNoteBlock(true);
  clearEditStatus();
  if(typeof syncTagLiveliness === 'function') syncTagLiveliness();
}

detailEditToggle.onclick = (ev)=>{
  ev.stopPropagation();
  if(!selectedId) return;
  const n = nodes.get(selectedId);
  if(!n) return;
  const opening = detailEditForm.style.display === 'none' || !detailEditForm.style.display;
  if(opening){
    setRichValue(editLabelInput, n.label);
    editLinkInput.value = n.link || '';
    /* The field shows the colour the entry actually HAS. It used to be
       left blank to mean "the default", which asked the reader to know
       what the default was and gave them nothing to edit — the commonest
       thing you want to do here is nudge the current colour, and you
       cannot nudge a blank. */
    editColorsInput.value = (n.colors && n.colors.length)
      ? n.colors.join(', ')
      : (n.color || DEFAULT_NODE_COLOR);
    if(paintEditSwatches) paintEditSwatches();
    /* Empty means "on the paper", which is a real answer rather than a
       missing one — so unlike the border field this one is left blank when
       the entry has no background of its own. */
    editBgInput.value = (n.bg && n.bg.length) ? n.bg.join(', ') : '';
    if(paintEditBgSwatches) paintEditBgSwatches();
    if(typeof window.syncBgResetState === 'function') window.syncBgResetState();
    editBorderStyle.value = borderStyleOf(n);
    editShapeInput.value = n.shape || 'rect';
    editImageInput.value = n.image || '';
    if(editBioCardCheck) editBioCardCheck.checked = !!n.bioCard;
    editBioSide.value = bioSideOf(n);
    syncBioCardField(editShapeInput);
    syncImageFieldVisibility(editShapeInput, editImageField);
    syncLabelFieldForShape(editShapeInput);
    editTagsInput.value = (n.tags && n.tags.length) ? n.tags.join(', ') : '';
    if(repaintEditTags) repaintEditTags();
    populateFontOptions(editFontInput);
    editFontInput.value = n.font || FONT_OPTIONS[0].key;
    editFontSizeInput.value = n.fontSize || '';
    syncFontMirrors(editFontInput, editFontMirror, editFontSizeInput, editFontSizeMirror);
    editCardCheck.checked = !!n.card;
    cardWanted = !!n.card;
    if(typeof window.syncColorsResetState === 'function') window.syncColorsResetState();
    syncCardFieldVisibility();
    syncTextColorVisibility();
    syncColorFieldVisibility();
    editMultiLangCheck.checked = !!n.multiLang;
    fillLangTabs(editLangTabList, n.langTabs);
    editLangTabsField.style.display = n.multiLang ? '' : 'none';
    detailEditForm.style.display = 'block';
    detailEditToggle.classList.add('active');
    showNoteBlock(false);
    clearEditStatus();
    beginLabelPreview(selectedId);
    beginNodeEditSession();
  } else {
    closeEditForm();
  }
  // Opening an entry's settings is looking at that entry — see
  // syncTagLiveliness — so its decorations perform for as long as they stay
  // open, without the reader having to keep the pointer on the box.
  syncTagLiveliness();
};

/* Every control in the entry editor commits by itself. Typed fields wait
   out a short pause so a word is one edit; the ones you pick rather than
   type settle immediately, because there is no half-finished state to wait
   for. */
// Reached by id rather than through the module consts: several of those
// are declared further down the file than this block runs.
['editLabelInput','editLinkInput','editColorsInput','editBgInput','editTagsInput',
 'editImageInput','editFontSizeInput'].forEach(id=>{
  const field = document.getElementById(id);
  if(!field) return;
  field.addEventListener('input', ()=> queueNodeEditCommit());
  field.addEventListener('blur', ()=> flushNodeEditCommit());
});
['editShapeInput','editFontInput','editMultiLangCheck','editCardCheck','editBioCardCheck'].forEach(id=>{
  const field = document.getElementById(id);
  if(!field) return;
  field.addEventListener('change', ()=>{
    // Turning card layout on reveals the picture field it needs — and is
    // the only thing that changes what the reader asked for.
    if(id === 'editCardCheck'){
      cardWanted = editCardCheck.checked;
      syncImageFieldVisibility(editShapeInput, editImageField);
    }
    queueNodeEditCommit(0);
  });
});


/* ---------------------------------------------------------------------
   Live label preview.

   While the label field is open, what you type is drawn straight onto the
   entry itself — including the way the box grows and re-wraps around a
   longer name — so you are editing the chart rather than editing a form
   about the chart. It touches only the rendered model, never the saved
   data; the commit that follows a moment later is what makes it real, and
   the whole session is a single step of undo.
   ------------------------------------------------------------------ */
let labelPreview = null;      // {id, original} while a preview is running
let labelPreviewFrame = 0;

function beginLabelPreview(id, input){
  const n = nodes.get(id);
  if(!n) return;
  const field = input || editLabelInput;
  if(labelPreview && labelPreview.id === id && labelPreview.input === field) return;
  endLabelPreview(false);
  labelPreview = { id, original: n.label, input: field };
}
function renderLabelPreview(){
  if(!labelPreview) return;
  const n = nodes.get(labelPreview.id);
  if(!n) return;
  n.label = labelPreview.input.value;
  renderNodes();
  redrawEdges();
  applyVisibility();
  // Every entry has just been drawn afresh, so the highlight has to be put
  // back — otherwise the chart lights up whole on every keystroke.
  if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
  paintMultiSelection();
  drawBioCard();
  const g = qNode(`.node[data-id="${cssEscape(labelPreview.id)}"]`);
  if(g) g.classList.add('selected');
  // The entry has just changed shape under the field, so the field follows.
  if(typeof nodeEditorTarget !== 'undefined' && nodeEditorTarget &&
     typeof positionNodeEditor === 'function') positionNodeEditor();
}
function queueLabelPreview(){
  if(!labelPreview) return;
  if(labelPreviewFrame) cancelAnimationFrame(labelPreviewFrame);
  labelPreviewFrame = requestAnimationFrame(()=>{ labelPreviewFrame = 0; renderLabelPreview(); });
}
// commit=false rolls the drawing back to the text the entry had before the
// form was opened; commit=true just drops the preview, because the real
// edit is about to redraw everything anyway.
function endLabelPreview(commit){
  if(!labelPreview) return;
  const prev = labelPreview;
  labelPreview = null;
  if(labelPreviewFrame){ cancelAnimationFrame(labelPreviewFrame); labelPreviewFrame = 0; }
  if(commit) return;
  const n = nodes.get(prev.id);
  if(n && n.label !== prev.original){
    n.label = prev.original;
    renderNodes(); redrawEdges(); applyVisibility(); paintMultiSelection();
    drawBioCard();
  }
}
function cssEscape(v){ return String(v).replace(/["\\]/g, '\\$&'); }

/* Select the entry, open its settings, and put the cursor in the text —
   the whole path a double-click is asking for, in one call. */
function openLabelEditor(id){
  if(selectedId !== id){ selectNode(id); paintMultiSelection(); }
  if(detailEditForm.style.display === 'none' || !detailEditForm.style.display){
    detailEditToggle.onclick({stopPropagation(){}});
  }
  const rec = richFields.get('editLabelInput');
  if(!rec) return;
  beginLabelPreview(id);
  rec.surface.focus({preventScroll:true});
  // Cursor at the end of the existing text, ready to keep typing.
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(rec.surface);
  range.collapse(false);
  sel.removeAllRanges(); sel.addRange(range);
}

/* ---------------------------------------------------------------------
   Rich text fields.

   The label and language-tab boxes store their formatting as markup —
   **bold**, *italic*, [[base|ruby]] — and that's still exactly what gets
   saved. What changed is that you no longer type or read it: each of those
   boxes is now a contenteditable surface showing the formatting itself, so
   pressing Bold makes the selected words bold on the spot instead of
   dropping asterisks around them.

   The original <textarea> is kept, hidden, as the single source of truth:
   every keystroke in the editable surface writes markup back into it, so
   all the save/validate code goes on reading `.value` and never has to
   know any of this exists. Going the other way — loading a node into the
   form — goes through setRichValue().
   ------------------------------------------------------------------ */

// Markup -> HTML for one line. inlineToHtml already does exactly this
// mapping for the detail drawer's title, so the two stay in step.
function richLineHtml(line){
  return line.trim() === '' ? '<br>' : inlineToHtml(line);
}
function markupToRichHtml(markup){
  const lines = String(markup==null ? '' : markup).split('\n');
  return lines.map(l=>`<div>${richLineHtml(l)}</div>`).join('');
}

// HTML -> markup. Walks the editable surface and re-emits the stored form.
// `state` tracks whether we're already inside bold/italic so nesting emits
// one wrapper rather than an unparseable pile of asterisks — the markup
// format has no notion of nested emphasis, so the outermost one wins.
function isBoldEl(el){
  if(el.tagName==='B' || el.tagName==='STRONG') return true;
  const w = el.style && el.style.fontWeight;
  return w === 'bold' || (parseInt(w,10) >= 600);
}
function isItalicEl(el){
  if(el.tagName==='I' || el.tagName==='EM') return true;
  return el.style && el.style.fontStyle === 'italic';
}
// Colour can arrive as an inline style or, from execCommand on some
// engines, as <font color>. Both normalize to a hex string.
function rgbToHex(v){
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if(!m) return null;
  return '#' + [1,2,3].map(i=> Number(m[i]).toString(16).padStart(2,'0')).join('');
}
/* Which of the chart's faces an element is set in, if any. The key is read
   from the data attribute the editor writes; falling back to matching the
   family string keeps text pasted from an older copy working. */
function fontKeyOfEl(el){
  const k = el.dataset && el.dataset.font;
  if(k && FONT_OPTIONS.some(f=> f.key === k)) return k;
  const fam = el.style && el.style.fontFamily;
  if(!fam) return null;
  const norm = fam.replace(/["']/g, '').toLowerCase();
  const hit = FONT_OPTIONS.find(f=> f.family.replace(/["']/g, '').toLowerCase() === norm);
  return hit ? hit.key : null;
}
/* The size a run is set at, in px, if it carries one of its own. Read from
   the data attribute the editor writes, falling back to the inline style so
   text pasted from elsewhere keeps its sizes. */
function sizeOfEl(el){
  const raw = (el.dataset && el.dataset.size) || (el.style && el.style.fontSize) || '';
  const v = parseFloat(raw);
  if(!Number.isFinite(v) || v < 6 || v > 40) return null;
  return Math.round(v * 10) / 10;
}
function colorOfEl(el){
  const raw = (el.style && el.style.color) || (el.tagName==='FONT' ? el.getAttribute('color') : '');
  if(!raw) return null;
  if(/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return rgbToHex(raw);
}
/* A rule under a run or through it, as the editor holds it. The style key
   is kept on a data attribute rather than read back out of the computed
   decoration, because a browser normalises those and `wavy` and `double`
   would come back as something else on the way round. */
function underOfEl(el){
  const k = el.getAttribute && el.getAttribute('data-under');
  return (k && LINE_STYLES[k]) ? k : null;
}
function strikeOfEl(el){
  const k = el.getAttribute && el.getAttribute('data-strike');
  return (k && LINE_STYLES[k]) ? k : null;
}
/* HTML -> markup.
 *
 * The writer keeps its open wrappers on a stack, and writes an opener
 * lazily: one is only committed once something real follows it, so a
 * wrapper the user left empty disappears instead of closing on nothing.
 *
 * A sticker and a citation are atomic — they are one token, never text to
 * be split — but they are not exempt from the run they sit in. A size
 * wrapper around one is the whole mechanism by which either of them is
 * enlarged, so the wrappers stay open across it. */
/* `opts.rubyHalf` says this text is going inside a reading, where a bare
   `|` divides the two halves and a bare `]` ends the unit. Those two
   characters are escaped in the TEXT rather than stripped out of the
   finished markup — stripping was the obvious thing and was wrong, because
   the finished markup contains structural `|`s of its own: an annotation
   written in red came back as `{{#c23b22anno}}`, the wrapper's own divider
   gone and the colour with it. */
/* A newline at the very END of a block is not content.
 *
 * The surface is set in pre-wrap, so a line break inside a block is a real
 * newline character rather than an element — and when the caret is at the
 * end of the block the browser writes TWO of them: one for the break and
 * one to stand where the caret now is, because a block's last newline is
 * not drawn. Read back literally, that second one became a blank line in
 * the value: press Shift+Enter once at the end of a label and everything
 * moved down two lines instead of one.
 *
 * The rule is general, not a patch on that one gesture: whatever ends a
 * block, the block boundary is what separates it from the next, so a
 * newline sitting immediately before that boundary says nothing. Taken
 * off a COPY, so the caret in the live surface is not disturbed. */
function withoutBlockTailNewlines(root){
  const copy = root.cloneNode(true);
  const blocks = [copy].concat([...copy.querySelectorAll('div,p')]);
  blocks.forEach(b=>{
    let node = b.lastChild;
    while(node && node.nodeType === 1 &&
          !/^(DIV|P)$/.test(node.tagName) && node.lastChild){
      node = node.lastChild;
    }
    if(node && node.nodeType === 3 && node.nodeValue.slice(-1) === '\n'){
      node.nodeValue = node.nodeValue.slice(0, -1);
    }
  });
  return copy;
}
function richHtmlToMarkup(root, opts){
  const rubyHalf = !!(opts && opts.rubyHalf);
  if(root && root.nodeType === 1 && !(opts && opts.raw)) root = withoutBlockTailNewlines(root);
  let out = '';
  const pending = [];   // opened, nothing written inside yet
  const active = [];    // opened and committed
  /* Closed, but the close not yet written.
   *
   * The editor gives every run its own wrappers, so a bold sentence is a
   * row of separate <b> elements — one per run — and writing each close
   * the moment it was reached produced `**Bold ****[[…]]**** tail**`.
   * Four asterisks in a row is not two closes and two opens to the
   * grammar; it is a run of four, and what came back was plain text with
   * the reading in it destroyed. A whole label could be wrecked by typing
   * one character into it.
   *
   * So a close waits. If the very next thing opened is the same wrapper,
   * with nothing written between, then it never closed at all and both
   * marks disappear — which is also what the reader means by one bold
   * phrase rather than three touching ones. */
  const closing = [];   // in the order the closes must be written

  function settle(){
    while(closing.length) out += closing.shift().close;
  }
  function flushPending(){
    /* A deferred close cancels against a matching re-open. The one that
       can cancel is the LAST close due — the outermost — because
       everything closed inside it has to be written first either way. */
    while(pending.length && closing.length){
      const open = pending[0], shut = closing[closing.length - 1];
      if(open.open !== shut.open || open.close !== shut.close) break;
      closing.pop();
      pending.shift();
      active.push(shut);
    }
    settle();
    while(pending.length){
      const f = pending.shift();
      out += f.open;
      active.push(f);
    }
  }
  function writeText(t){
    if(t === '') return;
    flushPending();
    out += t;
  }
  function pushFmt(open, close){ pending.push({open, close}); }
  function popFmt(){
    // Closing the innermost wrapper: if it never got any text, it simply
    // never existed.
    if(pending.length){ pending.pop(); return; }
    const f = active.pop();
    if(f) closing.push(f);
  }
  function writeAtomic(tok){
    /* A sticker or a citation now sits INSIDE the wrappers that are open
       around it, and has to: that `{{z:20|…}}` is the only way either of
       them is ever made bigger, and stepping out of it — which is what
       this did — was exactly why the size picker offered a change that
       never arrived on the chart.
       It was safe to step out only while the grammar was flat, when a
       wrapper's body stopped at the first `}` and `{{#c23b22|Word{{r:bw}}}}`
       fell through as literal text. Bodies are matched by brace depth now,
       so the nesting reads back the way it was written. */
    flushPending();
    out += tok;
  }

  function walk(node, state){
    node.childNodes.forEach(child=>{
      /* Typed text is DATA, so anything in it that the markup would read
         as a mark is escaped on the way out. Without this, typing an
         ordinary "2 * 3 = 6 and 4 * 5 = 20" stored those asterisks raw and
         the chart rendered the middle of the sentence in italics with both
         of them swallowed — formatting the reader never asked for, out of
         a sentence they simply typed. */
      if(child.nodeType === 3){
        let t = escapeMarkup(child.nodeValue);
        if(rubyHalf) t = t.replace(/([|\]])/g, '\\$1');
        writeText(t);
        return;
      }
      if(child.nodeType !== 1) return;
      const tag = child.tagName;
      if(tag === 'BR'){ writeText('\n'); return; }
      /* A sticker in the editor is an <img> carrying its key — or, when
         its picture has been removed from the library, a placeholder
         carrying the same key. Either way the key is what round-trips. */
      if(child.dataset && child.dataset.sticker){
        writeAtomic(`{{s:${child.dataset.sticker}}}`);
        return;
      }
      if(tag === 'IMG') return;         // any other picture is not ours
      /* A citation is one atomic chip carrying its key. Its visible text is
         the current number, which is exactly why the KEY round-trips —
         reading the "[3]" back would freeze a position that is only true
         until the list is reordered. */
      if(child.dataset && child.dataset.ref){
        writeAtomic(`{{r:${child.dataset.ref}}}`);
        return;
      }
      /* A figure — or the placeholder left where one used to be — is one
         atomic token carrying its key, exactly like a citation, plus the
         width it has been dragged to if it has been dragged to one. */
      if(child.dataset && child.dataset.media){
        const w = clampFigureWidth(child.dataset.w);
        writeAtomic(`{{m:${child.dataset.media}${w ? '@' + w : ''}}}`);
        return;
      }
      if(tag === 'RUBY'){
        /* Both halves are markup of their own, so both are serialised by
           the same writer that produced them — an annotation set in red
           over a plain word comes back as red over plain, rather than as
           two bare strings that lost whatever was done to them.
         *
           A reading is written as `[[base|annotation]]`, so neither half
           may hold a bare `|` or `]`: the scanner that finds the divider
           and the end stops at the first of either, and a base with a
           bracket in it came back as the literal characters
           `[[Ark]2|reading]]` printed on the chart, the reading gone. Both
           are ordinary editable text, so that is one keystroke away. */
        const rt = child.querySelector('rt');
        const holder = document.createElement('span');
        Array.from(child.childNodes).forEach(c=>{
          if(c.nodeType === 1 && c.tagName === 'RT') return;
          holder.appendChild(c.cloneNode(true));
        });
        const base = richHtmlToMarkup(holder, {rubyHalf:true}).trim();
        const anno = rt ? richHtmlToMarkup(rt, {rubyHalf:true}).trim() : '';
        if(base) writeText(anno ? `[[${base}|${anno}]]` : base);
        return;
      }
      if(tag === 'RT') return;               // handled by its <ruby>
      // Block-level children start a new line, except the very first one.
      const isBlock = (tag === 'DIV' || tag === 'P');
      if(isBlock && out !== '' && !out.endsWith('\n')) writeText('\n');
      const bold = !state.bold && isBoldEl(child);
      const italic = !state.italic && isItalicEl(child);
      const color = !state.color && colorOfEl(child);
      const font = !state.font && fontKeyOfEl(child);
      const size = !state.size && sizeOfEl(child);
      const under = !state.under && underOfEl(child);
      const strike = !state.strike && strikeOfEl(child);
      if(bold) pushFmt('**', '**');
      if(italic) pushFmt('*', '*');
      if(color) pushFmt(`{{${color}|`, '}}');
      if(font) pushFmt(`{{f:${font}|`, '}}');
      if(size) pushFmt(`{{z:${size}|`, '}}');
      if(under) pushFmt(`{{u:${under}|`, '}}');
      if(strike) pushFmt(`{{t:${strike}|`, '}}');
      walk(child, {bold: state.bold || bold, italic: state.italic || italic,
                   color: state.color || !!color, font: state.font || !!font,
                   size: state.size || !!size,
                   under: state.under || !!under, strike: state.strike || !!strike});
      if(strike) popFmt();
      if(under) popFmt();
      if(size) popFmt();
      if(font) popFmt();
      if(color) popFmt();
      if(italic) popFmt();
      if(bold) popFmt();
    });
  }
  walk(root, {bold:false, italic:false, color:false, font:false, size:false,
              under:false, strike:false});
  settle();
  // Anything still open never received text.
  for(let i = active.length - 1; i >= 0; i--) out += active[i].close;
  /* The browser's own bookkeeping blocks — the empty <div><br></div> a
     contenteditable starts life with, and whatever it leaves at the end —
     should not become blank lines in the saved value. */
  return out.replace(/^\n+/, '').replace(/\n+$/, '');
}

/* Typing inside a reading goes where the caret is.
 *
 * A reading is a `<ruby>` holding two pieces of text — the word and the
 * annotation over it — and a collapsed caret sitting at the very start of
 * either of them is a position contenteditable cannot tell apart from the
 * position just BEFORE that piece. Left to itself the browser resolves the
 * tie the wrong way every time: a character typed at the head of the word
 * landed in the text in front of the reading, taking whatever formatting
 * that text had rather than the reading's; a character typed at the head
 * of the annotation landed on the END of the word underneath it, so the
 * reading being annotated silently grew a letter and the annotation did
 * not change at all.
 *
 * The caret's own range says exactly which half it is in, so once the
 * caret is anywhere inside a reading the character is placed by hand and
 * the browser is not consulted. Everywhere else it behaves as it always
 * has — this only takes over where the ambiguity exists. */
function insertIntoReading(surface, data){
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  if(!r.collapsed) return false;
  let node = r.startContainer;
  const host = node.nodeType === 1 ? node : node.parentElement;
  if(!host || !host.closest) return false;
  const ruby = host.closest('ruby');
  if(!ruby || !surface.contains(ruby)) return false;
  let off = r.startOffset;
  if(node.nodeType !== 3){
    /* An empty half — an annotation nobody has written yet — has no text
       node for the character to go into, so it is given one. */
    const t = document.createTextNode('');
    node.insertBefore(t, node.childNodes[off] || null);
    node = t; off = 0;
  }
  node.insertData(off, data);
  const nr = document.createRange();
  nr.setStart(node, off + data.length);
  nr.collapse(true);
  sel.removeAllRanges(); sel.addRange(nr);
  return true;
}
const richFields = new Map();   // textarea id -> {textarea, surface}
/* What Enter does in a given rich field once its text has been settled and
   the field has let go of the keyboard. Blurring alone is enough for the
   fields that commit as you type; the ones with a button of their own name
   it here so Enter and the button are the same gesture. */
const richEnterActions = new Map();
function setRichEnter(id, fn){ richEnterActions.set(id, fn); }
function setRichValue(textarea, markup){
  textarea.value = markup;
  const rec = richFields.get(textarea.id);
  if(rec) rec.surface.innerHTML = markupToRichHtml(markup);
}
// Turns one textarea into a rich field. The textarea stays in the DOM
// (hidden) so nothing that reads or writes `.value` has to change.
function makeRichField(textarea){
  if(!textarea || richFields.has(textarea.id)) return;
  /* If a surface is already sitting beside this textarea, that is one this
     page was SAVED with — an exported copy, or any other route that
     captured the live DOM rather than the source. Building a second one
     leaves two editors stacked on the same field, and the toolbar acts on
     whichever it finds first, which is not the one being typed into. The
     existing surface is adopted instead; setRichValue below refills it. */
  const prev = textarea.previousElementSibling;
  if(prev && prev.classList && prev.classList.contains('rich-surface')) prev.remove();
  const surface = document.createElement('div');
  surface.className = 'rich-surface';
  surface.contentEditable = 'true';
  surface.spellcheck = false;
  surface.dataset.placeholder = textarea.getAttribute('placeholder') || '';
  // Match the box it replaces, so the two forms keep their proportions.
  if(textarea.rows) surface.style.minHeight = (textarea.rows * 20 + 14) + 'px';
  textarea.parentNode.insertBefore(surface, textarea);
  textarea.style.display = 'none';
  surface.addEventListener('input', ()=>{ textarea.value = richHtmlToMarkup(surface); });
  // See insertIntoReading: a character typed inside a reading is placed by
  // hand, because the browser puts it in the wrong half at either edge.
  surface.addEventListener('beforeinput', ev=>{
    if(ev.inputType !== 'insertText' || typeof ev.data !== 'string' || !ev.data) return;
    if(!insertIntoReading(surface, ev.data)) return;
    ev.preventDefault();
    textarea.value = richHtmlToMarkup(surface);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
  });
  /* Enter finishes; Shift+Enter is the line break.
   *
   * A text field on this chart is not a document being composed — it is a
   * label or a note being SET, and the reader almost always wants to look
   * at what they typed rather than keep typing. So Enter does what pressing
   * the field's own button does: it settles the text and hands the keyboard
   * back to the chart, which is also what makes the arrow keys, Delete and
   * every other shortcut work again without having to click away first.
   *
   * A break is still one keystroke away. Shift+Enter inserts a BREAK rather
   * than letting the browser start whatever block it fancies — contenteditable
   * answers a plain Enter with a <div> or a <p> depending on the browser, and
   * the markup reader then has to guess at line boundaries. */
  surface.addEventListener('keydown', ev=>{
    if(ev.key !== 'Enter' || ev.isComposing) return;
    ev.preventDefault();
    if(ev.shiftKey){ document.execCommand('insertLineBreak'); textarea.value = richHtmlToMarkup(surface); surface.dispatchEvent(new Event('input', {bubbles:true})); return; }
    // Whatever is in the surface reaches the textarea BEFORE the field is
    // asked to settle, so a field that settles from `.value` never loses
    // the last thing typed into it.
    textarea.value = richHtmlToMarkup(surface);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    const done = richEnterActions.get(textarea.id);
    surface.blur();
    if(done) done();
  });
  // and paste comes in as plain text so foreign markup can't leak in.
  surface.addEventListener('paste', ev=>{
    ev.preventDefault();
    const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  wireFigureHandles(surface, textarea);
  richFields.set(textarea.id, {textarea, surface});
  setRichValue(textarea, textarea.value);
}

/* ---------------------------------------------------------------------
   Placing and sizing a figure.

   A figure in a comment is a piece of the document, and a piece of a
   document is something you arrange. Both gestures are the ones this chart
   already uses everywhere else: pick the thing up and put it down, or pull
   its corner.

   Neither goes through the browser's own drag-and-drop. HTML5 dragging
   inside a contenteditable is a negotiation with the editor over what a
   drop means — it will happily leave the figure behind, duplicate it, or
   drop the alt text as a word — and none of that is visible until it has
   happened. Moving the element by hand is both predictable and short: a
   figure stands on its own line, so where it can go is a position between
   the lines, and that position is drawn as a rule while it is being
   carried rather than guessed at from a caret nobody can see.
   ------------------------------------------------------------------ */
const FIGURE_DRAG_SLOP = 4;      // px before a press becomes a carry
let figureDrag = null;
let figureSize = null;

/* The width of the column a figure stands in, in pixels: the surface's
   content box, since a percentage is measured against that and not against
   the border box the element reports. */
function surfaceColumnWidth(surface){
  const cs = getComputedStyle(surface);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  return Math.max(20, surface.clientWidth - pad);
}
/* Where a carried figure would land: between two of the surface's own
   lines, chosen by which half of which line the pointer is in. */
function figureDropSpot(surface, y){
  const kids = [...surface.children].filter(k=> k !== figureDrag.mark);
  for(const k of kids){
    const r = k.getBoundingClientRect();
    if(y < r.top + r.height/2) return {node:k, before:true};
    if(y <= r.bottom) return {node:k, before:false};
  }
  const last = kids[kids.length - 1];
  return last ? {node:last, before:false} : null;
}
function wireFigureHandles(surface, textarea){
  surface.addEventListener('mousedown', ev=>{
    if(ev.button !== 0 || surface.classList.contains('locked')) return;
    const grip = ev.target.closest && ev.target.closest('.fig-grip');
    const fig = ev.target.closest && ev.target.closest('.rich-figure');
    if(!fig || !surface.contains(fig)) return;
    if(grip){
      ev.preventDefault(); ev.stopPropagation();
      figureSize = {surface, textarea, fig,
                    column: surfaceColumnWidth(surface),
                    startX: ev.clientX,
                    startW: fig.getBoundingClientRect().width};
      fig.classList.add('sizing');
      return;
    }
    /* A video's own controls are inside the figure and are the reason the
       clip is there at all — pressing play must not pick the figure up. */
    if(ev.target.tagName === 'VIDEO') return;
    ev.preventDefault();
    figureDrag = {surface, textarea, fig, startX: ev.clientX, startY: ev.clientY,
                  moved: false, mark: null, spot: null};
  });
}
window.addEventListener('mousemove', ev=>{
  if(figureSize){
    const w = clampFigureWidth(
      (figureSize.startW + (ev.clientX - figureSize.startX)) / figureSize.column * 100);
    if(w){ figureSize.fig.dataset.w = w; figureSize.fig.style.width = w + '%'; }
    return;
  }
  if(!figureDrag) return;
  const st = figureDrag;
  if(!st.moved){
    if(Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < FIGURE_DRAG_SLOP) return;
    st.moved = true;
    st.fig.classList.add('dragging');
    document.body.classList.add('figure-dragging');
    st.mark = document.createElement('div');
    st.mark.className = 'rich-drop-mark';
    st.mark.contentEditable = 'false';
  }
  const spot = figureDropSpot(st.surface, ev.clientY);
  st.spot = spot;
  if(spot){
    if(spot.before) st.surface.insertBefore(st.mark, spot.node);
    else st.surface.insertBefore(st.mark, spot.node.nextSibling);
  }
}, true);
window.addEventListener('mouseup', ()=>{
  if(figureSize){
    const st = figureSize; figureSize = null;
    st.fig.classList.remove('sizing');
    st.textarea.value = richHtmlToMarkup(st.surface);
    st.surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  const st = figureDrag; figureDrag = null;
  if(!st) return;
  document.body.classList.remove('figure-dragging');
  st.fig.classList.remove('dragging');
  if(!st.moved || !st.mark || !st.mark.parentNode){
    if(st.mark && st.mark.parentNode) st.mark.remove();
    return;
  }
  /* The figure moves as its own line. It was inserted as one and it is put
     down as one, so carrying a picture out of the middle of a paragraph
     cannot leave half a sentence wrapped around where it used to be. */
  const line = document.createElement('div');
  const oldLine = st.fig.parentNode;
  line.appendChild(st.fig);
  st.mark.parentNode.insertBefore(line, st.mark);
  st.mark.remove();
  /* And the line it came out of goes if there is nothing left in it. */
  if(oldLine && oldLine !== st.surface && oldLine.parentNode === st.surface &&
     !oldLine.textContent.trim() && !oldLine.querySelector('img,video,.rich-figure')){
    oldLine.remove();
  }
  st.textarea.value = richHtmlToMarkup(st.surface);
  st.surface.dispatchEvent(new Event('input', {bubbles:true}));
}, true);

/* A reading is ONE thing, however many characters it covers.
 *
 * Formatting works on a range, and a range can end in the middle of a word
 * — including in the middle of the word a reading sits over. Colouring
 * `Upri` out of `[[Uprising|reading]]` made the browser split the <ruby>
 * in two so that each half could carry its own colour, and what came back
 * out was a reading over `Upri` followed by the loose letters `s` and
 * `ing`: the word came apart under a mark that is supposed to be attached
 * to the whole of it.
 *
 * So a range that starts or ends inside a reading is widened to take the
 * whole of it. The reading then takes the formatting as a unit, which is
 * also the only thing the markup can express. */
function widenOverRuby(surface, range){
  if(!range) return range;
  const halfOf = (node)=>{
    const e = node && (node.nodeType === 1 ? node : node.parentElement);
    if(!e || !e.closest) return null;
    const r = e.closest('ruby');
    if(!r || !surface.contains(r)) return null;
    return {ruby: r, anno: !!e.closest('rt')};
  };
  const h1 = halfOf(range.startContainer), h2 = halfOf(range.endContainer);
  if(!h1 && !h2) return range;
  /* A selection lying wholly within ONE half of one reading is left alone.
     Both halves are markup in their own right now, so formatting part of a
     base — or an annotation on its own, which is the whole point — is
     something the stored form can say. Only a selection that straddles the
     two, or runs out of the reading entirely, is widened: that is the case
     the browser answers by splitting the <ruby> in two, which came back
     out as a reading over the first half and loose letters after it. */
  if(h1 && h2 && h1.ruby === h2.ruby && h1.anno === h2.anno) return range;
  const a = h1 && h1.ruby, b = h2 && h2.ruby;
  const wide = range.cloneRange();
  if(a) wide.setStartBefore(a);
  if(b) wide.setEndAfter(b);
  const sel = window.getSelection && window.getSelection();
  if(sel){ sel.removeAllRanges(); sel.addRange(wide); }
  return wide;
}
// Applies a formatting command to whichever rich surface has focus.
function applyRichCommand(surface, kind, arg, restyle){
  surface.focus({preventScroll:true});
  // Ask for tags rather than inline styles, so what comes back out is
  // <b>/<i> and maps straight onto the stored markup.
  try{ document.execCommand('styleWithCSS', false, false); }catch(e){}
  /* Every command below reads the live selection for itself, so widening
     it here reaches all of them — bold and italic included, which go
     through execCommand and would otherwise split a reading just as
     colouring did. */
  {
    const sel0 = window.getSelection && window.getSelection();
    if(sel0 && sel0.rangeCount){
      const r0 = sel0.getRangeAt(0);
      if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)) widenOverRuby(surface, r0);
    }
  }
  if(kind === 'bold'){ document.execCommand('bold'); return; }
  if(kind === 'italic'){ document.execCommand('italic'); return; }
  /* Taking a colour OFF. There is no execCommand for "inherit", so the
     colour is stripped from the elements the selection actually covers.
     Without this a coloured run was permanent: an amalgam paints its label
     from its own border gradient, and a run given a flat colour could
     never be handed back to it. */
  /* Size, exactly as face: strip whatever the selection already carries,
     then wrap it in the new one. Kept separate from the face branch only
     because the two are independent — a run can be set in one face at one
     size, and changing either must leave the other alone. */
  if(kind === 'size' || kind === 'unsize'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed || !surface.contains(range.commonAncestorContainer)) return;
    const frag = range.extractContents();
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const elx = child;
        if(!sizeOfEl(elx)) return;
        if(elx.dataset) delete elx.dataset.size;
        if(elx.style) elx.style.removeProperty('font-size');
        const bare = elx.tagName === 'SPAN' &&
          (!elx.getAttribute('style') || !elx.getAttribute('style').trim()) &&
          !elx.getAttribute('data-font') && !elx.getAttribute('data-size');
        if(bare){
          while(elx.firstChild) node.insertBefore(elx.firstChild, elx);
          node.removeChild(elx);
        }
      });
    };
    strip(frag);
    if(kind === 'size'){
      const px = Math.round(parseFloat(arg) * 10) / 10;
      if(!Number.isFinite(px) || px < 6 || px > 40){ range.insertNode(frag); return; }
      const wrap = document.createElement('span');
      wrap.style.fontSize = px + 'px';
      wrap.dataset.size = String(px);
      wrap.appendChild(frag);
      range.insertNode(wrap);
    } else {
      range.insertNode(frag);
    }
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  /* A rule under the words or through them.
   *
   * Toggling, not stacking: pressing it again on a run that already has
   * one takes it off. A citation is stepped around — it is a chip
   * pointing at a reference, and a line drawn across a number reads as a
   * number that has been struck out. `restyle` re-applies the kind of
   * line without toggling, which is what the style picker beside the
   * buttons does. */
  if(kind === 'under' || kind === 'strike'){
    const attr = kind === 'under' ? 'data-under' : 'data-strike';
    const line = kind === 'under' ? 'underline' : 'line-through';
    const other = kind === 'under' ? 'data-strike' : 'data-under';
    const otherLine = kind === 'under' ? 'line-through' : 'underline';
    const style = LINE_STYLES[arg] ? arg : 'solid';
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed || !surface.contains(range.commonAncestorContainer)) return;
    const had = !restyle && !!lineStateOf(surface)[kind === 'under' ? 'under' : 'strike'];
    const frag = range.extractContents();
    // Strip whatever this kind of rule the selection already carries.
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        if(!child.getAttribute || !child.getAttribute(attr)) return;
        child.removeAttribute(attr);
        const keeps = child.getAttribute(other);
        child.style.textDecorationLine = keeps ? otherLine : '';
        if(keeps) child.style.textDecorationStyle = (LINE_STYLES[keeps] || LINE_STYLES.solid).css;
        const bare = child.tagName === 'SPAN' && !keeps &&
          (!child.getAttribute('style') || !child.getAttribute('style').trim()) &&
          !child.getAttribute('data-font') && !child.getAttribute('data-size') &&
          !child.getAttribute('data-ref') && !child.getAttribute('data-sticker');
        if(bare){
          while(child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        }
      });
    };
    strip(frag);
    if(had){
      range.insertNode(frag);
    } else {
      /* One wrapper around the whole selection.
       *
       * A citation inside it is exempt without being stepped around: a
       * rule is a text decoration, and a decoration is not propagated into
       * an atomic inline-level box — which is what `.ref-chip` is made,
       * for exactly this reason. That holds at any depth, which a pass
       * over the fragment's top-level children did not: a citation sitting
       * inside a bold run within the selection was wrapped like ordinary
       * text and drawn through. The chart applies the same exemption from
       * the other side, since a citation is laid out as its own tspan and
       * never takes the run's styling. */
      const wrap = document.createElement('span');
      wrap.style.textDecorationLine = line;
      wrap.style.textDecorationStyle = (LINE_STYLES[style] || LINE_STYLES.solid).css;
      wrap.setAttribute(attr, style);
      wrap.appendChild(frag);
      range.insertNode(wrap);
    }
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'font' || kind === 'unfont'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    // Strip any face already on the selection, then wrap it in the new one.
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const el = child;
        if(!fontKeyOfEl(el)) return;
        if(el.dataset) delete el.dataset.font;
        if(el.style) el.style.removeProperty('font-family');
        const bare = el.tagName === 'SPAN' &&
          (!el.getAttribute('style') || !el.getAttribute('style').trim()) &&
          !el.getAttribute('data-font');
        if(bare){
          while(el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
        }
      });
    };
    strip(frag);
    if(kind === 'font'){
      const wrap = document.createElement('span');
      wrap.style.fontFamily = fontFamilyFor(arg);
      wrap.dataset.font = arg;
      wrap.appendChild(frag);
      range.insertNode(wrap);
    } else {
      range.insertNode(frag);
    }
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  /* Bold, italic and readings off. execCommand can turn bold and italic
     off only by toggling, which turns them ON where they were absent — so
     the tags are unwrapped by hand, exactly as the colour is. A reading
     collapses to the word it was over; the reading itself is an
     annotation, and there is nowhere for it to go. */
  if(kind === 'unstyle'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed || !surface.contains(range.commonAncestorContainer)) return;
    const frag = range.extractContents();
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const t = child.tagName;
        if(t === 'RUBY'){
          /* A reading is CONTENT, not formatting: the annotation is
             something the author wrote, and clearing the formatting is not
             a licence to delete it. This used to collapse the whole thing
             to its base word, so pressing ⟲ silently threw the reading
             away. What comes off is the formatting inside it, which the
             recursion above has already done. */
          child.removeAttribute('style');
          return;
        }
        if(t === 'RT'){ child.removeAttribute('style'); return; }
        if(t === 'B' || t === 'STRONG' || t === 'I' || t === 'EM' || t === 'U'){
          while(child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        if(t === 'SPAN' && child.style){
          child.style.removeProperty('font-weight');
          child.style.removeProperty('font-style');
          child.style.removeProperty('text-decoration-line');
          child.style.removeProperty('text-decoration-style');
          child.style.removeProperty('text-decoration-color');
          child.removeAttribute('data-under');
          child.removeAttribute('data-strike');
          const bare = (!child.getAttribute('style') || !child.getAttribute('style').trim()) &&
            !child.getAttribute('data-font') && !child.getAttribute('data-size') &&
            !child.getAttribute('data-sticker') && !child.getAttribute('data-ref');
          if(bare){
            while(child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          }
        }
      });
    };
    strip(frag);
    range.insertNode(frag);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'uncolor'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // Re-emit the selected content with every colour carrier unwrapped.
    const frag = range.extractContents();
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const el = child;
        const carriesColor = (el.style && el.style.color) || el.tagName === 'FONT';
        if(!carriesColor) return;
        if(el.style) el.style.removeProperty('color');
        if(el.tagName === 'FONT') el.removeAttribute('color');
        /* A span that existed only to carry the colour is now noise — but
           a citation IS a span that carries a colour, its own, and
           unwrapping it left the number it happens to display standing in
           the text as three ordinary characters pointing at nothing. A
           sticker's placeholder is the same shape. Neither is a wrapper. */
        const atomic = el.getAttribute &&
          (el.getAttribute('data-ref') || el.getAttribute('data-sticker'));
        const bare = !atomic && (el.tagName === 'FONT' ||
          (el.tagName === 'SPAN' && (!el.getAttribute('style') || !el.getAttribute('style').trim())));
        if(bare){
          while(el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
        }
      });
    };
    strip(frag);
    range.insertNode(frag);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'color'){
    const hex = arg;
    if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex || '')) return;
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if(!surface.contains(range.commonAncestorContainer)) return;
    // Wrapped by hand rather than via execCommand('foreColor'), which
    // emits <font> on some engines and CSS spans on others; one span with
    // an inline color maps cleanly onto the {{#hex|…}} markup either way.
    const span = document.createElement('span');
    span.style.color = hex;
    try{
      range.surroundContents(span);
    }catch(e){
      // surroundContents refuses a selection that only partly covers an
      // element; extracting and re-inserting handles that case.
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    const pick = document.createRange();
    pick.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(pick);
    /* The surface has to be TOLD it changed. Bold and italic go through
       execCommand, which fires `input` itself; a span wrapped by hand does
       not, and every commit on this page hangs off that event. So the
       colour appeared in the box, was never written to the entry, never
       reached the chart, and was gone the next time the form was opened —
       from the outside, a colour button that did nothing. */
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'ruby'){
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if(!surface.contains(range.commonAncestorContainer)) return;

    // Ruby cannot nest: the stored markup has no grammar for a reading
    // inside a reading ([[a|[[b|c]]]] is not parseable), and the browser
    // would happily build one. Two ways to end up nested, both refused:
    // the caret already sitting inside a ruby, or a selection that spans
    // one. When the caret is already in a ruby the useful thing to do is
    // put it on that ruby's own annotation, which is almost certainly
    // what was meant.
    let anchor = range.commonAncestorContainer;
    if(anchor.nodeType === 3) anchor = anchor.parentNode;
    const enclosing = anchor && anchor.closest ? anchor.closest('ruby') : null;
    if(enclosing){
      const rt = enclosing.querySelector('rt');
      if(rt){
        const pick = document.createRange();
        pick.selectNodeContents(rt);
        sel.removeAllRanges();
        sel.addRange(pick);
      }
      return;
    }
    const contents = range.cloneContents();
    if(contents.querySelector && contents.querySelector('ruby')) return;

    /* A reading is text ABOVE text, and a sticker or a citation is not
       text: `range.toString()` returns nothing for them, so putting a
       reading over a selection containing one silently deleted it. Rather
       than destroy them, the command declines — turning a reading off for
       exactly the things it cannot be applied to. */
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    if(holder.querySelector('[data-sticker], [data-ref]')) return;
    /* The word keeps everything it was wearing.
     *
       This used to take `range.toString()` — the selection's bare
       characters — and put THAT under the reading, so putting a reading
       over a word that was bold, coloured, underlined or struck through
       silently returned it to plain text; over a whole label, the whole
       label. And it stripped every `]` and `|` out of the base as it went,
       on the grounds that those two characters separate a reading's halves
       in the stored form — which was true before both halves learned to
       escape them, and has since meant that `asdasd[1]` came back as
       `asdasd[1`, a character short.
     *
       The selected content is moved into the reading exactly as it stands.
       A selection spanning a line break is the one thing that cannot be:
       a reading is one unit on one line, and a fragment carrying a block
       would build a `<ruby>` around a `<div>`. That falls back to the
       words alone. */
    const frag = range.extractContents();
    const ruby = document.createElement('ruby');
    const probe = document.createElement('div');
    probe.appendChild(frag.cloneNode(true));
    if(probe.querySelector('div, p, br')){
      ruby.appendChild(document.createTextNode(probe.textContent || 'word'));
    } else {
      ruby.appendChild(frag);
      if(!ruby.textContent) ruby.appendChild(document.createTextNode('word'));
    }
    const rt = document.createElement('rt');
    rt.textContent = 'reading';
    ruby.appendChild(rt);
    range.insertNode(ruby);
    // Leave the annotation selected so it can be typed over immediately.
    const pick = document.createRange();
    pick.selectNodeContents(rt);
    sel.removeAllRanges();
    sel.addRange(pick);
    // Same as the colour: inserted by hand, so the commit has to be told.
    surface.dispatchEvent(new Event('input', {bubbles:true}));
  }
}

// Language-tab buttons address a list rather than one fixed field, since
// which row they act on depends on where the cursor was last.
const LANG_TAB_TOOLBARS = {
  '__editLangTabs__': ()=> editLangTabList
};
// The A button takes its colour from the hex box beside it in the same
// toolbar, so each toolbar carries its own current colour.
function toolbarHex(btn){
  const bar = btn.closest('.mini-toolbar');
  const box = bar && bar.querySelector('.tb-hex');
  return box ? box.value.trim() : null;
}
document.querySelectorAll('.mini-toolbar button').forEach(btn=>{
  btn.addEventListener('mousedown', ev=> ev.preventDefault());  // keep the selection alive
  btn.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    const targetId = btn.dataset.wrapTarget || 'editLabelInput';
    const kind = btn.dataset.wrap;
    const arg = kind === 'color' ? toolbarHex(btn) : undefined;
    const listGetter = LANG_TAB_TOOLBARS[targetId];
    if(listGetter){
      const list = listGetter();
      const surface = langTabActiveSurface.get(list)
        || list.querySelector('.lang-tab-text');
      if(surface) applyRichCommand(surface, kind, arg);
      return;
    }
    const rec = richFields.get(targetId);
    if(!rec) return;
    applyRichCommand(rec.surface, kind, arg);
    rec.textarea.value = richHtmlToMarkup(rec.surface);
    // Bold, colour and the rest show up on the entry as you apply them,
    // the same as typing does.
    if(targetId === 'editLabelInput' || targetId === 'freeMenuText' ||
       targetId === 'nodeEditorText') queueLabelPreview();
  });
});
/* A live row of swatches under a comma-separated colour field, so the
   border colours can be seen rather than only read as hex. */
function wireSwatchStrip(inputId, stripId){
  const input = document.getElementById(inputId);
  const strip = document.getElementById(stripId);
  if(!input || !strip) return;
  const paint = ()=>{
    strip.innerHTML = '';
    const parts = input.value.split(',').map(s=>s.trim()).filter(Boolean);
    if(!parts.length){
      /* An empty field draws an empty swatch rather than the word
         "default". The strip is a row of colour squares, and a word in
         that row reads as a different kind of thing; a blank square says
         "no colour here" in the strip's own language — and it keeps the
         row the same height whether or not a colour is set. */
      const blank = document.createElement('span');
      blank.className = 'swatch-chip swatch-blank';
      blank.title = 'No colour set — the default is used';
      strip.appendChild(blank);
      return;
    }
    parts.forEach(c=>{
      const chip = document.createElement('span');
      chip.className = 'swatch-chip';
      const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);
      chip.style.background = ok ? c : 'transparent';
      chip.title = ok ? c : c + ' — not a valid hex color';
      if(!ok) chip.style.borderColor = 'var(--accent)';
      strip.appendChild(chip);
    });
  };
  input.addEventListener('input', paint);
  paint();
  return paint;
}
const paintEditSwatches = wireSwatchStrip('editColorsInput', 'editColorsSwatches');
const paintEditBgSwatches = wireSwatchStrip('editBgInput', 'editBgSwatches');
/* The background field, which behaves the OTHER way round from the border
   one: an entry with no background is a perfectly ordinary entry — it is
   drawn on the paper — so an empty box means exactly that and stays empty.
   The reset button empties it. */
{
  const field = document.getElementById('editBgInput');
  const reset = document.getElementById('editBgReset');
  if(field && reset){
    const sync = ()=>{
      reset.disabled = !field.value.trim();
      reset.title = reset.disabled ? 'This entry is already on the paper'
                                   : 'Back to the paper';
    };
    reset.addEventListener('click', ev=>{
      ev.stopPropagation();
      if(!field.value.trim()) return;
      field.value = '';
      if(paintEditBgSwatches) paintEditBgSwatches();
      field.dispatchEvent(new Event('input', {bubbles:true}));
      flushNodeEditCommit();
      sync();
    });
    field.addEventListener('input', sync);
    window.syncBgResetState = sync;
  }
}
/* Emptying the field puts the default straight back.
 *
 * Now that the box always shows a real colour, an empty box is not a
 * state the entry can be in — there is no such thing as an entry with no
 * border colour. Clearing it therefore means "give me the default back",
 * and the quickest way to say that is to show it immediately rather than
 * leave an empty box that silently resolves to something on commit.
 *
 * It waits for the field to lose focus or for a moment's pause, so that
 * selecting-all and typing a replacement is not fought halfway through:
 * the box is briefly empty during that gesture, and refilling it on the
 * keystroke would eat what the user was typing. */
{
  const field = document.getElementById('editColorsInput');
  let restoreTimer = null;
  const restoreIfEmpty = ()=>{
    if(field.value.trim() !== '') return;
    const n = selectedId && nodes.get(selectedId);
    field.value = (n && n.color) || DEFAULT_NODE_COLOR;
    if(paintEditSwatches) paintEditSwatches();
    field.dispatchEvent(new Event('input', {bubbles:true}));
  };
  field.addEventListener('input', ()=>{
    clearTimeout(restoreTimer);
    if(field.value.trim() === '') restoreTimer = setTimeout(restoreIfEmpty, 700);
  });
  field.addEventListener('blur', ()=>{ clearTimeout(restoreTimer); restoreIfEmpty(); });
}
const paintAddSwatches = wireSwatchStrip('addNodeColors', 'addNodeColorsSwatches');

// The hex boxes keep a live swatch of what the A button will apply, and
// must not steal focus from the text being coloured.
/* Black, like every other "no colour set yet" field on the chart. The old
   default was the accent, which meant the box always suggested a change. */
const DEFAULT_TEXT_COLOR = '#20242b';
document.querySelectorAll('.tb-hex').forEach(box=>{
  const paint = ()=>{
    const v = box.value.trim();
    const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
    box.classList.toggle('bad', !ok);
    // Empty draws an empty swatch, the same as an unset border colour does,
    // rather than a stale colour that no longer describes the field.
    box.style.setProperty('--swatch', ok ? v : 'transparent');
  };
  /* Same rules as the border-colour field: the box always shows a real
     colour, and emptying it means "give me the default back" rather than
     leaving a blank that silently resolves to something on use. The pause
     is so that select-all-then-retype is not fought halfway through — the
     box is briefly empty during that gesture. */
  let restoreTimer = null;
  const restoreIfEmpty = ()=>{
    if(box.value.trim() !== '') return;
    box.value = DEFAULT_TEXT_COLOR;
    paint();
  };
  box.addEventListener('input', ()=>{
    paint();
    clearTimeout(restoreTimer);
    if(box.value.trim() === '') restoreTimer = setTimeout(restoreIfEmpty, 700);
  });
  box.addEventListener('blur', ()=>{ clearTimeout(restoreTimer); restoreIfEmpty();
    /* The wash goes with the trip. Leaving it painted after the caret has
       gone somewhere else entirely would be a highlight over words nothing
       is about to happen to. */
    if(typeof paintHeldSelection === 'function') paintHeldSelection(null); });
  box.addEventListener('click', ev=> ev.stopPropagation());

  /* Pressing the swatch is what applies the colour — the separate "A"
     button beside it is gone. The swatch is the leftmost 18px of the box;
     anywhere else is the text field, so a value can still be typed. */
  box.addEventListener('mousedown', ev=>{
    const onSwatch = (ev.clientX - box.getBoundingClientRect().left) < 18;
    if(!onSwatch) return;               // let the caret land in the text
    /* Not preventing the default here would move focus into this box and
       collapse the selection in the text being coloured — which is the
       whole thing the colour is meant to apply to. */
    ev.preventDefault();
    ev.stopPropagation();
    applyHexFromBox(box, box.value.trim());
  });
  /* Focusing the hex box must not throw away the selection either: a value
     is often typed AFTER choosing the words it is for. The surface's own
     selection is remembered on the way in and restored on the way out. */
  box.addEventListener('focus', ()=> rememberSurfaceSelection(box));
  if(!box.value.trim()) box.value = DEFAULT_TEXT_COLOR;
  paint();
});

/* The words a toolbar was last pointed at, so a trip to the hex box and
   back does not lose them. */
const heldSelection = new Map();
function surfaceForHexBox(box){
  const bar = box.closest('.mini-toolbar');
  return bar ? surfaceForToolbar(bar) : null;
}
/* The remembered words go on LOOKING chosen.
 *
 * A document has one selection, so moving the caret into the hex box takes
 * it away from the text being coloured: the range was remembered and put
 * back on use, and it worked — but the highlight vanished the instant the
 * box was clicked, so the reader was typing a colour with no sign of what
 * it was for, and the natural response was to go back and select the words
 * again, which is the round trip the memory exists to avoid. A custom
 * highlight paints the same range in the same wash without owning the
 * selection, so the words stay visibly chosen while the value is typed. */
const heldHighlight = (()=>{
  try{
    if(typeof Highlight !== 'function' || !window.CSS || !CSS.highlights) return null;
    const h = new Highlight();
    CSS.highlights.set('held-selection', h);
    return h;
  }catch(e){ return null; }
})();
function paintHeldSelection(range){
  if(!heldHighlight) return;
  try{
    heldHighlight.clear();
    if(range) heldHighlight.add(range);
  }catch(e){}
}
/* The last run of words picked out in ANY editing surface.
 *
 * Reading the live selection when the hex box takes focus is not reliable:
 * a real click leaves it in place long enough to be read, and moving focus
 * by script clears it first — so the same gesture worked or did not
 * depending on how focus arrived. The selection is watched instead and the
 * last non-empty one kept, which is true whichever way the caret leaves. */
let lastSurfaceRange = null;   // {surface, range}
document.addEventListener('selectionchange', ()=>{
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if(r.collapsed) return;
  const c = r.commonAncestorContainer;
  const host = c && c.nodeType === 1 ? c : (c && c.parentNode);
  const surface = host && host.closest ? host.closest('.rich-surface') : null;
  if(surface) lastSurfaceRange = {surface, range: r.cloneRange()};
});
function rememberSurfaceSelection(box){
  const surface = surfaceForHexBox(box);
  if(!surface) return;
  let held = null;
  const sel = window.getSelection && window.getSelection();
  if(sel && sel.rangeCount){
    const r = sel.getRangeAt(0);
    if(!r.collapsed && surface.contains(r.commonAncestorContainer)) held = r.cloneRange();
  }
  if(!held && lastSurfaceRange && lastSurfaceRange.surface === surface){
    held = lastSurfaceRange.range;
  }
  if(!held) return;
  heldSelection.set(box, held);
  paintHeldSelection(held);
}
function restoreSurfaceSelection(box){
  const surface = surfaceForHexBox(box);
  if(!surface) return surface;
  /* A LIVE selection in the surface always wins over the remembered one.
     The remembered range is there for the case where focus went into the
     hex box to type a value; once the reader has gone back and picked
     different words, it is stale — and restoring it put the colour on the
     first run again and dragged the visible selection back there with it,
     which is exactly what a second colour on a second phrase looked like. */
  const sel = window.getSelection && window.getSelection();
  if(sel && sel.rangeCount){
    const live = sel.getRangeAt(0);
    if(!live.collapsed && surface.contains(live.commonAncestorContainer)){
      heldSelection.delete(box);
      paintHeldSelection(null);
      return surface;
    }
  }
  const held = heldSelection.get(box);
  if(!held){ paintHeldSelection(null); return surface; }
  paintHeldSelection(null);
  surface.focus({preventScroll:true});
  const s2 = window.getSelection();
  s2.removeAllRanges();
  s2.addRange(held);
  return surface;
}
function applyHexFromBox(box, hex){
  const surface = restoreSurfaceSelection(box) || surfaceForHexBox(box);
  if(!surface) return;
  applyRichCommand(surface, 'color', hex);
}
/* The reset control, which clears the WHOLE text rather than a selection.
 *
 * An entry paints its label in its own border colour, and a run given a
 * colour of its own overrides that. Getting back is the point of this
 * button — and getting back part-way is not a state anyone asked for: if
 * you want the entry's colour again you want it everywhere, and hunting
 * down three separately coloured runs to select each of them in turn was
 * the only way to do it. It selects everything itself and strips the lot,
 * so one press returns the text to inheriting the border. */
document.querySelectorAll('[data-hex-reset]').forEach(btn=>{
  btn.addEventListener('mousedown', ev=> ev.preventDefault());
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    /* Two kinds of toolbar carry this button now.
     *
     * On a field that offers a colour it sits beside the hex box and
     * strips the colour along with everything else. On a connector's note
     * and on a callout there IS no colour control — those are written in
     * the connector's own ink, decided by the line and not by the reader —
     * and the button was taken away with the box it stood next to, which
     * removed the only way to undo a face, a size or a bold as well. It
     * stands on its own there and clears everything the reader CAN set,
     * leaving the inherited colour exactly where it is. */
    const box = btn.parentNode.querySelector('.tb-hex');
    const surface = box ? surfaceForHexBox(box)
                        : surfaceForToolbar(btn.closest('.mini-toolbar'));
    if(!surface) return;
    if(box) heldSelection.delete(box);
    if(typeof paintHeldSelection === 'function') paintHeldSelection(null);
    surface.focus({preventScroll:true});
    const all = document.createRange();
    all.selectNodeContents(surface);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(all);
    /* Everything, not only the colour. The button reads as "put this text
       back the way it was", and leaving a face, a size, a bold and a
       reading behind while removing the colour is not that — it is one
       quarter of it, and the reader is left hunting the other three. */
    if(box) applyRichCommand(surface, 'uncolor');
    applyRichCommand(surface, 'unfont');
    applyRichCommand(surface, 'unsize');
    applyRichCommand(surface, 'unstyle');
    if(box){
      box.value = DEFAULT_TEXT_COLOR;
      box.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      // No box to fire the commit for us, so the field says so itself.
      surface.dispatchEvent(new Event('input', {bubbles:true}));
    }
  });
});

['editLabelInput','detailNoteInput','addNodeLabel','styleNote','calloutText','nodeEditorText']
  .forEach(id=> makeRichField(document.getElementById(id)));
makeRichField(document.getElementById('freeMenuText'));

/* The two fields whose Enter means more than "stop typing": the add form's
   label, where Enter is the Add button every other form on the web has
   trained the reader to expect, and the note editor, where Enter is Apply —
   the same thing its own button does, so the note closes rather than being
   left open over the entry it belongs to. */
setRichEnter('addNodeLabel', ()=>{
  const btn = document.getElementById('addNodeSubmit');
  if(btn && !btn.disabled) btn.click();
});
setRichEnter('detailNoteInput', ()=>{
  const btn = document.getElementById('detailNoteApply');
  if(btn) btn.click();
});
// A callout's words settle and the panel stays; Shift+Enter is still the
// line break, as it is in every text field on this chart.
setRichEnter('calloutText', ()=> flushCalloutCommit());

// Typing in any of these redraws the element itself, on the next frame so a
// fast typist doesn't trigger a re-layout per keystroke.
['editLabelInput','freeMenuText','calloutText','nodeEditorText'].forEach(id=>{
  const rec = richFields.get(id);
  if(!rec) return;
  rec.surface.addEventListener('input', ()=> queueLabelPreview());
});
(()=>{
  const rec = richFields.get('freeMenuText');
  if(!rec) return;
  rec.surface.addEventListener('input', ()=> queueFreeMenuCommit());
  rec.surface.addEventListener('blur', ()=> flushFreeMenuCommit());
})();
(()=>{
  const rec = richFields.get('calloutText');
  if(!rec) return;
  rec.surface.addEventListener('input', ()=> queueCalloutCommit());
  rec.surface.addEventListener('blur', ()=> flushCalloutCommit());
})();
// The rich label surface writes through to a hidden textarea, which fires
// no input events of its own — so the commit is driven from the surface.
(()=>{
  const rec = richFields.get('editLabelInput');
  if(!rec) return;
  rec.surface.addEventListener('input', ()=> queueNodeEditCommit());
  rec.surface.addEventListener('blur', ()=> flushNodeEditCommit());
})();

/* ---------------------------------------------------------------------
   The character-bio card.

   A bio circle holds a portrait and no words, so its text opens in a card
   beside it. The card is drawn in SVG through the very same code that
   draws a default node — same width, same border radius, same wrapping,
   same font handling — so it doesn't merely resemble a node, it is one.
   That also means it pans and zooms with the chart instead of floating
   over it at a fixed size.

   The card is read-only: a bio's text is its label, edited in the node's
   own settings form like every other entry's, so there is one place to
   change it rather than two that could drift apart.
   ------------------------------------------------------------------ */
const bioCardLayer = el('g', {id:'bioCardLayer'}, viewport);
let bioCardBox = null;   // world-space rect of the drawn card

const BIO_CARD_GAP = 16;
function bioSideOf(n){
  const v = n && n.bioSide;
  return (v === 'left' || v === 'right') ? v : 'auto';
}
// Kept in step with .node-bio > circle{stroke-width:2} in the stylesheet.
const BIO_BORDER_W = 2;

/* Every card that should be on the drawing right now.
 *
 * There used to be exactly one — whichever portrait the pointer was over —
 * so a portrait asked to keep its card open could not have one at the same
 * time as another was being hovered. The layer holds as many as are
 * wanted: every portrait that carries the choice, plus the transient one. */
function drawBioCard(){
  /* Which cards were ALREADY up before this redraw.
   *
   * A card fades and slides in when it opens, which is right for a card
   * that has just been asked for and quite wrong for one that was on the
   * drawing a moment ago: this layer is cleared and rebuilt whenever
   * anything else on the chart is redrawn — a click, a keystroke, an edit
   * anywhere — so a portrait keeping its card open replayed the entrance
   * every time the reader touched the chart. From the outside: a card
   * blinking at you for no reason. One that was up comes back up, with no
   * animation at all; only a genuinely new one is introduced. */
  const wasShown = new Set();
  bioCardLayer.querySelectorAll('.bio-card-g.shown').forEach(g=>{
    if(g.dataset.id) wasShown.add(g.dataset.id);
  });
  while(bioCardLayer.firstChild) bioCardLayer.removeChild(bioCardLayer.firstChild);
  bioCardBox = null;
  const want = [];
  nodes.forEach(n=>{ if((n.shape || '') === 'ellipse' && n.bioCard) want.push(n); });
  if(bioCardNodeId){
    const n = nodes.get(bioCardNodeId);
    if(n && want.indexOf(n) < 0) want.push(n);
  }
  want.forEach(n=> drawOneBioCard(n, wasShown.has(n.id)));
  paintBioCardDim();
}
/* A card steps back exactly as its portrait does.
 *
 * Selecting an entry fades everything unrelated to it, and the cards are
 * in a layer of their own that the wash never reached — so a portrait
 * asked to keep its card open faded to a ghost with a card at full
 * strength floating beside it, joined by a faded stub. The card is the
 * portrait's text, so it takes whatever the portrait takes: read off the
 * drawn entry rather than worked out a second time, which is also what
 * keeps the two from ever disagreeing. */
function paintBioCardDim(){
  bioCardLayer.querySelectorAll('.bio-card-g').forEach(g=>{
    let node = null;
    try{ node = qNode(`.node[data-id="${cssEscape(g.dataset.id || '')}"]`); }catch(e){}
    g.classList.toggle('dim', !!(node && node.classList.contains('dim')));
  });
}
// Builds the card with the node renderer's own primitives.
function drawOneBioCard(n, already){
  if(!n) return;
  const fontFamily = fontFamilyFor(n.font);
  const fontSize = (n.fontSize && n.fontSize>=6 && n.fontSize<=28) ? n.fontSize : NODE_FS;
  const fontScale = fontSize / NODE_FS;
  const lineH = LINE_H * fontScale;
  /* Sized to its words, like every other box on the chart — and then
     CLOSED ONTO THEM, the way an entry is.
   *
     It used to be a fixed BOXW whatever it held, so a two-word name sat in
     a card wide enough for a paragraph. Wrapping it to the narrowest width
     that holds the text is only half the answer: that width is where the
     text was allowed to break, and the widest line it actually made is
     usually narrower still. A portrait's card stands beside the drawing
     rather than in the flow of it, so every pixel it does not need is a
     pixel of chart it is covering. */
  let w = autoNodeWidth([n.label || ''], fontSize, fontFamily, NODE_MAX_LINES, BOXW);
  {
    const probe = { maxWidth: w - 16, fontSize, family: fontFamily };
    const chars = Math.max(8, Math.round((w - 16) / (fontSize*0.55)));
    const ink = measureTextBlock(n.label, chars, lineH, fontScale,
                                 {fontSize, family: fontFamily}, probe).width;
    if(ink > 0) w = Math.max(NODE_FIT_MINW, Math.min(w, Math.ceil(ink) + NODE_PAD_X*2));
  }
  const maxChars = Math.max(8, Math.round((w - NODE_PAD_X*2) / (fontSize*0.55)));
  const fit = { maxWidth: w - NODE_PAD_X*2, fontSize, family: fontFamily };
  const totalH = wrapAndMeasure(n.label, maxChars, lineH, fontScale, fit).totalH;
  /* The same arithmetic the width already uses, and the same an ordinary
     entry uses for both: the ink, plus the entry padding, never below the
     minimum. It used to carry eight extra pixels of floor and twelve of
     padding that nothing else on the chart has, so a card closed neatly
     onto its words across and sat in a band of empty space down — the two
     dimensions of one box behaving as though they belonged to different
     objects. */
  const h = Math.max(NODE_FIT_MINH, Math.ceil(totalH) + NODE_PAD_Y*2);

  /* Which side the card stands on.
   *
   * Right by default, and left when the right is occupied and the left is
   * not — a card is a reading aid, and one laid over the neighbouring
   * entry is worse than no card at all. Both sides busy or both clear, it
   * goes right, because a chart reads left to right and the words belong
   * after the face. A portrait may also be told which side to use, for the
   * cases arithmetic cannot know about: a card that must not cover a
   * particular thing, or a row of portraits whose cards should all hang
   * the same way whatever happens to be near each one. */
  const cx = n.x + n.w/2, cy = n.y + n.h/2;
  const wantSide = bioSideOf(n);
  const busy = (left)=>{
    const bx = left ? (n.x - BIO_CARD_GAP - w) : (n.x + n.w + BIO_CARD_GAP);
    return Array.from(nodes.values()).some(o=>
      o.id!==n.id && o.x < bx + w + 8 && o.x + o.w > bx - 8 &&
      o.y < cy + h/2 + 8 && o.y + o.h > cy - h/2 - 8);
  };
  let flip = wantSide === 'left';
  if(wantSide === 'auto') flip = busy(false) && !busy(true);
  let x = flip ? (n.x - BIO_CARD_GAP - w) : (n.x + n.w + BIO_CARD_GAP);
  const y = cy - h/2;
  bioCardBox = {x, y, w, h};

  /* Named after the portrait it belongs to. The layer holds as many cards
     as are wanted, so "the card" is not a thing that can be looked up any
     more — a caller, or a test, has to be able to say which one. */
  const g = el('g', {class:'bio-card-g' + (flip ? ' flip' : ''), 'data-id': n.id}, bioCardLayer);
  /* Reading the card means moving onto it, and moving onto it means
     leaving the portrait — which is what closed it. So the card holds
     itself open, and the stub's own width is enough to cross. */
  g.addEventListener('mouseenter', ()=> clearTimeout(bioHoverTimer));
  g.addEventListener('mouseleave', ()=>{
    if(bioCardPinned) return;
    clearTimeout(bioHoverTimer);
    bioHoverTimer = setTimeout(()=>{ if(!bioCardPinned) closeBioCard(); }, 160);
  });
  /* Double-click the card to edit the words on it.
   *
   * The card IS the portrait's text — the circle holds a picture and
   * nothing else — so it is the thing a reader points at when they want to
   * change what it says. Every other piece of text on the chart opens for
   * editing on a double click, and this one asked you to work out that the
   * words belonged to the circle beside it and to double-click that
   * instead. Same gesture, same destination: the entry's own Label, with
   * the cursor in it. */
  g.addEventListener('dblclick', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    if(document.body.classList.contains('read-only')) return;
    // On the card, which is where a portrait's words are.
    if(openNodeEditor(n.id)) return;
    openLabelEditor(n.id);
  });
  g.addEventListener('click', ev=> ev.stopPropagation());
  /* The stub joining the portrait to its card.
   *
   * Two things were wrong with it. It was painted in --line while the card
   * it leads to is painted in the entry's own border colour, so a portrait
   * with a coloured border produced a three-colour assembly out of what is
   * meant to read as one object; it now takes n.color like the card does.
   *
   * And it began at n.x + n.w — the bounding box's edge, which on a circle
   * is exactly the rightmost point of the rim. Starting there laid the
   * stub's stroke directly over the portrait's 2px border. It now starts
   * clear of the rim: half the border's width to get off the stroke, plus
   * a hair so antialiasing on the two edges does not touch either. */
  /* Starting ON the rim, not beside it.
   *
   * It used to start clear of the border's outer edge so the two strokes
   * would not overlap — which left a gap of a pixel or two at the one
   * place the eye is certain to look, and the card read as a thing
   * floating near the portrait rather than as the portrait's own card.
   * The overlap is the lesser evil, and at these weights it is invisible:
   * the stub now starts at the centre of the outermost ring's stroke, so
   * whatever the border's width the two always touch. */
  const outerR = n.w/2 + Math.max(0, ((n.colors && n.colors.length) || 1) - 1) * RING_STEP;
  const rim = n.w/2 - outerR;             // negative: outside the box, by the rings
  el('line', {x1: flip ? n.x + rim : n.x + n.w - rim, y1: cy,
              x2: flip ? x + w : x, y2: cy,
              stroke: n.color, 'stroke-width':1.2}, g);
  /* The card wears the entry's whole border, not just its first colour.
     A portrait with two or three ring colours drew them all around the
     circle and then a single plain outline around the card it opens, which
     read as two different entries side by side. Same list, same step, same
     centre-outward order as everywhere else. */
  const cardRings = (n.colors && n.colors.length) ? n.colors : [n.color];
  /* And the entry's background, on the same terms as the box: one colour
     fills the card, more than one make a gradient across it. The card is
     one of the boxes the background was said to reach in 0.9.16 and was
     the one that went on being drawn on plain paper. */
  const cardBg = (n.bg && n.bg.length)
    ? (n.bg.length > 1 ? makeGradient(n.bg, false, nodeDefs) : n.bg[0])
    : null;
  cardRings.forEach((c, i)=>{
    const grow = i*RING_STEP;
    el('rect', {x:x-grow, y:y-grow, width:w+grow*2, height:h+grow*2, rx:5+grow,
                stroke:c, style: i>0 ? 'fill:none;'
                                     : `fill:${cardBg || 'var(--panel)'};`}, g);
  });
  /* The card is written in the ENTRY's ink.
   *
   * The card IS the portrait's label — the circle holds a picture and
   * nothing else — and every other entry on the chart writes its label in
   * its own colour. This one was set in the plain body ink, so recolouring
   * a portrait repainted its rim, its stub and its card's border and left
   * the words inside black. It follows the entry now, live, and steps
   * aside for whatever colour a run of the text sets for itself; and where
   * the entry's colour would be lost against its own background it takes
   * the plain contrasting ink, exactly as a box's label does. */
  const cardInk = readableOn(cardRings[0] || 'var(--ink)',
                             (n.bg && n.bg.length) ? n.bg[0] : null);
  const txt = el('text', {x:x+w/2, y:0, 'font-size':fontSize, fill:cardInk,
    style:`font-family:${fontFamily};`}, g);
  renderNodeText(txt, n.label, y + h/2, x + w/2, maxChars, lineH, fontScale,
                 {fontSize, family:fontFamily}, fit);

  // No editing controls on the card itself: a bio's text is edited in the
  // node's own settings form like every other entry's label, so there is
  // one place to change it rather than two that could disagree.
  /* A card that was already on the drawing is put back at full strength in
     this same turn, before the browser has resolved a style for the new
     element — so there is no earlier value to animate from and no
     transition runs. A new one still arrives. */
  if(already) g.classList.add('shown');
  else requestAnimationFrame(()=> g.classList.add('shown'));
}

// The card lives inside the viewport group, so it pans and zooms with the
// chart by itself — there is nothing to re-anchor.
function positionBioCard(){}
/* Whether hovering this portrait should pop its card open.
 *
 * Two cases where it should not. A portrait asked to KEEP its card open
 * already has one on the drawing — pointing at it then set bioCardNodeId
 * as though a transient card were being opened, which redrew the layer and
 * played the card's entrance animation again under the pointer: a card
 * that is already there flickering because it was looked at.
 *
 * And while the settings of ANOTHER entry are open, the drawer is what the
 * reader is working in; a card popping up over the chart because the
 * pointer crossed a portrait on the way to the panel is a second thing
 * appearing uninvited. A pinned card is unaffected — that one was asked
 * for. */
function bioHoverWanted(id){
  const n = nodes.get(id);
  if(!n) return false;
  if(n.bioCard) return false;
  /* Whenever ANOTHER entry is the one being looked at. It used to be only
     while that entry's settings were open, on the grounds that the drawer
     alone is a lighter state — but a selection is a selection: the chart
     around it has stepped back, and a card popping up over the faded
     drawing because the pointer crossed a portrait on the way somewhere is
     the same interruption whether a form is open under it or not. */
  if(selectedId && selectedId !== id) return false;
  return true;
}
function openBioCard(id, pinned){
  const n = nodes.get(id);
  if(!n) return;
  clearTimeout(bioHoverTimer);
  if(pinned) bioCardPinned = true;
  if(bioCardNodeId === id) return;   // already showing this one
  bioCardNodeId = id;
  drawBioCard();
}
function closeBioCard(){
  clearTimeout(bioHoverTimer);
  bioCardPinned = false;
  bioCardNodeId = null;
  bioCardBox = null;
  // The cards that were ASKED for stay; only the transient one goes.
  drawBioCard();
}

/* ---------------------------------------------------------------------
   Portrait picker, shared by both forms.

   A chosen file is embedded as a data: URI rather than linked, so the
   portrait keeps working for every viewer instead of depending on a host
   that may disappear — but a full-size photo would bloat the page, so it
   is drawn onto a canvas at BIO_IMAGE_MAX first. A URL typed by hand is
   passed through untouched.
   ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Choosing which part of a picture to use.
 *
 * Both places that take an image want a square: a character bio is a
 * circular portrait, and a sticker is drawn into a square cell so that
 * stickers of different proportions still line up in a line of text.
 * Before this, both simply centred the whole picture, which is the wrong
 * answer for most photographs — a face is rarely in the middle of the
 * frame — and there was no way to say otherwise.
 *
 * The selection is held in the IMAGE's own pixels, never the preview's.
 * The preview is whatever size the layout gives it, and it changes when
 * the window resizes; keeping the rectangle in source pixels means one
 * conversion at each edge (pointer in, crop out) instead of a scale
 * factor threaded through every drag, and it cannot drift.
 *
 * openCropper() resolves with a source rect, or null if the user cancels
 * or asks for the whole image — callers treat null as "no crop", which is
 * exactly the old behaviour, so nothing had to change downstream.
 * ------------------------------------------------------------------ */
const cropOverlay = document.getElementById('cropOverlay');
const cropStage = document.getElementById('cropStage');
const cropImage = document.getElementById('cropImage');
const cropFrame = document.getElementById('cropFrame');
let cropResolve = null;      // settles the open openCropper() promise
let cropNat = {w:0, h:0};    // the image's natural size
let cropSel = {x:0, y:0, s:0};  // selection, in natural pixels
const CROP_MIN = 24;         // in natural pixels

// The preview's on-screen box, and the scale from natural px to preview px.
function cropView(){
  const img = cropImage.getBoundingClientRect();
  const stage = cropStage.getBoundingClientRect();
  return {left: img.left - stage.left, top: img.top - stage.top,
          w: img.width, h: img.height,
          k: cropNat.w ? img.width / cropNat.w : 1};
}
function paintCropFrame(){
  const v = cropView();
  cropFrame.style.left   = (v.left + cropSel.x * v.k) + 'px';
  cropFrame.style.top    = (v.top  + cropSel.y * v.k) + 'px';
  cropFrame.style.width  = (cropSel.s * v.k) + 'px';
  cropFrame.style.height = (cropSel.s * v.k) + 'px';
}
function clampCropSel(){
  const maxS = Math.min(cropNat.w, cropNat.h);
  cropSel.s = Math.max(Math.min(CROP_MIN, maxS), Math.min(cropSel.s, maxS));
  cropSel.x = Math.max(0, Math.min(cropSel.x, cropNat.w - cropSel.s));
  cropSel.y = Math.max(0, Math.min(cropSel.y, cropNat.h - cropSel.s));
}
// Starts with the largest centred square — the old behaviour, so leaving
// the dialog untouched gives exactly the previous result.
function resetCropSel(){
  const s = Math.min(cropNat.w, cropNat.h);
  cropSel = {x:(cropNat.w - s)/2, y:(cropNat.h - s)/2, s};
  paintCropFrame();
}
function closeCropper(result){
  cropOverlay.classList.remove('open');
  const done = cropResolve; cropResolve = null;
  if(cropImage.src && cropImage.src.startsWith('blob:')) URL.revokeObjectURL(cropImage.src);
  if(done) done(result);
}
/* `shape` is 'circle' for a character bio and 'square' for a sticker.
   It changes only what the chooser DRAWS. The selection stays a square
   either way, because a bio's picture is stored square and clipped to a
   circle when the entry is rendered — so a circular selection would be
   the same rectangle with the corners thrown away twice. What the round
   frame buys is honesty: the user sees the part that will actually
   survive the clip, instead of picking a square and being surprised by
   which corners vanish. */
function openCropper(file, title, shape){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error(`"${file.name}" is not an image this browser can read.`)); };
    probe.onload = ()=>{
      cropNat = {w: probe.naturalWidth, h: probe.naturalHeight};
      cropImage.src = url;
      document.getElementById('cropTitle').textContent = title || 'Choose the part to use';
      cropFrame.classList.toggle('circle', shape === 'circle');
      document.getElementById('cropHint').textContent = shape === 'circle'
        ? 'Drag inside the circle to move it, or a corner to resize. Only what is inside the circle is kept.'
        : 'Drag inside the square to move it, or a corner to resize.';
      cropOverlay.classList.add('open');
      cropResolve = resolve;
      // The frame can only be placed once the preview has been laid out.
      requestAnimationFrame(()=> requestAnimationFrame(resetCropSel));
    };
    probe.src = url;
  });
}

/* Dragging. One pointer handler for both gestures: inside the frame moves
   it, a corner grip resizes it. Corners resize about the OPPOSITE corner,
   which is what makes a square selection feel like it is being pulled
   rather than sliding away from the pointer. */
{
  let mode = null, grip = null, startPt = null, startSel = null;
  const toNatural = ev=>{
    const v = cropView();
    const stage = cropStage.getBoundingClientRect();
    return {x: (ev.clientX - stage.left - v.left) / v.k,
            y: (ev.clientY - stage.top  - v.top ) / v.k};
  };
  cropFrame.addEventListener('pointerdown', ev=>{
    ev.preventDefault(); ev.stopPropagation();
    grip = ev.target && ev.target.dataset ? ev.target.dataset.grip : null;
    mode = grip ? 'resize' : 'move';
    startPt = toNatural(ev);
    startSel = Object.assign({}, cropSel);
    cropFrame.setPointerCapture(ev.pointerId);
  });
  cropFrame.addEventListener('pointermove', ev=>{
    if(!mode) return;
    const p = toNatural(ev);
    const dx = p.x - startPt.x, dy = p.y - startPt.y;
    if(mode === 'move'){
      cropSel.x = startSel.x + dx;
      cropSel.y = startSel.y + dy;
    } else {
      // The corner being dragged away from stays put; the square grows
      // toward the pointer by whichever axis moved further, so the shape
      // stays square without the pointer having to move diagonally.
      const west = grip === 'nw' || grip === 'sw';
      const north = grip === 'nw' || grip === 'ne';
      const anchorX = west ? startSel.x + startSel.s : startSel.x;
      const anchorY = north ? startSel.y + startSel.s : startSel.y;
      let s = Math.max(startSel.s + (west ? -dx : dx), startSel.s + (north ? -dy : dy));
      s = Math.max(CROP_MIN, s);
      // Never let a corner push the square off the picture.
      s = Math.min(s, west ? anchorX : cropNat.w - anchorX,
                      north ? anchorY : cropNat.h - anchorY);
      cropSel.s = s;
      cropSel.x = west ? anchorX - s : anchorX;
      cropSel.y = north ? anchorY - s : anchorY;
    }
    clampCropSel();
    paintCropFrame();
  });
  const end = ev=>{
    if(!mode) return;
    mode = null; grip = null;
    try{ cropFrame.releasePointerCapture(ev.pointerId); }catch(e){}
  };
  cropFrame.addEventListener('pointerup', end);
  cropFrame.addEventListener('pointercancel', end);
  window.addEventListener('resize', ()=>{ if(cropOverlay.classList.contains('open')) paintCropFrame(); });
}
document.getElementById('cropUse').onclick = ()=> closeCropper(Object.assign({}, cropSel));
document.getElementById('cropWhole').onclick = ()=> closeCropper(null);
document.getElementById('cropCancel').onclick = ()=> closeCropper('cancel');
document.getElementById('cropClose').onclick = ()=> closeCropper('cancel');
cropOverlay.addEventListener('click', ev=>{ if(ev.target === cropOverlay) closeCropper('cancel'); });
document.addEventListener('keydown', ev=>{
  if(ev.key === 'Escape' && cropOverlay.classList.contains('open')){
    ev.stopPropagation();
    closeCropper('cancel');
  }
}, true);

const BIO_IMAGE_MAX = 240;
const bioImageFile = document.getElementById('bioImageFile');
let bioImageTargetInput = null;

// `crop` is a rect in the source image's own pixels, or null for all of it.
function downscaleToDataURI(file, crop){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error('could not read that file.'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('that file is not an image this browser can read.'));
      img.onload = ()=>{
        const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
        const sw = crop ? crop.s : img.width, sh = crop ? crop.s : img.height;
        const scale = Math.min(1, BIO_IMAGE_MAX/Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw*scale));
        const h = Math.max(1, Math.round(sh*scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        // JPEG unless the source had transparency worth keeping.
        const type = /png|webp|gif/i.test(file.type) ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
bioImageFile.addEventListener('change', async ()=>{
  const file = bioImageFile.files && bioImageFile.files[0];
  bioImageFile.value = '';
  if(!file || !bioImageTargetInput) return;
  const target = bioImageTargetInput;
  try{
    /* This picker also feeds the free-standing Image element and a card's
       picture slot, which are rectangles — only a character bio is round,
       so the round frame is shown only when the entry actually is one.
       Both selects are reached by id at call time rather than captured:
       they are declared further down the file, and a `const` read before
       its declaration throws even through `typeof`. */
    const shapeSel = target && target.id === 'addNodeImage'
      ? document.getElementById('addNodeShape')
      : document.getElementById('editShapeInput');
    const roundTarget = !!shapeSel && shapeSel.value === 'ellipse';
    const crop = await openCropper(file, 'Choose the part of the picture to use',
                                   roundTarget ? 'circle' : 'square');
    if(crop === 'cancel') return;
    target.value = await downscaleToDataURI(file, crop);
    target.dispatchEvent(new Event('input', {bubbles:true}));
  }catch(err){
    setEditStatus('err', 'Portrait: ' + err.message);
  }
});
function wireImagePicker(pickBtnId, clearBtnId, inputId){
  const input = document.getElementById(inputId);
  document.getElementById(pickBtnId).onclick = (ev)=>{
    ev.stopPropagation();
    bioImageTargetInput = input;
    bioImageFile.click();
  };
  document.getElementById(clearBtnId).onclick = (ev)=>{
    ev.stopPropagation();
    input.value = '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
  };
}
wireImagePicker('editImagePick', 'editImageClear', 'editImageInput');
wireImagePicker('addNodeImagePick', 'addNodeImageClear', 'addNodeImage');

/* ---------------------------------------------------------------------
   The sticker library UI.

   Two halves: the full library (a tab of its own, where pictures are
   uploaded, renamed and removed) and the miniature picker that drops out
   of the ☺ button beside every text field, which is how a sticker
   actually gets into a sentence.

   A still picture is redrawn small before it is stored, the same way a
   portrait is. An animated GIF cannot survive that — a canvas keeps only
   the first frame — so a GIF is stored byte-for-byte and simply refused
   if it is too big to belong in a page.
   ------------------------------------------------------------------ */
const STICKER_MAX = 128;              // px, for still pictures
const STICKER_GIF_LIMIT = 512 * 1024; // bytes of source GIF

const stickerOverlay = document.getElementById('stickerOverlay');
const stickerGrid = document.getElementById('stickerGrid');
const stickerFile = document.getElementById('stickerFile');
const stickerStatusEl = document.getElementById('stickerStatus');
const stickerPicker = document.getElementById('stickerPicker');
const stickerPickerGrid = document.getElementById('stickerPickerGrid');
let stickerPickerTarget = null;       // the rich surface a pick will land in

function setStickerStatus(kind, msg){
  stickerStatusEl.className = 'sticker-status editor-status show ' + kind;
  stickerStatusEl.textContent = msg;
}
function clearStickerStatus(){
  stickerStatusEl.className = 'sticker-status editor-status';
  stickerStatusEl.textContent = '';
}

function applyStickerEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  rebuildStickerMap();
  rebuildChart();
  renderStickerLibrary();
  refreshSaveUI();
}

function uniqueStickerKey(base){
  let k = (base || 'sticker').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'sticker';
  const taken = new Set(STICKERS.map(s=>s.key));
  if(!taken.has(k)) return k;
  let i = 2;
  while(taken.has(k + '-' + i)) i++;
  return k + '-' + i;
}

// Reads one chosen file into something storable: a GIF as-is (so it keeps
// moving), anything else squared off and shrunk.
function stickerDataFromFile(file, crop){
  if(/gif/i.test(file.type)){
    if(file.size > STICKER_GIF_LIMIT){
      return Promise.reject(new Error(`"${file.name}" is ${Math.round(file.size/1024)} KB — GIF stickers have to stay under ${Math.round(STICKER_GIF_LIMIT/1024)} KB, because the whole picture is stored inside the chart.`));
    }
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onerror = ()=> reject(new Error(`could not read "${file.name}".`));
      reader.onload = ()=> resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error(`could not read "${file.name}".`));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error(`"${file.name}" is not an image this browser can read.`));
      img.onload = ()=>{
        // Drawn into a square, so stickers of different proportions still
        // line up in a row of text. A crop is already square, so it fills
        // the cell; without one the whole picture is centred as before.
        const side = STICKER_MAX;
        const canvas = document.createElement('canvas');
        canvas.width = side; canvas.height = side;
        const ctx = canvas.getContext('2d');
        if(crop){
          ctx.drawImage(img, crop.x, crop.y, crop.s, crop.s, 0, 0, side, side);
        } else {
          const scale = Math.min(side/img.width, side/img.height);
          const w = Math.max(1, Math.round(img.width*scale));
          const h = Math.max(1, Math.round(img.height*scale));
          ctx.drawImage(img, (side-w)/2, (side-h)/2, w, h);
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let stickerReplaceKey = null;   // set when the picker is replacing one
stickerFile.addEventListener('change', async ()=>{
  const files = Array.from(stickerFile.files || []);
  stickerFile.value = '';
  const replacing = stickerReplaceKey;
  stickerReplaceKey = null;
  if(!files.length) return;
  clearStickerStatus();
  const added = [], failed = [];
  for(const f of files){
    try{
      /* A GIF is stored whole so it keeps moving — a canvas would flatten
         it to its first frame — so there is nothing to crop and asking
         would only offer a choice that could not be honoured. */
      let crop = null;
      if(!/gif/i.test(f.type)){
        crop = await openCropper(f, files.length > 1
          ? `Choose the part to use — ${f.name}`
          : 'Choose the part of the picture to use');
        if(crop === 'cancel') continue;
      }
      added.push({file:f, src: await stickerDataFromFile(f, crop)});
    }
    catch(err){ failed.push(err.message); }
  }
  if(added.length){
    applyStickerEdit(()=>{
      if(replacing){
        const s = STICKERS.find(x=>x.key===replacing);
        if(s) s.src = added[0].src;
        return;
      }
      added.forEach(a=>{
        const base = a.file.name.replace(/\.[^.]+$/, '');
        STICKERS.push({ key: uniqueStickerKey(base), name: base.slice(0,40) || 'sticker', src: a.src });
      });
    });
  }
  if(failed.length) setStickerStatus('err', failed.join('\n'));
  else if(added.length) setStickerStatus('ok', added.length === 1 ? 'Sticker added.' : `${added.length} stickers added.`);
});

function renderStickerLibrary(){
  stickerGrid.innerHTML = '';
  if(!STICKERS.length){
    const p = document.createElement('div');
    p.className = 'sticker-empty';
    p.textContent = readOnlyView
      ? 'This chart has no stickers yet.'
      : 'No stickers yet — add a few and they will show up beside every text field.';
    stickerGrid.appendChild(p);
    return;
  }
  STICKERS.forEach(s=>{
    const cell = document.createElement('div');
    cell.className = 'sticker-cell';
    const img = document.createElement('img');
    img.src = s.src; img.alt = s.name || s.key;
    /* A sticker is its picture — there is nothing to read in a name, and
       the box asking for one only made the tile taller. Removing it also
       lets the tile shrink to the picture, which is why Delete no longer
       fits as a word: it is a cross in the corner instead. */
    const actions = document.createElement('div');
    actions.className = 'sticker-cell-actions';
    const replace = document.createElement('button');
    replace.className = 'editor-btn'; replace.type = 'button'; replace.textContent = 'Replace';
    replace.onclick = ()=>{ stickerReplaceKey = s.key; stickerFile.click(); };
    const del = document.createElement('button');
    del.className = 'sticker-del'; del.type = 'button'; del.textContent = '\u2715';
    del.title = 'Remove this sticker from the library. Text already using it keeps a small empty square where it was.';
    del.onclick = ()=>{
      applyStickerEdit(()=>{
        const i = STICKERS.findIndex(x=>x.key===s.key);
        if(i>=0) STICKERS.splice(i,1);
      });
    };
    actions.append(replace);
    cell.append(img, actions, del);
    stickerGrid.appendChild(cell);
  });
}

function openStickerLibrary(){
  clearStickerStatus();
  renderStickerLibrary();
  stickerOverlay.classList.add('open');
}
document.getElementById('stickersToggle').onclick = ()=>{
  closeToolbarMenus('stickerOverlay');
  openStickerLibrary();
};
document.getElementById('stickerClose').onclick = ()=> stickerOverlay.classList.remove('open');
stickerOverlay.addEventListener('click', e=>{ if(e.target===stickerOverlay) stickerOverlay.classList.remove('open'); });
document.getElementById('stickerUpload').onclick = ()=>{ stickerReplaceKey = null; stickerFile.click(); };

/* The miniature picker. One ☺ button is added to every formatting toolbar
   on the page, so a sticker can be dropped in wherever text is written. */
function closeStickerPicker(){
  stickerPicker.classList.remove('open');
  stickerPickerTarget = null;
}
function openStickerPicker(btn, surface){
  stickerPickerTarget = surface;
  renderStickerPicker();
  stickerPicker.classList.add('open');
  const r = btn.getBoundingClientRect();
  const pr = stickerPicker.getBoundingClientRect();
  let left = Math.min(r.left, window.innerWidth - pr.width - 10);
  let top = r.bottom + 6;
  if(top + pr.height > window.innerHeight - 10) top = Math.max(10, r.top - pr.height - 6);
  stickerPicker.style.left = Math.max(10, left) + 'px';
  stickerPicker.style.top = top + 'px';
}
function renderStickerPicker(){
  stickerPickerGrid.innerHTML = '';
  if(!STICKERS.length){
    const p = document.createElement('div');
    p.className = 'sticker-picker-empty';
    p.textContent = 'No stickers in this chart yet.';
    stickerPickerGrid.appendChild(p);
    return;
  }
  STICKERS.forEach(s=>{
    const b = document.createElement('button');
    b.type = 'button'; b.title = s.name || s.key;
    const img = document.createElement('img');
    img.src = s.src; img.alt = s.name || s.key;
    b.appendChild(img);
    b.onclick = (ev)=>{ ev.stopPropagation(); insertSticker(s.key); };
    stickerPickerGrid.appendChild(b);
  });
}
/* Inserting a chip at the caret. execCommand is used for the same reason
   the sticker button uses it: it keeps the caret where the user left it,
   which is what makes "cite here" mean here rather than at the end. The
   trailing space is not cosmetic — without it the caret lands inside the
   chip's own boundary on some engines and the next character typed is
   swallowed into an element marked contenteditable="false". */
/* execCommand inserts at the SELECTION, and a surface that has never been
   clicked into has none — focus() alone does not always create one. That
   is why inserting a sticker or a citation did nothing in a connector's
   note: the picker was reached from the toolbar without the note ever
   having been typed in, so there was no caret for the insert to land at.
   Putting one at the end first makes the insert land somewhere real. */
function placeCaretIn(surface){
  surface.focus({preventScroll:true});
  const sel = window.getSelection && window.getSelection();
  if(!sel) return;
  const inside = sel.rangeCount > 0 && surface.contains(sel.getRangeAt(0).commonAncestorContainer);
  if(inside) return;
  const r = document.createRange();
  r.selectNodeContents(surface);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}
/* Inserted through the Range API rather than execCommand.
 *
 * execCommand('insertHTML') silently declines to place an element marked
 * contenteditable="false" — which is exactly what a citation chip is — and
 * returns success while changing nothing. That is why inserting a citation
 * into a connector's note did nothing at all: the call was made, the
 * surface was right, and the DOM simply never moved.
 *
 * Building the nodes and dropping them at the caret is both reliable and
 * less magical: the caret ends up after what was inserted, where the next
 * keystroke belongs. */
function insertIntoSurface(surface, markup){
  if(!surface) return;
  placeCaretIn(surface);
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount){ return; }
  let range = sel.getRangeAt(0);
  /* Never INSIDE a reading. A reading is a word with an annotation over
     it, and its two halves are plain text by definition — a picture
     dropped between its letters had nowhere to be written down, so it was
     silently thrown away the next time the text was read back. The caret
     steps out to just after the reading instead, which is where a sticker
     put "on that word" belongs. */
  {
    const host = range.startContainer;
    const e0 = host && (host.nodeType === 1 ? host : host.parentElement);
    const rb = e0 && e0.closest ? e0.closest('ruby') : null;
    if(rb && surface.contains(rb)){
      range = document.createRange();
      range.setStartAfter(rb);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  range.deleteContents();

  const holder = document.createElement('div');
  holder.innerHTML = inlineToHtml(markup);
  const frag = document.createDocumentFragment();
  while(holder.firstChild) frag.appendChild(holder.firstChild);
  /* No space of its own. A citation is written flush against the word it
     cites, and adding one meant every insert had to be un-typed. The caret
     is placed after the inserted run instead, which is where the next
     keystroke belongs. */
  const lastNode = frag.lastChild;
  range.insertNode(frag);
  if(lastNode){
    const after = document.createRange();
    after.setStartAfter(lastNode);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }

  surface.dispatchEvent(new Event('input', {bubbles:true}));
}
function insertSticker(key){
  const surface = stickerPickerTarget;
  closeStickerPicker();
  if(!surface) return;
  // Same route as a citation: see insertIntoSurface.
  insertIntoSurface(surface, `{{s:${key}}}`);
}
document.getElementById('stickerPickerManage').onclick = (ev)=>{
  ev.stopPropagation();
  closeStickerPicker();
  /* Reached from a text field inside another panel, so this one opens over
     what is already there instead of replacing it — otherwise managing a
     sticker would throw away the half-written entry that wanted it. */
  openStickerLibrary();
};
stickerPicker.addEventListener('click', ev=> ev.stopPropagation());
document.addEventListener('mousedown', ev=>{
  if(!stickerPicker.classList.contains('open')) return;
  if(stickerPicker.contains(ev.target) || (ev.target.closest && ev.target.closest('.tb-sticker-btn'))) return;
  closeStickerPicker();
});

// Every formatting toolbar gets the button, including the ones inside
// language-tab rows that are built after this runs — hence the observer.
function addStickerButton(bar){
  if(bar.querySelector('.tb-sticker-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-sticker-btn';
  btn.textContent = '☺';
  btn.title = 'Insert a sticker';
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(stickerPicker.classList.contains('open') ){ closeStickerPicker(); return; }
    const surface = surfaceForToolbar(bar);
    if(surface) openStickerPicker(btn, surface);
  });
  bar.appendChild(btn);
}
// Which editing surface a toolbar acts on — the same resolution the B/I
// buttons use, so the sticker lands in the field the toolbar belongs to.
function surfaceForToolbar(bar){
  const target = bar.querySelector('[data-wrap-target]');
  const id = target && target.dataset.wrapTarget;
  const listGetter = LANG_TAB_TOOLBARS[id];
  if(listGetter){
    const list = listGetter();
    return langTabActiveSurface.get(list) || list.querySelector('.lang-tab-text');
  }
  const rec = richFields.get(id);
  return rec ? rec.surface : null;
}
/* The cite button, on every formatting toolbar beside the sticker one.
   Inserting is a menu rather than free typing because the token carries a
   key, not a number: nobody should have to know or type "{{r:beast-wars}}",
   and picking from the list is also what guarantees the mark points at a
   reference that exists. */
function addRefButton(bar){
  if(bar.querySelector('.tb-ref-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-ref-btn';
  btn.textContent = '[n]';
  btn.title = 'Cite a reference';
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    const surface = surfaceForToolbar(bar);
    if(!surface) return;
    if(!REFS.length){
      openRefsPanel(null);
      setRefsStatus('err', 'Add a reference first, then cite it from the text.');
      return;
    }
    openRefPicker(btn, surface);
  });
  bar.appendChild(btn);
}
/* The picker reuses the sticker picker's shell — same shape, same place,
   same dismissal — so the two insert buttons behave identically. */
const refPicker = document.getElementById('refPicker');
const refPickerGrid = document.getElementById('refPickerGrid');
let refPickerSurface = null;
function openRefPicker(anchorBtn, surface){
  refPickerSurface = surface;
  refPickerGrid.innerHTML = '';
  REFS.forEach((r, i)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ref-pick';
    b.innerHTML = `<span class="ref-num">[${i+1}]</span><span>${escapeHtml(refBodyText(r)) || '<em>empty</em>'}</span>`;
    b.addEventListener('click', ev=>{
      ev.stopPropagation();
      insertIntoSurface(surface, '{{r:' + r.key + '}}');
      closeRefPicker();
    });
    refPickerGrid.appendChild(b);
  });
  const rect = anchorBtn.getBoundingClientRect();
  refPicker.style.left = Math.max(8, Math.min(window.innerWidth - 232, rect.left)) + 'px';
  refPicker.style.top = (rect.bottom + 6) + 'px';
  refPicker.classList.add('open');
}
function closeRefPicker(){ refPicker.classList.remove('open'); refPickerSurface = null; }
refPicker.addEventListener('click', ev=> ev.stopPropagation());
document.addEventListener('mousedown', ev=>{
  if(!refPicker.classList.contains('open')) return;
  if(refPicker.contains(ev.target) || (ev.target.closest && ev.target.closest('.tb-ref-btn'))) return;
  closeRefPicker();
});

/* A face picker on every text toolbar.
 *
 * Font used to be a property of a whole entry, chosen in a select above the
 * label — so a connector's note, a language tab and a free text field had
 * no way to set one at all, and no text anywhere could mix two faces. It is
 * markup now, like bold and colour, which gives every field the same
 * control and makes it work on a selection rather than on everything. */
/* The sizes the toolbar offers. A hand-typed value is still accepted by
   the command underneath; this is just the list worth pointing at. */
const TB_SIZES = [7, 8, 9, 10, 11.5, 13, 15, 17, 20, 24, 28, 34];
function addFontButton(bar){
  if(bar.querySelector('.tb-font')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const sel = document.createElement('select');
  sel.className = 'tb-font';
  sel.title = 'Face for the selected text — or, with nothing selected, for the whole of it';
  /* "custom" is something the picker SAYS, never something you can pick:
     hidden keeps it out of the list that drops down, while a select still
     shows a hidden option's label when that option is the selected one. */
  sel.innerHTML = '<option value="">Face…</option>' +
    '<option value="__mixed__" class="tb-custom" hidden>custom</option>' +
    FONT_OPTIONS.map(f=> `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join('') +
    '<option value="__clear__">— clear —</option>';
  // Choosing must not first collapse the selection the choice is for.
  sel.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
  sel.addEventListener('change', ev=>{
    ev.stopPropagation();
    const key = sel.value;
    const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
    if(!surface || !key || key === '__mixed__'){ syncToolbarFace(bar); return; }
    applyRichCommand(surface, key === '__clear__' ? 'unfont' : 'font', key);
    syncToolbarFace(bar);
  });
  bar.appendChild(sel);

  const size = document.createElement('select');
  size.className = 'tb-font tb-size';
  size.title = 'Size for the selected text — or, with nothing selected, for the whole of it';
  size.innerHTML = '<option value="">Size…</option>' +
    '<option value="__mixed__" class="tb-custom" hidden>custom</option>' +
    TB_SIZES.map(v=> `<option value="${v}">${v}</option>`).join('') +
    '<option value="__clear__">— clear —</option>';
  size.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
  size.addEventListener('change', ev=>{
    ev.stopPropagation();
    const v = size.value;
    const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
    if(!surface || !v || v === '__mixed__'){ syncToolbarFace(bar); return; }
    applyRichCommand(surface, v === '__clear__' ? 'unsize' : 'size', v);
    syncToolbarFace(bar);
  });
  bar.appendChild(size);
}

/* What the two pickers SHOW: the face and the size the text is actually
   set in.
 *
 * They used to be write-only — pick a face, watch it apply, and the picker
 * went straight back to saying "Face…", so nothing on the page ever told
 * you what a run was set in. Now they report: one face across everything
 * looked at shows that face, a mixture shows "custom", and nothing of
 * their own shows the placeholder. With no selection they describe the
 * whole text, which is what the entry-wide dropdown used to be for. */
/* What the text in this field is set in when nothing overrides it.
 *
 * With the entry-wide face and size controls gone, "the size of this text"
 * is a question the toolbar has to answer for itself — and the honest
 * answer for a run that carries no size of its own is the size it is
 * actually drawn at, not "nothing". Otherwise a plain label reported no
 * size at all, which read as the picker having lost track. */
function baseTypeFor(surface){
  const rec = [...richFields.entries()].find(([, v])=> v.surface === surface);
  const id = rec ? rec[0] : null;
  const ofNode = (id === 'editLabelInput') && selectedId ? nodes.get(selectedId) : null;
  const langTab = surface && surface.classList && surface.classList.contains('lang-tab-text')
    && selectedId ? nodes.get(selectedId) : null;
  const n = ofNode || langTab;
  return {
    face: (n && n.font) || FONT_OPTIONS[0].key,
    size: (n && typeof n.fontSize === 'number') ? n.fontSize : NODE_FS
  };
}
function runsOfSelection(surface){
  const sel = window.getSelection && window.getSelection();
  let range = null;
  if(sel && sel.rangeCount){
    const r0 = sel.getRangeAt(0);
    if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)) range = r0;
  }
  const out = [];
  const walk = (node, face, size)=>{
    Array.from(node.childNodes).forEach(child=>{
      if(child.nodeType === 3){
        if(!child.textContent || !/\S/.test(child.textContent)) return;
        if(range && !range.intersectsNode(child)) return;
        out.push({face, size});
        return;
      }
      if(child.nodeType !== 1) return;
      const f = fontKeyOfEl(child) || face, z = sizeOfEl(child) || size;
      /* A sticker and a citation are runs in their own right — a picture
         and a chip, not words. A sticker has no text inside it to find, so
         it contributed nothing at all and a phrase carrying one set larger
         reported a single size: the picker said 11.5 where it should have
         said "custom". A citation's own digits are not text anyone typed
         either, so it answers as one run rather than as its label. */
      if(child.dataset && (child.dataset.sticker || child.dataset.ref)){
        /* It has a SIZE — that is how either of them is enlarged — but no
           FACE: a picture is not set in a typeface, and counting one made
           the face picker report "custom" for a phrase that was all in one
           face with a sticker in it. Colour is already inert on both for
           the same reason; this is the same rule for type. */
        if(!range || range.intersectsNode(child)) out.push({face:null, size:z, noFace:true});
        return;
      }
      walk(child, f, z);
    });
  };
  walk(surface, null, null);
  return out;
}
function commonValue(list, pick){
  if(!list.length) return null;
  const first = pick(list[0]);
  return list.every(r=> pick(r) === first) ? (first === null ? '' : String(first)) : '__mixed__';
}
function syncToolbarFace(bar){
  if(!bar) return;
  const surface = surfaceForToolbar(bar);
  const face = bar.querySelector('.tb-font:not(.tb-size)');
  const size = bar.querySelector('.tb-size');
  if(!surface){ if(face) face.value = ''; if(size) size.value = ''; return; }
  const base = baseTypeFor(surface);
  // A run with nothing of its own is set in the field's own face and size,
  // and that is what the picker should say.
  const runs = runsOfSelection(surface).map(r=> ({
    face: r.face || base.face,
    size: r.size || base.size,
    noFace: !!r.noFace
  }));
  const put = (sel, v)=>{
    if(!sel) return;
    if(v === null){ sel.value = ''; return; }
    if(v === '__mixed__'){ sel.value = '__mixed__'; mark(sel); return; }
    sel.value = [...sel.options].some(o=> o.value === v) ? v : '__mixed__';
    mark(sel);
  };
  /* Italics on the OPTION never showed: a closed select draws the selected
     option's label in the select's own type, not the option's, so the rule
     applied only inside the drop-down list — where "custom" is hidden and
     therefore never appears. The select itself has to carry it. */
  const mark = (sel)=> sel.classList.toggle('is-custom', sel.value === '__mixed__');
  put(face, commonValue(runs.filter(r=> !r.noFace), r=> r.face));
  put(size, commonValue(runs, r=> r.size));
}
function syncEveryToolbarFace(){
  document.querySelectorAll('.mini-toolbar').forEach(syncToolbarFace);
}
// Whichever toolbar owns this surface — matched by asking each of them,
// which is the same question the commands ask when they act.
function toolbarForSurface(surface){
  return [...document.querySelectorAll('.mini-toolbar')]
    .find(bar=> surfaceForToolbar(bar) === surface) || null;
}
document.addEventListener('selectionchange', ()=>{
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const host = sel.getRangeAt(0).commonAncestorContainer;
  const el0 = host && (host.nodeType === 1 ? host : host.parentElement);
  const surface = el0 && el0.closest && el0.closest('.rich-surface');
  if(!surface) return;
  const bar = toolbarForSurface(surface);
  syncToolbarFace(bar);
  syncToolbarLines(bar);
});
/* The same hold-and-restore the hex box uses, keyed by toolbar. */
const heldBarSelection = new Map();
function rememberToolbarSelection(bar){
  const surface = surfaceForToolbar(bar);
  const sel = window.getSelection && window.getSelection();
  if(!surface || !sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if(surface.contains(r.commonAncestorContainer)) heldBarSelection.set(bar, r.cloneRange());
}
function restoreToolbarSelection(bar){
  const surface = surfaceForToolbar(bar);
  if(!surface) return surface;
  // Live selection first, remembered one only as a fallback — same rule,
  // and for the same reason, as restoreSurfaceSelection above.
  const live = window.getSelection && window.getSelection();
  if(live && live.rangeCount){
    const r0 = live.getRangeAt(0);
    if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)){
      heldBarSelection.delete(bar);
      return surface;
    }
  }
  const held = heldBarSelection.get(bar);
  if(!held) return surface;
  surface.focus({preventScroll:true});
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(held);
  return surface;
}
/* A rule under the words, and one through them.
 *
 * Each is a button that turns the line on and off, with the KIND of line
 * beside it — the same choice of line a connector offers. A citation is
 * exempt from both: it is a chip, not a word, and a rule drawn across a
 * number that points somewhere reads as a number that has been cancelled.
 * The style picker sits between the two buttons because it belongs to
 * whichever of them is on; changing it restyles whatever is already
 * there. */
function addLineButtons(bar){
  if(bar.querySelector('.tb-line-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const mk = (kind, glyph, title)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-line-btn tb-line-' + kind;
    b.innerHTML = glyph;
    b.title = title;
    b.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
    b.addEventListener('click', ev=>{
      ev.stopPropagation();
      const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
      if(!surface) return;
      const pick = bar.querySelector('.tb-line-style');
      applyRichCommand(surface, kind, pick ? pick.value : 'solid');
      syncToolbarLines(bar);
    });
    return b;
  };
  /* The three read as one control and are kept on one line: the button
     that turns a rule on, the kind of rule, and the button for the other
     rule. Wrapping between them made the picker look as though it
     belonged to whatever happened to end up beside it. */
  const group = document.createElement('span');
  group.className = 'tb-line-group';
  group.appendChild(mk('under', '<span style="text-decoration:underline">U</span>', 'Rule under the selected text'));
  const pick = document.createElement('select');
  pick.className = 'tb-font tb-line-style';
  pick.title = 'What kind of rule';
  pick.innerHTML = Object.keys(LINE_STYLES)
    .map(k=> `<option value="${k}">${LINE_STYLES[k].label}</option>`).join('');
  pick.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
  pick.addEventListener('change', ev=>{
    ev.stopPropagation();
    /* Changing the kind restyles a rule that is already there rather than
       waiting to be asked again — which is what a picker beside a pressed
       button is understood to do. */
    const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
    if(!surface) return;
    const state = lineStateOf(surface);
    if(state.under) applyRichCommand(surface, 'under', pick.value, true);
    if(state.strike) applyRichCommand(surface, 'strike', pick.value, true);
    syncToolbarLines(bar);
  });
  group.appendChild(pick);
  group.appendChild(mk('strike', '<span style="text-decoration:line-through">S</span>', 'Rule through the selected text'));
  bar.appendChild(group);
}
/* Whether the selection already carries a rule, and of what kind. */
function lineStateOf(surface){
  const sel = window.getSelection && window.getSelection();
  let range = null;
  if(sel && sel.rangeCount){
    const r0 = sel.getRangeAt(0);
    if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)) range = r0;
  }
  const out = {under:null, strike:null};
  const walk = (node, u, k)=>{
    Array.from(node.childNodes).forEach(child=>{
      if(child.nodeType === 3){
        if(!/\S/.test(child.textContent || '')) return;
        if(range && !range.intersectsNode(child)) return;
        if(u) out.under = u;
        if(k) out.strike = k;
        return;
      }
      if(child.nodeType !== 1) return;
      walk(child, underOfEl(child) || u, strikeOfEl(child) || k);
    });
  };
  walk(surface, null, null);
  return out;
}
function syncToolbarLines(bar){
  const surface = surfaceForToolbar(bar);
  const u = bar.querySelector('.tb-line-under'), k = bar.querySelector('.tb-line-strike');
  const pick = bar.querySelector('.tb-line-style');
  if(!u || !k) return;
  const st = surface ? lineStateOf(surface) : {under:null, strike:null};
  u.classList.toggle('on', !!st.under);
  k.classList.toggle('on', !!st.strike);
  if(pick && (st.under || st.strike)) pick.value = st.under || st.strike;
}
/* ---------------------------------------------------------------------
   Figures in a comment.

   The button lives on the comment's own toolbar and nowhere else. An
   entry's LABEL is drawn into the chart as SVG text, and a picture cannot
   go there — offering the button on every field would have been offering
   something that silently vanished on three fields out of four.

   A picture is redrawn to a sensible column width before it is stored,
   the way a sticker and a portrait already are; a clip is stored as it
   came, because there is no way to re-encode video in a page, and refused
   outright above a size that would make the chart unopenable. A link is
   the way out of that: it costs the chart nothing and needs the network.
   ------------------------------------------------------------------ */
const MEDIA_IMG_MAX = 760;               // px, the widest a stored picture is kept
/* How wide a re-encoded clip is kept, and the floor below which shrinking
   it further buys a file nobody wants to watch. */
const MEDIA_VIDEO_MAX_W = 640;
const MEDIA_VIDEO_MIN_BPS = 140e3;
const MEDIA_VIDEO_MAX_BPS = 2.4e6;
/* How big the published page may get.
 *
 * The host refuses past its own limit — sixteen megabytes of rendered page
 * — and the refusal arrives at SAVE time, long after the picture was
 * chosen, with no way back but Ctrl+Z. Checking here means the answer
 * comes while the file is still in the reader's hand. Held a couple of
 * megabytes under the real ceiling, because what is measured here is the
 * page as it stands and what is published is the page plus whatever else
 * changes before Save. */
const PUBLISH_BUDGET = 13.5 * 1024 * 1024;
function publishedBytesWith(extra){
  const base = (typeof PRISTINE_HTML === 'string' && PRISTINE_HTML) ? PRISTINE_HTML.length : 0;
  return base + (extra || 0);
}
const mediaPicker = document.getElementById('mediaPicker');
const mediaPickerGrid = document.getElementById('mediaPickerGrid');
const mediaPickerStatus = document.getElementById('mediaPickerStatus');
const mediaFile = document.getElementById('mediaFile');
const mediaLinkInput = document.getElementById('mediaLinkInput');
let mediaPickerTarget = null;            // the rich surface a pick lands in

function setMediaStatus(kind, msg){
  if(!mediaPickerStatus) return;
  mediaPickerStatus.className = 'media-picker-status ' + (kind || '');
  mediaPickerStatus.textContent = msg || '';
}
function closeMediaPicker(){
  if(mediaPicker) mediaPicker.classList.remove('open');
  mediaPickerTarget = null;
}
function openMediaPicker(btn, surface){
  mediaPickerTarget = surface;
  renderMediaPicker();
  setMediaStatus('', '');
  mediaPicker.classList.add('open');
  const r = btn.getBoundingClientRect();
  const pr = mediaPicker.getBoundingClientRect();
  let left = Math.min(r.left, window.innerWidth - pr.width - 10);
  let top = r.bottom + 6;
  if(top + pr.height > window.innerHeight - 10) top = Math.max(10, r.top - pr.height - 6);
  mediaPicker.style.left = Math.max(10, left) + 'px';
  mediaPicker.style.top = top + 'px';
}
/* Everything already in the chart, so the same still can be dropped into a
   second comment without being carried a second time. */
function renderMediaPicker(){
  mediaPickerGrid.innerHTML = '';
  if(!MEDIA.length){
    const p = document.createElement('div');
    p.className = 'sticker-picker-empty';
    p.textContent = 'No figures in this chart yet.';
    mediaPickerGrid.appendChild(p);
    return;
  }
  MEDIA.forEach(m=>{
    const b = document.createElement('button');
    b.type = 'button'; b.title = m.name || m.key;
    b.className = 'media-pick';
    if(m.kind === 'video'){
      const v = document.createElement('video');
      v.src = m.src; v.muted = true; v.preload = 'metadata';
      b.appendChild(v);
      const tag = document.createElement('span');
      tag.className = 'media-pick-kind'; tag.textContent = '▶';
      b.appendChild(tag);
    } else {
      const img = document.createElement('img');
      img.src = m.src; img.alt = m.name || m.key;
      b.appendChild(img);
    }
    b.onclick = (ev)=>{ ev.stopPropagation(); insertMedia(m.key); };
    /* Removing one is the same gesture the sticker library uses, and it
       leaves the token behind: re-adding the picture brings the figure
       back where it was, exactly as a sticker does. */
    const del = document.createElement('span');
    del.className = 'media-pick-del';
    del.textContent = '×';
    del.title = 'Remove this figure from the chart';
    del.onclick = (ev)=>{
      ev.stopPropagation();
      if(readOnlyView) return;
      applyMediaEdit(()=>{
        const i = MEDIA.findIndex(x=> x.key === m.key);
        if(i >= 0) MEDIA.splice(i, 1);
      });
      renderMediaPicker();
    };
    b.appendChild(del);
    mediaPickerGrid.appendChild(b);
  });
}
function applyMediaEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  rebuildMediaMap();
  rebuildChart();
  refreshSaveUI();
}
function insertMedia(key){
  const surface = mediaPickerTarget;
  closeMediaPicker();
  if(!surface) return;
  /* On a line of its own, both sides. A figure is a block in the flow of
     the prose, and dropping one into the middle of a sentence would leave
     the sentence broken around something that cannot be read as a word. */
  insertIntoSurface(surface, `\n{{m:${key}}}\n`);
}
/* A still is redrawn at a sane width before it is stored. A page carrying
   a dozen four-megapixel photographs is a page nobody can open. */
function shrinkImageToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error('could not read that file'));
    fr.onload = ()=>{
      const raw = String(fr.result);
      /* An animated GIF cannot survive a canvas — only its first frame
         would — so it is kept exactly as it came, like a sticker. */
      if(/^data:image\/gif;/i.test(raw)){ resolve(raw); return; }
      const img = new Image();
      img.onerror = ()=> reject(new Error('that file is not a picture this browser can read'));
      img.onload = ()=>{
        const scale = Math.min(1, MEDIA_IMG_MAX / Math.max(img.width || 1, 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.src = raw;
    };
    fr.readAsDataURL(file);
  });
}
function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error('could not read that file'));
    fr.onload = ()=> resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
/* Re-encoding a clip so it fits.
 *
 * There is no fixed size limit any more, because a fixed limit is the
 * wrong shape of answer: what matters is not how big the file is but
 * whether the page can still be published with it in, and that depends on
 * everything else the chart is already carrying. So the budget is worked
 * out, and a clip too big for it is re-encoded to fit rather than refused.
 *
 * Done by playing it and recording what comes out: the frames go through a
 * canvas at a smaller size, the sound rides along untouched, and the
 * recorder is given the bitrate that lands on the budget. It runs at
 * playing speed, because it IS the clip playing — a long one takes as long
 * as it lasts — so it says how far along it is and can be left alone.
 *
 * Below a floor bitrate the result is a clip nobody would want to watch,
 * and the honest answer there is a link, which costs the chart nothing. */
function canReencodeVideo(){
  return typeof MediaRecorder !== 'undefined' &&
         typeof HTMLCanvasElement.prototype.captureStream === 'function';
}
function videoRecordType(){
  const want = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return want.find(t=> MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}
function onceEvent(el, name){
  return new Promise((resolve, reject)=>{
    el.addEventListener(name, resolve, {once:true});
    el.addEventListener('error', ()=> reject(new Error('that video could not be read')), {once:true});
  });
}
async function reencodeVideoToFit(file, budgetBytes, onProgress){
  const type = videoRecordType();
  if(!canReencodeVideo() || !type) throw new Error('this browser cannot re-encode video');
  const url = URL.createObjectURL(file);
  try{
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
    await onceEvent(v, 'loadedmetadata');
    const dur = Math.max(0.2, await videoDuration(v));
    /* The budget is in base64 characters, and base64 costs a third on top
       of the bytes; the recorder is given bits per second, and a little is
       held back for the container and the sound. */
    const rawBudget = Math.floor(budgetBytes * 3 / 4);
    const bits = Math.floor(rawBudget * 8 / dur) - 64e3;
    if(bits < MEDIA_VIDEO_MIN_BPS){
      throw new Error(`even re-encoded, ${Math.round(dur)} seconds of video will not fit in ` +
        `what is left of the page. Paste a link to it instead`);
    }
    const videoBits = Math.min(MEDIA_VIDEO_MAX_BPS, bits);
    const scale = Math.min(1, MEDIA_VIDEO_MAX_W / Math.max(1, v.videoWidth || MEDIA_VIDEO_MAX_W));
    const w = Math.max(2, Math.round((v.videoWidth || 640) * scale / 2) * 2);
    const h = Math.max(2, Math.round((v.videoHeight || 360) * scale / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(24);
    /* The sound comes off the source element rather than being decoded
       again — a muted element still hands over its audio track, muting
       being about this page's speakers and not about the stream. */
    try{
      const from = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
      if(from) from.getAudioTracks().forEach(t=> stream.addTrack(t));
    }catch(e){ /* a clip with no sound, or a browser that will not share it */ }
    const rec = new MediaRecorder(stream, {mimeType:type, videoBitsPerSecond: videoBits,
                                           audioBitsPerSecond: 48000});
    const chunks = [];
    let written = 0, overran = false;
    /* The recorder is aimed at the budget, not held to it: a stretch of
       hard-to-compress picture can overshoot. Watching what it actually
       writes and stopping at the line gives a short clip that fits rather
       than a whole one that cannot be saved — and says so. */
    const cap = Math.floor(budgetBytes * 3 / 4);
    rec.ondataavailable = e=>{
      if(!e.data || !e.data.size) return;
      chunks.push(e.data); written += e.data.size;
      if(written > cap && rec.state === 'recording'){ overran = true; rec.stop(); }
    };
    const stopped = new Promise(r=> rec.onstop = r);
    rec.start(500);
    await v.play();
    let frame = 0;
    const draw = ()=>{
      try{ ctx.drawImage(v, 0, 0, w, h); }catch(e){}
      if(onProgress) onProgress(Math.min(1, (v.currentTime || 0) / dur));
      frame = requestAnimationFrame(draw);
    };
    draw();
    await Promise.race([onceEvent(v, 'ended'), stopped]);
    cancelAnimationFrame(frame);
    try{ v.pause(); }catch(e){}
    if(rec.state === 'recording') rec.stop();
    await stopped;
    /* The container type WITHOUT the recorder's codec parameter.
     *
       A data: URL is split at its FIRST comma — everything before it is
       the media type, everything after is the payload. The recorder's own
       type is `video/webm;codecs=vp9,opus`, and a comma sits in the middle
       of it: written into a data: URL verbatim, the type came out as
       `video/webm;codecs=vp9` and the payload began `opus;base64,…`, read
       as percent-encoded text rather than as base64. The bytes were all
       there and no player could make anything of them. The codecs are
       written in the container besides, so naming them in the URL was
       never telling anyone anything they could not already see. */
    const out = new Blob(chunks, {type: (type.split(';')[0] || 'video/webm')});
    out.truncated = overran;
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
/* How long a clip is, when it will not simply say.
 *
 * A file written by a browser's own recorder — which is what a re-encoded
 * clip is, and what a clip recorded on a phone can be — carries no
 * duration in its header, and the element reports Infinity. Seeking past
 * the end forces the decoder to find the real end and report it, which is
 * the long-standing way round this; the seek is undone before anything is
 * played. */
function videoDuration(v){
  if(Number.isFinite(v.duration) && v.duration > 0) return Promise.resolve(v.duration);
  return new Promise(resolve=>{
    let done = false;
    const finish = (d)=>{
      if(done) return;
      done = true;
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      try{ v.currentTime = 0; }catch(e){}
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    const onDur = ()=>{ if(Number.isFinite(v.duration) && v.duration > 0) finish(v.duration); };
    const onTime = ()=>{
      if(Number.isFinite(v.duration) && v.duration > 0){ finish(v.duration); return; }
      /* Still unknown: walk further out rather than sitting at a time the
         decoder has already refused. */
      try{ v.currentTime = (v.currentTime || 0) + 1e5; }catch(e){ finish(0); }
    };
    v.addEventListener('durationchange', onDur);
    v.addEventListener('timeupdate', onTime);
    try{ v.currentTime = 1e101; }catch(e){ finish(0); }
    setTimeout(()=> finish(v.duration), 4000);
  });
}
function blobToDataUrl(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error('could not read the re-encoded clip'));
    fr.onload = ()=> resolve(String(fr.result));
    fr.readAsDataURL(blob);
  });
}
async function addMediaFromFile(file){
  const isVideo = /^video\//i.test(file.type);
  const room = PUBLISH_BUDGET - publishedBytesWith(0);
  let src;
  try{
    if(!isVideo){
      src = await shrinkImageToDataUrl(file);
    } else {
      /* A base64 character per byte and a third again: what the file would
         cost the page as it stands. */
      const wouldCost = Math.ceil(file.size * 4 / 3);
      if(wouldCost <= room){
        src = await readFileAsDataUrl(file);
      } else if(!canReencodeVideo()){
        setMediaStatus('err', `that clip is ${(file.size/1048576).toFixed(1)} MB and there is room for about ` +
          `${(room*3/4/1048576).toFixed(1)} MB. Paste a link to it instead.`);
        return;
      } else {
        setMediaStatus('', `Re-encoding to fit \u2014 this plays the clip through, so it takes as long as the clip lasts\u2026`);
        const blob = await reencodeVideoToFit(file, room * 0.92,
          f=> setMediaStatus('', `Re-encoding to fit \u2014 ${Math.round(f*100)}%\u2026`));
        src = await blobToDataUrl(blob);
        setMediaStatus(blob.truncated ? 'err' : 'ok',
          blob.truncated
            ? `Only the first part fitted (${(blob.size/1048576).toFixed(1)} MB). Paste a link for the whole clip.`
            : `Re-encoded to ${(blob.size/1048576).toFixed(1)} MB.`);
      }
    }
  }catch(e){
    setMediaStatus('err', e && e.message ? e.message : 'could not read that file');
    return;
  }
  if(!mediaSrcOk(src)){ setMediaStatus('err', 'that file is not a picture or a video.'); return; }
  /* …and the page still has to be publishable with it in. A re-encode aims
     at the budget rather than guaranteeing it, so the last word is here. */
  if(publishedBytesWith(src.length) > PUBLISH_BUDGET){
    setMediaStatus('err', `that would take the chart past what can be published (about ` +
      `${(publishedBytesWith(src.length)/1048576).toFixed(1)} MB). Paste a link to it instead.`);
    return;
  }
  const name = (file.name || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || (isVideo ? 'clip' : 'figure');
  const key = uniqueMediaKey(name);
  applyMediaEdit(()=> MEDIA.push({key, name, kind: isVideo ? 'video' : 'image', src}));
  const surface = mediaPickerTarget;
  renderMediaPicker();
  if(surface){ mediaPickerTarget = surface; insertMedia(key); }
  else setMediaStatus('ok', 'Added.');
}
if(mediaFile) mediaFile.addEventListener('change', async ()=>{
  const f = (mediaFile.files || [])[0];
  mediaFile.value = '';
  if(f) await addMediaFromFile(f);
});
{
  const fileBtn = document.getElementById('mediaPickerFile');
  if(fileBtn) fileBtn.onclick = (ev)=>{ ev.stopPropagation(); mediaFile.click(); };
  const linkBtn = document.getElementById('mediaLinkAdd');
  const addLink = ()=>{
    const url = (mediaLinkInput.value || '').trim();
    if(!url) return;
    if(!mediaSrcOk(url)){ setMediaStatus('err', 'that link is not an http(s) address.'); return; }
    /* Which of the two it is, guessed from the address. A link has no MIME
       type until it is fetched, and guessing wrong only means the figure
       is drawn with the wrong element, which the reader can see at once. */
    const kind = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(url) ? 'video' : 'image';
    const name = (url.split(/[\/?#]/).filter(Boolean).pop() || 'figure').slice(0, 40);
    const key = uniqueMediaKey(name);
    applyMediaEdit(()=> MEDIA.push({key, name, kind, src: safeUrl(url)}));
    mediaLinkInput.value = '';
    const surface = mediaPickerTarget;
    renderMediaPicker();
    if(surface){ mediaPickerTarget = surface; insertMedia(key); }
  };
  if(linkBtn) linkBtn.onclick = (ev)=>{ ev.stopPropagation(); addLink(); };
  if(mediaLinkInput) mediaLinkInput.addEventListener('keydown', ev=>{
    if(ev.key === 'Enter'){ ev.preventDefault(); addLink(); }
  });
}
if(mediaPicker){
  mediaPicker.addEventListener('click', ev=> ev.stopPropagation());
  document.addEventListener('mousedown', ev=>{
    if(!mediaPicker.classList.contains('open')) return;
    if(mediaPicker.contains(ev.target) || (ev.target.closest && ev.target.closest('.tb-media-btn'))) return;
    closeMediaPicker();
  });
}
/* Only the fields that are rendered as a DOCUMENT get the button. */
const MEDIA_FIELDS = new Set(['detailNoteInput']);
function addMediaButton(bar){
  if(bar.querySelector('.tb-media-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target || !MEDIA_FIELDS.has(target.dataset.wrapTarget)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-media-btn';
  btn.textContent = '▣';
  btn.title = 'Place a picture or a video in this comment';
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(mediaPicker.classList.contains('open')){ closeMediaPicker(); return; }
    const surface = surfaceForToolbar(bar);
    if(surface) openMediaPicker(btn, surface);
  });
  bar.appendChild(btn);
}
function wireStickerButtons(){
  document.querySelectorAll('.mini-toolbar').forEach(bar=>{
    addFontButton(bar); addLineButtons(bar); addStickerButton(bar); addRefButton(bar);
    addMediaButton(bar);
  });
}
wireStickerButtons();

/* Choosing an entry's tags.
 *
 * The text box is gone. Typing a tag by hand is how a tag list rots: one
 * misspelling becomes a second, nearly identical tag that filters
 * separately and looks the same in the panel, and nothing ever notices.
 * Tags are made once, in Management, and here they are only chosen.
 *
 * The input element stays, hidden. It is still the canonical value —
 * everything that reads or writes an entry's tags goes through it — so
 * this is a new face on the same field rather than a new field. */
function currentTagsIn(input){
  return input.value.split(',').map(t=> t.trim()).filter(Boolean);
}
function setTagsIn(input, list){
  input.value = list.join(', ');
  input.dispatchEvent(new Event('input', {bubbles:true}));
}
function paintTagChips(chipsEl, input){
  chipsEl.innerHTML = '';
  currentTagsIn(input).forEach(tag=>{
    const chip = document.createElement('span');
    chip.className = 'tag-chip tag-shape';
    const eye = document.createElement('i');
    eye.className = 'tag-eye';
    chip.appendChild(eye);
    chip.appendChild(document.createTextNode(tag));
    if(tagIsSpecial(tag)){
      const st = document.createElement('span');
      st.className = 'tag-special';
      st.textContent = '*';
      st.title = SPECIAL_TAGS[tag];
      chip.appendChild(st);
    }
    chip.title = tagIsSpecial(tag) ? SPECIAL_TAGS[tag] : '';
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '\u00d7'; x.title = `Remove "${tag}"`;
    x.addEventListener('click', ev=>{
      ev.stopPropagation();
      setTagsIn(input, currentTagsIn(input).filter(t=> t !== tag));
      paintTagChips(chipsEl, input);
    });
    chip.appendChild(x);
    chipsEl.appendChild(chip);
  });
}
/* Which tags this shape can wear. The two that draw scenery are refused
   to a portrait, where the scenery means nothing and does not fit. */
function tagsBarredFor(shape){
  return shape === 'ellipse' ? [HUB_TAG, LOCAL_TAG] : [];
}
function shapeOfTagForm(input){
  const sel = document.getElementById(
    input && input.id === 'editTagsInput' ? 'editShapeInput' : 'addNodeShape');
  return sel ? sel.value : '';
}
function keepAllowedTags(list, shape){
  const barred = tagsBarredFor(shape);
  return barred.length ? list.filter(t=> barred.indexOf(t) < 0) : list;
}
function fillTagMenu(menu, input, chipsEl){
  menu.innerHTML = '';
  const barred = tagsBarredFor(shapeOfTagForm(input));
  const have = new Set(currentTagsIn(input));
  const groups = realCategories().map(c=> ({name:c.name, tags:c.tags.slice().sort((a,b)=> a.localeCompare(b))}));
  const claimed = new Set(); groups.forEach(g=> g.tags.forEach(t=> claimed.add(t)));
  /* Same bucket, same name as the panel's. Anything that acts is filed
     here whatever else claims it — see buildLegend. */
  const reserved = new Set(knownTags().filter(t=> tagIsSpecial(t)));
  groups.forEach(g=>{ g.tags = g.tags.filter(t=> !reserved.has(t)); });
  const loose = knownTags().filter(t=> !claimed.has(t) || reserved.has(t));
  if(loose.length) groups.push({name:'Special', tags:loose});

  let any = false;
  groups.forEach(g=>{
    const opts = g.tags.filter(t=> !have.has(t) && barred.indexOf(t) < 0);
    if(!opts.length) return;
    any = true;
    const head = document.createElement('div');
    head.className = 'tag-menu-head';
    head.textContent = g.name;
    menu.appendChild(head);
    opts.forEach(t=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      if(tagIsSpecial(t)){
        const st = document.createElement('span');
        st.className = 'tag-special';
        st.textContent = '*';
        st.title = SPECIAL_TAGS[t];
        b.appendChild(st);
      }
      b.addEventListener('click', ev=>{
        ev.stopPropagation();
        const list = currentTagsIn(input);
        if(list.indexOf(t) < 0) list.push(t);
        setTagsIn(input, list);
        paintTagChips(chipsEl, input);
        menu.hidden = true;
      });
      menu.appendChild(b);
    });
  });
  if(!any){
    const none = document.createElement('button');
    none.type = 'button'; none.className = 'tag-menu-empty';
    none.textContent = knownTags().length ? 'All tags already added' : 'No tags yet — make one in Management';
    none.addEventListener('click', ev=> ev.stopPropagation());
    menu.appendChild(none);
  }
}
function wireTagField(prefix, inputId){
  const input = document.getElementById(inputId);
  const chipsEl = document.getElementById(prefix + 'Chips');
  const addBtn = document.getElementById(prefix + 'Add');
  const menu = document.getElementById(prefix + 'Menu');
  if(!input || !chipsEl || !addBtn || !menu) return;
  addBtn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(!menu.hidden){ menu.hidden = true; return; }
    fillTagMenu(menu, input, chipsEl);
    menu.hidden = false;
  });
  menu.addEventListener('click', ev=> ev.stopPropagation());
  document.addEventListener('mousedown', ev=>{
    if(menu.hidden) return;
    if(menu.contains(ev.target) || ev.target === addBtn) return;
    menu.hidden = true;
  });
  // The value can also change from outside — opening a form, an undo.
  input.addEventListener('change', ()=> paintTagChips(chipsEl, input));
  paintTagChips(chipsEl, input);
  return ()=> paintTagChips(chipsEl, input);
}
const repaintEditTags = wireTagField('editTags', 'editTagsInput');
const repaintAddNodeTags = wireTagField('addNodeTags', 'addNodeTags');

// The portrait field only means anything for a character bio, so it
// appears and disappears with that archetype.
const editBioCardField = document.getElementById('editBioCardField');
const editBioCardCheck = document.getElementById('editBioCardCheck');
const editImageField = document.getElementById('editImageField');
const editImageInput = document.getElementById('editImageInput');
const addNodeImageField = document.getElementById('addNodeImageField');
const addNodeImageInput = document.getElementById('addNodeImage');
/* A picture has no words, so the field that would write them is shut.
 *
 * The drawer offers one form for every archetype, and on an Image element
 * the Label row and its B / I / Ruby / colour toolbar were live but
 * pointless: whatever was typed there was thrown away on save, and the
 * toolbar acted on a field nothing would read. */
/* The same for the ADD form. A new Image element has no words either, and
   the row that would write them was live in both forms. */
function syncAddLabelFieldForShape(select){
  const rec = richFields.get('addNodeLabel');
  const off = !!select && select.value === 'image';
  if(rec){
    rec.surface.contentEditable = off ? 'false' : 'true';
    rec.surface.classList.toggle('locked', off);
  }
  const field = document.getElementById('addNodeLabel');
  const wrap = field ? field.closest('.editor-field') : null;
  if(wrap){
    wrap.classList.toggle('field-off', off);
    wrap.querySelectorAll('button, input, select').forEach(c=>{
      if(c.id === 'addNodeFont' || c.id === 'addNodeFontSize') return;
      c.disabled = off;
    });
  }
}
function syncLabelFieldForShape(select){
  const rec = richFields.get('editLabelInput');
  /* Asked of the ENTRY when no field is named, because the form is only
     refilled as it opens: switching entries with it already open leaves
     the archetype select showing the one before. */
  const shape = select ? select.value
    : ((selectedId && nodes.get(selectedId) && nodes.get(selectedId).shape) || 'rect');
  const off = shape === 'image';
  if(rec){
    rec.surface.contentEditable = off ? 'false' : 'true';
    rec.surface.classList.toggle('locked', off);
  }
  const field = document.querySelector('#editLabelInput');
  const wrap = field ? field.closest('.editor-field') : null;
  if(wrap){
    wrap.classList.toggle('field-off', off);
    wrap.querySelectorAll('button, input, select').forEach(c=>{
      if(c.id === 'editFontInput' || c.id === 'editFontSizeInput') return;
      c.disabled = off;
    });
  }
}
/* Only a portrait has a card to keep open. */
function syncBioCardField(select){
  if(!editBioCardField) return;
  editBioCardField.style.display = (select && select.value === 'ellipse') ? '' : 'none';
}
function syncImageFieldVisibility(select, field){
  // A portrait belongs to a character bio; a free-standing Image element
  // and a card both take their picture from the same field.
  const wantsImage = select.value === 'ellipse' || select.value === 'image'
    || (select === editShapeInput && typeof editCardCheck !== 'undefined' && editCardCheck.checked);
  field.style.display = wantsImage ? '' : 'none';
}
// Reached through the DOM rather than the module-level consts for these
// two selects: the Add Node form's own bindings are declared further down
// the file than this block runs.
{
  const editShape = document.getElementById('editShapeInput');
  const addShape = document.getElementById('addNodeShape');
  editShape.addEventListener('change', ()=>{
    syncCardFieldVisibility();
    syncBioCardField(editShape);
    syncImageFieldVisibility(editShape, editImageField);
    syncLabelFieldForShape(editShape);
    syncTextColorVisibility();
    syncColorFieldVisibility();
  });
  addShape.addEventListener('change', ()=>{
    syncImageFieldVisibility(addShape, addNodeImageField);
    syncAddLabelFieldForShape(addShape);
    setTextColorControls('addNodeLabel', addShape.value !== 'amalgam');
  });
  syncAddLabelFieldForShape(addShape);
}

/* ---------------------------------------------------------------------
   The note editor in the detail drawer.

   It sits in the drawer rather than inside the entry form because a note
   is the thing you read when you click a node, and wanting to fix a word
   in it shouldn't mean opening a separate editing mode for the whole
   entry. It shows as plain italic text until you press the pencil, and
   Apply commits it and locks the field again.
   ------------------------------------------------------------------ */
const detailNoteInput = document.getElementById('detailNoteInput');
const detailNoteEditBtn = document.getElementById('detailNoteEdit');
const detailNoteToolbar = document.getElementById('detailNoteToolbar');
const detailNoteActions = document.getElementById('detailNoteActions');
const detailNoteSurface = richFields.get('detailNoteInput').surface;
let detailNoteEditing = false;

function setDetailNoteEditing(on){
  detailNoteEditing = on;
  detailNoteSurface.contentEditable = on ? 'true' : 'false';
  detailNoteSurface.classList.toggle('locked', !on);
  // makeRichField sets a min-height inline to match the textarea it stood
  // in for; inline styles outrank the .locked rule, so it has to be
  // cleared by hand or a one-line note would still reserve three rows.
  detailNoteSurface.style.minHeight = on ? '74px' : '';
  detailNoteToolbar.style.display = on ? '' : 'none';
  detailNoteActions.style.display = on ? '' : 'none';
  detailNoteEditBtn.classList.toggle('active', on);
  if(on) detailNoteSurface.focus();
}
function showDetailNote(markup){
  setRichValue(detailNoteInput, markup);
  setDetailNoteEditing(false);
  syncNoteExpandBtn();
}
/* Nothing to open at full size when there is nothing written.
 *
 * The button is the drawer's answer to a note too long for a column three
 * hundred pixels wide; on an entry with no note it offered to show an
 * empty card, which is a control that cannot do anything. */
function syncNoteExpandBtn(){
  const btn = document.getElementById('detailNoteExpand');
  if(!btn) return;
  const text = (detailNoteInput && detailNoteInput.value || '').trim();
  btn.style.display = text ? '' : 'none';
}
/* The note settles as it is written, like every other field.
 *
 * It was the one place in the entry editor that waited for a button.
 * Everything else — the label, the colours, the archetype — takes effect
 * as you make the change, so nobody expected this one to be different:
 * type a note, click the next entry, and the words were gone. Nothing was
 * stored, the Save button still said "Saved", and there was nothing to
 * undo, because as far as the chart was concerned nothing had happened.
 *
 * So it commits on a pause, exactly as the label does, and the whole time
 * the field is open is one step of undo. Apply now means "I have
 * finished"; Cancel means "put it back the way it was when I started",
 * which is a promise the field can only keep by remembering that. */
let detailNoteUndoPushed = false;
let detailNoteOriginal = '';
let detailNoteTimer = 0;
let detailNoteOwner = null;      // the entry the open editor belongs to
function commitDetailNote(){
  const id = detailNoteOwner;
  if(!id || readOnlyView) return;
  const n = nodes.get(id);
  if(!n) return;
  const text = detailNoteInput.value.trim();
  if((n.note || '') === text) return;
  if(!detailNoteUndoPushed){ pushUndo(); detailNoteUndoPushed = true; }
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    found.entry[4] = text || undefined;
    putEntry(found.index, found.entry, entryOpts(found.entry));
  });
}
function queueDetailNoteCommit(){
  if(detailNoteTimer) clearTimeout(detailNoteTimer);
  detailNoteTimer = setTimeout(()=>{ detailNoteTimer = 0; commitDetailNote(); }, 480);
}
function flushDetailNoteCommit(){
  if(detailNoteTimer){ clearTimeout(detailNoteTimer); detailNoteTimer = 0; }
  commitDetailNote();
}
detailNoteSurface.addEventListener('input', ()=>{
  syncNoteExpandBtn();
  if(detailNoteEditing) queueDetailNoteCommit();
});
detailNoteSurface.addEventListener('blur', ()=>{ if(detailNoteEditing) flushDetailNoteCommit(); });
detailNoteEditBtn.onclick = (ev)=>{
  ev.stopPropagation();
  if(!selectedId || readOnlyView) return;
  if(detailNoteEditing){ flushDetailNoteCommit(); setDetailNoteEditing(false); return; }
  const n = nodes.get(selectedId);
  detailNoteOwner = selectedId;
  detailNoteOriginal = n ? (n.note || '') : '';
  detailNoteUndoPushed = false;
  setDetailNoteEditing(true);
};
document.getElementById('detailNoteCancel').onclick = (ev)=>{
  ev.stopPropagation();
  const id = detailNoteOwner;
  if(detailNoteTimer){ clearTimeout(detailNoteTimer); detailNoteTimer = 0; }
  if(id){
    // Back to the words that were there when the pencil was pressed —
    // undoing whatever settled itself along the way.
    setRichValue(detailNoteInput, detailNoteOriginal);
    commitDetailNote();
  }
  const n = nodes.get(selectedId);
  showDetailNote(n ? (n.note || '') : '');
  detailNoteOwner = null;
};
document.getElementById('detailNoteApply').onclick = (ev)=>{
  ev.stopPropagation();
  flushDetailNoteCommit();
  setDetailNoteEditing(false);
  detailNoteOwner = null;
};

/* ---------------------------------------------------------------------
   The entry editor commits as you work.

   There is no Apply to press: a change to the text, the colours, the
   archetype or the font takes effect the moment you make it, exactly like
   dragging an entry does. Typing is settled after a short pause so a
   sentence is one edit rather than one per keystroke, and the whole
   editing session collapses into a single step of undo — pressing Ctrl+Z
   once puts the entry back the way it was before you opened the form,
   instead of walking backwards letter by letter.

   Nothing is published until Save; this is the same local-edit model the
   rest of the chart uses.
   ------------------------------------------------------------------ */
let nodeEditUndoPushed = false;   // one undo step per editing session
let nodeEditTimer = 0;

function beginNodeEditSession(){ nodeEditUndoPushed = false; }
function pushNodeEditUndoOnce(){
  if(nodeEditUndoPushed) return;
  pushUndo();
  nodeEditUndoPushed = true;
}
function queueNodeEditCommit(delay){
  if(nodeEditTimer) clearTimeout(nodeEditTimer);
  nodeEditTimer = setTimeout(()=>{ nodeEditTimer = 0; commitNodeEdit(); }, delay === undefined ? 480 : delay);
}
function flushNodeEditCommit(){
  if(!nodeEditTimer) return;
  clearTimeout(nodeEditTimer); nodeEditTimer = 0;
  commitNodeEdit();
}

function commitNodeEdit(){
  if(!selectedId || readOnlyView) return;
  if(detailEditForm.style.display !== 'block') return;
  const id = selectedId;
  clearEditStatus();
  const newLabel = editLabelInput.value.trim();
  /* An empty label is an edit like any other.
   *
     This used to refuse to commit one, on the reasoning that an empty field
     is a sentence half deleted rather than a decision. In practice it meant
     the one edit you could not make was "take these words away": you
     selected the label, pressed Delete, watched the box empty out, clicked
     away — and the old text came straight back, because nothing had been
     written down. Entries are allowed to hold no text now (see the add
     form), so an empty field simply means an empty entry. */
  endLabelPreview(true);
  const newLink = editLinkInput.value.trim();
  const colorsRaw = editColorsInput.value.trim();
  let newColors = [];
  if(colorsRaw){
    newColors = colorsRaw.split(',').map(s=>s.trim()).filter(Boolean);
    for(const c of newColors){
      if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)){
        setEditStatus('err', `"${c}" isn't a valid hex color yet (e.g. #c23b22) — the borders keep their current colours.`);
        return;
      }
    }
  }
  const bgRaw = editBgInput.value.trim();
  let newBg = [];
  if(bgRaw){
    newBg = bgRaw.split(',').map(s=>s.trim()).filter(Boolean);
    for(const c of newBg){
      if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)){
        setEditStatus('err', `"${c}" isn't a valid hex color yet (e.g. #f4e9c9) — the background keeps what it has.`);
        return;
      }
    }
  }
  const newBorder = editBorderStyle.value;
  const newShape = editShapeInput.value==='rect' ? undefined : editShapeInput.value;
  const newImage = (newShape==='ellipse' || newShape==='image') ? editImageInput.value.trim() : '';
  /* …less whatever this archetype cannot wear. Changing an entry INTO a
     portrait is the other way the two scenery tags can arrive on one. */
  const newTags = keepAllowedTags(parseTagsField(editTagsInput.value), newShape);
  const newFont = editFontInput.value===FONT_OPTIONS[0].key ? undefined : editFontInput.value;
  const newFontSizeRaw = editFontSizeInput.value.trim();
  let newFontSize;
  if(newFontSizeRaw){
    newFontSize = Number(newFontSizeRaw);
    if(!Number.isFinite(newFontSize) || newFontSize<6 || newFontSize>28){
      setEditStatus('err', 'Font size has to be between 6 and 28.');
      return;
    }
  }
  const newCard = editCardCheck.checked && CARD_CAPABLE.has(newShape || 'rect');
  const newMultiLang = editMultiLangCheck.checked;
  const newLangTabs = newMultiLang ? collectLangTabs(editLangTabList) : [];
  // Turning multi-language on before filling in a tab is a normal
  // half-finished state, not an error to shout about — the tabs simply do
  // not exist until one has both a tag and some text.
  pushNodeEditUndoOnce();
  let dropped = 0;
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    const entry = found.entry;
    entry[1] = newLabel;
    entry[5] = newShape;   // the note has its own editor in the drawer
    const opts = entryOpts(entry);
    if(newLink) opts.link = newLink; else delete opts.link;
    if(newColors.length) opts.colors = capColors(newColors, newShape); else delete opts.colors;
    if(newBg.length) opts.bg = newBg; else delete opts.bg;
    if(newBorder && newBorder !== 'solid') opts.border = newBorder; else delete opts.border;
    if(newTags.length) opts.tags = newTags; else delete opts.tags;
    if(newFont) opts.font = newFont; else delete opts.font;
    if(newFontSize) opts.fontSize = newFontSize; else delete opts.fontSize;
    if(newImage) opts.image = newImage; else delete opts.image;
    if(newCard) opts.card = true; else delete opts.card;
    /* Only a portrait keeps a card, so the choice goes with the archetype
       rather than lingering on an entry that has no card at all. */
    if(newShape === 'ellipse' && editBioCardCheck && editBioCardCheck.checked)
      opts.bioCard = true;
    else delete opts.bioCard;
    const side = editBioSide.value;
    if(newShape === 'ellipse' && (side === 'left' || side === 'right')) opts.bioSide = side;
    else delete opts.bioSide;
    if(newMultiLang) opts.multiLang = true; else delete opts.multiLang;
    if(newMultiLang && newLangTabs.length) opts.langTabs = newLangTabs; else delete opts.langTabs;
    putEntry(found.index, entry, opts);
    /* Borders that have gone take their connectors with them — AFTER the
       entry itself has been written back, not before.
     *
     * `found.entry` is a copy taken at the top of this function. When one
     * of the doomed connectors POINTS AT the entry being edited, dropping
     * it rewrites that same entry's parents and writes it back — and the
     * line above then wrote this older copy over the top, restoring the
     * parent. The connector lost its style record and kept its
     * connection: it carried on being drawn, silently reattached to the
     * outermost border, which is exactly the confusion this exists to
     * prevent. */
    dropped = dropEdgesOnMissingRings(id, opts.colors ? opts.colors.length : 1);
  });
  if(dropped) setEditStatus('ok', dropped === 1
    ? 'One connector belonged to a border that is gone, and went with it.'
    : `${dropped} connectors belonged to borders that are gone, and went with them.`);
  // The commit consumed the preview; arm a fresh one so the next keystroke
  // still draws itself on the entry.
  if(detailEditForm.style.display === 'block' && nodes.has(id)) beginLabelPreview(id);
}

// Like applyEdit, but without its own undo push — the session already
// pushed one, so a run of small changes stays one step.
function commitEntry(mutate){
  mutate();
  rebuildChart();
  refreshSaveUI();
}

/* ---------------------------------------------------------------------
   Edge style popover — click any arrow on the chart to style just that
   one edge (routing + line pattern + arrowhead), live-previewed as you
   adjust it. Not a modal: a small card positioned near the click, no
   backdrop, closed by its ✕ or a click anywhere outside it. Overrides are
   stored in EDGE_STYLES, one entry per customized edge; picking the
   defaults back removes the entry instead of storing a redundant one.
   ------------------------------------------------------------------ */
function serializeEdgeStyles(list){
  if(!list.length) return 'const EDGE_STYLES = [];';
  return 'const EDGE_STYLES = [\n' + list.map(s=>
    `  {from:${jsStr(s.from)}, to:${jsStr(s.to)}, routing:${jsStr(s.routing)}, dash:${jsStr(s.dash)}, arrow:${jsVal(s.arrow)}${s.arrowIn ? `, arrowIn:true` : ''}${s.sinusoid ? `, sinusoid:true` : ''}${s.note ? `, note:${jsStr(s.note)}` : ''}${s.note && s.notePos && s.notePos !== 'above' ? `, notePos:${jsStr(s.notePos)}` : ''}${s.noteBg ? `, noteBg:${jsStr(s.noteBg)}` : ''}${(s.bends && s.bends.length) ? `, bends:${jsVal(s.bends)}` : ''}${s.color ? `, color:${jsStr(s.color)}` : ''}${s.color && s.colorFixed ? `, colorFixed:true` : ''}${s.gradient ? `, gradient:${jsVal(s.gradient)}` : ''}${s.fromSide ? `, fromSide:${jsStr(s.fromSide)}` : ''}${s.toSide ? `, toSide:${jsStr(s.toSide)}` : ''}${s.fromRing ? `, fromRing:${s.fromRing}` : ''}${s.toRing ? `, toRing:${s.toRing}` : ''}},`
  ).join('\n') + '\n];';
}

function serializeComments(list){
  if(!list.length) return 'const COMMENTS = [\n];';
  return 'const COMMENTS = [\n' + list.map(c=>
    `  {id:${jsStr(c.id)}, nick:${jsStr(c.nick)}, kind:${jsStr(c.kind)}, at:${jsStr(c.at)}, text:${jsStr(c.text)}${c.done ? ', done:true' : ''}},`
  ).join('\n') + '\n];';
}
function serializeSettings(o){
  return `const SETTINGS = {refColor: ${jsStr(o.refColor || DEFAULT_REF_COLOR)}};`;
}
function serializeRefs(list){
  if(!list.length) return 'const REFS = [\n];';
  return 'const REFS = [\n' + list.map(r=>
    `  {key:${jsStr(r.key)}, title:${jsStr(r.title||'')}${r.detail ? `, detail:${jsStr(r.detail)}` : ''}${r.url ? `, url:${jsStr(r.url)}` : ''}},`
  ).join('\n') + '\n];';
}
function serializeTagCats(list){
  if(!list.length) return 'const TAG_CATS = [\n];';
  return 'const TAG_CATS = [\n' + list.map(c=>
    `  {name:${jsStr(c.name)}, tags:[${(c.tags||[]).map(jsStr).join(', ')}]},`
  ).join('\n') + '\n];';
}
/* An embedded figure, written the way a sticker is: one line per item,
   the source last because it is the long part. */
function serializeMedia(list){
  if(!list.length) return 'const MEDIA = [\n];';
  return 'const MEDIA = [\n' + list.map(m=>
    `  {key:${jsStr(m.key)}, name:${jsStr(m.name || m.key)}, kind:${jsStr(m.kind || 'image')}, src:${jsStr(m.src)}},`
  ).join('\n') + '\n];';
}
function serializeStickers(list){
  if(!list.length) return 'const STICKERS = [\n];';
  return 'const STICKERS = [\n' + list.map(s=>
    `  {key:${jsStr(s.key)}, name:${jsStr(s.name || s.key)}, src:${jsStr(s.src)}},`
  ).join('\n') + '\n];';
}

const edgePopover = document.getElementById('edgePopover');

/* Each setting is a strip of small buttons rather than a dropdown, so the
   whole popover fits in a column you can read at a glance. A group behaves
   exactly like a <select>: one value at a time, read with .value. */
function makeChoiceGroup(id, onChange){
  const root = document.getElementById(id);
  const buttons = Array.from(root.querySelectorAll('button'));
  const group = {
    root,
    get value(){
      const on = buttons.find(b=>b.classList.contains('on'));
      return on ? on.dataset.value : buttons[0].dataset.value;
    },
    set value(v){
      buttons.forEach(b=> b.classList.toggle('on', b.dataset.value === v));
      if(!buttons.some(b=>b.classList.contains('on'))) buttons[0].classList.add('on');
    }
  };
  buttons.forEach(b=> b.addEventListener('click', ev=>{
    ev.stopPropagation();
    group.value = b.dataset.value;
    if(onChange) onChange();
  }));
  return group;
}
// Path stays a real dropdown: its two options need words to tell apart,
// where the others read fine as symbols.
const styleRoutingSel = document.getElementById('styleRouting');
styleRoutingSel.addEventListener('change', ()=> applyLiveEdgeStyle());
styleRoutingSel.addEventListener('click', ev=> ev.stopPropagation());
// "Sinusoid (wavy)" is one more option in the Line strip rather than a
// separate switch — reading it back out into the two underlying fields
// (dash pattern + independent sinusoid flag) happens via selDashValue().
const styleDashSel = makeChoiceGroup('styleDash', ()=>applyLiveEdgeStyle());
function selDashValue(){
  const v = styleDashSel.value;
  return v==='sinusoid' ? {dash:'solid', sinusoid:true} : {dash:v, sinusoid:false};
}

/* Arrowheads are two independent toggles, not one either/or: a connector
   can point at its target, back at its source, at both (a mutual link) or
   at neither (a plain tie). The pair behaves like two checkboxes drawn as
   symbol buttons. */
function makeToggleGroup(id, onChange){
  const root = document.getElementById(id);
  const buttons = Array.from(root.querySelectorAll('button'));
  const group = {
    get(name){
      const b = buttons.find(x=>x.dataset.end === name);
      return !!(b && b.classList.contains('on'));
    },
    set(name, on){
      const b = buttons.find(x=>x.dataset.end === name);
      if(b) b.classList.toggle('on', !!on);
    }
  };
  buttons.forEach(b=> b.addEventListener('click', ev=>{
    ev.stopPropagation();
    b.classList.toggle('on');
    if(onChange) onChange();
  }));
  return group;
}
const styleArrowEnds = makeToggleGroup('styleArrowEnds', ()=>applyLiveEdgeStyle());
const stylePaintMode = makeChoiceGroup('stylePaintMode', ()=>{ syncColorRow(); applyLiveEdgeStyle(); });
const styleNoteSide = makeChoiceGroup('styleNoteSide', ()=>{ applyLiveEdgeStyle(); });
{
  const btn = document.getElementById('styleAddCallout');
  if(btn) btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(leaderPick){ endCalloutPick(); clearStyleStatus(); return; }
    beginCalloutPick();
  });
}
const styleNoteInput = document.getElementById('styleNote');
const styleNoteBgInput = document.getElementById('styleNoteBg');
styleNoteInput.addEventListener('input', ()=> applyLiveEdgeStyle());
styleNoteInput.addEventListener('click', ev=> ev.stopPropagation());
/* A rich field hides its textarea behind a contenteditable surface, and a
   hidden textarea never fires 'input' — the surface writes through to it.
   So the live preview has to listen on the surface, after that write-through
   handler has run, which is why this is registered second. */
{
  const rec = richFields.get('styleNote');
  if(rec){
    rec.surface.addEventListener('input', ()=> applyLiveEdgeStyle());
    rec.surface.addEventListener('click', ev=> ev.stopPropagation());
    rec.surface.addEventListener('mousedown', ev=> ev.stopPropagation());
  }
}
const styleColorInput = document.getElementById('styleColor');
const styleColor2Input = document.getElementById('styleColor2');
const styleColorRow = document.getElementById('styleColorRow');
const styleColorPreview = document.getElementById('styleColorPreview');

// Colours are typed as hex rather than picked from a swatch, so an exact
// value can be pasted in and read back out.
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function readHex(input){
  const v = input.value.trim();
  const ok = HEX_RE.test(v);
  input.classList.toggle('bad', v !== '' && !ok);
  return ok ? v : null;
}
// Shows only the fields the chosen paint mode actually uses.
function syncColorRow(){
  const mode = stylePaintMode.value;
  styleColorRow.style.display = mode === 'default' ? 'none' : 'flex';
  styleColor2Input.style.display = mode === 'gradient' ? '' : 'none';
  const c1 = readHex(styleColorInput) || currentEdgeNaturalColor;
  const c2 = readHex(styleColor2Input) || c1;
  styleColorPreview.style.background = mode === 'gradient'
    ? `linear-gradient(90deg, ${c1}, ${c2})`
    : c1;
}
const edgeStyleLabelEl = document.getElementById('edgeStyleLabel');
const styleStatusEl = document.getElementById('styleStatus');
const styleDeleteBtn = document.getElementById('styleDelete');
function setStyleStatus(kind, msg){ styleStatusEl.className = 'editor-status show ' + kind; styleStatusEl.textContent = msg; }
function clearStyleStatus(){ styleStatusEl.className = 'editor-status'; styleStatusEl.textContent = ''; }

let currentEdgeStyleTarget = null;   // {from,to} of the edge the popover is open for

function isDefaultEdgeStyle(style){
  return style.routing===DEFAULT_EDGE_STYLE.routing && style.dash===DEFAULT_EDGE_STYLE.dash &&
    style.arrow===DEFAULT_EDGE_STYLE.arrow && !style.arrowIn && !style.sinusoid &&
    !style.note && !style.color &&
    !style.gradient && !style.fromSide && !style.toSide && !style.fromRing && !style.toRing &&
    !(style.bends && style.bends.length);
}
function setEdgeStyleOverride(from, to, style){
  const idx = EDGE_STYLES.findIndex(s=>s.from===from && s.to===to);
  if(isDefaultEdgeStyle(style)){
    if(idx>=0) EDGE_STYLES.splice(idx,1);
  } else if(idx>=0){
    EDGE_STYLES[idx] = {from,to,...style};
  } else {
    EDGE_STYLES.push({from,to,...style});
  }
}
// Positions the (already-visible) popover near the click that opened it,
// clamped so it never runs off the edge of the chart area.
function positionEdgePopover(evt){
  // edgePopover's nearest positioned ancestor is .main (not .app — .main is
  // itself position:relative), so its left/top are relative to .main.
  const host = document.querySelector('.main').getBoundingClientRect();
  const rect = edgePopover.getBoundingClientRect();
  const margin = 10;
  let x = 16, y = 16;
  if(evt && typeof evt.clientX === 'number'){
    x = evt.clientX - host.left + 14;
    y = evt.clientY - host.top + 14;
  }
  x = Math.max(margin, Math.min(x, host.width - rect.width - margin));
  y = Math.max(margin, Math.min(y, host.height - rect.height - margin));
  edgePopover.style.left = x + 'px';
  edgePopover.style.top = y + 'px';
}

/* ---------------------------------------------------------------------
   The callout's own panel.

   A callout is an entry, and for a while that meant clicking one opened
   the entry editor: an archetype dropdown, a link field, border colours,
   tags, language tabs — a form about a thing that has none of those. What
   a callout has is words, and one decision beyond them: whether to keep
   it. So it gets a panel that is exactly that, wearing the connector
   popover's shell, because the two are the same kind of object — a small
   card that opens on the drawing beside what it belongs to.

   The words ARE the entry's label, so nothing new is stored and everything
   that already reads a label — search, export, the chart itself — goes on
   working without knowing this panel exists.
   ------------------------------------------------------------------ */
const calloutPopover = document.getElementById('calloutPopover');
const calloutTextInput = document.getElementById('calloutText');
let calloutTarget = null;          // the callout the panel is open on
let calloutUndoPushed = false;
let calloutCommitTimer = 0;

/* ---------------------------------------------------------------------
   The in-node editor.

   An entry's words used to be written in the settings drawer: click the
   entry, find the pencil, and type into a form at the other side of the
   screen while the thing being changed sat where it always was. The two
   were connected only by a live preview — which is to say, by the reader
   watching two places at once.

   They are one place now. A double click puts a field on the entry
   ITSELF, at the entry's own width, in the entry's own face and size and
   ink, with the toolbar floating just above it. Enter settles it; so does
   a click anywhere else, which is what a reader does next anyway. The
   drawer still holds everything an entry has that is not its words, and
   its Label field still works exactly as it did — this is a second way in,
   not a replacement for the form.

   The entry underneath keeps redrawing as you type, so it grows and wraps
   under the field, and the field is put back over it after every redraw.
   --------------------------------------------------------------------- */
const nodeEditor = document.getElementById('nodeEditor');
const nodeEditorText = document.getElementById('nodeEditorText');
/* `var`, deliberately: applyTransform runs while the page is still being
   built, long before this line is reached, and it asks whether the in-node
   field is open. A `let` is in its temporal dead zone until then — and a
   dead-zone read throws even from inside a typeof — so the first transform
   of the session took the whole boot down with it. */
var nodeEditorTarget = null, nodeEditorUndoPushed = false, nodeEditorCommitTimer = 0;
/* Where the field goes: over the entry's own box — or, for a portrait,
   over the CARD, because a portrait's words are on the card and the circle
   holds a picture. */
function nodeEditorBoxFor(n){
  if(!n) return null;
  if((n.shape || '') === 'ellipse'){
    const g = bioCardLayer && bioCardLayer.querySelector(
      `.bio-card-g[data-id="${cssEscape(n.id)}"]`);
    if(g){
      const b = g.getBBox();
      return {x:b.x, y:b.y, w:b.width, h:b.height};
    }
  }
  return {x:n.x, y:n.y, w:n.w, h:(n.h || 0)};
}
function positionNodeEditor(){
  const n = nodeEditorTarget && nodes.get(nodeEditorTarget);
  const box = nodeEditorBoxFor(n);
  if(!box){ closeNodeEditor(true); return; }
  const rec = richFields.get('nodeEditorText');
  if(!rec) return;
  const host = document.querySelector('.main').getBoundingClientRect();
  const r = svg.getBoundingClientRect();
  const left = (r.left - host.left) + box.x*vs + vx;
  const top  = (r.top  - host.top ) + box.y*vs + vy;
  /* The field is the entry's own width, so a label wraps in the field
     exactly where it will wrap on the entry. The toolbar is NOT: it is a
     row of buttons whose size is its own business, and squeezing it to the
     width of a narrow entry turned five controls into five rows. */
  const w = Math.max(NODE_EDITOR_MINW, box.w*vs);
  rec.surface.style.width = w + 'px';
  const bar = document.getElementById('nodeEditorBar');
  const barH = bar ? bar.getBoundingClientRect().height : 0;
  const gap = 4;
  /* Vertically CENTRED on the entry, because that is where the entry
     writes its words. A field pinned to the top of the box would put what
     is being typed a line above where it will end up. */
  const fieldH = rec.surface.getBoundingClientRect().height || NODE_EDITOR_MINH;
  const fieldTop = top + Math.max(0, (box.h*vs - fieldH)/2);
  const barW = bar ? bar.getBoundingClientRect().width : w;
  /* Kept on the page: an entry at the very top or edge of the view would
     put its toolbar where it cannot be reached. */
  const x = Math.max(6, Math.min(left, host.width - Math.max(w, barW) - 6));
  const y = Math.max(6, fieldTop - barH - gap);
  nodeEditor.style.left = x + 'px';
  nodeEditor.style.top  = y + 'px';
}
const NODE_EDITOR_MINW = 120, NODE_EDITOR_MINH = 22;
/* Whether this entry writes its words on itself. A callout has a card of
   its own and a free caption has the free menu, both of which are already
   in-place editors; everything else is edited on the entry. */
function nodeTakesInlineEditor(n){
  if(!n || readOnlyView) return false;
  const shape = n.shape || '';
  if(shape === 'callout' || isFreeShape(shape)) return false;
  return true;
}
function openNodeEditor(id, opts){
  const n = nodes.get(id);
  if(!n || !nodeTakesInlineEditor(n)) return false;
  if(nodeEditorTarget && nodeEditorTarget !== id) closeNodeEditor(true);
  /* A portrait's words live on its card, so the card has to be up before
     there is anywhere to put the field. */
  if((n.shape || '') === 'ellipse' && !bioCardLayer.querySelector(
       `.bio-card-g[data-id="${cssEscape(id)}"]`)){
    openBioCard(id);
  }
  nodeEditorTarget = id;
  nodeEditorUndoPushed = false;
  selectNode(id, {quiet:true, keepEditForm:true, keepSelection:true});
  paintMultiSelection();
  setRichValue(nodeEditorText, n.label || '');
  nodeEditor.hidden = false;
  syncNodeEditorLook(n);
  beginLabelPreview(id, nodeEditorText);
  positionNodeEditor();
  const rec = richFields.get('nodeEditorText');
  if(rec && !(opts && opts.focus === false)){
    rec.surface.focus({preventScroll:true});
    try{
      const sel = window.getSelection(), r = document.createRange();
      r.selectNodeContents(rec.surface); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }catch(e){}
  }
  return true;
}
/* The field is set in the entry's own face, size, alignment and ink, so
   what is being typed looks like what it will be. */
function syncNodeEditorLook(n){
  const rec = richFields.get('nodeEditorText');
  if(!rec || !n) return;
  const size = (n.fontSize && n.fontSize >= 6 && n.fontSize <= 28) ? n.fontSize : NODE_FS;
  rec.surface.style.fontFamily = fontFamilyFor(n.font);
  rec.surface.style.fontSize = (size * vs).toFixed(2) + 'px';
  rec.surface.style.lineHeight = (LINE_H * (size / NODE_FS) * vs).toFixed(2) + 'px';
  rec.surface.style.textAlign = 'center';
}
function commitNodeEditorText(){
  const id = nodeEditorTarget;
  if(!id || readOnlyView) return;
  const n = nodes.get(id);
  if(!n) return;
  const text = nodeEditorText.value;
  const was = labelPreview && labelPreview.id === id ? labelPreview.original : (n.label || '');
  if(was === text) return;
  if(!nodeEditorUndoPushed){ pushUndo(); nodeEditorUndoPushed = true; }
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    found.entry[1] = text;
    putEntry(found.index, found.entry, entryOpts(found.entry));
  });
  if(labelPreview && labelPreview.id === id) labelPreview.original = text;
}
function queueNodeEditorCommit(){
  if(nodeEditorCommitTimer) clearTimeout(nodeEditorCommitTimer);
  nodeEditorCommitTimer = setTimeout(()=>{ nodeEditorCommitTimer = 0; commitNodeEditorText(); }, 420);
}
function closeNodeEditor(keep){
  if(!nodeEditorTarget) return;
  if(nodeEditorCommitTimer){ clearTimeout(nodeEditorCommitTimer); nodeEditorCommitTimer = 0; }
  if(keep !== false) commitNodeEditorText();
  if(typeof endLabelPreview === 'function') endLabelPreview(keep !== false);
  nodeEditor.hidden = true;
  nodeEditorTarget = null;
  nodeEditorUndoPushed = false;
}
setRichEnter('nodeEditorText', ()=> closeNodeEditor(true));
/* The surface writes through to this textarea, which fires no input event
   of its own, so both the preview and the commit are driven from the
   surface — the same wiring the drawer's Label and a callout's card use. */
(()=>{
  const rec = richFields.get('nodeEditorText');
  if(!rec) return;
  rec.surface.addEventListener('input', ()=>{
    queueNodeEditorCommit();
    // The entry is growing under the field, so the field follows it.
    requestAnimationFrame(positionNodeEditor);
  });
})();
/* Anywhere else settles it — the toolbar and its pickers excepted, since
   pressing a button on the field's own toolbar is working IN the field. */
document.addEventListener('mousedown', ev=>{
  if(!nodeEditorTarget) return;
  const t = ev.target;
  if(t && t.closest && (t.closest('#nodeEditor') || t.closest('.tb-pop') ||
                        t.closest('.sticker-pop') || t.closest('.tb-menu'))) return;
  closeNodeEditor(true);
}, true);
function positionCalloutPopover(evt){
  const host = document.querySelector('.main').getBoundingClientRect();
  const rect = calloutPopover.getBoundingClientRect();
  const margin = 10;
  let x = 16, y = 16;
  if(evt && typeof evt.clientX === 'number'){
    x = evt.clientX - host.left + 14;
    y = evt.clientY - host.top + 14;
  }
  x = Math.max(margin, Math.min(x, host.width - rect.width - margin));
  y = Math.max(margin, Math.min(y, host.height - rect.height - margin));
  calloutPopover.style.left = x + 'px';
  calloutPopover.style.top = y + 'px';
}
function commitCalloutText(){
  const id = calloutTarget;
  if(!id || readOnlyView) return;
  const n = nodes.get(id);
  if(!n) return;
  const text = calloutTextInput.value;
  if((n.label || '') === text) return;
  if(!calloutUndoPushed){ pushUndo(); calloutUndoPushed = true; }
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    found.entry[1] = text;
    putEntry(found.index, found.entry, entryOpts(found.entry));
  });
}
function queueCalloutCommit(){
  if(calloutCommitTimer) clearTimeout(calloutCommitTimer);
  calloutCommitTimer = setTimeout(()=>{ calloutCommitTimer = 0; commitCalloutText(); }, 420);
}
function flushCalloutCommit(){
  if(calloutCommitTimer){ clearTimeout(calloutCommitTimer); calloutCommitTimer = 0; }
  commitCalloutText();
}
function closeCalloutPopover(){
  flushCalloutCommit();
  if(typeof endLabelPreview === 'function') endLabelPreview(true);
  calloutPopover.classList.remove('open');
  calloutTarget = null;
  calloutUndoPushed = false;
}
function openCalloutPopover(id, evt, opts){
  const n = nodes.get(id);
  if(!n) return;
  if(calloutTarget && calloutTarget !== id) flushCalloutCommit();
  if(typeof closeEdgePopover === 'function' && edgePopover.classList.contains('open')) closeEdgePopover();
  calloutTarget = id;
  calloutUndoPushed = false;
  setRichValue(calloutTextInput, n.label || '');
  calloutPopover.classList.add('open');
  positionCalloutPopover(evt);
  const rec = richFields.get('calloutText');
  if(rec){
    /* What is typed appears on the card as it is typed — the same live
       preview the entry's own label field has, and the reason a callout
       can be written without looking away from the chart. */
    beginLabelPreview(id, calloutTextInput);
    /* …but the keyboard is only taken when the reader asked to write.
     *
       Opening the panel on a single click and putting the caret in the
       text made every other key a keystroke into the note: Delete, which
       removes the selected object everywhere else on this chart, typed a
       character instead, and a callout was the one thing on the page that
       could not be deleted from the keyboard. A single click opens it to
       be READ; a double-click, and a card that has just been made, open it
       to be written in. */
    if(!(opts && opts.focus === false)) rec.surface.focus({preventScroll:true});
    else return;
    const sel = window.getSelection && window.getSelection();
    if(sel){
      const r = document.createRange();
      r.selectNodeContents(rec.surface); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
  }
}
document.getElementById('calloutClose').onclick = (ev)=>{ ev.stopPropagation(); closeCalloutPopover(); };
document.getElementById('calloutDelete').onclick = (ev)=>{
  ev.stopPropagation();
  const id = calloutTarget;
  closeCalloutPopover();
  if(id && !readOnlyView) deleteNodes([id]);
};
calloutPopover.addEventListener('mousedown', ev=> ev.stopPropagation());
calloutPopover.addEventListener('click', ev=> ev.stopPropagation());
/* Anywhere else closes it, the way every other card on this page closes —
   except while a callout is being placed or carried, when the click is
   part of the gesture rather than a click somewhere else. */
document.addEventListener('click', (ev)=>{
  if(!calloutPopover.classList.contains('open')) return;
  /* A click INSIDE the card is not a click elsewhere.
   *
     This listens in the capture phase — it has to, or a click on the
     drawing would be swallowed by the drawing before it ever reached
     here — and capture runs before the target's own handler. So a press on
     the card's own Delete button closed the card first, clearing the
     callout it was about, and the button then had nothing to delete: the
     panel shut and the remark stayed on the chart. The popover's own
     stopPropagation cannot help, because propagation had not reached it
     yet. Containment is the test that answers correctly in either
     phase. */
  if(calloutPopover.contains(ev.target)) return;
  if(leaderPick || leaderJustPlaced) return;
  closeCalloutPopover();
}, true);

/* ---------------------------------------------------------------------
   The free-element menu.

   A picture and a text block are not entries in the continuity — they have
   no lineage, no ports and nothing to say in the entry panel — so clicking
   one opens this small card beside it instead. A picture gets a file, a URL
   and a stacking choice; a text block gets its words, with the same live
   preview the entry editor has.
   ------------------------------------------------------------------ */
const freeMenu = document.getElementById('freeMenu');
const freeMenuImagePart = document.getElementById('freeMenuImagePart');
const freeMenuTextPart = document.getElementById('freeMenuTextPart');
const freeMenuImageUrl = document.getElementById('freeMenuImageUrl');
const freeMenuTextInput = document.getElementById('freeMenuText');
const freeMenuFont = document.getElementById('freeMenuFont');
const freeMenuFontSize = document.getElementById('freeMenuFontSize');
let freeMenuId = null;

function positionFreeMenu(evt, n){
  const host = document.querySelector('.main').getBoundingClientRect();
  const rect = freeMenu.getBoundingClientRect();
  const margin = 10;
  let x = 16, y = 16;
  if(evt && typeof evt.clientX === 'number'){
    x = evt.clientX - host.left + 14;
    y = evt.clientY - host.top + 14;
  } else if(n){
    // Opened without a pointer (a double-click, say): anchor to the
    // element's own top-right corner in screen space.
    const svgRect = svg.getBoundingClientRect();
    x = svgRect.left - host.left + vx + (n.x + n.w) * vs + 14;
    y = svgRect.top  - host.top  + vy + n.y * vs;
  }
  x = Math.max(margin, Math.min(x, host.width - rect.width - margin));
  y = Math.max(margin, Math.min(y, host.height - rect.height - margin));
  freeMenu.style.left = x + 'px';
  freeMenu.style.top = y + 'px';
}

function closeFreeMenu(){
  if(!freeMenuId) return;
  flushFreeMenuCommit();
  endLabelPreview(false);
  freeMenuId = null;
  freeMenuUndoPushed = false;
  freeMenu.classList.remove('open');
}

function openFreeMenu(id, evt){
  const n = nodes.get(id);
  if(!n || document.body.classList.contains('read-only')) return;
  if(freeMenuId && freeMenuId !== id) closeFreeMenu();
  freeMenuId = id;
  const isImage = (n.shape||'') === 'image';
  document.getElementById('freeMenuTitle').textContent = isImage ? 'Image' : 'Text';
  freeMenuImagePart.style.display = isImage ? '' : 'none';
  freeMenuTextPart.style.display  = isImage ? 'none' : '';
  if(isImage){
    freeMenuImageUrl.value = n.image || '';
    // Remembered as it was, so that changing something else in this menu
    // does not quietly decide it for the reader. See freeMenuZ.
    freeMenuZ = n.z || 0;
    paintFreeLayerRow(freeMenuZ);
  } else {
    setRichValue(freeMenuTextInput, n.label || '');
    populateFontOptions(freeMenuFont);
    freeMenuFont.value = n.font || FONT_OPTIONS[0].key;
    freeMenuFontSize.value = n.fontSize || '';
    beginLabelPreview(id, freeMenuTextInput);
  }
  freeMenuUndoPushed = false;
  freeMenu.classList.add('open');
  positionFreeMenu(evt, n);
}

/* Which layer the menu is currently offering, kept apart from which
   button is lit.
 *
 * There are two buttons and three states: behind, the entry layer, and in
 * front. An element that has never been given a layer sits in the entry
 * layer, and the row lights "in front" for it, because that is the nearer
 * of the two. Reading the answer back OFF the lit button therefore turned
 * that display into a decision: change an image's URL and nothing else,
 * and it was moved in front of the whole chart. What the reader chose is
 * remembered here instead, and only a click on the row changes it. */
let freeMenuZ = 0;
// Two choices, not three: an image is either behind the chart or over it.
// "Normal" put it in the middle of the entry layer, which looked identical
// to "in front" in every arrangement that mattered.
function paintFreeLayerRow(z){
  const want = z < 0 ? -1 : 1;
  document.querySelectorAll('#freeMenuLayerRow .editor-btn').forEach(b=>{
    b.classList.toggle('on', Number(b.dataset.z) === want);
  });
}

document.getElementById('freeMenuClose').onclick = (ev)=>{ ev.stopPropagation(); closeFreeMenu(); };
freeMenu.addEventListener('click', ev=> ev.stopPropagation());
wireImagePicker('freeMenuImagePick', 'freeMenuImageClear', 'freeMenuImageUrl');

document.querySelectorAll('#freeMenuLayerRow .editor-btn').forEach(b=>{
  b.addEventListener('click', ev=>{
    ev.stopPropagation();
    freeMenuZ = Number(b.dataset.z);
    paintFreeLayerRow(freeMenuZ);
    queueFreeMenuCommit(0);
  });
});

/* The free-element menu commits as you use it too — one undo step for the
   whole time the menu is open, the same as the entry editor. */
let freeMenuUndoPushed = false;
let freeMenuTimer = 0;
function queueFreeMenuCommit(delay){
  if(freeMenuTimer) clearTimeout(freeMenuTimer);
  freeMenuTimer = setTimeout(()=>{ freeMenuTimer = 0; commitFreeMenu(); }, delay === undefined ? 480 : delay);
}
function flushFreeMenuCommit(){
  if(!freeMenuTimer) return;
  clearTimeout(freeMenuTimer); freeMenuTimer = 0;
  commitFreeMenu();
}
function commitFreeMenu(){
  const id = freeMenuId;
  if(!id || readOnlyView) return;
  const n = nodes.get(id);
  if(!n) return;
  const isImage = (n.shape||'') === 'image';
  const url = freeMenuImageUrl.value.trim();
  const text = freeMenuTextInput.value;
  const z = freeMenuZ;
  const font = freeMenuFont.value === FONT_OPTIONS[0].key ? null : freeMenuFont.value;
  const sizeRaw = freeMenuFontSize.value.trim();
  const fontSize = sizeRaw ? Number(sizeRaw) : null;
  endLabelPreview(true);
  if(!freeMenuUndoPushed){
    pushUndo();
    freeMenuUndoPushed = true;
  }
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    if(isImage){
      if(url) opts.image = url; else delete opts.image;
      if(z) opts.z = z; else delete opts.z;
    } else {
      found.entry[1] = text;
      if(font) opts.font = font; else delete opts.font;
      if(fontSize && Number.isFinite(fontSize)) opts.fontSize = fontSize; else delete opts.fontSize;
      /* The angle is not this form's to write. It is set on the caption
         itself, by the round arrow at its corner, and a commit from here
         that touched it would put back whatever the (now absent) slider
         last said. */
    }
    putEntry(found.index, found.entry, opts);
  });
  // Re-arm the live preview the commit just consumed.
  if(freeMenuId && nodes.has(freeMenuId) && !isImage) beginLabelPreview(freeMenuId, freeMenuTextInput);
}

document.getElementById('freeMenuDelete').onclick = (ev)=>{
  ev.stopPropagation();
  const id = freeMenuId;
  if(!id) return;
  endLabelPreview(true);
  freeMenuTimer && clearTimeout(freeMenuTimer);
  freeMenuTimer = 0;
  closeFreeMenu();
  deleteNode(id);
};

['freeMenuImageUrl','freeMenuFontSize'].forEach(id=>{
  const f = document.getElementById(id);
  if(!f) return;
  f.addEventListener('input', ()=> queueFreeMenuCommit());
  f.addEventListener('blur', ()=> flushFreeMenuCommit());
});
document.getElementById('freeMenuFont').addEventListener('change', ()=> queueFreeMenuCommit(0));

/* Eighths of a turn, when Shift is held on the rotate handle.
 *
 * The angles a caption actually wants are level, on its side, and the four
 * diagonals — the same set a callout's leader snaps to. Anything between
 * them is dialled in by eye with the key up. */
const ROT_SNAP = 45;

let currentEdgeNaturalColor = '#20242b'; // this edge's color with no override — what "Default" resets to

function openEdgeStylePopover(from, to, evt){
  // Moving to a different connector starts a fresh editing session, so the
  // next change to it is its own step of undo rather than joining the
  // previous connector's.
  if(currentEdgeStyleTarget && (currentEdgeStyleTarget.from!==from || currentEdgeStyleTarget.to!==to)){
    edgeEditUndoPushed = false;
  }
  currentEdgeStyleTarget = {from, to};
  let style = edgeStyleFor(from, to);
  const structEdge = structEdges.find(e=>e.from===from && e.to===to);
  currentEdgeNaturalColor = (structEdge && structEdge.color) || '#20242b';
  const a = nodes.get(from), b = nodes.get(to);
  edgeStyleLabelEl.textContent = (a ? stripMarkup(a.label) : from) + ' → ' + (b ? stripMarkup(b.label) : to);
  edgeStyleLabelEl.title = edgeStyleLabelEl.textContent;
  styleRoutingSel.value = style.routing;
  styleDashSel.value = style.sinusoid ? 'sinusoid' : style.dash;
  styleArrowEnds.set('in', !!style.arrowIn);
  styleArrowEnds.set('out', style.arrow !== false);
  /* A lineage feeding an amalgam has no arrowhead of its own: it runs into
     the shared bar, and the single arrow into the entry belongs to the
     merge as a whole. The toggles are greyed rather than hidden so the row
     still explains itself. */
  const mergedEdge = isAmalgamMember(from, to);
  document.getElementById('styleArrowEnds').classList.toggle('disabled', mergedEdge);
  document.querySelectorAll('#styleArrowEnds button').forEach(btn=>{
    btn.disabled = mergedEdge;
    btn.title = mergedEdge
      ? 'Set by the amalgam: merged lineages share one arrow into the entry'
      : (btn.dataset.end === 'in' ? 'Arrowhead at the start (in)' : 'Arrowhead at the end (out)');
  });
  /* And it cannot be painted with a gradient. Its colour is what says
     WHICH lineage this stretch of the bar belongs to — a sweep between two
     colours says it belongs to two, which is the one thing the bar exists
     to tell apart. The button is greyed rather than hidden, like the
     arrowheads above it, so the row still explains itself. */
  const gradBtn = document.querySelector('#stylePaintMode button[data-value="gradient"]');
  if(gradBtn){
    gradBtn.disabled = mergedEdge;
    gradBtn.classList.toggle('disabled', mergedEdge);
    gradBtn.title = mergedEdge
      ? 'Not on a merged lineage: its colour names which lineage it is'
      : 'Gradient along the connector';
  }
  if(mergedEdge && style.gradient){
    // Data can carry one even though the control cannot set it.
    style = Object.assign({}, style, {gradient: null, color: style.color || style.gradient[0]});
  }
  stylePaintMode.value = style.gradient ? 'gradient' : (style.color ? 'solid' : 'default');
  styleColorInput.value = (style.gradient ? style.gradient[0] : style.color) || currentEdgeNaturalColor;
  styleColor2Input.value = style.gradient ? style.gradient[1] : '';
  setRichValue(styleNoteInput, style.note || '');
  styleNoteSide.value = style.notePos || 'above';
  if(styleNoteBgInput) styleNoteBgInput.value = style.noteBg || '';
  syncColorRow();
  clearStyleStatus();
  edgePopover.classList.add('open');
  positionEdgePopover(evt);
  /* The marks on the line belong to the panel, so they go up WITH it.
   *
   * They were drawn only at the end of redrawEdges, and opening a panel
   * does not redraw anything — nothing about the chart has changed. So the
   * marks appeared the first time something else happened to redraw the
   * connectors, which is to say on the first edit, and were gone again the
   * next time the panel was opened without one. */
  drawBendHandles();
}
// The paint the popover's controls currently describe: nothing (inherit),
// one colour, or a gradient between two.
function currentPaint(){
  const mode = stylePaintMode.value;
  if(mode === 'default') return {};
  const c1 = readHex(styleColorInput);
  if(!c1) return {};
  if(mode === 'gradient'){
    const c2 = readHex(styleColor2Input);
    if(c2) return {gradient: [c1, c2]};
  }
  /* `colorFixed` marks a colour somebody CHOSE, as opposed to one a
     connector was born with. Connectors drawn out of a border used to
     record the border's colour as though it had been chosen, which is why
     recolouring an entry left its own connectors behind; now they record
     the ring instead and read the colour from it every time. This flag is
     what keeps a deliberate choice from being read the same way. */
  return {color: c1, colorFixed: true};
}
/* One undo step per popover session, same idea as the entry editor: a run
   of tweaks to one connector collapses into a single Ctrl+Z. */
let edgeEditUndoPushed = false;
/* The note this popover is currently describing: what has been typed, or,
   for a note pinned to a point on the line, the placeholder that placing
   the point put there. */
function noteFromForm(){
  const typed = styleNoteInput.value.trim();
  return typed || undefined;
}
function applyLiveEdgeStyle(){
  if(!currentEdgeStyleTarget || readOnlyView) return;
  if(!edgeEditUndoPushed){
    pushUndo();
    edgeEditUndoPushed = true;
  }
  const { dash, sinusoid } = selDashValue();
  const paint = currentPaint();
  // Sides and rings are set by dragging between border bands, not here —
  // carried through untouched so styling an edge never moves its ends.
  const kept = edgeStyleFor(currentEdgeStyleTarget.from, currentEdgeStyleTarget.to);
  setEdgeStyleOverride(currentEdgeStyleTarget.from, currentEdgeStyleTarget.to, {
    routing: styleRoutingSel.value, dash,
    arrow: styleArrowEnds.get('out'), arrowIn: styleArrowEnds.get('in') || undefined,
    sinusoid,
    note: noteFromForm(),
    // Only meaningful alongside a note; without one it would be a stored
    // setting that changes nothing.
    notePos: noteFromForm() ? styleNoteSide.value : undefined,
    noteBg: (styleNoteBgInput && readHex(styleNoteBgInput)) || undefined,
    color: paint.color,
    /* And the fact that it was CHOSEN, which is what makes it win over the
       colour of the border the connector was drawn from. It was computed
       in currentPaint and then dropped on the floor here, so a colour set
       by hand was overruled the moment the chart redrew: the popover
       previewed the change and the line stayed the colour it was. */
    colorFixed: paint.colorFixed || undefined,
    gradient: paint.gradient,
    fromSide: kept.fromSide || undefined,
    toSide: kept.toSide || undefined,
    fromRing: kept.fromRing || undefined,
    toRing: kept.toRing || undefined,
    // Placed on the drawing, not in this form — carried through untouched
    // so restyling a connector never straightens a route somebody bent.
    bends: (kept.bends && kept.bends.length) ? kept.bends : undefined
  });
  /* A callout on this connector is drawn in the connector's ink, and a
     callout is an ENTRY — it lives in the node layer, which redrawEdges
     does not touch. So recolouring a connector repainted its line, its
     arrowheads and its note plate at once and left the card hanging off it
     in the old colour until something else happened to redraw the entries:
     moving the leader's dot, which is the only reason it ever appeared to
     work. The entries are redrawn too when there is a card that cares. */
  if(connectorHasCallout(currentEdgeStyleTarget.from, currentEdgeStyleTarget.to)){
    renderNodes();
    if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
    paintMultiSelection();
  }
  redrawEdges();
  applyVisibility();
  refreshSaveUI();
}
// Whether any callout card hangs off this connector — see applyLiveEdgeStyle.
function connectorHasCallout(from, to){
  let found = false;
  nodes.forEach(n=>{
    if(found || !isCalloutNode(n) || !n.leader) return;
    if(n.leader.from === from && n.leader.to === to) found = true;
  });
  return found;
}
[styleColorInput, styleColor2Input].forEach(input=>{
  input.addEventListener('input', ()=>{ syncColorRow(); applyLiveEdgeStyle(); });
  input.addEventListener('click', ev=> ev.stopPropagation());
});
if(styleNoteBgInput){
  styleNoteBgInput.addEventListener('input', ()=> applyLiveEdgeStyle());
  styleNoteBgInput.addEventListener('click', ev=> ev.stopPropagation());
}
{
  const clear = document.getElementById('styleBendsClear');
  if(clear) clear.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(!currentEdgeStyleTarget || readOnlyView) return;
    const {from, to} = currentEdgeStyleTarget;
    if(!bendListOf(from, to).length) return;
    pushUndo();
    applyEdit(()=>{ setBendList(from, to, []); });
    refreshSaveUI();
  });
}
/* ---- picking where a leader note is pinned ---------------------------
 *
 * The fraction could have been a number field, and that would have been
 * both easier and worse: 0.62 means nothing when you are looking at an
 * elbowed line, and finding the right value would be guess-and-check.
 * Instead the connector itself is the control — move along it and a ghost
 * card follows, click to keep it.
 *
 * Holding Shift restricts the offer to the ends, the quarters and the
 * middle. Those are the places a leader note usually wants to be, and they
 * are exactly the places freehand pointing is worst at hitting: a value
 * that is nearly 0.5 looks like a mistake, where 0.5 looks deliberate.
 */
/* Where Shift offers to put a callout's anchor.
 *
 * Five — the ends, the quarters and the middle — were the places a note
 * usually wants when a connector could carry only one. A connector can
 * carry any number of them now, and a row of remarks along one line needs
 * somewhere to sit that is neither on top of its neighbour nor at a
 * fraction nobody chose. Twentieths are fine enough to place a dozen
 * along a line and coarse enough that two readers pointing at the same
 * place land on the same value. */
const LEADER_SNAP_STEPS = 20;
const LEADER_SNAPS = Array.from({length: LEADER_SNAP_STEPS + 1},
                                (_, i)=> +(i / LEADER_SNAP_STEPS).toFixed(4));
let leaderPick = null;   // {from, to, pts} while picking
/* ---------------------------------------------------------------------
   Smart guides.

   The grid keeps a chart tidy against ITSELF; it says nothing about
   whether the entry in your hand lines up with the one beside it. Two
   boxes of different heights have their centres at whatever offset their
   sizes give them, and no amount of snapped dragging will ever bring those
   centres together — the offset is not a whole number of grid steps.

   So while an entry is being carried, its edges and its centre are
   compared against the edges and centres of every other entry on the
   chart. Come within a few pixels of an alignment and the drag settles
   onto it, and a thin line is drawn through everything that shares it, so
   what the entry has lined up WITH is visible rather than inferred.

   Distances are measured in screen pixels and converted, so the pull feels
   the same however far the chart is zoomed. Ctrl — which already means
   "off the grid" — turns them off too: one modifier for "place this
   exactly where I am putting it".
   ------------------------------------------------------------------ */
const GUIDE_SNAP_PX = 6;      // how close counts as aligned, on screen
const GUIDE_OVERHANG = 12;    // how far a guide runs past the boxes it joins
/* The handles that bend a connector by hand. Above the drawing, because
   they are things to take hold of, and below the guides, which are only
   ever drawn over the top of whatever they are lining up. */
const bendLayer = el('g', {id:'bendLayer'}, viewport);

/* ---------------------------------------------------------------------
   Bending a connector by hand.

   The automatic router answers one question very well — how do I get from
   here to there without crossing anything — and cannot answer the other
   one at all: go THIS way, because this way says something. A line taken
   deliberately round the outside of a group, or brought down a corridor
   two other lines already use, is a statement about the chart; the
   shortest clear route is not.

   So a connector may be given points it has to pass through. They appear
   as handles while its panel is open — a filled mark on each bend it
   already has, and a hollow one in the middle of every straight run, which
   becomes a new bend the moment it is dragged. A plain drag steps by the
   ruled grid, Ctrl comes off it, and Shift lines the point up with what
   the OTHER connectors are doing: their runs and their own bends, which is
   the only thing a bend has any business being level with.

   Double-click a bend to take it out; the ✕ in the panel takes them all
   out at once.
   ------------------------------------------------------------------ */
const BEND_R = 4.2;               // the mark you take hold of
function bendListOf(from, to){
  const st = edgeStyleFor(from, to);
  return (st && Array.isArray(st.bends)) ? st.bends.map(b=> [b[0], b[1]]) : [];
}
function setBendList(from, to, list){
  const kept = edgeStyleFor(from, to);
  setEdgeStyleOverride(from, to, Object.assign({}, kept, {
    bends: (list && list.length) ? list : undefined
  }));
}
/* Every straight run of a drawn route, as {a, b} pairs — what the ghost
   handles sit in the middle of, and what another connector's bend lines
   itself up against. */
function routeRunsOf(pts){
  const runs = [];
  for(let i = 1; i < (pts || []).length; i++){
    const a = pts[i-1], b = pts[i];
    if(Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
    runs.push({a, b, vertical: Math.abs(b.x - a.x) < 0.5});
  }
  return runs;
}
function drawBendHandles(){
  /* Everything this reaches for is declared further down the file than the
     first draw, so on the very first pass none of it exists yet — and a
     chart with no panel open has no handles to draw in any case. */
  let host = null, target = null;
  try{
    host = bendLayer;
    if(readOnlyView) return;
    target = edgePopover.classList.contains('open') ? currentEdgeStyleTarget : null;
  }catch(e){ return; }
  while(host.firstChild) host.removeChild(host.firstChild);
  if(!target) return;
  const rec = drawnRoutes.get(calloutEdgeKey(target.from, target.to));
  if(!rec || !rec.pts || rec.pts.length < 2) return;
  const bends = bendListOf(target.from, target.to);
  const pts = rec.pts;

  // A ghost in the middle of every straight run: drag it and it becomes a
  // bend. Drawn first, so a real bend sitting on one is the one you get.
  routeRunsOf(pts).forEach(run=>{
    const mid = {x:(run.a.x + run.b.x)/2, y:(run.a.y + run.b.y)/2};
    if(bends.some(b=> Math.hypot(b[0]-mid.x, b[1]-mid.y) < BEND_R*2)) return;
    const g = el('g', {class:'bend-ghost'}, host);
    el('circle', {cx:mid.x.toFixed(2), cy:mid.y.toFixed(2), r:BEND_R + 4,
                  class:'bend-hit'}, g);
    el('circle', {cx:mid.x.toFixed(2), cy:mid.y.toFixed(2), r:BEND_R - 0.6,
                  class:'bend-mark bend-mark-new'}, g);
    el('title', {}, g).textContent = 'Drag to bend the connector here';
    g.addEventListener('mousedown', ev=> beginBendDrag(ev, target, mid, -1, pts));
    g.addEventListener('click', ev=> ev.stopPropagation());
  });
  bends.forEach((b, i)=>{
    const g = el('g', {class:'bend-handle', 'data-i':i}, host);
    el('circle', {cx:b[0].toFixed(2), cy:b[1].toFixed(2), r:BEND_R + 4, class:'bend-hit'}, g);
    el('circle', {cx:b[0].toFixed(2), cy:b[1].toFixed(2), r:BEND_R, class:'bend-mark'}, g);
    el('title', {}, g).textContent =
      'Drag to move this bend; Shift lines it up with the other connectors; double-click to take it out';
    g.addEventListener('mousedown', ev=> beginBendDrag(ev, target, {x:b[0], y:b[1]}, i, pts));
    g.addEventListener('click', ev=> ev.stopPropagation());
    g.addEventListener('dblclick', ev=>{
      ev.stopPropagation(); ev.preventDefault();
      if(readOnlyView) return;
      const list = bendListOf(target.from, target.to);
      list.splice(i, 1);
      pushUndo();
      applyEdit(()=>{ setBendList(target.from, target.to, list); });
      refreshSaveUI();
    });
  });
}
/* What a dragged bend may line itself up with: the OTHER connectors.
 *
 * Not the entries — a bend has no edge of its own to match against a box's,
 * and lining one up with a node's left side says nothing. What it can
 * usefully be level with is what the other lines are doing: the corridor a
 * vertical run of somebody else's route already occupies, or the height a
 * neighbouring bend sits at. Two lines that nearly agree read as a
 * mistake; the same two exactly level read as a pair. */
function bendAlignments(skipKey){
  const xs = [], ys = [];
  drawnRoutes.forEach((rec, key)=>{
    if(key === skipKey || !rec || !rec.pts) return;
    routeRunsOf(rec.pts).forEach(run=>{
      if(run.vertical) xs.push(run.a.x);
      else ys.push(run.a.y);
    });
  });
  EDGE_STYLES.forEach(st=>{
    if(!st || !Array.isArray(st.bends)) return;
    if(calloutEdgeKey(st.from, st.to) === skipKey) return;
    st.bends.forEach(b=>{ xs.push(b[0]); ys.push(b[1]); });
  });
  return {xs, ys};
}
let bendDrag = null;
function beginBendDrag(ev, target, at, index, pts){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation(); ev.preventDefault();
  const p = clientToWorld(ev.clientX, ev.clientY);
  bendDrag = {
    target, index, moved: false,
    startX: ev.clientX, startY: ev.clientY,
    grabDX: at.x - p.x, grabDY: at.y - p.y,
    at: {x: at.x, y: at.y},
    /* Where in the list a NEW bend belongs: after every bend that already
       lies earlier along the drawn route than this ghost does. */
    insertAt: index >= 0 ? index : (()=>{
      const f = fractionNearest(pts, at.x, at.y);
      const list = bendListOf(target.from, target.to);
      return list.filter(b=> fractionNearest(pts, b[0], b[1]) < f).length;
    })()
  };
  document.body.classList.add('bending');
}
window.addEventListener('mousemove', ev=>{
  const st = bendDrag;
  if(!st) return;
  if(!st.moved){
    if(Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < DRAG_THRESHOLD) return;
    st.moved = true;
  }
  const p = clientToWorld(ev.clientX, ev.clientY);
  let x = p.x + st.grabDX, y = p.y + st.grabDY;
  const free = ev.ctrlKey || ev.metaKey;
  clearGuides();
  if(ev.shiftKey && !free){
    const key = calloutEdgeKey(st.target.from, st.target.to);
    const {xs, ys} = bendAlignments(key);
    const tol = GUIDE_SNAP_PX / (vs || 1);
    const near = (v, list)=>{
      let best = null;
      list.forEach(t=>{ const d = t - v;
        if(Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, at:t}; });
      return best;
    };
    const gx = near(x, xs), gy = near(y, ys);
    if(gx){
      x = gx.at;
      el('line', {class:'align-guide align-guide-line', x1:x.toFixed(2), x2:x.toFixed(2),
                  y1:(y - 240).toFixed(2), y2:(y + 240).toFixed(2)}, guideLayer);
    }
    if(gy){
      y = gy.at;
      el('line', {class:'align-guide align-guide-line', y1:y.toFixed(2), y2:y.toFixed(2),
                  x1:(x - 240).toFixed(2), x2:(x + 240).toFixed(2)}, guideLayer);
    }
  } else if(!free){
    x = snapToGrid(x); y = snapToGrid(y);
  } else { x = Math.round(x); y = Math.round(y); }
  st.at = {x, y};
  const list = bendListOf(st.target.from, st.target.to);
  if(st.index >= 0) list[st.index] = [x, y];
  else list.splice(st.insertAt, 0, [x, y]);
  // Live, without a step of undo per frame: the drawn style is set, and
  // the drop below is what writes it down.
  setBendList(st.target.from, st.target.to, list);
  if(st.index < 0){ st.index = st.insertAt; }
  redrawEdges();
  applyVisibility();
  if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
});
window.addEventListener('mouseup', ()=>{
  const st = bendDrag;
  bendDrag = null;
  if(!st) return;
  document.body.classList.remove('bending');
  clearGuides();
  if(!st.moved) return;
  /* The click that ends the drag would otherwise reach the connector under
     it and re-open the panel on top of what was just done. */
  suppressNodeClick = true;
  setTimeout(()=>{ suppressNodeClick = false; }, 0);
  pushUndo();
  applyEdit(()=>{
    const list = bendListOf(st.target.from, st.target.to);
    setBendList(st.target.from, st.target.to, list);
  });
  refreshSaveUI();
});
const guideLayer = el('g', {id:'guideLayer', style:'pointer-events:none;'}, viewport);
function clearGuides(){
  while(guideLayer.firstChild) guideLayer.removeChild(guideLayer.firstChild);
}
/* The alignment the dragged group is closest to on one axis, if any.
   `mine` are the group's three interesting coordinates on that axis — near
   edge, centre, far edge — and every other entry offers the same three. */
/* Which of the alignments within reach to offer.
 *
 * `mine` and each `others.at` are three positions in the same order —
 * the near edge, the MIDDLE, the far edge — so index 1 on both sides is a
 * middle-to-middle alignment.
 *
 * Nearest alone is the wrong answer here, and two entries of different
 * heights are why. Their edges are close to each other in several places
 * at once, so an edge-to-edge alignment a pixel nearer than the middles
 * wins, and lining the two up by their middles — the alignment that makes
 * the connector between them run dead straight, and the one the reader is
 * almost always reaching for — is unreachable: it is always beaten by a
 * neighbouring edge. So each pairing gets a small handicap and the winner
 * is judged on the distance PLUS it: middle to middle first, then an edge
 * to the matching edge, then anything else. All three still have to be
 * within the snapping distance to be offered at all. */
function nearestAlignment(mine, others, tol){
  const BONUS = [ [0, 2.5, 3.5],
                  [2.5, -3.5, 2.5],
                  [3.5, 2.5, 0] ];
  let best = null, bestScore = Infinity;
  others.forEach(o=>{
    o.at.forEach((target, oi)=>{
      mine.forEach((m, mi)=>{
        const d = target - m;
        if(Math.abs(d) > tol) return;
        const score = Math.abs(d) + ((BONUS[mi] || [])[oi] || 0);
        // Whether this is the one alignment a reader is nearly always
        // after: the two entries' own middles, on top of each other.
        const mid = (mi === 1 && oi === 1);
        if(score < bestScore - 0.001){ bestScore = score; best = {d, at: target, with: [o], mid}; }
        else if(best && Math.abs(target - best.at) < 0.01 && best.with.indexOf(o) < 0){
          best.with.push(o);
        }
      });
    });
  });
  return best;
}
/* Lining up the CONNECTORS, not only the boxes.
 *
 * Two entries joined by a line that has to step sideways by four pixels is
 * the commonest untidy thing on a chart, and lining their BOXES up does
 * not fix it: what has to meet is the two ports, and a port sits at its
 * own share of the side it is on. Nor is one connector the whole of it —
 * a drop that lands a few pixels off the drop beside it reads as a
 * mistake, and there is nothing on the chart to line it up against.
 *
 * So two more offers, both measured off the routes as last drawn:
 *   - level the two ends of a connector one of whose entries is being
 *     carried, which is the offset that makes it straight;
 *   - put one of that connector's straight runs on the same line as some
 *     other connector's run of the same orientation, so the two read as
 *     one line rather than as two that nearly agree.
 */
function routeRuns(pts){
  const out = [];
  for(let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i+1];
    if(Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 4)
      out.push({axis:'x', v:a.x, lo:Math.min(a.y,b.y), hi:Math.max(a.y,b.y)});
    else if(Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 4)
      out.push({axis:'y', v:a.y, lo:Math.min(a.x,b.x), hi:Math.max(a.x,b.x)});
  }
  return out;
}
const RUN_NEIGHBOURHOOD = 120;   // how far apart two runs may be and still read as one line
function connectorAlignments(moving){
  const best = {x:null, y:null};
  const take = (axis, d, a, b)=>{
    const cur = best[axis];
    if(!cur || Math.abs(d) < Math.abs(cur.d)) best[axis] = {d, a, b};
  };
  const mine = [], others = [];
  drawnRoutes.forEach(rec=>{
    const pts = rec && rec.pts;
    if(!pts || pts.length < 2) return;
    const aM = moving.has(rec.from), bM = moving.has(rec.to);
    const runs = routeRuns(pts);
    if(!aM && !bM){ runs.forEach(r=> others.push(r)); return; }
    runs.forEach(r=> mine.push(r));
    if(aM === bM) return;                    // both ends carried: nothing to meet
    const p = aM ? pts[0] : pts[pts.length-1];
    const q = aM ? pts[pts.length-1] : pts[0];
    const lead = aM ? pts[1] : pts[pts.length-2];
    const sideways = Math.abs(lead.x - p.x) >= Math.abs(lead.y - p.y);
    if(sideways) take('y', q.y - p.y, p, q);
    else take('x', q.x - p.x, p, q);
  });
  mine.forEach(m=> others.forEach(o=>{
    if(m.axis !== o.axis) return;
    // Only where the two would actually lie alongside each other.
    if(Math.max(m.lo, o.lo) > Math.min(m.hi, o.hi) + RUN_NEIGHBOURHOOD) return;
    const a = m.axis === 'x' ? {x:m.v, y:(m.lo+m.hi)/2} : {x:(m.lo+m.hi)/2, y:m.v};
    const b = o.axis === 'x' ? {x:o.v, y:(o.lo+o.hi)/2} : {x:(o.lo+o.hi)/2, y:o.v};
    take(m.axis, o.v - m.v, a, b);
  }));
  return best;
}
/* And an amalgam offered the middle of its own bar.
 *
 * The bar is where its lineages hand over to the merged arrow, and the
 * arrow leaves from the bar's centre — so an amalgam standing anywhere
 * else makes the arrow leave at an angle to the entry it feeds. Nothing
 * else on the chart marks that place, and it cannot be guessed from the
 * boxes. */
function amalgamBarAlignment(st, offX, offY){
  if(!st || st.members.length !== 1) return null;
  const m = st.members[0], n = m.node;
  const bar = amalgamBars.get(m.id);
  if(!bar) return null;
  const mid = (bar.lo + bar.hi) / 2;
  const c = bar.axis === 'x'
    ? m.originX + offX + n.w/2
    : m.originY + offY + n.h/2;
  return {axis: bar.axis, d: mid - c, at: mid, bar};
}
function alignGuides(st, offX, offY, free){
  clearGuides();
  if(free || !st || !st.members || !st.members.length) return {x: offX, y: offY};
  const moving = new Set(st.members.map(m=> m.id));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  st.members.forEach(m=>{
    const nx = m.originX + offX, ny = m.originY + offY;
    x0 = Math.min(x0, nx);            y0 = Math.min(y0, ny);
    x1 = Math.max(x1, nx + m.node.w); y1 = Math.max(y1, ny + m.node.h);
  });
  if(!Number.isFinite(x0)) return {x: offX, y: offY};
  const tol = GUIDE_SNAP_PX / (vs || 1);
  const xs = [], ys = [];
  nodes.forEach(o=>{
    if(moving.has(o.id) || nodeHidden(o)) return;
    xs.push({node:o, at:[o.x, o.x + o.w/2, o.x + o.w]});
    ys.push({node:o, at:[o.y, o.y + o.h/2, o.y + o.h]});
  });
  let gx = nearestAlignment([x0, (x0+x1)/2, x1], xs, tol);
  let gy = nearestAlignment([y0, (y0+y1)/2, y1], ys, tol);
  /* The connectors' own offers, and the amalgam's bar, on the same terms
     as the boxes: within the same tolerance, and the nearest one wins. */
  const conn = connectorAlignments(moving);
  const barA = amalgamBarAlignment(st, offX, offY);
  let px = null, py = null;                 // an extra offer, if it beats the box
  const offer = (cand, axis)=>{
    if(!cand || Math.abs(cand.d) > tol) return;
    const box = axis === 'x' ? gx : gy;
    const held = axis === 'x' ? px : py;
    /* Two entries lined up on their MIDDLES is not given up for a
       connector's offer that happens to be a pixel nearer.
     *
       Centring one box on another is the alignment a reader reaches for
       most, and it is the one the eye checks afterwards — so an offer that
       quietly replaces it with "the ports of some connector meet here
       instead" undoes the very thing the hand was doing. The connector
       offers still win over an edge-to-edge match, which is what they were
       added for. */
    if(box && box.mid) return;
    if(box && Math.abs(box.d) <= Math.abs(cand.d)) return;
    if(held && Math.abs(held.d) <= Math.abs(cand.d)) return;
    if(axis === 'x'){ gx = null; px = cand; } else { gy = null; py = cand; }
  };
  if(conn.x) offer({d: conn.x.d, at: conn.x.b.x, span:[conn.x.a, conn.x.b]}, 'x');
  if(conn.y) offer({d: conn.y.d, at: conn.y.b.y, span:[conn.y.a, conn.y.b]}, 'y');
  if(barA) offer({d: barA.d, at: barA.at, bar: barA.bar}, barA.axis);
  const outX = offX + (gx ? gx.d : (px ? px.d : 0));
  const outY = offY + (gy ? gy.d : (py ? py.d : 0));
  // Drawn against the boxes as they will be once the snap is applied.
  const bx0 = x0 + (outX - offX), bx1 = x1 + (outX - offX);
  const by0 = y0 + (outY - offY), by1 = y1 + (outY - offY);
  if(gx){
    let lo = by0, hi = by1;
    gx.with.forEach(o=>{ lo = Math.min(lo, o.node.y); hi = Math.max(hi, o.node.y + o.node.h); });
    el('line', {class:'align-guide', x1:gx.at.toFixed(2), x2:gx.at.toFixed(2),
                y1:(lo - GUIDE_OVERHANG).toFixed(2), y2:(hi + GUIDE_OVERHANG).toFixed(2)}, guideLayer);
  }
  if(gy){
    let lo = bx0, hi = bx1;
    gy.with.forEach(o=>{ lo = Math.min(lo, o.node.x); hi = Math.max(hi, o.node.x + o.node.w); });
    el('line', {class:'align-guide', y1:gy.at.toFixed(2), y2:gy.at.toFixed(2),
                x1:(lo - GUIDE_OVERHANG).toFixed(2), x2:(hi + GUIDE_OVERHANG).toFixed(2)}, guideLayer);
  }
  /* The extra offers get the same line, drawn along whatever they joined:
     the two ports for a connector, the bar and the entry for a merge. */
  const paintExtra = (c, vertical)=>{
    if(!c) return;
    let lo, hi;
    if(c.bar){
      lo = Math.min(c.bar.lo, vertical ? by0 : bx0);
      hi = Math.max(c.bar.hi, vertical ? by1 : bx1);
    } else {
      const a = c.span[0], b = c.span[1];
      lo = Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x);
      hi = Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x);
    }
    el('line', {class:'align-guide align-guide-line',
                x1: vertical ? c.at.toFixed(2) : (lo - GUIDE_OVERHANG).toFixed(2),
                x2: vertical ? c.at.toFixed(2) : (hi + GUIDE_OVERHANG).toFixed(2),
                y1: vertical ? (lo - GUIDE_OVERHANG).toFixed(2) : c.at.toFixed(2),
                y2: vertical ? (hi + GUIDE_OVERHANG).toFixed(2) : c.at.toFixed(2)}, guideLayer);
  };
  paintExtra(px, true);
  paintExtra(py, false);
  return {x: outX, y: outY};
}
const leaderPickLayer = el('g', {id:'leaderPickLayer', style:'pointer-events:none;'}, viewport);

/* Choosing "on a leader line" IS the request to place it.
 *
 * There used to be a second button in a row below, so the placement was a
 * two-step act: pick the mode, then ask for the point. Nothing else in
 * this popover works that way — every other control takes effect as it is
 * set — and the extra row also had to explain itself. Selecting the
 * placement now starts the picking directly. */
function edgePointsFor(from, to){
  // The routed polyline as last drawn — the hit path carries it, and it is
  // the same geometry the note will be drawn against.
  const hit = edgeLayer.querySelector(
    `path.edge-hit[data-from="${cssEscape(from)}"][data-to="${cssEscape(to)}"]`);
  if(!hit) return null;
  const len = hit.getTotalLength();
  if(!len) return null;
  // Sampled rather than parsed: a wavy connector's rendered path is not the
  // skeleton, and sampling gives the same answer for both.
  const out = [];
  const steps = Math.max(8, Math.min(120, Math.round(len / 6)));
  for(let i=0;i<=steps;i++){ const p = hit.getPointAtLength(len*i/steps); out.push({x:p.x, y:p.y}); }
  return out;
}
function cssEscape(v){
  return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');
}
function beginCalloutPick(){
  if(!currentEdgeStyleTarget || readOnlyView) return;
  const {from, to} = currentEdgeStyleTarget;
  const pts = edgePointsFor(from, to);
  if(!pts){ setStyleStatus('err', 'This connector is not on screen to point at.'); return; }
  leaderPick = {from, to, pts, phase:'point', at:null, anchor:null, aim:null};
  document.body.classList.add('leader-picking');
  setStyleStatus('ok', 'Click the connector where the callout should attach — Escape cancels.');
  paintLeaderGhost(0.5);
}
function endCalloutPick(){
  if(!leaderPick) return;
  leaderPick = null;
  document.body.classList.remove('leader-picking');
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
}
function paintLeaderGhost(f){
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(!leaderPick) return;
  const m = pointAtFraction(leaderPick.pts, f);
  el('circle', {class:'leader-ghost', cx:m.x.toFixed(2), cy:m.y.toFixed(2), r:5}, leaderPickLayer);
  if(document.body.classList.contains('leader-snapping')){
    LEADER_SNAPS.forEach(s=>{
      const q = pointAtFraction(leaderPick.pts, s);
      el('circle', {class:'leader-snap', cx:q.x.toFixed(2), cy:q.y.toFixed(2), r:2.6}, leaderPickLayer);
    });
  }
}
function leaderFractionAt(ev){
  const p = clientToWorld(ev.clientX, ev.clientY);
  let f = fractionNearest(leaderPick.pts, p.x, p.y);
  if(ev.shiftKey){
    let best = LEADER_SNAPS[0];
    LEADER_SNAPS.forEach(s=>{ if(Math.abs(s-f) < Math.abs(best-f)) best = s; });
    f = best;
  }
  return f;
}

/* ---------------------------------------------------------------------
   Aiming the leader.

   Choosing where a note attaches is only half of placing one; the other
   half is where the card itself stands, and until now the chart guessed
   that — a search for somewhere clear, which is a reasonable guess and
   never the reader's own answer. So the gesture has a second half: pick
   the point on the connector, then move away from it and click again, and
   the leader is drawn from the point to wherever the pointer is.

   It is the same vocabulary the connectors already use, deliberately.
   Shift snaps — there, to the quarters of the line; here, to eighths of a
   turn about the anchor, which is what makes a row of notes point the same
   way as each other. Ctrl comes off the grid, so a leader can be any
   length rather than a whole number of steps. Nothing new to learn: the
   two keys mean here what they mean everywhere else on this chart.
   ------------------------------------------------------------------ */
/* How far a callout stands off its anchor when the gesture has nothing to
   go on yet — the length the dashed aim line starts at, before the pointer
   has said otherwise. */
const CALLOUT_GAP = 34;
const LEADER_AIM_STEP = 45;      // degrees, when Shift is held
const LEADER_AIM_MIN = 16;       // never so short the card sits on the line
function leaderAimAt(ev, anchor){
  const p = clientToWorld(ev.clientX, ev.clientY);
  let dx = p.x - anchor.x, dy = p.y - anchor.y;
  let dir = Math.atan2(dy, dx) * 180 / Math.PI;
  let len = Math.hypot(dx, dy);
  if(ev.shiftKey) dir = Math.round(dir / LEADER_AIM_STEP) * LEADER_AIM_STEP;
  // Ctrl is "off the grid" here exactly as it is when dragging an entry.
  if(!(ev.ctrlKey || ev.metaKey)) len = snapToGrid(len);
  return {dir, len: Math.max(LEADER_AIM_MIN, len)};
}
function paintLeaderAim(anchor, aim, snapping){
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  const a = aim.dir * Math.PI / 180;
  const tip = {x: anchor.x + Math.cos(a)*aim.len, y: anchor.y + Math.sin(a)*aim.len};
  /* The eight directions Shift offers, drawn as guides out of the anchor —
     the same dashed hairlines an entry gets when it is carried near
     another, and for the same reason: a snap you cannot see is a snap you
     cannot aim. */
  if(snapping){
    const reach = Math.max(aim.len, CALLOUT_GAP*2) + GUIDE_OVERHANG*2;
    for(let k = 0; k < 8; k++){
      const ang = k * LEADER_AIM_STEP * Math.PI / 180;
      el('line', {class:'align-guide', x1:anchor.x.toFixed(2), y1:anchor.y.toFixed(2),
                  x2:(anchor.x + Math.cos(ang)*reach).toFixed(2),
                  y2:(anchor.y + Math.sin(ang)*reach).toFixed(2)}, leaderPickLayer);
    }
  }
  el('circle', {class:'leader-ghost', cx:anchor.x.toFixed(2), cy:anchor.y.toFixed(2), r:5},
     leaderPickLayer);
  el('line', {class:'leader-aim', x1:anchor.x.toFixed(2), y1:anchor.y.toFixed(2),
              x2:tip.x.toFixed(2), y2:tip.y.toFixed(2)}, leaderPickLayer);
  el('circle', {class:'leader-aim-tip', cx:tip.x.toFixed(2), cy:tip.y.toFixed(2), r:3.4},
     leaderPickLayer);
}
svg.addEventListener('mousemove', ev=>{
  if(!leaderPick) return;
  if(leaderPick.phase === 'aim'){
    leaderPick.aim = leaderAimAt(ev, leaderPick.anchor);
    document.body.classList.toggle('leader-snapping', ev.shiftKey);
    paintLeaderAim(leaderPick.anchor, leaderPick.aim, ev.shiftKey);
    return;
  }
  document.body.classList.toggle('leader-snapping', ev.shiftKey);
  paintLeaderGhost(leaderFractionAt(ev));
});
/* A press is not the whole of a click.
 *
 * Swallowing the mousedown stops the chart panning, but the CLICK that
 * follows is a separate event with its own listeners — and the first thing
 * a reader clicks while placing a leader is the connector itself, whose
 * click handler opens that connector's settings again. Opening them syncs
 * the form back to what is STORED, which is not a leader note yet, and
 * syncing ends the picking. So the gesture died on its first step:
 * choosing a point looked like it did nothing at all, and no leader note
 * could be made. The click is swallowed too. */
/* Set on the press, and it has to expire.
 *
 * As a plain boolean it waited for a click that might never come — a press
 * that ends outside the drawing, a gesture cancelled with Escape, a
 * pointer that leaves the window — and the flag then sat there until the
 * reader clicked something else entirely, at which point that click was
 * swallowed instead. One click, silently ignored, some indefinite time
 * after the thing that armed it: as hard a fault to reproduce as this page
 * has had. A deadline swallows the click that belongs to this press and
 * nothing else. */
const SWALLOW_WINDOW = 700;   // ms a press may claim the click that follows
let swallowUntil = 0;
/* True for the moment between placing a leader note and the click that
   placed it finishing its journey through the page. See the popover's
   outside-click closer, which must not treat that click as "elsewhere". */
let leaderJustPlaced = false;
svg.addEventListener('click', ev=>{
  if(performance.now() > swallowUntil) return;
  swallowUntil = 0;
  ev.preventDefault(); ev.stopPropagation();
}, true);
svg.addEventListener('mousedown', ev=>{
  if(!leaderPick) return;
  // Swallowed so the click does not also pan the chart or clear the
  // selection out from under the popover that started this.
  ev.preventDefault(); ev.stopPropagation();
  swallowUntil = performance.now() + SWALLOW_WINDOW;
  if(leaderPick.phase !== 'aim'){
    /* First click: the point on the line. The card does not exist yet —
       the next move draws its leader out of this point, and the click
       after that puts it down. */
    const f = leaderFractionAt(ev);
    leaderPick.phase = 'aim';
    leaderPick.at = f;
    leaderPick.anchor = pointAtFraction(leaderPick.pts, f);
    leaderPick.aim = null;
    setStyleStatus('ok', 'Now click where the note should stand — Shift snaps the angle, Ctrl comes off the grid, Escape cancels.');
    paintLeaderAim(leaderPick.anchor, {dir:-90, len:CALLOUT_GAP*2}, false);
    return;
  }
  const {from, to, at, anchor} = leaderPick;
  const aim = leaderPick.aim || leaderAimAt(ev, leaderPick.anchor);
  endCalloutPick();
  leaderJustPlaced = true;
  setTimeout(()=>{ leaderJustPlaced = false; }, 0);
  clearStyleStatus();
  /* The second click MAKES the callout — a new entry, standing where the
     pointer is, pointing back at the place the first click chose. Nothing
     on the connector changes, which is the whole difference: a connector
     can now carry as many of these as anybody wants, and the plate it
     wears is a separate thing that neither knows about the other. */
  const a = aim.dir * Math.PI / 180;
  const cx = anchor.x + Math.cos(a) * aim.len;
  const cy = anchor.y + Math.sin(a) * aim.len;
  addCalloutAt(from, to, at, cx, cy);
}, true);
/* A new callout, centred on a point, pointing at a place on a connector.
   Created empty with its text editor open: an empty card with the caret in
   it says what happens next, which is what made picking a point feel like
   it had done something. */
const CALLOUT_DEFAULT_W = 96, CALLOUT_DEFAULT_H = 26;
function addCalloutAt(from, to, at, cx, cy){
  if(readOnlyView) return null;
  const ids = new Set(workingNodes.map(it=> it[0]));
  const id = uniqueId('callout', ids);
  const opts = {pos: [Math.round(cx - CALLOUT_DEFAULT_W/2),
                      Math.round(cy - CALLOUT_DEFAULT_H/2)]};
  if(from && to) opts.leader = {from, to, at};
  applyEdit(()=> workingNodes.push([id, '', null, null, null, 'callout', opts]));
  openLabelEditor(id);
  return id;
}
/* A callout is dragged like anything else on the chart.
 *
 * It used to be swung about its anchor by a special grip laid over the
 * card, because it was not an entry and had no position of its own — only
 * a direction and a distance measured from a point on a connector. Now it
 * IS an entry: it is picked up, carried, snapped to the grid, lined up
 * against its neighbours and dropped exactly the way a reality is, and its
 * leader simply follows it. One drag gesture on the whole chart. */

/* Escape gets out of it, at every stage and from either gesture.
 *
 * Nothing has been written down until the second click, so leaving is
 * simply leaving: the point chosen a moment ago was never committed and
 * no callout was ever made. */
document.addEventListener('keydown', ev=>{
  if(ev.key !== 'Escape') return;
  if(!leaderPick) return;
  ev.stopPropagation();
  endCalloutPick();
  clearStyleStatus();
}, true);

/* Closing keeps the change. There is nothing to revert on the way out any
   more: every adjustment was committed as it was made, and Ctrl+Z is the
   way back — the same way it is for everything else on the chart. */
function closeEdgePopover(){
  endCalloutPick();
  /* A note nobody wrote is not a note.
   *
   * Picking a point on the connector seeds an empty card with the caret in
   * it, so that choosing the point visibly does something — but if the
   * popover is closed with nothing written, that placeholder should go the
   * way an unwritten note anywhere else does, rather than leaving a blank
   * card pinned to the line for good. */
  if(currentEdgeStyleTarget && !readOnlyView){
    const {from, to} = currentEdgeStyleTarget;
    const kept = edgeStyleFor(from, to);
    if(kept.note && !kept.note.trim()){
      const bare = Object.assign({}, kept);
      delete bare.note; delete bare.notePos; delete bare.noteAt;
      delete bare.noteDir; delete bare.noteLen;
      setEdgeStyleOverride(from, to, bare);
      refreshSaveUI();
    }
  }
  edgePopover.classList.remove('open');
  currentEdgeStyleTarget = null;
  edgeEditUndoPushed = false;
  redrawEdges();
  applyVisibility();
  // …and come down with it, whether or not the redraw above reached them.
  drawBendHandles();
}

document.getElementById('styleClose').onclick = ()=> closeEdgePopover();
// Non-modal: no backdrop to click through, so a document-level listener
// closes the popover on any click outside it (the arrow-hit paths that
// open it already stopPropagation, so opening one never immediately
// re-triggers this on the same click).
// Capture phase, not bubble: several click handlers on the chart (nodes,
// other edges) call stopPropagation(), which would otherwise stop this
// from ever seeing those clicks. Capture-phase listeners on document run
// before a target's own handlers, so it sees every click regardless.
/* The pickers a toolbar opens are part of the popover, even though they
   are not inside it in the DOM.
 *
 * The sticker and citation pickers are positioned against the viewport, so
 * they live at the end of the body rather than inside whatever opened
 * them. Treating them as "outside" closed the connector popover the moment
 * one was opened, which cleared the edge being edited — so the insert then
 * landed in a form that no longer belonged to any connector, and the note
 * was thrown away. That is why inserting a sticker or a citation into a
 * connector's note did nothing. */
/* Everything on the page that is a MENU rather than the chart. A click in
   any of these leaves the connector's own popover open: reaching for the
   sticker picker, the management panel or the toolbar is part of working
   on the connector, not a decision to stop. Only the canvas itself — the
   entries, another connector, empty ground — puts it away. */
const MENU_SURFACES = ['#stickerPicker', '#refPicker', '.ask-overlay', '.crop-overlay',
  '.detail', '.legend', '.file-popover', '.add-popover', '.about-overlay',
  '.topbar', '.legend-add-menu', '.tag-menu', '.mini-toolbar'].join(',');
function inPopoverSatellite(target){
  return !!(target && target.closest && target.closest(MENU_SURFACES));
}
document.addEventListener('click', e=>{
  if(!edgePopover.classList.contains('open')) return;
  if(edgePopover.contains(e.target)) return;
  if(inPopoverSatellite(e.target)) return;
  /* …but a click on the chart is not "elsewhere" while the popover is
     waiting for one. Placing a leader note is a two-click gesture ON the
     drawing, started from this popover, and this listener runs before the
     chart's own — so the first click closed the popover, which cancelled
     the picking, which meant a leader note could not be made at all. */
  if(typeof leaderPick !== 'undefined' && leaderPick) return;
  /* And the click that FINISHES the gesture is not "elsewhere" either. It
     lands on the drawing, which closes the popover — and closing it drops
     a note nobody has written yet, which is exactly what the note it has
     just placed is. The reader would have seen their card appear and
     vanish in the same frame. */
  if(typeof leaderJustPlaced !== 'undefined' && leaderJustPlaced) return;
  /* A bend handle belongs to this panel as much as anything inside it.
     It is drawn on the chart because that is where a bend IS, and closing
     the panel on the click that takes hold of one removed the handle out
     from under the hand — a double-click to delete a bend never reached
     its second click, because there was nothing left to click on. */
  if(e.target && e.target.closest && e.target.closest('#bendLayer')) return;
  closeEdgePopover();
}, true);

styleDeleteBtn.onclick = ()=>{
  if(!currentEdgeStyleTarget) return;
  const {from,to} = currentEdgeStyleTarget;
  clearStyleStatus();
  if(deleteEdge(from, to)) closeEdgePopover();
};


/* ---------------------------------------------------------------------
   Add node — a small form that appends a new node to the live NODES
   data (optionally connected from an existing node) and publishes the
   result.
   ------------------------------------------------------------------ */
const addNodeOverlay = document.getElementById('addNodeOverlay');
const addNodeLabel = document.getElementById('addNodeLabel');
const addNodeTags = document.getElementById('addNodeTags');
const addNodeShapeSel = document.getElementById('addNodeShape');
const addNodeFontSel = document.getElementById('addNodeFont');
const addNodeFontSizeInput = document.getElementById('addNodeFontSize');
const addNodeColors = document.getElementById('addNodeColors');
const addNodeBg = document.getElementById('addNodeBg');
const addNodeBorderStyle = makeChoiceGroup('addNodeBorderStyle');
/* ---------------------------------------------------------------------
   Choosing an archetype by its picture.
 *
 * Five archetypes is a short enough set to show whole, and every one of
 * them is a SHAPE — which is the one thing a drop-down of words cannot
 * say. "Amalgam reality (gradient border & text)" is a sentence about a
 * thing you would recognise instantly if you were shown it. So the add
 * form shows them: a plain box, a portrait circle, a box with two lineages
 * merging into its top edge, a box with a T in it, a box with a picture in
 * it. Each button draws the archetype itself, at a size where its
 * silhouette is what you read.
 *
 * The <select> stays, hidden, because it is the value the rest of the form
 * — the image field, the label lock, the commit — already reads, and there
 * is no reason for any of that to learn a second way of being asked.
   ------------------------------------------------------------------ */
const NODE_STYLE_PICKS = [
  {value:'rect',    label:'Default',       hint:'An ordinary entry: a rounded box with its name in it.'},
  {value:'ellipse', label:'Character bio', hint:'A portrait circle, with its words on a card beside it.'},
  {value:'amalgam', label:'Amalgam',       hint:'A reality made of others: its lineages merge into one bar and one arrow.'},
  {value:'textbox', label:'Text field',    hint:'A loose line of text on the chart — no connections.'},
  {value:'image',   label:'Image',         hint:'A picture placed on the chart — no connections.'}
];
function nodeStyleIcon(kind){
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 40 30');
  svg.setAttribute('class', 'node-style-icon');
  const add = (tag, attrs)=>{
    const e = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k, v));
    svg.appendChild(e);
    return e;
  };
  const box = (y, h)=> add('rect', {x:6, y, width:28, height:h, rx:3, class:'nsi-box'});
  if(kind === 'rect'){
    box(8, 14);
  } else if(kind === 'ellipse'){
    add('circle', {cx:20, cy:15, r:10, class:'nsi-box'});
    add('circle', {cx:20, cy:12, r:3.1, class:'nsi-mark'});
    add('path', {d:'M14.4,22.6 a5.6,5 0 0 1 11.2,0', class:'nsi-mark'});
  } else if(kind === 'amalgam'){
    // Two lineages coming down onto one bar, and one arrow out of it.
    add('path', {d:'M11,3 V7 H29 V3', class:'nsi-line'});
    add('path', {d:'M20,7 V12', class:'nsi-line'});
    add('path', {d:'M17,10 L20,13.4 L23,10 Z', class:'nsi-fill'});
    box(14, 12);
  } else if(kind === 'textbox'){
    box(8, 14);
    add('path', {d:'M15,12 H25 M20,12 V19', class:'nsi-mark'});
  } else {
    box(8, 14);
    add('path', {d:'M9,20 L15,14 L19,17.5 L23,13.5 L31,20 Z', class:'nsi-fill-soft'});
    add('circle', {cx:14, cy:12, r:1.9, class:'nsi-fill-soft'});
  }
  return svg;
}
let paintAddShapePick = null;
{
  const host = document.getElementById('addNodeShapePick');
  if(host && addNodeShapeSel){
    NODE_STYLE_PICKS.forEach(p=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'node-style-btn';
      b.dataset.value = p.value;
      b.title = p.label + ' — ' + p.hint;
      b.appendChild(nodeStyleIcon(p.value));
      const cap = document.createElement('span');
      cap.className = 'node-style-cap';
      cap.textContent = p.label;
      b.appendChild(cap);
      b.addEventListener('click', ev=>{
        ev.stopPropagation();
        addNodeShapeSel.value = p.value;
        addNodeShapeSel.dispatchEvent(new Event('change', {bubbles:true}));
        paintAddShapePick();
      });
      host.appendChild(b);
    });
    paintAddShapePick = ()=>{
      const v = addNodeShapeSel.value || 'rect';
      host.querySelectorAll('.node-style-btn').forEach(b=>
        b.classList.toggle('on', b.dataset.value === v));
    };
    paintAddShapePick();
  }
}
const addNodeStatusEl = document.getElementById('addNodeStatus');
function setAddNodeStatus(kind, msg){ addNodeStatusEl.className = 'editor-status show ' + kind; addNodeStatusEl.textContent = msg; }
function clearAddNodeStatus(){ addNodeStatusEl.className = 'editor-status'; addNodeStatusEl.textContent = ''; }

/* The new-entry form is a popover, not a modal: it sits over one corner of
   the chart with no backdrop, so the map stays visible and navigable while
   it is open. It also carries only what you need to make an entry —
   connections, notes, links and language tabs are all things you set on an
   entry that already exists, and having them here made the form long
   enough to hide the chart it was adding to. */
document.getElementById('addNodeToggle').onclick = ()=>{
  closeToolbarMenus('addNodeOverlay');
  setRichValue(addNodeLabel, '');
  addNodeColors.value=''; addNodeTags.value='';
  if(paintAddSwatches) paintAddSwatches();
  addNodeBg.value = '';
  addNodeBorderStyle.value = 'solid';
  addNodeShapeSel.value = 'rect';
  if(typeof paintAddShapePick === 'function') paintAddShapePick();
  addNodeImageInput.value = '';
  syncImageFieldVisibility(addNodeShapeSel, addNodeImageField);
  populateFontOptions(addNodeFontSel);
  addNodeFontSel.value = FONT_OPTIONS[0].key;
  addNodeFontSizeInput.value = '';
  clearAddNodeStatus();
  addNodeOverlay.classList.add('open');
  const surface = richFields.get('addNodeLabel');
  if(surface) surface.surface.focus({preventScroll:true});
};
document.getElementById('addNodeCancel').onclick = ()=> addNodeOverlay.classList.remove('open');
document.getElementById('addNodeClose').onclick = ()=> addNodeOverlay.classList.remove('open');
addNodeOverlay.addEventListener('click', e=> e.stopPropagation());

function slugify(label){
  let base = stripMarkup(label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  if(!base) base = 'node';
  return base;
}
function uniqueId(base, existingIds){
  let id = base, n = 2;
  while(existingIds.has(id)){ id = base + '-' + n; n++; }
  return id;
}

// ---- copy / cut / paste ------------------------------------------------
// Snapshots the selected node's own content and styling — everything except
// its identity and its connections — into the cross-reload clipboard.
// Everything worth carrying about one entry, without its position.
function clipOfNode(n){
  const opts = {};
  if(n.link) opts.link = n.link;
  if(n.colors && n.colors.length) opts.colors = n.colors;
  if(n.tags && n.tags.length) opts.tags = n.tags;
  if(n.font) opts.font = n.font;
  if(typeof n.fontSize === 'number') opts.fontSize = n.fontSize;
  if(n.image) opts.image = n.image;
  if(n.size) opts.size = [n.size.w, n.size.h];
  if(n.multiLang) opts.multiLang = true;
  if(n.langTabs && n.langTabs.length) opts.langTabs = n.langTabs;
  /* Card layout, rotation and stacking travel with the copy too.
   *
     They were the three that did not, so a card came back as a plain box,
     a caption turned to thirty degrees came back level, and anything sent
     behind the chart came back in front of it. A copy is supposed to be
     the same thing again. */
  if(n.card) opts.card = true;
  /* A copied callout keeps pointing at the same place: it is a comment
     ABOUT that connector, and a copy of it is a second remark on the same
     thing rather than a card pointing at nothing. */
  if(n.leader) opts.leader = {from: n.leader.from, to: n.leader.to, at: n.leader.at};
  if(typeof n.rot === 'number' && n.rot) opts.rot = n.rot;
  if(typeof n.z === 'number' && n.z) opts.z = n.z;
  return {
    id: n.id,
    label: n.label,
    note: n.note || null,
    shape: n.shape || null,
    opts,
    // Where it sat, so a group of entries keeps its own arrangement when
    // it is put down somewhere else.
    x: n.x, y: n.y
  };
}
/* Copy takes the WHOLE selection.
 *
 * It used to take the primary entry and nothing else, so lassoing a dozen
 * entries and pressing copy quietly copied one of them — the gesture said
 * "these" and the clipboard heard "that one". A group is stored as a list
 * plus the connections BETWEEN its members, so what comes back is the
 * arrangement, not a heap of unrelated boxes. */
function copySelectedNode(){
  const ids = (multiSelection.size > 1)
    ? Array.from(multiSelection).filter(id=> nodes.has(id))
    : (selectedId && nodes.has(selectedId) ? [selectedId] : []);
  if(!ids.length) return false;
  const inSet = new Set(ids);
  const items = ids.map(id=> clipOfNode(nodes.get(id)));
  // Only the links whose BOTH ends are being copied travel with them.
  const links = [];
  ids.forEach(id=>{
    (nodes.get(id).parents || []).forEach(pid=>{
      if(inSet.has(pid)) links.push([pid, id]);
    });
  });
  const head = items[0];
  writeClipboard(Object.assign({}, head, {items, links}));
  return true;
}

function cutSelectedNode(){
  /* Copy takes the whole selection, so cut has to remove the whole
     selection. It removed the primary entry only, which meant a lasso of
     twelve followed by Ctrl+X put twelve on the clipboard, took one off the
     chart, and left the reader believing eleven had been cut. */
  const ids = (multiSelection.size > 1)
    ? Array.from(multiSelection).filter(id=> nodes.has(id))
    : (selectedId && nodes.has(selectedId) ? [selectedId] : []);
  if(!ids.length) return;
  if(!copySelectedNode()) return;
  if(ids.length > 1 && typeof deleteNodes === 'function') deleteNodes(ids);
  else deleteNode(ids[0]);
}

function pasteClipboardNode(){
  const clip = readClipboard();
  /* A picture element legitimately has no label, so testing for one
     refused a perfectly good clipboard: copy an image, paste, and the page
     said there was nothing to paste while holding it. */
  const hasSomething = clip && (clip.label || clip.id ||
    (Array.isArray(clip.items) && clip.items.length));
  if(!hasSomething){ setSaveState('ok', 'Nothing on the clipboard'); setTimeout(refreshSaveUI, 1400); return; }
  const items = (Array.isArray(clip.items) && clip.items.length) ? clip.items : [clip];
  const links = Array.isArray(clip.links) ? clip.links : [];
  const existingIds = new Set(workingNodes.map(it=>it[0]));
  /* A copy lands in the middle of what is on screen — always, wherever the
     entries it was copied from happen to be. Pasting beside the originals
     is only ever right while you are still looking at them, and the reader
     who pans across the chart and pastes is not: they are looking at where
     they want the copy. A group keeps its own arrangement: the spot places
     the group's top-left corner, and everything else keeps its offset from
     it. viewCentreSpot steps aside from anything already sitting there, so
     a run of pastes cascades rather than stacking. */
  const home = viewCentreSpot(items[0].shape || 'rect');
  const originX = Math.min(...items.map(it=> typeof it.x === 'number' ? it.x : 0));
  const originY = Math.min(...items.map(it=> typeof it.y === 'number' ? it.y : 0));
  const idMap = new Map();
  const made = [];
  applyEdit(()=>{
    items.forEach(it=>{
      const opts = Object.assign({}, it.opts || {});
      opts.pos = [ snapToGrid(home.x + ((it.x || 0) - originX)),
                   snapToGrid(home.y + ((it.y || 0) - originY)) ];
      const newId = uniqueId(slugify(it.label) + '-copy', existingIds);
      existingIds.add(newId);
      idMap.set(it.id || it.label, newId);
      made.push(newId);
      workingNodes.push([newId, it.label, undefined, undefined, it.note || undefined,
                         it.shape || undefined, Object.keys(opts).length ? opts : undefined]);
    });
    // The connections INSIDE the group come with it, pointing at the copies.
    links.forEach(([from, to])=>{
      const f = idMap.get(from), t = idMap.get(to);
      if(!f || !t) return;
      const entry = workingNodes.find(x=> x[0] === t);
      if(!entry) return;
      const parents = resolveExplicitParents(entry);
      if(parents.includes(f)) return;
      parents.push(f);
      entry[2] = parents.length === 1 ? parents[0] : parents;
    });
  });
  // Each paste starts from where the group was PUT, so a run of them walks
  // across the chart instead of landing on top of itself.
  writeClipboard(Object.assign({}, clip, {
    x: home.x, y: home.y,
    items: items.map(it=> Object.assign({}, it, {
      x: home.x + ((it.x || 0) - originX),
      y: home.y + ((it.y || 0) - originY)
    }))
  }));
  if(made.length > 1) setSelection(made, made[0]);
  else if(made.length) selectNode(made[0]);
}
function parseColorsField(raw){
  const colors = raw.trim() ? raw.trim().split(',').map(s=>s.trim()).filter(Boolean) : [];
  for(const c of colors){
    if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)){
      throw new Error(`"${c}" isn't a valid hex color (e.g. #c23b22).`);
    }
  }
  return colors;
}

document.getElementById('addNodeSubmit').onclick = ()=>{
  clearAddNodeStatus();
  const label = addNodeLabel.value.trim();
  /* An entry with nothing written in it is a perfectly good entry.
   *
     It used to be refused, on the reasoning that a box with no words says
     nothing — but plenty of things on a chart say something without words:
     a placeholder for a title nobody has settled on, a box whose whole
     content is a picture or a sticker, a spacer in a row, a shape carrying
     only its archetype and its colour. Refusing them meant typing a
     character and deleting it afterwards, which is not a rule, it is an
     obstacle. The only thing a label was still needed for is the entry's
     id, and that has a fallback. */
  // A new entry lands in the middle of what you are looking at, rather
  // than at the chart's origin, which may be nowhere near the screen.
  const parentId = null;
  const shapeVal = addNodeShapeSel.value==='rect' ? undefined : addNodeShapeSel.value;
  const image = (shapeVal==='ellipse' || shapeVal==='image') ? addNodeImageInput.value.trim() : '';
  const tags = keepAllowedTags(parseTagsField(addNodeTags.value), shapeVal);
  const font = addNodeFontSel.value===FONT_OPTIONS[0].key ? undefined : addNodeFontSel.value;
  const fontSizeRaw = addNodeFontSizeInput.value.trim();
  let fontSize;
  if(fontSizeRaw){
    fontSize = Number(fontSizeRaw);
    if(!Number.isFinite(fontSize) || fontSize<6 || fontSize>28){
      setAddNodeStatus('err', 'Font size must be a number between 6 and 28.');
      return;
    }
  }
  let colors, bg;
  try{ colors = parseColorsField(addNodeColors.value); }
  catch(e){ setAddNodeStatus('err', e.message); return; }
  try{ bg = parseColorsField(addNodeBg.value); }
  catch(e){ setAddNodeStatus('err', e.message); return; }
  const border = addNodeBorderStyle.value;
  const existingIds = new Set(workingNodes.map(it=>it[0]));
  /* Named after its words when it has some, and after its kind when it has
     none — an id is a handle for the chart's own bookkeeping, never
     something the reader reads. */
  const newNodeId = uniqueId(slugify(label), existingIds);
  const spot = viewCentreSpot(shapeVal);
  applyEdit(()=>{
    const opts = { pos: [spot.x, spot.y] };
    if(colors.length) opts.colors = capColors(colors, shapeVal);
    if(bg.length) opts.bg = bg;
    if(border && border !== 'solid') opts.border = border;
    if(tags.length) opts.tags = tags;
    if(font) opts.font = font;
    if(fontSize) opts.fontSize = fontSize;
    if(image) opts.image = image;
    workingNodes.push([newNodeId, label || '', parentId||undefined, undefined,
                       undefined, shapeVal, opts]);
  });
  addNodeOverlay.classList.remove('open');
  selectNode(newNodeId);
};

/* Where a brand-new entry should land: the middle of whatever the reader is
   currently looking at. The chart's origin is often far off screen after any
   amount of panning, so dropping a new box there means it appears to have
   gone nowhere. This reads the visible rectangle of the canvas, converts its
   centre back into chart coordinates, offsets by half the box so the box —
   not its corner — is centred, and snaps to the grid like a drag would. If
   something is already sitting there, it steps down and right until it finds
   clear ground, so two entries made in a row don't stack. */
/* The part of the canvas a reader can actually see. The panels are drawn
   OVER the canvas rather than beside it, so the canvas's own rectangle
   runs on underneath them — and an entry placed at the middle of that
   rectangle lands half-hidden behind whichever panel is open. */
function visibleCanvasRect(){
  const rect = svg.getBoundingClientRect();
  let left = rect.left, right = rect.right;
  /* A panel counts as covering its side of the canvas if it sits anywhere
     in the outer part of it — not only when it is flush against the edge.
     Both of these are inset by a margin, so testing for flushness found
     neither of them and the entry went on landing underneath them. */
  const edgeBand = rect.width * 0.4;
  const panel = document.getElementById('detail');
  if(panel && getComputedStyle(panel).display !== 'none'){
    const p = panel.getBoundingClientRect();
    if(p.width && p.right > right - edgeBand) right = Math.min(right, p.left);
  }
  const legend = document.getElementById('legend');
  if(legend && legend.classList.contains('open')){
    const p = legend.getBoundingClientRect();
    if(p.width && p.left < left + edgeBand) left = Math.max(left, p.right);
  }
  if(right - left < 120){ left = rect.left; right = rect.right; }
  return {left, right, top: rect.top, bottom: rect.bottom,
          width: right - left, height: rect.height};
}
// Is this chart position inside the part of the canvas on show?
function spotIsOnScreen(wx, wy){
  const rect = visibleCanvasRect();
  const sx = wx*vs + vx + svg.getBoundingClientRect().left;
  const sy = wy*vs + vy + svg.getBoundingClientRect().top;
  return sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom;
}
function viewCentreSpot(shapeVal){
  const rect = visibleCanvasRect();
  const w = shapeVal==='ellipse' ? BIO_SIZE : shapeVal==='image' ? IMAGE_DEFAULT_W : 120;
  const h = shapeVal==='ellipse' ? BIO_SIZE : shapeVal==='image' ? IMAGE_DEFAULT_H : NODE_MINH;
  const c = clientToWorld(rect.left + rect.width/2, rect.top + rect.height/2);
  let x = snapToGrid(c.x - w/2), y = snapToGrid(c.y - h/2);
  const taken = [...nodes.values()].map(n=>({x:n.x, y:n.y, w:n.w, h:n.h}));
  const clash = (px,py)=> taken.some(t=> px < t.x + t.w + 6 && px + w + 6 > t.x &&
                                         py < t.y + t.h + 6 && py + h + 6 > t.y);
  for(let i=0; i<40 && clash(x,y); i++){ x += GRID; y += GRID; }
  return {x, y};
}

/* ---------------------------------------------------------------------
   Connectors are drawn by dragging out of an entry's border, which is
   both more direct and the only way to choose WHICH border ring the arrow
   belongs to. The old click-one-node-then-the-other mode did the same job
   worse and has been removed; connectNodes below is still what actually
   records a connection, called now from the drag.
   ------------------------------------------------------------------ */
// Resolves an item's parent list to a plain array, regardless of whether
// it was stored as a single string, an array, or omitted/null (root).
function resolveExplicitParents(it){
  const p = it[2];
  if(p===undefined || p===null) return [];
  if(Array.isArray(p)) return p.slice();
  return [p];
}

/* Put a newly merged entry where its bar can reach it: centred across the
   lineages along the bar's axis, and a comfortable distance off them. */
function bringAmalgamToItsLineages(found, parentIds){
  const kids = parentIds.map(id=> nodes.get(id)).filter(Boolean);
  if(kids.length < 2) return;
  const n = nodes.get(found.entry[0]);
  if(!n) return;
  const cx = kids.reduce((a,p)=> a + p.x + p.w/2, 0) / kids.length;
  const cy = kids.reduce((a,p)=> a + p.y + p.h/2, 0) / kids.length;
  const spanX = Math.max(...kids.map(p=> p.x + p.w/2)) - Math.min(...kids.map(p=> p.x + p.w/2));
  const spanY = Math.max(...kids.map(p=> p.y + p.h/2)) - Math.min(...kids.map(p=> p.y + p.h/2));
  const own = {x: n.x + n.w/2, y: n.y + n.h/2};
  // Already within reach along the bar and not absurdly far off it: leave it.
  const along = spanX >= spanY ? own.x : own.y;
  const lo = spanX >= spanY ? Math.min(...kids.map(p=> p.x + p.w/2))
                            : Math.min(...kids.map(p=> p.y + p.h/2));
  const hi = spanX >= spanY ? Math.max(...kids.map(p=> p.x + p.w/2))
                            : Math.max(...kids.map(p=> p.y + p.h/2));
  const off = spanX >= spanY ? Math.abs(own.y - cy) : Math.abs(own.x - cx);
  if(along >= lo && along <= hi && off <= AMALGAM_LEASH) return;
  // Centred across them, and clear of them on the side it is already on.
  const stand = Math.min(Math.max(off, AMALGAM_HOME_GAP), AMALGAM_LEASH * 0.6);
  const sign = (spanX >= spanY ? (own.y - cy) : (own.x - cx)) >= 0 ? 1 : -1;
  const centre = spanX >= spanY
    ? {x: cx, y: cy + sign * stand}
    : {x: cx + sign * stand, y: cy};
  const opts = entryOpts(found.entry);
  opts.pos = [snapToGrid(centre.x - n.w/2), snapToGrid(centre.y - n.h/2)];
  putEntry(found.index, found.entry, opts);
}
// How far off its lineages a newly merged entry is stood when it has to be
// moved at all — far enough for the bar and the arrow to be legible.
const AMALGAM_HOME_GAP = 220;
// `geom` is optional; when a connector is drawn between two border bands
// it carries which side and which ring each end used, plus the colour of
// the ring it was pulled from — all recorded with the connection so it
// keeps the exact geometry and colour it was drawn with.
function connectNodes(sourceId, targetId, geom){
  const found = workingEntry(targetId);
  if(!found){ flashStatus('That entry could not be found.'); return; }
  const parents = resolveExplicitParents(found.entry);
  if(parents.includes(sourceId)){ flashStatus('Those entries are already connected.'); return; }
  /* An amalgam that has just become one is brought to its lineages.
   *
   * The bar spans the ground the lineages cover and the merged arrow
   * leaves from a point on it, so an entry sitting a thousand pixels away
   * when its second lineage arrives has nothing sensible to draw: the
   * landings all clamp to one end and the arrow strikes off across the
   * chart. Dragging an amalgam is already held inside its bar; this is the
   * same rule applied at the moment it first becomes one, and it only
   * moves an entry that is outside where it would be allowed to go. */
  const willMerge = (found.entry[5] === 'amalgam') && parents.length === 1;
  applyEdit(()=>{
    parents.push(sourceId);
    if(willMerge) bringAmalgamToItsLineages(found, parents);
    found.entry[2] = parents.length===1 ? parents[0] : parents;
    putEntry(found.index, found.entry, entryOpts(found.entry));
    if(geom && (SIDES.includes(geom.fromSide) || SIDES.includes(geom.toSide))){
      const existing = EDGE_STYLES.find(s=>s.from===sourceId && s.to===targetId);
      const entry = Object.assign({
        from: sourceId, to: targetId,
        routing: DEFAULT_EDGE_STYLE.routing,
        dash: DEFAULT_EDGE_STYLE.dash,
        arrow: DEFAULT_EDGE_STYLE.arrow
      }, existing || {}, {
        fromSide: SIDES.includes(geom.fromSide) ? geom.fromSide : undefined,
        toSide: SIDES.includes(geom.toSide) ? geom.toSide : undefined,
        fromRing: geom.fromRing || undefined,
        toRing: geom.toRing || undefined,
        /* The RING, not the colour of the ring.
         *
         * A connector drawn out of a border used to record the colour that
         * border happened to be at the time, which froze it: recolour the
         * entry and its own connectors stayed the old colour, and an
         * amalgam — which wears the colours of the lineages feeding it —
         * went on wearing colours nothing on the chart had any more. The
         * ring is already recorded; the colour is read from it at draw
         * time, so it follows. A colour chosen by hand in the connector's
         * own settings is a different thing and still wins. */
        color: (existing && existing.color) || undefined
      });
      if(existing) EDGE_STYLES[EDGE_STYLES.indexOf(existing)] = entry;
      else EDGE_STYLES.push(entry);
    }
  });
}

// Removes one connection (an existing arrow) - the inverse of connectNodes.
// Drops sourceId from the target's parent list, and also drops any
// per-edge style override that was set on that connection, since it no
// longer applies to anything once the connection is gone.
/* Taking a border away takes its connectors with it.
 *
 * A connector remembers which border ring it was pulled from, and that is
 * the whole point of a multi-bordered entry: pull from the black ring and
 * the connector is black, from the grey one and it is grey. Remove that
 * ring and the connector is remembering a border that no longer exists —
 * it fell back to the outermost one and silently became a lineage of a
 * different colour, joining a line it was never drawn from. So it goes
 * with the border it belonged to, the way an entry's connectors go when
 * the entry does. Must run inside an edit that is already open. */
function dropEdgesOnMissingRings(nodeId, rings){
  const doomed = EDGE_STYLES.filter(e=>
    (e.from === nodeId && (e.fromRing || 0) >= rings) ||
    (e.to   === nodeId && (e.toRing   || 0) >= rings));
  if(!doomed.length) return 0;
  doomed.forEach(e=>{
    const found = workingEntry(e.to);
    if(found){
      const parents = resolveExplicitParents(found.entry).filter(p=> p !== e.from);
      found.entry[2] = parents.length === 0 ? undefined
                     : (parents.length === 1 ? parents[0] : parents);
      putEntry(found.index, found.entry, entryOpts(found.entry));
    }
    const i = EDGE_STYLES.indexOf(e);
    if(i >= 0) EDGE_STYLES.splice(i, 1);
  });
  return doomed.length;
}
function deleteEdge(sourceId, targetId){
  const found = workingEntry(targetId);
  if(!found){ setStyleStatus('err', 'That node could not be found.'); return false; }
  applyEdit(()=>{
    const parents = resolveExplicitParents(found.entry).filter(p=>p!==sourceId);
    found.entry[2] = parents.length===0 ? undefined : (parents.length===1 ? parents[0] : parents);
    putEntry(found.index, found.entry, entryOpts(found.entry));
    const idx = EDGE_STYLES.findIndex(s=>s.from===sourceId && s.to===targetId);
    if(idx>=0) EDGE_STYLES.splice(idx,1);
  });
  return true;
}

// Removes a node entirely. Any other item that listed it as a parent loses
// that connection, and any per-edge style that touched it goes too.
// Deleting several at once, as one undo step: every parent link into any
// of them goes, and so does every per-edge style that touched one.
/* A connector's settings popover belongs to a connector. When either end
   of it goes, so does the popover — otherwise it stayed open, still
   titled with the entry that had just been deleted, and pressing anything
   in it wrote a fresh style row for a pair of ids where one no longer
   exists. That row is then saved into the chart and kept for good. */
function closePopoverIfTouching(ids){
  if(!currentEdgeStyleTarget) return;
  const set = ids instanceof Set ? ids : new Set(ids);
  if(set.has(currentEdgeStyleTarget.from) || set.has(currentEdgeStyleTarget.to)){
    closeEdgePopover();
  }
}
function deleteNodes(ids){
  const doomed = new Set(ids.filter(id=> workingIndex(id) !== -1));
  if(!doomed.size) return false;
  closePopoverIfTouching(doomed);
  applyEdit(()=>{
    workingNodes.forEach((it,idx)=>{
      if(doomed.has(it[0])) return;
      const parents = resolveExplicitParents(it);
      const remaining = parents.filter(p=>!doomed.has(p));
      if(remaining.length === parents.length) return;
      const out = [];
      for(let k=0;k<7;k++) out[k] = (k<it.length ? it[k] : undefined);
      out[2] = remaining.length===0 ? undefined : (remaining.length===1 ? remaining[0] : remaining);
      workingNodes[idx] = out;
    });
    for(let i=workingNodes.length-1;i>=0;i--){
      if(doomed.has(workingNodes[i][0])) workingNodes.splice(i,1);
    }
    for(let k=EDGE_STYLES.length-1;k>=0;k--){
      if(doomed.has(EDGE_STYLES[k].from) || doomed.has(EDGE_STYLES[k].to)) EDGE_STYLES.splice(k,1);
    }
  });
  deselect();
  return true;
}

function deleteNode(nodeId){
  closePopoverIfTouching([nodeId]);
  if(workingIndex(nodeId) === -1){ setEditStatus('err', 'That node could not be found.'); return false; }
  applyEdit(()=>{
    workingNodes.forEach((it,idx)=>{
      if(it[0]===nodeId) return;
      const parents = resolveExplicitParents(it);
      if(!parents.includes(nodeId)) return;
      const remaining = parents.filter(p=>p!==nodeId);
      const out = [];
      for(let k=0;k<7;k++) out[k] = (k<it.length ? it[k] : undefined);
      out[2] = remaining.length===0 ? undefined : (remaining.length===1 ? remaining[0] : remaining);
      workingNodes[idx] = out;
    });
    workingNodes.splice(workingIndex(nodeId), 1);
    for(let k=EDGE_STYLES.length-1;k>=0;k--){
      if(EDGE_STYLES[k].from===nodeId || EDGE_STYLES[k].to===nodeId) EDGE_STYLES.splice(k,1);
    }
  });
  deselect();
  return true;
}
