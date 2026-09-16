/* ---------------------------------------------------------------------
   Editing model: local edits, one explicit Save.

   Why this shape rather than continuous autosave: saving here means
   publishing a new version of this very page, and the host then reloads
   the view. That reload is inherent to publishing — it is not something a
   nicer implementation could hide. So Google-Docs-style "save silently as
   you type" would mean reloading the page every few seconds, which is
   strictly worse than saving by hand. Batching instead gives the best of
   both: every edit is instant and local with no reload at all, and the
   single unavoidable reload happens once, when you ask for it.

   Everything on screen is therefore built from workingNodes + EDGE_STYLES
   in memory. An edit mutates those, rebuilds the view, and marks the page
   dirty. Save is the only thing that touches the published document.
   ------------------------------------------------------------------ */
const saveBtn = document.getElementById('saveBtn');

// Undo is now a plain in-memory stack of snapshots — there is no reload to
// survive any more, so it needs no persistence and can be far deeper.
const LOCAL_UNDO_LIMIT = 60;
const undoStack = [];
/* Redo holds the changes undo has walked back past. It is filled only by
   undo and emptied by any fresh edit, which is the rule people already
   expect: step back, step forward again, but the moment you change
   something new the forward branch is gone. */
const redoStack = [];
let savedParts = null;

/* The saved state, kept as one entry per region rather than one blob.
 *
 * "Is this chart dirty?" is asked after every single edit — every keystroke
 * in a text field included — and it used to be answered by serializing the
 * whole chart into one string and comparing it. That is exact, and it stays
 * exact through an undo back to the saved state, which a mutation flag never
 * would; the derived answer is the right design and is kept.
 *
 * What it cost was hidden in the stickers. A sticker is a base64 data URI, so
 * a modest library of forty small images serializes to about a megabyte —
 * measured at 1.24 ms of the 1.39 ms each check took, and a megabyte of
 * garbage per keystroke — to re-confirm bytes that had not changed since the
 * page loaded.
 *
 * Two changes, each exact, neither a heuristic. Comparison goes region by
 * region and stops at the first difference, so an edit to an entry settles
 * the question in 0.02 ms without looking further. And the two regions that
 * hold the bytes are snapshotted by structure instead of by text, so they
 * are compared by reference and stored once rather than once per undo step;
 * that part is explained where it is implemented, below the list.
 *
 * The alternative to both — an epoch counter bumped wherever STICKERS is
 * written — would be faster still and would quietly start lying the day
 * someone adds a write site and forgets to bump it. Nothing here has an
 * invariant a future edit can break. */
/* EVERY region the save writes, and nothing else.
 *
 * This list and writeChart's must agree, and for three regions they did
 * not: references, tag categories and the chart's own settings were saved
 * but never snapshotted. Nothing that touched them counted as a change, so
 * the Save button stayed greyed out reading "Saved", Ctrl+S returned
 * without doing anything, the beforeunload guard stayed quiet, and the
 * work was gone on the next reload. Undo had the mirror of the same hole:
 * deleting a cited reference strips its marks from the labels, and undoing
 * put the marks back while leaving the reference deleted.
 *
 * One list, used by the snapshot, the comparison and the restore, so the
 * three cannot drift apart again. */
const SAVED_REGIONS = [
  {k:'n', get: ()=> workingNodes,  set: v=>{ workingNodes = v; }},
  {k:'e', get: ()=> EDGE_STYLES,   set: v=> refill(EDGE_STYLES, v)},
  {k:'c', get: ()=> COMMENTS,      set: v=> refill(COMMENTS, v)},
  {k:'t', get: ()=> TAG_CATS,      set: v=> refill(TAG_CATS, v)},
  {k:'r', get: ()=> REFS,          set: v=> refill(REFS, v)},
  {k:'g', get: ()=> SETTINGS,      set: v=>{ Object.keys(SETTINGS).forEach(x=> delete SETTINGS[x]);
                                             Object.assign(SETTINGS, v); }},
  // `heavy`: a library of forty small images is about a megabyte of base64,
  // and an embedded clip is the largest single thing this chart can carry.
  // Those two are snapshotted by structure rather than by text; see below.
  {k:'s', get: ()=> STICKERS, heavy: true,
          set: v=>{ refill(STICKERS, v); rebuildStickerMap(); }},
  {k:'m', get: ()=> MEDIA,    heavy: true,
          set: v=>{ refill(MEDIA, v); rebuildMediaMap(); }}
];

/* -------------------------------------------------------------------------
   Snapshotting the two regions that carry the bytes.

   Everything above serializes to text, which is exact and, for entries and
   comments and settings, cheap. For stickers and media it is neither cheap
   nor, once you look at where it happens, defensible: takeSnapshot runs on
   EVERY edit, so a chart with a modest sticker library re-encoded about a
   megabyte of base64 per keystroke and then kept a separate copy of it in
   each of sixty undo snapshots — a hundred and fifty megabytes of strings
   that were, every one of them, byte-for-byte the string next to it.

   What those two regions actually hold is a flat record per item —
   {key, name, kind, src}, all primitives — and that is the whole reason a
   structural snapshot works here. Copying the record copies the REFERENCE
   to the base64, never the base64, so a snapshot costs a few dozen small
   objects and the megabyte is stored exactly once no matter how deep the
   undo stack goes. Comparison gets the same gift in reverse: an unchanged
   sticker's `src` is the very same string object in the live array and in
   the snapshot, so `===` settles it by identity without reading a byte.

   This is not a heuristic and nothing about it can go stale — no counter to
   bump, no write site to remember. It is the same comparison the text form
   made, done against values instead of against their spelling.

   The one assumption is flatness, and it is checked rather than trusted:
   a chart hand-edited to put an object inside an item would compare wrong
   under a shallow copy, so such a region falls back to the text form for
   that snapshot. Both forms are exact; they differ only in cost.
   ------------------------------------------------------------------------- */
function flatRecord(o){
  if(!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  for(const k in o){
    if(!Object.prototype.hasOwnProperty.call(o, k)) continue;
    const v = o[k];
    if(v !== null && typeof v === 'object') return null;
    out[k] = v;
  }
  return out;
}
function snapHeavy(list){
  if(!Array.isArray(list)) return {json: JSON.stringify(list)};
  const flat = [];
  for(let i = 0; i < list.length; i++){
    const rec = flatRecord(list[i]);
    if(!rec) return {json: JSON.stringify(list)};
    flat.push(rec);
  }
  return {flat};
}
function sameFlat(a, b){
  const ka = Object.keys(a), kb = Object.keys(b);
  if(ka.length !== kb.length) return false;
  for(let i = 0; i < ka.length; i++){
    const k = ka[i];
    if(!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if(a[k] !== b[k]) return false;
  }
  return true;
}
function heavyDiffers(list, snap){
  if(!snap) return true;
  if(snap.json !== undefined) return JSON.stringify(list) !== snap.json;
  const flat = snap.flat;
  if(!Array.isArray(list) || list.length !== flat.length) return true;
  for(let i = 0; i < list.length; i++){
    const rec = flatRecord(list[i]);
    // Shape that a shallow copy cannot speak for: answer by the text form
    // rather than by guessing, which is what the fallback is there for.
    if(!rec) return JSON.stringify(list) !== JSON.stringify(flat);
    if(!sameFlat(rec, flat[i])) return true;
  }
  return false;
}
/* Restoring copies again, deliberately. An item is mutated in place in at
   least one spot — replacing a sticker's image writes `s.src` — so handing
   the live array the snapshot's own records would let a later edit reach
   back and rewrite the history it was undone from. */
function heavyValue(snap){
  if(!snap) return [];
  if(snap.json !== undefined) return JSON.parse(snap.json);
  return snap.flat.map(r=> Object.assign({}, r));
}

function snapshotParts(){
  const out = {};
  SAVED_REGIONS.forEach(r=>{
    out[r.k] = r.heavy ? snapHeavy(r.get()) : JSON.stringify(r.get());
  });
  return out;
}
function partsDiffer(saved){
  if(!saved) return false;
  for(const r of SAVED_REGIONS){
    if(r.heavy){
      if(heavyDiffers(r.get(), saved[r.k])) return true;
    } else if(JSON.stringify(r.get()) !== saved[r.k]) return true;
  }
  return false;
}
function takeSnapshot(){ return snapshotParts(); }
function restoreSnapshot(s){
  SAVED_REGIONS.forEach(r=>{
    if(s[r.k] === undefined) return;
    r.set(r.heavy ? heavyValue(s[r.k]) : JSON.parse(s[r.k]));
  });
}
// Dirty is derived, never a flag that can drift: undoing back to exactly
// what was last published correctly leaves nothing to save.
function isDirty(){ return savedParts !== null && partsDiffer(savedParts); }
function refreshSaveUI(){
  const d = isDirty();
  saveBtn.disabled = !d;
  saveBtn.textContent = d ? 'Save' : 'Saved';
  if(d) setSaveState('dirty', 'Unsaved changes');
  else setSaveState(null);
}

// The single wrapper every edit goes through: snapshot for undo, mutate,
// redraw, update the Save button.
function applyEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  rebuildChart();
  refreshSaveUI();
}
// Every edit records where it started, and abandons any forward history.
function pushUndo(){
  undoStack.push(takeSnapshot());
  while(undoStack.length > LOCAL_UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}
// A short message in the top bar, then back to whatever the save state is.
function flashStatus(msg){
  setSaveState('ok', msg);
  setTimeout(refreshSaveUI, 1600);
}
function undoLastEdit(){
  if(!undoStack.length){ setSaveState('ok', 'Nothing to undo'); setTimeout(refreshSaveUI, 1200); return; }
  redoStack.push(takeSnapshot());
  while(redoStack.length > LOCAL_UNDO_LIMIT) redoStack.shift();
  restoreSnapshot(undoStack.pop());
  rebuildChart();
  repaintOpenPanels();
  refreshSaveUI();
}
function redoLastEdit(){
  if(!redoStack.length){ setSaveState('ok', 'Nothing to redo'); setTimeout(refreshSaveUI, 1200); return; }
  undoStack.push(takeSnapshot());
  while(undoStack.length > LOCAL_UNDO_LIMIT) undoStack.shift();
  restoreSnapshot(redoStack.pop());
  rebuildChart();
  repaintOpenPanels();
  refreshSaveUI();
}
/* An undo restores the DATA; anything showing that data has to be told.
   rebuildChart redraws the chart and the Management panel, but the sticker
   library is its own overlay — so undoing a sticker's deletion put the
   sticker back in the chart while the library it was deleted from went on
   showing an empty grid until it was closed and opened again. */
function repaintOpenPanels(){
  if(typeof renderStickerLibrary === 'function' &&
     stickerOverlay && stickerOverlay.classList.contains('open')){
    renderStickerLibrary();
  }
}

function workingIndex(id){ return workingNodes.findIndex(it=>it[0]===id); }
// Node entries are fixed-length tuples; this hands back a padded, mutable
// copy so callers can assign to any slot without worrying about length.
function workingEntry(id){
  const i = workingIndex(id);
  if(i === -1) return null;
  const it = workingNodes[i];
  const out = [];
  for(let k=0;k<7;k++) out[k] = (k < it.length ? it[k] : undefined);
  return {index:i, entry:out};
}
function entryOpts(entry){
  return (entry[6] && typeof entry[6]==='object') ? Object.assign({}, entry[6]) : {};
}
function putEntry(index, entry, opts){
  entry[6] = (opts && Object.keys(opts).length) ? opts : undefined;
  workingNodes[index] = entry;
}

/* Publishing a new version of this page. Only available where a host
   offers it; everywhere else the standalone backend below takes over. */
/* The mirror of ensureFullDocument: the host wraps what it is given in its
   own <!doctype>/<html>/<head>/<body>, so handing it a whole document
   nests one inside the other. */
function ensureFragment(src){
  if(!isFullDocument(src)) return src;
  const mine = ownContent(src);
  if(mine) return mine;
  try{
    const doc = new DOMParser().parseFromString(src, 'text/html');
    return doc.head.innerHTML + '\n' + doc.body.innerHTML;
  }catch(e){ return src; }
}
/* Which shape of page this host wants, once one of them has worked.
 *
 * For most of this chart's life the answer was settled: the artifact host
 * wrapped whatever it was given in its own <!doctype>/<html>/<head>/<body>,
 * so what went back had to be a FRAGMENT or the host would nest one
 * document inside another. That is no longer universally true — a newer
 * runtime refuses anything that does not begin with a doctype — and a page
 * that guesses wrong does not degrade, it simply cannot be saved.
 *
 * So it is not guessed. The first save of a session tries one shape and,
 * if the host complains about the SHAPE of what it was given, tries the
 * other; whichever is accepted is remembered for the rest of the session.
 * Complaints that are not about shape — a conflict, a size, a permission —
 * are passed straight out, because retrying those would be both useless
 * and, in the case of a conflict, actively wrong. */
let publishShape = null;          // 'fragment' | 'document'
/* Errors where trying the other shape is pointless or harmful. */
const PUBLISH_FINAL = new Set(['conflict', 'not_writer', 'not_declared', 'not_granted',
                               'too_large', 'rate_limited', 'read_only_path',
                               'capability_disabled', 'capability_removed']);
async function publishOwnPage(cap, whole){
  const shapes = {
    fragment: ()=> ensureFragment(whole),
    document: ()=> ensureFullDocument(whole)
  };
  const order = publishShape === 'document' ? ['document', 'fragment'] : ['fragment', 'document'];
  let firstError = null;
  for(const name of order){
    let body;
    try{ body = shapes[name](); }catch(e){ if(!firstError) firstError = e; continue; }
    try{
      await cap.publish(body);
      publishShape = name;
      return;
    }catch(e){
      if(!firstError) firstError = e;
      if(PUBLISH_FINAL.has(e && e.code)) throw e;
    }
  }
  throw firstError || new Error('the host refused the page.');
}
async function saveToArtifact(cap){
  const src = await readOwnSource();
  await publishOwnPage(cap, writeChart(src));
  savedParts = snapshotParts();
  saveBtn.textContent = 'Saved';
  setSaveState('busy', 'Saved - reloading...');
  // The host reloads after a publish. If it somehow doesn't, stop
  // claiming to be mid-refresh and say the save itself went through.
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(()=> setSaveState('ok', 'Saved'), 6000);
}

/* What is making this chart big, in one sentence.
 *
 * Almost always the answer is one embedded picture or clip: everything
 * else on this chart is text, and text does not reach a megabyte. Naming
 * the heaviest thing turns "too large" from a dead end into an
 * instruction. */
function heaviestPartOfChart(){
  const items = [];
  (typeof MEDIA !== 'undefined' ? MEDIA : []).forEach(m=>{
    if(m && typeof m.src === 'string') items.push({what:`the figure “${m.name || m.key}”`, n:m.src.length});
  });
  (typeof STICKERS !== 'undefined' ? STICKERS : []).forEach(x=>{
    if(x && typeof x.src === 'string') items.push({what:`the sticker “${x.name || x.key}”`, n:x.src.length});
  });
  workingNodes.forEach(it=>{
    const img = it && it[6] && it[6].image;
    if(typeof img === 'string') items.push({what:`the picture on “${stripMarkup(it[1] || it[0])}”`, n:img.length});
  });
  if(!items.length) return 'the chart itself has grown past what can be published.';
  items.sort((a,b)=> b.n - a.n);
  const mb = (items[0].n / 1048576).toFixed(1);
  return `${items[0].what} alone is about ${mb} MB. Remove or shrink it, then save again;`;
}

/* Saving with no host at all: the chart goes into this browser's storage
   for this document. No reload, because nothing about the page changed —
   only what it will find next time it opens.

   Browser storage is a convenience, not an archive: it belongs to one
   browser on one machine and a cleared cache takes it with it. Export is
   the real save, and the failure message says so rather than pretending
   the work is safe. */
function saveToBrowser(){
  if(!STORAGE_OK) throw new Error('this browser will not let the page store anything. Use Export to keep your work.');
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(chartData()));
  }catch(e){
    const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new Error(full
      ? 'the chart is larger than this browser will store (embedded pictures are the usual reason). Use Export to keep it as a file.'
      : 'could not write to this browser\u2019s storage.');
  }
  savedParts = snapshotParts();
  saveBtn.textContent = 'Saved';
  setSaveState('ok', 'Saved in this browser');
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(refreshSaveUI, 2600);
}

async function saveNow(){
  if(!isDirty()) return;
  const cap = await capArtifactPromise;
  setSaveState('busy', 'Saving...');
  saveBtn.disabled = true;
  try{
    if(cap) await saveToArtifact(cap);
    else saveToBrowser();
  }catch(e){
    const code = e && e.code;
    /* Nothing in this page reloads, so saying it is about to was a
       message describing something that would never happen — and it wore
       the BUSY style, which reads as "in progress" rather than "your work
       is still unsaved". The reader is told what actually happened and
       what to do about it, and the Save button comes back enabled. */
    if(code==='conflict'){
      setSaveState('err', 'Someone else published a newer version — export your copy, then reload');
    }
    else if(isReadOnlyError(e)){
      markReadOnly(isPermanentRefusal(e));
      setSaveState('err', 'This chart is read-only for you');
    }
    /* Say what actually went wrong. "Save failed: request failed" told the
       reader nothing they could act on — and the two failures that really
       happen have very different answers: a chart too big to publish needs
       something taken out of it, a transient host error just needs trying
       again. The code is named either way, so a report of one is
       diagnosable. */
    else if(code === 'too_large'){
      setSaveState('err', 'Too large to publish — ' + heaviestPartOfChart() +
                          ' Export keeps the whole thing as a file.');
    }
    else if(code === 'rate_limited'){
      setSaveState('err', 'Saving too often — wait a moment and press Save again.');
    }
    else {
      setSaveState('err', 'Save failed' + (code ? ` (${code})` : '') + ': ' +
                          (e && e.message ? e.message : 'unknown error'));
    }
    saveBtn.disabled = false;
  }
}
saveBtn.onclick = saveNow;

