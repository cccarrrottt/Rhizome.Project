/* ---------------------------------------------------------------------
   The in-node editor.

   An entry's words used to be written in the settings drawer: click the
   entry, find the pencil, and type into a form at the other side of the
   screen while the thing being changed sat where it always was. The two
   were connected only by a live preview — which is to say, by the reader
   watching two places at once.

   They are one place now. A double click puts a field on the entry
   ITSELF, at the entry's own width, in the entry's own face and size and
   ink, with the toolbar floating just above it. Enter settles it; so does
   a click anywhere else, which is what a reader does next anyway. The
   drawer still holds everything an entry has that is not its words, and
   its Label field still works exactly as it did — this is a second way in,
   not a replacement for the form.

   The entry underneath keeps redrawing as you type, so it grows and wraps
   under the field, and the field is put back over it after every redraw.
   --------------------------------------------------------------------- */
const nodeEditor = document.getElementById('nodeEditor');
const nodeEditorText = document.getElementById('nodeEditorText');
/* `var`, deliberately: applyTransform runs while the page is still being
   built, long before this line is reached, and it asks whether the in-node
   field is open. A `let` is in its temporal dead zone until then — and a
   dead-zone read throws even from inside a typeof — so the first transform
   of the session took the whole boot down with it. */
var nodeEditorTarget = null, nodeEditorUndoPushed = false, nodeEditorCommitTimer = 0;
var noteEditorPaintFrame = 0;
/* WHAT the field is open on.
 *
 * Four things on this chart are a piece of text drawn on the drawing: an
 * entry's label, a portrait's card, a connector's note, and a callout. All
 * four used to be typed into a form somewhere else — three different forms
 * — and all four are now written where they are drawn, by one field. What
 * differs between them is only three questions: where is the box, what
 * does it currently say, and what does saying something else mean. So the
 * target is an object that answers those three, and everything else about
 * the field is the same code. */
function sameEditorTarget(a, b){
  if(!a || !b || a.kind !== b.kind) return false;
  // Two tabs of one entry are two different pieces of text, so moving
  // between them is opening the field somewhere else, not staying put.
  return a.kind === 'entry'
    ? (a.id === b.id && (a.tab ?? null) === (b.tab ?? null))
    : (a.from === b.from && a.to === b.to);
}
/* Which of an entry's texts is on the screen right now — its label, or the
   language tab it has been switched to. An entry with tabs shows one text
   at a time, and the one it is showing is the one a reader who double-clicks
   it means. */
function shownTabOf(id){
  const n = nodes.get(id);
  if(!n || !n.langTabs || !n.langTabs.length) return null;
  const k = activeLangTab.get(id);
  return (k == null || k < 0 || k >= n.langTabs.length) ? null : k;
}
/* Where the field goes: over the entry's own box — or, for a portrait,
   over the CARD, because a portrait's words are on the card and the circle
   holds a picture; or, for a connector's note, over the plate. */
function nodeEditorBoxFor(t){
  if(!t) return null;
  if(t.kind === 'note'){
    const plate = arrowLayer && arrowLayer.querySelector(
      `.edge-note[data-from="${cssEscape(t.from)}"][data-to="${cssEscape(t.to)}"] .edge-note-plate`);
    if(!plate) return null;
    const num = (k)=> parseFloat(plate.getAttribute(k) || '0');
    return {x:num('x'), y:num('y'), w:num('width'), h:num('height')};
  }
  const n = nodes.get(t.id);
  if(!n) return null;
  if((n.shape || '') === 'ellipse'){
    const g = bioCardLayer && bioCardLayer.querySelector(
      `.bio-card-g[data-id="${cssEscape(n.id)}"]`);
    /* The card's own rectangle, which the card wrote down for us — not the
       group's bounding box, which also contains the stub joining it to the
       portrait and so begins at the circle's rim. */
    const box = g && g.dataset.box && g.dataset.box.split(' ').map(Number);
    if(box && box.length === 4 && box.every(v=> Number.isFinite(v))){
      return {x:box[0], y:box[1], w:box[2], h:box[3]};
    }
  }
  return {x:n.x, y:n.y, w:n.w, h:(n.h || 0)};
}
function positionNodeEditor(){
  const box = nodeEditorBoxFor(nodeEditorTarget);
  if(!box){ closeNodeEditor(true); return; }
  const rec = richFields.get('nodeEditorText');
  if(!rec) return;
  const host = document.querySelector('.main').getBoundingClientRect();
  const r = svg.getBoundingClientRect();
  const left = (r.left - host.left) + box.x*vs + vx;
  const top  = (r.top  - host.top ) + box.y*vs + vy;
  /* The field is the entry's own width, so a label wraps in the field
     exactly where it will wrap on the entry. The toolbar is NOT: it is a
     row of buttons whose size is its own business, and squeezing it to the
     width of a narrow entry turned five controls into five rows.
   *
     The floor is in CHART units, not screen ones. Written as a flat 120
     screen pixels it stopped shrinking as the drawing was zoomed out while
     the type inside it went on shrinking — so at a distance the field was
     a wide box with a line of ants in it, several times the size of the
     entry it was standing on. Multiplied by the zoom, the field and its
     words shrink together and the two always read as one thing. */
  /* Whether the thing under the field wraps its own text. A portrait's card
     and a connector's plate are laid out to a fixed width and run to as many
     lines as they need; an entry's label is put on one line and allowed to
     run past the box. The field does the same as whatever it is covering —
     see the stylesheet, where the two cases are spelled out. */
  const tn = nodeEditorTarget.kind === 'entry' ? nodes.get(nodeEditorTarget.id) : null;
  const wraps = nodeEditorTarget.kind === 'note' || (tn && (tn.shape || '') === 'ellipse');
  nodeEditor.dataset.wrap = wraps ? 'on' : 'off';
  /* A floor, not a width, where the field may grow: it is `width:max-content`
     then, so it is the entry's width until the words need more, and then it
     is the words' width — which is what the entry itself does. Where it
     wraps, the width is the box's and is not negotiable. */
  const w = Math.max(NODE_EDITOR_MINW * vs, box.w*vs);
  if(wraps){
    rec.surface.style.minWidth = '';
    rec.surface.style.width = w + 'px';
  } else {
    rec.surface.style.width = '';
    rec.surface.style.minWidth = w + 'px';
  }
  const bar = document.getElementById('nodeEditorBar');
  const barH = bar ? bar.getBoundingClientRect().height : 0;
  const gap = 4;
  /* Vertically CENTRED on the entry, because that is where the entry
     writes its words. A field pinned to the top of the box would put what
     is being typed a line above where it will end up. */
  const fieldH = rec.surface.getBoundingClientRect().height || NODE_EDITOR_MINH * vs;
  const fieldTop = top + Math.max(0, (box.h*vs - fieldH)/2);
  const barW = bar ? bar.getBoundingClientRect().width : w;
  /* Grown past the entry, the field grows BOTH WAYS. An entry writes its
     words centred on itself and lets a long one hang off either end; a
     field pinned to the entry's left edge and growing rightwards would put
     the same words somewhere else entirely. */
  const fieldW = rec.surface.getBoundingClientRect().width || w;
  /* Only where it is allowed to grow. A field that wraps is the width of the
     thing it covers and starts where that thing starts; one that grows past
     the box is showing words that hang off both ends, and centring is the
     only placement that puts them where the drawing puts them. */
  const fieldLeft = wraps ? left : left - Math.max(0, (fieldW - box.w*vs) / 2);
  /* Kept on the page: an entry at the very top or edge of the view would
     put its toolbar where it cannot be reached. */
  const x = Math.max(6, Math.min(fieldLeft, host.width - Math.max(fieldW, barW) - 6));
  const y = Math.max(6, fieldTop - barH - gap);
  nodeEditor.style.left = x + 'px';
  nodeEditor.style.top  = y + 'px';
}
const NODE_EDITOR_MINW = 120, NODE_EDITOR_MINH = 22;
/* Whether this entry writes its words on itself. A picture has no words at
   all; everything else that carries text does. */
function nodeTakesInlineEditor(n){
  if(!n || readOnlyView) return false;
  return (n.shape || '') !== 'image';
}
function openNodeEditor(id, opts){
  const n = nodes.get(id);
  if(!n || !nodeTakesInlineEditor(n)) return false;
  /* A portrait's words live on its card, so the card has to be up before
     there is anywhere to put the field. */
  if((n.shape || '') === 'ellipse' && !bioCardLayer.querySelector(
       `.bio-card-g[data-id="${cssEscape(id)}"]`)){
    openBioCard(id);
  }
  return openTextEditorOn({kind:'entry', id, tab: shownTabOf(id)}, opts);
}
/* And the same field on a connector's note. */
function openEdgeNoteEditor(from, to, opts){
  if(readOnlyView) return false;
  const st = edgeStyleFor(from, to);
  /* Words, or a note that has just been asked for and has none yet — which
     is the only way a first note is ever written, since the field is where
     the words come from. Every edge carries an empty `note` by default, so
     emptiness alone cannot mean "there is a note here". */
  const starting = noteStarting && noteStarting.from === from && noteStarting.to === to;
  if(!st || (!st.note && !starting)) return false;
  return openTextEditorOn({kind:'note', from, to}, opts);
}
function openTextEditorOn(target, opts){
  if(readOnlyView) return false;
  if(nodeEditorTarget && !sameEditorTarget(nodeEditorTarget, target)) closeNodeEditor(true);
  if(!nodeEditorBoxFor(target)) return false;
  nodeEditorTarget = target;
  nodeEditorUndoPushed = false;
  if(target.kind === 'entry'){
    selectNode(target.id, {quiet:true, keepEditForm:true, keepSelection:true});
    paintMultiSelection();
    const nn = nodes.get(target.id);
    const tab = (target.tab != null && nn.langTabs) ? nn.langTabs[target.tab] : null;
    setRichValue(nodeEditorText, (tab ? tab.text : nn.label) || '');
  } else {
    setRichValue(nodeEditorText, edgeStyleFor(target.from, target.to).note || '');
  }
  nodeEditor.hidden = false;
  syncNodeEditorLook();
  /* An entry's box grows under the field as the words are typed; a note's
     plate is redrawn by the connector instead, so only the entry needs the
     live preview the drawer's Label field uses. */
  if(target.kind === 'entry') beginLabelPreview(target.id, nodeEditorText, target.tab);
  positionNodeEditor();
  const rec = richFields.get('nodeEditorText');
  if(rec && !(opts && opts.focus === false)){
    rec.surface.focus({preventScroll:true});
    try{
      const sel = window.getSelection(), r = document.createRange();
      r.selectNodeContents(rec.surface); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }catch(e){}
  }
  return true;
}
/* The field is set in the face, size, alignment and ink of whatever it is
   open on, so what is being typed looks like what it will be. */
function syncNodeEditorLook(){
  const rec = richFields.get('nodeEditorText');
  if(!rec || !nodeEditorTarget) return;
  if(nodeEditorTarget.kind === 'note'){
    rec.surface.style.fontFamily = EDGE_NOTE_FAMILY;
    rec.surface.style.fontSize = (EDGE_NOTE_FS * vs).toFixed(2) + 'px';
    rec.surface.style.lineHeight = (EDGE_NOTE_LINE_H * vs).toFixed(2) + 'px';
    return finishNodeEditorLook(rec);
  }
  const n = nodes.get(nodeEditorTarget.id);
  if(!n) return;
  const size = (n.fontSize && n.fontSize >= 6 && n.fontSize <= 28) ? n.fontSize : NODE_FS;
  rec.surface.style.fontFamily = fontFamilyFor(n.font);
  rec.surface.style.fontSize = (size * vs).toFixed(2) + 'px';
  rec.surface.style.lineHeight = (LINE_H * (size / NODE_FS) * vs).toFixed(2) + 'px';
  return finishNodeEditorLook(rec);
}
function finishNodeEditorLook(rec){
  /* A remark on a connector is written in the CONNECTOR'S ink — a note and
     a callout both follow the line they belong to — so the field offers no
     colour box while it is open on one of them. The ⟲ stays: it clears a
     face, a size, a bold or a rule, none of which is the line's to decide. */
  const hex = nodeEditor.querySelector('.tb-hex');
  const inherits = nodeEditorTarget &&
    (nodeEditorTarget.kind === 'note' ||
     (nodeEditorTarget.kind === 'entry' &&
      (nodes.get(nodeEditorTarget.id) || {}).shape === 'callout'));
  if(hex) hex.style.display = inherits ? 'none' : '';
  rec.surface.style.textAlign = nodeEditorAlign();
  /* The padding and the border scale too. Left at flat pixels they became
     most of the box as the drawing was zoomed out: six pixels of padding
     either side of type set at four is a field that is mostly margin, and
     the words no longer sat where the entry will put them. */
  rec.surface.style.padding = (3*vs).toFixed(2) + 'px ' + (6*vs).toFixed(2) + 'px';
  rec.surface.style.borderWidth = Math.max(0.6, 1.6*vs).toFixed(2) + 'px';
  rec.surface.style.borderRadius = (5*vs).toFixed(2) + 'px';
}
/* How the words are set in the field: the way the thing being edited sets
   them. Everything the field opens on — an entry's label, a caption, a
   connector's note, a callout — is centred on the drawing. */
function nodeEditorAlign(){ return 'center'; }
function commitNodeEditorText(){
  const t = nodeEditorTarget;
  if(!t || readOnlyView) return;
  const text = nodeEditorText.value;
  if(t.kind === 'note'){
    const kept = edgeStyleFor(t.from, t.to);
    if((kept.note || '') === text) return;
    if(!nodeEditorUndoPushed){ pushUndo(); nodeEditorUndoPushed = true; }
    applyEdit(()=>{
      /* A note written down to nothing is not a note: it goes the way an
         emptied note goes anywhere else, taking its placement with it. */
      const bare = Object.assign({}, edgeStyleFor(t.from, t.to));
      if(text.trim()) bare.note = text;
      else { delete bare.note; delete bare.notePos; delete bare.noteAt;
             delete bare.noteDir; delete bare.noteLen; delete bare.noteBg; }
      setEdgeStyleOverride(t.from, t.to, bare);
    });
    refreshSaveUI();
    return;
  }
  const id = t.id;
  const n = nodes.get(id);
  if(!n) return;
  const k = (t.tab != null && n.langTabs && n.langTabs[t.tab]) ? t.tab : null;
  const current = k !== null ? (n.langTabs[k].text || '') : (n.label || '');
  const was = labelPreview && labelPreview.id === id ? labelPreview.original : current;
  if(was === text) return;
  if(!nodeEditorUndoPushed){ pushUndo(); nodeEditorUndoPushed = true; }
  commitEntry(()=>{
    const found = workingEntry(id);
    if(!found) return;
    if(k !== null){
      /* A tab's words go back into the tab they came from, and nothing else
         about the entry is touched — the label, the other tabs and every
         option keep exactly what they had. */
      const opts = entryOpts(found.entry);
      const tabs = Array.isArray(opts.langTabs) ? opts.langTabs.map(x=> Object.assign({}, x)) : [];
      if(!tabs[k]) return;
      tabs[k].text = text;
      opts.langTabs = tabs;
      putEntry(found.index, found.entry, opts);
      return;
    }
    found.entry[1] = text;
    putEntry(found.index, found.entry, entryOpts(found.entry));
  });
  if(labelPreview && labelPreview.id === id) labelPreview.original = text;
}
function queueNodeEditorCommit(){
  if(nodeEditorCommitTimer) clearTimeout(nodeEditorCommitTimer);
  nodeEditorCommitTimer = setTimeout(()=>{ nodeEditorCommitTimer = 0; commitNodeEditorText(); }, 420);
}
function closeNodeEditor(keep){
  if(!nodeEditorTarget) return;
  if(nodeEditorCommitTimer){ clearTimeout(nodeEditorCommitTimer); nodeEditorCommitTimer = 0; }
  if(noteEditorPaintFrame){ cancelAnimationFrame(noteEditorPaintFrame); noteEditorPaintFrame = 0; }
  const wasNote = nodeEditorTarget.kind === 'note';
  if(keep !== false) commitNodeEditorText();
  if(typeof endLabelPreview === 'function') endLabelPreview(keep !== false);
  nodeEditor.hidden = true;
  nodeEditorTarget = null;
  nodeEditorUndoPushed = false;
  /* A note that was asked for and never written stops being drawn here.
     Whatever the field decided — words, or nothing — the note is now an
     ordinary one, and an ordinary one with no words is not drawn at all. */
  noteStarting = null;
  // A note left as a single space while it was being typed is not a note.
  if(wasNote){ redrawEdges(); applyVisibility(); }
}
setRichEnter('nodeEditorText', ()=> closeNodeEditor(true));
/* The surface writes through to this textarea, which fires no input event
   of its own, so both the preview and the commit are driven from the
   surface — the same wiring the drawer's Label and a callout's card use. */
(()=>{
  const rec = richFields.get('nodeEditorText');
  if(!rec) return;
  rec.surface.addEventListener('input', ()=>{
    queueNodeEditorCommit();
    // The entry is growing under the field, so the field follows it.
    requestAnimationFrame(positionNodeEditor);
  });
  /* A note has no live preview of its own — the connector redraws it — so
     the plate follows what is typed by being redrawn, on the same frame
     budget the entries use. */
  rec.surface.addEventListener('input', ()=>{
    if(!nodeEditorTarget || nodeEditorTarget.kind !== 'note') return;
    if(noteEditorPaintFrame) cancelAnimationFrame(noteEditorPaintFrame);
    noteEditorPaintFrame = requestAnimationFrame(()=>{
      noteEditorPaintFrame = 0;
      if(!nodeEditorTarget || nodeEditorTarget.kind !== 'note') return;
      const t = nodeEditorTarget;
      const kept = edgeStyleFor(t.from, t.to);
      setEdgeStyleOverride(t.from, t.to,
        Object.assign({}, kept, {note: nodeEditorText.value || ' '}));
      redrawEdges();
      applyVisibility();
      positionNodeEditor();
    });
  });
})();
/* Anywhere else settles it — the toolbar and its pickers excepted, since
   pressing a button on the field's own toolbar is working IN the field.
 *
 * The pickers are not inside the field: they are placed against the
 * viewport and live at the end of the page. They were excused here by
 * class names nothing on the page carries, so the press that chose a
 * sticker or a citation closed the field first — and the insert then
 * landed in a field that was no longer open. The names are the ones the
 * pickers actually wear. */
const NODE_EDITOR_SATELLITES = '#nodeEditor, .sticker-picker, #stickerPicker, #refPicker, #mediaPicker, .mini-toolbar';
document.addEventListener('mousedown', ev=>{
  if(!nodeEditorTarget) return;
  const t = ev.target;
  if(t && t.closest && t.closest(NODE_EDITOR_SATELLITES)) return;
  closeNodeEditor(true);
}, true);
/* A callout's little card is no longer opened by anything — a click only
   selects, and Delete removes what is selected. What is left here only
   makes sure a card that is somehow still up can be put away. */
function closeCalloutPopover(){
  calloutPopover.classList.remove('open');
  calloutTarget = null;
}
document.getElementById('calloutClose').onclick = (ev)=>{ ev.stopPropagation(); closeCalloutPopover(); };
document.getElementById('calloutDelete').onclick = (ev)=>{
  ev.stopPropagation();
  const id = calloutTarget;
  closeCalloutPopover();
  if(id && !readOnlyView) deleteNodes([id]);
};
calloutPopover.addEventListener('mousedown', ev=> ev.stopPropagation());
calloutPopover.addEventListener('click', ev=> ev.stopPropagation());
/* Anywhere else closes it, the way every other card on this page closes —
   except while a callout is being placed or carried, when the click is
   part of the gesture rather than a click somewhere else. */
document.addEventListener('click', (ev)=>{
  if(!calloutPopover.classList.contains('open')) return;
  /* A click INSIDE the card is not a click elsewhere.
   *
     This listens in the capture phase — it has to, or a click on the
     drawing would be swallowed by the drawing before it ever reached
     here — and capture runs before the target's own handler. So a press on
     the card's own Delete button closed the card first, clearing the
     callout it was about, and the button then had nothing to delete: the
     panel shut and the remark stayed on the chart. The popover's own
     stopPropagation cannot help, because propagation had not reached it
     yet. Containment is the test that answers correctly in either
     phase. */
  if(calloutPopover.contains(ev.target)) return;
  if(leaderPick || leaderJustPlaced) return;
  closeCalloutPopover();
}, true);

