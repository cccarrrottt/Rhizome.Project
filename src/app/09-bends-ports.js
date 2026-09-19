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
/* How far off a neighbour's line a bend may be and still be put ON it.
 *
 * A bend is stored where it was dropped, on the ruled grid; the port it
 * leads to is not on that grid, and moves whenever its side gains or loses
 * a connector or its entry is resized. So a bend that was dead in line with
 * the run out of its port when it was placed is, a little later, three
 * units to one side of it — and the route goes out, steps three units
 * across, and goes on: a knee that does not meet. Less than one grid step
 * is never a statement anybody made with a bend, so the route squares it
 * away when it is drawn, every time, rather than once when it is dropped. */
const BEND_ABSORB = GRID - 0.5;
function absorbBendOffsets(s1, bends, s2){
  const out = bends.map(b=> ({x:b.x, y:b.y}));
  const near = (u, v)=> Math.abs(u - v) > 0.01 && Math.abs(u - v) <= BEND_ABSORB;
  // Forward from the source's run-out, each point against the one before…
  let prev = s1;
  out.forEach(b=>{
    if(near(b.x, prev.x)) b.x = prev.x;
    if(near(b.y, prev.y)) b.y = prev.y;
    prev = b;
  });
  // …and the last against the target's, which it has to arrive in line with.
  const last = out[out.length - 1];
  if(last){
    if(near(last.x, s2.x)) last.x = s2.x;
    if(near(last.y, s2.y)) last.y = s2.y;
  }
  return out;
}
/* The polyline through those points, turned into right angles.
 *
 * Each leg between two consecutive points becomes an L, and which way
 * round the L goes is decided by continuity: the first leg has to leave
 * along the source port's own normal, the last has to arrive along the
 * target's, and every leg in between starts on whichever axis the leg
 * before it finished on — so the run reads as one line turning corners
 * rather than as a chain of separate elbows. */
/* A bend INSIDE one of the two entries is not a route at all.
 *
 * It can be dropped there — the handles are dragged over the chart and
 * nothing stops one being let go on a box — and once there it asks for
 * something impossible: the route ENDS at that entry's border, so a point
 * in its middle can only be reached by driving through the box and coming
 * back out. Every shape that satisfies it is worse than the shape that
 * ignores it, so it is ignored. The handle stays where it was dropped and
 * can be pulled back out into the open, where it means something again. */
function usableHandBends(style, a, b){
  const list = handBends(style);
  if(!list.length) return list;
  const m = 1.5;
  const boxes = [a, b].filter(Boolean)
    .map(n=> ({x0:n.x + m, y0:n.y + m, x1:n.x + n.w - m, y1:n.y + n.h - m}));
  if(!boxes.length) return list;
  return list.filter(p=> !boxes.some(r=> p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1));
}
/* The two boxes a hand-bent route may not run THROUGH: its own.
 *
 * Everything else on the chart it is allowed to cross — a route placed by
 * hand is a statement, and dodging things is exactly what it was placed
 * instead of. Its own two entries are the exception, because it does not
 * cross them either: it ENDS on them. A line that dives through the box it
 * is arriving at and comes back up into the port from underneath is not a
 * deliberate route, it is the only shape the L happened to have. */
function ownEndBoxes(p1, p2){
  const m = 1.5;   // the border itself belongs to the connector
  return [p1, p2].map(p=> nodes.get(p && p.owner)).filter(Boolean)
    .map(n=> ({x0:n.x + m, y0:n.y + m, x1:n.x + n.w - m, y1:n.y + n.h - m}));
}
function bentRoute(p1, p2, handBendsList){
  const s1 = stubPoint(p1, handBendsList[0]);
  const s2 = stubPoint(p2, handBendsList[handBendsList.length - 1]);
  const bends = absorbBendOffsets(s1, handBendsList, s2);
  const chain = [s1, ...bends, s2];
  const out = [p1, s1];
  const boxes = ownEndBoxes(p1, p2);
  const cuts = (u, v)=> boxes.some(r=> segIntersectsRect(u.x, u.y, v.x, v.y, r));
  const clearRun = (pts)=> pts.every((q, k)=> !k || !cuts(pts[k-1], q));
  /* How far outside a box a detour stands. A corner's radius and a little,
     so the turn has room to round without touching the border. */
  const BEND_DODGE = EDGE_CORNER_R + 4;
  /* One leg of the chain, as the points BETWEEN its two ends.
   *
   * An L where an L is clear, which is almost always; where it is not, a
   * Z round the outside of whichever entry was in the way. The Z keeps
   * the axis the leg has to finish on, so a last leg still arrives along
   * its port's normal — it simply gets clear of the box first, on a line
   * chosen from the box's own edges. Without it a bend placed level with
   * its own entry, on the far side from where the connector is going,
   * drew a line straight across the box: the route reversed at the bend,
   * and a reversal is drawn as one straight run through everything
   * between its two ends. */
  const legVia = (a, b, firstAxis)=>{
    const corner = firstAxis === 'x' ? {x:b.x, y:a.y} : {x:a.x, y:b.y};
    if(clearRun([a, corner, b])) return [corner];
    const lanes = [];
    boxes.forEach(r=>{
      if(firstAxis === 'x'){ lanes.push(r.y0 - BEND_DODGE, r.y1 + BEND_DODGE); }
      else { lanes.push(r.x0 - BEND_DODGE, r.x1 + BEND_DODGE); }
    });
    const from = firstAxis === 'x' ? a.y : a.x;
    lanes.sort((u, v)=> Math.abs(u - from) - Math.abs(v - from));
    for(const lane of lanes){
      const via = firstAxis === 'x'
        ? [{x:a.x, y:lane}, {x:b.x, y:lane}]
        : [{x:lane, y:a.y}, {x:lane, y:b.y}];
      if(clearRun([a, via[0], via[1], b])) return via;
    }
    return [corner];
  };
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
      // Carry on across the axis the last leg ended on…
      firstAxis = arrived === 'x' ? 'y' : 'x';
      /* …unless carrying on takes the leg through one of the two entries
         and turning first does not. Continuity is a preference — it is
         what makes a chain of bends read as one line rather than as a row
         of elbows — and an L has two ways round, both of which pass
         through the same two points. Preferring the one that stays
         outside the boxes costs nothing when both are clear, which is
         nearly always, and is the difference between a bend placed below
         an entry being reached round it or straight through it. */
      const alt = firstAxis === 'x' ? 'y' : 'x';
      const bad = (axis)=>{
        const c = axis === 'x' ? {x:b.x, y:a.y} : {x:a.x, y:b.y};
        return cuts(a, c) || cuts(c, b);
      };
      if(bad(firstAxis) && !bad(alt)) firstAxis = alt;
    }
    out.push(...legVia(a, b, firstAxis), b);
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
  /* …and that is true of every connector, not only the ones at a pocket.
   *
     An arrowhead is a decoration on a relationship. Whether one is drawn
     changes what is at the END of the line; it has no business changing
     where the line GOES. It did: a head asks for a straight run to sit in,
     so an end that had one was given a longer run-out, and a longer
     run-out can change which crossbar the router picks — the same two
     entries joined by a different shape depending on which arrowheads
     happened to be switched on, and a wavy line re-fitted to a different
     length underneath it. Routing at the longer clearance always makes
     the route one answer, and the arrows go on affecting only what is
     drawn: where the line stops at the border, and whether there is a
     head there at all. */
  const q1 = Object.assign({}, r1, {head: true});
  const q2 = Object.assign({}, r2, {head: true});
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
  const hand = usableHandBends(style, nodes.get(p1 && p1.owner), nodes.get(p2 && p2.owner));
  const pts = sinkEnds(
    hand.length ? bentRoute(q1, q2, hand)
      : style.routing === 'straight' ? [p1,p2]
      : squareUp(levelSlivers(orthPointsAvoiding(q1,q2,excludeIds,lane)), q1, q2),
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
/* Whether a point is in FRONT of one side of a box — past its face,
   where a connector leaving by that side is already heading. */
function sideAheadOf(n, side, p){
  const nrm = SIDE_NORMAL[side];
  if(!n || !nrm || !p) return true;
  const fx = nrm.x > 0 ? n.x + n.w : nrm.x < 0 ? n.x : n.x + n.w/2;
  const fy = nrm.y > 0 ? n.y + n.h : nrm.y < 0 ? n.y : n.y + n.h/2;
  return (p.x - fx) * nrm.x + (p.y - fy) * nrm.y > 0;
}
function resolvePorts(edgesList, sideOverrides){
  const ends = [];   // one entry per edge end
  edgesList.forEach(e=>{
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if(!a || !b) return;
    const style = edgeStyleFor(e.from, e.to);
    const auto = autoSides(a,b);
    const over = sideOverrides && sideOverrides.get(e);
    /* A connector bent BY HAND takes its sides from the bends.
     *
     * The automatic guess is about where the two entries lie — which side
     * of one faces the other — and it is the right question right up until
     * somebody pins the route to points of their own. After that the two
     * answers can disagree, and the disagreement is not a small one: the
     * guess flips to another pair of sides the moment the entries are far
     * enough apart on the other axis, and the route has to get from a port
     * on a new side to a bend that has not moved. What it drew was a line
     * that left the entry going one way, doubled back past it to reach the
     * bend, and set off again — the knee JUMPING to the far side of its
     * own entry as two boxes were pulled apart, on a connector whose route
     * was supposed to be the one thing on the chart nothing could move.
     *
     * So the first port faces the first bend and the last port faces the
     * last one. Both are then stable under any movement of the entries
     * that leaves the bends where they are, which is what a route placed
     * by hand promises. A side set by hand on the connector still wins
     * over both. */
    const bendChain = usableHandBends(style, a, b);
    const firstBend = bendChain[0], lastBend = bendChain[bendChain.length - 1];
    /* …and a side is given up only when the bend is BEHIND it.
     *
     * The automatic guess answers a different question from the bends —
     * which side of one entry faces the other — and where the two
     * disagree the guess wins, because it is about the pair and the bend
     * is about one point. But it cannot win when the point it would send
     * the line away from is behind the face it leaves by: then the route
     * goes out, stops, and comes back past its own entry to reach a bend
     * that has not moved, which is what the knee JUMPING to the far side
     * of its box looked like when two entries were pulled apart far
     * enough for the guess to flip. Facing the bend it is pinned to, the
     * connector is stable under any movement that leaves the bends alone,
     * which is what a route placed by hand promises. A side set by hand
     * still wins over both. */
    const autoFrom = (firstBend && !sideAheadOf(a, auto.from, firstBend))
      ? sideFacing(a, firstBend.x, firstBend.y) : auto.from;
    const autoTo = (lastBend && !sideAheadOf(b, auto.to, lastBend))
      ? sideFacing(b, lastBend.x, lastBend.y) : auto.to;
    let fromSide = (over && over.fromSide) || style.fromSide || autoFrom;
    let toSide = (over && over.toSide) || style.toSide || autoTo;
    /* …but never the side a callout's own leader already occupies. */
    fromSide = avoidLeaderSide(a, fromSide);
    toSide = avoidLeaderSide(b, toSide);
    ends.push({edge:e, end:'from', nodeId:e.from, node:a, side:fromSide, ring:style.fromRing,
               other:b, merged: !!over});
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
    const seat = (en, i, count)=>{
      const p = portOnSide(en.node, en.side, i, count, en.ring||0);
      if(!result.has(en.edge)) result.set(en.edge, {lane:0});
      const rec = result.get(en.edge);
      if(en.end==='from'){ rec.p1 = p; }
      else { rec.p2 = p; rec.toSide = en.side; rec.toRing = en.ring||0; }
      // Index within the busiest of its two sides becomes the edge's lane
      // offset, so connectors leaving a crowded side each bend through
      // their own mid-line rather than all sharing one.
      rec.lane = Math.max(rec.lane, i*12);
    };
    /* A lineage feeding a MERGE leaves by the MIDDLE of its side.
     *
     * Everything else about a merge is symmetric — the bar hangs level,
     * the landings are spread about their own middle, the arrow leaves
     * from the centre of the entry's edge — and the one place it was not
     * was where the lineage left its own parent: the even share along
     * that side put it a third or a fifth of the way along, so the line
     * came out of the box beside the middle and the bar had to be built
     * around where it happened to land. Off-centre by a few pixels reads
     * as a mistake on a construction that is otherwise plumb.
     *
     * So the merged lineages take the middle of the side and share it
     * between themselves when a parent feeds more than one merge from the
     * same edge — which is the same even share, about the same centre.
     * The ordinary connectors on that side then take the slots FURTHEST
     * from the middle out of the fan they would all have shared, so they
     * neither land on a lineage nor bunch up on one side of it. */
    const mergedEnds = list.filter(en=> en.merged);
    const plainEnds = list.filter(en=> !en.merged);
    if(mergedEnds.length && plainEnds.length){
      const total = list.length;
      const outward = [...Array(total).keys()]
        .sort((p,q)=> Math.abs((q+1)/(total+1) - 0.5) - Math.abs((p+1)/(total+1) - 0.5));
      const slots = outward.slice(0, plainEnds.length).sort((p,q)=> p - q);
      plainEnds.forEach((en, k)=> seat(en, slots[k], total));
      mergedEnds.forEach((en, k)=> seat(en, k, mergedEnds.length));
    } else {
      list.forEach((en, i)=> seat(en, i, list.length));
    }
  });
  /* Nothing is straightened by moving the ports. A pair of facing ports a
     few pixels out of line used to be brought into line by sliding both
     along their sides — and the price was that the ends of a connector
     moved whenever either entry was carried, which is the one thing an
     end must never do. The step is the route's problem now, and the route
     is where it can be seen. */
  return result;
}

/* Facing ports used to be brought into line here, by spending each
   port's slack (see portSlack, which now gives none). The whole block —
   PORT_ALIGN_CEILING, portAlignMax, alignFacingPorts — is gone rather
   than left switched off: a connector's ends are fastened to their ports,
   and nothing on the chart may slide them along a side. */

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

