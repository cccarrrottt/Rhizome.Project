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
// The midpoint had a name of its own while a note was pinned to it. The
// note rides wherever it was dragged now, so every caller asks for the
// fraction it wants and this stood for nothing but the default.
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
function wireNoteEditing(g, from, to, pts){
  g.style.pointerEvents = 'auto';
  g.style.cursor = readOnlyView ? 'text' : 'grab';
  g.addEventListener('mousedown', ev=>{
    ev.stopPropagation();
    beginNoteDrag(ev, from, to, pts);
  });
  g.addEventListener('click', ev=> ev.stopPropagation());
  g.addEventListener('dblclick', ev=>{
    ev.stopPropagation(); ev.preventDefault();
    if(readOnlyView) return;
    openEdgeNoteEditor(from, to);
  });
}
/* ---------------------------------------------------------------------
   Sliding a note along its connector.

   The same three ways of placing everything else on this chart, and the
   same three a callout's anchor already uses: a plain drag steps in
   grid-sized pieces measured along the line, Ctrl comes off the grid, and
   Shift offers the five places a remark usually wants — the two ends, the
   quarters and the middle — drawn as beads while the key is down.

   A callout is an entry and carries its card with it; a note is a plate on
   the line and carries nothing, so this is the simpler half of the same
   gesture and shares its arithmetic.
   ------------------------------------------------------------------ */
let noteDrag = null;
function beginNoteDrag(ev, from, to, pts){
  if(ev.button !== 0 || readOnlyView) return;
  if(!pts || pts.length < 2) return;
  const st = edgeStyleFor(from, to);
  const at = (typeof st.noteAt === 'number') ? st.noteAt : 0.5;
  ev.preventDefault();
  noteDrag = {from, to, pts, at, moved:false,
              startX: ev.clientX, startY: ev.clientY};
}
window.addEventListener('mousemove', ev=>{
  const st = noteDrag;
  if(!st) return;
  if(!st.moved){
    if(Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < DRAG_THRESHOLD) return;
    st.moved = true;
    document.body.classList.add('leader-reaiming');
  }
  st.at = anchorFractionAt(ev, st);
  /* Live on the drawn style, without a step of undo per frame — the drop
     below is what writes it down. The same shape the bend drag uses. */
  const kept = edgeStyleFor(st.from, st.to);
  setEdgeStyleOverride(st.from, st.to, Object.assign({}, kept, {noteAt: st.at}));
  document.body.classList.toggle('leader-snapping', !!ev.shiftKey);
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(ev.shiftKey){
    LEADER_SNAPS.forEach(v=>{
      const q = pointAtFraction(st.pts, v);
      el('circle', {class:'leader-snap', cx:q.x.toFixed(2), cy:q.y.toFixed(2), r:2.6}, leaderPickLayer);
    });
  }
  redrawEdges();
  applyVisibility();
});
window.addEventListener('mouseup', ()=>{
  const st = noteDrag;
  noteDrag = null;
  if(!st) return;
  document.body.classList.remove('leader-reaiming');
  document.body.classList.remove('leader-snapping');
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(!st.moved) return;
  /* The click that ends the drag would otherwise reach the connector under
     it and re-open the panel on top of what was just done. */
  suppressNodeClick = true;
  setTimeout(()=>{ suppressNodeClick = false; }, 0);
  pushUndo();
  applyEdit(()=>{
    const kept = edgeStyleFor(st.from, st.to);
    setEdgeStyleOverride(st.from, st.to,
      Object.assign({}, kept, {noteAt: +st.at.toFixed(4)}));
  });
  refreshSaveUI();
});
/* A connector's note is a PLATE: a few words laid on, above or below the
   line at its midpoint. The card standing off on a leader is not a
   placement of this note any more — it is a callout, an entry of its own,
   and there can be any number of them on one connector. */
/* A note that has been asked for and not yet written.
 *
 * Its words go on the plate, so the plate is how it gets them — and a note
 * with no words has no plate, which is a circle with no way in. This is the
 * one case where an empty plate is drawn anyway: between the panel's button
 * asking for a note and the field opening on it. Cleared when the field
 * closes, whatever the field decided; an empty note is then drawn by
 * nothing and, having no words, is taken out of the style on commit.
 *
 * Deliberately `var` and deliberately here rather than beside the button
 * that sets it: the first draw happens while the page is starting up, long
 * before the panel's own part has run, and a `let` would be in its dead
 * zone rather than merely undefined. */
var noteStarting = null;
function drawEdgeNote(text, pts, pos, from, to, at, paint, bg){
  /* An empty note is drawn only while it is being written.
   *
   * The words go on the plate, which left a connector carrying no note with
   * nothing to double-click and therefore no way to write a first one. The
   * panel's button makes an empty note and opens the field; the plate has
   * to exist for the field to stand on, and has to disappear again if
   * nothing is typed — which it does, because an emptied note is deleted on
   * commit and this then draws nothing. */
  const writing = (nodeEditorTarget && nodeEditorTarget.kind === 'note' &&
                   nodeEditorTarget.from === from && nodeEditorTarget.to === to) ||
                  (noteStarting && noteStarting.from === from && noteStarting.to === to);
  if(!text && !writing) return;
  /* Where along the line it rides. It was pinned to the halfway point,
     which is the right place to START and the wrong place to be stuck: a
     remark belongs where the thing it remarks on is, and on a long
     connector crossing a crowded chart the middle is often the one stretch
     with no room for it. Dragged along the plate itself; see noteDrag. */
  const f = (typeof at === 'number' && at >= 0 && at <= 1) ? at : 0.5;
  const m = pointAtFraction(pts, f);
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
  /* The note is written ON the note. Double-click the plate and the field
     opens over it, in the note's own face and size — the same gesture, and
     the same field, that every other piece of text on this chart uses. The
     connector's panel keeps the placement, the ground and the callout
     button; the box that held a copy of the words is gone from it. */
  g.style.pointerEvents = 'auto';
  g.addEventListener('mousedown', ev=> ev.stopPropagation());
  g.addEventListener('click', ev=> ev.stopPropagation());
  g.addEventListener('dblclick', ev=>{
    ev.stopPropagation(); ev.preventDefault();
    if(readOnlyView) return;
    openEdgeNoteEditor(from, to);
  });
  wireNoteEditing(g, from, to, pts);
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
  /* A plate with nothing on it yet is still a plate. Measured from the
     text, an empty note is zero by zero — nothing to see, nothing to put a
     field on and nothing to take hold of — so it gets the size of a short
     word until there is a word. */
  const emptyW = EDGE_NOTE_FS * 4, emptyH = EDGE_NOTE_LINE_H;
  const tw = bb.width || emptyW, th = bb.height || emptyH;
  const tx = bb.width ? bb.x : (x - emptyW/2), ty = bb.height ? bb.y : (y - emptyH*0.75);
  const px2 = tx - 4, py2 = ty - 2, pw = tw + 8, ph = th + 4;
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
