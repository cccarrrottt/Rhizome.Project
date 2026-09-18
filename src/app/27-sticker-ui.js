/* ---------------------------------------------------------------------
   The sticker library UI.

   Two halves: the full library (a tab of its own, where pictures are
   uploaded, renamed and removed) and the miniature picker that drops out
   of the ☺ button beside every text field, which is how a sticker
   actually gets into a sentence.

   A still picture is redrawn small before it is stored, the same way a
   portrait is. An animated GIF cannot survive that — a canvas keeps only
   the first frame — so a GIF is stored byte-for-byte and simply refused
   if it is too big to belong in a page.
   ------------------------------------------------------------------ */
const STICKER_MAX = 128;              // px, for still pictures
const STICKER_GIF_LIMIT = 512 * 1024; // bytes of source GIF

const stickerOverlay = document.getElementById('stickerOverlay');
const stickerGrid = document.getElementById('stickerGrid');
const stickerFile = document.getElementById('stickerFile');
const stickerStatusEl = document.getElementById('stickerStatus');
const stickerPicker = document.getElementById('stickerPicker');
const stickerPickerGrid = document.getElementById('stickerPickerGrid');
let stickerPickerTarget = null;       // the rich surface a pick will land in

function setStickerStatus(kind, msg){
  stickerStatusEl.className = 'sticker-status editor-status show ' + kind;
  stickerStatusEl.textContent = msg;
}
function clearStickerStatus(){
  stickerStatusEl.className = 'sticker-status editor-status';
  stickerStatusEl.textContent = '';
}

function applyStickerEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  rebuildStickerMap();
  rebuildChart();
  renderStickerLibrary();
  refreshSaveUI();
}

function uniqueStickerKey(base){
  let k = (base || 'sticker').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'sticker';
  const taken = new Set(STICKERS.map(s=>s.key));
  if(!taken.has(k)) return k;
  let i = 2;
  while(taken.has(k + '-' + i)) i++;
  return k + '-' + i;
}

// Reads one chosen file into something storable: a GIF as-is (so it keeps
// moving), anything else squared off and shrunk.
function stickerDataFromFile(file, crop){
  if(/gif/i.test(file.type)){
    if(file.size > STICKER_GIF_LIMIT){
      return Promise.reject(new Error(`"${file.name}" is ${Math.round(file.size/1024)} KB — GIF stickers have to stay under ${Math.round(STICKER_GIF_LIMIT/1024)} KB, because the whole picture is stored inside the chart.`));
    }
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onerror = ()=> reject(new Error(`could not read "${file.name}".`));
      reader.onload = ()=> resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error(`could not read "${file.name}".`));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error(`"${file.name}" is not an image this browser can read.`));
      img.onload = ()=>{
        // Drawn into a square, so stickers of different proportions still
        // line up in a row of text. A crop is already square, so it fills
        // the cell; without one the whole picture is centred as before.
        const side = STICKER_MAX;
        const canvas = document.createElement('canvas');
        canvas.width = side; canvas.height = side;
        const ctx = canvas.getContext('2d');
        if(crop){
          ctx.drawImage(img, crop.x, crop.y, crop.s, crop.s, 0, 0, side, side);
        } else {
          const scale = Math.min(side/img.width, side/img.height);
          const w = Math.max(1, Math.round(img.width*scale));
          const h = Math.max(1, Math.round(img.height*scale));
          ctx.drawImage(img, (side-w)/2, (side-h)/2, w, h);
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let stickerReplaceKey = null;   // set when the picker is replacing one
stickerFile.addEventListener('change', async ()=>{
  const files = Array.from(stickerFile.files || []);
  stickerFile.value = '';
  const replacing = stickerReplaceKey;
  stickerReplaceKey = null;
  if(!files.length) return;
  clearStickerStatus();
  const added = [], failed = [];
  for(const f of files){
    try{
      /* A GIF is stored whole so it keeps moving — a canvas would flatten
         it to its first frame — so there is nothing to crop and asking
         would only offer a choice that could not be honoured. */
      let crop = null;
      if(!/gif/i.test(f.type)){
        crop = await openCropper(f, files.length > 1
          ? `Choose the part to use — ${f.name}`
          : 'Choose the part of the picture to use');
        if(crop === 'cancel') continue;
      }
      added.push({file:f, src: await stickerDataFromFile(f, crop)});
    }
    catch(err){ failed.push(err.message); }
  }
  if(added.length){
    applyStickerEdit(()=>{
      if(replacing){
        const s = STICKERS.find(x=>x.key===replacing);
        if(s) s.src = added[0].src;
        return;
      }
      added.forEach(a=>{
        const base = a.file.name.replace(/\.[^.]+$/, '');
        STICKERS.push({ key: uniqueStickerKey(base), name: base.slice(0,40) || 'sticker', src: a.src });
      });
    });
  }
  if(failed.length) setStickerStatus('err', failed.join('\n'));
  else if(added.length) setStickerStatus('ok', added.length === 1 ? 'Sticker added.' : `${added.length} stickers added.`);
});

function renderStickerLibrary(){
  stickerGrid.innerHTML = '';
  if(!STICKERS.length){
    const p = document.createElement('div');
    p.className = 'sticker-empty';
    p.textContent = readOnlyView
      ? 'This chart has no stickers yet.'
      : 'No stickers yet — add a few and they will show up beside every text field.';
    stickerGrid.appendChild(p);
    return;
  }
  STICKERS.forEach(s=>{
    const cell = document.createElement('div');
    cell.className = 'sticker-cell';
    const img = document.createElement('img');
    img.src = s.src; img.alt = s.name || s.key;
    /* A sticker is its picture — there is nothing to read in a name, and
       the box asking for one only made the tile taller. Removing it also
       lets the tile shrink to the picture, which is why Delete no longer
       fits as a word: it is a cross in the corner instead. */
    const actions = document.createElement('div');
    actions.className = 'sticker-cell-actions';
    const replace = document.createElement('button');
    replace.className = 'editor-btn'; replace.type = 'button'; replace.textContent = 'Replace';
    replace.onclick = ()=>{ stickerReplaceKey = s.key; stickerFile.click(); };
    const del = document.createElement('button');
    del.className = 'sticker-del'; del.type = 'button'; del.textContent = '\u2715';
    del.title = 'Remove this sticker from the library. Text already using it keeps a small empty square where it was.';
    del.onclick = ()=>{
      applyStickerEdit(()=>{
        const i = STICKERS.findIndex(x=>x.key===s.key);
        if(i>=0) STICKERS.splice(i,1);
      });
    };
    actions.append(replace);
    cell.append(img, actions, del);
    stickerGrid.appendChild(cell);
  });
}

function openStickerLibrary(){
  clearStickerStatus();
  renderStickerLibrary();
  stickerOverlay.classList.add('open');
}
document.getElementById('stickersToggle').onclick = ()=>{
  closeToolbarMenus('stickerOverlay');
  openStickerLibrary();
};
document.getElementById('stickerClose').onclick = ()=> stickerOverlay.classList.remove('open');
stickerOverlay.addEventListener('click', e=>{ if(e.target===stickerOverlay) stickerOverlay.classList.remove('open'); });
document.getElementById('stickerUpload').onclick = ()=>{ stickerReplaceKey = null; stickerFile.click(); };

/* The miniature picker. One ☺ button is added to every formatting toolbar
   on the page, so a sticker can be dropped in wherever text is written. */
function closeStickerPicker(){
  stickerPicker.classList.remove('open');
  stickerPickerTarget = null;
}
function openStickerPicker(btn, surface){
  stickerPickerTarget = surface;
  renderStickerPicker();
  stickerPicker.classList.add('open');
  const r = btn.getBoundingClientRect();
  const pr = stickerPicker.getBoundingClientRect();
  let left = Math.min(r.left, window.innerWidth - pr.width - 10);
  let top = r.bottom + 6;
  if(top + pr.height > window.innerHeight - 10) top = Math.max(10, r.top - pr.height - 6);
  stickerPicker.style.left = Math.max(10, left) + 'px';
  stickerPicker.style.top = top + 'px';
}
function renderStickerPicker(){
  stickerPickerGrid.innerHTML = '';
  if(!STICKERS.length){
    const p = document.createElement('div');
    p.className = 'sticker-picker-empty';
    p.textContent = 'No stickers in this chart yet.';
    stickerPickerGrid.appendChild(p);
    return;
  }
  STICKERS.forEach(s=>{
    const b = document.createElement('button');
    b.type = 'button'; b.title = s.name || s.key;
    const img = document.createElement('img');
    img.src = s.src; img.alt = s.name || s.key;
    b.appendChild(img);
    b.onclick = (ev)=>{ ev.stopPropagation(); insertSticker(s.key); };
    stickerPickerGrid.appendChild(b);
  });
}
/* Inserting a chip at the caret. execCommand is used for the same reason
   the sticker button uses it: it keeps the caret where the user left it,
   which is what makes "cite here" mean here rather than at the end. The
   trailing space is not cosmetic — without it the caret lands inside the
   chip's own boundary on some engines and the next character typed is
   swallowed into an element marked contenteditable="false". */
/* execCommand inserts at the SELECTION, and a surface that has never been
   clicked into has none — focus() alone does not always create one. That
   is why inserting a sticker or a citation did nothing in a connector's
   note: the picker was reached from the toolbar without the note ever
   having been typed in, so there was no caret for the insert to land at.
   Putting one at the end first makes the insert land somewhere real. */
function placeCaretIn(surface){
  surface.focus({preventScroll:true});
  const sel = window.getSelection && window.getSelection();
  if(!sel) return;
  const inside = sel.rangeCount > 0 && surface.contains(sel.getRangeAt(0).commonAncestorContainer);
  if(inside) return;
  const r = document.createRange();
  r.selectNodeContents(surface);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}
/* Inserted through the Range API rather than execCommand.
 *
 * execCommand('insertHTML') silently declines to place an element marked
 * contenteditable="false" — which is exactly what a citation chip is — and
 * returns success while changing nothing. That is why inserting a citation
 * into a connector's note did nothing at all: the call was made, the
 * surface was right, and the DOM simply never moved.
 *
 * Building the nodes and dropping them at the caret is both reliable and
 * less magical: the caret ends up after what was inserted, where the next
 * keystroke belongs. */
function insertIntoSurface(surface, markup){
  if(!surface) return;
  placeCaretIn(surface);
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount){ return; }
  let range = sel.getRangeAt(0);
  /* Never INSIDE a reading. A reading is a word with an annotation over
     it, and its two halves are plain text by definition — a picture
     dropped between its letters had nowhere to be written down, so it was
     silently thrown away the next time the text was read back. The caret
     steps out to just after the reading instead, which is where a sticker
     put "on that word" belongs. */
  {
    const host = range.startContainer;
    const e0 = host && (host.nodeType === 1 ? host : host.parentElement);
    const rb = e0 && e0.closest ? e0.closest('ruby') : null;
    if(rb && surface.contains(rb)){
      range = document.createRange();
      range.setStartAfter(rb);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  range.deleteContents();

  const holder = document.createElement('div');
  holder.innerHTML = inlineToHtml(markup);
  const frag = document.createDocumentFragment();
  while(holder.firstChild) frag.appendChild(holder.firstChild);
  /* No space of its own. A citation is written flush against the word it
     cites, and adding one meant every insert had to be un-typed. The caret
     is placed after the inserted run instead, which is where the next
     keystroke belongs. */
  const lastNode = frag.lastChild;
  range.insertNode(frag);
  if(lastNode){
    const after = document.createRange();
    after.setStartAfter(lastNode);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }

  surface.dispatchEvent(new Event('input', {bubbles:true}));
}
function insertSticker(key){
  const surface = stickerPickerTarget;
  closeStickerPicker();
  if(!surface) return;
  // Same route as a citation: see insertIntoSurface.
  insertIntoSurface(surface, `{{s:${key}}}`);
}
document.getElementById('stickerPickerManage').onclick = (ev)=>{
  ev.stopPropagation();
  closeStickerPicker();
  /* Reached from a text field inside another panel, so this one opens over
     what is already there instead of replacing it — otherwise managing a
     sticker would throw away the half-written entry that wanted it. */
  openStickerLibrary();
};
stickerPicker.addEventListener('click', ev=> ev.stopPropagation());
document.addEventListener('mousedown', ev=>{
  if(!stickerPicker.classList.contains('open')) return;
  if(stickerPicker.contains(ev.target) || (ev.target.closest && ev.target.closest('.tb-sticker-btn'))) return;
  closeStickerPicker();
});

// Every formatting toolbar gets the button, including the ones inside
// language-tab rows that are built after this runs — hence the observer.
function addStickerButton(bar){
  if(bar.querySelector('.tb-sticker-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-sticker-btn';
  btn.textContent = '☺';
  btn.title = 'Insert a sticker';
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(stickerPicker.classList.contains('open') ){ closeStickerPicker(); return; }
    const surface = surfaceForToolbar(bar);
    if(surface) openStickerPicker(btn, surface);
  });
  bar.appendChild(btn);
}
// Which editing surface a toolbar acts on — the same resolution the B/I
// buttons use, so the sticker lands in the field the toolbar belongs to.
function surfaceForToolbar(bar){
  const target = bar.querySelector('[data-wrap-target]');
  const id = target && target.dataset.wrapTarget;
  const rec = richFields.get(id);
  return rec ? rec.surface : null;
}
/* The cite button, on every formatting toolbar beside the sticker one.
   Inserting is a menu rather than free typing because the token carries a
   key, not a number: nobody should have to know or type "{{r:beast-wars}}",
   and picking from the list is also what guarantees the mark points at a
   reference that exists. */
function addRefButton(bar){
  if(bar.querySelector('.tb-ref-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-ref-btn';
  btn.textContent = '[n]';
  btn.title = 'Cite a reference';
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    const surface = surfaceForToolbar(bar);
    if(!surface) return;
    if(!REFS.length){
      openRefsPanel(null);
      setRefsStatus('err', 'Add a reference first, then cite it from the text.');
      return;
    }
    openRefPicker(btn, surface);
  });
  bar.appendChild(btn);
}
/* The picker reuses the sticker picker's shell — same shape, same place,
   same dismissal — so the two insert buttons behave identically. */
const refPicker = document.getElementById('refPicker');
const refPickerGrid = document.getElementById('refPickerGrid');
function openRefPicker(anchorBtn, surface){
  refPickerGrid.innerHTML = '';
  REFS.forEach((r, i)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ref-pick';
    b.innerHTML = `<span class="ref-num">[${i+1}]</span><span>${escapeHtml(refBodyText(r)) || '<em>empty</em>'}</span>`;
    b.addEventListener('click', ev=>{
      ev.stopPropagation();
      insertIntoSurface(surface, '{{r:' + r.key + '}}');
      closeRefPicker();
    });
    refPickerGrid.appendChild(b);
  });
  const rect = anchorBtn.getBoundingClientRect();
  refPicker.style.left = Math.max(8, Math.min(window.innerWidth - 232, rect.left)) + 'px';
  refPicker.style.top = (rect.bottom + 6) + 'px';
  refPicker.classList.add('open');
}
function closeRefPicker(){ refPicker.classList.remove('open'); }
refPicker.addEventListener('click', ev=> ev.stopPropagation());
document.addEventListener('mousedown', ev=>{
  if(!refPicker.classList.contains('open')) return;
  if(refPicker.contains(ev.target) || (ev.target.closest && ev.target.closest('.tb-ref-btn'))) return;
  closeRefPicker();
});

/* A face picker on every text toolbar.
 *
 * Font used to be a property of a whole entry, chosen in a select above the
 * label — so a connector's note, a language tab and a free text field had
 * no way to set one at all, and no text anywhere could mix two faces. It is
 * markup now, like bold and colour, which gives every field the same
 * control and makes it work on a selection rather than on everything. */
/* The sizes the toolbar offers. A hand-typed value is still accepted by
   the command underneath; this is just the list worth pointing at. */
const TB_SIZES = [7, 8, 9, 10, 11.5, 13, 15, 17, 20, 24, 28, 34];
function addFontButton(bar){
  if(bar.querySelector('.tb-font')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const sel = document.createElement('select');
  sel.className = 'tb-font';
  sel.title = 'Face for the selected text — or, with nothing selected, for the whole of it';
  /* "custom" is something the picker SAYS, never something you can pick:
     hidden keeps it out of the list that drops down, while a select still
     shows a hidden option's label when that option is the selected one. */
  sel.innerHTML = '<option value="">Face…</option>' +
    '<option value="__mixed__" class="tb-custom" hidden>custom</option>' +
    FONT_OPTIONS.map(f=> `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join('') +
    '<option value="__clear__">— clear —</option>';
  // Choosing must not first collapse the selection the choice is for.
  sel.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
  sel.addEventListener('change', ev=>{
    ev.stopPropagation();
    const key = sel.value;
    const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
    if(!surface || !key || key === '__mixed__'){ syncToolbarFace(bar); return; }
    applyRichCommand(surface, key === '__clear__' ? 'unfont' : 'font', key);
    syncToolbarFace(bar);
  });
  bar.appendChild(sel);

  const size = document.createElement('select');
  size.className = 'tb-font tb-size';
  size.title = 'Size for the selected text — or, with nothing selected, for the whole of it';
  size.innerHTML = '<option value="">Size…</option>' +
    '<option value="__mixed__" class="tb-custom" hidden>custom</option>' +
    TB_SIZES.map(v=> `<option value="${v}">${v}</option>`).join('') +
    '<option value="__clear__">— clear —</option>';
  size.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
  size.addEventListener('change', ev=>{
    ev.stopPropagation();
    const v = size.value;
    const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
    if(!surface || !v || v === '__mixed__'){ syncToolbarFace(bar); return; }
    applyRichCommand(surface, v === '__clear__' ? 'unsize' : 'size', v);
    syncToolbarFace(bar);
  });
  bar.appendChild(size);
}

/* What the two pickers SHOW: the face and the size the text is actually
   set in.
 *
 * They used to be write-only — pick a face, watch it apply, and the picker
 * went straight back to saying "Face…", so nothing on the page ever told
 * you what a run was set in. Now they report: one face across everything
 * looked at shows that face, a mixture shows "custom", and nothing of
 * their own shows the placeholder. With no selection they describe the
 * whole text, which is what the entry-wide dropdown used to be for. */
/* What the text in this field is set in when nothing overrides it.
 *
 * With the entry-wide face and size controls gone, "the size of this text"
 * is a question the toolbar has to answer for itself — and the honest
 * answer for a run that carries no size of its own is the size it is
 * actually drawn at, not "nothing". Otherwise a plain label reported no
 * size at all, which read as the picker having lost track. */
function baseTypeFor(surface){
  const rec = [...richFields.entries()].find(([, v])=> v.surface === surface);
  const id = rec ? rec[0] : null;
  /* Which entry's own ink the ⟲ falls back to. The field that carries an
     entry's words is the in-node one now; the drawer's Label box, which
     used to be the other, is gone. */
  const ofNode = (id === 'nodeEditorText') && selectedId ? nodes.get(selectedId) : null;
  const langTab = surface && surface.classList && surface.classList.contains('lang-tab-text')
    && selectedId ? nodes.get(selectedId) : null;
  const n = ofNode || langTab;
  return {
    face: (n && n.font) || FONT_OPTIONS[0].key,
    size: (n && typeof n.fontSize === 'number') ? n.fontSize : NODE_FS
  };
}
function runsOfSelection(surface){
  const sel = window.getSelection && window.getSelection();
  let range = null;
  if(sel && sel.rangeCount){
    const r0 = sel.getRangeAt(0);
    if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)) range = r0;
  }
  const out = [];
  const walk = (node, face, size)=>{
    Array.from(node.childNodes).forEach(child=>{
      if(child.nodeType === 3){
        if(!child.textContent || !/\S/.test(child.textContent)) return;
        if(range && !range.intersectsNode(child)) return;
        out.push({face, size});
        return;
      }
      if(child.nodeType !== 1) return;
      const f = fontKeyOfEl(child) || face, z = sizeOfEl(child) || size;
      /* A sticker and a citation are runs in their own right — a picture
         and a chip, not words. A sticker has no text inside it to find, so
         it contributed nothing at all and a phrase carrying one set larger
         reported a single size: the picker said 11.5 where it should have
         said "custom". A citation's own digits are not text anyone typed
         either, so it answers as one run rather than as its label. */
      if(child.dataset && (child.dataset.sticker || child.dataset.ref)){
        /* It has a SIZE — that is how either of them is enlarged — but no
           FACE: a picture is not set in a typeface, and counting one made
           the face picker report "custom" for a phrase that was all in one
           face with a sticker in it. Colour is already inert on both for
           the same reason; this is the same rule for type. */
        if(!range || range.intersectsNode(child)) out.push({face:null, size:z, noFace:true});
        return;
      }
      walk(child, f, z);
    });
  };
  walk(surface, null, null);
  return out;
}
function commonValue(list, pick){
  if(!list.length) return null;
  const first = pick(list[0]);
  return list.every(r=> pick(r) === first) ? (first === null ? '' : String(first)) : '__mixed__';
}
function syncToolbarFace(bar){
  if(!bar) return;
  const surface = surfaceForToolbar(bar);
  const face = bar.querySelector('.tb-font:not(.tb-size)');
  const size = bar.querySelector('.tb-size');
  if(!surface){ if(face) face.value = ''; if(size) size.value = ''; return; }
  const base = baseTypeFor(surface);
  // A run with nothing of its own is set in the field's own face and size,
  // and that is what the picker should say.
  const runs = runsOfSelection(surface).map(r=> ({
    face: r.face || base.face,
    size: r.size || base.size,
    noFace: !!r.noFace
  }));
  const put = (sel, v)=>{
    if(!sel) return;
    if(v === null){ sel.value = ''; return; }
    if(v === '__mixed__'){ sel.value = '__mixed__'; mark(sel); return; }
    sel.value = [...sel.options].some(o=> o.value === v) ? v : '__mixed__';
    mark(sel);
  };
  /* Italics on the OPTION never showed: a closed select draws the selected
     option's label in the select's own type, not the option's, so the rule
     applied only inside the drop-down list — where "custom" is hidden and
     therefore never appears. The select itself has to carry it. */
  const mark = (sel)=> sel.classList.toggle('is-custom', sel.value === '__mixed__');
  put(face, commonValue(runs.filter(r=> !r.noFace), r=> r.face));
  put(size, commonValue(runs, r=> r.size));
}
// Whichever toolbar owns this surface — matched by asking each of them,
// which is the same question the commands ask when they act.
function toolbarForSurface(surface){
  return [...document.querySelectorAll('.mini-toolbar')]
    .find(bar=> surfaceForToolbar(bar) === surface) || null;
}
document.addEventListener('selectionchange', ()=>{
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const host = sel.getRangeAt(0).commonAncestorContainer;
  const el0 = host && (host.nodeType === 1 ? host : host.parentElement);
  const surface = el0 && el0.closest && el0.closest('.rich-surface');
  if(!surface) return;
  const bar = toolbarForSurface(surface);
  syncToolbarFace(bar);
  syncToolbarLines(bar);
});
/* The same hold-and-restore the hex box uses, keyed by toolbar. */
const heldBarSelection = new Map();
function rememberToolbarSelection(bar){
  const surface = surfaceForToolbar(bar);
  const sel = window.getSelection && window.getSelection();
  if(!surface || !sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if(surface.contains(r.commonAncestorContainer)) heldBarSelection.set(bar, r.cloneRange());
}
function restoreToolbarSelection(bar){
  const surface = surfaceForToolbar(bar);
  if(!surface) return surface;
  // Live selection first, remembered one only as a fallback — same rule,
  // and for the same reason, as restoreSurfaceSelection above.
  const live = window.getSelection && window.getSelection();
  if(live && live.rangeCount){
    const r0 = live.getRangeAt(0);
    if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)){
      heldBarSelection.delete(bar);
      return surface;
    }
  }
  const held = heldBarSelection.get(bar);
  if(!held) return surface;
  surface.focus({preventScroll:true});
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(held);
  return surface;
}
/* A rule under the words, and one through them.
 *
 * Each is a button that turns the line on and off, with the KIND of line
 * beside it — the same choice of line a connector offers. A citation is
 * exempt from both: it is a chip, not a word, and a rule drawn across a
 * number that points somewhere reads as a number that has been cancelled.
 * The style picker sits between the two buttons because it belongs to
 * whichever of them is on; changing it restyles whatever is already
 * there. */
function addLineButtons(bar){
  if(bar.querySelector('.tb-line-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target) return;
  const mk = (kind, glyph, title)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-line-btn tb-line-' + kind;
    b.innerHTML = glyph;
    b.title = title;
    b.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
    b.addEventListener('click', ev=>{
      ev.stopPropagation();
      const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
      if(!surface) return;
      const pick = bar.querySelector('.tb-line-style');
      applyRichCommand(surface, kind, pick ? pick.value : 'solid');
      syncToolbarLines(bar);
    });
    return b;
  };
  /* The three read as one control and are kept on one line: the button
     that turns a rule on, the kind of rule, and the button for the other
     rule. Wrapping between them made the picker look as though it
     belonged to whatever happened to end up beside it. */
  const group = document.createElement('span');
  group.className = 'tb-line-group';
  group.appendChild(mk('under', '<span style="text-decoration:underline">U</span>', 'Rule under the selected text'));
  const pick = document.createElement('select');
  pick.className = 'tb-font tb-line-style';
  pick.title = 'What kind of rule';
  pick.innerHTML = Object.keys(LINE_STYLES)
    .map(k=> `<option value="${k}">${LINE_STYLES[k].label}</option>`).join('');
  pick.addEventListener('mousedown', ()=> rememberToolbarSelection(bar));
  pick.addEventListener('change', ev=>{
    ev.stopPropagation();
    /* Changing the kind restyles a rule that is already there rather than
       waiting to be asked again — which is what a picker beside a pressed
       button is understood to do. */
    const surface = restoreToolbarSelection(bar) || surfaceForToolbar(bar);
    if(!surface) return;
    const state = lineStateOf(surface);
    if(state.under) applyRichCommand(surface, 'under', pick.value, true);
    if(state.strike) applyRichCommand(surface, 'strike', pick.value, true);
    syncToolbarLines(bar);
  });
  group.appendChild(pick);
  group.appendChild(mk('strike', '<span style="text-decoration:line-through">S</span>', 'Rule through the selected text'));
  bar.appendChild(group);
}
/* Whether the selection already carries a rule, and of what kind. */
function lineStateOf(surface){
  const sel = window.getSelection && window.getSelection();
  let range = null;
  if(sel && sel.rangeCount){
    const r0 = sel.getRangeAt(0);
    if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)) range = r0;
  }
  const out = {under:null, strike:null};
  const walk = (node, u, k)=>{
    Array.from(node.childNodes).forEach(child=>{
      if(child.nodeType === 3){
        if(!/\S/.test(child.textContent || '')) return;
        if(range && !range.intersectsNode(child)) return;
        if(u) out.under = u;
        if(k) out.strike = k;
        return;
      }
      if(child.nodeType !== 1) return;
      walk(child, underOfEl(child) || u, strikeOfEl(child) || k);
    });
  };
  walk(surface, null, null);
  return out;
}
function syncToolbarLines(bar){
  const surface = surfaceForToolbar(bar);
  const u = bar.querySelector('.tb-line-under'), k = bar.querySelector('.tb-line-strike');
  const pick = bar.querySelector('.tb-line-style');
  if(!u || !k) return;
  const st = surface ? lineStateOf(surface) : {under:null, strike:null};
  u.classList.toggle('on', !!st.under);
  k.classList.toggle('on', !!st.strike);
  if(pick && (st.under || st.strike)) pick.value = st.under || st.strike;
}
