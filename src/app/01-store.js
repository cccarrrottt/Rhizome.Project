/* =========================================================================
   WHERE THE CHART IS KEPT
   -----------------------------------------------------------------------
   This page began life as a claude.ai artifact, and for a while the only
   way it could save was the one that host provides: publish a new version
   of yourself. That made the chart a hostage of a single website. Opened
   from a disk, or served from anywhere else, it drew perfectly and then
   refused to remember anything.

   It now keeps its work through whichever of two backends is actually
   available, decided at load:

     artifact  — running inside claude.ai with write access. Saving
                 publishes a new version of this page, exactly as before,
                 and the host reloads the view afterwards.
     standalone— everywhere else: a file on a disk, a plain web server, a
                 local dev build. Saving writes the chart to this browser's
                 storage for this document, and takes effect immediately
                 with no reload.

   The standalone backend keeps DATA, not source code: the four editable
   regions are stored as JSON and read back with JSON.parse, so nothing
   stored can ever be executed. Export writes the whole thing back out as a
   fresh self-contained page — that is the copy you keep, move to another
   machine, or publish anywhere at all.

   The restore below runs before anything else, because the model is built
   from these arrays a few hundred lines down and has to see the right
   contents the first time.
   ========================================================================= */
const STORE_PREFIX = 'rhizome.chart:';
/* The project was called Axiom Nexus before it was called Rhizome, and that
   name is stamped on every key this program has ever written into a browser.
   The old prefix is kept, and read from, because renaming it without carrying
   the old values over would not lose a preference — it would lose THE CHART,
   for anybody whose only copy lives in a browser on their own machine or on
   a file they host themselves. See carryOverKey below. */
const OLD_STORE_PREFIX = 'axiomNexus.chart:';
// One chart per document, so two charts served side by side keep their own
// work rather than overwriting each other.
const STORE_KEY = STORE_PREFIX + (location.pathname + location.search || 'default');

// `claude` is a bare global the host injects. Its absence is the signal
// that nothing here can publish, and it is worth knowing synchronously:
// the boot-time restore below cannot wait on a promise.
const HOSTED = typeof claude !== 'undefined' && claude && typeof claude.use === 'function';

function storageOk(){
  try{
    const k = '__axiomNexusProbe';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return true;
  }catch(e){ return false; }
}
const STORAGE_OK = storageOk();

/* -------------------------------------------------------------------------
   Carrying a value written under the old brand's key over to the new one.

   The rule is deliberately one-directional and non-destructive: the new key
   is written only when it does not exist yet, and the old key is never
   removed. Both halves matter. Writing unconditionally would let a stale
   pre-rename value overwrite work done since the rename, which is the exact
   data loss the migration exists to prevent. Deleting the old key would make
   opening an older copy of this file — and people do keep older copies, that
   being the whole point of a single-file chart — silently start from nothing.
   A few hundred bytes of duplicated preference is the cheaper mistake.

   Returns the new key, so a key can be declared and migrated in one breath:
       const SOME_KEY = carryOverKey('axiomNexus.thing', 'rhizome.thing');
   ------------------------------------------------------------------------- */
function carryOverKey(oldKey, newKey){
  if(!STORAGE_OK || oldKey === newKey) return newKey;
  try{
    if(localStorage.getItem(newKey) === null){
      const had = localStorage.getItem(oldKey);
      if(had !== null) localStorage.setItem(newKey, had);
    }
  }catch(e){}
  return newKey;
}

/* The chart keys cannot be listed in advance: there is one per document that
   has ever been opened, and this copy of the file knows only its own. So the
   whole of local storage is swept once at boot. The keys are collected before
   any of them is written, because localStorage.key(i) is an index into a live
   list and writing to it mid-walk can make the walk skip an entry. */
(function carryOverCharts(){
  if(!STORAGE_OK) return;
  try{
    const stale = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.indexOf(OLD_STORE_PREFIX) === 0) stale.push(k);
    }
    stale.forEach(k=> carryOverKey(k, STORE_PREFIX + k.slice(OLD_STORE_PREFIX.length)));
  }catch(e){}
})();

/* Replace the contents of an array in place. The rest of the page holds
   references to these arrays — EDGE_STYLES especially is captured by
   closures all over — so they must never be reassigned, only refilled. */
function refill(arr, items){
  arr.length = 0;
  if(Array.isArray(items)) items.forEach(x=> arr.push(x));
}

function readStoredChart(){
  if(!STORAGE_OK) return null;
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return (data && typeof data === 'object' && Array.isArray(data.nodes)) ? data : null;
  }catch(e){ return null; }
}

/* Work saved in this browser wins over what is baked into the file — that
   is what saving means. It is applied only when this page has no way to
   publish, so on claude.ai the published document always speaks for
   itself and a stale local copy can never shadow it. */
if(!HOSTED){
  const stored = readStoredChart();
  if(stored){
    /* A region the stored copy does not carry is a region it has nothing
       to say about — not an instruction to empty the one baked into this
       file. `refill` clears before it fills, so an unguarded call against
       a missing key threw away every connector style, sticker and comment
       the document shipped with: a chart written by an older build, or a
       payload edited by hand, opened having quietly "lost its
       formatting", with nothing to explain it. */
    if(Array.isArray(stored.nodes)) refill(NODES, stored.nodes);
    if(Array.isArray(stored.edgeStyles)) refill(EDGE_STYLES, stored.edgeStyles);
    if(Array.isArray(stored.stickers)) refill(STICKERS, stored.stickers);
    if(Array.isArray(stored.media)) refill(MEDIA, stored.media);
    if(Array.isArray(stored.comments)) refill(COMMENTS, stored.comments);
    if(Array.isArray(stored.tagCats)) refill(TAG_CATS, stored.tagCats);
    if(Array.isArray(stored.refs)) refill(REFS, stored.refs);
    if(stored.settings && typeof stored.settings === 'object') Object.assign(SETTINGS, stored.settings);
  }
}

/* The page's own source, captured before a single element has been added
   to it. Export needs the real bytes of this document and cannot always
   fetch them — a page opened from a disk cannot fetch itself at all — but
   at the moment this script starts running the parser has already built
   the whole document, including this script's own text, so the DOM IS the
   source. Read it now, before the chart starts drawing into it. */
const PRISTINE_HTML = (()=>{
  try{ return '<!doctype html>\n' + document.documentElement.outerHTML; }
  catch(e){ return null; }
})();

const DEFAULT_EDGE_STYLE = { routing: 'orthogonal', dash: 'solid', arrow: true, arrowIn: false,
                             sinusoid: false, note: '', notePos: 'above', noteAt: 0.5,
                             noteBg: null, bends: null,
                             noteDir: null, noteLen: null,
                             fromSide: null, toSide: null,
                             fromRing: 0, toRing: 0, gradient: null };
function edgeStyleFor(from, to){
  const o = EDGE_STYLES.find(s=>s.from===from && s.to===to);
  if(!o) return DEFAULT_EDGE_STYLE;
  return {
    routing: o.routing || DEFAULT_EDGE_STYLE.routing,
    dash: o.dash || DEFAULT_EDGE_STYLE.dash,
    arrow: o.arrow !== undefined ? o.arrow : DEFAULT_EDGE_STYLE.arrow,
    // An arrowhead at the source end too, for a mutual or reversed link.
    arrowIn: !!o.arrowIn,
    sinusoid: !!o.sinusoid,
    note: typeof o.note === 'string' ? o.note : '',
    // 'above' | 'on' | 'below'. 'on' lays the note across the connector,
    // its plate covering the line — the right choice on a crowded chart,
    // where a note floating beside its line can read as belonging to the
    // connector next to it.
    notePos: ['above','on','below'].includes(o.notePos) ? o.notePos
             : (o.noteBelow ? 'below' : 'above'),
    /* Where along the connector a leader note is pinned, 0 at the source
       end and 1 at the target. Kept as a FRACTION rather than a point,
       because the connector is re-routed whenever anything moves — an
       absolute point would be left behind the moment a node was dragged,
       while a fraction stays where the reader put it, relative to the line
       it belongs to. */
    noteAt: (typeof o.noteAt === 'number' && o.noteAt >= 0 && o.noteAt <= 1) ? o.noteAt : 0.5,
    /* And which way, and how far, the leader itself runs — drawn by the
       reader rather than searched for. An angle in degrees measured the
       way SVG measures them (0 to the right, growing clockwise) and a
       distance in chart units from the anchor to the card's centre.
       Absent means the card has never been aimed by hand, and the
       automatic search that has always placed it still does. */
    /* The plate's own ground. Its INK is the connector's and is not the
       reader's to set — a remark on a line belongs to the line — but what
       it is written on is, and on a crowded chart a note usually wants
       something to sit on. */
    noteBg: (typeof o.noteBg === 'string' && o.noteBg) ? o.noteBg : null,
    /* Points this connector has to pass through, set by hand — see
       handBends. In chart coordinates, in order from the source end. */
    bends: (Array.isArray(o.bends) && o.bends.length) ? o.bends : null,
    noteDir: (typeof o.noteDir === 'number' && isFinite(o.noteDir)) ? o.noteDir : null,
    noteLen: (typeof o.noteLen === 'number' && o.noteLen > 0) ? o.noteLen : null,
    color: o.color || null,
    // Whether that colour was CHOSEN here rather than inherited from the
    // border the connector was drawn out of. See currentPaint.
    colorFixed: !!o.colorFixed,
    // Explicit sides, set by dragging a connector between two side
    // handles. Absent means "work it out from the geometry".
    fromSide: SIDES.includes(o.fromSide) ? o.fromSide : null,
    toSide: SIDES.includes(o.toSide) ? o.toSide : null,
    // Which border ring each end attaches to on a multi-coloured node.
    fromRing: typeof o.fromRing === 'number' ? o.fromRing : 0,
    toRing: typeof o.toRing === 'number' ? o.toRing : 0,
    // Two hex colours to sweep between along the connector, or null.
    gradient: (Array.isArray(o.gradient) && o.gradient.length===2 &&
               o.gradient.every(c=>typeof c==='string')) ? o.gradient.slice() : null
  };
}

