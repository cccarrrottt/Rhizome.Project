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
/* How far the ripple stands off its baseline at one exact place on a
   pocket reality's border.
 *
 * A rippled border is not a line, it is a band — so "where the border is"
 * has no single answer for the whole side, only one answer per point. Both
 * previous attempts avoided the question and both left something on the
 * paper: sinking every arrowhead the full amplitude buried the ones that
 * arrived at a crest, and leaving every one on the baseline left the ones
 * that arrived at a trough hanging in clear air. The connector meets its
 * border at ONE point, and the shape of the border at that point is known
 * exactly, so it is worked out rather than approximated.
 *
 * The arithmetic mirrors wavySideCommands and waveRun exactly — the same
 * corner radius, the same shared phase grid, the same alternating bulge —
 * because it has to answer for the very curve those two draw. Each arc is
 * a cubic whose two control points sit a whole amplitude off the baseline,
 * so its offset at parameter t is 3·lift·t·(1−t), peaking at three
 * quarters of the amplitude; and its progress ALONG the side is a
 * smoothstep of t rather than t itself, which is why the parameter has to
 * be solved for rather than read off. Six Newton steps land well inside a
 * hundredth of a pixel. */
function wavyDropAt(n, side, ring){
  if(!isWavyBorder(n)) return 0;
  const step = ringStepFor(n);
  const inset = -(ring || 0) * step;
  const x = n.x + inset, y = n.y + inset;
  const w = n.w - inset*2, h = n.h - inset*2;
  const grow = (ring || 0) * step;
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const len = (side === 'top' || side === 'bottom') ? w : h;
  const straight = len - r*2;
  const flat = Math.min(POCKET_CORNER_FLAT, straight/4);
  const runLen = straight - flat*2;
  if(runLen < POCKET_WAVELEN * 1.5) return 0;
  const W = POCKET_WAVELEN;
  const absAtSx = -grow + r;
  const firstIdx = Math.ceil((absAtSx + flat) / W);
  const start = firstIdx * W - absAtSx;
  const bumps = Math.floor((runLen + flat - start) / W);
  if(bumps < 1) return 0;
  const phase = ((firstIdx % 2) + 2) % 2;
  /* Where the port sits, measured from the corner THIS side starts at —
     which is not the same corner for all four: wavyRectPath walks the
     frame clockwise, so the bottom is drawn right-to-left and the left
     bottom-to-top, and a distance measured the other way would read the
     phase grid backwards. */
  return function(px, py){
    let dist;
    if(side === 'top') dist = px - x;
    else if(side === 'bottom') dist = (x + w) - px;
    else if(side === 'right') dist = py - y;
    else dist = (y + h) - py;
    const u = dist - (r + start);
    if(u < 0 || u > bumps * W) return 0;
    const j = Math.min(bumps - 1, Math.floor(u / W));
    const local = (u - j*W) / W;
    const lift = ((j + phase) % 2 === 0) ? POCKET_LIFT : -POCKET_LIFT;
    return 3 * lift * waveParamAt(local) * (1 - waveParamAt(local));
  };
}
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
  /* On a card the top band is a picture, and a connector meeting the middle
     of a photograph reads as an accident. Ports along the two upright sides
     are therefore spread over the text bands only; the top and bottom sides
     are unaffected, since there the picture is simply the edge the arrow
     arrives at. */
  const skip = (n.cardTop && (side === 'left' || side === 'right'))
    ? Math.min(n.cardTop, h - 12) : 0;
  const sideY = y + skip + (h - skip) * t;
  /* Carried on the port so a cap and a run-out both know how much of the
     entry's own border still stands OUTSIDE this ring. */
  const rings = ringCountOf(n);
  const at = {
    top:    {x:x + w*t, y},
    bottom: {x:x + w*t, y:y + h},
    left:   {x,         y:sideY},
    right:  {x:x + w,   y:sideY}
  }[side] || {x:x + w, y:sideY};
  /* And, on a rippled border, how far the ripple stands off the baseline
     at exactly this point — carried on the port so the line's end and its
     arrowhead can both meet the border where it really is. Zero on every
     other archetype, which is what makes them all behave the same. */
  const drop = wavy ? (wavyDropAt(n, side, ring || 0) || (()=>0))(at.x, at.y) : 0;
  /* A portrait is a CIRCLE, and a point on the side of the square it is
     inscribed in is not on it.
   *
     One connector lands at the middle of a side, which is the one place
     the square and the circle touch, so a single arrow met the rim
     exactly and nothing looked wrong. Give the portrait a second and the
     two share the side — a third and a two-thirds of the way along it —
     and both of them stopped at the square, a good few pixels short of
     the border they were pointing at, with clear paper between the head
     and the entry. The point is carried radially out to the rim: the
     share along the side is kept (that evenness is information), and what
     changes is only how far out it sits. */
  if((n.shape || '') === 'ellipse'){
    const ccx = n.x + n.w/2, ccy = n.y + n.h/2;
    const rr = n.w/2 + (ring || 0) * step;
    const vx = at.x - ccx, vy = at.y - ccy;
    const len = Math.hypot(vx, vy);
    if(len > 0.01){ at.x = ccx + vx/len*rr; at.y = ccy + vy/len*rr; }
  }
  /* Enough about where this port sits on its side to move it a little
     later without landing on a neighbour — see nudgePortAlong. `span` is
     the length actually shared out, `slots` how many connectors are
     sharing it, `slot` which one this is. */
  return {x:at.x, y:at.y, side, ring:ring||0, step, wavy, rings, drop,
          owner: n.id, span: sideIsVertical(side) ? w : (h - skip),
          slot: i, slots: count};
}
/* How far a port may travel along its own side.
 *
 * A port's exact place on a side is the chart's choice, not the reader's:
 * they chose the SIDE, and the spacing is arithmetic. So a few pixels of
 * it can be spent on making a connector run straight — but only a few, and
 * never so many that two connectors sharing a side end up on top of each
 * other. Not quite half the gap to a neighbour is the limit, so even if
 * two adjacent ports both move toward each other they keep most of it. */
const PORT_NUDGE_MAX = 22;
function portSlack(p){
  if(!p || !(p.span > 0)) return 0;
  /* A side with more than one connector on it gives nothing.
   *
     The spacing along an edge is an even share — a fan of three leaves at
     a quarter, a half and three quarters of it — and that evenness is
     itself information: it says the connectors belong together and none of
     them is special. Letting each one wander to straighten itself spent
     that: two lineages out of an amalgam's parent drifted toward each
     other and the pair ended up bunched and off centre, which reads as a
     mistake in the drawing. A lone connector has nobody to be even WITH,
     so it may move as much as its side allows; a shared side keeps its
     arithmetic, and only the last pixel or two are still taken (see
     PORT_SQUEEZE), which is below the threshold of noticing. */
  if((p.slots || 1) > 1) return 0;
  return Math.min(PORT_NUDGE_MAX, (p.span / 2) * 0.45);
}
/* Moves a port along its side by `delta`, as far as its slack allows, and
   returns how far it actually went. A rippled border's offset is worked out
   again at the new place, because it is different at every point. */
function movePortAlong(p, delta){
  if(!p || !delta) return 0;
  if(sideIsVertical(p.side)) p.x += delta; else p.y += delta;
  if(p.wavy){
    const n = nodes.get(p.owner);
    const f = n && wavyDropAt(n, p.side, p.ring || 0);
    p.drop = f ? f(p.x, p.y) : 0;
  }
  return delta;
}
/* The last pixel or two are taken whatever the slack says.
 *
 * A residual smaller than this is not a misalignment worth a corner — it is
 * the arithmetic not quite coming out, and drawn as a step it is two arcs
 * of half a pixel each: a visible wobble in the middle of a straight line,
 * which is worse than anything moving a port this far could cause. Two
 * pixels cannot put two connectors on top of one another. */
const PORT_SQUEEZE = 4;
function nudgePortAlong(p, delta){
  const room = portSlack(p);
  if(!room || !delta) return 0;
  const move = Math.max(-room, Math.min(room, delta));
  if(Math.abs(move) < 0.01) return 0;
  return movePortAlong(p, move);
}
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
   Waves, drawn as real curves.

   Both the pocket-reality border and the wavy connector used to be a sine
   sampled into a few dozen points and then pushed through a Catmull-Rom
   smoother. Two rounds of approximation, and the second one rounded the
   crests off the first: the result was low, soft and slightly uneven —
   more of a wobble than a wave.

   Here each half-wave is one cubic Bezier with its control points placed
   exactly, which is how a wave is drawn in a vector program (and the
   technique behind the CSS wavy-shape recipes): a cubic from baseline to
   baseline whose two controls sit at 4/3 of the target amplitude peaks at
   exactly that amplitude. Whole bumps only, so a wave always begins and
   ends on the baseline and adjacent runs meet exactly.
   ------------------------------------------------------------------ */
/* From a sine to a coil.
 *
 * The shape of a half-wave is decided entirely by where its two control
 * points sit ALONG the run. Inset them (the old 0.36 / 0.64) and the curve
 * leaves the baseline at a slope, which is precisely what makes a sine look
 * like a sine. Put them directly above the two endpoints and the curve
 * leaves the baseline vertically: the hump becomes a half-ellipse, and a
 * row of them reads as the arcs of an inductor symbol rather than a ripple.
 *
 * The direction alternates: every second arc turns over, so a run reads as
 * a wave rather than as the row of same-way humps it was for a while. The
 * side the FIRST arc takes is the caller's, and `phase` carries that
 * choice across a run that had to be cut short — see wavyPath, where the
 * arcs an arrowhead covers are dropped without moving the rest.
 *
 * A cubic cannot BE a half-circle, but controls at 4/3 of the amplitude
 * make it peak at exactly `amp` and stay within about 3% of the true arc
 * everywhere else, which is nowhere near visible at these sizes. Because
 * `amp` is free of the step width, the arcs are half-ELLIPSES: numerous
 * and shallow, which is what was asked for — a true half-circle's height
 * is locked to half its width and would be far too tall. */
const WAVE_K = 4/3;
/* …and from a coil back to a squiggle.
 *
 * The half-ellipses read as a row of scallops, which on a box looked like a
 * jigsaw piece and on a line like a string of beads. What was asked for is
 * the hand-drawn squiggle: short, shallow, and SMOOTH through the baseline.
 * That is a sine, and a cubic makes a very good half-sine when its two
 * controls stand in from the ends by 4/(3π) of the arc — the slope it then
 * leaves the baseline at is exactly the sine's, and the peak is still 3/4
 * of the control height. The phase grid, the alternation and the whole
 * arcs are unchanged; only where the controls stand along the run is. */
const WAVE_CTRL = 4 / (3 * Math.PI);
/* Where along its own arc a point of the wave is, given how far along the
   run it is — the inverse of the cubic's x(t), which with inset controls
   is no longer a simple smoothstep. Newton from the identity; six steps
   land well inside a hundredth of a unit. */
function waveParamAt(u){
  const k = WAVE_CTRL;
  let t = Math.max(0, Math.min(1, u));
  for(let i = 0; i < 6; i++){
    const mt = 1 - t;
    const x = 3*k*t*mt*mt + 3*(1 - k)*t*t*mt + t*t*t;
    const dx = 3*k*mt*mt + 6*(1 - 2*k)*t*mt + 3*k*t*t;
    if(Math.abs(dx) < 1e-6) break;
    t = Math.max(0, Math.min(1, t - (x - u)/dx));
  }
  return t;
}
/* Amplitude is DERIVED from the spacing unless a caller says otherwise. A
   semicircle's height is half its width, so once the spacing is chosen the
   radius follows — and letting the two be set independently at every call
   site is how the old wave drifted into looking like a squashed sine. One
   dial, how long an arc should be, and the shape comes out consistent.

   The one caller that overrides it is the pocket border (POCKET_LIFT),
   which needs a deliberately shallower ripple for the reasons given there.

   This also self-regulates on short runs: `bumps` is rounded from the run
   length, so `step` never strays far from the target and the radius cannot
   blow up on a stub. */
/* The arc pitch is FIXED, never fitted to the run.
 *
 * It used to be runLen/bumps, so every run stretched or squeezed its arcs
 * a little to come out even. That made the texture depend on the length of
 * the run it happened to be on — and, worse, on whether the connector had
 * arrowheads, since a head shortens the run: adding one visibly re-pitched
 * the whole pattern. An arc is now always EDGE_WAVE_LEN long wherever it
 * appears, and the leftover goes to the flats at either end, so the same
 * connector keeps the same texture whatever is attached to it. */
/* `phase` is which side the FIRST arc of this run bulges to, so a run that
   is really the continuation of another can carry on alternating instead
   of starting over. */
function waveRun(ax, ay, ux, uy, nx, ny, from, bumps, step, phase, liftOverride){
  const at = (dist, off)=>
    `${(ax + ux*dist + nx*off).toFixed(2)},${(ay + uy*dist + ny*off).toFixed(2)}`;
  const lift = (typeof liftOverride === 'number') ? liftOverride : EDGE_WAVE_PEAK * WAVE_K;
  const start = phase || 0;
  const inset = step * WAVE_CTRL;
  let d = '';
  for(let j=0; j<bumps; j++){
    const s = from + j*step, e = s + step;
    // Every second arc turns over, so the run is a wave and not a coil.
    const side = ((j + start) % 2 === 0) ? lift : -lift;
    d += ` C${at(s + inset, side)} ${at(e - inset, side)} ${at(e, 0)}`;
  }
  return d;
}
/* How many arcs fit in `len` at roughly `target` each. Each arc begins and
   ends on the baseline whichever side it bulges to, so the count does not
   have to come out even — which lets the spacing land closer to the target
   and keeps adjacent runs consistent. */
// How many WHOLE arcs of `target` fit. The remainder is not squeezed into
// them — it is left as flat, so the pitch never varies.
function waveBumps(len, target){
  return Math.max(1, Math.floor(len / target));
}

// Many small scallops rather than a few big ones: a fine ripple reads as
// a deliberate frame, where a long slow wave just looks like a wobbly box.
/* A squiggle, not a scallop: half-waves about as long as a stroke is wide
   a few times over. See WAVE_CTRL. */
const POCKET_WAVELEN = 4.5;
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
/* The height of the CONTROLS; the ripple itself peaks at three quarters of
   it — a little under two units, which is the hand-drawn look, and keeps
   two rings four units apart well clear of each other. */
const POCKET_LIFT = 2.5;
/* The frame borrows the connector's arrangement: a short flat stretch at
   each corner, an even row of scallops between them. Running the wave all
   the way into the corner put a crest exactly where two sides meet, which
   softened the corner into a blob and made the box lose its shape; a
   corner that stays square reads as a box with a wavy edge, which is what
   a pocket reality is meant to look like. Like the connector's, these
   flats give way on a short side rather than eating it. */
const POCKET_CORNER_FLAT = 0;
/* One side of the pocket frame, from just past one corner to just short of
   the next. The radius is held back at both ends so wavyRectPath can turn
   the corner with an arc, the way every other box on the chart does. */
/* One side of the frame. `phaseBase` is where this side begins measured
   along its own axis from the ENTRY's own corner — which is what lets two
   rings of the same entry lay their arcs on one shared grid.
 *
 * Centring each side's arcs in its own length, as this did, put every ring
 * on a phase of its own: a ring is longer than the one inside it, so their
 * crests drifted apart and met again around the frame, and two rings four
 * pixels apart could touch wherever they fell out of step. That is what
 * forced the ripple to be shallow enough to be barely visible. Anchored to
 * a shared grid the rings are parallel curves, exactly the ring spacing
 * apart at every point, and the ripple can have some depth again. */
function wavySideCommands(x1, y1, x2, y2, outX, outY, r, phaseBase){
  const len = Math.hypot(x2-x1, y2-y1);
  if(len < 2) return ` L${x2},${y2}`;
  const ux = (x2-x1)/len, uy = (y2-y1)/len;
  const sx = x1 + ux*r, sy = y1 + uy*r;          // start, past the last corner
  const ex = x2 - ux*r, ey = y2 - uy*r;          // end, short of the next one
  const straight = len - r*2;
  const flat = Math.min(POCKET_CORNER_FLAT, straight/4);
  const runLen = straight - flat*2;
  if(runLen < POCKET_WAVELEN * 1.5) return ` L${ex.toFixed(2)},${ey.toFixed(2)}`;
  const W = POCKET_WAVELEN;
  // Where `sx` sits on the entry's own grid, and the first grid line at or
  // past the point the arcs may begin.
  const absAtSx = (phaseBase || 0) + r;
  const firstIdx = Math.ceil((absAtSx + flat) / W);
  const start = firstIdx * W - absAtSx;
  const bumps = Math.floor((runLen + flat - start) / W);
  if(bumps < 1) return ` L${ex.toFixed(2)},${ey.toFixed(2)}`;
  // Which way the first drawn arc bulges, so neighbouring rings agree.
  const phase = ((firstIdx % 2) + 2) % 2;
  let d = ` L${(sx + ux*start).toFixed(2)},${(sy + uy*start).toFixed(2)}`;
  d += waveRun(sx, sy, ux, uy, outX, outY, start, bumps, W, phase, POCKET_LIFT);
  d += ` L${ex.toFixed(2)},${ey.toFixed(2)}`;
  return d;
}
/* Held back from the rx an ordinary entry's rectangle uses. The radius and
   the corner flat are both dead ground as far as the ripple is concerned —
   between them they took sixteen pixels out of every side, which is two
   whole scallops the frame never got to have, and the corners were the one
   part of the border that stayed straight. */
const POCKET_CORNER_R = 2.5;
/* One side of that same wavy outline, on its own and left open. The edge
   you grab to draw a connector is drawn as the border it lights up, so on
   a pocket reality it has to wave exactly as the border does — a straight
   bar across a rippled edge read as a separate object laid over the box.
   Built from the same wavySideCommands the whole outline is built from, so
   the two can never drift apart. */
function wavySideOpenPath(x, y, w, h, side, grow){
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const c = {
    top:    [x,     y,     x+w,   y,      0, -1],
    right:  [x+w,   y,     x+w,   y+h,    1,  0],
    bottom: [x+w,   y+h,   x,     y+h,    0,  1],
    left:   [x,     y+h,   x,     y,     -1,  0]
  }[side];
  if(!c) return '';
  const len = Math.hypot(c[2]-c[0], c[3]-c[1]) || 1;
  const ux = (c[2]-c[0])/len, uy = (c[3]-c[1])/len;
  const sx = c[0] + ux*r, sy = c[1] + uy*r;
  return `M${sx.toFixed(2)},${sy.toFixed(2)}` +
    wavySideCommands(c[0], c[1], c[2], c[3], c[4], c[5], r, -(grow || 0));
}
/* `grow` is how far outside the entry's own box this ring sits, which is
   all the shared grid needs: a ring `g` out starts each of its sides `g`
   before the entry's corner. */
function wavyRectPath(x, y, w, h, grow){
  const r = Math.max(0, Math.min(POCKET_CORNER_R, w/2 - 1, h/2 - 1));
  const g = grow || 0;
  const corners = [
    [x,     y,     x+w,   y,      0, -1],   // top,    bulging up
    [x+w,   y,     x+w,   y+h,    1,  0],   // right,  bulging right
    [x+w,   y+h,   x,     y+h,    0,  1],   // bottom, bulging down
    [x,     y+h,   x,     y,     -1,  0]    // left,   bulging left
  ];
  let d = `M${(x + r).toFixed(2)},${y}`;
  corners.forEach((c, i)=>{
    d += wavySideCommands(c[0], c[1], c[2], c[3], c[4], c[5], r, -g);
    // Round into the next side.
    const nxt = corners[(i+1) % corners.length];
    const nl = Math.hypot(nxt[2]-nxt[0], nxt[3]-nxt[1]) || 1;
    const vx = (nxt[2]-nxt[0])/nl, vy = (nxt[3]-nxt[1])/nl;
    d += ` Q${c[2]},${c[3]} ${(c[2] + vx*r).toFixed(2)},${(c[3] + vy*r).toFixed(2)}`;
  });
  return d + ' Z';
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
