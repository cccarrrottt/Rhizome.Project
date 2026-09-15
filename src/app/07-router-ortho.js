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

