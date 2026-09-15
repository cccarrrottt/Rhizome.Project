/* ---------------------------------------------------------------------
   Figures in a comment.

   The button lives on the comment's own toolbar and nowhere else. An
   entry's LABEL is drawn into the chart as SVG text, and a picture cannot
   go there — offering the button on every field would have been offering
   something that silently vanished on three fields out of four.

   A picture is redrawn to a sensible column width before it is stored,
   the way a sticker and a portrait already are; a clip is stored as it
   came, because there is no way to re-encode video in a page, and refused
   outright above a size that would make the chart unopenable. A link is
   the way out of that: it costs the chart nothing and needs the network.
   ------------------------------------------------------------------ */
const MEDIA_IMG_MAX = 760;               // px, the widest a stored picture is kept
/* How wide a re-encoded clip is kept, and the floor below which shrinking
   it further buys a file nobody wants to watch. */
const MEDIA_VIDEO_MAX_W = 640;
const MEDIA_VIDEO_MIN_BPS = 140e3;
const MEDIA_VIDEO_MAX_BPS = 2.4e6;
/* How big the published page may get.
 *
 * The host refuses past its own limit — sixteen megabytes of rendered page
 * — and the refusal arrives at SAVE time, long after the picture was
 * chosen, with no way back but Ctrl+Z. Checking here means the answer
 * comes while the file is still in the reader's hand. Held a couple of
 * megabytes under the real ceiling, because what is measured here is the
 * page as it stands and what is published is the page plus whatever else
 * changes before Save. */
const PUBLISH_BUDGET = 13.5 * 1024 * 1024;
function publishedBytesWith(extra){
  const base = (typeof PRISTINE_HTML === 'string' && PRISTINE_HTML) ? PRISTINE_HTML.length : 0;
  return base + (extra || 0);
}
const mediaPicker = document.getElementById('mediaPicker');
const mediaPickerGrid = document.getElementById('mediaPickerGrid');
const mediaPickerStatus = document.getElementById('mediaPickerStatus');
const mediaFile = document.getElementById('mediaFile');
const mediaLinkInput = document.getElementById('mediaLinkInput');
let mediaPickerTarget = null;            // the rich surface a pick lands in

function setMediaStatus(kind, msg){
  if(!mediaPickerStatus) return;
  mediaPickerStatus.className = 'media-picker-status ' + (kind || '');
  mediaPickerStatus.textContent = msg || '';
}
function closeMediaPicker(){
  if(mediaPicker) mediaPicker.classList.remove('open');
  mediaPickerTarget = null;
}
function openMediaPicker(btn, surface){
  mediaPickerTarget = surface;
  renderMediaPicker();
  setMediaStatus('', '');
  mediaPicker.classList.add('open');
  const r = btn.getBoundingClientRect();
  const pr = mediaPicker.getBoundingClientRect();
  let left = Math.min(r.left, window.innerWidth - pr.width - 10);
  let top = r.bottom + 6;
  if(top + pr.height > window.innerHeight - 10) top = Math.max(10, r.top - pr.height - 6);
  mediaPicker.style.left = Math.max(10, left) + 'px';
  mediaPicker.style.top = top + 'px';
}
/* Everything already in the chart, so the same still can be dropped into a
   second comment without being carried a second time. */
function renderMediaPicker(){
  mediaPickerGrid.innerHTML = '';
  if(!MEDIA.length){
    const p = document.createElement('div');
    p.className = 'sticker-picker-empty';
    p.textContent = 'No figures in this chart yet.';
    mediaPickerGrid.appendChild(p);
    return;
  }
  MEDIA.forEach(m=>{
    const b = document.createElement('button');
    b.type = 'button'; b.title = m.name || m.key;
    b.className = 'media-pick';
    if(m.kind === 'video'){
      const v = document.createElement('video');
      v.src = m.src; v.muted = true; v.preload = 'metadata';
      b.appendChild(v);
      const tag = document.createElement('span');
      tag.className = 'media-pick-kind'; tag.textContent = '▶';
      b.appendChild(tag);
    } else {
      const img = document.createElement('img');
      img.src = m.src; img.alt = m.name || m.key;
      b.appendChild(img);
    }
    b.onclick = (ev)=>{ ev.stopPropagation(); insertMedia(m.key); };
    /* Removing one is the same gesture the sticker library uses, and it
       leaves the token behind: re-adding the picture brings the figure
       back where it was, exactly as a sticker does. */
    const del = document.createElement('span');
    del.className = 'media-pick-del';
    del.textContent = '×';
    del.title = 'Remove this figure from the chart';
    del.onclick = (ev)=>{
      ev.stopPropagation();
      if(readOnlyView) return;
      applyMediaEdit(()=>{
        const i = MEDIA.findIndex(x=> x.key === m.key);
        if(i >= 0) MEDIA.splice(i, 1);
      });
      renderMediaPicker();
    };
    b.appendChild(del);
    mediaPickerGrid.appendChild(b);
  });
}
function applyMediaEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  rebuildMediaMap();
  rebuildChart();
  refreshSaveUI();
}
function insertMedia(key){
  const surface = mediaPickerTarget;
  closeMediaPicker();
  if(!surface) return;
  /* On a line of its own, both sides. A figure is a block in the flow of
     the prose, and dropping one into the middle of a sentence would leave
     the sentence broken around something that cannot be read as a word. */
  insertIntoSurface(surface, `\n{{m:${key}}}\n`);
}
/* A still is redrawn at a sane width before it is stored. A page carrying
   a dozen four-megapixel photographs is a page nobody can open. */
function shrinkImageToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error('could not read that file'));
    fr.onload = ()=>{
      const raw = String(fr.result);
      /* An animated GIF cannot survive a canvas — only its first frame
         would — so it is kept exactly as it came, like a sticker. */
      if(/^data:image\/gif;/i.test(raw)){ resolve(raw); return; }
      const img = new Image();
      img.onerror = ()=> reject(new Error('that file is not a picture this browser can read'));
      img.onload = ()=>{
        const scale = Math.min(1, MEDIA_IMG_MAX / Math.max(img.width || 1, 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.src = raw;
    };
    fr.readAsDataURL(file);
  });
}
function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error('could not read that file'));
    fr.onload = ()=> resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
/* Re-encoding a clip so it fits.
 *
 * There is no fixed size limit any more, because a fixed limit is the
 * wrong shape of answer: what matters is not how big the file is but
 * whether the page can still be published with it in, and that depends on
 * everything else the chart is already carrying. So the budget is worked
 * out, and a clip too big for it is re-encoded to fit rather than refused.
 *
 * Done by playing it and recording what comes out: the frames go through a
 * canvas at a smaller size, the sound rides along untouched, and the
 * recorder is given the bitrate that lands on the budget. It runs at
 * playing speed, because it IS the clip playing — a long one takes as long
 * as it lasts — so it says how far along it is and can be left alone.
 *
 * Below a floor bitrate the result is a clip nobody would want to watch,
 * and the honest answer there is a link, which costs the chart nothing. */
function canReencodeVideo(){
  return typeof MediaRecorder !== 'undefined' &&
         typeof HTMLCanvasElement.prototype.captureStream === 'function';
}
function videoRecordType(){
  const want = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return want.find(t=> MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}
function onceEvent(el, name){
  return new Promise((resolve, reject)=>{
    el.addEventListener(name, resolve, {once:true});
    el.addEventListener('error', ()=> reject(new Error('that video could not be read')), {once:true});
  });
}
async function reencodeVideoToFit(file, budgetBytes, onProgress){
  const type = videoRecordType();
  if(!canReencodeVideo() || !type) throw new Error('this browser cannot re-encode video');
  const url = URL.createObjectURL(file);
  try{
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
    await onceEvent(v, 'loadedmetadata');
    const dur = Math.max(0.2, await videoDuration(v));
    /* The budget is in base64 characters, and base64 costs a third on top
       of the bytes; the recorder is given bits per second, and a little is
       held back for the container and the sound. */
    const rawBudget = Math.floor(budgetBytes * 3 / 4);
    const bits = Math.floor(rawBudget * 8 / dur) - 64e3;
    if(bits < MEDIA_VIDEO_MIN_BPS){
      throw new Error(`even re-encoded, ${Math.round(dur)} seconds of video will not fit in ` +
        `what is left of the page. Paste a link to it instead`);
    }
    const videoBits = Math.min(MEDIA_VIDEO_MAX_BPS, bits);
    const scale = Math.min(1, MEDIA_VIDEO_MAX_W / Math.max(1, v.videoWidth || MEDIA_VIDEO_MAX_W));
    const w = Math.max(2, Math.round((v.videoWidth || 640) * scale / 2) * 2);
    const h = Math.max(2, Math.round((v.videoHeight || 360) * scale / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(24);
    /* The sound comes off the source element rather than being decoded
       again — a muted element still hands over its audio track, muting
       being about this page's speakers and not about the stream. */
    try{
      const from = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
      if(from) from.getAudioTracks().forEach(t=> stream.addTrack(t));
    }catch(e){ /* a clip with no sound, or a browser that will not share it */ }
    const rec = new MediaRecorder(stream, {mimeType:type, videoBitsPerSecond: videoBits,
                                           audioBitsPerSecond: 48000});
    const chunks = [];
    let written = 0, overran = false;
    /* The recorder is aimed at the budget, not held to it: a stretch of
       hard-to-compress picture can overshoot. Watching what it actually
       writes and stopping at the line gives a short clip that fits rather
       than a whole one that cannot be saved — and says so. */
    const cap = Math.floor(budgetBytes * 3 / 4);
    rec.ondataavailable = e=>{
      if(!e.data || !e.data.size) return;
      chunks.push(e.data); written += e.data.size;
      if(written > cap && rec.state === 'recording'){ overran = true; rec.stop(); }
    };
    const stopped = new Promise(r=> rec.onstop = r);
    rec.start(500);
    await v.play();
    let frame = 0;
    const draw = ()=>{
      try{ ctx.drawImage(v, 0, 0, w, h); }catch(e){}
      if(onProgress) onProgress(Math.min(1, (v.currentTime || 0) / dur));
      frame = requestAnimationFrame(draw);
    };
    draw();
    await Promise.race([onceEvent(v, 'ended'), stopped]);
    cancelAnimationFrame(frame);
    try{ v.pause(); }catch(e){}
    if(rec.state === 'recording') rec.stop();
    await stopped;
    /* The container type WITHOUT the recorder's codec parameter.
     *
       A data: URL is split at its FIRST comma — everything before it is
       the media type, everything after is the payload. The recorder's own
       type is `video/webm;codecs=vp9,opus`, and a comma sits in the middle
       of it: written into a data: URL verbatim, the type came out as
       `video/webm;codecs=vp9` and the payload began `opus;base64,…`, read
       as percent-encoded text rather than as base64. The bytes were all
       there and no player could make anything of them. The codecs are
       written in the container besides, so naming them in the URL was
       never telling anyone anything they could not already see. */
    const out = new Blob(chunks, {type: (type.split(';')[0] || 'video/webm')});
    out.truncated = overran;
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
/* How long a clip is, when it will not simply say.
 *
 * A file written by a browser's own recorder — which is what a re-encoded
 * clip is, and what a clip recorded on a phone can be — carries no
 * duration in its header, and the element reports Infinity. Seeking past
 * the end forces the decoder to find the real end and report it, which is
 * the long-standing way round this; the seek is undone before anything is
 * played. */
function videoDuration(v){
  if(Number.isFinite(v.duration) && v.duration > 0) return Promise.resolve(v.duration);
  return new Promise(resolve=>{
    let done = false;
    const finish = (d)=>{
      if(done) return;
      done = true;
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      try{ v.currentTime = 0; }catch(e){}
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    const onDur = ()=>{ if(Number.isFinite(v.duration) && v.duration > 0) finish(v.duration); };
    const onTime = ()=>{
      if(Number.isFinite(v.duration) && v.duration > 0){ finish(v.duration); return; }
      /* Still unknown: walk further out rather than sitting at a time the
         decoder has already refused. */
      try{ v.currentTime = (v.currentTime || 0) + 1e5; }catch(e){ finish(0); }
    };
    v.addEventListener('durationchange', onDur);
    v.addEventListener('timeupdate', onTime);
    try{ v.currentTime = 1e101; }catch(e){ finish(0); }
    setTimeout(()=> finish(v.duration), 4000);
  });
}
function blobToDataUrl(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error('could not read the re-encoded clip'));
    fr.onload = ()=> resolve(String(fr.result));
    fr.readAsDataURL(blob);
  });
}
async function addMediaFromFile(file){
  const isVideo = /^video\//i.test(file.type);
  const room = PUBLISH_BUDGET - publishedBytesWith(0);
  let src;
  try{
    if(!isVideo){
      src = await shrinkImageToDataUrl(file);
    } else {
      /* A base64 character per byte and a third again: what the file would
         cost the page as it stands. */
      const wouldCost = Math.ceil(file.size * 4 / 3);
      if(wouldCost <= room){
        src = await readFileAsDataUrl(file);
      } else if(!canReencodeVideo()){
        setMediaStatus('err', `that clip is ${(file.size/1048576).toFixed(1)} MB and there is room for about ` +
          `${(room*3/4/1048576).toFixed(1)} MB. Paste a link to it instead.`);
        return;
      } else {
        setMediaStatus('', `Re-encoding to fit \u2014 this plays the clip through, so it takes as long as the clip lasts\u2026`);
        const blob = await reencodeVideoToFit(file, room * 0.92,
          f=> setMediaStatus('', `Re-encoding to fit \u2014 ${Math.round(f*100)}%\u2026`));
        src = await blobToDataUrl(blob);
        setMediaStatus(blob.truncated ? 'err' : 'ok',
          blob.truncated
            ? `Only the first part fitted (${(blob.size/1048576).toFixed(1)} MB). Paste a link for the whole clip.`
            : `Re-encoded to ${(blob.size/1048576).toFixed(1)} MB.`);
      }
    }
  }catch(e){
    setMediaStatus('err', e && e.message ? e.message : 'could not read that file');
    return;
  }
  if(!mediaSrcOk(src)){ setMediaStatus('err', 'that file is not a picture or a video.'); return; }
  /* …and the page still has to be publishable with it in. A re-encode aims
     at the budget rather than guaranteeing it, so the last word is here. */
  if(publishedBytesWith(src.length) > PUBLISH_BUDGET){
    setMediaStatus('err', `that would take the chart past what can be published (about ` +
      `${(publishedBytesWith(src.length)/1048576).toFixed(1)} MB). Paste a link to it instead.`);
    return;
  }
  const name = (file.name || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || (isVideo ? 'clip' : 'figure');
  const key = uniqueMediaKey(name);
  applyMediaEdit(()=> MEDIA.push({key, name, kind: isVideo ? 'video' : 'image', src}));
  const surface = mediaPickerTarget;
  renderMediaPicker();
  if(surface){ mediaPickerTarget = surface; insertMedia(key); }
  else setMediaStatus('ok', 'Added.');
}
if(mediaFile) mediaFile.addEventListener('change', async ()=>{
  const f = (mediaFile.files || [])[0];
  mediaFile.value = '';
  if(f) await addMediaFromFile(f);
});
{
  const fileBtn = document.getElementById('mediaPickerFile');
  if(fileBtn) fileBtn.onclick = (ev)=>{ ev.stopPropagation(); mediaFile.click(); };
  const linkBtn = document.getElementById('mediaLinkAdd');
  const addLink = ()=>{
    const url = (mediaLinkInput.value || '').trim();
    if(!url) return;
    if(!mediaSrcOk(url)){ setMediaStatus('err', 'that link is not an http(s) address.'); return; }
    /* Which of the two it is, guessed from the address. A link has no MIME
       type until it is fetched, and guessing wrong only means the figure
       is drawn with the wrong element, which the reader can see at once. */
    const kind = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(url) ? 'video' : 'image';
    const name = (url.split(/[\/?#]/).filter(Boolean).pop() || 'figure').slice(0, 40);
    const key = uniqueMediaKey(name);
    applyMediaEdit(()=> MEDIA.push({key, name, kind, src: safeUrl(url)}));
    mediaLinkInput.value = '';
    const surface = mediaPickerTarget;
    renderMediaPicker();
    if(surface){ mediaPickerTarget = surface; insertMedia(key); }
  };
  if(linkBtn) linkBtn.onclick = (ev)=>{ ev.stopPropagation(); addLink(); };
  if(mediaLinkInput) mediaLinkInput.addEventListener('keydown', ev=>{
    if(ev.key === 'Enter'){ ev.preventDefault(); addLink(); }
  });
}
if(mediaPicker){
  mediaPicker.addEventListener('click', ev=> ev.stopPropagation());
  document.addEventListener('mousedown', ev=>{
    if(!mediaPicker.classList.contains('open')) return;
    if(mediaPicker.contains(ev.target) || (ev.target.closest && ev.target.closest('.tb-media-btn'))) return;
    closeMediaPicker();
  });
}
/* Only the fields that are rendered as a DOCUMENT get the button. */
const MEDIA_FIELDS = new Set(['detailNoteInput']);
function addMediaButton(bar){
  if(bar.querySelector('.tb-media-btn')) return;
  const target = bar.querySelector('[data-wrap-target]');
  if(!target || !MEDIA_FIELDS.has(target.dataset.wrapTarget)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tb-media-btn';
  btn.textContent = '▣';
  btn.title = 'Place a picture or a video in this comment';
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(mediaPicker.classList.contains('open')){ closeMediaPicker(); return; }
    const surface = surfaceForToolbar(bar);
    if(surface) openMediaPicker(btn, surface);
  });
  bar.appendChild(btn);
}
function wireStickerButtons(){
  document.querySelectorAll('.mini-toolbar').forEach(bar=>{
    addFontButton(bar); addLineButtons(bar); addStickerButton(bar); addRefButton(bar);
    addMediaButton(bar);
  });
}
wireStickerButtons();

/* Choosing an entry's tags.
 *
 * The text box is gone. Typing a tag by hand is how a tag list rots: one
 * misspelling becomes a second, nearly identical tag that filters
 * separately and looks the same in the panel, and nothing ever notices.
 * Tags are made once, in Management, and here they are only chosen.
 *
 * The input element stays, hidden. It is still the canonical value —
 * everything that reads or writes an entry's tags goes through it — so
 * this is a new face on the same field rather than a new field. */
function currentTagsIn(input){
  return input.value.split(',').map(t=> t.trim()).filter(Boolean);
}
function setTagsIn(input, list){
  input.value = list.join(', ');
  input.dispatchEvent(new Event('input', {bubbles:true}));
}
function paintTagChips(chipsEl, input){
  chipsEl.innerHTML = '';
  currentTagsIn(input).forEach(tag=>{
    const chip = document.createElement('span');
    chip.className = 'tag-chip tag-shape';
    const eye = document.createElement('i');
    eye.className = 'tag-eye';
    chip.appendChild(eye);
    chip.appendChild(document.createTextNode(tag));
    if(tagIsSpecial(tag)){
      const st = document.createElement('span');
      st.className = 'tag-special';
      st.textContent = '*';
      st.title = SPECIAL_TAGS[tag];
      chip.appendChild(st);
    }
    chip.title = tagIsSpecial(tag) ? SPECIAL_TAGS[tag] : '';
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '\u00d7'; x.title = `Remove "${tag}"`;
    x.addEventListener('click', ev=>{
      ev.stopPropagation();
      setTagsIn(input, currentTagsIn(input).filter(t=> t !== tag));
      paintTagChips(chipsEl, input);
    });
    chip.appendChild(x);
    chipsEl.appendChild(chip);
  });
}
/* Which tags this shape can wear. The two that draw scenery are refused
   to a portrait, where the scenery means nothing and does not fit. */
function tagsBarredFor(shape){
  return shape === 'ellipse' ? [HUB_TAG, LOCAL_TAG] : [];
}
function shapeOfTagForm(input){
  const sel = document.getElementById(
    input && input.id === 'editTagsInput' ? 'editShapeInput' : 'addNodeShape');
  return sel ? sel.value : '';
}
function keepAllowedTags(list, shape){
  const barred = tagsBarredFor(shape);
  return barred.length ? list.filter(t=> barred.indexOf(t) < 0) : list;
}
function fillTagMenu(menu, input, chipsEl){
  menu.innerHTML = '';
  const barred = tagsBarredFor(shapeOfTagForm(input));
  const have = new Set(currentTagsIn(input));
  const groups = realCategories().map(c=> ({name:c.name, tags:c.tags.slice().sort((a,b)=> a.localeCompare(b))}));
  const claimed = new Set(); groups.forEach(g=> g.tags.forEach(t=> claimed.add(t)));
  /* Same bucket, same name as the panel's. Anything that acts is filed
     here whatever else claims it — see buildLegend. */
  const reserved = new Set(knownTags().filter(t=> tagIsSpecial(t)));
  groups.forEach(g=>{ g.tags = g.tags.filter(t=> !reserved.has(t)); });
  const loose = knownTags().filter(t=> !claimed.has(t) || reserved.has(t));
  if(loose.length) groups.push({name:'Special', tags:loose});

  let any = false;
  groups.forEach(g=>{
    const opts = g.tags.filter(t=> !have.has(t) && barred.indexOf(t) < 0);
    if(!opts.length) return;
    any = true;
    const head = document.createElement('div');
    head.className = 'tag-menu-head';
    head.textContent = g.name;
    menu.appendChild(head);
    opts.forEach(t=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      if(tagIsSpecial(t)){
        const st = document.createElement('span');
        st.className = 'tag-special';
        st.textContent = '*';
        st.title = SPECIAL_TAGS[t];
        b.appendChild(st);
      }
      b.addEventListener('click', ev=>{
        ev.stopPropagation();
        const list = currentTagsIn(input);
        if(list.indexOf(t) < 0) list.push(t);
        setTagsIn(input, list);
        paintTagChips(chipsEl, input);
        menu.hidden = true;
      });
      menu.appendChild(b);
    });
  });
  if(!any){
    const none = document.createElement('button');
    none.type = 'button'; none.className = 'tag-menu-empty';
    none.textContent = knownTags().length ? 'All tags already added' : 'No tags yet — make one in Management';
    none.addEventListener('click', ev=> ev.stopPropagation());
    menu.appendChild(none);
  }
}
function wireTagField(prefix, inputId){
  const input = document.getElementById(inputId);
  const chipsEl = document.getElementById(prefix + 'Chips');
  const addBtn = document.getElementById(prefix + 'Add');
  const menu = document.getElementById(prefix + 'Menu');
  if(!input || !chipsEl || !addBtn || !menu) return;
  addBtn.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(!menu.hidden){ menu.hidden = true; return; }
    fillTagMenu(menu, input, chipsEl);
    menu.hidden = false;
  });
  menu.addEventListener('click', ev=> ev.stopPropagation());
  document.addEventListener('mousedown', ev=>{
    if(menu.hidden) return;
    if(menu.contains(ev.target) || ev.target === addBtn) return;
    menu.hidden = true;
  });
  // The value can also change from outside — opening a form, an undo.
  input.addEventListener('change', ()=> paintTagChips(chipsEl, input));
  paintTagChips(chipsEl, input);
  return ()=> paintTagChips(chipsEl, input);
}
const repaintEditTags = wireTagField('editTags', 'editTagsInput');
// Same again: wiring the field is the point; the repaint it hands back is
// only wanted for the entry drawer's copy, which does keep it.
wireTagField('addNodeTags', 'addNodeTags');

// The portrait field only means anything for a character bio, so it
// appears and disappears with that archetype.
const editBioCardField = document.getElementById('editBioCardField');
const editBioCardCheck = document.getElementById('editBioCardCheck');
const editImageField = document.getElementById('editImageField');
const editImageInput = document.getElementById('editImageInput');
const addNodeImageField = document.getElementById('addNodeImageField');
const addNodeImageInput = document.getElementById('addNodeImage');
/* A picture has no words, so the field that would write them is shut.
 *
 * The drawer offers one form for every archetype, and on an Image element
 * the Label row and its B / I / Ruby / colour toolbar were live but
 * pointless: whatever was typed there was thrown away on save, and the
 * toolbar acted on a field nothing would read. */
/* The same for the ADD form. A new Image element has no words either, and
   the row that would write them was live in both forms. */
function syncAddLabelFieldForShape(select){
  const rec = richFields.get('addNodeLabel');
  const off = !!select && select.value === 'image';
  if(rec){
    rec.surface.contentEditable = off ? 'false' : 'true';
    rec.surface.classList.toggle('locked', off);
  }
  const field = document.getElementById('addNodeLabel');
  const wrap = field ? field.closest('.editor-field') : null;
  if(wrap){
    wrap.classList.toggle('field-off', off);
    wrap.querySelectorAll('button, input, select').forEach(c=>{
      if(c.id === 'addNodeFont' || c.id === 'addNodeFontSize') return;
      c.disabled = off;
    });
  }
}
function syncLabelFieldForShape(select){
  const rec = richFields.get('nodeEditorText');
  /* Asked of the ENTRY when no field is named, because the form is only
     refilled as it opens: switching entries with it already open leaves
     the archetype select showing the one before. */
  const shape = select ? select.value
    : ((selectedId && nodes.get(selectedId) && nodes.get(selectedId).shape) || 'rect');
  const off = shape === 'image';
  if(rec){
    rec.surface.contentEditable = off ? 'false' : 'true';
    rec.surface.classList.toggle('locked', off);
  }
  const field = document.querySelector('#nodeEditorText');
  const wrap = field ? field.closest('.editor-field') : null;
  if(wrap){
    wrap.classList.toggle('field-off', off);
    wrap.querySelectorAll('button, input, select').forEach(c=>{
      // The two hidden font controls this skipped went with the Label box.
      if(c.hidden) return;
      c.disabled = off;
    });
  }
}
/* Only a portrait has a card to keep open. */
function syncBioCardField(select){
  if(!editBioCardField) return;
  editBioCardField.style.display = (select && select.value === 'ellipse') ? '' : 'none';
}
function syncImageFieldVisibility(select, field){
  // A portrait belongs to a character bio; a free-standing Image element
  // and a card both take their picture from the same field.
  const wantsImage = select.value === 'ellipse' || select.value === 'image'
    || (select === editShapeInput && typeof editCardCheck !== 'undefined' && editCardCheck.checked);
  field.style.display = wantsImage ? '' : 'none';
}
// Reached through the DOM rather than the module-level consts for these
// two selects: the Add Node form's own bindings are declared further down
// the file than this block runs.
{
  const editShape = document.getElementById('editShapeInput');
  const addShape = document.getElementById('addNodeShape');
  editShape.addEventListener('change', ()=>{
    syncCardFieldVisibility();
    syncBioCardField(editShape);
    syncImageFieldVisibility(editShape, editImageField);
    syncLabelFieldForShape(editShape);
    syncTextColorVisibility();
    syncColorFieldVisibility();
  });
  addShape.addEventListener('change', ()=>{
    syncImageFieldVisibility(addShape, addNodeImageField);
    syncAddLabelFieldForShape(addShape);
    setTextColorControls('addNodeLabel', addShape.value !== 'amalgam');
  });
  syncAddLabelFieldForShape(addShape);
}

