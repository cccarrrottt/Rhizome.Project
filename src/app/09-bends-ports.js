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
function bentRoute(p1, p2, handBendsList){
  const s1 = stubPoint(p1, handBendsList[0]);
  const s2 = stubPoint(p2, handBendsList[handBendsList.length - 1]);
  const bends = absorbBendOffsets(s1, handBendsList, s2);
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

