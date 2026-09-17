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

/* Where the lineages land on the bar, given where each one wants to.
 *
 * Each lands straight under its own port; only lineages closer than a
 * pitch to one another are spread, and only among THEMSELVES.
 *
 * This used to be one forward pass over the whole row followed by one
 * shift of the whole row back onto its mean. The pass is right; the shift
 * was not local. The moment any two lineages came within a pitch — which
 * is what happens every time a parent is slid along the bar past another —
 * every landing on the bar moved by the same few pixels, so every OTHER
 * parent's line stepped sideways at the top, and a callout hanging off one
 * of them went with it. Parents that nothing had touched appeared to dodge
 * the one being carried.
 *
 * So the row is broken into clusters — runs of lineages that actually
 * crowd one another — and each cluster is re-centred on its own. And
 * within a cluster, the lineages whose entry is NOT in the hand (`pinned`)
 * decide where it sits: the shift is the one that leaves them, on
 * average, where they wanted to be, so a parent carried into a neighbour
 * is the one that gives way. With nothing in the hand every member counts,
 * which is the old centring, applied only where it is needed. A cluster
 * pushed into its neighbour merges with it and the pair is placed again. */
function spreadLandings(wanted, pinned, pitch){
  const n = wanted.length;
  if(n < 2) return wanted.slice();
  const place = (s, t)=>{
    const out = [wanted[s]];
    for(let i = s + 1; i <= t; i++) out.push(Math.max(wanted[i], out[out.length-1] + pitch));
    let sum = 0, cnt = 0;
    for(let i = s; i <= t; i++){
      if(!pinned[i]) continue;
      sum += out[i - s] - wanted[i]; cnt++;
    }
    if(!cnt){
      for(let i = s; i <= t; i++) sum += out[i - s] - wanted[i];
      cnt = t - s + 1;
    }
    const shift = sum / cnt;
    return out.map(v=> v - shift);
  };
  // First guess at the clusters: a lineage starts a new one when it is
  // clear of where the previous one was pushed to.
  let clusters = [];
  let pushed = -Infinity;
  for(let i = 0; i < n; i++){
    if(!clusters.length || wanted[i] >= pushed + pitch) clusters.push({s:i, t:i});
    else clusters[clusters.length-1].t = i;
    pushed = Math.max(wanted[i], pushed + pitch);
  }
  let placed = clusters.map(c=> place(c.s, c.t));
  for(let guard = 0; guard < n; guard++){
    let merged = false;
    for(let k = 1; k < clusters.length; k++){
      const prevLast = placed[k-1][placed[k-1].length - 1];
      if(placed[k][0] < prevLast + pitch - 1e-6){
        clusters.splice(k - 1, 2, {s: clusters[k-1].s, t: clusters[k].t});
        placed.splice(k - 1, 2, place(clusters[k-1].s, clusters[k-1].t));
        merged = true;
        break;
      }
    }
    if(!merged) break;
  }
  return [].concat(...placed);
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
  const {cx, cy} = geo;
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
  const wanted = members.map(alongOf);
  const landings = spreadLandings(wanted,
    members.map(e=> !entryBeingCarried(e.from)), AMALGAM_PITCH);
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
    hi: (ux ? cx : cy) + landings[n-1],
    /* Where the bar lies on the OTHER axis, so the guide can put a mark on
       the middle of it. The middle is not drawn on the chart at rest — it
       is not a seam and marking it says nothing — but it is exactly what
       the hand is aiming at while the entry is being centred, and a line
       crossing the bar does not say WHICH point on the bar it means. */
    cross: ux ? cy : cx
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
    /* Asked unconditionally: whether there is anything to draw is one
       question with one answer, and drawEdgeNote is where it lives — an
       empty note is still drawn while it is being started. */
    drawEdgeNote(style.note, notePts, style.notePos, e.from, e.to,
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
  /* The MIDDLE of the bar is not a seam anybody needs marked.
   *
   * It is where the two outermost lineages meet in the arithmetic, so on
   * an evenly spaced merge every hand-over lands on it at once and the bar
   * carries a dot in its centre for no reason a reader could name — and
   * two or three dots stacked on the same pixel, at that. The middle is
   * useful for exactly one thing, which is lining the entry up with it,
   * and that is a GUIDE: it is drawn while the entry is being carried with
   * Shift held, in the guide layer, and at no other time. */
  const drawnAt = [];
  for(let i = 0; i < n - 1; i++){
    const jAt = bounds[i].hi;                       // == bounds[i+1].lo
    if(Math.abs(jAt - junction) < AMALGAM_BEAD_CLEAR) continue;
    /* Never the same point twice. Evenly spaced lineages hand the bar over
       at one and the same place — the middle — so every seam between them
       resolved to that one point and the bar carried two or three beads
       stacked on the same pixel, each drawn over the last. */
    if(drawnAt.some(v=> Math.abs(v - jAt) < 0.75)) continue;
    const pairAt = [amalgamMemberColor(members[i]), amalgamMemberColor(members[i+1])];
    /* And nothing at all at the MIDDLE of the bar unless something really
       changes there. The middle is where the arithmetic puts every seam of
       an evenly spaced merge, so a bead there was not marking a hand-over
       the reader could see — it was a dot in the centre of a plain line.
       The middle is worth knowing when you are lining the entry up on it,
       and that is a guide: it is drawn while the entry is carried with
       Shift held, and at no other time. */
    if(Math.abs(jAt - seam) < 0.75 && pairAt[0] === pairAt[1]) continue;
    drawnAt.push(jAt);
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
    /* Asked unconditionally: whether there is anything to draw is one
       question with one answer, and drawEdgeNote is where it lives — an
       empty note is still drawn while it is being started. */
    drawEdgeNote(style.note, pts, style.notePos, e.from, e.to,
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

