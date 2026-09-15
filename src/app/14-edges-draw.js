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
    /* Asked unconditionally: whether there is anything to draw is one
       question with one answer, and drawEdgeNote is where it lives — an
       empty note is still drawn while it is being started. */
    drawEdgeNote(style.note, pts, style.notePos, e.from, e.to, style.noteAt, paint, style.noteBg);
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
