/* ---------------------------------------------------------------------
   The note editor in the detail drawer.

   It sits in the drawer rather than inside the entry form because a note
   is the thing you read when you click a node, and wanting to fix a word
   in it shouldn't mean opening a separate editing mode for the whole
   entry. It shows as plain italic text until you press the pencil, and
   Apply commits it and locks the field again.
   ------------------------------------------------------------------ */
const detailNoteInput = document.getElementById('detailNoteInput');
const detailNoteEditBtn = document.getElementById('detailNoteEdit');
const detailNoteToolbar = document.getElementById('detailNoteToolbar');
const detailNoteActions = document.getElementById('detailNoteActions');
const detailNoteSurface = richFields.get('detailNoteInput').surface;
let detailNoteEditing = false;

function setDetailNoteEditing(on){
  detailNoteEditing = on;
  detailNoteSurface.contentEditable = on ? 'true' : 'false';
  detailNoteSurface.classList.toggle('locked', !on);
  // makeRichField sets a min-height inline to match the textarea it stood
  // in for; inline styles outrank the .locked rule, so it has to be
  // cleared by hand or a one-line note would still reserve three rows.
  detailNoteSurface.style.minHeight = on ? '74px' : '';
  detailNoteToolbar.style.display = on ? '' : 'none';
  detailNoteActions.style.display = on ? '' : 'none';
  detailNoteEditBtn.classList.toggle('active', on);
  if(on) detailNoteSurface.focus();
}
function showDetailNote(markup){
  setRichValue(detailNoteInput, markup);
  setDetailNoteEditing(false);
  syncNoteExpandBtn();
}
/* Nothing to open at full size when there is nothing written.
 *
 * The button is the drawer's answer to a note too long for a column three
 * hundred pixels wide; on an entry with no note it offered to show an
 * empty card, which is a control that cannot do anything. */
function syncNoteExpandBtn(){
  const btn = document.getElementById('detailNoteExpand');
  if(!btn) return;
  const text = (detailNoteInput && detailNoteInput.value || '').trim();
  btn.style.display = text ? '' : 'none';
}
/* The note settles as it is written, like every other field.
 *
 * It was the one place in the entry editor that waited for a button.
 * Everything else — the label, the colours, the archetype — takes effect
 * as you make the change, so nobody expected this one to be different:
 * type a note, click the next entry, and the words were gone. Nothing was
 * stored, the Save button still said "Saved", and there was nothing to
 * undo, because as far as the chart was concerned nothing had happened.
 *
 * So it commits on a pause, exactly as the label does, and the whole time
 * the field is open is one step of undo. Apply now means "I have
 * finished"; Cancel means "put it back the way it was when I started",
 * which is a promise the field can only keep by remembering that. */
let detailNoteUndoPushed = false;
let detailNoteOriginal = '';
let detailNoteTimer = 0;
let detailNoteOwner = null;      // the entry the open editor belongs to
function commitDetailNote(){
  const id = detailNoteOwner;
  if(!id || readOnlyView) return;
  const n = nodes.get(id);
  if(!n) return;
  const text = detailNoteInput.value.trim();
  if((n.note || '') === text) return;
  if(!detailNoteUndoPushed){ pushUndo(); detailNoteUndoPushed = true; }
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    found.entry[4] = text || undefined;
    putEntry(found.index, found.entry, entryOpts(found.entry));
  });
}
function queueDetailNoteCommit(){
  if(detailNoteTimer) clearTimeout(detailNoteTimer);
  detailNoteTimer = setTimeout(()=>{ detailNoteTimer = 0; commitDetailNote(); }, 480);
}
function flushDetailNoteCommit(){
  if(detailNoteTimer){ clearTimeout(detailNoteTimer); detailNoteTimer = 0; }
  commitDetailNote();
}
detailNoteSurface.addEventListener('input', ()=>{
  syncNoteExpandBtn();
  if(detailNoteEditing) queueDetailNoteCommit();
});
detailNoteSurface.addEventListener('blur', ()=>{ if(detailNoteEditing) flushDetailNoteCommit(); });
detailNoteEditBtn.onclick = (ev)=>{
  ev.stopPropagation();
  if(!selectedId || readOnlyView) return;
  if(detailNoteEditing){ flushDetailNoteCommit(); setDetailNoteEditing(false); return; }
  const n = nodes.get(selectedId);
  detailNoteOwner = selectedId;
  detailNoteOriginal = n ? (n.note || '') : '';
  detailNoteUndoPushed = false;
  setDetailNoteEditing(true);
};
document.getElementById('detailNoteCancel').onclick = (ev)=>{
  ev.stopPropagation();
  const id = detailNoteOwner;
  if(detailNoteTimer){ clearTimeout(detailNoteTimer); detailNoteTimer = 0; }
  if(id){
    // Back to the words that were there when the pencil was pressed —
    // undoing whatever settled itself along the way.
    setRichValue(detailNoteInput, detailNoteOriginal);
    commitDetailNote();
  }
  const n = nodes.get(selectedId);
  showDetailNote(n ? (n.note || '') : '');
  detailNoteOwner = null;
};
document.getElementById('detailNoteApply').onclick = (ev)=>{
  ev.stopPropagation();
  flushDetailNoteCommit();
  setDetailNoteEditing(false);
  detailNoteOwner = null;
};

/* ---------------------------------------------------------------------
   The entry editor commits as you work.

   There is no Apply to press: a change to the text, the colours, the
   archetype or the font takes effect the moment you make it, exactly like
   dragging an entry does. Typing is settled after a short pause so a
   sentence is one edit rather than one per keystroke, and the whole
   editing session collapses into a single step of undo — pressing Ctrl+Z
   once puts the entry back the way it was before you opened the form,
   instead of walking backwards letter by letter.

   Nothing is published until Save; this is the same local-edit model the
   rest of the chart uses.
   ------------------------------------------------------------------ */
let nodeEditUndoPushed = false;   // one undo step per editing session
let nodeEditTimer = 0;

function beginNodeEditSession(){ nodeEditUndoPushed = false; }
function pushNodeEditUndoOnce(){
  if(nodeEditUndoPushed) return;
  pushUndo();
  nodeEditUndoPushed = true;
}
function queueNodeEditCommit(delay){
  if(nodeEditTimer) clearTimeout(nodeEditTimer);
  nodeEditTimer = setTimeout(()=>{ nodeEditTimer = 0; commitNodeEdit(); }, delay === undefined ? 480 : delay);
}
function flushNodeEditCommit(){
  if(!nodeEditTimer) return;
  clearTimeout(nodeEditTimer); nodeEditTimer = 0;
  commitNodeEdit();
}

function commitNodeEdit(){
  if(!selectedId || readOnlyView) return;
  if(detailEditForm.style.display !== 'block') return;
  const id = selectedId;
  clearEditStatus();
  /* The words are not this form's any more — they are typed on the entry
     itself — so what the entry already says is what it goes on saying. It
     is still written back, because putEntry rewrites the whole record and
     a field left out of it is a field deleted. */
  const kept0 = nodes.get(id);
  const newLabel = (kept0 && kept0.label) || '';
  /* An empty label is an edit like any other.
   *
     This used to refuse to commit one, on the reasoning that an empty field
     is a sentence half deleted rather than a decision. In practice it meant
     the one edit you could not make was "take these words away": you
     selected the label, pressed Delete, watched the box empty out, clicked
     away — and the old text came straight back, because nothing had been
     written down. Entries are allowed to hold no text now (see the add
     form), so an empty field simply means an empty entry. */
  endLabelPreview(true);
  const newLink = editLinkInput.value.trim();
  const colorsRaw = editColorsInput.value.trim();
  let newColors = [];
  if(colorsRaw){
    newColors = colorsRaw.split(',').map(s=>s.trim()).filter(Boolean);
    for(const c of newColors){
      if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)){
        setEditStatus('err', `"${c}" isn't a valid hex color yet (e.g. #c23b22) — the borders keep their current colours.`);
        return;
      }
    }
  }
  const bgRaw = editBgInput.value.trim();
  let newBg = [];
  if(bgRaw){
    newBg = bgRaw.split(',').map(s=>s.trim()).filter(Boolean);
    for(const c of newBg){
      if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)){
        setEditStatus('err', `"${c}" isn't a valid hex color yet (e.g. #f4e9c9) — the background keeps what it has.`);
        return;
      }
    }
  }
  const newBorder = editBorderStyle.value;
  const newShape = editShapeInput.value==='rect' ? undefined : editShapeInput.value;
  /* A CARD keeps a picture too — that is the whole of its first band.
     It was left off this list, so the field offered a picture, embedded
     the file, showed it on the entry while the form was open, and then
     dropped it on the first commit: choosing a picture for a card did
     nothing at all, twice over (see the form-open order below, which had
     the field hidden as well). */
  const cardNow = editCardCheck.checked && CARD_CAPABLE.has(editShapeInput.value || 'rect');
  const newImage = (newShape==='ellipse' || newShape==='image' || cardNow)
    ? editImageInput.value.trim() : '';
  /* …less whatever this archetype cannot wear. Changing an entry INTO a
     portrait is the other way the two scenery tags can arrive on one. */
  const newTags = keepAllowedTags(parseTagsField(editTagsInput.value), newShape);
  /* Carried through, not read back out of a control nobody could reach.
     The entry's own face and size were set by four hidden inputs that were
     never shown; the values are real and are kept, the controls are not. */
  const newFont = (kept0 && kept0.font) || undefined;
  const newFontSizeRaw = (kept0 && kept0.fontSize != null) ? String(kept0.fontSize) : '';
  let newFontSize;
  if(newFontSizeRaw){
    newFontSize = Number(newFontSizeRaw);
    if(!Number.isFinite(newFontSize) || newFontSize<6 || newFontSize>28){
      setEditStatus('err', 'Font size has to be between 6 and 28.');
      return;
    }
  }
  const newCard = cardNow;
  const newMultiLang = editMultiLangCheck.checked;
  /* The chips carry each tab's WORDS as well as its name, and the words
     are typed somewhere else — on the entry, with that tab chosen. So what
     the entry holds is read back into the chips before the form is
     collected; without it, saving anything at all in this form would put
     back whatever the tab said when the form was opened. */
  if(typeof syncLangTabTexts === 'function') syncLangTabTexts(nodes.get(id));
  const newLangTabs = newMultiLang ? collectLangTabs(editLangTabList) : [];
  // Turning multi-language on before naming a tab is a normal
  // half-finished state, not an error to shout about — an unnamed chip is
  // not a tab yet.
  pushNodeEditUndoOnce();
  let dropped = 0;
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    const entry = found.entry;
    /* …and if the words changed, the box goes back to the size they ask
       for — see commitNodeEditorText, which says why. Asked BEFORE the
       new label is written, or the answer is always no. */
    const labelChanged = (entry[1] !== newLabel);
    entry[1] = newLabel;
    entry[5] = newShape;   // the note has its own editor in the drawer
    const opts = entryOpts(entry);
    if(newLink) opts.link = newLink; else delete opts.link;
    if(newColors.length) opts.colors = capColors(newColors, newShape); else delete opts.colors;
    if(newBg.length) opts.bg = newBg; else delete opts.bg;
    if(newBorder && newBorder !== 'solid') opts.border = newBorder; else delete opts.border;
    if(newTags.length) opts.tags = newTags; else delete opts.tags;
    if(newFont) opts.font = newFont; else delete opts.font;
    if(newFontSize) opts.fontSize = newFontSize; else delete opts.fontSize;
    if(newImage) opts.image = newImage; else delete opts.image;
    if(newCard) opts.card = true; else delete opts.card;
    if(labelChanged) delete opts.size;
    /* Both belong to a card that HAS a picture: they are answers about
       one, and an entry that is no longer a card should not carry the
       answer back if it becomes one again with something else in it. */
    const cardImg = (typeof cardImageOptsFromForm === 'function')
      ? cardImageOptsFromForm() : {crop:false};
    if(newCard && newImage && cardImg.crop) opts.cardCrop = true; else delete opts.cardCrop;
    /* The picture's own size is set on the picture, by dragging its
       corners, so this form carries whatever it already had rather than
       asking a control about it — and lets it go with the card or the
       picture it belonged to. */
    if(!newCard || !newImage) delete opts.cardImgH;
    /* The card's middle line. */
    {
      const med = (typeof editMediumInput !== 'undefined' && editMediumInput)
        ? editMediumInput.value.trim() : '';
      if(newCard && med) opts.medium = med; else delete opts.medium;
    }
    /* Only a portrait keeps a card, so the choice goes with the archetype
       rather than lingering on an entry that has no card at all. */
    if(newShape === 'ellipse' && editBioCardCheck && editBioCardCheck.checked)
      opts.bioCard = true;
    else delete opts.bioCard;
    const side = editBioSide.value;
    if(newShape === 'ellipse' && (side === 'left' || side === 'right')) opts.bioSide = side;
    else delete opts.bioSide;
    if(newMultiLang) opts.multiLang = true; else delete opts.multiLang;
    if(newMultiLang && newLangTabs.length) opts.langTabs = newLangTabs; else delete opts.langTabs;
    putEntry(found.index, entry, opts);
    /* Borders that have gone take their connectors with them — AFTER the
       entry itself has been written back, not before.
     *
     * `found.entry` is a copy taken at the top of this function. When one
     * of the doomed connectors POINTS AT the entry being edited, dropping
     * it rewrites that same entry's parents and writes it back — and the
     * line above then wrote this older copy over the top, restoring the
     * parent. The connector lost its style record and kept its
     * connection: it carried on being drawn, silently reattached to the
     * outermost border, which is exactly the confusion this exists to
     * prevent. */
    dropped = dropEdgesOnMissingRings(id, opts.colors ? opts.colors.length : 1);
  });
  if(dropped) setEditStatus('ok', dropped === 1
    ? 'One connector belonged to a border that is gone, and went with it.'
    : `${dropped} connectors belonged to borders that are gone, and went with them.`);
  // The commit consumed the preview; arm a fresh one so the next keystroke
  // still draws itself on the entry.
  if(detailEditForm.style.display === 'block' && nodes.has(id)) beginLabelPreview(id);
}

// Like applyEdit, but without its own undo push — the session already
// pushed one, so a run of small changes stays one step.
function commitEntry(mutate){
  mutate();
  rebuildChart();
  refreshSaveUI();
}

/* ---------------------------------------------------------------------
   Edge style popover — click any arrow on the chart to style just that
   one edge (routing + line pattern + arrowhead), live-previewed as you
   adjust it. Not a modal: a small card positioned near the click, no
   backdrop, closed by its ✕ or a click anywhere outside it. Overrides are
   stored in EDGE_STYLES, one entry per customized edge; picking the
   defaults back removes the entry instead of storing a redundant one.
   ------------------------------------------------------------------ */
function serializeEdgeStyles(list){
  if(!list.length) return 'const EDGE_STYLES = [];';
  return 'const EDGE_STYLES = [\n' + list.map(s=>
    `  {from:${jsStr(s.from)}, to:${jsStr(s.to)}, routing:${jsStr(s.routing)}, dash:${jsStr(s.dash)}, arrow:${jsVal(s.arrow)}${s.arrowIn ? `, arrowIn:true` : ''}${s.sinusoid ? `, sinusoid:true` : ''}${s.note ? `, note:${jsStr(s.note)}` : ''}${s.note && s.notePos && s.notePos !== 'above' ? `, notePos:${jsStr(s.notePos)}` : ''}${s.note && typeof s.noteAt === 'number' && s.noteAt !== 0.5 ? `, noteAt:${+s.noteAt.toFixed(4)}` : ''}${s.note && validSnap(s.noteSnap) ? `, noteSnap:${jsStr(s.noteSnap)}` : ''}${s.noteBg ? `, noteBg:${jsStr(s.noteBg)}` : ''}${(s.bends && s.bends.length) ? `, bends:${jsVal(s.bends)}` : ''}${s.color ? `, color:${jsStr(s.color)}` : ''}${s.color && s.colorFixed ? `, colorFixed:true` : ''}${s.gradient ? `, gradient:${jsVal(s.gradient)}` : ''}${s.fromSide ? `, fromSide:${jsStr(s.fromSide)}` : ''}${s.toSide ? `, toSide:${jsStr(s.toSide)}` : ''}${s.fromRing ? `, fromRing:${s.fromRing}` : ''}${s.toRing ? `, toRing:${s.toRing}` : ''}},`
  ).join('\n') + '\n];';
}

function serializeComments(list){
  if(!list.length) return 'const COMMENTS = [\n];';
  return 'const COMMENTS = [\n' + list.map(c=>
    `  {id:${jsStr(c.id)}, nick:${jsStr(c.nick)}, kind:${jsStr(c.kind)}, at:${jsStr(c.at)}, text:${jsStr(c.text)}${c.done ? ', done:true' : ''}},`
  ).join('\n') + '\n];';
}
function serializeSettings(o){
  return `const SETTINGS = {refColor: ${jsStr(o.refColor || DEFAULT_REF_COLOR)}};`;
}
function serializeRefs(list){
  if(!list.length) return 'const REFS = [\n];';
  return 'const REFS = [\n' + list.map(r=>
    `  {key:${jsStr(r.key)}, title:${jsStr(r.title||'')}${r.detail ? `, detail:${jsStr(r.detail)}` : ''}${r.url ? `, url:${jsStr(r.url)}` : ''}},`
  ).join('\n') + '\n];';
}
function serializeTagCats(list){
  if(!list.length) return 'const TAG_CATS = [\n];';
  return 'const TAG_CATS = [\n' + list.map(c=>
    `  {name:${jsStr(c.name)}, tags:[${(c.tags||[]).map(jsStr).join(', ')}]},`
  ).join('\n') + '\n];';
}
/* An embedded figure, written the way a sticker is: one line per item,
   the source last because it is the long part. */
function serializeMedia(list){
  if(!list.length) return 'const MEDIA = [\n];';
  return 'const MEDIA = [\n' + list.map(m=>
    `  {key:${jsStr(m.key)}, name:${jsStr(m.name || m.key)}, kind:${jsStr(m.kind || 'image')}, src:${jsStr(m.src)}},`
  ).join('\n') + '\n];';
}
function serializeStickers(list){
  if(!list.length) return 'const STICKERS = [\n];';
  return 'const STICKERS = [\n' + list.map(s=>
    `  {key:${jsStr(s.key)}, name:${jsStr(s.name || s.key)}, src:${jsStr(s.src)}},`
  ).join('\n') + '\n];';
}

const edgePopover = document.getElementById('edgePopover');

/* Each setting is a strip of small buttons rather than a dropdown, so the
   whole popover fits in a column you can read at a glance. A group behaves
   exactly like a <select>: one value at a time, read with .value. */
function makeChoiceGroup(id, onChange){
  const root = document.getElementById(id);
  const buttons = Array.from(root.querySelectorAll('button'));
  const group = {
    root,
    get value(){
      const on = buttons.find(b=>b.classList.contains('on'));
      return on ? on.dataset.value : buttons[0].dataset.value;
    },
    set value(v){
      buttons.forEach(b=> b.classList.toggle('on', b.dataset.value === v));
      if(!buttons.some(b=>b.classList.contains('on'))) buttons[0].classList.add('on');
    }
  };
  buttons.forEach(b=> b.addEventListener('click', ev=>{
    ev.stopPropagation();
    group.value = b.dataset.value;
    if(onChange) onChange();
  }));
  return group;
}
// Path stays a real dropdown: its two options need words to tell apart,
// where the others read fine as symbols.
const styleRoutingSel = document.getElementById('styleRouting');
styleRoutingSel.addEventListener('change', ()=> applyLiveEdgeStyle());
styleRoutingSel.addEventListener('click', ev=> ev.stopPropagation());
// "Sinusoid (wavy)" is one more option in the Line strip rather than a
// separate switch — reading it back out into the two underlying fields
// (dash pattern + independent sinusoid flag) happens via selDashValue().
const styleDashSel = makeChoiceGroup('styleDash', ()=>applyLiveEdgeStyle());
function selDashValue(){
  const v = styleDashSel.value;
  return v==='sinusoid' ? {dash:'solid', sinusoid:true} : {dash:v, sinusoid:false};
}

/* Arrowheads are two independent toggles, not one either/or: a connector
   can point at its target, back at its source, at both (a mutual link) or
   at neither (a plain tie). The pair behaves like two checkboxes drawn as
   symbol buttons. */
function makeToggleGroup(id, onChange){
  const root = document.getElementById(id);
  const buttons = Array.from(root.querySelectorAll('button'));
  const group = {
    get(name){
      const b = buttons.find(x=>x.dataset.end === name);
      return !!(b && b.classList.contains('on'));
    },
    set(name, on){
      const b = buttons.find(x=>x.dataset.end === name);
      if(b) b.classList.toggle('on', !!on);
    }
  };
  buttons.forEach(b=> b.addEventListener('click', ev=>{
    ev.stopPropagation();
    b.classList.toggle('on');
    if(onChange) onChange();
  }));
  return group;
}
const styleArrowEnds = makeToggleGroup('styleArrowEnds', ()=>applyLiveEdgeStyle());
const stylePaintMode = makeChoiceGroup('stylePaintMode', ()=>{ syncColorRow(); applyLiveEdgeStyle(); });
const styleNoteSide = makeChoiceGroup('styleNoteSide', ()=>{ applyLiveEdgeStyle(); });
{
  const btn = document.getElementById('styleAddCallout');
  if(btn) btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(leaderPick){ endCalloutPick(); clearStyleStatus(); return; }
    beginCalloutPick();
  });
}
/* Starting a note.
 *
 * A note's words are written on the plate, which is the right place for
 * them and left one thing with no way in: a connector carrying no note has
 * no plate to double-click, so the first note could not be written at all.
 * The button puts an empty one on the middle of the line and opens the
 * field on it — the same two steps a reader would have taken by hand if
 * there had been anything to point at. Written nothing and clicked away,
 * the empty note takes itself out again; that is the editor's own rule for
 * an emptied note and it needs no help here. */
{
  const btn = document.getElementById('styleAddNote');
  if(btn) btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(readOnlyView || !currentEdgeStyleTarget) return;
    const {from, to} = currentEdgeStyleTarget;
    const kept = edgeStyleFor(from, to);
    if(!kept.note){
      pushUndo();
      applyEdit(()=>{
        setEdgeStyleOverride(from, to, Object.assign({}, kept, {
          note: '', notePos: kept.notePos || 'above', noteAt: 0.5
        }));
      });
    }
    /* The plate has to be on the screen before the field can stand on it,
       and an empty note draws no plate — so it is marked as being started,
       redrawn, and only then written on. */
    noteStarting = {from, to};
    redrawEdges();
    openEdgeNoteEditor(from, to);
  });
}
/* The note's words are not in this panel any more — they are written on
   the note itself. What is left here is the ground it is written on. */
const styleNoteBgInput = document.getElementById('styleNoteBg');
const styleColorInput = document.getElementById('styleColor');
const styleColor2Input = document.getElementById('styleColor2');
const styleColorRow = document.getElementById('styleColorRow');
const styleColorPreview = document.getElementById('styleColorPreview');

// Colours are typed as hex rather than picked from a swatch, so an exact
// value can be pasted in and read back out.
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function readHex(input){
  const v = input.value.trim();
  const ok = HEX_RE.test(v);
  input.classList.toggle('bad', v !== '' && !ok);
  return ok ? v : null;
}
// Shows only the fields the chosen paint mode actually uses.
function syncColorRow(){
  const mode = stylePaintMode.value;
  styleColorRow.style.display = mode === 'default' ? 'none' : 'flex';
  styleColor2Input.style.display = mode === 'gradient' ? '' : 'none';
  const c1 = readHex(styleColorInput) || currentEdgeNaturalColor;
  const c2 = readHex(styleColor2Input) || c1;
  styleColorPreview.style.background = mode === 'gradient'
    ? `linear-gradient(90deg, ${c1}, ${c2})`
    : c1;
}
const edgeStyleLabelEl = document.getElementById('edgeStyleLabel');
const styleStatusEl = document.getElementById('styleStatus');
const styleDeleteBtn = document.getElementById('styleDelete');
function setStyleStatus(kind, msg){ styleStatusEl.className = 'editor-status show ' + kind; styleStatusEl.textContent = msg; }
function clearStyleStatus(){ styleStatusEl.className = 'editor-status'; styleStatusEl.textContent = ''; }

let currentEdgeStyleTarget = null;   // {from,to} of the edge the popover is open for

function isDefaultEdgeStyle(style){
  return style.routing===DEFAULT_EDGE_STYLE.routing && style.dash===DEFAULT_EDGE_STYLE.dash &&
    style.arrow===DEFAULT_EDGE_STYLE.arrow && !style.arrowIn && !style.sinusoid &&
    !style.note && !style.color &&
    !style.gradient && !style.fromSide && !style.toSide && !style.fromRing && !style.toRing &&
    !(style.bends && style.bends.length);
}
function setEdgeStyleOverride(from, to, style){
  const idx = EDGE_STYLES.findIndex(s=>s.from===from && s.to===to);
  if(isDefaultEdgeStyle(style)){
    if(idx>=0) EDGE_STYLES.splice(idx,1);
  } else if(idx>=0){
    EDGE_STYLES[idx] = {from,to,...style};
  } else {
    EDGE_STYLES.push({from,to,...style});
  }
}
// Positions the (already-visible) popover near the click that opened it,
// clamped so it never runs off the edge of the chart area.
function positionEdgePopover(evt){
  // edgePopover's nearest positioned ancestor is .main (not .app — .main is
  // itself position:relative), so its left/top are relative to .main.
  const host = document.querySelector('.main').getBoundingClientRect();
  const rect = edgePopover.getBoundingClientRect();
  const margin = 10;
  let x = 16, y = 16;
  if(evt && typeof evt.clientX === 'number'){
    x = evt.clientX - host.left + 14;
    y = evt.clientY - host.top + 14;
  }
  x = Math.max(margin, Math.min(x, host.width - rect.width - margin));
  y = Math.max(margin, Math.min(y, host.height - rect.height - margin));
  edgePopover.style.left = x + 'px';
  edgePopover.style.top = y + 'px';
}

/* ---------------------------------------------------------------------
   The callout's own panel.

   A callout is an entry, and for a while that meant clicking one opened
   the entry editor: an archetype dropdown, a link field, border colours,
   tags, language tabs — a form about a thing that has none of those. What
   a callout has is words, and one decision beyond them: whether to keep
   it. So it gets a panel that is exactly that, wearing the connector
   popover's shell, because the two are the same kind of object — a small
   card that opens on the drawing beside what it belongs to.

   The words ARE the entry's label, so nothing new is stored and everything
   that already reads a label — search, export, the chart itself — goes on
   working without knowing this panel exists.
   ------------------------------------------------------------------ */
const calloutPopover = document.getElementById('calloutPopover');
let calloutTarget = null;          // the callout the panel is open on

