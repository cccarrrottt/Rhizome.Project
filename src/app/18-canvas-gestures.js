/* ---------------------------------------------------------------------
   Which entry's decorations are performing.

   A tag with an effect draws something around its entry — a weave, an
   echo, a stack of sheets — and until now those were still pictures. Still
   is right for the chart at rest: a page where a dozen things are moving
   at once is a page nobody can read, and the movement would be saying
   nothing that the picture does not already say.

   It is worth something at exactly two moments: when the pointer is on the
   entry, and while the entry is open in the panel. Both are the reader
   asking "what is this one?", and the answer each decoration gives is the
   thing it means — the echo goes out, the light crosses the weave, the
   stack streams away and dissolves.

   Driven from here rather than from the stylesheet because the decorations
   do not live inside the entry: they are in layers of their own, under the
   connectors, and no selector reaches a sibling three parents away.
   ------------------------------------------------------------------ */
let hoverLivelyId = null;
function syncTagLiveliness(){
  /* The entry whose settings are open counts as being looked at for as
     long as they are open — that is the whole of "sitting in its menu". */
  /* Selected counts, not only "settings open".
   *
     The rule was meant to be "while the reader is looking at this one",
     and the panel was taken as the sign of that — but clicking an entry
     already fades the rest of the chart around it, which is the same
     statement made louder, and the settings form is a second click past
     it. An entry that has been picked out is the one being looked at,
     whether or not its form has been opened on top. */
  const live = new Set([hoverLivelyId, selectedId].filter(Boolean));
  /* When each entry's performance began.
   *
   * The decorations live in layers that are cleared and rebuilt whenever
   * anything on the chart is redrawn — and typing in an entry's settings
   * redraws it on every keystroke. A CSS animation on a brand-new element
   * starts at its first frame, so every keystroke put every performing
   * decoration back to the beginning: an echo half-way out jumped back to
   * the box, a sheet half-way across vanished and set off again. From the
   * outside, decorations blinking while you type.
   *
   * So the START is remembered per entry, and a decoration rebuilt part-way
   * through is given a negative delay of exactly how far through it was.
   * The animation then carries on from where the old element left off and
   * nothing on screen registers that anything was replaced. */
  /* …and forgotten only after a moment of NOT being looked at.
   *
   * Letting go of a carried entry rebuilds it, and the pointer leaves the
   * old element and enters the new one within the same instant — to this
   * code, the entry stopped being looked at and started again, and every
   * performance on it went back to its first frame on every drop. A
   * performance that resumes within LIVELY_GRACE carries on from where it
   * was; one that has really been left starts afresh next time. */
  const now = performance.now();
  livelyStart.forEach((_, id)=>{
    if(live.has(id)){ livelyLeft.delete(id); return; }
    if(!livelyLeft.has(id)) livelyLeft.set(id, now);
    else if(now - livelyLeft.get(id) > LIVELY_GRACE){ livelyStart.delete(id); livelyLeft.delete(id); }
  });
  live.forEach(id=>{
    if(livelyLeft.has(id) && now - livelyLeft.get(id) > LIVELY_GRACE) livelyStart.delete(id);
    livelyLeft.delete(id);
    if(!livelyStart.has(id)) livelyStart.set(id, now);
  });
  [...auraLayer.querySelectorAll('.node-aura'),
   ...fanLayer.querySelectorAll(GROUND_PARTS)].forEach(e=>{
    const on = live.has(e.dataset.id);
    const already = e.classList.contains('tag-lively');
    e.classList.toggle('tag-lively', on);
    if(!on){ resumeAnimation(e, null, 0); return; }
    /* A performance already running is left alone.
     *
     * The delay below is the right answer for an element that is STARTING
     * — it puts a rebuilt decoration where its predecessor had got to. Set
     * again on one that is already running, it is a seek: the browser
     * re-reads the delay against the moment that animation began, and the
     * picture jumps forward by however long it had been playing. This runs
     * on every selection change and on every frame of a drag, so pressing
     * the mouse on an entry skipped its glint ahead, and carrying one made
     * the light stutter across the weave the whole way. */
    if(already) return;
    const since = performance.now() - (livelyStart.get(e.dataset.id) || performance.now());
    if(e.classList.contains('fanfic-glint') || e.classList.contains('unreleased-glint'))
      resumeAnimation(e, LIVELY_CYCLE.glint, since);
    else {
      /* The rings and the sheets each carry their own stagger in the
         stylesheet, and an inline delay replaces it — so the stagger is
         re-applied here rather than lost. Their order in the group is the
         order the stylesheet counts them in. */
      const rings = [...e.querySelectorAll('.hub-echo')];
      rings.forEach((r,i)=> resumeAnimation(r, LIVELY_CYCLE.echo, since, -i * LIVELY_CYCLE.echo / HUB_ECHOES));
      /* Which sheet a piece belongs to is written on it: a double border
         puts TWO elements at the same distance, and counting them off in
         DOM order would give the second rail its own place in the
         procession and set the two halves of one sheet travelling apart. */
      const sheets = [...e.querySelectorAll('.local-sheet')];
      sheets.forEach(r=>{
        const k = +(r.dataset.sheet || 0);
        resumeAnimation(r, LIVELY_CYCLE.sheet, since, -k * LIVELY_CYCLE.sheet / LOCAL_SHEETS);
      });
    }
  });
}
/* How long one turn of each performance takes, in milliseconds. Kept in
   step with the @keyframes durations in the stylesheet. */
const LIVELY_CYCLE = {echo: 2700, sheet: 1700, glint: 3400};
const livelyStart = new Map();     // entry id -> when its decorations woke
const livelyLeft = new Map();      // entry id -> when it stopped being looked at
const LIVELY_GRACE = 400;          // ms a performance waits to be resumed
/* `stagger` is in milliseconds, like everything else here.
 *
 * It used to be added straight to a figure in SECONDS, so a sheet that
 * should have been half a turn behind its neighbour — 850 ms — was 850
 * seconds behind it, which is exactly five hundred turns of a 1.7 s cycle:
 * no offset at all. The two sheets of a local multiverse travelled on top
 * of each other and read as one tab at a time. (The echo's rings came out
 * right only because 900 s happens not to be a whole number of 2.7 s
 * turns.) */
function resumeAnimation(elm, period, since, stagger){
  if(!elm) return;
  if(!period){ elm.style.removeProperty('animation-delay'); return; }
  const into = ((since % period) + period) % period;
  elm.style.animationDelay = (((stagger || 0) - into) / 1000).toFixed(3) + 's';
}
function applyVisibility(){
  syncTagLiveliness();
  qNodes('.node').forEach(g=>{
    const n = nodes.get(g.dataset.id);
    g.style.display = (n && nodeHidden(n)) ? 'none' : '';
  });
  // The ground and the scenery both belong to their entry and go when it does.
  [...fanLayer.querySelectorAll(GROUND_PARTS),
   ...auraLayer.querySelectorAll('.node-aura')].forEach(r=>{
    const n = nodes.get(r.dataset.id);
    r.style.display = (n && nodeHidden(n)) ? 'none' : '';
  });
  // Every piece of a connector, not only its line: the arrowheads, the ring
  // caps and the notes live in the layer above the entries, and hiding a
  // tag used to leave them behind as orphans floating over an empty chart.
  qEdges('.edge, .edge-hit, .edge-arrow, .edge-note').forEach(p=>{
    const a = nodes.get(p.dataset.from), b = nodes.get(p.dataset.to);
    const hide = (a && nodeHidden(a)) || (b && nodeHidden(b));
    p.style.display = hide ? 'none' : '';
  });
  /* A callout's leader answers to THREE entries: the two its connector
     joins, and the callout itself — hide any of them and a line pointing
     at nothing from nothing is what would be left. */
  edgeLayer.querySelectorAll('.callout-leader').forEach(g=>{
    const a = nodes.get(g.dataset.from), b = nodes.get(g.dataset.to);
    const c = nodes.get(g.dataset.id);
    const hide = (a && nodeHidden(a)) || (b && nodeHidden(b)) || (c && nodeHidden(c));
    g.style.display = hide ? 'none' : '';
  });
}

/* ---------------------------------------------------------------------
   Pan / zoom
   ------------------------------------------------------------------ */
let vx=0, vy=0, vs=1;
let dragging=false, dragStart=null;

function computeBounds(){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  nodes.forEach(n=>{
    minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
    maxX=Math.max(maxX,n.x+n.w); maxY=Math.max(maxY,n.y+n.h);
  });
  return {minX,minY,maxX,maxY};
}
/* Deliberately NOT cached.
 *
 * This used to be `const bounds = computeBounds()`, evaluated once while
 * the file loaded, and fitToView() read it forever after. So "zoom to fit"
 * fitted the chart as it was when the page opened: every entry added,
 * deleted or dragged since was outside the frame it computed, and on a
 * chart that had been worked on for a while the button simply pointed the
 * camera at empty space. Bounds are cheap — one pass over the entries —
 * and the only caller runs on a click, so there is nothing to cache. */

function applyTransform(){
  viewport.setAttribute('transform',`translate(${vx},${vy}) scale(${vs})`);
  if(typeof syncAlignGrid === 'function') syncAlignGrid();
  // The bio card is an HTML overlay in screen space, so it has to be
  // re-anchored whenever the drawing moves under it.
  if(typeof positionBioCard === 'function') positionBioCard();
  if(typeof positionSwapButton === 'function') positionSwapButton();
  /* The in-node field stands on its entry, so it moves with the drawing.
     Its type is scaled by the zoom as well, which is what keeps what is
     being typed the same size as what it will be. */
  if(typeof nodeEditorTarget !== 'undefined' && nodeEditorTarget){
    syncNodeEditorLook();
    positionNodeEditor();
  }
  document.getElementById('coord').textContent =
    `x${Math.round(-vx/vs)} · y${Math.round(-vy/vs)} · z${vs.toFixed(2)}`;
}

function fitToView(padding){
  padding = padding||60;
  const rect = svg.getBoundingClientRect();
  const bounds = computeBounds();
  if(!Number.isFinite(bounds.minX)) return;   // nothing to fit
  const w = Math.max(1, bounds.maxX-bounds.minX), h = Math.max(1, bounds.maxY-bounds.minY);
  const sx = (rect.width-padding*2)/w, sy=(rect.height-padding*2)/h;
  vs = Math.min(sx,sy, 1);
  vx = -bounds.minX*vs + padding;
  vy = -bounds.minY*vs + padding;
  applyTransform();
}


function flyToNode(id){
  const n = nodes.get(id);
  if(!n) return;
  const rect = svg.getBoundingClientRect();
  vs = Math.max(vs, 0.85);
  vx = -(n.x+n.w/2)*vs + rect.width/2;
  vy = -(n.y+n.h/2)*vs + rect.height/2;
  applyTransform();
}

/* Dragging the empty canvas either pans it or draws a selection box. Held
   plainly it pans, as it always has; held with Shift (or started on the
   canvas with Ctrl/Cmd down) it rubber-bands a rectangle and selects every
   node that ends up inside it. Keeping pan as the unmodified gesture
   matters — panning is what you do constantly, selecting is occasional. */
let marqueeState = null;
let suppressCanvasClick = false;
const marqueeRect = el('rect', {class:'marquee', style:'display:none;'}, viewport);

svg.addEventListener('mousedown', ()=>{ keyboardOnChart = true; }, true);
svg.addEventListener('mousedown', e=>{
  if(e.target.closest('.node')) return;
  if(e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey) && !readOnlyView){
    const w = clientToWorld(e.clientX, e.clientY);
    marqueeState = { x0: w.x, y0: w.y, additive: e.ctrlKey || e.metaKey };
    marqueeRect.style.display = '';
    marqueeRect.setAttribute('x', w.x);
    marqueeRect.setAttribute('y', w.y);
    marqueeRect.setAttribute('width', 0);
    marqueeRect.setAttribute('height', 0);
    e.preventDefault();
    return;
  }
  dragging = true; dragStart = {x:e.clientX,y:e.clientY,vx,vy};
  /* A pan is a pan, not the start of a text selection. Without this the
     browser began selecting the moment the pointer moved, and a pan that
     wandered over a panel painted its words in selection blue. */
  e.preventDefault();
  svg.classList.add('grabbing');
});

window.addEventListener('mousemove', e=>{
  if(!marqueeState) return;
  const w = clientToWorld(e.clientX, e.clientY);
  const x = Math.min(marqueeState.x0, w.x), y = Math.min(marqueeState.y0, w.y);
  const width = Math.abs(w.x - marqueeState.x0), height = Math.abs(w.y - marqueeState.y0);
  marqueeRect.setAttribute('x', x);
  marqueeRect.setAttribute('y', y);
  marqueeRect.setAttribute('width', width);
  marqueeRect.setAttribute('height', height);
  marqueeRect.setAttribute('stroke-width', 1/vs);
  marqueeState.box = {x, y, width, height};
});

window.addEventListener('mouseup', ()=>{
  const st = marqueeState;
  marqueeState = null;
  if(!st) return;
  marqueeRect.style.display = 'none';
  const box = st.box;
  // A click with no drag behind it is not a selection gesture.
  if(!box || (box.width < 3 && box.height < 3)) return;
  suppressCanvasClick = true;
  setTimeout(()=>{ suppressCanvasClick = false; }, 0);
  const hits = [];
  nodes.forEach(n=>{
    if(nodeHidden(n)) return;
    // Anything the box touches counts, not only what it fully contains —
    // matching how a lasso reads to the hand.
    if(n.x < box.x + box.width && n.x + n.w > box.x &&
       n.y < box.y + box.height && n.y + n.h > box.y) hits.push(n.id);
  });
  if(!hits.length){ if(!st.additive) deselect(); return; }
  if(st.additive) hits.forEach(id=> multiSelection.add(id));
  setSelection(st.additive ? Array.from(multiSelection) : hits, hits[0]);
});
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  vx = dragStart.vx + (e.clientX-dragStart.x);
  vy = dragStart.vy + (e.clientY-dragStart.y);
  applyTransform();
});
window.addEventListener('mouseup', ()=>{ dragging=false; svg.classList.remove('grabbing'); });

svg.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect = svg.getBoundingClientRect();
  const mx = e.clientX-rect.left, my = e.clientY-rect.top;
  const factor = Math.exp(-e.deltaY*0.0016);
  const newScale = Math.min(3, Math.max(0.08, vs*factor));
  const wx = (mx - vx)/vs, wy=(my-vy)/vs;
  vx = mx - wx*newScale; vy = my - wy*newScale;
  vs = newScale;
  applyTransform();
},{passive:false});

// touch support (basic pinch + pan)
let touchState=null;
svg.addEventListener('touchstart', e=>{
  if(e.touches.length===1){
    touchState={mode:'pan',x:e.touches[0].clientX,y:e.touches[0].clientY,vx,vy};
  } else if(e.touches.length===2){
    const [a,b]=e.touches;
    touchState={mode:'pinch',d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),vs,
      cx:(a.clientX+b.clientX)/2, cy:(a.clientY+b.clientY)/2, vx,vy};
  }
},{passive:true});
svg.addEventListener('touchmove', e=>{
  if(!touchState) return;
  if(touchState.mode==='pan' && e.touches.length===1){
    vx = touchState.vx + (e.touches[0].clientX-touchState.x);
    vy = touchState.vy + (e.touches[0].clientY-touchState.y);
    applyTransform();
  } else if(touchState.mode==='pinch' && e.touches.length===2){
    const [a,b]=e.touches;
    const d = Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    const factor = d/touchState.d;
    vs = Math.min(3,Math.max(0.08, touchState.vs*factor));
    applyTransform();
  }
},{passive:true});

// The alignment grid is a way of looking at the chart, not a change to it:
// it belongs to this reader, is remembered for them alone, and is offered
// to everyone including read-only viewers.
document.getElementById('gridToggle').onclick = ()=> setAlignGrid(!alignGridOn);
setAlignGrid(alignGridOn);

/* Light or dark ground, the reader's choice, remembered in this browser.
   Only a convenience: a page that cannot store it opens light, which is
   how every copy of this chart opened before the button existed. */
const THEME_KEY = 'rhizome.theme';
function setTheme(dark){
  const root = document.documentElement;
  if(dark) root.setAttribute('data-theme', 'dark');
  else root.setAttribute('data-theme', 'light');
  try{ localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); }catch(e){}
  const btn = document.getElementById('themeToggle');
  if(btn){
    btn.classList.toggle('active', !!dark);
    btn.title = dark ? 'Light background' : 'Dark background';
  }
}
function themeIsDark(){ return document.documentElement.getAttribute('data-theme') === 'dark'; }
{
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  setTheme(saved === 'dark');
  const btn = document.getElementById('themeToggle');
  if(btn) btn.onclick = ()=> setTheme(!themeIsDark());
}

document.getElementById('zoomIn').onclick = ()=>{ vs=Math.min(3,vs*1.25); applyTransform(); };
document.getElementById('zoomOut').onclick = ()=>{ vs=Math.max(0.08,vs*0.8); applyTransform(); };
document.getElementById('zoomReset').onclick = ()=> fitToView();

/* ---------------------------------------------------------------------
   Dragging nodes.

   Every node's shapes and text are drawn at absolute world coordinates, so
   moving one during a drag is a translate() on its <g> rather than a
   re-render — cheap enough to redraw all the edges on every mousemove, so
   the connectors follow the node live. n.x/n.y are kept in step with the
   translate the whole time, which is what lets routeEdge() see the new
   position without knowing a drag is happening at all.

   Position snaps to the GRID set up next to the layout engine. The ruled
   grid is shown only when the reader has switched it on; a drag does not
   put it up by itself. On release the new spot is written to the
   node's saved entry as opts.pos, which this page re-reads on reload.
   ------------------------------------------------------------------ */
// `var`: the merge's arithmetic asks which entries are in the hand (see
// entryBeingCarried), and it runs on the first draw, before this line has.
var nodeDragState = null;
function entryBeingCarried(id){
  const st = nodeDragState;
  return !!(st && st.moved && st.members.some(m=> m.id === id));
}
let suppressNodeClick = false;
/* How long a single click waits to see whether it is really half of a
   double one. Comfortably under the ~500ms a system double-click allows,
   and short enough that a genuine single click still feels immediate. */
const DOUBLE_CLICK_GRACE = 220;
let nodeClickTimer = null;
// Declared up here, not with the rest of the bio-card code far below,
// because applyTransform() re-anchors the card on every viewport change —
// including the initial fitToView(), which runs before that code does.
let bioCardNodeId = null;
// A clicked card stays put; a hovered one comes and goes with the pointer.
let bioCardPinned = false;
let bioHoverTimer = null;
const DRAG_THRESHOLD = 4; // px of pointer travel before a click becomes a drag

/* The ruling that appears while you drag is the alignment grid itself,
   simply switched on for the duration. It used to be a second, hand-drawn
   grid with its own spacing and weight, so the lines you lined an entry up
   against while dragging were not the lines you saw when the grid was on —
   two different rulings for one snap. Sharing the real one removes the
   discrepancy by construction: there is only ever one grid. */
/* Ctrl (or Cmd) is the off-grid modifier. Shift used to be, and was moved
   because Shift is now "put it back on the grid" — the two are opposites
   and wanted to be different keys. */
function dragIsFree(e){ return !!(e.ctrlKey || e.metaKey); }
/* How far a NEW amalgam is placed from its lineages — see bringAmalgamHome.
 *
 * It used to be a leash as well, and a leash of two kinds. One held the
 * entry within a fixed DISTANCE of its furthest lineage, by pulling it
 * back along the line between them — so pushing further actually dragged
 * the entry closer, shortening the very stem it was meant to protect. That
 * one is gone: the bar hangs from the lineages and stays where they are,
 * and the merged arrow simply reaches further.
 *
 * The other held the entry between the bar's own ENDS, and that one is
 * right and stays. The merged arrow leaves from a point on the bar and
 * runs to the entry, so an entry taken past the last lineage has no bar
 * left to leave from: the arrow stops being a stem dropping out of the
 * merge and becomes a long diagonal running away from it, which is not a
 * shape anything else on this chart draws. Perpendicular to the bar the
 * entry goes as far as it likes. */
const AMALGAM_LEASH = 520;
function amalgamBarClamp(st, offX, offY){
  let out = null;
  if(!st || !st.members) return null;
  st.members.forEach(m=>{
    const n = m.node;
    if(!n || (n.shape||'') !== 'amalgam') return;
    const parents = (n.parents || []).map(id=> nodes.get(id))
      .filter(p=> p && !st.members.some(o=> o.id === p.id));
    // One lineage is an ordinary connector with no bar to stay on.
    if(parents.length < 2) return;
    const homeX = m.originX + n.w/2, homeY = m.originY + n.h/2;
    let cx = homeX + offX, cy = homeY + offY;
    let held = false;
    const cxs = parents.map(p=> p.x + p.w/2);
    const cys = parents.map(p=> p.y + p.h/2);
    const spanX = Math.max(...cxs) - Math.min(...cxs);
    const spanY = Math.max(...cys) - Math.min(...cys);
    // The bar runs along whichever axis the lineages are spread out on.
    if(spanX >= spanY){
      const held2 = Math.max(Math.min(...cxs), Math.min(Math.max(...cxs), cx));
      if(held2 !== cx){ cx = held2; held = true; }
    } else {
      const held2 = Math.max(Math.min(...cys), Math.min(Math.max(...cys), cy));
      if(held2 !== cy){ cy = held2; held = true; }
    }
    if(held) out = {x: cx - homeX, y: cy - homeY};
  });
  /* And a LINEAGE stays on its own side of the bar.
   *
   * The bar hangs a fixed clearance short of the nearest parent, and may not
   * be pushed inside the entry it feeds — so once a parent is dragged close
   * enough, the bar stops retreating and the parent walks straight through
   * it and out the other side. What that leaves is a lineage that has to
   * come back the way it went: out of the box on the far side, round, and
   * onto a bar now standing between it and its own entry. On the chart it
   * reads as a connector that has lost its mind, and there is no position
   * past the bar that is ever the one somebody wanted.
   *
   * So the parent stops where the bar would: the same two clearances the
   * geometry already uses, measured between the entry's facing edge and the
   * parent's. Which side the parents are on is taken from where the drag
   * STARTED, so a hand that keeps pushing cannot flip the whole merge
   * inside out by crossing the line in one frame. */
  st.members.forEach(m=>{
    const p = m.node;
    if(!p || (p.shape||'') === 'amalgam') return;
    nodes.forEach(b=>{
      if((b.shape||'') !== 'amalgam') return;
      if(!(b.parents || []).includes(p.id)) return;
      // A merge being carried along with its lineage keeps its own shape.
      if(st.members.some(o=> o.id === b.id)) return;
      const bar = amalgamBars.get(b.id);
      if(!bar) return;
      const vertical = bar.axis === 'x';      // the bar runs along x
      const pc0 = vertical ? m.originY + p.h/2 : m.originX + p.w/2;
      const bc  = vertical ? b.y + b.h/2 : b.x + b.w/2;
      const dir = pc0 >= bc ? 1 : -1;         // which side the lineage is on
      const clear = AMALGAM_GAP + AMALGAM_LEAD;
      const entryEdge = vertical ? (dir > 0 ? b.y + b.h : b.y)
                                 : (dir > 0 ? b.x + b.w : b.x);
      const origin = vertical ? m.originY : m.originX;
      const size   = vertical ? p.h : p.w;
      const want   = origin + (vertical ? offY : offX);
      const facing = dir > 0 ? want : want + size;      // the edge facing the entry
      const limit  = entryEdge + dir * clear;
      if(dir * (facing - limit) >= 0) return;           // still clear
      const shift = limit - facing;
      const base = out || {x: offX, y: offY};
      out = vertical ? {x: base.x, y: base.y + shift}
                     : {x: base.x + shift, y: base.y};
    });
  });
  return out;
}

/* Where a carried callout's leader is pinned, in chart coordinates.
 *
 * Only for a callout carried ALONE: a group drag is a group drag, and one
 * member swinging about a point of its own while the rest translate would
 * pull the set apart. Read from the leader as it is currently drawn, so
 * the card swings about the dot the reader can see rather than about a
 * fraction recomputed from a route that is being redrawn under them. */
function calloutDragAnchor(st){
  if(!st || !st.node || st.members.length !== 1) return null;
  const n = st.node;
  if(!isCalloutNode(n) || !n.leader) return null;
  const dot = edgeLayer.querySelector(
    `.callout-leader[data-id="${CSS.escape(n.id)}"] .leader-dot`);
  if(!dot) return null;
  return {x: +dot.getAttribute('cx'), y: +dot.getAttribute('cy')};
}
function beginNodeDrag(ev, n, g){
  if(ev.button !== 0 || readOnlyView) return;
  // The chips and link badge riding on the node are their own controls.
  if(ev.target.closest('.lang-chip, a, .node-handle, .node-resize')) return;
  ev.stopPropagation();   // don't let the canvas start a pan underneath
  // …nor the browser start selecting text as the entry is carried about.
  ev.preventDefault();
  // Dragging any member of a multi-selection moves the whole set, keeping
  // their relative positions.
  const group = (multiSelection.size > 1 && multiSelection.has(n.id))
    ? Array.from(multiSelection)
    : [n.id];
  /* Where in the card the press landed, so a swung callout keeps that
     point under the pointer instead of snapping its middle to it. */
  const grabAt = clientToWorld(ev.clientX, ev.clientY);
  nodeDragState = {
    node: n, g,
    startClientX: ev.clientX, startClientY: ev.clientY,
    grabDX: (n.x + n.w/2) - grabAt.x,
    grabDY: (n.y + n.h/2) - grabAt.y,
    originX: n.x, originY: n.y,
    members: group.map(id=>{
      const m = nodes.get(id);
      return { id, node: m, g: qNode(`.node[data-id="${CSS.escape(id)}"]`),
               // The scenery behind an entry — a hub's echo, a stack's back
               // sheets — lives in its own layer and has to travel too.
               aura: auraLayer.querySelector(`.node-aura[data-id="${CSS.escape(id)}"]`),
               /* …and so does the fan-fiction weave, which is in a layer
                  below even that one. It was left behind for the whole of
                  every drag and only caught up when the entry was dropped:
                  the entry slid out of its own patch. */
               fan: [...fanLayer.querySelectorAll(
                       GROUND_PARTS.split(', ')
                         .map(sel=> `${sel}[data-id="${CSS.escape(id)}"]`).join(', '))],
               originX: m.x, originY: m.y };
    }),
    /* The hand-set bends of every connector the group carries whole.
     *
     * A bend is stored in chart coordinates, not relative to anything, so
     * when a lasso's worth of entries was moved the connectors between them
     * were re-drawn out of their new ports and back through the OLD points —
     * the one part of the arrangement that stayed behind, pulling each line
     * into a new shape. A connector with both ends in the group belongs to
     * the group and travels with it; one with a single end in it keeps its
     * bends, because they are what the reader fixed and the other end has
     * not moved. */
    /* A parent carried alone keeps to its own stretch of its bar; see
       barLeashFor. */
    barLeash: group.length === 1 ? barLeashFor(n.id, {x: n.x + n.w/2, y: n.y + n.h/2}) : [],
    bendCarry: EDGE_STYLES
      .filter(o=> Array.isArray(o.bends) && o.bends.length &&
                  group.includes(o.from) && group.includes(o.to))
      .map(o=> ({style: o, bends: o.bends.map(b=> [b[0], b[1]])})),
    moved: false
  };
}
function carryBends(st, offX, offY){
  if(!st.bendCarry || !st.bendCarry.length) return;
  st.bendCarry.forEach(c=>{
    c.style.bends = c.bends.map(b=> [+(b[0] + offX).toFixed(2), +(b[1] + offY).toFixed(2)]);
  });
}

window.addEventListener('mousemove', e=>{
  if(!nodeDragState) return;
  const st = nodeDragState;
  const dxScreen = e.clientX - st.startClientX, dyScreen = e.clientY - st.startClientY;
  if(!st.moved && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
  if(!st.moved){
    st.moved = true;
    st.g.classList.add('dragging');
    /* Before anything is touched: see applyEdit's `before`. The carried
       bends change the data live, and so does every callout and note
       re-anchored as the connectors re-route under the drag — a snapshot
       taken at the drop already held all of that, and undoing the move
       left it behind. */
    st.before = takeSnapshot();
  }
  /* Screen pixels -> world units: undo the viewport scale (translation
     cancels out in a delta). The snap is applied to the DRAGGED node and
     the same whole-number offset given to the rest, so a group keeps its
     internal spacing exactly instead of each member snapping separately.

     Three ways to place an entry:

     Ctrl lifts it off the grid entirely. The grid keeps a hand-arranged
     chart tidy, but it makes some things impossible: two connected entries
     of different heights have their ports at whatever offset their sizes
     give them, and if that offset is not a whole number of grid steps no
     amount of snapped dragging will ever line them up. Ctrl is the way out.

     Plain dragging snaps the MOVEMENT, not the position. This is the fix
     for the thing that made Ctrl nearly useless: lining two entries up and
     then nudging one anywhere else used to re-snap it to absolute grid
     coordinates, throwing the alignment away. Snapping the delta instead
     moves in tidy grid steps while carrying whatever fine offset the entry
     already has, so an alignment survives every later move.

     Shift is how you deliberately give that offset up — it snaps the
     position itself, putting the entry back on the grid proper. */
  /* A callout is carried about its ANCHOR, not about the ruled grid.
   *
     What a reader adjusts on a callout is which way it stands off the
     place it points at and how far — that is the whole of its position,
     and it is the pair the placing gesture asked for in the first place.
     So the same two keys mean here what they meant there: Shift snaps the
     ANGLE to eighths of a turn and draws the eight rays it is snapping to,
     Ctrl comes off the grid, and a plain carry snaps the distance. The
     entry-to-entry alignment guides are not offered at all: lining a
     comment card up with the edge of some unrelated box says nothing, and
     it was taking the card off the ray it had been aimed along. */
  const anchor = calloutDragAnchor(st);
  if(anchor){
    const p = clientToWorld(e.clientX, e.clientY);
    const half = {x: st.node.w/2, y: st.node.h/2};
    let dir = Math.atan2((p.y + st.grabDY) - anchor.y, (p.x + st.grabDX) - anchor.x) * 180/Math.PI;
    let len = Math.hypot((p.x + st.grabDX) - anchor.x, (p.y + st.grabDY) - anchor.y);
    if(e.shiftKey) dir = Math.round(dir / LEADER_AIM_STEP) * LEADER_AIM_STEP;
    if(!dragIsFree(e)) len = snapToGrid(len);
    len = Math.max(LEADER_AIM_MIN, len);
    const a = dir * Math.PI / 180;
    const cx = anchor.x + Math.cos(a) * len, cy = anchor.y + Math.sin(a) * len;
    /* To the hundredth, not to the whole pixel.
     *
       A card swung about its anchor is placed by arithmetic — an angle and
       a distance — and a port rarely lands on a whole pixel, so rounding
       the card's corner to one moved its CENTRE up to half a pixel
       sideways. The leader is drawn to that centre, so an angle the reader
       had just snapped to exactly ninety degrees came out at 89.9, every
       time; on a merge, where the bar's ports sit on halves, it came out
       wrong at every snap. The same reasoning as the release of an anchor
       drag, which already keeps two decimals for exactly this. */
    const px2 = (v)=> Math.round(v * 100) / 100;
    const dOffX = px2(cx - half.x) - st.originX;
    const dOffY = px2(cy - half.y) - st.originY;
    clearGuides();
    document.body.classList.toggle('leader-snapping', !!e.shiftKey);
    if(e.shiftKey) paintLeaderAim(anchor, {dir, len}, true);
    else while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
    st.members.forEach(m=>{
      m.node.x = m.originX + dOffX;
      m.node.y = m.originY + dOffY;
      if(m.g) m.g.setAttribute('transform',
        `translate(${dOffX},${dOffY}) ${m.g.dataset.rotTransform || ''}`.trim());
      if(m.aura) m.aura.setAttribute('transform', `translate(${dOffX},${dOffY})`);
      (m.fan || []).forEach(f=> f.setAttribute('transform', `translate(${dOffX},${dOffY})`));
    });
    queueDragRedraw(st);
    return;
  }
  const free = dragIsFree(e);
  const rawX = st.originX + dxScreen/vs, rawY = st.originY + dyScreen/vs;
  const placedX = free ? Math.round(rawX)
    : e.shiftKey ? snapToGrid(rawX)
    : st.originX + snapToGrid(rawX - st.originX);
  const placedY = free ? Math.round(rawY)
    : e.shiftKey ? snapToGrid(rawY)
    : st.originY + snapToGrid(rawY - st.originY);
  let offX = placedX - st.originX, offY = placedY - st.originY;
  /* An amalgam cannot be dragged off the end of its own bar.
   *
   * The bar stands a bounded distance in front of the entry, so past that
   * distance the entry stops taking its lineages with it and the merged
   * arrow just gets longer and longer across the chart. Rather than draw
   * that, the drag stops: the entry may go as far as the bar can follow
   * and no further, which is a limit the shape itself imposes. */
  /* Guides first, then the leash. An alignment is an offer; the leash is a
     limit the shape imposes, and a limit outranks an offer. */
  /* And the guides are asked for, not volunteered.
   *
     A guide that appears by itself takes the entry a few pixels off where
     the hand put it, which is right when lining things up and wrong the
     rest of the time — and there is no way to tell which from the drag
     alone. Held Shift says "line this up", the same key that already means
     "put this back on the ruled grid": both are the reader asking for a
     tidy position rather than the exact one under the pointer, and the
     guide is the more specific of the two, so it wins where it applies. */
  /* Judged from where the HAND is, not from the grid.
   *
     Shift also puts the entry back on the ruled grid, and the guides used
     to be offered from that snapped position — so the entry could only
     ever stand on a multiple of ten when the alignments were weighed. Two
     boxes of different heights have their middles on a half-step between
     those, which the grid can never reach, while an edge-to-edge match sat
     right on a grid line: centring one entry on another was simply not on
     offer, and the guide that did appear was for the tops or the bottoms.
     The alignments are weighed at the pointer; an axis that finds one
     takes it, and an axis that finds none keeps the grid. */
  if(e.shiftKey && !free){
    const g = alignGuides(st, rawX - st.originX, rawY - st.originY, free);
    if(g.hitX) offX = g.x;
    if(g.hitY) offY = g.y;
  } else clearGuides();
  /* A merge's entry stays between its bar's ends — see amalgamBarClamp.
     Guides are an offer; this is a limit the shape imposes, and a limit
     outranks an offer. */
  const barHeld = amalgamBarClamp(st, offX, offY);
  if(barHeld){ offX = barHeld.x; offY = barHeld.y; clearGuides(); }
  const leashed = applyBarLeash(st, offX, offY);
  if(leashed){ offX = leashed.x; offY = leashed.y; }
  carryBends(st, offX, offY);
  st.members.forEach(m=>{
    m.node.x = m.originX + offX;
    m.node.y = m.originY + offY;
    // Compose with the element's own rotation rather than replacing it.
    if(m.g) m.g.setAttribute('transform',
      `translate(${offX},${offY}) ${m.g.dataset.rotTransform || ''}`.trim());
    if(m.aura) m.aura.setAttribute('transform', `translate(${offX},${offY})`);
    (m.fan || []).forEach(f=> f.setAttribute('transform', `translate(${offX},${offY})`));
  });
  /* The entries themselves move on every pointer event — that is a
     transform on a handful of groups and costs nothing. The CONNECTORS are
     rebuilt from nothing, every one of them re-routed around every other,
     and that is by far the most expensive thing this application does: at
     a few hundred entries a pointer stream at 120Hz asks for it twice per
     frame and the drag turns to treacle. Once per frame is all a drag can
     show, so that is how often it is done. */
  queueDragRedraw(st);
});
let dragRedrawFrame = 0;
function queueDragRedraw(st){
  if(dragRedrawFrame) return;
  dragRedrawFrame = requestAnimationFrame(()=>{
    dragRedrawFrame = 0;
    // Where the carried entries stood when these routes were drawn; see
    // connectorAlignments, which has to allow for the pointer being ahead.
    if(st && st.node) st.drawnOff = {x: st.node.x - st.originX, y: st.node.y - st.originY};
    redrawEdges();
    applyVisibility();
    /* Every connector has just been rebuilt from nothing, so none of them
       remembers being faded — and the highlight is what says which of them
       belong to the entry being looked at. Without putting it back, picking
       an entry up lit the whole chart for as long as the mouse was down and
       let it settle again the moment it was released. */
    if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
    paintMultiSelection();
    // A portrait's card is anchored beside its circle, so it has to travel
    // with it. Without this it sat where the circle used to be until the
    // mouse came up, and then jumped. Any card at all, since a portrait
    // asked to keep one open has it whether or not it is the one hovered.
    if(st.members.some(m=>{
         const n = m.node;
         return n && ((m.id === bioCardNodeId) || ((n.shape || '') === 'ellipse' && n.bioCard));
       })) drawBioCard();
  });
}

window.addEventListener('mouseup', ()=>{
  const st = nodeDragState;
  nodeDragState = null;
  if(!st) return;
  // A frame still owing from the drag would draw over what settling the
  // drag is about to draw, from a state that no longer exists.
  if(dragRedrawFrame){
    cancelAnimationFrame(dragRedrawFrame); dragRedrawFrame = 0;
    /* But the drawing it owed is what tells the callouts on these
       connectors where their anchors ended up, and that has to be written
       down before the chart is rebuilt from the entries — a rebuild starts
       the anchors again from what the entries say. So the frame is not
       dropped, it is taken now. */
    if(st.moved) redrawEdges();
  }
  st.g.classList.remove('dragging');
  clearGuides();
  // The rays a swung callout was snapping to go with the gesture.
  document.body.classList.remove('leader-snapping');
  while(leaderPickLayer.firstChild) leaderPickLayer.removeChild(leaderPickLayer.firstChild);
  if(!st.moved) return;
  // The browser fires a click right after this mouseup, which would
  // otherwise re-select the node you just dropped. The flag is cleared on
  // the next tick rather than by that click, because a drag doesn't always
  // produce one — and a flag left standing would silently swallow the next
  // real click on any node.
  suppressNodeClick = true;
  setTimeout(()=>{ suppressNodeClick = false; }, 0);
  if(st.node.x===st.originX && st.node.y===st.originY){
    // Snapped back to where it started — and the bends with it.
    carryBends(st, 0, 0);
    return;
  }
  /* Any bend these entries' connectors no longer need goes with the drop;
     see pruneHandBends. Settled against the drawing just made, and inside
     the same step of undo as the move itself. */
  const ids = new Set(st.members.map(m=> m.id));
  redrawEdges();
  pruneHandBends(structEdges.filter(e=> ids.has(e.from) || ids.has(e.to))
                            .map(e=> ({from: e.from, to: e.to})));
  saveNodePositions(st.members.map(m=>({id:m.id, x:m.node.x, y:m.node.y})), st.before);
});

// Writes the dropped position into the node's saved entry. Deliberately
// quiet on success — the page reloads itself after a publish, and a node
// snapping into place is its own confirmation; only failures speak up.
// One undo step for the whole move, however many nodes it covered.
function saveNodePositions(list, before){
  applyEdit(()=>{
    list.forEach(({id, x, y})=>{
      const found = workingEntry(id);
      if(!found) return;
      const opts = entryOpts(found.entry);
      // Back into the co-ordinate opts.pos is written in: the top of a
      // default-height box, not the top of this one. Without this the
      // entry climbed by half its extra height on every single drop.
      const n = nodes.get(id);
      /* Two decimals. Every ordinary drag hands whole numbers in and gets
         them back unchanged; a callout swung about its anchor does not,
         and rounding its corner here would put back exactly the half-pixel
         tilt the drag was careful not to introduce. */
      opts.pos = [+(+x).toFixed(2), +(y + ((n && n.growShift) || 0)).toFixed(2)];
      putEntry(found.index, found.entry, opts);
    });
  }, before);
}

/* ---------------------------------------------------------------------
   Drawing a connector by dragging between side handles.

   Grab the handle on the side a connector should leave from, drag to the
   side of another node it should arrive at, let go. Both chosen sides are
   saved with the edge, so the connector keeps entering and leaving where
   you put it instead of being re-guessed from the geometry — and because
   ports are spaced by fraction of the side, any number of connectors can
   share the one you pick.

   The click-two-nodes connect mode in the toolbar still exists and still
   leaves both sides on Auto; this is the precise version of the same act.
   ------------------------------------------------------------------ */
let connectorDragState = null;
const rubberBand = el('path', {class:'connector-rubber', style:'display:none;'}, viewport);

// Pointer position in world (pre-transform) coordinates.
function clientToWorld(clientX, clientY){
  const rect = svg.getBoundingClientRect();
  return { x: (clientX - rect.left - vx)/vs, y: (clientY - rect.top - vy)/vs };
}
// Which side of a box a point is closest to — how a drop decides where the
// arrow lands when it wasn't released exactly on one of the handles.
function nearestSide(n, wx, wy){
  const d = {
    left:   Math.abs(wx - n.x),
    right:  Math.abs(wx - (n.x + n.w)),
    top:    Math.abs(wy - n.y),
    bottom: Math.abs(wy - (n.y + n.h))
  };
  return SIDES.reduce((best,s)=> d[s] < d[best] ? s : best, 'top');
}

/* Resizing a box. Like dragging, this updates the live record and redraws
   as you go, then writes opts.size once on release — so the connectors
   re-route around the new shape while you're still holding the mouse. */
let nodeResizeState = null;
function beginNodeResize(ev, n, g, corner){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation();
  ev.preventDefault();
  nodeResizeState = {
    node: n, g,
    // Which corner is being pulled, as a pair of signs: which way this
    // corner has to move for the box to get bigger. The corner diagonally
    // opposite is the one that stays where it is.
    corner: corner || {key:'se', sx:1, sy:1},
    startClientX: ev.clientX, startClientY: ev.clientY,
    // The shift the entry is currently drawn with. Giving it a fixed size
    // takes that shift away, so the stored position has to lose it too or
    // the box drops by exactly that much the moment you resize it.
    growShift: n.growShift || 0,
    originX: n.x, originY: n.y,
    originW: n.w, originH: n.h, moved: false
  };
}
window.addEventListener('mousemove', e=>{
  if(!nodeResizeState) return;
  const st = nodeResizeState;
  const dx = (e.clientX - st.startClientX)/vs, dy = (e.clientY - st.startClientY)/vs;
  if(!st.moved && Math.hypot(dx*vs, dy*vs) < DRAG_THRESHOLD) return;
  st.moved = true;
  const c = st.corner;
  /* The floor is the one an auto-sized box settles to, not the one a NEW
     box is created at.
   *
     An entry with nothing written in it closes onto its own (absent) ink
     and comes out 52 by 24. Clamped to the creation size instead, the very
     first pixel of a corner drag jumped it to 84 by 40 — pulling the
     corner INWARD made the box suddenly bigger, which is the opposite of
     what the hand just did. The two floors are different on purpose (see
     NODE_FIT_MINW): one is how big a box arrives, the other is how small a
     box may be, and it is the second that a resize is bounded by. */
  let w = Math.max(NODE_FIT_MINW, snapToGrid(st.originW + dx*c.sx));
  let h = Math.max(NODE_FIT_MINH, snapToGrid(st.originH + dy*c.sy));
  /* A portrait is a circle, and a circle has one measurement.
   *
     Left to the ordinary two, dragging a corner sideways widened a box
     that is drawn as a circle inscribed in its shorter side — so the
     circle did not move at all and the grip appeared to do nothing. The
     larger of the two movements is taken as the size, which is what the
     hand means by pulling a corner outward, and both sides are set to it
     so the shape stays what it is. */
  if((st.node.shape || '') === 'ellipse'){
    const side = Math.max(BIO_MIN_SIZE,
      snapToGrid(st.originW + Math.max(dx*c.sx, dy*c.sy)));
    w = h = side;
  }
  st.node.size = {w, h};
  /* Pulling a top or left corner holds the opposite one still, which means
     the entry's own origin travels as the box grows. An entry whose origin
     moves has to be written down as placed by hand — otherwise the next
     redraw reads it back out of the layout and puts it where the layout
     wants it, which is not where the reader just dragged its corner to. */
  if(c.sx < 0 || c.sy < 0){
    const nx = c.sx < 0 ? st.originX + (st.originW - w) : st.originX;
    const ny = c.sy < 0 ? st.originY + (st.originH - h) : st.originY;
    // Both: `pos` is what the next full rebuild reads, `x`/`y` are what
    // this redraw draws — a redraw does not go back to `pos` for a box
    // that already has one.
    st.node.pos = {x: nx, y: ny};
    st.node.x = nx; st.node.y = ny;
  }
  renderNodes();
  redrawEdges();
  applyVisibility();
  if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
  paintMultiSelection();
  /* A portrait's card is anchored beside its circle and sized in step with
     it, so it has to be redrawn as the circle is dragged bigger. Without
     this it sat at the old radius until the mouse came up and then jumped
     — the one gesture where the card and the entry it belongs to were
     visibly two different objects. */
  drawBioCard();
});
window.addEventListener('mouseup', ()=>{
  const st = nodeResizeState;
  nodeResizeState = null;
  if(!st || !st.moved) return;
  const size = st.node.size;
  applyEdit(()=>{
    const found = workingEntry(st.node.id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    opts.size = [size.w, size.h];
    const moved = st.corner.sx < 0 || st.corner.sy < 0;
    if(moved){
      // A fixed size takes no growth offset, so the drawn top-left IS the
      // position to write down.
      opts.pos = [st.node.x, st.node.y];
    } else if(st.growShift && Array.isArray(opts.pos)){
      opts.pos = [opts.pos[0], opts.pos[1] - st.growShift];
    }
    putEntry(found.index, found.entry, opts);
  });
});

/* ---------------------------------------------------------------------
   Turning a caption by hand.
 *
 * The angle used to be a slider in the caption's own card: a control in a
 * panel for a property of a thing on the drawing, which meant aiming by
 * eye at one end of the screen while the number changed at the other. A
 * caption is turned the way everything else on this chart is sized — by
 * taking hold of the thing itself. The handle stands off the top-left
 * corner, exactly where the corner grips stand off their corners, and
 * carries the same round arrow every drawing program puts there.
 *
 * Shift steps in eighths of a turn and rounds to the nearest one, the same
 * modifier and the same set the slider used to offer; a double-click puts
 * the caption back level.
   ------------------------------------------------------------------ */
let nodeRotateState = null;
function beginNodeRotate(ev, n, g){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation();
  ev.preventDefault();
  nodeRotateState = {
    node: n, g,
    cx: n.x + n.w/2, cy: n.y + n.h/2,
    start: n.rot || 0, moved: false,
    startClientX: ev.clientX, startClientY: ev.clientY
  };
  // Where the hand took hold, as an angle about the centre — so the
  // caption turns BY what the hand turns rather than jumping to it.
  const p = clientToWorld(ev.clientX, ev.clientY);
  nodeRotateState.grab = Math.atan2(p.y - nodeRotateState.cy, p.x - nodeRotateState.cx) * 180/Math.PI;
  document.body.classList.add('rotating');
}
function applyNodeRotation(n, g, deg){
  const a = ((Math.round(deg) % 360) + 360) % 360;
  n.rot = a || undefined;
  if(!g) return a;
  const t = a ? `rotate(${a},${(n.x + n.w/2).toFixed(2)},${(n.y + n.h/2).toFixed(2)})` : '';
  if(t){ g.dataset.rotTransform = t; g.setAttribute('transform', t); }
  else { delete g.dataset.rotTransform; g.removeAttribute('transform'); }
  return a;
}
window.addEventListener('mousemove', e=>{
  const st = nodeRotateState;
  if(!st) return;
  if(!st.moved){
    if(Math.hypot(e.clientX - st.startClientX, e.clientY - st.startClientY) < DRAG_THRESHOLD) return;
    st.moved = true;
  }
  const p = clientToWorld(e.clientX, e.clientY);
  const now = Math.atan2(p.y - st.cy, p.x - st.cx) * 180/Math.PI;
  let deg = st.start + (now - st.grab);
  if(e.shiftKey) deg = Math.round(deg / ROT_SNAP) * ROT_SNAP;
  st.at = applyNodeRotation(st.node, st.g, deg);
});
window.addEventListener('mouseup', ()=>{
  const st = nodeRotateState;
  nodeRotateState = null;
  if(!st) return;
  document.body.classList.remove('rotating');
  if(!st.moved) return;
  // The click that ends the drag must not also select or open anything.
  suppressNodeClick = true;
  setTimeout(()=>{ suppressNodeClick = false; }, 0);
  applyEdit(()=>{
    const found = workingEntry(st.node.id);
    if(!found) return;
    const opts = entryOpts(found.entry);
    if(st.at) opts.rot = st.at; else delete opts.rot;
    putEntry(found.index, found.entry, opts);
  });
});

function beginConnectorDrag(ev, n, side, ring, ringColor){
  if(ev.button !== 0 || readOnlyView) return;
  ev.stopPropagation();
  ev.preventDefault();
  connectorDragState = {
    from: n, fromSide: side, fromRing: ring || 0, color: ringColor || null,
    start: portOnSide(n, side, 0, 1, ring || 0)
  };
  svg.classList.add('connector-dragging');
  // The rubber band wears the colour the finished connector will have.
  rubberBand.setAttribute('stroke', ringColor || 'var(--accent)');
  rubberBand.style.display = '';
}

function connectorDropTarget(clientX, clientY){
  // The rubber band and the handles' own hit circles sit under the cursor;
  // the band is pointer-events:none, and a handle resolves to its node
  // anyway, so closest('.node') gives the right answer either way.
  const el0 = document.elementFromPoint(clientX, clientY);
  const nodeG = el0 && el0.closest && el0.closest('.node');
  if(!nodeG) return null;
  const target = nodes.get(nodeG.dataset.id);
  if(!target) return null;
  const handle = el0.closest('.node-handle');
  const w = clientToWorld(clientX, clientY);
  return {
    node: target,
    side: handle ? handle.dataset.side : nearestSide(target, w.x, w.y),
    ring: handle ? Number(handle.dataset.ring) || 0 : 0,
    handle,
    g: nodeG
  };
}

window.addEventListener('mousemove', e=>{
  if(!connectorDragState) return;
  const st = connectorDragState;
  const w = clientToWorld(e.clientX, e.clientY);
  rubberBand.setAttribute('d', `M${st.start.x},${st.start.y} L${w.x},${w.y}`);
  const hit = connectorDropTarget(e.clientX, e.clientY);
  qNodes('.node.connect-target').forEach(g=>g.classList.remove('connect-target'));
  qNodes('.node-handle.drop-target').forEach(h=>h.classList.remove('drop-target'));
  if(hit && hit.node.id !== st.from.id){
    hit.g.classList.add('connect-target');
    if(hit.handle) hit.handle.classList.add('drop-target');
  }
});

window.addEventListener('mouseup', e=>{
  const st = connectorDragState;
  if(!st) return;
  connectorDragState = null;
  svg.classList.remove('connector-dragging');
  rubberBand.style.display = 'none';
  rubberBand.removeAttribute('d');
  qNodes('.node.connect-target').forEach(g=>g.classList.remove('connect-target'));
  qNodes('.node-handle.drop-target').forEach(h=>h.classList.remove('drop-target'));
  const hit = connectorDropTarget(e.clientX, e.clientY);
  if(!hit) return;                                   // released on empty canvas
  if(hit.node.id === st.from.id) return;             // released back on itself
  connectNodes(st.from.id, hit.node.id, {
    fromSide: st.fromSide, toSide: hit.side,
    fromRing: st.fromRing, toRing: hit.ring,
    color: st.color
  });
});

