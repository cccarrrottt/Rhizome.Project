const SIDE_OUT = {top:[0,-1], bottom:[0,1], left:[-1,0], right:[1,0]};
/* Where an arrowhead's tip goes: on the port. Always, and for every
   archetype — a rippled border included.
 *
 * A pocket reality used to be handled specially at every step of the way,
 * and each of those steps left something on the paper. The tip was sunk a
 * whole amplitude INTO the box so that it would touch the wave wherever
 * along the ripple the connector arrived: at a crest that buried the head
 * two amplitudes deep, lying over the border it was supposed to be
 * arriving at. The head was moved above the entry so the ripple could not
 * be drawn across it, which is what made the burial visible. And a short
 * cap of the line was drawn above the entry too, to cover the trough —
 * which, once the tip came back out, was simply a stub of the connector
 * poking through the border into the box.
 *
 * All of it is gone. A ripple is a border like any other: the line stops
 * at it, the head stands on it, and the border is drawn over the head's
 * tip exactly as a plain rectangle's border is. The wave crosses the last
 * pixel of the arrow either side of the baseline, which is what a line
 * meeting a rippled edge should look like. */
function portTip(port){
  /* The point the route already ends at. sinkEnds has moved that end onto
     the border's real position — the ripple included — before the path was
     built, so the head is simply put where the line stops. Adding the drop
     a second time here is what buried a pocket's arrowheads an amplitude
     too deep and left every line 0.85px short of its own head. */
  return {x: port.x, y: port.y};
}
/* Every piece a connector is made of carries which two entries it belongs
   to. The arrowheads and the ring caps live in a layer of their own, above
   the entries, and until they were labelled this way the tag filter could
   not find them: hiding a tag took away the entries and the lines but left
   a scatter of arrowheads hanging in the empty chart. */
/* One ring's own outline, as a path — the shape the border is drawn with.
 *
 * The three cases are the three ways an entry is drawn: a rippled border,
 * a portrait's circle, and the rounded box everything else wears. Kept
 * here because the only thing that asks for a whole OUTLINE (rather than
 * for where the border is at one point — see borderProfileOf) is the
 * clipping below. */
function ringOutlinePath(n, ring){
  const grow = (ring || 0) * ringStepFor(n);
  const x = n.x - grow, y = n.y - grow, w = n.w + grow*2, h = n.h + grow*2;
  if(isWavyBorder(n)) return wavyRectPath(x, y, w, h, grow);
  if((n.shape || '') === 'ellipse'){
    const r = w/2, cx = x + w/2, cy = y + h/2;
    return `M${cx-r},${cy} a${r},${r} 0 1 0 ${r*2},0 a${r},${r} 0 1 0 ${-r*2},0 Z`;
  }
  const rr = Math.max(0, 5 + grow);
  return `M${x+rr},${y} H${x+w-rr} A${rr},${rr} 0 0 1 ${x+w},${y+rr} ` +
         `V${y+h-rr} A${rr},${rr} 0 0 1 ${x+w-rr},${y+h} ` +
         `H${x+rr} A${rr},${rr} 0 0 1 ${x},${y+h-rr} ` +
         `V${y+rr} A${rr},${rr} 0 0 1 ${x+rr},${y} Z`;
}
/* The ground a ring cap may be drawn on: outside the ring the connector
   ends at, and no further out than the entry's own outermost border. An
   annulus, written as one path with the even-odd rule — the box round the
   outside, the ring's outline inside it. */
const ringCapClips = new Map();
function ringCapClipId(n, ring, reach){
  const key = n.id + '|' + ring;
  if(ringCapClips.has(key)) return ringCapClips.get(key);
  const id = defId('ringcap-', n.id) + '-r' + ring;
  const clip = el('clipPath', {id, clipPathUnits:'userSpaceOnUse'}, edgeDefs);
  const pad = Math.max(2, reach) + 3;
  const bx = n.x - pad, by = n.y - pad, bw = n.w + pad*2, bh = n.h + pad*2;
  const box = `M${bx},${by} H${bx+bw} V${by+bh} H${bx} Z `;
  el('path', {d: box + ringOutlinePath(n, ring), 'clip-rule':'evenodd'}, clip);
  ringCapClips.set(key, id);
  return id;
}
function drawRingCap(port, paint, dash, from, to, dbl, lineD){
  const ring = (port && port.ring) || 0;
  const out = port && SIDE_OUT[port.side];
  if(!out) return;
  /* How much of the entry's own border still stands between this port and
     the open chart.
   *
     Rings step OUTWARD: ring 0 is the box and every further ring is a step
     beyond the last. So a connector meeting an INNER ring has to pass
     under every ring outside it — each of those strokes is drawn over the
     connector layer and takes a bite out of the line — and a connector
     meeting the OUTERMOST ring has nothing over it at all.
   *
     This had it exactly the wrong way round: the reach was measured from
     the connector's own ring number, so a line meeting the outermost
     border got a stub of itself drawn five pixels PAST the entry — the
     second line seen poking out of a connector — while a line meeting the
     innermost one, the case the cap exists for, got no cap whatsoever.
   *
     A rippled border adds its own: it is not where its baseline is, it
     wanders a whole amplitude either side, so a connector meeting a pocket
     reality stopped at the line the wave crosses rather than at the wave. */
  const outside = Math.max(0, ((port && port.rings) || 1) - 1 - ring);
  /* Far enough to get past the OUTERMOST ring, ripple and all.
   *
     The cap redraws the stretch of connector that the rings outside this
     one are drawn over. Measured to their baselines it stopped inside a
     rippled ring's own wave, so a connector meeting an inner ring of a
     pocket reality came apart into a line, a gap, and a short stub — which
     is what the caps were introduced to prevent in the first place. */
  const wave = (port && port.wavy) ? POCKET_DEEP + 1.5 : 0;
  const reach = outside ? outside * (port.step || RING_STEP) + 1 + wave : 0;
  if(reach <= 0) return;
  /* A rippled border is a BAND, not a line: it wanders a full amplitude
     either side of the baseline the port sits on. A cap that started at
     the baseline therefore stopped in mid-air wherever the wave happened
     to be at a trough. It starts one amplitude further IN, so it meets the
     border whichever part of the ripple it lands on. */
  /* The cap starts ON the border, not where the LINE stops.
   *
     A headless line is deliberately carried past a rippled border and left
     under the entry's fill (see sinkEnds), which is invisible — until a
     cap is drawn from that same point in the layer ABOVE the entry, where
     the buried stretch is suddenly on top of everything: a stub of
     connector sticking through the border into the box. The cap's job
     begins where the border is, and runs outward from there. */
  const startDrop = (port.wavy && typeof port.drop === 'number') ? port.drop : 0;
  const sx = port.x + out[0]*startDrop, sy = port.y + out[1]*startDrop;
  /* The cap IS the connector, drawn again above the rings it passes under
     — not a straight stub standing in for it.
   *
     A stub was right for a plain line and wrong for every other kind: laid
     over a wavy connector it read as a second, straight line crossing the
     first, which is the pile of lines at an inner ring; and at an end that
     carries an ARROWHEAD it ran up the middle of the head, which is the
     line showing from under the arrow. So the drawn path is drawn a second
     time, clipped to the ring's own outside — the head's trim is already
     in that path, so nothing shows past the head, and whatever the line
     is made of, the cap is made of the same thing. */
  const owner = nodes.get(port.owner);
  const clipId = (lineD && owner) ? ringCapClipId(owner, ring, reach) : null;
  const attrs = clipId ? {
    class: 'edge struct edge-cap',
    d: lineD, stroke: paint, 'clip-path': `url(#${clipId})`,
    'data-from': from || '', 'data-to': to || ''
  } : {
    class: 'edge struct edge-cap',
    d: `M${sx.toFixed(2)},${sy.toFixed(2)} L${(port.x + out[0]*reach).toFixed(2)},${(port.y + out[1]*reach).toFixed(2)}`,
    stroke: paint, 'data-from': from || '', 'data-to': to || ''
  };
  if(dash) attrs['stroke-dasharray'] = dash;
  /* The cap is a stretch of the connector, so it wears the connector's
     line style — a doubled line that went back to a single rail for its
     last few pixels over the border read as two lines meeting one. */
  if(dbl){
    el('path', Object.assign({}, attrs, {class: attrs.class + ' dbl-outer'}), arrowLayer);
    const inner = Object.assign({}, attrs, {class: attrs.class + ' dbl-inner'});
    delete inner.stroke;
    el('path', inner, arrowLayer);
    return;
  }
  el('path', attrs, arrowLayer);
}
/* Which layer an arrowhead belongs in.

   UNDER the entry, so the border draws over the very tip: the arrow
   arrives AT the box rather than sitting on top of it, which is how an
   arrow meeting a shape reads. A rippled border is no exception — it was
   one for a while, on the grounds that the fill would cut a curve out of
   a head as wide as the ripple's own period, and the cure was worse than
   the complaint: the head lay across the border and covered the very
   thing it was arriving at.

   The one real exception is an arrow that belongs to an INNER border
   ring. Rings step outward, so its tip sits under every ring beyond it
   and would be drawn over entirely — that one goes above, where it can be
   seen reaching the ring it was pulled from, with the cap alongside it
   covering the same buried stretch of its line. */
function arrowLayerFor(ring, port){
  const outside = Math.max(0, ((port && port.rings) || 1) - 1 - (ring || 0));
  return outside > 0 ? arrowLayer : edgeLayer;
}

/* Stop the line where the arrowhead starts.

   The head is a filled triangle laid over the last stretch of its own line.
   Solid colours hide the overlap completely, but a gradient does not: the
   line and the head sample the sweep at slightly different places and are
   drawn with different paint types, and the line shows through the head as
   a seam down its middle. Ending the line at the head's back edge leaves
   nothing underneath to show through — and costs nothing on a solid
   connector, where the two met invisibly anyway.

   The trim is a shade shorter than the head so the two still overlap by a
   hair; a perfect butt joint would let the background through the seam. */
const ARROW_TRIM = ARROW_LEN - 1.2;
function arrowTrimmed(from, to, trim){
  const t = (typeof trim === 'number') ? trim : ARROW_TRIM;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if(t <= 0 || len <= t) return {x: to.x, y: to.y};
  return {x: to.x - dx/len*t, y: to.y - dy/len*t};
}
/* How much of the line an arrowhead at this end covers.
 *
 * The head is laid over the last stretch of its own line, and the line is
 * cut back to the head's back edge so a gradient has nothing underneath to
 * show through. It is the same for every entry on the chart, a pocket
 * reality included: every head now stops at its port (see portTip), so
 * every head covers the same stretch of line. The parameter is kept so
 * that a future end-treatment that does move its tip has somewhere to say
 * so — and so the call sites do not have to change again. */
function headCut(port){
  return ARROW_TRIM;
}
// The same trim applied to the end (or start) of a routed point list, so a
// rounded or wavy path can be built already short of its arrowhead.
function trimForHeads(pts, headIn, headOut, portIn, portOut){
  if(!headIn && !headOut) return pts;
  const out = pts.map(p=>({...p}));
  if(headOut && out.length >= 2){
    const t = arrowTrimmed(out[out.length-2], out[out.length-1], headCut(portOut));
    out[out.length-1] = {...out[out.length-1], x:t.x, y:t.y};
  }
  if(headIn && out.length >= 2){
    const t = arrowTrimmed(out[1], out[0], headCut(portIn));
    out[0] = {...out[0], x:t.x, y:t.y};
  }
  return out;
}
// The merged arrow of an amalgam, which has no single source entry.
function drawAmalgamArrow(port, cx, cy, ring, paint, toId){
  const tip = portTip(port);
  /* Cut off at the border it arrives at, exactly as an ordinary arrowhead
     is. A merged lineage landing on a pocket reality used to be the one
     head on the chart that was allowed through the ripple. */
  drawArrowHead(arrowLayerFor(ring, port), tip.x, tip.y,
                Math.atan2(port.y - cy, port.x - cx) * 180/Math.PI, paint, '', toId,
                (port && port.wavy) ? toId : null, (port && port.ring) || 0);
}
/* Everything OUTSIDE an entry's own outline, as a clip path.
 *
 * An arrowhead is a triangle nine pixels long and eight wide, and on a
 * rippled border the wave swings from crest to trough across that width.
 * Drawn UNDER the entry the fill takes a curved bite out of one flank;
 * drawn OVER it the whole head lies across the border and, wherever the
 * wave dips inward, reads as an arrow that has gone into the box. Neither
 * is what an arrow meeting a shape looks like.
 *
 * So it is drawn over the entry and cut off at the outline: the head stops
 * exactly where the border is, whatever the border is doing at that point.
 * That is precisely what a plain entry's fill does for it, done explicitly
 * because a rippled border cannot do it by being painted over.
 *
 * The clip is a huge rectangle with the entry's own outline punched out of
 * it by the even-odd rule. Built once per entry per redraw and cached, so
 * a fan of arrows into one pocket costs one path. */
/* Keyed by entry AND ring. An entry drawn with three borders has three
   rippled outlines, one inside the next, and a connector that meets the
   middle one has to be cut off at the MIDDLE one — cutting it at the
   innermost let an arrowhead that had already crossed its own border keep
   going, so a head pulled from the second ring of a three-ring pocket
   reality arrived a whole ring too deep and sat in the gap beyond it. */
const outsideClips = new Map();
function outsideClipId(nodeId, ring){
  const r = Math.max(0, Math.round(ring || 0));
  const key = nodeId + '|' + r;
  if(outsideClips.has(key)) return outsideClips.get(key);
  const n = nodes.get(nodeId);
  if(!isWavyBorder(n)){ outsideClips.set(key, null); return null; }
  const id = defId('outside-', nodeId) + '-r' + r;
  const clip = el('clipPath', {id, clipPathUnits:'userSpaceOnUse'}, edgeDefs);
  const pad = 4000;
  /* Rings step OUTWARD, so ring r's own outline is the entry's box grown
     by r steps — the very path renderNodes draws for it, built the same
     way so the cut and the border can never be a pixel apart. */
  const grow = r * ringStepFor(n);
  const rx = n.x - grow, ry = n.y - grow, rw = n.w + grow*2, rh = n.h + grow*2;
  const box = `M${rx-pad},${ry-pad} H${rx+rw+pad} V${ry+rh+pad} H${rx-pad} Z `;
  el('path', {d: box + wavyRectPath(rx, ry, rw, rh, grow), 'clip-rule':'evenodd'}, clip);
  outsideClips.set(key, id);
  return id;
}
function drawArrowHead(parent, x, y, angleDeg, fill, from, to, clipTo, clipRing){
  const a = angleDeg * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const at = (lx, ly)=> `${(x + lx*cos - ly*sin).toFixed(2)},${(y + lx*sin + ly*cos).toFixed(2)}`;
  const attrs = {class:'edge-arrow', 'data-from': from || '', 'data-to': to || ''};
  const clip = clipTo ? outsideClipId(clipTo, clipRing || 0) : null;
  if(clip) attrs['clip-path'] = `url(#${clip})`;
  const g = el('g', attrs, parent);
  el('path', {d:`M${at(0,0)} L${at(-ARROW_LEN,-ARROW_HALF)} L${at(-ARROW_LEN,ARROW_HALF)} z`, fill}, g);
  return g;
}
// The direction an arrowhead at the START should point: back out of the
// source, i.e. the reverse of the first segment's heading.
function startAngleDeg(pts){
  for(let i=1;i<pts.length;i++){
    const dx = pts[i].x - pts[0].x, dy = pts[i].y - pts[0].y;
    if(Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5){
      return Math.atan2(-dy, -dx) * 180 / Math.PI;
    }
  }
  return 0;
}

// nodes
