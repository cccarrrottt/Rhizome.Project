/* ---------------------------------------------------------------------
   Selection / highlighting / detail panel
   ------------------------------------------------------------------ */
let selectedId = null;
/* Multi-selection. selectedId stays the "primary" one — the entry the
   detail drawer describes and the single-node commands act on — while
   multiSelection holds every id currently picked, including that one. A
   selection of one behaves exactly as it always did. */
/* Everything that fades when one entry is being looked at. The lines
   themselves, an amalgam's bar and its merged arrow all carry `.edge` and
   were always covered; the arrowheads and the beads are their own shapes
   in their own layer and were not, so selecting an entry faded the chart
   around it and left every arrowhead on top at full strength. An amalgam's
   pieces name the entry they merge into but no single source, so a bar is
   lit whenever the entry it feeds is — which is what it means. */
const DIMMABLE_EDGE_PARTS = '.edge, .edge-note, .edge-arrow, .amalgam-bead, .callout-leader';
const multiSelection = new Set();
/* Which entries and connectors are lit, and which step back.
 *
 * Pulled out of selectNode because the LIVE PREVIEW needs it too. Typing
 * in a label redraws every entry from scratch to show the words as they
 * are typed, and a freshly drawn entry carries no highlight — so the whole
 * chart came back to full strength on every keystroke and dimmed again a
 * moment later when the edit settled. From the outside: the chart flashing
 * at you while you type. */
function paintSelectionHighlight(id){
  const n = nodes.get(id);
  if(!n) return;
  /* A picture or a loose caption belongs to no lineage, so there is
     nothing for it to light and nothing that should step back for it.
   *
     It used to fall through to the arithmetic below, which found it
     related to exactly itself and faded the ENTIRE chart out behind it.
     Nobody saw that from a click, because selectNode returns early for a
     free element and never reaches here — but the live text preview calls
     this directly on every keystroke, so colouring a word in a caption, or
     bolding it, or pressing the reset button, dimmed the whole drawing to
     a ghost until the commit a half-second later redrew it. A flash of
     transparency across the chart, on every press of every formatting
     button. It clears the wash instead, which is also the right answer
     when a free element is selected after an entry that had dimmed
     things. */
  if(isFreeShape(n.shape || '')){
    qNodes('.node').forEach(g=>{
      g.classList.toggle('selected', g.dataset.id === id);
      g.classList.remove('dim');
    });
    auraLayer.querySelectorAll('.node-aura').forEach(g=> g.classList.remove('dim'));
    qEdges(DIMMABLE_EDGE_PARTS).forEach(p=>{ p.classList.remove('lit'); p.classList.remove('dim'); });
    if(typeof paintBioCardDim === 'function') paintBioCardDim();
    syncTagLiveliness();
    return;
  }
  const related = new Set([id]);
  n.parents.forEach(p=>related.add(p));
  n.children.forEach(c=>related.add(c));
  /* A callout is part of the connector it points at.
   *
     Selecting an entry lights the lines that reach it and steps everything
     else back — and a remark ABOUT one of those lines was being stepped
     back with the rest of the chart, so picking an entry faded out the
     very note explaining how it is joined to its neighbour. Whatever is
     lit takes its callouts with it. */
  nodes.forEach(c=>{
    if(!isCalloutNode(c) || !c.leader) return;
    if(c.leader.from === id || c.leader.to === id ||
       (multiSelection.size > 1 && (related.has(c.leader.from) || related.has(c.leader.to)))){
      related.add(c.id);
    }
  });
  /* And it works the other way too: a callout selected lights the
     connector it is a remark about, since that is the only thing on the
     chart it is related to. Without this, clicking a callout faded out
     everything the reader had clicked it to look at. */
  if(isCalloutNode(n) && n.leader){
    related.add(n.leader.from);
    related.add(n.leader.to);
  }
  /* Everything in a multi-selection counts as related. Dimming is about
     the ONE entry being looked at; when a dozen have been picked out with
     a lasso, dimming eleven of them and lighting the twelfth's neighbours
     put the selection highlight underneath the dim wash, and only a few of
     the picked entries looked picked at all. */
  if(multiSelection.size > 1) multiSelection.forEach(x=> related.add(x));

  qNodes('.node').forEach(g=>{
    g.classList.toggle('selected', g.dataset.id===id);
    g.classList.toggle('dim', !related.has(g.dataset.id));
  });
  auraLayer.querySelectorAll('.node-aura').forEach(g=>{
    g.classList.toggle('dim', !related.has(g.dataset.id));
  });
  /* EVERY piece of a connector, not only its line. The arrowheads, the
     ring caps, an amalgam's members, its merged arrow and its beads all
     live in their own layers under their own classes — so selecting an
     entry faded the lines of the chart around it and left every arrowhead
     and every merged bar at full strength on top. */
  /* The leaders live in the connector layer and are found by qEdges, but
     they answer to the callout they belong to as well as to the connector
     they hang off — a leader with its card faded away is a line pointing
     out of nothing. */
  edgeLayer.querySelectorAll('.callout-leader').forEach(g=>{
    const lit = related.has(g.dataset.id);
    g.classList.toggle('lit', lit);
    g.classList.toggle('dim', !lit);
  });
  qEdges(DIMMABLE_EDGE_PARTS).forEach(p=>{
    if(p.classList.contains('callout-leader')) return;
    const src = p.dataset.from, dst = p.dataset.to;
    /* An amalgam's beads and its merged arrow name the entry they feed but
       no single source — the whole point is that they belong to the merge
       rather than to any one lineage. Judged by their source they matched
       nothing and were dimmed away to invisibility while the coloured bar
       around them stayed lit, so selecting a merged construction appeared
       to delete its junctions. They follow the entry they feed instead. */
    /* A callout selected lights the one connector it is about — the two
       entries it joins are in `related` for exactly this. */
    const aboutMe = isCalloutNode(n) && n.leader &&
      src === n.leader.from && dst === n.leader.to;
    const lit = src===id || dst===id || aboutMe ||
      (!src && related.has(dst)) ||
      (multiSelection.size > 1 && related.has(dst) && (!src || related.has(src)));
    p.classList.toggle('lit', lit);
    p.classList.toggle('dim', !lit);
  });
  if(typeof paintBioCardDim === 'function') paintBioCardDim();
  syncTagLiveliness();
}
function paintMultiSelection(){
  qNodes('.node').forEach(g=>{
    g.classList.toggle('multi', multiSelection.size > 1 && multiSelection.has(g.dataset.id));
  });
  if(typeof positionSwapButton === 'function') positionSwapButton();
}
function setSelection(ids, primary){
  multiSelection.clear();
  ids.forEach(id=>{ if(nodes.has(id)) multiSelection.add(id); });
  const first = primary && multiSelection.has(primary) ? primary : multiSelection.values().next().value;
  if(first) selectNode(first);
  else deselect();
  paintMultiSelection();
}
function toggleInSelection(id){
  if(multiSelection.has(id)){
    multiSelection.delete(id);
    if(selectedId === id){
      const next = multiSelection.values().next().value;
      if(next) selectNode(next); else deselect();
    }
  } else {
    multiSelection.add(id);
    selectNode(id);
  }
  paintMultiSelection();
}

// opts.keepEditForm is used by rebuildChart(): re-selecting after an edit
// must not slam the edit form shut, which is what a normal click does.
function selectNode(id, opts){
  selectedId = id;
  const n = nodes.get(id);
  if(!n) return;
  // A picture or a loose block of text has no lineage, no tags and no note
  // — the entry panel would be almost entirely empty for it — so it is
  // selected (draggable, resizable, deletable) without opening one.
  const free = n.shape === 'image' || n.shape === 'textbox';
  if(free){
    /* The entry form belongs to the entry it was opened for, and this is
       no longer that entry — so it closes, exactly as it does when any
       other selection is made.
     *
       It used to return before reaching that, leaving the form open on
       screen showing one entry's fields while `selectedId` had already
       moved to the picture. The next keystroke in the label box committed
       the whole form onto the picture: its archetype and its image URL
       replaced by another entry's label and colours, with the free
       element's own menu open on top at the same time. Two editors, one
       target, and a picture destroyed by typing. */
    if(!(opts && opts.keepEditForm)) closeEditForm();
    if(!(opts && opts.keepSelection)){
      if(!multiSelection.has(id)){ multiSelection.clear(); multiSelection.add(id); }
    }
    /* Through the shared painter, which for a free element marks it
       selected and clears the dim wash — so picking a caption after an
       entry does not leave the rest of the chart faded out behind it. */
    paintSelectionHighlight(id);
    return;
  }
  // A plain selection replaces the set; the multi-select paths add to it
  // themselves before calling in here.
  if(!(opts && opts.keepSelection)){
    if(!multiSelection.has(id)){ multiSelection.clear(); multiSelection.add(id); }
  }
  if(!(opts && opts.keepEditForm) && typeof closeEditForm === 'function') closeEditForm();
  paintSelectionHighlight(id);
  /* A callout says everything it has to say on the card. Opening the entry
     drawer beside it would fill the right-hand third of the screen with a
     title, an empty tag line, an empty note and two empty lineage lists —
     so it is selected, highlighted and carryable, with no drawer. */
  if(opts && opts.quiet){
    document.getElementById('detail').classList.remove('open');
    updateZoomCtlPosition();
    return;
  }

  document.getElementById('detailSwatch').style.background = n.color;
  document.getElementById('detailTitle').innerHTML = inlineToHtml(n.label);
  /* The form is only refilled as it OPENS, so a field shut for one
     archetype has to be reconsidered whenever the selection moves —
     otherwise a picture's shut Label row stayed shut on the next entry. */
  if(typeof syncLabelFieldForShape === 'function') syncLabelFieldForShape(null);
  if(typeof syncBioCardField === 'function' && typeof editShapeInput !== 'undefined'){
    /* The same reconsideration the Label row gets: a field offered for one
       archetype has to be taken away again on the next entry. */
    syncBioCardField({value: n.shape || 'rect'});
  }
  /* A portrait's panel is about the words on its card, so the card is up
     for as long as the panel is. It used to depend on how the entry had
     been reached: clicking the circle opened it, arriving by the search
     box, an undo or the keyboard did not, and the panel then discussed a
     card nobody could see. */
  if((n.shape || '') === 'ellipse') openBioCard(n.id, true);
  else if(bioCardPinned) closeBioCard();
  {
    /* No tags, no line. "Untagged" said nothing an empty row does not say
       already, and it took a strip of the drawer to say it — on a chart
       where most entries carry no tags, every panel opened with a label
       announcing an absence. */
    const line = document.getElementById('detailTags');
    const has = !!(n.tags && n.tags.length);
    line.style.display = has ? '' : 'none';
    line.innerHTML = has
      ? n.tags.map(t=> tagShapeHtml(t, {special: tagIsSpecial(t), why: SPECIAL_TAGS[t]})).join('')
      : '';
  }

  /* Anything still sitting in the typing pause belongs to the entry it was
     written for, not to this one. It is settled before the field is handed
     over — and the field is not reset out from under someone who is still
     writing in it. */
  if(detailNoteEditing && detailNoteOwner && detailNoteOwner !== id) flushDetailNoteCommit();
  if(!(detailNoteEditing && detailNoteOwner === id)) showDetailNote(n.note || '');

  const parentsWrap = document.getElementById('detailParents');
  const childrenWrap = document.getElementById('detailChildren');
  parentsWrap.innerHTML = '<h3>Derives from</h3>';
  childrenWrap.innerHTML = '<h3>Leads to</h3>';

  function addRow(wrap, targetId, note, arrow){
    const t = nodes.get(targetId);
    if(!t) return;
    const row = document.createElement('div');
    row.className='conn-row';
    row.innerHTML = `<div class="conn-arrow">${arrow}</div><div class="conn-text"><span class="conn-label">${inlineToHtml(t.label)}</span>${note?`<div class="conn-note">${escapeHtml(note)}</div>`:''}</div>`;
    row.addEventListener('click',()=>{ selectNode(targetId); flyToNode(targetId); });
    wrap.appendChild(row);
  }
  const edgeLabelFor = (a,b) => { const e = structEdges.find(e=>e.from===a&&e.to===b); return e?e.label:null; };

  if(n.parents.length===0){ parentsWrap.innerHTML += '<div class="conn-empty">Root node</div>'; }
  n.parents.forEach(p=> addRow(parentsWrap, p, edgeLabelFor(p,id), '←'));
  if(n.children.length===0){ childrenWrap.innerHTML += '<div class="conn-empty">No known continuation</div>'; }
  n.children.forEach(c=> addRow(childrenWrap, c, edgeLabelFor(id,c), '→'));

  /* The entry panel describes ONE entry. With several selected there is no
     single subject for it to describe, and it would only be in the way of
     the thing you are actually doing — moving them as a group — so it
     stays shut until the selection narrows back to one. */
  const many = multiSelection.size > 1;
  document.getElementById('detail').classList.toggle('open', !many);
  if(many && typeof closeEditForm === 'function') closeEditForm();
  updateZoomCtlPosition();
}

svg.addEventListener('click', ()=>{
  if(typeof closeFreeMenu === 'function') closeFreeMenu();
  // A finished marquee ends with a click on the canvas, which would
  // otherwise immediately clear the selection it just made.
  if(suppressCanvasClick){ suppressCanvasClick = false; return; }
  closeBioCard();
  deselect();
});
function deselect(){
  selectedId=null;
  multiSelection.clear();
  qNodes('.node.multi').forEach(g=>g.classList.remove('multi'));
  qNodes('.node').forEach(g=>{ g.classList.remove('selected'); g.classList.remove('dim'); });
  auraLayer.querySelectorAll('.node-aura').forEach(g=> g.classList.remove('dim'));
  qEdges(DIMMABLE_EDGE_PARTS).forEach(p=>{ p.classList.remove('lit'); p.classList.remove('dim'); });
  if(typeof paintBioCardDim === 'function') paintBioCardDim();
  syncTagLiveliness();
  document.getElementById('detail').classList.remove('open');
  if(typeof closeEditForm === 'function') closeEditForm();
  /* A picture's or a caption's menu belongs to the element it was opened
     for. With nothing selected there is no such element, and leaving the
     menu up left a live Delete button — and a text field that still
     committed — pointing at something the reader had just let go of. */
  if(typeof closeFreeMenu === 'function') closeFreeMenu();
  if(typeof positionSwapButton === 'function') positionSwapButton();
  updateZoomCtlPosition();
}
document.getElementById('detailClose').onclick = (e)=>{ e.stopPropagation(); deselect(); };

function updateZoomCtlPosition(){
  const open = document.getElementById('detail').classList.contains('open');
  document.getElementById('zoomctl').classList.toggle('shifted', open);
}

/* ---------------------------------------------------------------------
   Legend toggle
   ------------------------------------------------------------------ */
const legendPanel = document.getElementById('legend');

/* One surface at a time from the top bar. Each of these opens from a
   button standing next to the others, so two of them open at once is two
   panels covering each other rather than two things you asked for: opening
   any one of them closes whichever was already up. Looked up by id at call
   time because they are created all over this file. */
const TOOLBAR_SURFACES = ['legend', 'filePopover', 'stickerOverlay', 'addNodeOverlay', 'aboutOverlay'];
function closeToolbarMenus(keep){
  TOOLBAR_SURFACES.forEach(id=>{
    if(id === keep) return;
    const elm = document.getElementById(id);
    if(elm) elm.classList.remove('open');
  });
  if(keep !== 'legend'){
    const c = document.getElementById('coord');
    if(c) c.classList.remove('shifted');
  }
}

document.getElementById('legendToggle').onclick = ()=>{
  const willOpen = !legendPanel.classList.contains('open');
  closeToolbarMenus('legend');
  legendPanel.classList.toggle('open', willOpen);
  document.getElementById('coord').classList.toggle('shifted', willOpen);
};
document.getElementById('legendClose').onclick = ()=> {
  legendPanel.classList.remove('open');
  document.getElementById('coord').classList.remove('shifted');
};

/* ---------------------------------------------------------------------
   Search
   ------------------------------------------------------------------ */
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  if(q.length<2){ searchResults.classList.remove('show'); return; }
  const matches = [];
  nodes.forEach(n=>{ if(stripMarkup(n.label).toLowerCase().includes(q)) matches.push(n); });
  matches.sort((a,b)=>stripMarkup(a.label).length-stripMarkup(b.label).length);
  searchResults.innerHTML='';
  matches.slice(0,30).forEach(n=>{
    const tagsLabel = (n.tags && n.tags.length) ? n.tags.join(', ') : '';
    const row = document.createElement('div');
    row.className='row';
    /* The colour goes in escaped, like everything else here. It comes from
       the chart's data rather than from anything typed in this box, and a
       file brought in from elsewhere is not obliged to have put a real
       colour there at all. */
    row.innerHTML = `<div class="dot" style="background:${escapeHtml(n.color || '')}"></div><div>${inlineToHtml(n.label)}</div><div class="cl">${escapeHtml(tagsLabel)}</div>`;
    row.addEventListener('click', ()=>{
      selectNode(n.id); flyToNode(n.id);
      searchResults.classList.remove('show'); searchInput.value = stripMarkup(n.label);
    });
    searchResults.appendChild(row);
  });
  searchResults.classList.toggle('show', matches.length>0);
});
searchInput.addEventListener('blur', ()=> setTimeout(()=>searchResults.classList.remove('show'),150));
/* Whether the keyboard currently belongs to something being typed in. The
   shortcuts below all defer to it: a key that means "delete the entry" or
   "jump to search" on the chart means the character itself in a field. */
let keyboardOnChart = false;
/* Which kinds of INPUT actually swallow a keystroke. A colour well, a
   checkbox, a radio, a range or a file button hold focus without taking
   any text, and Delete means the chart's Delete while one of them is
   focused, not "erase a character" in a field that has none. */
const TEXT_INPUT_TYPES = new Set(
  ['text','search','url','tel','password','email','number','date','time','month','week']);
function typingInField(){
  const ae = document.activeElement;
  if(!ae) return false;
  // The last press was on the drawing, so the drawing is what the keys mean.
  if(keyboardOnChart) return false;
  if(ae.isContentEditable) return true;
  if(ae.tagName === 'TEXTAREA') return true;
  /* A drop-down is NOT typing.
   *
     A native select keeps focus after a choice is made, and it used to
     count here — so picking Orthogonal from a connector's Path menu and
     then pressing Delete did nothing at all, on a connector whose panel
     was open with its own Delete button sitting in it. Nothing is being
     typed into a list of five words. */
  if(ae.tagName === 'SELECT') return false;
  if(ae.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((ae.type || 'text').toLowerCase());
  return false;
}
/* Who the keyboard belongs to: the drawing, or a field.
 *
 * Picking an entry up calls preventDefault on its mousedown — so the
 * browser never starts selecting text as the entry is carried — and
 * preventDefault on a mousedown also cancels the focus change that press
 * would otherwise have made. So whatever field was last typed in KEPT the
 * keyboard: click into a label, click back onto the chart, press Delete,
 * and nothing happens, because as far as the shortcut could tell you were
 * still typing. That is the Delete key "sometimes stopping".
 *
 * Blurring the field on that press is the obvious answer and the wrong
 * one: a blur commits what was typed, a commit redraws the chart, and the
 * entry under the pointer is replaced between the press and the release —
 * so no click ever completes on it and the press selects nothing. What is
 * actually wanted is not to move the focus but to know where the LAST
 * press was, which is what a reader means by which of the two they are
 * working in. */
document.addEventListener('focusin', ev=>{
  const t = ev.target;
  if(t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')){
    keyboardOnChart = false;
  }
});
document.addEventListener('keydown', e=>{
  // A modal question owns the keyboard while it is up. Without this,
  // Escape closed the panel behind it and Delete deleted the entry behind
  // it, both while the question was still on screen waiting for an answer.
  if(askOverlay.classList.contains('open')) return;
  /* The search shortcut goes by key position too, for the same reason as
     the Ctrl combinations below — and, like them, not while something is
     being typed. It used to check only that the search box itself did not
     have focus, so the first `/` of any URL, path or date typed anywhere
     in the application was swallowed and the rest of the line went into
     the search box. */
  if((e.code==='Slash' || e.key==='/') && !e.ctrlKey && !e.metaKey &&
     document.activeElement!==searchInput && !typingInField()){
    e.preventDefault(); searchInput.focus();
  }
  if(e.key==='Escape'){
    // Same effect as that panel's own close (✕) button — whichever panel
    // is topmost/open gets closed first, most-specific first, so Escape
    // never skips past an open popover straight to deselecting the chart.
    if(nodeEditorTarget){ closeNodeEditor(true); return; }
    if(addNodeOverlay.classList.contains('open')){ addNodeOverlay.classList.remove('open'); return; }
    if(commentsOverlay.classList.contains('open')){ commentsOverlay.classList.remove('open'); return; }
    if(bioCardNodeId){ closeBioCard(); return; }
    if(noteOverlay && noteOverlay.classList.contains('open')){ noteOverlay.classList.remove('open'); return; }
    if(aboutOverlay.classList.contains('open')){ aboutOverlay.classList.remove('open'); return; }
    if(calloutPopover.classList.contains('open')){ closeCalloutPopover(); return; }
    if(edgePopover.classList.contains('open')){ closeEdgePopover(); return; }
    // A picture's or a caption's own menu is a panel like any other, and
    // was the one Escape never reached — so it stayed open, still holding
    // a Delete button, over an element that was no longer selected.
    if(freeMenu.classList.contains('open')){ closeFreeMenu(); return; }
    if(detailEditForm.style.display==='block'){ closeEditForm(); return; }
    if(legendPanel.classList.contains('open')){
      legendPanel.classList.remove('open');
      document.getElementById('coord').classList.remove('shifted');
      return;
    }
    deselect(); searchResults.classList.remove('show'); searchInput.blur();
  }
  if(readOnlyView && (e.key==='Delete' || e.key==='Backspace')) return;
  if(e.key==='Delete' || e.key==='Backspace'){
    // Same effect as clicking that context's own "Delete" button — never
    // hijacked while the user is actually typing (Backspace has to keep
    // erasing text in every field, including these two keys' own textareas).
    if(typingInField()) return;
    /* A callout's own card is open on it, so Delete means that card —
       exactly as it means the connector's when the connector's card is
       open. It reads its own Delete button rather than reaching for
       deleteNodes, so the panel closes with it. */
    if(calloutPopover.classList.contains('open') && calloutTarget){
      e.preventDefault();
      document.getElementById('calloutDelete').click();
      return;
    }
    if(edgePopover.classList.contains('open') && currentEdgeStyleTarget){
      e.preventDefault();
      styleDeleteBtn.click();
      return;
    }
    if(multiSelection.size > 1){
      e.preventDefault();
      deleteNodes(Array.from(multiSelection));
      return;
    }
    if(selectedId){
      e.preventDefault();
      deleteNode(selectedId);
      return;
    }
  }
  // ---- clipboard + undo ------------------------------------------------
  // Same guard as Delete/Backspace above: inside any text field these keys
  // belong to the field, where the browser's own copy/paste/undo is what
  // the user means.
  if(e.ctrlKey || e.metaKey){
    const ae = document.activeElement;
    const typing = ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable);
    if(typing) return;
    /* Read the PHYSICAL key, not the character it produces. On a Cyrillic
       layout Ctrl+C is Ctrl+С — a different character entirely — and every
       shortcut on this page silently stopped working the moment the layout
       changed. `e.code` names the key by its position ("KeyC"), which is
       the same key on every layout, so the shortcuts belong to the keyboard
       rather than to the alphabet. e.key is kept as the fallback for the
       rare input device that reports no code. */
    const key = (/^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : (e.key || '')).toLowerCase();
    // Copy stays available to readers — it only fills the clipboard.
    if(readOnlyView && key !== 'c') return;
    if(key==='c'){
      if(!selectedId) return;
      e.preventDefault();
      if(copySelectedNode() && detailEditForm.style.display==='block') setEditStatus('ok', 'Copied.');
      return;
    }
    if(key==='x'){
      if(!selectedId) return;
      e.preventDefault();
      cutSelectedNode();
      return;
    }
    if(key==='v'){
      e.preventDefault();
      pasteClipboardNode();
      return;
    }
    // Ctrl+Z steps back, Ctrl+Y steps forward again — and Ctrl+Shift+Z as
    // well, because that is the other habit people have for redo.
    if(key==='z'){
      e.preventDefault();
      if(e.shiftKey) redoLastEdit(); else undoLastEdit();
      return;
    }
    if(key==='y'){
      e.preventDefault();
      redoLastEdit();
      return;
    }
    if(key==='s'){
      // The browser's own Ctrl+S would offer to download this page, which
      // is never what's meant on a document that has its own Save.
      e.preventDefault();
      saveNow();
      return;
    }
  }
});

/* ---------------------------------------------------------------------
   Stats + init
   ------------------------------------------------------------------ */
function updateStats(){
  document.getElementById('statNodes').textContent = nodes.size;
  document.getElementById('statEdges').textContent = structEdges.length;
  document.getElementById('statClusters').textContent = allTags.filter(t=>t!==UNTAGGED).length;
}
updateStats();

/* ---------------------------------------------------------------------
   Redraw everything from the working data.

   Called after every edit. Deliberately does NOT touch the viewport — an
   edit shouldn't yank the chart out from under you — and re-selects the
   node you had selected if it still exists, so the drawer doesn't shut
   itself every time you change something in it.
   ------------------------------------------------------------------ */
function rebuildChart(){
  const keepSelected = selectedId;
  buildModel();
  renderNodes();
  redrawEdges();
  buildManagement();
  updateStats();
  applyVisibility();
  // The selection survives a rebuild, minus anything that no longer exists.
  Array.from(multiSelection).forEach(id=>{ if(!nodes.has(id)) multiSelection.delete(id); });
  if(keepSelected && nodes.has(keepSelected)) selectNode(keepSelected, {keepEditForm:true, keepSelection:true});
  else if(keepSelected) deselect();
  paintMultiSelection();
  if(bioCardNodeId && !nodes.has(bioCardNodeId)) closeBioCard();
  else drawBioCard();
}

/* The zoom controls are positioned against whatever part of the canvas the
   panels have left showing, so a window that changes size has to have them
   placed again. This listener was here with an empty body — registered, so
   it read as handled, and doing nothing: resize a window with the
   Management panel open and the controls sat where the old edge used to
   be, under the panel. */
window.addEventListener('resize', ()=> updateZoomCtlPosition());
fitToView();
applyVisibility();

