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
/* Where a rippled border actually is at one exact point on it.
 *
 * A rippled border is not a line, it is a band, so "where the border is"
 * has one answer per point. It is the same one line of arithmetic the
 * drawing uses — the wave's offset at that distance along the outline —
 * rather than a second implementation that can drift from it: see
 * pocketOutline, which hands back both the samples the border is drawn
 * from and the way to ask where a point of it stands. */
function pocketOutline(x, y, w, h){
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const corners = [{x:x + r, y}, {x:x + w - r, y}, {x:x + w, y:y + r},
                   {x:x + w, y:y + h - r}, {x:x + w - r, y:y + h},
                   {x:x + r, y:y + h}, {x, y:y + h - r}, {x, y:y + r},
                   {x:x + r, y}];          // closed: back to where it began
  const samples = sampleRounded(corners, r, POCKET_WAVELEN / WAVE_STEP_DIV);
  const total = samples.length ? samples[samples.length-1].s : 0;
  if(total < POCKET_WAVELEN * 3) return null;
  const lam = waveLambda(total, POCKET_WAVELEN);
  /* How far along the outline a point on one of the four sides is. The
     outline is walked clockwise from the top-left corner, so a side's
     distance is measured from the corner it starts at, and the quarter
     arcs between the sides count too. */
  const arc = Math.PI * r / 2;
  const sw = w - r*2, sh = h - r*2;
  const at = (side, px, py)=>{
    if(side === 'top') return px - (x + r);
    if(side === 'right') return sw + arc + (py - (y + r));
    if(side === 'bottom') return sw + arc + sh + arc + ((x + w - r) - px);
    return sw + arc + sh + arc + sw + arc + ((y + h - r) - py);
  };
  /* How far out the border stands, read off the points it is DRAWN from.
   *
     This used to be the wave's own arithmetic written out a second time,
     with a sign chosen by reasoning about which way the outline is walked
     — and the reasoning was wrong, so every connector into a rippled
     border aimed at the trough when the crest was there and stopped in
     the open air beside it. Nothing here reasons about direction any
     more: the drawn point is compared with the baseline point it came
     from, and outward is simply "away from the middle of the box". A
     change to how the wave is drawn cannot put this out again, because
     this is not a description of the drawing, it is the drawing. */
  const drawn = waveOffsetPoints(samples, -POCKET_AMP, lam, 0, total, true);
  /* …and it is looked up by WHERE IT IS, not by how far along the outline
     it ought to be. The distance a point is at can be worked out from the
     box (see distAt), and that arithmetic has to assume how long a rounded
     corner is; the sampler draws that corner as a curve of its own, so the
     two drift apart by a fraction of a corner each time round — a phase
     error that grows with every corner and lands a connector on the wrong
     part of the wave. Matching on the coordinate ALONG the side instead
     asks the drawing where it is and cannot drift. */
  const cx = x + w/2, cy = y + h/2;
  const bySide = {top:[], right:[], bottom:[], left:[]};
  drawn.forEach(q=>{
    let ox = q.bx - cx, oy = q.by - cy;
    const len = Math.hypot(ox, oy) || 1;
    ox /= len; oy /= len;
    const off = (q.x - q.bx) * ox + (q.y - q.by) * oy;
    const onTop = Math.abs(q.by - y) < 0.01, onBottom = Math.abs(q.by - (y + h)) < 0.01;
    const onLeft = Math.abs(q.bx - x) < 0.01, onRight = Math.abs(q.bx - (x + w)) < 0.01;
    if(onTop) bySide.top.push({u: q.bx, off});
    if(onBottom) bySide.bottom.push({u: q.bx, off});
    if(onLeft) bySide.left.push({u: q.by, off});
    if(onRight) bySide.right.push({u: q.by, off});
  });
  SIDES.forEach(side=> bySide[side].sort((a, b)=> a.u - b.u));
  const offAt = (side, u)=>{
    const list = bySide[side] || [];
    if(!list.length) return 0;
    if(u <= list[0].u) return list[0].off;
    if(u >= list[list.length-1].u) return list[list.length-1].off;
    let lo = 0, hi = list.length - 1;
    while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(list[mid].u <= u) lo = mid; else hi = mid; }
    const a = list[lo], b = list[hi];
    const t = (b.u - a.u) > 1e-9 ? (u - a.u) / (b.u - a.u) : 0;
    return a.off + (b.off - a.off) * t;
  };
  return {samples, total, lam, r, box: {x, y, w, h}, amp: POCKET_AMP,
          offsetAt: (side, px, py)=> offAt(side, sideIsVertical(side) ? px : py),
          distAt: at};
}
function pocketOutlineOfRing(n, ring){
  const step = ringStepFor(n);
  const grow = (ring || 0) * step;
  return pocketOutline(n.x - grow, n.y - grow, n.w + grow*2, n.h + grow*2);
}
/* Where an entry's border is, whatever the entry is drawn as.
 *
 * One table, one question, one answer — which is the whole point of it.
 * Every archetype and every border style that does not stand exactly on
 * the box it is measured from says so here, and nothing downstream asks
 * again: the port, the line's end, the arrowhead and the run-out are all
 * placed from this one number. Adding a style means adding a profile; it
 * does not mean finding the six places that assumed a flat edge.
 *
 * A profile answers `offsetAt(side, px, py)` — how far OUT of the box the
 * border stands at that point on that side, negative for inside — and
 * says which KIND of offset it is:
 *
 *   structural   the border is somewhere else entirely, so the port goes
 *                there too (a portrait's rim is a fifth of its width
 *                inside the box at the corners of its square)
 *   a ripple     the border wanders either side of the box while the port
 *                stays on it; only the drawn END moves, and by how much
 *                depends on whether it carries an arrowhead
 *
 * `amp` is how far the ripple can swing, which is what a headless line
 * has to bury itself past to be sure of touching at any phase. */
function borderProfileOf(n, ring){
  if(!n) return null;
  if(isWavyBorder(n)){
    const o = pocketOutlineOfRing(n, ring || 0);
    if(!o) return null;
    return {kind:'ripple', amp: o.amp, structural: false,
            offsetAt: (side, px, py)=> o.offsetAt(side, px, py)};
  }
  if((n.shape || '') === 'ellipse'){
    /* A portrait is a circle drawn inside the square the chart reasons
       with. On the middle of a side the two touch; anywhere else the rim
       is inside the square, by more the further along the side you go. */
    const step = ringStepFor(n);
    const rr = n.w/2 + (ring || 0) * step;
    const cx = n.x + n.w/2, cy = n.y + n.h/2;
    return {kind:'circle', amp: 0, structural: true,
            offsetAt: (side, px, py)=>{
              const d = sideIsVertical(side) ? (px - cx) : (py - cy);
              const k = rr*rr - d*d;
              return (k > 0 ? Math.sqrt(k) : 0) - rr;
            }};
  }
  return null;
}
/* wavyDropAt lived here: how deep a rippled border is at an arbitrary
   point along a side, for a port that had just been moved to one. Ports
   do not move any more, so the drop is read once, where the port is, by
   portOnSide itself. */
/* Where an arrowhead's TIP has to stand for the head to meet a rippled
 * border and not cut into it.
 *
 * The tip used to go exactly on the wave at the port — right for a point,
 * wrong for a triangle. The head widens as it leaves its tip, and the
 * ripple rises and falls under it faster than the head's sides slope
 * away, so beside a trough the neighbouring crests pushed up into the
 * head, and the border's own stroke, half of which stands outside the
 * wave's centre line, sat over the tip. So the head is lowered onto the
 * border the way a real triangle would come to rest on it: for every
 * point across its width, how high the stroked border stands there, less
 * how far the head's side has already risen at that distance from the
 * tip — and the tip stands at the highest of those. The head then
 * touches the border, at the tip or on a flank, and crosses it nowhere. */
/* wavyHeadDrop stood here, with the half-stroke constant it spent, and
   worked out how far an arrowhead had to stand off a ripple so that no
   crest beside its tip could push into a flank. Both are gone: the head
   goes to the border at its own point and is cut off at the outline, so
   there is nothing left for it to stand clear of. */
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
  /* A card is ONE box, and its ports are spread over the whole of each
     side like any other entry's.
   *
     They used to skip the picture band on the two upright sides, on the
     grounds that a connector meeting the middle of a photograph reads as
     an accident — but what that produced was worse: an entry whose
     geometry the reader can see and whose connectors behave as though it
     were a different, shorter box, with the whole fan crowded into the
     lower two thirds and shifting the moment a picture was added or taken
     away. A band inside an entry is not a second entry; adding one changes
     the entry's size, and its size is the whole of what a connector has to
     know. */
  const sideY = y + h * t;
  /* Carried on the port so a cap and a run-out both know how much of the
     entry's own border still stands OUTSIDE this ring. */
  const rings = ringCountOf(n);
  const at = {
    top:    {x:x + w*t, y},
    bottom: {x:x + w*t, y:y + h},
    left:   {x,         y:sideY},
    right:  {x:x + w,   y:sideY}
  }[side] || {x:x + w, y:sideY};
  /* And where the border really is at that point — see borderProfileOf,
     which is the one place any archetype's answer lives. A profile that
     MOVES the border takes the port with it; one that ripples about the
     box leaves the port on the box and tells the line's end and its
     arrowhead how far to go (see sinkEnds). */
  const prof = borderProfileOf(n, ring || 0);
  const nrm = SIDE_NORMAL[side] || {x:0, y:0};
  let drop = 0, sunk = 0;
  if(prof && prof.structural){
    const move = prof.offsetAt(side, at.x, at.y);
    at.x += nrm.x * move; at.y += nrm.y * move;
    /* How far this port stands INSIDE the box the router reasons with —
       the obstacle the other connectors keep out of, and the box this
       one's own run-out is measured from. A quarter of the way along a
       portrait's top edge the rim is a tenth of its width down inside the
       square, so a run-out of the ordinary length left the corner, and
       everything the router hangs off it, still inside the box and over
       the picture. See stubLength, which spends it. */
    sunk = Math.max(0, -move);
  } else if(prof){
    drop = prof.offsetAt(side, at.x, at.y);
  }
  /* `span` is the length shared out along this side, `slots` how many
     connectors are sharing it, `slot` which one this is — the spacing, and
     the whole of what decides where a port stands. */
  return {x:at.x, y:at.y, side, ring:ring||0, step, wavy, rings, drop, sunk,
          // How far the border can swing either side of the box — what a
          // line with no head has to get under to be sure of touching.
          band: prof ? (prof.amp || 0) : 0,
          owner: n.id, span: sideIsVertical(side) ? w : h,
          slot: i, slots: count};
}
/* A port does not travel along its side at all, and the three helpers
   that let it — portSlack, movePortAlong, nudgePortAlong — are gone with
   the alignment pass that was their only caller. The end of a connector
   is fastened where the geometry put it; the bending happens along the
   line. A rippled border's drop is therefore worked out once, where the
   port is, and never again at some new place along the side. */
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
    /* …and neither is a point sitting on top of its neighbour. A corner
       needs two legs; a leg of no length gives it no direction to turn
       from, and what came out was `L here Q here here` — an arc of zero
       radius at a place where the line does not bend. Invisible, and
       still a corner as far as anything counting them is concerned,
       which is how a lineage squeezed into a short run-out came to be
       reported as carrying a kink it did not have. */
    if(l1 < 0.01 || l2 < 0.01) continue;
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
   Waves, drawn along a line rather than instead of one.

   Every earlier attempt built the wavy shape from scratch: arcs laid out
   run by run, a phase grid to keep neighbouring runs and rings in step,
   flats so a crest never sat on a corner, and a separate piece of
   arithmetic answering "where exactly is this border" for anything that
   had to meet it. Each of those was a place for the wave to disagree with
   itself, and the corners were the worst of them — a wave cannot turn a
   right angle, so it stopped short of every bend and started again after.

   This draws the ORDINARY line first — the same rounded polyline every
   other connector is drawn as, the same rounded rectangle every other
   border is — and then runs a wave ALONG it: the path is walked at even
   steps and each point is pushed out along its own normal by
   `amp * sin(2π s / λ)`, where s is how far along the line the point is.
   A corner is not a special case any more: the line curves and the wave
   goes round with it. There is no phase grid, because the phase is the
   distance travelled; there are no flats, because there is nothing to
   protect; and where the border is at any point is the one line of
   arithmetic above rather than a second implementation of the drawing.

   The wavelength is stretched a hair so a whole number of waves fits the
   line exactly, which is what makes a closed border meet itself and an
   open run start and end on the baseline.
   ------------------------------------------------------------------ */
/* How finely the line is walked, as a fraction of one wavelength. Eight
   steps a wave is smooth at these amplitudes and keeps the drawn path
   short enough not to matter. */
/* How many samples one wavelength is drawn from. The wave is emitted as
   CURVES rather than as a chain of straight segments (see smoothPath), and
   a curve through six points a wavelength is smoother than a polyline
   through ten was — and shorter to write down. A sine drawn as line
   segments is a zigzag with the corners rounded off by nothing at all:
   at the sizes this chart is read at, the eye finds every one of them. */
const WAVE_STEP_DIV = 6;
/* The line itself, as points, with its corners already rounded — a
   rounded polyline sampled at roughly `step` apart, carrying the distance
   travelled with each point so the wave knows where it is. */
function sampleRounded(pts, r, step){
  const out = [];
  let run = 0;
  const push = (x, y)=>{
    const last = out[out.length-1];
    if(last){
      const d = Math.hypot(x - last.x, y - last.y);
      if(d < 1e-9) return;
      run += d;
    }
    out.push({x, y, s: run});
  };
  const line = (ax, ay, bx, by)=>{
    const len = Math.hypot(bx-ax, by-ay);
    const n = Math.max(1, Math.ceil(len / step));
    for(let i = 1; i <= n; i++) push(ax + (bx-ax)*i/n, ay + (by-ay)*i/n);
  };
  const quad = (ax, ay, cx, cy, bx, by)=>{
    const rough = Math.hypot(cx-ax, cy-ay) + Math.hypot(bx-cx, by-cy);
    const n = Math.max(2, Math.ceil(rough / step));
    for(let i = 1; i <= n; i++){
      const t = i/n, mt = 1 - t;
      push(mt*mt*ax + 2*mt*t*cx + t*t*bx, mt*mt*ay + 2*mt*t*cy + t*t*by);
    }
  };
  if(!pts || pts.length < 2) return out;
  push(pts[0].x, pts[0].y);
  let from = {x: pts[0].x, y: pts[0].y};
  for(let i = 1; i < pts.length - 1; i++){
    const a = pts[i-1], c = pts[i], b = pts[i+1];
    const l1 = Math.hypot(c.x-a.x, c.y-a.y), l2 = Math.hypot(b.x-c.x, b.y-c.y);
    if(l1 < 1e-9 || l2 < 1e-9) continue;
    const rr = Math.max(0, Math.min(r, l1/2, l2/2));
    const inX = c.x + (a.x-c.x)/l1*rr, inY = c.y + (a.y-c.y)/l1*rr;
    const outX = c.x + (b.x-c.x)/l2*rr, outY = c.y + (b.y-c.y)/l2*rr;
    line(from.x, from.y, inX, inY);
    quad(inX, inY, c.x, c.y, outX, outY);
    from = {x: outX, y: outY};
  }
  const end = pts[pts.length-1];
  line(from.x, from.y, end.x, end.y);
  return out;
}
/* A smooth line through a row of points.
 *
 * Catmull-Rom, written out as cubic Béziers — the curve passes through
 * every point it is given and its tangent at each one is the direction
 * from the point before to the point after, which is exactly what a wave
 * sampled at even distances wants. The alternative was to draw the samples
 * as straight segments, and that is a zigzag: however finely a sine is
 * sampled, every sample is a corner, and on a stroked line at any zoom the
 * corners are what the eye picks up first.
 *
 * It is the only thing in this file that turns points into a path, so any
 * line style built out of samples is smooth for free. */
function smoothPath(pts, closed){
  if(!pts || !pts.length) return '';
  const f = (p)=> `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const list = pts.slice();
  /* A closed outline is handed back with its last point on top of its
     first; the curve closes itself, so the duplicate would only be a
     zero-length segment with an undefined tangent. */
  if(closed && list.length > 2){
    const a = list[0], b = list[list.length-1];
    if(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) list.pop();
  }
  if(list.length === 1) return `M${f(list[0])}`;
  if(list.length === 2) return `M${f(list[0])} L${f(list[1])}`;
  const n = list.length;
  const at = (i)=> closed ? list[((i % n) + n) % n] : list[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(list[0])}`;
  const last = closed ? n : n - 1;
  for(let i = 0; i < last; i++){
    const p0 = at(i-1), p1 = at(i), p2 = at(i+1), p3 = at(i+2);
    d += ` C${f({x: p1.x + (p2.x - p0.x)/6, y: p1.y + (p2.y - p0.y)/6})}` +
         ` ${f({x: p2.x - (p3.x - p1.x)/6, y: p2.y - (p3.y - p1.y)/6})}` +
         ` ${f(p2)}`;
  }
  return d + (closed ? ' Z' : '');
}
/* The wave's own length, once it has been stretched to fit `len` exactly.
   Whole waves only: an open run then begins and ends on its baseline, and
   a closed one meets itself. */
function waveLambda(len, want){
  const n = Math.max(1, Math.round(len / want));
  return len / n;
}
/* How far the wave stands off the line at distance `s` along it. Positive
   is to the LEFT of the direction of travel — (-dy, dx) — so a caller
   choosing a sign is choosing a side. */
function waveOffsetAt(s, amp, lam){
  return amp * Math.sin(2 * Math.PI * s / lam);
}
/* The wave, as a path. `trim` (from, to) is the stretch actually drawn:
   an arrowhead covers the rest, and the wave is faded out over half a
   wavelength as it reaches a trimmed end so the visible line meets the
   head on the baseline rather than half-way up a crest. */
/* The points a wave is DRAWN from — the one place the shape exists.
 *
 * Everything that has to know where a wavy line really is reads this
 * array: the path emitter below, and the border query that tells a
 * connector where to stop (see pocketOutline). They cannot disagree about
 * a sign, a phase or a corner, because there is only one answer and both
 * of them read it. That is the whole point: the last three rounds each
 * had a version of "the drawing moved and the connectors did not", and
 * each was fixed by writing the same arithmetic out a second time. */
function waveOffsetPoints(samples, amp, lam, from, to, closed){
  if(!samples || !samples.length) return [];
  const total = samples[samples.length-1].s;
  const lo = Math.max(0, from || 0);
  const hi = Math.min(total, (typeof to === 'number') ? to : total);
  const fade = lam / 2;
  const out = [];
  for(let i = 0; i < samples.length; i++){
    const p = samples[i];
    if(p.s < lo - 1e-6 || p.s > hi + 1e-6) continue;
    const a = samples[Math.max(0, i-1)], b = samples[Math.min(samples.length-1, i+1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    /* The wave is faded out over half a wavelength as it reaches a trimmed
       end, so the visible line meets whatever covers the rest — an
       arrowhead, usually — on its baseline rather than half-way up a
       crest. */
    let k = 1;
    if(!closed){
      if(lo > 0.01) k = Math.min(k, Math.max(0, (p.s - lo) / fade));
      if(hi < total - 0.01) k = Math.min(k, Math.max(0, (hi - p.s) / fade));
    }
    const off = waveOffsetAt(p.s, amp, lam) * k;
    out.push({x: p.x - dy*off, y: p.y + dx*off, s: p.s, bx: p.x, by: p.y});
  }
  return out;
}
function wavyFromSamples(samples, amp, lam, from, to, closed){
  return smoothPath(waveOffsetPoints(samples, amp, lam, from, to, closed), closed);
}
// Many small scallops rather than a few big ones: a fine ripple reads as
// a deliberate frame, where a long slow wave just looks like a wobbly box.
/* A ripple, not a squiggle.
 *
 * Six was a zigzag: at that length the wave's own sides are steeper than
 * they are long, so whatever it is drawn with — segments or curves — what
 * the eye reads is a row of teeth. Ten gives each half-wave room to be a
 * curve, and against an amplitude of one and a half it reads as an edge
 * that ripples rather than as a saw. */
const POCKET_WAVELEN = 10;
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
/* How far the ripple swings either side of the border it is drawn along.
   Enough to read as an edge that ripples, and shallow enough that two
   rings a step apart keep daylight between them. */
const POCKET_AMP = 1.5;
// Kept under its old name for the things measured against the ripple's
// depth — see POCKET_DEEP, which is now simply the amplitude.
const POCKET_LIFT = POCKET_AMP;
/* Held back from the rx an ordinary entry's rectangle uses: the ripple
   wants as much of each side as it can get, and a wave goes round a small
   corner as happily as along a straight. */
const POCKET_CORNER_R = 2.5;
/* The outline, waved. Nothing here knows about sides, corners or phases:
   the rounded rectangle is walked and the wave is laid along it, so it
   closes on itself and turns its corners like any other part of the line. */
function wavyRectPath(x, y, w, h){
  const o = pocketOutline(x, y, w, h);
  if(!o) return roundedRectPath(x, y, w, h, POCKET_CORNER_R);
  return wavyFromSamples(o.samples, -POCKET_AMP, o.lam, 0, o.total, true);
}
/* A plain rounded rectangle, for the entry too small to carry a wave. */
function roundedRectPath(x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, w/2, h/2));
  return `M${(x+rr).toFixed(2)},${y.toFixed(2)} H${(x+w-rr).toFixed(2)}` +
         ` Q${(x+w).toFixed(2)},${y.toFixed(2)} ${(x+w).toFixed(2)},${(y+rr).toFixed(2)}` +
         ` V${(y+h-rr).toFixed(2)} Q${(x+w).toFixed(2)},${(y+h).toFixed(2)} ${(x+w-rr).toFixed(2)},${(y+h).toFixed(2)}` +
         ` H${(x+rr).toFixed(2)} Q${x.toFixed(2)},${(y+h).toFixed(2)} ${x.toFixed(2)},${(y+h-rr).toFixed(2)}` +
         ` V${(y+rr).toFixed(2)} Q${x.toFixed(2)},${y.toFixed(2)} ${(x+rr).toFixed(2)},${y.toFixed(2)} Z`;
}
/* One side of that same outline, left open: the strip a reader grabs to
   draw a connector is the border lit up, so it has to be the very same
   curve. Cut out of the outline's own samples rather than drawn again. */
function wavySideOpenPath(x, y, w, h, side){
  const o = pocketOutline(x, y, w, h);
  if(!o) return '';
  const r = o.r;
  const ends = {
    top:    [o.distAt('top', x + r, y), o.distAt('top', x + w - r, y)],
    right:  [o.distAt('right', x + w, y + r), o.distAt('right', x + w, y + h - r)],
    bottom: [o.distAt('bottom', x + w - r, y + h), o.distAt('bottom', x + r, y + h)],
    left:   [o.distAt('left', x, y + h - r), o.distAt('left', x, y + r)]
  }[side];
  if(!ends) return '';
  return wavyFromSamples(o.samples, -POCKET_AMP, o.lam, ends[0], ends[1], false);
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
/* Used by the regression suite rather than by the page: the clipping it
   does is the reference answer the drawing's own shortcuts are checked
   against. Deleting it would delete the check, not the dead weight. */
// eslint-disable-next-line no-unused-vars
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
