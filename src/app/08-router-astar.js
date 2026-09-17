/* ---------------------------------------------------------------------
   Guaranteed obstacle-free routing (A* over a coordinate lattice).

   The handful of stock shapes above cover the ordinary cases beautifully
   and cost almost nothing, but they can only ever bend twice — so when a
   node sits squarely in the way there are arrangements none of them can
   solve, and the connector had no choice but to run over the box. This is
   the fallback for exactly those cases, and unlike the old fixed sweep of
   bypass lanes it will find a route whenever one exists, with as many 90°
   bends as it takes.

   The lattice is the standard construction for orthogonal diagram
   routing: take the interesting X coordinates (each obstacle's two
   margins, plus both endpoints) and the interesting Y coordinates, and
   cross them. Any obstacle-free orthogonal path can be deformed onto that
   grid without crossing anything new, so searching it loses nothing — and
   it stays small (a few dozen lines each way) no matter how large the
   chart's actual coordinates are.

   Cost is length plus a turn charge, so among equally clear routes it
   returns the straightest one rather than a staircase.
   ------------------------------------------------------------------ */
const LATTICE_MARGIN = 14;      // clearance kept around each obstacle
const LATTICE_TURN_COST = 30;   // how much a corner costs, in path-length units
const LATTICE_MAX = 46;         // cap per axis, so the search can't blow up

/* `must` names coordinates the result may not thin away, whatever else it
   drops — the two endpoints, which the search looks up by value and cannot
   start or finish without. Thinning the MIDDLE is what this does, and the
   endpoints sit in the middle of a sorted list as often as not: lose one
   and the lookup returns undefined, the search gives up, and the connector
   quietly goes back to being drawn over whatever is in the way. */
function uniqSorted(values, limit, must){
  const out = Array.from(new Set(values.map(v=>Math.round(v)))).sort((a,b)=>a-b);
  if(out.length <= limit) return out;
  // Too many lines: keep the ends and thin the middle evenly rather than
  // truncating one side of the chart away.
  const step = out.length/limit, kept = [];
  for(let i=0;i<limit;i++) kept.push(out[Math.floor(i*step)]);
  kept[kept.length-1] = out[out.length-1];
  (must || []).forEach(v=> kept.push(Math.round(v)));
  return Array.from(new Set(kept)).sort((a,b)=>a-b);
}
function pointInsideAny(x, y, obstacles){
  for(const r of obstacles){
    if(x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true;
  }
  return false;
}
function segmentBlocked(x1, y1, x2, y2, obstacles){
  for(const r of obstacles){
    if(segIntersectsRect(x1,y1,x2,y2,r)) return true;
  }
  return false;
}
// s1/s2 are the stub points; the returned polyline runs between them.
/* How far outside the two endpoints' bounding box a box can sit and still
   matter to the route between them. Generous, so a connector can still be
   sent well around an obstruction, but finite. */
const LATTICE_CORRIDOR = 240;
function latticeRoute(s1, s2, allObstacles, endNormal){
  /* Only the boxes anywhere near this pair take part.

     This is not merely an economy. The lattice is capped at LATTICE_MAX
     lines per axis, and it used to be fed the edges of EVERY box on the
     chart — so on a busy chart the relevant coordinates, the ones actually
     around these two entries, were thinned out to fit alongside coordinates
     from boxes hundreds of units away that no route between these two could
     ever touch. The search was doing far more work on a far worse map.
     Confining it to the corridor spends the whole budget where the route
     is. */
  const lo = {x: Math.min(s1.x, s2.x) - LATTICE_CORRIDOR, y: Math.min(s1.y, s2.y) - LATTICE_CORRIDOR};
  const hi = {x: Math.max(s1.x, s2.x) + LATTICE_CORRIDOR, y: Math.max(s1.y, s2.y) + LATTICE_CORRIDOR};
  const obstacles = allObstacles.filter(r=>
    r.x1 >= lo.x && r.x0 <= hi.x && r.y1 >= lo.y && r.y0 <= hi.y);

  const xs = [s1.x, s2.x], ys = [s1.y, s2.y];
  obstacles.forEach(r=>{
    xs.push(r.x0 - LATTICE_MARGIN, r.x1 + LATTICE_MARGIN);
    ys.push(r.y0 - LATTICE_MARGIN, r.y1 + LATTICE_MARGIN);
  });
  // A corridor midway between the two endpoints on each axis gives the
  // search a natural lane to use when it has to go the long way round.
  xs.push((s1.x+s2.x)/2); ys.push((s1.y+s2.y)/2);
  const X = uniqSorted(xs, LATTICE_MAX, [s1.x, s2.x]);
  const Y = uniqSorted(ys, LATTICE_MAX, [s1.y, s2.y]);
  const xi = new Map(X.map((v,i)=>[v,i])), yi = new Map(Y.map((v,i)=>[v,i]));
  const startX = xi.get(Math.round(s1.x)), startY = yi.get(Math.round(s1.y));
  const goalX  = xi.get(Math.round(s2.x)), goalY  = yi.get(Math.round(s2.y));
  if(startX===undefined || startY===undefined || goalX===undefined || goalY===undefined) return null;

  const W = X.length, H = Y.length;
  const blocked = new Uint8Array(W*H);
  for(let i=0;i<W;i++) for(let j=0;j<H;j++){
    if(pointInsideAny(X[i], Y[j], obstacles)) blocked[j*W+i] = 1;
  }
  const idx = (i,j)=> j*W+i;
  const startI = idx(startX,startY), goalI = idx(goalX,goalY);
  blocked[startI] = 0; blocked[goalI] = 0;

  const dist = new Float64Array(W*H).fill(Infinity);
  const prev = new Int32Array(W*H).fill(-1);
  const dirOf = new Int8Array(W*H).fill(-1);   // 0 = arrived horizontally, 1 = vertically
  const seen = new Uint8Array(W*H);
  dist[startI] = 0;
  const heuristic = (i,j)=> Math.abs(X[i]-X[goalX]) + Math.abs(Y[j]-Y[goalY]);

  /* The frontier, as a binary heap.

     It used to be a linear scan over every cell of the lattice to find the
     next one to expand — simple, and fine on the handful of cells the
     search was originally written for, but the lattice can reach a couple
     of thousand cells and the scan then runs once per expansion: quadratic
     in the size of the map, and by far the most expensive thing the router
     did. A heap answers the same question in log time and picks exactly the
     same cell, so the routes are unchanged.

     Stale entries are left in the heap rather than removed — a cell whose
     distance improves is simply pushed again, and the copy with the worse
     score is skipped when it surfaces, since by then the cell is settled. */
  /* Room for every cell to be pushed once per neighbour that can improve
     it, which on a four-connected lattice is four times — the price of
     leaving stale entries in rather than removing them. Sized for one
     copy per cell, the guard below started dropping frontier entries on a
     busy chart, and the search returned a worse route or none at all. */
  const heapCap = W*H*4 + 8;
  const heapK = new Int32Array(heapCap);
  const heapF = new Float64Array(heapCap);
  let heapN = 0;
  function heapPush(k, f){
    if(heapN >= heapK.length) return;          // the heap is sized for the worst case
    let i = heapN++;
    heapK[i] = k; heapF[i] = f;
    while(i > 0){
      const parent = (i-1) >> 1;
      if(heapF[parent] <= heapF[i]) break;
      const tk = heapK[parent], tf = heapF[parent];
      heapK[parent] = heapK[i]; heapF[parent] = heapF[i];
      heapK[i] = tk; heapF[i] = tf;
      i = parent;
    }
  }
  function heapPop(){
    if(!heapN) return -1;
    const top = heapK[0];
    heapN--;
    if(heapN){
      heapK[0] = heapK[heapN]; heapF[0] = heapF[heapN];
      let i = 0;
      for(;;){
        const l = i*2+1, r = l+1;
        let m = i;
        if(l < heapN && heapF[l] < heapF[m]) m = l;
        if(r < heapN && heapF[r] < heapF[m]) m = r;
        if(m === i) break;
        const tk = heapK[m], tf = heapF[m];
        heapK[m] = heapK[i]; heapF[m] = heapF[i];
        heapK[i] = tk; heapF[i] = tf;
        i = m;
      }
    }
    return top;
  }
  heapPush(startI, heuristic(startX, startY));

  for(;;){
    let best = -1;
    while(heapN){
      const k = heapPop();
      if(!seen[k]){ best = k; break; }
    }
    if(best === -1) return null;
    if(best === goalI) break;
    seen[best] = 1;
    const bi = best%W, bj = (best-bi)/W;
    const neighbours = [[bi-1,bj,0],[bi+1,bj,0],[bi,bj-1,1],[bi,bj+1,1]];
    for(const [ni,nj,ndir] of neighbours){
      if(ni<0||nj<0||ni>=W||nj>=H) continue;
      const nk = idx(ni,nj);
      if(blocked[nk] || seen[nk]) continue;
      if(segmentBlocked(X[bi],Y[bj],X[ni],Y[nj],obstacles)) continue;
      const step = Math.abs(X[ni]-X[bi]) + Math.abs(Y[nj]-Y[bj]);
      const turn = (dirOf[best]!==-1 && dirOf[best]!==ndir) ? LATTICE_TURN_COST : 0;
      const nd = dist[best] + step + turn;
      if(nd < dist[nk]){
        dist[nk] = nd; prev[nk] = best; dirOf[nk] = ndir;
        heapPush(nk, nd + heuristic(ni, nj));
      }
    }
  }
  const path = [];
  for(let k = goalI; k !== -1; k = prev[k]){
    const i = k%W, j = (k-i)/W;
    path.push({x:X[i], y:Y[j]});
    if(k === startI) break;
  }
  path.reverse();
  if(!path.length) return null;
  /* The lattice is laid on whole units, and the two ends are not.
   *
   * A port sits at its share of a side, and a box a hundred and twenty-nine
   * units wide has its middle on a half — so the search started from 65
   * where the run-out was at 64.5, and the route came out of the entry,
   * stepped half a unit sideways on a slant, and went on. Half a unit is
   * a visible kink at the first corner, and the arrowhead at the far end
   * took its angle from the slant. Every lattice line that stands for one
   * of the two ends is put back on that end's true coordinate. */
  path[0] = {x: s1.x, y: s1.y};
  if(path.length > 1) path[path.length-1] = {x: s2.x, y: s2.y};
  const n = path.length;
  // Inward from each end, every lattice line within a unit of its
  // neighbour is taken to BE its neighbour's line.
  for(let i = 1; i < n - 1; i++){
    if(Math.abs(path[i].x - path[i-1].x) < 1) path[i].x = path[i-1].x;
    if(Math.abs(path[i].y - path[i-1].y) < 1) path[i].y = path[i-1].y;
  }
  for(let i = n - 2; i > 0; i--){
    const q = path[i], r = path[i+1];
    const slant = Math.abs(q.x - r.x) > 0.01 && Math.abs(q.y - r.y) > 0.01;
    if(!slant) continue;
    if(Math.abs(q.x - r.x) < 1) q.x = r.x;
    else if(Math.abs(q.y - r.y) < 1) q.y = r.y;
  }
  /* Two ends with nothing between them, less than a unit out of line: the
     far run-out is lengthened or shortened by that much, along its own
     normal, rather than drawn as a slant. Only along the normal — sliding
     it sideways would take it off its port. */
  if(n === 2 && endNormal){
    const a = path[0], b = path[1];
    if(endNormal.y && Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 1) b.y = a.y;
    if(endNormal.x && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 1) b.x = a.x;
  }
  return path;
}

// p1/p2 carry a .side; lane is a small per-edge offset that keeps sibling
// connectors off each other's mid-lines.
// Clearance is judged in two parts. The first and last segments run from a
// port to its own stub — they cross their own node's border by definition,
// so they're only checked against OTHER nodes. Everything in between is
// checked against every node including the two being connected, which is
// what makes a connector actually go around its target instead of through
// it when both ends use the same side (right to right, bottom to bottom,
// and so on). Before this, the endpoints' own boxes were excluded from the
// whole path, so such a route could tunnel straight through the node it
// was arriving at and nothing objected.
function pathClearParts(pts, midObstacles, endObstacles){
  for(let i=0;i<pts.length-1;i++){
    const a = pts[i], b = pts[i+1];
    const isEnd = (i === 0 || i === pts.length-2);
    const rects = isEnd ? endObstacles : midObstacles;
    for(const rect of rects){
      if(segIntersectsRect(a.x,a.y,b.x,b.y,rect)) return false;
    }
  }
  return true;
}

/* Which way a segment runs, or nothing if it runs both ways at once. */
function segDir(a, b){
  const dx = b.x - a.x, dy = b.y - a.y;
  if(Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
  if(Math.abs(dx) < 0.5) return {x:0, y: dy > 0 ? 1 : -1};
  if(Math.abs(dy) < 0.5) return {x: dx > 0 ? 1 : -1, y:0};
  return null;
}
function isOrthPath(pts){
  for(let i = 0; i < pts.length - 1; i++) if(!segDir(pts[i], pts[i+1])) return false;
  return true;
}
/* The two ends are not negotiable: a connector leaves a port at right
   angles to the side it is on and arrives at one the same way, and a
   simplification that turns the last leg sideways has drawn a different
   connector rather than a tidier one. */
function sameEndDirs(a, b){
  const a0 = segDir(a[0], a[1]), b0 = segDir(b[0], b[1]);
  const a1 = segDir(a[a.length-2], a[a.length-1]);
  const b1 = segDir(b[b.length-2], b[b.length-1]);
  if(!a0 || !b0 || !a1 || !b1) return false;
  return a0.x === b0.x && a0.y === b0.y && a1.x === b1.x && a1.y === b1.y;
}
/* Take the bends out of a route that does not need them.
 *
 * The stock joining shapes are two corners at most, so nothing they
 * produce can be simplified. The lattice search is different: it is asked
 * for a way THROUGH and answers with one, and its answer is a staircase —
 * steps of eight or ten pixels, one after another, in a corridor wide
 * enough for a single straight run. Nothing is in the way of that run; the
 * search simply never looked for it, because it walks a grid and every
 * grid step is as cheap as the last.
 *
 * So the route is worked over afterwards: any three consecutive segments
 * that can be replaced by two are, provided the shorter route still clears
 * everything and still leaves and arrives the way it did. Repeated until
 * nothing more will collapse, that turns a staircase into the L or the Z
 * the corridor could always have held.
 */
function straightenOrth(pts, ok){
  if(!pts || pts.length < 5) return pts;
  let cur = pts;
  for(let pass = 0; pass < 8; pass++){
    let changed = false;
    for(let i = 0; i + 3 < cur.length && !changed; i++){
      const A = cur[i], D = cur[i+3];
      for(const mid of [{x:A.x, y:D.y}, {x:D.x, y:A.y}]){
        const cand = tidyPoints(cur.slice(0, i+1).concat([mid], cur.slice(i+3)));
        if(cand.length >= cur.length) continue;
        if(!isOrthPath(cand) || !sameEndDirs(cand, pts)) continue;
        if(!ok(cand)) continue;
        cur = cand; changed = true; break;
      }
    }
    if(!changed) break;
  }
  return cur;
}
function orthPointsAvoiding(p1, p2, excludeIds, lane){
  const endObstacles = obstacleRects(excludeIds);   // everything but the two endpoints
  const midObstacles = obstacleRects(null);         // every node, endpoints included
  let s1 = stubPoint(p1, p2), s2 = stubPoint(p2, p1);
  /* Two ports facing the SAME way share one run-out level.
   *
   * Both ends of a connector between two entries side by side leave
   * upwards, say, and the joining shape then has to bridge them: it picks
   * a level between the two stub points, which is BEHIND each of them. So
   * each end ran out past the level it then came back to — a fold of a few
   * pixels at both ends, drawn as a corner going one way immediately
   * followed by a corner going the other. It looked like a second line
   * poking out of the connector, and it got worse the longer the run-out
   * was made.
   *
   * Levelling the two is enough: with both stub points the same distance
   * out, the bridge is a straight run between them and neither end folds
   * back. The one that has to grow is the shorter, so neither ends up
   * inside its own entry's border. */
  const n1 = SIDE_NORMAL[p1.side], n2 = SIDE_NORMAL[p2.side];
  if(n1 && n2 && n1.x === n2.x && n1.y === n2.y){
    /* The same LEVEL, not the same distance: the two ports rarely sit at
       the same height, so equal run-outs still land on different lines and
       the bridge between them still folds. */
    const proj = (q)=> q.x*n1.x + q.y*n1.y;
    /* Measured from the PORTS with a full run-out each, not from the stub
       points as they came.
     *
       A stub is shortened when there is little room in front of the port —
       which is the right answer for two ports FACING each other, where a
       long run-out from both would have them march past one another. Two
       ports facing the SAME way never do that: they share one level, and
       whatever room lies between them is not room the run-out has to fit
       into. Taking the shortened stubs anyway made the level depend on
       which port was deeper: with the shallower one carrying an arrowhead
       — which has a run-out floor of its own — the shared level tracked
       the deeper port until the two crossed and then dropped to the
       OTHER's bare minimum, a few pixels clear of its border. A few pixels
       is not enough to pass a neighbouring box, so every stock shape was
       rejected and the search took over, and the run jumped to wherever
       the search happened to put it. From the outside: dragging an entry
       up past its neighbour, the bend shrank, shrank, and then leapt.
     *
       A full run-out from each port, and the deeper one wins. The level is
       then max(port) + STUB whichever way round they are, so it follows
       the deeper port down and stops — and past that the only thing that
       grows is the moving entry's own leg, which is what a reader dragging
       an entry away expects to see. A port that names its own run-out (the
       amalgam bar does) still gets the one it asked for. */
    const runOut = (p)=> (typeof p.stub === 'number') ? p.stub : stubLength(p, null);
    const lvl = Math.max(proj(p1) + runOut(p1), proj(p2) + runOut(p2));
    const put = (p)=>{
      const d = lvl - proj(p);
      return {x: p.x + n1.x*d, y: p.y + n1.y*d, keep: true};
    };
    s1 = put(p1); s2 = put(p2);
  }
  const lanes = [];
  if(lane) lanes.push(lane, -lane);
  // Not crossing a node is a hard requirement, not one term in a total —
  // blending it into the score meant a route that cleared every box could
  // still lose to one that didn't, just by grazing enough other
  // connectors. So clearance is compared first and the score only breaks
  // ties between candidates that are equally clear.
  let best = null, bestScore = Infinity, bestClear = false, bestMid = null;
  const consider = joins=>{
    for(const mid of joins){
      const pts = tidyPoints([p1, ...mid, p2]);
      const clear = pathClearParts(pts, midObstacles, endObstacles);
      if(bestClear && !clear) continue;
      const sc = scorePath(pts, endObstacles);
      if(clear && !bestClear){ bestClear = true; bestScore = sc; best = pts; bestMid = mid; continue; }
      if(sc < bestScore){ bestScore = sc; best = pts; bestMid = mid; }
    }
  };
  const barKey = routeBarKey(p1, p2);
  consider(joinCandidates(s1, s2, lanes, barKey ? routeBars.get(barKey) : null));
  // Only fall back to the search when no stock shape got through — it's
  // much more work than the four candidates above, and for most
  // connectors one of them is already perfect. The search runs against the
  // full obstacle set, so the route it finds already goes around both
  // endpoint boxes rather than needing to be checked for it afterwards.
  if(!bestClear){
    const routed = latticeRoute(s1, s2, midObstacles, SIDE_NORMAL[p2.side]);
    if(routed){
      const pts = tidyPoints([p1, ...routed, p2]);
      // Take it whenever it actually clears the boxes, however long or
      // bendy — a connector that reads correctly beats a short one drawn
      // straight over a node. Bendy is then taken out of it: see
      // straightenOrth for why the search leaves steps behind.
      if(pathClearParts(pts, midObstacles, endObstacles)){
        best = straightenOrth(pts,
          cand=> pathClearParts(cand, midObstacles, endObstacles));
        bestClear = true;
      }
    }
  }
  /* What was drawn is what the next frame starts from. A route that had to
     fall through to the search has no crossbar to remember, so the memory
     is cleared rather than left pointing at a lane this connector no longer
     uses. */
  if(barKey){
    const bar = barOfMid(bestMid);
    if(bar) routeBars.set(barKey, bar); else routeBars.delete(barKey);
  }
  return unfoldEnds(best || tidyPoints([p1, s1, s2, p2]), p1, p2);
}
/* No end may run out PAST the line it then comes back to.
 *
 * The joining shapes bridge two run-out points, and where the bridge falls
 * short of one of them that end goes out, turns, comes back the way it
 * came, and turns again — a fold of a few pixels drawn as two corners on
 * top of each other. It reads as a second line poking out of the
 * connector, and it is what a run-out being made longer makes worse rather
 * than better.
 *
 * Fixing it is a matter of pulling the run-out back to the level the route
 * actually uses — never closer to the entry than its own border needs,
 * which is what portClearance answers. */
function unfoldEnds(pts, p1, p2){
  if(!pts || pts.length < 3) return pts;
  const out = pts.map(q=> ({...q}));
  const fix = (iPort, iStub, iNext, port)=>{
    const a = out[iPort], bq = out[iStub], c = out[iNext];
    const nx = bq.x - a.x, ny = bq.y - a.y;
    const len = Math.hypot(nx, ny);
    if(len < 0.01) return;
    const ux2 = nx/len, uy2 = ny/len;
    const over = (bq.x - c.x)*ux2 + (bq.y - c.y)*uy2;
    if(over <= 0.01) return;
    /* Never all the way back onto the port.
     *
       The pull used to floor at portClearance, which for an ordinary entry
       with one plain border is ZERO — so an end could be pulled until its
       run-out sat exactly on the port, the tidy pass then merged the two
       coincident points, and what was left was a two-point path between
       two ports that are almost never aligned: a DIAGONAL, drawn on a
       chart whose every other line turns square corners. The arrowhead,
       which takes its angle from that last segment, then came in at a
       slant too. Both are visible in an entry feeding a merge alongside
       other connectors, which is where the case arises.
     *
       A run-out is what makes a connector leave its entry square-on, so it
       is kept — the fold this function exists to remove is worth removing
       only down to that point. */
    const floor = Math.max(STUB_MIN, portClearance(port));
    const pull = Math.min(over, Math.max(0, len - floor));
    bq.x -= ux2*pull; bq.y -= uy2*pull;
  };
  fix(0, 1, 2, p1);
  fix(out.length-1, out.length-2, out.length-3, p2);
  return tidyPoints(out);
}
/* The wavy connector style, built from the same exact half-waves as the
   pocket border. Each straight run of the skeleton keeps a flat lead-in
   and lead-out — a long one at the two true ends, a short one at each
   elbow — so the line reads as straight, then wavy, then straight, and
   every corner is met on the baseline from both sides with nothing to
   reconcile. The old version faded a sampled sine in and out with an
   envelope and then smoothed the samples, which is where its softness and
   its faint kinks at the corners came from. */
/* Two dials now: how long each half-wave is, and how far it swings. They
   used to be one — the height followed the length, which is what a
   semicircle needs — but the squiggle is a sine, and a sine's height is
   its own. Matched to the pocket border's, so a wavy connector leaving a
   pocket reality is visibly the same line as the edge it leaves. */
const EDGE_WAVE_LEN = 4.5;
const EDGE_WAVE_PEAK = 1.9;
/* The wave goes quiet well before a bend and only picks up again well
   after it. A corner is where the eye reads the line's direction, and a
   crest sitting on it hides that; a plain elbow with the ripple resuming
   further along still reads as one continuous wavy line. */
/* The quiet stretches at the ends and around a bend. They exist so a
   crest never lands exactly on a corner (where it hides the direction the
   line turns) or on an arrowhead — but they were sized for the old, much
   longer sine, and against a 7-unit semicircle they read as long bald
   patches. Cut to about the length of a single arc: enough to keep a
   corner legible, short enough that the line reads as wavy throughout. */
const EDGE_WAVE_END_FLAT = 2, EDGE_WAVE_CORNER_FLAT = 2.5;
/* Collinear points are not corners.
 *
 * A routed connector always carries a short stub at each end, standing the
 * line off the entry's border before it turns. On a straight run those
 * stubs are collinear with the middle — the "corner" between them is a
 * corner of nothing — but wavyPath treated each as its own run, and that
 * cost twice over. It spent a corner flat at each false join, so a short
 * connector was mostly bald with a couple of arcs marooned in the middle;
 * and the direction vote read the collinear neighbour as a turn, where the
 * dot product is exactly zero and there is nothing to learn.
 *
 * Merging them first makes a straight connector one run again — waved end
 * to end, and with no interior point to vote wrongly about which way. */
function mergeCollinear(pts){
  if(pts.length < 3) return pts;
  const out = [pts[0]];
  for(let i=1;i<pts.length-1;i++){
    const a = out[out.length-1], b = pts[i], c = pts[i+1];
    const ux = b.x-a.x, uy = b.y-a.y, vx = c.x-b.x, vy = c.y-b.y;
    // |cross| is the area of the parallelogram: zero when the three are in
    // line. Scaled by the leg lengths so the tolerance means the same
    // thing on a long run as on a short one.
    const cross = Math.abs(ux*vy - uy*vx);
    const scale = Math.hypot(ux,uy) * Math.hypot(vx,vy);
    const sameWay = (ux*vx + uy*vy) > 0;
    if(scale > 0 && sameWay && cross / scale < 0.002) continue;   // drop b
    out.push(b);
  }
  out.push(pts[pts.length-1]);
  return out;
}
/* `trimIn`/`trimOut` are how much of each end an arrowhead will cover.
   They are handled HERE rather than by shortening the point list, because
   shortening it moves the wave: every run lays its arcs out relative to
   its own length, so a run that lost 8px at one end had its whole ripple
   slide by half that. Laying the arcs out on the FULL geometry and then
   simply not drawing the ones an arrowhead sits on keeps every crest
   exactly where it was — turning a head on hides a ripple, it never
   shifts the pattern. */
function wavyPath(rawPts, trimIn, trimOut){
  const cutIn = Math.max(0, trimIn || 0), cutOut = Math.max(0, trimOut || 0);
  const pts = mergeCollinear(rawPts);
  let total = 0;
  for(let i=0;i<pts.length-1;i++) total += Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y);
  const last = pts[pts.length-1];
  if(total < 4) return `M${pts[0].x},${pts[0].y} L${last.x},${last.y}`;

  // The visible path begins and ends inside the geometry the wave is laid
  // out on, by however much the arrowheads cover.
  const headStart = (()=>{
    const b = pts[1] || last, L = Math.hypot(b.x-pts[0].x, b.y-pts[0].y) || 1;
    const k = Math.min(cutIn, L);
    return {x: pts[0].x + (b.x-pts[0].x)/L*k, y: pts[0].y + (b.y-pts[0].y)/L*k};
  })();
  let d = `M${headStart.x.toFixed(2)},${headStart.y.toFixed(2)}`;
  for(let i=0;i<pts.length-1;i++){
    const a = pts[i], b = pts[i+1];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if(len < 0.5) continue;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;
    let nx = -uy, ny = ux;
    /* Which side the arcs bulge toward.
     *
     * The left normal is an arbitrary choice, and on an elbow it was the
     * wrong one: both runs ended up bulging into the corner the connector
     * turns around, so the arcs crowded the inside of the bend and the
     * elbow read as pinched. They belong on the outside, where there is
     * room and where they follow the line's own sweep.
     *
     * "Outside" is decided by where the path goes next. At the far end, the
     * following run heads to the inside of the turn, so the normal is
     * flipped when it agrees with that direction; at the near end the run
     * we came FROM is on the inside, so the test is the same one reversed.
     * A run bent at both ends votes twice — the two agree on an elbow, and
     * cancel on an S-bend, where neither side is outside and the default
     * stands. */
    let vote = 0;
    const nextP = pts[i+2], prevP = pts[i-1];
    /* A neighbour that continues straight on has a dot product of exactly
       zero with the normal. That is not a vote for the far side — it is no
       vote at all, and counting it as one (which `> 0 ? 1 : -1` did) was
       enough to keep a straight connector from ever reaching its default. */
    const VOTE_EPS = 1e-6;
    if(nextP){
      const d = (nextP.x - b.x)*nx + (nextP.y - b.y)*ny;
      if(Math.abs(d) > VOTE_EPS) vote += d > 0 ? 1 : -1;
    }
    if(prevP){
      const d = (prevP.x - a.x)*nx + (prevP.y - a.y)*ny;
      if(Math.abs(d) > VOTE_EPS) vote += d > 0 ? 1 : -1;
    }
    if(vote > 0){ nx = -nx; ny = -ny; }
    else if(vote === 0){
      /* A straight connector has no turn to take its cue from, and the
         left normal is not a meaningful default — on a horizontal run it
         points DOWN, so an unbent connector hung its arcs below the line
         when everything else on the chart (a note, a leader card) sits
         above it. Same convention as those: up for a horizontal run, left
         for a vertical one. */
      if(Math.abs(ny) > Math.abs(nx) ? ny > 0 : nx > 0){ nx = -nx; ny = -ny; }
    }
    /* Corners are rounded here exactly as they are on a plain connector.
       A wavy line used to turn square while every other line on the chart
       turned with a radius, so a chart mixing the two looked like two
       different drawings. The radius is taken out of the run at each end
       that HAS a corner, and the flat sits inside what is left — so the
       wave still stops short of the bend rather than running into the arc. */
    const isFirst = (i === 0), isLast = (i === pts.length-2);
    const prevSeg = isFirst ? 0 : Math.hypot(a.x-pts[i-1].x, a.y-pts[i-1].y);
    const nextSeg = isLast  ? 0 : Math.hypot(pts[i+2].x-b.x, pts[i+2].y-b.y);
    // Two corners sharing this leg get half of it each, so their arcs
    // cannot overlap — the same rule roundedPath uses.
    const rIn  = isFirst ? 0 : Math.min(EDGE_CORNER_R, len/2, prevSeg/2);
    const rOut = isLast  ? 0 : Math.min(EDGE_CORNER_R, len/2, nextSeg/2);
    const straight = len - rIn - rOut;

    const cap = straight / 3;
    const flatIn  = Math.min(isFirst ? EDGE_WAVE_END_FLAT : EDGE_WAVE_CORNER_FLAT, cap);
    const flatOut = Math.min(isLast  ? EDGE_WAVE_END_FLAT : EDGE_WAVE_CORNER_FLAT, cap);
    const runLen = straight - flatIn - flatOut;
    const from = rIn + flatIn;
    /* What an arrowhead covers on THIS leg, as distances measured from a.
       Only the two outermost legs have a head on them. */
    const lo = isFirst ? cutIn : 0;
    const hi = isLast ? Math.max(lo, len - cutOut) : len;
    const stopAt = Math.min(hi, len - rOut);
    const ptAt = (t)=> `${(a.x + ux*t).toFixed(2)},${(a.y + uy*t).toFixed(2)}`;
    if(runLen < EDGE_WAVE_LEN * 1.5){
      // Too short to carry a whole wave: this run stays straight.
      d += ` L${ptAt(stopAt)}`;
    } else {
      const bumps = waveBumps(runLen, EDGE_WAVE_LEN);
      // Whole arcs only; whatever is left over pads both ends equally, so
      // the ripple stays centred on the run it belongs to.
      const start = from + (runLen - bumps*EDGE_WAVE_LEN) / 2;
      // Only the arcs that lie clear of both arrowheads are drawn. The
      // rest of the leg is flat, and every drawn arc keeps the exact
      // position it would have had with no heads at all.
      let first = 0, count = bumps;
      while(first < bumps && start + first*EDGE_WAVE_LEN < lo - 0.01) first++;
      while(count > first && start + count*EDGE_WAVE_LEN > hi + 0.01) count--;
      if(count > first){
        const s0 = start + first*EDGE_WAVE_LEN;
        d += ` L${ptAt(Math.max(lo, Math.min(s0, stopAt)))}`;
        /* Carrying the phase across the arcs an arrowhead covers. The arcs
           alternate sides, and the run is drawn starting from whichever
           one is first VISIBLE — so without this the whole ripple flipped
           over the moment a head hid an odd number of arcs, which is the
           pattern shifting all over again by another route. */
        d += waveRun(a.x, a.y, ux, uy, nx, ny, s0, count - first, EDGE_WAVE_LEN, first % 2);
      }
      d += ` L${ptAt(stopAt)}`;
    }
    if(!isLast){
      // Around the corner and onto the next leg.
      const c = pts[i+2];
      const nl = Math.hypot(c.x-b.x, c.y-b.y) || 1;
      const vx = (c.x-b.x)/nl, vy = (c.y-b.y)/nl;
      d += ` Q${b.x},${b.y} ${(b.x + vx*rOut).toFixed(2)},${(b.y + vy*rOut).toFixed(2)}`;
    }
  }
  return d;
}
// The arrowhead's "overall direction" is the tangent of the underlying
// straight/elbowed SKELETON path at its very last point — never the
// rendered (possibly wavy) curve's local tangent, which is what SVG's
// orient="auto-start-reverse" would otherwise follow. Walks backward past
// any zero-length segment so a degenerate last point can't produce NaN.
function endAngleDeg(pts){
  for(let i=pts.length-1;i>0;i--){
    const a = pts[i-1], b = pts[i];
    const dx = b.x-a.x, dy = b.y-a.y;
    if(Math.hypot(dx,dy) > 0.01) return Math.atan2(dy,dx) * 180/Math.PI;
  }
  return 90;
}
// Builds a path string (plus the fixed arrowhead angle described above)
// between two already-picked ports, per the edge's style. routing (the
// path SHAPE: 90° elbows vs. a direct line) and sinusoid (an independent
// wavy-line STYLE) compose freely — split out from routeEdge so any future
// caller that already has two ports in hand can reuse the same styling
// without going through pickPorts.
