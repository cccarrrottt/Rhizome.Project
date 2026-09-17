/* ---------------------------------------------------------------------
   Aiming the leader.

   Choosing where a note attaches is only half of placing one; the other
   half is where the card itself stands, and until now the chart guessed
   that — a search for somewhere clear, which is a reasonable guess and
   never the reader's own answer. So the gesture has a second half: pick
   the point on the connector, then move away from it and click again, and
   the leader is drawn from the point to wherever the pointer is.

   It is the same vocabulary the connectors already use, deliberately.
   Shift snaps — there, to the quarters of the line; here, to eighths of a
   turn about the anchor, which is what makes a row of notes point the same
   way as each other. Ctrl comes off the grid, so a leader can be any
   length rather than a whole number of steps. Nothing new to learn: the
   two keys mean here what they mean everywhere else on this chart.
   ------------------------------------------------------------------ */
/* How far a callout stands off its anchor when the gesture has nothing to
   go on yet — the length the dashed aim line starts at, before the pointer
   has said otherwise. */
const CALLOUT_GAP = 34;
const LEADER_AIM_STEP = 45;      // degrees, when Shift is held
const LEADER_AIM_MIN = 16;       // never so short the card sits on the line
function leaderAimAt(ev, anchor){
  const p = clientToWorld(ev.clientX, ev.clientY);
  let dx = p.x - anchor.x, dy = p.y - anchor.y;
  let dir = Math.atan2(dy, dx) * 180 / Math.PI;
  let len = Math.hypot(dx, dy);
  if(ev.shiftKey) dir = Math.round(dir / LEADER_AIM_STEP) * LEADER_AIM_STEP;
  // Ctrl is "off the grid" here exactly as it is when dragging an entry.
  if(!(ev.ctrlKey || ev.metaKey)) len = snapToGrid(len);
  return {dir, len: Math.max(LEADER_AIM_MIN, len)};
}
function paintLeaderAim(anchor, aim, snapping){
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  const a = aim.dir * Math.PI / 180;
  const tip = {x: anchor.x + Math.cos(a)*aim.len, y: anchor.y + Math.sin(a)*aim.len};
  /* The eight directions Shift offers, drawn as guides out of the anchor —
     the same dashed hairlines an entry gets when it is carried near
     another, and for the same reason: a snap you cannot see is a snap you
     cannot aim. */
  if(snapping){
    const reach = Math.max(aim.len, CALLOUT_GAP*2) + GUIDE_OVERHANG*2;
    for(let k = 0; k < 8; k++){
      const ang = k * LEADER_AIM_STEP * Math.PI / 180;
      el('line', {class:'align-guide', x1:anchor.x.toFixed(2), y1:anchor.y.toFixed(2),
                  x2:(anchor.x + Math.cos(ang)*reach).toFixed(2),
                  y2:(anchor.y + Math.sin(ang)*reach).toFixed(2)}, leaderPickLayer);
    }
  }
  el('circle', {class:'leader-ghost', cx:anchor.x.toFixed(2), cy:anchor.y.toFixed(2), r:5},
     leaderPickLayer);
  el('line', {class:'leader-aim', x1:anchor.x.toFixed(2), y1:anchor.y.toFixed(2),
              x2:tip.x.toFixed(2), y2:tip.y.toFixed(2)}, leaderPickLayer);
  el('circle', {class:'leader-aim-tip', cx:tip.x.toFixed(2), cy:tip.y.toFixed(2), r:3.4},
     leaderPickLayer);
}
svg.addEventListener('mousemove', ev=>{
  if(!leaderPick) return;
  if(leaderPick.phase === 'aim'){
    leaderPick.aim = leaderAimAt(ev, leaderPick.anchor);
    document.body.classList.toggle('leader-snapping', ev.shiftKey);
    paintLeaderAim(leaderPick.anchor, leaderPick.aim, ev.shiftKey);
    return;
  }
  document.body.classList.toggle('leader-snapping', ev.shiftKey);
  paintLeaderGhost(leaderFractionAt(ev));
});
/* A press is not the whole of a click.
 *
 * Swallowing the mousedown stops the chart panning, but the CLICK that
 * follows is a separate event with its own listeners — and the first thing
 * a reader clicks while placing a leader is the connector itself, whose
 * click handler opens that connector's settings again. Opening them syncs
 * the form back to what is STORED, which is not a leader note yet, and
 * syncing ends the picking. So the gesture died on its first step:
 * choosing a point looked like it did nothing at all, and no leader note
 * could be made. The click is swallowed too. */
/* Set on the press, and it has to expire.
 *
 * As a plain boolean it waited for a click that might never come — a press
 * that ends outside the drawing, a gesture cancelled with Escape, a
 * pointer that leaves the window — and the flag then sat there until the
 * reader clicked something else entirely, at which point that click was
 * swallowed instead. One click, silently ignored, some indefinite time
 * after the thing that armed it: as hard a fault to reproduce as this page
 * has had. A deadline swallows the click that belongs to this press and
 * nothing else. */
const SWALLOW_WINDOW = 700;   // ms a press may claim the click that follows
let swallowUntil = 0;
/* True for the moment between placing a leader note and the click that
   placed it finishing its journey through the page. See the popover's
   outside-click closer, which must not treat that click as "elsewhere". */
let leaderJustPlaced = false;
svg.addEventListener('click', ev=>{
  if(performance.now() > swallowUntil) return;
  swallowUntil = 0;
  ev.preventDefault(); ev.stopPropagation();
}, true);
svg.addEventListener('mousedown', ev=>{
  if(!leaderPick) return;
  // Swallowed so the click does not also pan the chart or clear the
  // selection out from under the popover that started this.
  ev.preventDefault(); ev.stopPropagation();
  swallowUntil = performance.now() + SWALLOW_WINDOW;
  if(leaderPick.phase !== 'aim'){
    /* First click: the point on the line. The card does not exist yet —
       the next move draws its leader out of this point, and the click
       after that puts it down. */
    const f = leaderFractionAt(ev);
    leaderPick.phase = 'aim';
    leaderPick.at = f;
    leaderPick.snap = leaderPick.snapName || null;
    leaderPick.anchor = pointAtFraction(leaderPick.pts, f);
    leaderPick.aim = null;
    setStyleStatus('ok', 'Now click where the note should stand — Shift snaps the angle, Ctrl comes off the grid, Escape cancels.');
    paintLeaderAim(leaderPick.anchor, {dir:-90, len:CALLOUT_GAP*2}, false);
    return;
  }
  const {from, to, at, anchor, snap} = leaderPick;
  const aim = leaderPick.aim || leaderAimAt(ev, leaderPick.anchor);
  endCalloutPick();
  leaderJustPlaced = true;
  setTimeout(()=>{ leaderJustPlaced = false; }, 0);
  clearStyleStatus();
  /* The second click MAKES the callout — a new entry, standing where the
     pointer is, pointing back at the place the first click chose. Nothing
     on the connector changes, which is the whole difference: a connector
     can now carry as many of these as anybody wants, and the plate it
     wears is a separate thing that neither knows about the other. */
  const a = aim.dir * Math.PI / 180;
  const cx = anchor.x + Math.cos(a) * aim.len;
  const cy = anchor.y + Math.sin(a) * aim.len;
  addCalloutAt(from, to, at, cx, cy, snap);
}, true);
/* A new callout, centred on a point, pointing at a place on a connector.
   Created empty with its text editor open: an empty card with the caret in
   it says what happens next, which is what made picking a point feel like
   it had done something. */
const CALLOUT_DEFAULT_W = 96, CALLOUT_DEFAULT_H = 26;
function addCalloutAt(from, to, at, cx, cy, snap){
  if(readOnlyView) return null;
  const ids = new Set(workingNodes.map(it=> it[0]));
  const id = uniqueId('callout', ids);
  const opts = {pos: [Math.round(cx - CALLOUT_DEFAULT_W/2),
                      Math.round(cy - CALLOUT_DEFAULT_H/2)]};
  if(from && to) opts.leader = validSnap(snap) ? {from, to, at, snap} : {from, to, at};
  applyEdit(()=> workingNodes.push([id, '', null, null, null, 'callout', opts]));
  /* A new callout has no words yet, and the field is where they come
     from — so it opens on the card itself, as it would on a double click. */
  if(!openNodeEditor(id)) openEntrySettings(id);
  return id;
}
/* A callout is dragged like anything else on the chart.
 *
 * It used to be swung about its anchor by a special grip laid over the
 * card, because it was not an entry and had no position of its own — only
 * a direction and a distance measured from a point on a connector. Now it
 * IS an entry: it is picked up, carried, snapped to the grid, lined up
 * against its neighbours and dropped exactly the way a reality is, and its
 * leader simply follows it. One drag gesture on the whole chart. */

/* Escape gets out of it, at every stage and from either gesture.
 *
 * Nothing has been written down until the second click, so leaving is
 * simply leaving: the point chosen a moment ago was never committed and
 * no callout was ever made. */
document.addEventListener('keydown', ev=>{
  if(ev.key !== 'Escape') return;
  if(!leaderPick) return;
  ev.stopPropagation();
  endCalloutPick();
  clearStyleStatus();
}, true);

/* Closing keeps the change. There is nothing to revert on the way out any
   more: every adjustment was committed as it was made, and Ctrl+Z is the
   way back — the same way it is for everything else on the chart. */
function closeEdgePopover(){
  endCalloutPick();
  /* A note nobody wrote is not a note.
   *
   * Picking a point on the connector seeds an empty card with the caret in
   * it, so that choosing the point visibly does something — but if the
   * popover is closed with nothing written, that placeholder should go the
   * way an unwritten note anywhere else does, rather than leaving a blank
   * card pinned to the line for good. */
  if(currentEdgeStyleTarget && !readOnlyView){
    const {from, to} = currentEdgeStyleTarget;
    const kept = edgeStyleFor(from, to);
    if(kept.note && !kept.note.trim()){
      const bare = Object.assign({}, kept);
      delete bare.note; delete bare.notePos; delete bare.noteAt;
      delete bare.noteDir; delete bare.noteLen;
      setEdgeStyleOverride(from, to, bare);
      refreshSaveUI();
    }
  }
  edgePopover.classList.remove('open');
  currentEdgeStyleTarget = null;
  edgeEditUndoPushed = false;
  redrawEdges();
  applyVisibility();
  // …and come down with it, whether or not the redraw above reached them.
  drawBendHandles();
}

document.getElementById('styleClose').onclick = ()=> closeEdgePopover();
// Non-modal: no backdrop to click through, so a document-level listener
// closes the popover on any click outside it (the arrow-hit paths that
// open it already stopPropagation, so opening one never immediately
// re-triggers this on the same click).
// Capture phase, not bubble: several click handlers on the chart (nodes,
// other edges) call stopPropagation(), which would otherwise stop this
// from ever seeing those clicks. Capture-phase listeners on document run
// before a target's own handlers, so it sees every click regardless.
/* The pickers a toolbar opens are part of the popover, even though they
   are not inside it in the DOM.
 *
 * The sticker and citation pickers are positioned against the viewport, so
 * they live at the end of the body rather than inside whatever opened
 * them. Treating them as "outside" closed the connector popover the moment
 * one was opened, which cleared the edge being edited — so the insert then
 * landed in a form that no longer belonged to any connector, and the note
 * was thrown away. That is why inserting a sticker or a citation into a
 * connector's note did nothing. */
/* Everything on the page that is a MENU rather than the chart. A click in
   any of these leaves the connector's own popover open: reaching for the
   sticker picker, the management panel or the toolbar is part of working
   on the connector, not a decision to stop. Only the canvas itself — the
   entries, another connector, empty ground — puts it away. */
const MENU_SURFACES = ['#stickerPicker', '#refPicker', '.ask-overlay', '.crop-overlay',
  '.detail', '.legend', '.file-popover', '.add-popover', '.about-overlay',
  '.topbar', '.legend-add-menu', '.tag-menu', '.mini-toolbar'].join(',');
function inPopoverSatellite(target){
  return !!(target && target.closest && target.closest(MENU_SURFACES));
}
document.addEventListener('click', e=>{
  if(!edgePopover.classList.contains('open')) return;
  if(edgePopover.contains(e.target)) return;
  if(inPopoverSatellite(e.target)) return;
  /* …but a click on the chart is not "elsewhere" while the popover is
     waiting for one. Placing a leader note is a two-click gesture ON the
     drawing, started from this popover, and this listener runs before the
     chart's own — so the first click closed the popover, which cancelled
     the picking, which meant a leader note could not be made at all. */
  if(typeof leaderPick !== 'undefined' && leaderPick) return;
  /* And the click that FINISHES the gesture is not "elsewhere" either. It
     lands on the drawing, which closes the popover — and closing it drops
     a note nobody has written yet, which is exactly what the note it has
     just placed is. The reader would have seen their card appear and
     vanish in the same frame. */
  if(typeof leaderJustPlaced !== 'undefined' && leaderJustPlaced) return;
  /* A bend handle belongs to this panel as much as anything inside it.
     It is drawn on the chart because that is where a bend IS, and closing
     the panel on the click that takes hold of one removed the handle out
     from under the hand — a double-click to delete a bend never reached
     its second click, because there was nothing left to click on. */
  if(e.target && e.target.closest && e.target.closest('#bendLayer')) return;
  closeEdgePopover();
}, true);

styleDeleteBtn.onclick = ()=>{
  if(!currentEdgeStyleTarget) return;
  const {from,to} = currentEdgeStyleTarget;
  clearStyleStatus();
  if(deleteEdge(from, to)) closeEdgePopover();
};


