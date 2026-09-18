/* ---- asking the user something -------------------------------------
 *
 * window.prompt and window.confirm are unusable in this application. The
 * artifact viewer runs the page in a sandboxed frame without allow-modals,
 * where prompt() returns null and confirm() returns false — silently, with
 * no error to catch. Every dialog built on them therefore looked like a
 * button that did nothing, which is exactly how "Add a reference" failed.
 *
 * askFields() resolves with an object of values, or null if dismissed.
 * askConfirm() resolves true/false. Both are promises so the calling code
 * reads the same way the prompt-based version did.
 */
const askOverlay = document.getElementById('askOverlay');
const askFieldsEl = document.getElementById('askFields');
let askResolve = null;
function closeAsk(value){
  askOverlay.classList.remove('open');
  const done = askResolve; askResolve = null;
  if(done) done(value);
}
function askFields(title, fields, message){
  return new Promise(resolve=>{
    // A second dialog would orphan the first one's promise, so the one
    // already open is dismissed rather than stacked.
    if(askResolve) closeAsk(null);
    document.getElementById('askTitle').textContent = title;
    document.getElementById('askMessage').textContent = message || '';
    askFieldsEl.innerHTML = '';
    fields.forEach(f=>{
      const wrap = document.createElement('div');
      wrap.className = 'ask-field';
      const lab = document.createElement('label');
      lab.textContent = f.label;
      const input = document.createElement(f.multiline ? 'textarea' : 'input');
      if(!f.multiline) input.type = 'text';
      input.value = f.value || '';
      if(f.placeholder) input.placeholder = f.placeholder;
      if(f.maxLength) input.maxLength = f.maxLength;
      input.spellcheck = false;
      input.dataset.name = f.name;
      wrap.appendChild(lab); wrap.appendChild(input);
      askFieldsEl.appendChild(wrap);
    });
    askOverlay.classList.add('open');
    askResolve = resolve;
    /* Something inside the dialog has to hold the keyboard.
     *
       A confirmation has no fields, so nothing in it was focusable and the
       focus stayed wherever it had been — on the chart. Escape and Enter
       never reached the dialog's own handler, and Delete went straight
       past it to the chart: a question about removing one tag, still on
       screen, while the entry behind it was being deleted. The OK button
       is what takes the keys when there is nothing to type in. */
    const first = askFieldsEl.querySelector('input,textarea')
               || document.getElementById('askOk');
    if(first){ first.focus(); first.select && first.select(); }
  });
}
function askConfirm(title, message){
  return askFields(title, [], message).then(v=> v !== null);
}
function readAskValues(){
  const out = {};
  askFieldsEl.querySelectorAll('[data-name]').forEach(el=>{ out[el.dataset.name] = el.value; });
  return out;
}
document.getElementById('askOk').onclick = ()=> closeAsk(readAskValues());
document.getElementById('askCancel').onclick = ()=> closeAsk(null);
askOverlay.addEventListener('click', ev=>{ if(ev.target === askOverlay) closeAsk(null); });
askOverlay.addEventListener('keydown', ev=>{
  // Enter accepts from a single-line field; a textarea keeps Enter for
  // newlines, which is the whole reason it is a textarea.
  if(ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA'){ ev.preventDefault(); closeAsk(readAskValues()); }
  if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); closeAsk(null); }
});

/* ---- the references panel ---- */
/* References render into the Management panel's one list, below the tags.
   `refsPanel` is that panel — the same element the tag list lives in. */
const refsPanel = document.getElementById('legend');
function setRefsStatus(kind, msg){
  const el = document.getElementById('refsStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'legend-status' + (kind ? ' ' + kind : '');
}
function openRefsPanel(focusKey){
  refsPanel.classList.add('open');
  buildManagement();
  if(focusKey){
    const row = legendList.querySelector(`.ref-item[data-key="${cssEscape(focusKey)}"]`);
    if(row){
      row.scrollIntoView({block:'nearest'});
      // A brief highlight rather than a permanent selection: the reader was
      // sent here by a mark, and what they need is to be shown WHICH entry,
      // not to have one selected for some later action.
      row.classList.add('flash');
      setTimeout(()=> row.classList.remove('flash'), 1400);
    } else {
      setRefsStatus('err', 'That mark points at a reference that no longer exists.');
    }
  }
}
function buildRefsInto(host){
  if(!REFS.length){
    const empty = document.createElement('p');
    empty.className = 'legend-status';
    empty.textContent = 'No references yet. Add one with +, then cite it with the [n] button on any text toolbar.';
    host.appendChild(empty);
    return;
  }
  REFS.forEach((r, i)=>{
    const row = document.createElement('div');
    row.className = 'ref-item';
    row.dataset.key = r.key;
    const used = refUsageCount(r.key);
    /* No heading. A reference is identified by its NUMBER — that is what
       the mark in the text says and what the reader looks for — so a
       second name above the text said the same thing twice and left every
       reference written without one reading "(untitled)". */
    const body = refBodyText(r);
    row.innerHTML =
      `<div class="ref-head"><span class="ref-num" style="color:${escapeHtml(refColor())}">[${i+1}]</span>` +
      `<span class="ref-detail">${escapeHtml(body) || '<em>empty</em>'}</span>` +
      `<span class="ref-uses" title="How many texts cite this">${used}</span></div>` +
      (r.url ? `<a class="ref-link" href="${escapeHtml(safeUrl(r.url) || '')}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>` : '');
    if(!readOnlyView){
      const tools = document.createElement('div');
      tools.className = 'ref-tools';
      const mk = (label, title, fn)=>{
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.title = title;
        b.addEventListener('click', ev=>{ ev.stopPropagation(); fn(); });
        return b;
      };
      tools.appendChild(mk('✎', 'Edit this reference', ()=> editRef(r.key)));
      tools.appendChild(mk('✕', 'Delete this reference', ()=> deleteRef(r.key)));
      row.appendChild(tools);
      /* The number is not a field: it is where the reference sits in the
         list, so it is changed by putting the reference somewhere else.
         The arrows that used to do this are gone — they moved a reference
         one step per press, which is a poor way to say "third". */
      row.classList.add('draggable-row');
      row.title = 'Drag above or below another reference to renumber';
      row.addEventListener('mousedown', ev=> beginListDrag(ev, 'ref', r.key, `[${i+1}]`));
    }
    host.appendChild(row);
  });
}
/* What a reference SAYS. A chart written before references lost their
   heading may still carry one; it is shown, and folded into the text the
   next time the reference is edited, so nothing anyone typed is lost and
   nothing is shown twice. */
function refBodyText(r){
  if(!r) return '';
  const d = (r.detail || '').trim(), t = (r.title || '').trim();
  if(d && t && d.indexOf(t) < 0) return t + ' — ' + d;
  return d || t;
}
async function refPrompt(existing, title){
  const got = await askFields(title, [
    {name:'detail', label:'Reference',        value: refBodyText(existing), multiline:true},
    {name:'url',    label:'Link (optional)',  value: existing ? existing.url : '',    placeholder:'https://…'}
  ]);
  if(!got) return null;
  const url = (got.url || '').trim();
  // title:'' on the way out — see refBodyText.
  if(url && !safeUrl(url)){
    setRefsStatus('err', 'That link was not saved: only http, https, mailto and ftp addresses are allowed.');
    return {title:'', detail:(got.detail||'').trim(), url:''};
  }
  return {title:'', detail:(got.detail||'').trim(), url};
}
async function addRef(){
  const got = await refPrompt(null, 'New reference');
  if(!got || (!got.detail && !got.url)) return;
  const key = uniqueRefKey(got.detail || 'ref');
  applyEdit(()=> REFS.push({key, title:got.title, detail:got.detail, url:got.url}));
  buildManagement(); rebuildChart();
  setRefsStatus('ok', `Added [${REFS.length}].`);
}
async function editRef(key){
  const i = refIndex(key);
  if(i < 0) return;
  const got = await refPrompt(REFS[i], 'Edit reference');
  if(!got) return;
  applyEdit(()=> Object.assign(REFS[i], got));
  buildManagement(); rebuildChart();
}
/* Put a reference where another one is. A reference's number IS its place
   in this list, so moving the row is the only way to change it — and every
   mark after it on the chart has just been renumbered too, which is why
   the whole chart is redrawn and not only the panel. What a mark stores is
   the reference's own key, so this renumbers the text rather than breaking
   the link. */
function reorderRef(key, overKey, where){
  applyEdit(()=>{
    const i = refIndex(key);
    if(i < 0) return;
    const [it] = REFS.splice(i, 1);
    const j = REFS.findIndex(r=> r.key === overKey);
    if(j < 0){ REFS.splice(i, 0, it); return; }
    REFS.splice(where === 'after' ? j + 1 : j, 0, it);
  });
  buildManagement(); rebuildChart();
}
async function deleteRef(key){
  const used = refUsageCount(key);
  if(used && !await askConfirm('Delete this reference?',
      `${used} ${used===1?'text cites':'texts cite'} it. Deleting removes those marks from the text as well.`)) return;
  applyEdit(()=>{
    const i = refIndex(key);
    if(i >= 0) REFS.splice(i, 1);
    /* The marks go too. Leaving them would leave "[?]" scattered through
       the chart pointing at nothing — a deletion that quietly damages the
       text is worse than one that cleans up after itself. */
    workingNodes.forEach(t=>{
      t[1] = stripRefToken(t[1], key);
      t[4] = stripRefToken(t[4], key);
      const opts = t[6];
      if(opts && Array.isArray(opts.langTabs)){
        opts.langTabs.forEach(x=>{ if(x) x.text = stripRefToken(x.text, key); });
      }
    });
    EDGE_STYLES.forEach(e=>{ if(e && e.note) e.note = stripRefToken(e.note, key); });
    COMMENTS.forEach(c=>{ if(c && c.text) c.text = stripRefToken(c.text, key); });
    REFS.forEach(r=>{ r.detail = stripRefToken(r.detail, key); });
  });
  buildManagement(); rebuildChart();
  setRefsStatus('ok', 'Deleted.');
}
{
  // Kept working for anything that still calls it, though the button it
  // was on is gone: references live in the Management panel now.
  const t = document.getElementById('refsToggle');
  if(t) t.onclick = (ev)=>{
    ev.stopPropagation();
    if(refsPanel.classList.contains('open')) refsPanel.classList.remove('open');
    else openRefsPanel(null);
  };
}


/* A click on a reference mark, anywhere on the chart.
 *
 * One delegated listener on the canvas rather than a handler per mark:
 * marks are re-created on every redraw, and there are as many of them as
 * there are citations. The capture phase is used so the entry's own drag
 * and selection handlers never see the event — the mark is a control that
 * happens to sit inside a label, and pressing it must not also press the
 * label. */
/* …and which marks answer at all.
 *
 * While an entry is open, the rest of the chart has been stepped back to
 * look at it, and everything that belongs to another entry is out of play
 * — its links, its language chips and its citations alike. A citation on a
 * faded box that still opened the reference list was the one control on
 * the chart that ignored what the reader was looking at. Its own entry's
 * citations go on working, and so do the ones on a connector's note, which
 * belong to no entry. */
function liveRefMark(ev){
  const mark = ev.target && ev.target.closest ? ev.target.closest('.ref-mark') : null;
  if(!mark) return null;
  const host = mark.closest ? mark.closest('.node') : null;
  if(selectedId && host && host.dataset.id !== selectedId) return null;
  return mark;
}
svg.addEventListener('mousedown', ev=>{
  const mark = liveRefMark(ev);
  if(!mark) return;
  ev.preventDefault(); ev.stopPropagation();
  openRefsPanel(mark.dataset.ref);
}, true);
/* The CLICK that follows has to be stopped as well.
 *
 * Swallowing the press alone left the release to travel on to the entry
 * underneath, which selected it and opened its settings — so pressing a
 * citation on an entry nobody had picked out both opened the reference
 * list AND opened the entry, and the panel that appeared last was the one
 * the reader had not asked for. A citation is a control inside a label;
 * pressing it is not pressing the label. */
svg.addEventListener('click', ev=>{
  if(!liveRefMark(ev)) return;
  ev.preventDefault(); ev.stopPropagation();
}, true);

function setLegendStatus(kind, msg){
  const el = document.getElementById('legendStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'legend-status' + (kind ? ' ' + kind : '');
}

function createTag(raw){
  const tag = (raw || '').trim();
  if(!tag) return;
  if(tag === UNTAGGED){ setLegendStatus('err', 'That name is reserved.'); return; }
  if(tagExists(tag)){ setLegendStatus('err', `“${tag}” already exists.`); return; }
  /* A new tag belongs to no category yet, and choosing one for it is a
     second decision — so it is made in the uncategorised bin and carried
     into a category afterwards, which is a drag rather than a form. It
     used to be filed into whichever category happened to be first, which
     was a filing decision the chart made on the reader's behalf and
     usually the wrong one. */
  applyEdit(()=>{ looseBin(true).tags.push(tag); });
  buildManagement();
  setLegendStatus('ok', `Added “${tag}” — drag it onto a category to file it.`);
}

function createCategory(raw){
  const name = (raw || '').trim();
  if(!name) return;
  if(name === UNGROUPED){ setLegendStatus('err', 'That name is reserved.'); return; }
  if(realCategories().some(c=> c.name === name)){ setLegendStatus('err', `“${name}” already exists.`); return; }
  applyEdit(()=> TAG_CATS.push({name, tags:[]}));
  buildManagement();
  setLegendStatus('ok', `Added category “${name}”.`);
}

/* Renaming a category happens ON the heading.
 *
 * It used to open a small dialog with one field in it — a modal, a
 * backdrop and two buttons to change one word — which is a great deal of
 * apparatus for the gesture everybody already knows: double-click the
 * name, type over it, press Enter. So the name itself becomes editable
 * where it stands, with the whole of it selected, exactly as renaming a
 * file does. Enter and clicking away keep the new name; Escape puts the
 * old one back. */
function startCategoryRename(head, oldName){
  const el0 = head && head.querySelector('.legend-group-name');
  if(!el0 || el0.isContentEditable) return;
  el0.contentEditable = 'plaintext-only';
  el0.spellcheck = false;
  el0.classList.add('renaming');
  el0.textContent = oldName;
  el0.focus();
  try{
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(el0);
    sel.removeAllRanges(); sel.addRange(r);
  }catch(e){}
  let done = false;
  const finish = (keep)=>{
    if(done) return;
    done = true;
    const typed = (el0.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    el0.contentEditable = 'false';
    el0.classList.remove('renaming');
    el0.removeEventListener('keydown', onKey);
    el0.removeEventListener('blur', onBlur);
    if(!keep || !typed || typed === oldName){ buildManagement(); return; }
    if(typed === UNGROUPED || realCategories().some(c=> c.name === typed)){
      setLegendStatus('err', `“${typed}” already exists.`);
      buildManagement();
      return;
    }
    applyEdit(()=>{ const c = TAG_CATS.find(c=> c.name === oldName); if(c) c.name = typed; });
    /* The folded/unfolded state is remembered by NAME, so a renamed
       category that was open would have come back folded — and one that
       was folded would have sprung open. */
    if(collapsedCats.has(oldName)){ collapsedCats.delete(oldName); collapsedCats.add(typed); }
    buildManagement();
  };
  function onKey(ev){
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  }
  function onBlur(){ finish(true); }
  el0.addEventListener('keydown', onKey);
  el0.addEventListener('blur', onBlur);
  // A click inside the name being typed is not a click on the heading.
  el0.addEventListener('click', ev=> ev.stopPropagation());
  el0.addEventListener('dblclick', ev=> ev.stopPropagation());
}

function removeCategory(name){
  /* Deleting a category must not delete the tags in it, or removing a bit
     of organisation would silently strip entries of their tags. The tags
     drop back to Ungrouped; only the grouping goes. */
  applyEdit(()=>{
    const i = TAG_CATS.findIndex(c=> c.name === name);
    if(i < 0) return;
    const freed = TAG_CATS[i].tags.slice();
    TAG_CATS.splice(i, 1);
    // Its tags keep existing, so they have to keep having somewhere to be.
    if(freed.length) looseBin(true).tags.push(...freed);
  });
  buildManagement();
  setLegendStatus('ok', `Removed category “${name}”. Its tags are now uncategorised.`);
}

async function deleteTagEverywhere(tag, count){
  if(count && !await askConfirm('Delete this tag?',
      `It is on ${count} ${count===1?'entry':'entries'}, and will be removed from ${count===1?'it':'them'}.`)) return;
  applyEdit(()=>{
    TAG_CATS.forEach(c=>{ const i = c.tags.indexOf(tag); if(i >= 0) c.tags.splice(i, 1); });
    workingNodes.forEach(t=>{
      const opts = t[6];
      if(!opts || !Array.isArray(opts.tags)) return;
      const i = opts.tags.indexOf(tag);
      if(i >= 0) opts.tags.splice(i, 1);
      if(!opts.tags.length) delete opts.tags;
    });
  });
  hiddenTags.delete(tag);
  buildManagement();
  setLegendStatus('ok', `Deleted “${tag}”.`);
}
buildManagement();
/* One eye instead of Show all / Hide all.
 *
 * The two buttons were never both useful: whichever state the chart was
 * in, one of them did nothing. A single control that reads the current
 * state and offers the other one is smaller, and it also SHOWS that state
 * — the crossed-out eye means "everything is hidden", which the old pair
 * could not say at all. */
function everythingHidden(){
  return allTags.length > 0 && allTags.every(t=> hiddenTags.has(t));
}
function syncLegendEye(){
  const btn = document.getElementById('legendEye');
  if(!btn) return;
  const shut = everythingHidden();
  btn.classList.toggle('shut', shut);
  btn.title = shut ? 'Show every tag' : 'Hide every tag';
}
/* The Tags +. Two things can be made here — a tag and a category — so it
   opens a two-item menu; references have their own + and only one thing to
   make, so that one acts at once. */
{
  const menu = document.getElementById('legendAddMenu');
  menu.addEventListener('click', async ev=>{
    const b = ev.target.closest('button[data-add]');
    if(!b) return;
    ev.stopPropagation();
    menu.hidden = true;
    /* Written where it will stand, not in a window of its own — the same
       gesture that renames a category, for the same reason. */
    if(b.dataset.add === 'tag') startNewTagEntry();
    else startNewCategoryEntry();
  });
  document.addEventListener('mousedown', ev=>{
    if(menu.hidden) return;
    if(menu.contains(ev.target) || ev.target.closest('.plus-mini')) return;
    menu.hidden = true;
  });
}

/* Organize mode. The panel's day job is filtering, so the editing controls
   are folded away until asked for rather than crowding every row with a
   dropdown and a delete button nobody wanted. */
/* The chart's one citation colour, in the panel the citations live in. */
{
  const box = document.getElementById('refColorInput');
  const reset = document.getElementById('refColorReset');
  if(box){
    const sync = ()=>{
      box.value = refColor();
      box.classList.remove('bad');
      box.style.setProperty('--swatch', refColor());
    };
    const commit = ()=>{
      const v = box.value.trim();
      const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
      box.classList.toggle('bad', !ok);
      if(!ok) return;
      box.style.setProperty('--swatch', v);
      applyEdit(()=>{ SETTINGS.refColor = v; });
      rebuildChart();
      buildManagement();
    };
    box.addEventListener('input', commit);
    box.addEventListener('click', ev=> ev.stopPropagation());
    if(reset) reset.addEventListener('click', ev=>{
      ev.stopPropagation();
      applyEdit(()=>{ SETTINGS.refColor = DEFAULT_REF_COLOR; });
      sync(); rebuildChart(); buildManagement();
    });
    sync();
  }
}

function nodeHidden(n){
  /* One hidden tag is enough. Hiding a tag means "take these off the
     chart", and an entry that carries it IS one of these — waiting until
     every one of its tags was hidden meant switching off "fan-fiction"
     left every fan-fiction entry that also carried another tag sitting
     there, which reads as the switch not working. */
  return effectiveTags(n).some(t=> hiddenTags.has(t));
}
