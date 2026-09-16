/* ---------------------------------------------------------------------
   Clipboard (Ctrl+C / Ctrl+X / Ctrl+V).

   Also localStorage-backed, for the same reason as the undo stack: a cut
   publishes (and so reloads) before the paste ever happens, so an
   in-memory clipboard would always be empty by the time it was needed.

   A copied node carries its own look and content but not its connections —
   the same as duplicating a shape in any drawing tool. It's pasted as a
   free-standing entry with a fresh id, hand-placed a step down-right of
   the original so it lands visibly beside what it was copied from rather
   than wherever the auto-layout would have put a new orphan.
   ------------------------------------------------------------------ */
const CLIP_KEY = carryOverKey('axiomNexus.clipboard', 'rhizome.clipboard');
function writeClipboard(payload){
  try{ localStorage.setItem(CLIP_KEY, JSON.stringify(payload)); }catch(e){}
}
function readClipboard(){
  try{ const raw = localStorage.getItem(CLIP_KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function validateNodes(val){
  if(!Array.isArray(val) || val.length===0) throw new Error('must be a non-empty array of node entries.');
  const ids = new Set();
  val.forEach((it,j)=>{
    if(!Array.isArray(it) || it.length<2 || typeof it[0]!=='string' || typeof it[1]!=='string'){
      throw new Error(`node #${j+1} needs at least [id, label] (both strings).`);
    }
    if(ids.has(it[0])) throw new Error(`duplicate node id "${it[0]}".`);
    /* An id may be written in any script anybody writes in. What it may not
       contain is a control character or a line break: those survive neither
       an attribute nor the serialized form the chart is saved as, and they
       are invisible in every place a reader would look for the mistake.
       Refusing anything more than that — insisting on ASCII, say — would
       turn a chart whose entries are named in Russian into a file this
       program cannot open, which is a worse failure than the one it would
       be guarding against. Everything that makes an id awkward to put in a
       selector or an SVG id is handled where it is put there: see cssEscape
       and defId. */
    if(/[\u0000-\u001f\u007f]/.test(it[0])){
      throw new Error(`node #${j+1}: the id contains a control character.`);
    }
    if(!it[0].trim()) throw new Error(`node #${j+1}: the id is blank.`);
    ids.add(it[0]);
    const parent = it[2];
    if(parent!==undefined && parent!==null && typeof parent!=='string' &&
       !(Array.isArray(parent) && parent.every(p=>typeof p==='string'))){
      throw new Error(`node "${it[0]}": parent must be a string, an array of strings, or omitted.`);
    }
    const opts = it[6];
    if(opts!==undefined && opts!==null){
      if(typeof opts!=='object') throw new Error(`node "${it[0]}": opts must be an object.`);
      if(opts.link!==undefined && typeof opts.link!=='string') throw new Error(`node "${it[0]}": opts.link must be a string.`);
      if(opts.colors!==undefined && !(Array.isArray(opts.colors) && opts.colors.every(c=>typeof c==='string'))) throw new Error(`node "${it[0]}": opts.colors must be an array of strings.`);
      if(opts.bg!==undefined && !(Array.isArray(opts.bg) && opts.bg.every(c=>typeof c==='string'))) throw new Error(`node "${it[0]}": opts.bg must be an array of strings.`);
      if(opts.border!==undefined && !(typeof opts.border==='string' && BORDER_STYLES[opts.border])) throw new Error(`node "${it[0]}": opts.border must be one of ${Object.keys(BORDER_STYLES).join(', ')}.`);
      if(opts.tags!==undefined && !(Array.isArray(opts.tags) && opts.tags.every(t=>typeof t==='string'))) throw new Error(`node "${it[0]}": opts.tags must be an array of strings.`);
      if(opts.font!==undefined && typeof opts.font!=='string') throw new Error(`node "${it[0]}": opts.font must be a string.`);
      if(opts.fontSize!==undefined && typeof opts.fontSize!=='number') throw new Error(`node "${it[0]}": opts.fontSize must be a number.`);
      if(opts.image!==undefined && typeof opts.image!=='string') throw new Error(`node "${it[0]}": opts.image must be a string.`);
      if(opts.size!==undefined && !(Array.isArray(opts.size) && opts.size.length===2 && opts.size.every(v=>typeof v==='number' && Number.isFinite(v)))){
        throw new Error(`node "${it[0]}": opts.size must be a [w, h] pair of numbers.`);
      }
      if(opts.multiLang!==undefined && typeof opts.multiLang!=='boolean') throw new Error(`node "${it[0]}": opts.multiLang must be a boolean.`);
      if(opts.pos!==undefined && !(Array.isArray(opts.pos) && opts.pos.length===2 && opts.pos.every(v=>typeof v==='number' && Number.isFinite(v)))){
        throw new Error(`node "${it[0]}": opts.pos must be a [x, y] pair of numbers.`);
      }
      if(opts.langTabs!==undefined){
        if(!Array.isArray(opts.langTabs) || !opts.langTabs.every(t=>t && typeof t==='object' && typeof t.tag==='string' && typeof t.text==='string')){
          throw new Error(`node "${it[0]}": opts.langTabs must be an array of {tag, text} string pairs.`);
        }
      }
    }
  });
}
/* ---------------------------------------------------------------------
   Pretty-printer for NODES — turns a parsed NODES value back into the
   same style of JS source the hand-written region uses. Used by the
   per-node quick-edit below to save a single item's change without
   requiring the user to open the raw-text editor.
   ------------------------------------------------------------------ */
// Newlines have to be escaped, not emitted raw: a JavaScript string
// literal cannot span lines, and both labels and suggestions can contain
// them. U+2028/2029 are line terminators to a JS parser too.
/* A string, as JavaScript source, safe to sit inside this page's own
   script element.
 *
 * The chart is saved by rewriting regions of the document it is running
 * in, and those regions live inside a script element. An HTML parser ends
 * that element at the first closing script tag it sees, wherever it
 * appears — including in the middle of a string literal. So an entry
 * whose label happened to contain one published a page whose script
 * stopped halfway through the data: not a corrupted chart but an
 * unopenable one, with no way back in to fix it.
 *
 * Escaping "<" as \x3c costs nothing — the parsed string is identical —
 * and no sequence of characters a reader can type can close the element
 * any more. (This comment cannot contain the tag it is about, for exactly
 * the reason it describes.) */
function jsStr(s){
  return "'" + String(s)
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/</g,'\\x3c')
    .replace(/\n/g,'\\n')
    .replace(/\r/g,'\\r')
    .replace(/\u2028/g,'\\u2028')
    .replace(/\u2029/g,'\\u2029') + "'";
}
function jsVal(v){
  if(v===null || v===undefined) return 'null';
  if(typeof v==='string') return jsStr(v);
  if(typeof v==='number' || typeof v==='boolean') return String(v);
  if(Array.isArray(v)) return '[' + v.map(jsVal).join(', ') + ']';
  if(typeof v==='object'){
    const keys = Object.keys(v).filter(k=>v[k]!==undefined);
    return '{' + keys.map(k=>`${k}:${jsVal(v[k])}`).join(', ') + '}';
  }
  return JSON.stringify(v);
}
function serializeItem(it){
  const arr = it.slice();
  while(arr.length && arr[arr.length-1]===undefined) arr.pop();
  return '[' + arr.map(x => x===undefined ? 'undefined' : jsVal(x)).join(', ') + ']';
}
function serializeNodes(nodesVal){
  let out = 'const NODES = [\n';
  nodesVal.forEach(it=>{ out += '  ' + serializeItem(it) + ',\n'; });
  out += '];';
  return out;
}

/* ---------------------------------------------------------------------
   Per-node quick edit — click the ✎ in the detail drawer to edit that
   entry's label/note/link/border colors/tags/font in place, without
   opening the full raw-text editor. Saves straight to the live page by
   re-parsing the live NODES region, patching just this one item, and
   publishing.
   ------------------------------------------------------------------ */
const detailEditToggle = document.getElementById('detailEditToggle');
const detailEditForm = document.getElementById('detailEditForm');
/* The note belongs to the entry's own panel, not to its settings.
 *
 * It used to sit below the settings form and stay on screen while that form
 * was open, which put a second, differently-shaped editor — its own toolbar,
 * its own Apply button — inside a form where every other control commits by
 * itself. Two editing idioms in one panel, and the note visually captured by
 * a form it was never part of. It is hidden while settings are open and
 * comes back when they close; nothing about the note itself changed. */
const detailNoteBlock = document.getElementById('detailNoteBlock');
function showNoteBlock(on){ if(detailNoteBlock) detailNoteBlock.style.display = on ? '' : 'none'; }
const editLinkInput = document.getElementById('editLinkInput');
const editColorsInput = document.getElementById('editColorsInput');
/* Back to the default outline. Emptying the field by hand did this
   already, but only if you knew that an empty field meant "the default"
   rather than "no border at all" — and the field refills itself with the
   resolved hex the moment it commits, so the emptying looked as though it
   had not taken. One button that says what it does. */
{
  const reset = document.getElementById('editColorsReset');
  /* An entry with no colours of its own has nothing to put back, so the
     button is a control that cannot act rather than one that pretends to.
     Pressed anyway it wrote the same absence again — an edit that changed
     nothing, marked the chart unsaved and cost a step of undo to discover
     that it had done so. */
  function syncColorsResetState(){
    if(!reset) return;
    reset.disabled = !editColorsInput.value.trim();
    reset.title = reset.disabled
      ? 'These borders are already the default'
      : 'Back to the default outline';
  }
  if(reset){
    reset.addEventListener('click', ev=>{
      ev.stopPropagation();
      if(!editColorsInput.value.trim()) return;
      editColorsInput.value = '';
      editColorsInput.dispatchEvent(new Event('input', {bubbles:true}));
      if(typeof paintEditSwatches === 'function') paintEditSwatches();
      flushNodeEditCommit();
      syncColorsResetState();
    });
    editColorsInput.addEventListener('input', syncColorsResetState);
    window.syncColorsResetState = syncColorsResetState;
  }
}
const editShapeInput = document.getElementById('editShapeInput');
const editBgInput = document.getElementById('editBgInput');
// Which side a portrait's card hangs on — see bioSideOf.
const editBioSide = makeChoiceGroup('editBioSide', ()=>{ queueNodeEditCommit(0); });
/* An entry's border style, picked rather than typed — the same six the
   connectors offer, drawn as the lines they are. Declared here beside the
   colour fields it belongs with; makeChoiceGroup is a function declaration
   further down the file and is hoisted. */
const editBorderStyle = makeChoiceGroup('editBorderStyle', ()=>{
  queueNodeEditCommit(0);
});
const editTagsInput = document.getElementById('editTagsInput');
/* An entry's own face and size were four hidden controls: a pair in the
   Label box's toolbar and a pair mirroring them in the language rows'. None
   of the four was ever shown, so none was ever reachable — the drawer read
   its own unreachable values back on every commit, which is how `n.font`
   survived at all. The values still survive, and now by saying so: see
   commitNodeEdit, which carries the entry's face and size through
   untouched instead of asking a control that cannot be used. */
const editCardCheck = document.getElementById('editCardCheck');
const editCardField = document.getElementById('editCardField');
/* Card layout only means something for an entry that IS a box. A character
   bio is a portrait circle and the free-standing elements are a bare
   picture and a bare line of text — none of them has anything to divide
   into bands, so the switch is taken away rather than left there to do
   nothing. */
const CARD_CAPABLE = new Set(['rect','amalgam']);
/* Whether the entry was on card layout when the form was opened, kept
   apart from the checkbox.
 *
 * Some archetypes cannot carry a card, so the field is taken away for
 * them — and clearing the checkbox while it was hidden turned a passing
 * look at another archetype into a decision: choose ellipse, change your
 * mind, choose rect again, and the card layout was gone with nothing on
 * screen to say so. The choice is only lost when the entry is actually
 * left on an archetype that cannot hold it. */
let cardWanted = false;
function syncCardFieldVisibility(){
  const shape = editShapeInput.value || 'rect';
  const ok = CARD_CAPABLE.has(shape);
  editCardField.style.display = ok ? '' : 'none';
  editCardCheck.checked = ok && cardWanted;
}
function setTextColorControls(target, on){
  document.querySelectorAll(`[data-hex-for="${target}"], [data-hex-reset="${target}"]`)
    .forEach(elm=>{ elm.hidden = !on; });
}
function syncTextColorVisibility(){
  /* An amalgam paints its own text and offers no say in it: it wears the
     gradient of the lineages that merged into it — the same reason it has
     no border colour field either. A hand-set colour there is a second,
     contradictory answer to a question the merge has already settled.
   *
     A mirror reality used to be the other case, since its fill was its
     border and its ink was picked for contrast against that. It is not an
     archetype any more, and a background is now something any entry may
     have — so the colour control stays and readableOn steps in only where
     the ink would actually be lost. */
  const shape = editShapeInput.value || 'rect';
  const on = shape !== 'amalgam';
  /* The in-node field is on this list now that it is the only place an
     entry's words are typed — an amalgam offers no say in its ink there
     either. `__editLangTabs__` is the language rows' toolbar, which names
     itself that because it acts on whichever row was last touched. */
  ['nodeEditorText', '__editLangTabs__', 'detailNoteInput'].forEach(t=> setTextColorControls(t, on));
}
/* An amalgam has no border colour of its own to set: it wears the colours
   of the lineages that merged into it, and a field offering a second
   answer to that question could only ever disagree with the bar. */
function syncColorFieldVisibility(){
  const field = document.getElementById('editColorsField');
  if(field) field.hidden = (editShapeInput.value || 'rect') === 'amalgam';
}
const editMultiLangCheck = document.getElementById('editMultiLangCheck');
const editLangTabsField = document.getElementById('editLangTabsField');
const editLangTabList = document.getElementById('editLangTabList');
document.getElementById('editLangTabAdd').onclick = (ev)=>{ ev.stopPropagation(); makeLangTabRow(editLangTabList, null); };
const detailEditStatusEl = document.getElementById('detailEditStatus');
editMultiLangCheck.addEventListener('change', ()=>{
  editLangTabsField.style.display = editMultiLangCheck.checked ? '' : 'none';
});

// Shared by the detail-edit form and the Add Node form — both offer the
// same curated font list.
function populateFontOptions(selectEl){
  selectEl.innerHTML = '';
  FONT_OPTIONS.forEach(f=>{
    const opt = document.createElement('option');
    opt.value = f.key; opt.textContent = f.label;
    selectEl.appendChild(opt);
  });
}

/* ---------------------------------------------------------------------
   Font family/size appear in two toolbars per form — above the Label box
   and above the language-tabs box — because you shouldn't have to scroll
   back up to change the typeface of the text you're currently editing.
   There is still only ONE font per node, so the second pair are mirrors:
   editing either writes to both, and the save logic keeps reading the
   primary pair alone and never has to know the mirrors exist.
   ------------------------------------------------------------------ */
/* Two helpers kept a control and its copy in step, and a third filled the
   copy in when a form was populated. The copies were the hidden font and
   size pair beside the Label box; both they and the box are gone, and
   nothing else on this page has a control that exists twice. */
function parseTagsField(raw){
  return raw.trim() ? raw.split(',').map(s=>s.trim()).filter(Boolean) : [];
}
/* ---------------------------------------------------------------------
   Language-tab editor.

   One row per tab: a short tag on the left, the tab's own text on the
   right, and a button to drop the row. "+ Add tab" appends an empty one.
   The text side is a formatting-capable surface like the Label box, so a
   translation can carry its own bold/italic/ruby; the B/I/Ruby buttons in
   the toolbar above act on whichever row's text you last had the cursor
   in, which is why the active row is tracked.
   ------------------------------------------------------------------ */
const langTabActiveSurface = new Map();   // list element -> the row surface last focused

function makeLangTabRow(list, tab){
  const row = document.createElement('div');
  row.className = 'lang-tab-row';

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'lang-tab-tag';
  tagInput.placeholder = 'EN';
  tagInput.maxLength = 8;
  tagInput.value = (tab && tab.tag) || '';

  const text = document.createElement('div');
  text.className = 'lang-tab-text rich-surface';
  text.contentEditable = 'true';
  text.spellcheck = false;
  text.dataset.placeholder = 'Text for this tab';
  text.innerHTML = markupToRichHtml((tab && tab.text) || '');
  text.addEventListener('focus', ()=> langTabActiveSurface.set(list, text));
  text.addEventListener('paste', ev=>{
    ev.preventDefault();
    const plain = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, plain);
  });
  /* These rows are built at runtime, so they missed the sweep that wired
     every field in the entry editor to the auto-commit when the Apply
     buttons were taken away. The result was a form that looked like it was
     working — rows appeared, text could be typed — while nothing ever
     reached the entry. Both fields commit on input, like every other
     control in this form.
     `commitLangTabs` is used rather than queueNodeEditCommit directly so
     the "add" and "remove" buttons can settle immediately: adding a row is
     a discrete act, not typing, and waiting out a typing pause for it just
     looks broken. */
  /* Typing a tab shows on the entry as it is typed, exactly as typing the
     label does. The debounced commit still does the real write (and owns
     the undo step); this only paints the live entry so the chips and the
     switched text keep up with the form. Without it a tab only appeared
     after the typing pause, which made the two halves of the same form
     behave differently for no reason the user could see. */
  const preview = ()=>{
    const n = selectedId && nodes.get(selectedId);
    if(!n) return;
    const tabs = collectLangTabs(list);
    n.langTabs = tabs.length ? tabs : null;
    n.multiLang = true;
    // A tab that has just lost its tag or text stops existing, so an
    // index pointing past the end has to come back to the default.
    const active = activeLangTab.get(n.id);
    if(active != null && (!n.langTabs || active >= n.langTabs.length)) activeLangTab.set(n.id, null);
    /* renderNodes builds every entry afresh, and what is hidden or stepped
       back is a class put on afterwards — so a redraw with nothing following
       it brings the whole chart back. Typing in a tab was the one preview
       that forgot to say so, and every entry a tag filter had hidden
       reappeared on the first keystroke and stayed until something else
       redrew. The label's preview has always put it back; this does too. */
    renderNodes();
    applyVisibility();
    if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
    paintMultiSelection();
  };
  const commit = ()=>{
    preview();
    if(typeof queueNodeEditCommit === 'function') queueNodeEditCommit();
  };
  tagInput.addEventListener('input', commit);
  text.addEventListener('input', commit);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'lang-tab-del';
  del.textContent = '×';
  del.title = 'Remove this tab';
  del.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(langTabActiveSurface.get(list) === text) langTabActiveSurface.delete(list);
    row.remove();
    preview();
    if(typeof queueNodeEditCommit === 'function') queueNodeEditCommit(0);
  });

  row.appendChild(tagInput);
  row.appendChild(text);
  row.appendChild(del);
  list.appendChild(row);
  return row;
}
function fillLangTabs(list, tabs){
  list.innerHTML = '';
  langTabActiveSurface.delete(list);
  (tabs && tabs.length ? tabs : [null]).forEach(t=> makeLangTabRow(list, t));
}
// Rows with no tag or no text are simply not tabs yet, so they're dropped
// rather than reported as an error — an empty row is how a new one starts.
function collectLangTabs(list){
  const out = [];
  list.querySelectorAll('.lang-tab-row').forEach(row=>{
    const tag = row.querySelector('.lang-tab-tag').value.trim();
    const text = richHtmlToMarkup(row.querySelector('.lang-tab-text')).trim();
    if(tag && text) out.push({tag, text});
  });
  return out;
}

function setEditStatus(kind, msg){ detailEditStatusEl.className = 'editor-status show ' + kind; detailEditStatusEl.textContent = msg; }
function clearEditStatus(){ detailEditStatusEl.className = 'editor-status'; detailEditStatusEl.textContent = ''; }
function closeEditForm(){
  // A change still sitting in the typing pause is a change the user made;
  // closing settles it rather than throwing it away.
  if(typeof flushNodeEditCommit === 'function') flushNodeEditCommit();
  if(typeof endLabelPreview === 'function') endLabelPreview(false);
  detailEditForm.style.display = 'none';
  detailEditToggle.classList.remove('active');
  showNoteBlock(true);
  clearEditStatus();
  if(typeof syncTagLiveliness === 'function') syncTagLiveliness();
}

detailEditToggle.onclick = (ev)=>{
  ev.stopPropagation();
  if(!selectedId) return;
  const n = nodes.get(selectedId);
  if(!n) return;
  const opening = detailEditForm.style.display === 'none' || !detailEditForm.style.display;
  if(opening){
    editLinkInput.value = n.link || '';
    /* The field shows the colour the entry actually HAS. It used to be
       left blank to mean "the default", which asked the reader to know
       what the default was and gave them nothing to edit — the commonest
       thing you want to do here is nudge the current colour, and you
       cannot nudge a blank. */
    editColorsInput.value = (n.colors && n.colors.length)
      ? n.colors.join(', ')
      : (n.color || DEFAULT_NODE_COLOR);
    if(paintEditSwatches) paintEditSwatches();
    /* Empty means "on the paper", which is a real answer rather than a
       missing one — so unlike the border field this one is left blank when
       the entry has no background of its own. */
    editBgInput.value = (n.bg && n.bg.length) ? n.bg.join(', ') : '';
    if(paintEditBgSwatches) paintEditBgSwatches();
    if(typeof window.syncBgResetState === 'function') window.syncBgResetState();
    editBorderStyle.value = borderStyleOf(n);
    editShapeInput.value = n.shape || 'rect';
    editImageInput.value = n.image || '';
    if(editBioCardCheck) editBioCardCheck.checked = !!n.bioCard;
    editBioSide.value = bioSideOf(n);
    syncBioCardField(editShapeInput);
    syncImageFieldVisibility(editShapeInput, editImageField);
    syncLabelFieldForShape(editShapeInput);
    editTagsInput.value = (n.tags && n.tags.length) ? n.tags.join(', ') : '';
    if(repaintEditTags) repaintEditTags();
    editCardCheck.checked = !!n.card;
    cardWanted = !!n.card;
    if(typeof window.syncColorsResetState === 'function') window.syncColorsResetState();
    syncCardFieldVisibility();
    syncTextColorVisibility();
    syncColorFieldVisibility();
    editMultiLangCheck.checked = !!n.multiLang;
    fillLangTabs(editLangTabList, n.langTabs);
    editLangTabsField.style.display = n.multiLang ? '' : 'none';
    detailEditForm.style.display = 'block';
    detailEditToggle.classList.add('active');
    showNoteBlock(false);
    clearEditStatus();
    beginLabelPreview(selectedId);
    beginNodeEditSession();
  } else {
    closeEditForm();
  }
  // Opening an entry's settings is looking at that entry — see
  // syncTagLiveliness — so its decorations perform for as long as they stay
  // open, without the reader having to keep the pointer on the box.
  syncTagLiveliness();
};

/* Every control in the entry editor commits by itself. Typed fields wait
   out a short pause so a word is one edit; the ones you pick rather than
   type settle immediately, because there is no half-finished state to wait
   for. */
// Reached by id rather than through the module consts: several of those
// are declared further down the file than this block runs.
['editLinkInput','editColorsInput','editBgInput','editTagsInput',
 'editImageInput'].forEach(id=>{
  const field = document.getElementById(id);
  if(!field) return;
  field.addEventListener('input', ()=> queueNodeEditCommit());
  field.addEventListener('blur', ()=> flushNodeEditCommit());
});
['editShapeInput','editMultiLangCheck','editCardCheck','editBioCardCheck'].forEach(id=>{
  const field = document.getElementById(id);
  if(!field) return;
  field.addEventListener('change', ()=>{
    // Turning card layout on reveals the picture field it needs — and is
    // the only thing that changes what the reader asked for.
    if(id === 'editCardCheck'){
      cardWanted = editCardCheck.checked;
      syncImageFieldVisibility(editShapeInput, editImageField);
    }
    queueNodeEditCommit(0);
  });
});


/* ---------------------------------------------------------------------
   Live label preview.

   While the label field is open, what you type is drawn straight onto the
   entry itself — including the way the box grows and re-wraps around a
   longer name — so you are editing the chart rather than editing a form
   about the chart. It touches only the rendered model, never the saved
   data; the commit that follows a moment later is what makes it real, and
   the whole session is a single step of undo.
   ------------------------------------------------------------------ */
let labelPreview = null;      // {id, original} while a preview is running
let labelPreviewFrame = 0;

/* Which text the live preview is painting.
 *
 * An entry showing a language tab is showing that tab's words, not its
 * label, so a field opened on it is editing the tab — and the preview has
 * to put the typing back into the same place the field took it from, or
 * what appears under the caret is the label with somebody else's words in
 * it. `tab` is the index into langTabs, or null for the entry's own label. */
function beginLabelPreview(id, input, tab){
  const n = nodes.get(id);
  if(!n) return;
  /* The field is always named now. It used to default to the drawer's
     Label box, which was the only other place an entry's words could be
     typed; there is one place, and the caller knows which field it is. */
  const field = input;
  if(!field) return;
  const k = (tab === undefined || tab === null) ? null : tab;
  if(labelPreview && labelPreview.id === id && labelPreview.input === field &&
     labelPreview.tab === k) return;
  endLabelPreview(false);
  const original = (k !== null && n.langTabs && n.langTabs[k])
    ? (n.langTabs[k].text || '') : n.label;
  labelPreview = { id, original, input: field, tab: k };
}
function renderLabelPreview(){
  if(!labelPreview) return;
  const n = nodes.get(labelPreview.id);
  if(!n) return;
  const k = labelPreview.tab;
  if(k !== null && k !== undefined && n.langTabs && n.langTabs[k]){
    n.langTabs[k].text = labelPreview.input.value;
  } else {
    n.label = labelPreview.input.value;
  }
  renderNodes();
  redrawEdges();
  applyVisibility();
  // Every entry has just been drawn afresh, so the highlight has to be put
  // back — otherwise the chart lights up whole on every keystroke.
  if(selectedId && nodes.has(selectedId)) paintSelectionHighlight(selectedId);
  paintMultiSelection();
  drawBioCard();
  const g = qNode(`.node[data-id="${cssEscape(labelPreview.id)}"]`);
  if(g) g.classList.add('selected');
  // The entry has just changed shape under the field, so the field follows.
  if(typeof nodeEditorTarget !== 'undefined' && nodeEditorTarget &&
     typeof positionNodeEditor === 'function') positionNodeEditor();
}
function queueLabelPreview(){
  if(!labelPreview) return;
  if(labelPreviewFrame) cancelAnimationFrame(labelPreviewFrame);
  labelPreviewFrame = requestAnimationFrame(()=>{ labelPreviewFrame = 0; renderLabelPreview(); });
}
// commit=false rolls the drawing back to the text the entry had before the
// form was opened; commit=true just drops the preview, because the real
// edit is about to redraw everything anyway.
function endLabelPreview(commit){
  if(!labelPreview) return;
  const prev = labelPreview;
  labelPreview = null;
  if(labelPreviewFrame){ cancelAnimationFrame(labelPreviewFrame); labelPreviewFrame = 0; }
  if(commit) return;
  const n = nodes.get(prev.id);
  if(n && n.label !== prev.original){
    n.label = prev.original;
    renderNodes(); redrawEdges(); applyVisibility(); paintMultiSelection();
    drawBioCard();
  }
}
/* An id for something in <defs>, made from an entry's id.
 *
 * It used to be `prefix + id.replace(/[^a-zA-Z0-9_-]/g,'_')`, which is not a
 * function that can be inverted and not one that is injective either: two
 * entries whose ids differ only in the characters being replaced — "Ark 2"
 * and "Ark.2", or the same name written in two scripts — came out as the
 * same string, so the second one's clip path overwrote the first's and one
 * entry was clipped by the other's mask. Nothing warned, because an id
 * collision inside <defs> is legal SVG: the last one simply wins.
 *
 * The readable part is kept, because a definition you cannot recognise in
 * the inspector is a definition you cannot debug, and a short hash of the
 * ORIGINAL id is appended, which is what makes it injective in practice. */
function defId(prefix, raw){
  const s = String(raw);
  let h = 0;
  for(let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return prefix + s.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + (h >>> 0).toString(36);
}

/* Select the entry and open its settings — the whole path a double click
   on something whose words are NOT on it is asking for, in one call.
 *
 * It used to put the cursor in the drawer's Label box as well, and was
 * named for that. The box is gone and the words are typed on the entry
 * itself, so what is left is the half that was always the point: pick the
 * entry out and show everything about it that is not its text. */
function openEntrySettings(id){
  if(selectedId !== id){ selectNode(id); paintMultiSelection(); }
  if(detailEditForm.style.display === 'none' || !detailEditForm.style.display){
    detailEditToggle.onclick({stopPropagation(){}});
  }
}

