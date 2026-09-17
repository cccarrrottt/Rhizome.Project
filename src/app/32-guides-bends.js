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
const GUIDE_DOT_R = 3.2;      // the mark on a guide that means a PLACE, not a line
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
    // Before the first live change: see applyEdit's `before`.
    st.before = takeSnapshot();
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
  applyEdit(()=>{
    pruneHandBends([st.target]);
  }, st.before);
  refreshSaveUI();
  drawBendHandles();
});
/* Bends that no longer say anything are taken out.
 *
 * A hand-set bend is a statement that the connector should NOT take the
 * route the router would give it. Once the entries have been moved back to
 * where that route and the bent one are the same line, the statement is
 * empty — but the points stayed in the list, and the next time either
 * entry moved the connector was dragged through them into a shape nobody
 * had asked for. So after anything that can make a bend redundant — a bend
 * let go, an entry let go — each affected connector is routed once without
 * its bends, and if that is the line already drawn, the bends go. Then the
 * ones the drawn route simply passes straight through go as well. */
/* "The same line", as a reader judges it rather than to the pixel.
 *
 * A bend dragged back to where the connector used to turn lands on the
 * ruled grid, and the corner it came from did not: the two routes have the
 * same shape and every corner within a step of the other, and that was
 * enough for them to count as different — so the bends stayed, and the
 * next move of either entry dragged the line through them. Same number of
 * corners, turning the same ways, each within BEND_SAME_TOL of its
 * counterpart, is the same line. */
const BEND_SAME_TOL = GRID + 2;
function samePolyline(a, b, tol){
  const t = (typeof tol === 'number') ? tol : 0.6;
  const norm = (pts)=> tidyPoints((pts || []).map(q=> ({x:q.x, y:q.y})));
  const p = norm(a), q = norm(b);
  if(p.length !== q.length) return false;
  for(let i = 0; i < p.length; i++){
    if(Math.abs(p[i].x - q[i].x) > t || Math.abs(p[i].y - q[i].y) > t) return false;
  }
  return true;
}
function pruneHandBends(pairs){
  const seen = new Set();
  const todo = (pairs || []).filter(pr=>{
    const k = calloutEdgeKey(pr.from, pr.to);
    if(seen.has(k)) return false;
    seen.add(k);
    return bendListOf(pr.from, pr.to).length > 0 && !isAmalgamMember(pr.from, pr.to);
  });
  if(!todo.length) return false;
  let changed = false;
  const ports = resolvePorts(structEdges);
  todo.forEach(pr=>{
    const rec = drawnRoutes.get(calloutEdgeKey(pr.from, pr.to));
    const e = structEdges.find(x=> x.from === pr.from && x.to === pr.to);
    const a = nodes.get(pr.from), b = nodes.get(pr.to);
    if(!rec || !e || !a || !b) return;
    const bare = Object.assign({}, edgeStyleFor(pr.from, pr.to), {bends: undefined});
    /* Routed against the OTHER connectors only. The record of what has
       been drawn still holds this connector's own bent route, and the
       router steers away from overlapping what is there — so the trial
       dodged its own ghost and came out a different shape from the one it
       would really take. */
    const key = calloutEdgeKey(pr.from, pr.to);
    resetRoutedSegments();
    drawnRoutes.forEach((r, k)=>{ if(k !== key && r && r.pts) registerRoutedSegments(r.pts); });
    const auto = routeEdge(a, b, bare, ports.get(e));
    if(auto && samePolyline(auto.pts, rec.pts, BEND_SAME_TOL)){
      setBendList(pr.from, pr.to, []);
      changed = true;
      return;
    }
    const list = bendListOf(pr.from, pr.to);
    const kept = dropIdleBends(pr.from, pr.to, list);
    if(kept.length !== list.length){ setBendList(pr.from, pr.to, kept); changed = true; }
  });
  // The trial routes above were recorded as drawn; the next redraw starts
  // that record again from nothing, so nothing is steered by them.
  return changed;
}
/* A bend that bends nothing is taken out when it is let go.
 *
 * Dragging a hollow mark out of a run and dropping it back on that run
 * left a point the route passes STRAIGHT through: nothing drawn changed,
 * but the connector was now pinned there, stopped following its entries
 * the way an unbent one does, and carried a handle to catch on. A point is
 * kept only where the drawn route actually turns — within BEND_ABSORB of
 * it, because the route squares a small offset away (see bentRoute) and
 * the corner it turns at is then a few units from the stored point. */
function dropIdleBends(from, to, list){
  if(!list.length) return list;
  const rec = drawnRoutes.get(calloutEdgeKey(from, to));
  const pts = rec && rec.pts;
  if(!pts || pts.length < 2) return list;
  const turns = [];
  for(let i = 1; i < pts.length - 1; i++){
    const a = pts[i-1], b = pts[i], c = pts[i+1];
    const straight = (Math.abs(a.x - b.x) < 0.5 && Math.abs(c.x - b.x) < 0.5) ||
                     (Math.abs(a.y - b.y) < 0.5 && Math.abs(c.y - b.y) < 0.5);
    if(!straight) turns.push(b);
  }
  return list.filter(p=> turns.some(t=>
    Math.abs(t.x - p[0]) <= BEND_ABSORB + 0.01 && Math.abs(t.y - p[1]) <= BEND_ABSORB + 0.01));
}
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
/* `shift` is how far the carried entries have moved since the routes in
 * drawnRoutes were drawn. Those routes are a frame old — they are redrawn
 * once per frame and the pointer runs ahead of them — so a carried end
 * read straight off them is where the entry WAS. Measured from there, the
 * offer was applied to where the entry is now: the entry landed somewhere
 * else and the guide was drawn at a level nothing was aligned to. The
 * carried ends and runs are moved on by `shift` before anything is
 * compared. */
function connectorAlignments(moving, shift){
  const sx = (shift && shift.x) || 0, sy = (shift && shift.y) || 0;
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
    /* A run of a connector with one end in the hand is only roughly where
       the drag has taken it — the far end has not moved — but the run
       nearest the carried end has, and that is the one worth lining up. */
    runs.forEach(r=> mine.push(r.axis === 'x'
      ? {axis:'x', v:r.v + sx, lo:r.lo + sy, hi:r.hi + sy}
      : {axis:'y', v:r.v + sy, lo:r.lo + sx, hi:r.hi + sx}));
    if(aM === bM) return;                    // both ends carried: nothing to meet
    const raw = aM ? pts[0] : pts[pts.length-1];
    const p = {x: raw.x + sx, y: raw.y + sy};
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
/* And the places on a merge's bar — see barTargetsFor.
 *
 * The amalgam used to be offered the middle of its own bar and nothing
 * else, and a parent was offered nothing at all. Now whatever single entry
 * is in the hand and belongs to a bar is offered every place on it, and
 * all of them are marked while Shift is held, so the snap is aimed rather
 * than stumbled on. */
function barAlignment(st, offX, offY){
  let best = null;
  barTargetsFor(st).forEach(t=>{
    const m = st.members[0], n = m.node;
    const c = (t.bar.axis === 'x' ? m.originX + offX + n.w/2 : m.originY + offY + n.h/2) + t.portOff;
    t.places.forEach(pl=>{
      const d = pl.at - c;
      if(!best || Math.abs(d) < Math.abs(best.d)) best = {axis: t.bar.axis, d, at: pl.at, bar: t.bar,
                                                          place: pl, portOff: t.portOff};
    });
  });
  return best;
}
function paintBarPlaces(st){
  barTargetsFor(st).forEach(t=>{
    t.places.forEach(pl=>{
      const x = t.bar.axis === 'x' ? pl.at : t.bar.cross;
      const y = t.bar.axis === 'x' ? t.bar.cross : pl.at;
      el('circle', {class:`align-guide align-guide-dot bar-place bar-place-${pl.kind}`,
                    cx:x.toFixed(2), cy:y.toFixed(2),
                    r: pl.kind === 'mid' ? GUIDE_DOT_R + 1 : GUIDE_DOT_R - 0.6}, guideLayer);
    });
  });
}
function alignGuides(st, offX, offY, free){
  clearGuides();
  if(free || !st || !st.members || !st.members.length) return {x: offX, y: offY, hitX:false, hitY:false};
  const moving = new Set(st.members.map(m=> m.id));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  st.members.forEach(m=>{
    const nx = m.originX + offX, ny = m.originY + offY;
    x0 = Math.min(x0, nx);            y0 = Math.min(y0, ny);
    x1 = Math.max(x1, nx + m.node.w); y1 = Math.max(y1, ny + m.node.h);
  });
  if(!Number.isFinite(x0)) return {x: offX, y: offY, hitX:false, hitY:false};
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
  const drawn = st.drawnOff || {x: 0, y: 0};
  const conn = connectorAlignments(moving, {x: offX - drawn.x, y: offY - drawn.y});
  const barA = barAlignment(st, offX, offY);
  paintBarPlaces(st);
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
    /* …and, for a merge, a mark on the point of the bar being aimed at.
       The line alone says "this coordinate"; the middle of a bar is a
       PLACE, and the reader is centring the entry on it. */
    if(c.bar && typeof c.bar.cross === 'number'){
      const at = typeof c.mark === 'number' ? c.mark : c.at;
      el('circle', {class:'align-guide align-guide-dot bar-place-taken',
                    cx: (vertical ? at : c.bar.cross).toFixed(2),
                    cy: (vertical ? c.bar.cross : at).toFixed(2),
                    r: GUIDE_DOT_R + 2.5}, guideLayer);
    }
  };
  paintExtra(px, true);
  paintExtra(py, false);
  return {x: outX, y: outY, hitX: !!(gx || px), hitY: !!(gy || py)};
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
    paintConnectorSnaps(leaderPick.pts);
  }
}
function leaderFractionAt(ev){
  const p = clientToWorld(ev.clientX, ev.clientY);
  let f = fractionNearest(leaderPick.pts, p.x, p.y);
  if(ev.shiftKey){
    const sn = nearestSnapRecord(leaderPick.pts, f);
    if(sn) f = sn.f;
    leaderPick.snapName = snapNameFor(leaderPick.pts, sn);
  } else leaderPick.snapName = null;
  return f;
}

