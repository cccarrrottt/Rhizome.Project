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

