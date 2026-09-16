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
/* The second ground.
 *
 * "Unreleased" is the other thing an entry can be that is not a claim
 * about its content: it exists, it is documented, and it never came out.
 * It is drawn the way fan-fiction is — a patch of ruled ground under the
 * entry, fading out past it — because the two say the same KIND of thing
 * about a reality and belong in the same visual language. What separates
 * them is the ruling: fan-fiction is a warm gold lattice, woven, made by
 * hands that were not the owner's; unreleased is a cold grey comb of
 * straight verticals, like a shutter or a barred window, with no weave at
 * all. An entry can carry both. */
const UNRELEASED_TAG = 'unreleased';
/* Every piece of ground an entry can be standing on. Written once, because
   four separate places have to find all of them — the drag that carries
   them, the filter that hides them, the wash that dims them and the
   performance that lights them — and a fifth kind of ground added to three
   of the four is a decoration that behaves differently depending on what
   you do to it. */
const GROUND_PARTS = '.fanfic-weave, .fanfic-glint, .unreleased-rule, .unreleased-glint';
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
  [UNRELEASED_TAG]: 'Entries with this tag are drawn standing on a ruled grey ground.',
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
  /* The unreleased ground: the same patch, the same fade, the same
     machinery — a different ruling. A close grid, square to the page,
     where fan-fiction is an open lattice laid over at forty-five degrees;
     and grey rather than gold, because nothing was made here by anybody.

     It began as a comb of verticals on the same thirteen-pixel grid, which
     read as bars with daylight between them rather than as a mesh, and
     was pale enough that the light crossing it had nothing to light: the
     sweep brightens the RULING, so a ruling you can barely see brightens
     into something you still cannot. Half the step, both directions, and a
     darker ink — the glint now has something to happen to. */
  const UNRELEASED_STEP = 6.5;
  const up = el('pattern', {id:'unreleased-rule',
                            width:UNRELEASED_STEP, height:UNRELEASED_STEP,
                            patternUnits:'userSpaceOnUse'}, svgDefs);
  el('path', {d:`M0,0 H${UNRELEASED_STEP} M0,0 V${UNRELEASED_STEP}`,
              class:'unreleased-line'}, up);
  const upLit = el('pattern', {id:'unreleased-rule-lit',
                               width:UNRELEASED_STEP, height:UNRELEASED_STEP,
                               patternUnits:'userSpaceOnUse'}, svgDefs);
  el('path', {d:`M0,0 H${UNRELEASED_STEP} M0,0 V${UNRELEASED_STEP}`,
              class:'unreleased-line unreleased-line-lit'}, upLit);
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
// Named by nothing on purpose: the call is what matters — it puts the
// coarse ruling into the grid group — and the element is never referred to
// again. A binding kept for symmetry with the fine one above is a binding
// that reads as "someone will need this", which nobody ever did.
el('rect', {x:-ALIGN_SPAN/2, y:-ALIGN_SPAN/2,
  width:ALIGN_SPAN, height:ALIGN_SPAN, fill:'url(#align-grid-major)'}, alignGrid);

const ALIGN_GRID_KEY = carryOverKey('axiomNexus.alignGrid', 'rhizome.alignGrid');
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
