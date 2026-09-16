/* ---------------------------------------------------------------------
   Connectors are drawn by dragging out of an entry's border, which is
   both more direct and the only way to choose WHICH border ring the arrow
   belongs to. The old click-one-node-then-the-other mode did the same job
   worse and has been removed; connectNodes below is still what actually
   records a connection, called now from the drag.
   ------------------------------------------------------------------ */
// Resolves an item's parent list to a plain array, regardless of whether
// it was stored as a single string, an array, or omitted/null (root).
function resolveExplicitParents(it){
  const p = it[2];
  if(p===undefined || p===null) return [];
  if(Array.isArray(p)) return p.slice();
  return [p];
}

/* Put a newly merged entry where its bar can reach it: centred across the
   lineages along the bar's axis, and a comfortable distance off them. */
function bringAmalgamToItsLineages(found, parentIds){
  const kids = parentIds.map(id=> nodes.get(id)).filter(Boolean);
  if(kids.length < 2) return;
  const n = nodes.get(found.entry[0]);
  if(!n) return;
  const cx = kids.reduce((a,p)=> a + p.x + p.w/2, 0) / kids.length;
  const cy = kids.reduce((a,p)=> a + p.y + p.h/2, 0) / kids.length;
  const spanX = Math.max(...kids.map(p=> p.x + p.w/2)) - Math.min(...kids.map(p=> p.x + p.w/2));
  const spanY = Math.max(...kids.map(p=> p.y + p.h/2)) - Math.min(...kids.map(p=> p.y + p.h/2));
  const own = {x: n.x + n.w/2, y: n.y + n.h/2};
  // Already within reach along the bar and not absurdly far off it: leave it.
  const along = spanX >= spanY ? own.x : own.y;
  const lo = spanX >= spanY ? Math.min(...kids.map(p=> p.x + p.w/2))
                            : Math.min(...kids.map(p=> p.y + p.h/2));
  const hi = spanX >= spanY ? Math.max(...kids.map(p=> p.x + p.w/2))
                            : Math.max(...kids.map(p=> p.y + p.h/2));
  const off = spanX >= spanY ? Math.abs(own.y - cy) : Math.abs(own.x - cx);
  if(along >= lo && along <= hi && off <= AMALGAM_LEASH) return;
  // Centred across them, and clear of them on the side it is already on.
  const stand = Math.min(Math.max(off, AMALGAM_HOME_GAP), AMALGAM_LEASH * 0.6);
  const sign = (spanX >= spanY ? (own.y - cy) : (own.x - cx)) >= 0 ? 1 : -1;
  const centre = spanX >= spanY
    ? {x: cx, y: cy + sign * stand}
    : {x: cx + sign * stand, y: cy};
  const opts = entryOpts(found.entry);
  opts.pos = [snapToGrid(centre.x - n.w/2), snapToGrid(centre.y - n.h/2)];
  putEntry(found.index, found.entry, opts);
}
// How far off its lineages a newly merged entry is stood when it has to be
// moved at all — far enough for the bar and the arrow to be legible.
const AMALGAM_HOME_GAP = 220;
// `geom` is optional; when a connector is drawn between two border bands
// it carries which side and which ring each end used, plus the colour of
// the ring it was pulled from — all recorded with the connection so it
// keeps the exact geometry and colour it was drawn with.
function connectNodes(sourceId, targetId, geom){
  const found = workingEntry(targetId);
  if(!found){ flashStatus('That entry could not be found.'); return; }
  const parents = resolveExplicitParents(found.entry);
  if(parents.includes(sourceId)){ flashStatus('Those entries are already connected.'); return; }
  /* An amalgam that has just become one is brought to its lineages.
   *
   * The bar spans the ground the lineages cover and the merged arrow
   * leaves from a point on it, so an entry sitting a thousand pixels away
   * when its second lineage arrives has nothing sensible to draw: the
   * landings all clamp to one end and the arrow strikes off across the
   * chart. Dragging an amalgam is already held inside its bar; this is the
   * same rule applied at the moment it first becomes one, and it only
   * moves an entry that is outside where it would be allowed to go. */
  const willMerge = (found.entry[5] === 'amalgam') && parents.length === 1;
  applyEdit(()=>{
    parents.push(sourceId);
    if(willMerge) bringAmalgamToItsLineages(found, parents);
    found.entry[2] = parents.length===1 ? parents[0] : parents;
    putEntry(found.index, found.entry, entryOpts(found.entry));
    if(geom && (SIDES.includes(geom.fromSide) || SIDES.includes(geom.toSide))){
      const existing = EDGE_STYLES.find(s=>s.from===sourceId && s.to===targetId);
      const entry = Object.assign({
        from: sourceId, to: targetId,
        routing: DEFAULT_EDGE_STYLE.routing,
        dash: DEFAULT_EDGE_STYLE.dash,
        arrow: DEFAULT_EDGE_STYLE.arrow
      }, existing || {}, {
        fromSide: SIDES.includes(geom.fromSide) ? geom.fromSide : undefined,
        toSide: SIDES.includes(geom.toSide) ? geom.toSide : undefined,
        fromRing: geom.fromRing || undefined,
        toRing: geom.toRing || undefined,
        /* The RING, not the colour of the ring.
         *
         * A connector drawn out of a border used to record the colour that
         * border happened to be at the time, which froze it: recolour the
         * entry and its own connectors stayed the old colour, and an
         * amalgam — which wears the colours of the lineages feeding it —
         * went on wearing colours nothing on the chart had any more. The
         * ring is already recorded; the colour is read from it at draw
         * time, so it follows. A colour chosen by hand in the connector's
         * own settings is a different thing and still wins. */
        color: (existing && existing.color) || undefined
      });
      if(existing) EDGE_STYLES[EDGE_STYLES.indexOf(existing)] = entry;
      else EDGE_STYLES.push(entry);
    }
  });
}

// Removes one connection (an existing arrow) - the inverse of connectNodes.
// Drops sourceId from the target's parent list, and also drops any
// per-edge style override that was set on that connection, since it no
// longer applies to anything once the connection is gone.
/* Taking a border away takes its connectors with it.
 *
 * A connector remembers which border ring it was pulled from, and that is
 * the whole point of a multi-bordered entry: pull from the black ring and
 * the connector is black, from the grey one and it is grey. Remove that
 * ring and the connector is remembering a border that no longer exists —
 * it fell back to the outermost one and silently became a lineage of a
 * different colour, joining a line it was never drawn from. So it goes
 * with the border it belonged to, the way an entry's connectors go when
 * the entry does. Must run inside an edit that is already open. */
function dropEdgesOnMissingRings(nodeId, rings){
  const doomed = EDGE_STYLES.filter(e=>
    (e.from === nodeId && (e.fromRing || 0) >= rings) ||
    (e.to   === nodeId && (e.toRing   || 0) >= rings));
  if(!doomed.length) return 0;
  doomed.forEach(e=>{
    const found = workingEntry(e.to);
    if(found){
      const parents = resolveExplicitParents(found.entry).filter(p=> p !== e.from);
      found.entry[2] = parents.length === 0 ? undefined
                     : (parents.length === 1 ? parents[0] : parents);
      putEntry(found.index, found.entry, entryOpts(found.entry));
    }
    const i = EDGE_STYLES.indexOf(e);
    if(i >= 0) EDGE_STYLES.splice(i, 1);
  });
  return doomed.length;
}
function deleteEdge(sourceId, targetId){
  const found = workingEntry(targetId);
  if(!found){ setStyleStatus('err', 'That node could not be found.'); return false; }
  applyEdit(()=>{
    const parents = resolveExplicitParents(found.entry).filter(p=>p!==sourceId);
    found.entry[2] = parents.length===0 ? undefined : (parents.length===1 ? parents[0] : parents);
    putEntry(found.index, found.entry, entryOpts(found.entry));
    const idx = EDGE_STYLES.findIndex(s=>s.from===sourceId && s.to===targetId);
    if(idx>=0) EDGE_STYLES.splice(idx,1);
  });
  return true;
}

// Removes a node entirely. Any other item that listed it as a parent loses
// that connection, and any per-edge style that touched it goes too.
// Deleting several at once, as one undo step: every parent link into any
// of them goes, and so does every per-edge style that touched one.
/* A connector's settings popover belongs to a connector. When either end
   of it goes, so does the popover — otherwise it stayed open, still
   titled with the entry that had just been deleted, and pressing anything
   in it wrote a fresh style row for a pair of ids where one no longer
   exists. That row is then saved into the chart and kept for good. */
function closePopoverIfTouching(ids){
  if(!currentEdgeStyleTarget) return;
  const set = ids instanceof Set ? ids : new Set(ids);
  if(set.has(currentEdgeStyleTarget.from) || set.has(currentEdgeStyleTarget.to)){
    closeEdgePopover();
  }
}
function deleteNodes(ids){
  const doomed = new Set(ids.filter(id=> workingIndex(id) !== -1));
  if(!doomed.size) return false;
  closePopoverIfTouching(doomed);
  applyEdit(()=>{
    workingNodes.forEach((it,idx)=>{
      if(doomed.has(it[0])) return;
      const parents = resolveExplicitParents(it);
      const remaining = parents.filter(p=>!doomed.has(p));
      if(remaining.length === parents.length) return;
      const out = [];
      for(let k=0;k<7;k++) out[k] = (k<it.length ? it[k] : undefined);
      out[2] = remaining.length===0 ? undefined : (remaining.length===1 ? remaining[0] : remaining);
      workingNodes[idx] = out;
    });
    for(let i=workingNodes.length-1;i>=0;i--){
      if(doomed.has(workingNodes[i][0])) workingNodes.splice(i,1);
    }
    for(let k=EDGE_STYLES.length-1;k>=0;k--){
      if(doomed.has(EDGE_STYLES[k].from) || doomed.has(EDGE_STYLES[k].to)) EDGE_STYLES.splice(k,1);
    }
  });
  deselect();
  return true;
}

function deleteNode(nodeId){
  closePopoverIfTouching([nodeId]);
  if(workingIndex(nodeId) === -1){ setEditStatus('err', 'That node could not be found.'); return false; }
  applyEdit(()=>{
    workingNodes.forEach((it,idx)=>{
      if(it[0]===nodeId) return;
      const parents = resolveExplicitParents(it);
      if(!parents.includes(nodeId)) return;
      const remaining = parents.filter(p=>p!==nodeId);
      const out = [];
      for(let k=0;k<7;k++) out[k] = (k<it.length ? it[k] : undefined);
      out[2] = remaining.length===0 ? undefined : (remaining.length===1 ? remaining[0] : remaining);
      workingNodes[idx] = out;
    });
    workingNodes.splice(workingIndex(nodeId), 1);
    for(let k=EDGE_STYLES.length-1;k>=0;k--){
      if(EDGE_STYLES[k].from===nodeId || EDGE_STYLES[k].to===nodeId) EDGE_STYLES.splice(k,1);
    }
  });
  deselect();
  return true;
}
