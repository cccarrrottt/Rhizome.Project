/* ---------------------------------------------------------------------
   The chart as a file.

   Export is what actually frees this page from any host: it writes the
   current chart back into a complete copy of the document and hands it to
   you as a download. That file is the whole thing — drawing, editor,
   contents — and opens with no server, no account and no runtime. Import
   is the way back in: point it at any Rhizome Project page and this one takes
   on that chart.

   Import reads only the four marked regions, and parses them with a JSON
   reader rather than by running them. A chart file is data someone may
   have sent you; it should not be able to run code just because you opened
   it here.
   ------------------------------------------------------------------ */
const filePopover = document.getElementById('filePopover');
const fileStatusEl = document.getElementById('fileStatus');
const fileImportInput = document.getElementById('fileImportInput');

function setFileStatus(kind, msg){
  fileStatusEl.className = 'editor-status show ' + kind;
  fileStatusEl.textContent = msg;
}
function clearFileStatus(){ fileStatusEl.className = 'editor-status'; fileStatusEl.textContent = ''; }

function chartFileName(){
  const stamp = new Date().toISOString().slice(0,10);
  return `rhizome-project-${stamp}.html`;
}

/* Handing the viewer a file takes two entirely different routes.
 *
 * Outside claude.ai the page is just a page: a blob URL on an <a download>
 * saves the file, no permission involved. Inside the artifact viewer that
 * link is inert — and inert SILENTLY, with no event to catch, which is the
 * worst possible failure for a Save-your-work button. The viewer mediates
 * file offers through the downloads capability instead, which asks the
 * person before anything is written.
 *
 * So: use the capability when it is there, the link when it is not, and
 * never report a save that may not have happened. */
const capDownloadsPromise = (async()=>{
  if(!HOSTED) return null;
  try{ return (await claude.use('downloads')) || null; }catch(e){ return null; }
})();

function saveViaLink(text, name){
  const url = URL.createObjectURL(new Blob([text], {type:'text/html'}));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 30000);
}

/* The chart's CONTENTS, without the page around them.
 *
 * A full export is the whole application — six hundred kilobytes of
 * drawing code wrapped around a few kilobytes of entries — which is the
 * right thing to keep, and the wrong thing to hand to somebody who is
 * going to rebuild the page anyway. This writes the seven data regions and
 * nothing else, carrying the same markers, so the build step reads it with
 * exactly the same code it reads a full export with.
 *
 * It is small enough to attach to a message, which is the point: it is how
 * work done in the browser gets back to whoever maintains the sources
 * without anyone having to move six hundred kilobytes around. */
function chartDataOnly(){
  const parts = writeChartParts();
  return [
    '/* Rhizome Project — chart contents only.',
    '   Not a page: the entries, connector styles, stickers, tags,',
    '   references and settings, in the form the page stores them.',
    '   Rebuild with:  python3 build.py --pull <this file>',
    '   Or open the chart and use Import, which reads this too. */',
    ''
  ].join('\n') + '\n' + REGION_NAMES.map(name=>
    `/* @@EDIT:${name}:START@@ */\n${parts[name]}\n/* @@EDIT:${name}:END@@ */`
  ).join('\n\n') + '\n';
}
async function exportChartData(){
  clearFileStatus();
  let out, name;
  try{
    out = chartDataOnly();
    name = chartFileName().replace(/\.html?$/i, '') + '-data.js';
  }catch(e){
    setFileStatus('err', 'Export failed: ' + (e && e.message ? e.message : 'unknown error'));
    return;
  }
  const dl = await capDownloadsPromise;
  if(!dl){
    saveViaLink(out, name);
    setFileStatus(HOSTED ? '' : 'ok', HOSTED
      ? 'This copy cannot hand you a file. Open the editable copy and export from there.'
      : 'Exported as ' + name + '.');
    return;
  }
  setFileStatus('', 'Waiting for you to confirm the download\u2026');
  try{
    await dl.save({filename:name, data:out});
    setFileStatus('ok', 'Exported as ' + name + '.');
  }catch(e){
    if(e && e.code === 'declined'){ setFileStatus('', 'Export cancelled.'); return; }
    saveViaLink(out, name);
    setFileStatus('ok', 'Exported as ' + name + '.');
  }
}

async function exportChart(){
  clearFileStatus();
  let out, name;
  try{
    out = ensureFullDocument(writeChart(await readOwnSource()));
    name = chartFileName();
  }catch(e){
    setFileStatus('err', 'Export failed: ' + (e && e.message ? e.message : 'unknown error'));
    return;
  }

  const dl = await capDownloadsPromise;
  if(!dl){
    /* No capability. Off claude.ai that is normal and the link simply works.
       On claude.ai it means this copy was published without the downloads
       capability — the read-only share copy is, deliberately, because
       declaring any capability at all is what stops a page being shared
       publicly. The link is then almost certainly inert, and saying
       "Exported" would be a lie. Try it anyway, since it costs nothing and
       may work, but describe it as an attempt. */
    saveViaLink(out, name);
    setFileStatus(HOSTED ? '' : 'ok', HOSTED
      ? 'This copy of the chart cannot hand you a file: it is published without download permission so that it stays publicly shareable. If no download appeared, open the editable copy and export from there.'
      : 'Exported as ' + name + '.');
    return;
  }

  setFileStatus('', 'Waiting for you to confirm the download\u2026');
  try{
    await dl.save({filename:name, data:out});
    setFileStatus('ok', 'Exported as ' + name + '.');
    return;
  }catch(e){
    const code = e && e.code;
    if(code === 'declined'){ setFileStatus('', 'Export cancelled.'); return; }
    if(code === 'rate_limited'){ setFileStatus('err', 'Another download prompt is still open \u2014 finish that one, then try again.'); return; }
    if(code === 'too_large'){ setFileStatus('err', 'This chart is too large for the viewer to hand over. Open it outside claude.ai and export there.'); return; }
    if(code !== 'rejected_extension' && code !== 'extension_not_enabled'){
      setFileStatus('err', 'Export failed: ' + ((e && e.message) || 'the viewer would not save the file') + '.');
      return;
    }
  }

  /* .html is not in every viewer's allowed set. The contents are what
     matter and they are unchanged, so offer the same bytes under .txt and
     say plainly that it needs renaming — a file the person has to rename
     beats no file at all. */
  const alt = name.replace(/\.html$/i, '') + '.html.txt';
  try{
    await capDownloadsPromise.then(d => d.save({filename:alt, data:out}));
    setFileStatus('ok', 'This viewer will not save .html files, so it saved ' + alt +
                        ' instead. Rename it to ' + name + ' and it will open as the chart.');
  }catch(e2){
    if(e2 && e2.code === 'declined'){ setFileStatus('', 'Export cancelled.'); return; }
    setFileStatus('err', 'This viewer would not save the file. Open the chart outside claude.ai and export there.');
  }
}

/* Pull the four regions out of another Rhizome Project page.

   The regions are JavaScript literals in the file, but they are read here
   as JSON — the two overlap for exactly the shapes this chart stores, and
   a JSON reader cannot execute anything. Anything that is not plain data
   is rejected instead of being run. */
function readRegionArray(src, name){
  const body = extractRegion(src, name);
  if(body === null) return null;
  const open = body.indexOf('[');
  const close = body.lastIndexOf(']');
  if(open === -1 || close < open) return null;
  const literal = jsLiteralToJson(body.slice(open, close+1));
  try{
    const val = JSON.parse(literal);
    return Array.isArray(val) ? val : null;
  }catch(e){ return null; }
}

/* The array literal this file writes, read back as JSON.
 *
 * This used to be four regular expressions run over the whole text, and
 * every one of them reached inside string contents it had no business
 * touching. `key:` -> `"key":` turned a label reading `Hello {{s:cat}}`
 * into `Hello {{"s":cat}}`, destroying the sticker; it quoted the `b:` in
 * an ordinary sentence like `Note: a, b: c`. The un-escaper knew `\'` and
 * `\\` but not `\n`, so every multi-line note came back with a visible
 * backslash-n in it. Import is the ONE path that does not need this page's
 * host to work, which makes silently rewriting the text it imports the
 * worst place in the file for a bug like this.
 *
 * So it is a scanner rather than a search-and-replace: it knows when it is
 * inside a string and when it is not, which is precisely the knowledge the
 * regular expressions lacked. It handles the subset this file emits —
 * strings, numbers, booleans, null, undefined, arrays, objects with bare
 * keys, comments and trailing commas — and nothing else, because nothing
 * else is ever written. */
function jsLiteralToJson(src){
  const isIdStart = c=> /[A-Za-z_$]/.test(c);
  const isIdPart  = c=> /[A-Za-z0-9_$]/.test(c);
  // Pieces, so the trailing-comma pass below can tell a comma in the
  // structure from one inside a string.
  const parts = [];                     // {s:string, str:boolean}
  let i = 0;
  const n = src.length;
  while(i < n){
    const ch = src[i];
    if(ch === "'" || ch === '"'){
      const quote = ch;
      let val = '';
      i++;
      while(i < n && src[i] !== quote){
        if(src[i] === '\\'){
          const e = src[i+1];
          i += 2;
          if(e === 'n') val += '\n';
          else if(e === 'r') val += '\r';
          else if(e === 't') val += '\t';
          else if(e === 'b') val += '\b';
          else if(e === 'f') val += '\f';
          else if(e === 'v') val += '\v';
          else if(e === '0') val += '\0';
          else if(e === 'u'){
            if(src[i] === '{'){
              const end = src.indexOf('}', i);
              val += String.fromCodePoint(parseInt(src.slice(i+1, end), 16) || 0);
              i = end + 1;
            } else { val += String.fromCharCode(parseInt(src.substr(i, 4), 16) || 0); i += 4; }
          }
          else if(e === 'x'){ val += String.fromCharCode(parseInt(src.substr(i, 2), 16) || 0); i += 2; }
          else if(e === '\n'){ /* a line continuation contributes nothing */ }
          else val += e;                 // \' \" \\ and anything else stands for itself
        } else { val += src[i]; i++; }
      }
      i++;                               // the closing quote
      parts.push({s: JSON.stringify(val), str: true});
      continue;
    }
    if(ch === '/' && src[i+1] === '/'){ while(i < n && src[i] !== '\n') i++; continue; }
    if(ch === '/' && src[i+1] === '*'){ const e = src.indexOf('*/', i+2); i = e < 0 ? n : e + 2; continue; }
    if(isIdStart(ch)){
      let j = i;
      while(j < n && isIdPart(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while(k < n && /\s/.test(src[k])) k++;
      if(src[k] === ':'){                // a bare object key, and only there
        parts.push({s: JSON.stringify(word) + ':', str: false});
        i = k + 1;
        continue;
      }
      // The tuple slots that read `undefined` mean "absent"; JSON says null.
      parts.push({s: (word === 'undefined') ? 'null' : word, str: false});
      i = j;
      continue;
    }
    parts.push({s: ch, str: false});
    i++;
  }
  /* Trailing commas, resolved on the pieces rather than on the text: a
     comma inside a string is part of somebody's sentence. */
  for(let a = 0; a < parts.length; a++){
    if(parts[a].str || parts[a].s.trim() !== ',') continue;
    for(let b = a + 1; b < parts.length; b++){
      if(parts[b].str) break;
      const t = parts[b].s.trim();
      if(t === '') continue;
      if(t === ']' || t === '}') parts[a].s = '';
      break;
    }
  }
  return parts.map(x=> x.s).join('');
}

// The same reader, for the one region that holds an object rather than a
// list. Wrapped in brackets so the scanner sees a value in a position it
// understands, then unwrapped.
function readRegionObject(src, name){
  const body = extractRegion(src, name);
  if(body === null) return null;
  const open = body.indexOf('{'), close = body.lastIndexOf('}');
  if(open === -1 || close < open) return null;
  try{
    const val = JSON.parse(jsLiteralToJson('[' + body.slice(open, close+1) + ']'));
    return (Array.isArray(val) && val[0] && typeof val[0] === 'object') ? val[0] : null;
  }catch(e){ return null; }
}
function importChartFromText(text){
  const nodesIn = readRegionArray(text, 'NODES');
  if(!nodesIn || !nodesIn.length){
    throw new Error('that file has no Rhizome Project chart in it.');
  }
  const stylesIn = readRegionArray(text, 'EDGESTYLES') || [];
  const stickersIn = sanitizeStickers(readRegionArray(text, 'STICKERS') || []);
  const mediaIn = sanitizeMedia(readRegionArray(text, 'MEDIA') || []);
  const commentsIn = readRegionArray(text, 'COMMENTS') || [];
  /* Older exports predate categories and simply have no such region. That
     is not a broken file — it is a chart with no categories — so it reads
     as an empty list rather than refusing the import. */
  const catsIn = sanitizeTagCats(readRegionArray(text, 'TAGCATS') || []);
  const refsIn = sanitizeRefs(readRegionArray(text, 'REFS') || []);
  /* And the chart's own settings, which import used to skip — so a chart
     brought in from a file quietly kept the OPEN chart's citation colour
     and lost its own. */
  const settingsIn = readRegionObject(text, 'SETTINGS');
  // Validate before replacing anything, so a bad file leaves the open
  // chart untouched rather than half-overwritten.
  validateNodes(nodesIn);
  applyEdit(()=>{
    workingNodes = nodesIn;
    refill(EDGE_STYLES, stylesIn);
    refill(STICKERS, stickersIn);
    refill(MEDIA, mediaIn);
    refill(COMMENTS, commentsIn);
    refill(TAG_CATS, catsIn);
    refill(REFS, refsIn);
    if(settingsIn && typeof settingsIn.refColor === 'string' &&
       /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(settingsIn.refColor)){
      SETTINGS.refColor = settingsIn.refColor;
    }
    rebuildStickerMap();
    rebuildMediaMap();
  });
  return nodesIn.length;
}

fileImportInput.addEventListener('change', ()=>{
  const file = fileImportInput.files && fileImportInput.files[0];
  fileImportInput.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onerror = ()=> setFileStatus('err', 'Could not read that file.');
  reader.onload = ()=>{
    try{
      /* A read-only viewer's applyEdit is a no-op, so the import silently
         did nothing while this line congratulated them on it. */
      if(readOnlyView){
        setFileStatus('err', 'This copy is read-only, so nothing was imported.');
        return;
      }
      const n = importChartFromText(String(reader.result));
      setFileStatus('ok', `Imported ${n} ${n === 1 ? 'entry' : 'entries'}. Press Save to keep it.`);
    }catch(e){
      setFileStatus('err', 'Import failed: ' + (e && e.message ? e.message : 'unknown error'));
    }
  };
  reader.readAsText(file);
});

/* Whether Export can deliver anything is knowable before the button is
   pressed, so it is settled before the button is offered. On the read-only
   share copy — published with no capabilities at all, so that it stays
   publicly shareable — nothing can hand the viewer a file, and a button
   that explains its own failure after the click is worse than a button
   that was never live. Resolved once, on first open of the panel. */
let exportGateDone = false;
async function gateExport(){
  if(exportGateDone) return;
  exportGateDone = true;
  if(!HOSTED) return;
  const btn = document.getElementById('fileExport');
  if(!btn) return;
  if(await capDownloadsPromise) return;
  btn.disabled = true;
  btn.title = 'This copy cannot hand you a file.';
  const note = document.getElementById('fileWhere');
  if(note) note.textContent = note.textContent +
    ' This copy cannot save a file to your computer \u2014 it is published without download permission so that it stays publicly shareable.';
}
function describeWhereItSaves(){
  const el = document.getElementById('fileWhere');
  if(!el) return;
  el.textContent = HOSTED
    ? 'Save publishes a new version of this page on claude.ai.'
    : (STORAGE_OK
        ? 'Save keeps this chart in this browser, for this file. Export to move it anywhere else.'
        : 'This browser will not let the page store anything, so Export is the only way to keep your work.');
}

document.getElementById('fileToggle').onclick = ()=>{
  const willOpen = !filePopover.classList.contains('open');
  closeToolbarMenus('filePopover');
  clearFileStatus();
  describeWhereItSaves();
  gateExport();
  const forget = document.getElementById('fileForget');
  forget.style.display = (!HOSTED && STORAGE_OK && readStoredChart()) ? '' : 'none';
  filePopover.classList.toggle('open', willOpen);
};
document.getElementById('fileClose').onclick = ()=> filePopover.classList.remove('open');
filePopover.addEventListener('click', ev=> ev.stopPropagation());
document.getElementById('fileExport').onclick = (ev)=>{ ev.stopPropagation(); exportChart(); };
document.getElementById('fileExportData').onclick = (ev)=>{ ev.stopPropagation(); exportChartData(); };
document.getElementById('fileImport').onclick = (ev)=>{ ev.stopPropagation(); fileImportInput.click(); };
document.getElementById('fileForget').onclick = (ev)=>{
  ev.stopPropagation();
  try{ localStorage.removeItem(STORE_KEY); }catch(e){}
  setFileStatus('ok', 'Forgotten. Reload to go back to what is in the file itself.');
};

/* ---------------------------------------------------------------------
   Who may edit.

   Write access is decided by the platform, not by this page: publishing
   runs with the viewer's own authority, and a viewer without write access
   is rejected with not_writer / not_granted no matter what the page does.
   So this is not a lock — it can't be picked, because there is nothing
   here to pick. It is the page telling the truth about a permission it
   does not control: once the platform has refused a write, every control
   that writes is hidden and the chart becomes a reader.

   There is no way to ask in advance without attempting a write (which
   would mint a version), so the first refusal is the signal — exactly
   what the capability's own guidance prescribes. The answer is then
   remembered per artifact, so a reader never sees editing controls again
   after their first visit. The owner is never refused and so never
   notices any of this.
   ------------------------------------------------------------------ */
/* Keyed per document. It used to be one flag for the whole origin, so
   being a reader of one chart could make every other chart on the same
   origin look read-only too. */
const READONLY_KEY = carryOverKey('axiomNexus.readOnly:' + (location.pathname || 'default'),
                                  'rhizome.readOnly:'  + (location.pathname || 'default'));
/* `sticky` is false for refusals that may not be about permission at all.
   The old code remembered EVERY refusal forever, so one transient failure
   — a consent prompt dismissed, a capability that failed to load — locked
   this browser out of editing permanently, with no way back. Only a plain
   "you are not a writer" is worth remembering. */
function markReadOnly(sticky){
  if(readOnlyView) return;
  readOnlyView = true;
  document.body.classList.add('read-only');
  if(sticky){ try{ localStorage.setItem(READONLY_KEY, '1'); }catch(e){} }
  setSaveState(null);
  // This can run during load (from the remembered answer below), before
  // the panels it tidies up have been declared — nothing is open that
  // early anyway, so each one is attempted separately and skipped if it
  // isn't there yet.
  try{ closeEditForm(); }catch(e){}
  try{ closeEdgePopover(); }catch(e){}
}
/* @@SHARE:READONLY@@ */
/* The line above is where build.py makes the share copy.
 *
 * That copy is published with no write capability at all, so it is a reader
 * by construction and can say so on the first frame instead of finding out
 * when somebody presses Save. The build says so by putting a call to
 * markReadOnly in at this point.
 *
 * It used to find the place by searching for `function isReadOnlyError(e){`
 * and inserting before it — which meant renaming a function, or moving it,
 * silently became a change to how the share copy is built. The build did
 * check that it found exactly one, so it would have stopped rather than
 * produced a wrong page; but it would have stopped for a reason with no
 * connection to what the person had actually done. A marker that exists FOR
 * the build cannot be broken by accident, because there is nothing else it
 * could be for. */
function isReadOnlyError(e){
  const code = e && e.code;
  return code === 'not_writer' || code === 'not_granted' ||
         code === 'not_declared' || code === 'consent_required';
}
// Only these two actually mean "this viewer may not write".
function isPermanentRefusal(e){
  const code = e && e.code;
  return code === 'not_writer' || code === 'not_granted';
}
/* Remembered read-only applies only where a host decides who may write.
   Off-platform there is no such authority — the page saves into this
   browser — so a flag left over from a hosted visit must not follow the
   file onto a disk and make it look frozen. */
if(HOSTED){
  try{ if(localStorage.getItem(READONLY_KEY) === '1') markReadOnly(true); }catch(e){}
}

// Comments panel.
/* ---------------------------------------------------------------------
   Suggestions.

   Every suggestion is signed with a name and labelled as a correction, an
   addition or a deletion, and the owner can relabel, resolve or remove any
   of them. They are stored with the chart and published by the same Save
   button as the drawing.

   One thing this panel cannot do, and says so plainly rather than
   pretending otherwise: a reader without edit access cannot post into the
   list. Writing to this page means publishing a new version of it, and the
   platform only lets its owner and editors do that — no arrangement of
   code here can change that, because the refusal happens on the server
   side of the publish, not in this page. So a read-only reader gets the
   next best thing: the same form, and a button that hands them their
   suggestion already signed and labelled, ready to paste into the comment
   thread the viewer keeps beside this page. The owner can then post it
   into the list with one paste of their own.
   ------------------------------------------------------------------ */
const SUGGESTIONS_ENABLED = false;
const commentsOverlay = document.getElementById('commentsOverlay');
const commentNick = document.getElementById('commentNick');
const commentKind = document.getElementById('commentStatus');
const commentText = document.getElementById('commentText');
const commentList = document.getElementById('commentList');
const commentMsgEl = document.getElementById('commentStatusMsg');
const COMMENT_KINDS = ['correction','addition','deletion'];
const COMMENT_NICK_KEY = carryOverKey('axiomNexus.nick', 'rhizome.nick');
let commentFilter = 'open';

function setCommentMsg(kind, msg){
  commentMsgEl.className = 'editor-status show ' + kind;
  commentMsgEl.textContent = msg;
}
function clearCommentMsg(){ commentMsgEl.className = 'editor-status'; commentMsgEl.textContent = ''; }

function applyCommentEdit(mutate){
  if(readOnlyView) return;
  pushUndo();
  mutate();
  renderComments();
  refreshSaveUI();
}

// A stable-enough id without a clock the page can rely on being unique.
function newCommentId(){
  let id, n = 0;
  const taken = new Set(COMMENTS.map(c=>c.id));
  do { id = 'c' + (Date.now().toString(36)) + (n ? '-' + n : ''); n++; } while(taken.has(id));
  return id;
}
function todayStamp(){
  const d = new Date();
  const p = v=> String(v).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function readComposer(){
  const nick = commentNick.value.trim();
  const text = commentText.value.trim();
  const kind = COMMENT_KINDS.includes(commentKind.value) ? commentKind.value : 'correction';
  if(!nick){ setCommentMsg('err', 'Sign it with a name first — the owner needs to know who a suggestion came from.'); return null; }
  if(!text){ setCommentMsg('err', 'Say what should change.'); return null; }
  try{ localStorage.setItem(COMMENT_NICK_KEY, nick); }catch(e){}
  return {nick, text, kind};
}

/* The same bargain as the rich fields: Enter posts, Shift+Enter breaks the
   line. A plain textarea answers Enter with a newline of its own, so the
   default has to be taken away before the button is pressed. */
commentText.addEventListener('keydown', ev=>{
  if(ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
  ev.preventDefault();
  const btn = document.getElementById('commentSubmit');
  commentText.blur();
  if(btn && !btn.disabled) btn.click();
});
document.getElementById('commentSubmit').onclick = ()=>{
  clearCommentMsg();
  const c = readComposer();
  if(!c) return;
  applyCommentEdit(()=>{
    COMMENTS.unshift({id:newCommentId(), nick:c.nick, kind:c.kind, at:todayStamp(), text:c.text});
  });
  commentText.value = '';
  commentFilter = 'open';
  paintCommentFilter();
  renderComments();
  setCommentMsg('ok', 'Added — press Save in the top bar to publish it with the chart.');
};

document.getElementById('commentCopy').onclick = async ()=>{
  clearCommentMsg();
  const c = readComposer();
  if(!c) return;
  const block = `[${c.kind.toUpperCase()}] ${c.nick}\n\n${c.text}`;
  try{
    await navigator.clipboard.writeText(block);
    setCommentMsg('ok', 'Copied. Paste it into the comment thread in the viewer around this page.');
  }catch(e){
    // Clipboard access can be refused inside the sandboxed frame; falling
    // back to selecting the text is better than a dead button.
    commentText.value = block;
    commentText.focus(); commentText.select();
    setCommentMsg('ok', 'Selected below — copy it and paste it into the comment thread in the viewer around this page.');
  }
};

function paintCommentFilter(){
  document.querySelectorAll('#commentFilter .editor-btn').forEach(b=>{
    b.classList.toggle('on', b.dataset.filter === commentFilter);
  });
}
document.querySelectorAll('#commentFilter .editor-btn').forEach(b=>{
  b.addEventListener('click', ()=>{ commentFilter = b.dataset.filter; paintCommentFilter(); renderComments(); });
});

function renderComments(){
  commentList.innerHTML = '';
  const shown = COMMENTS.filter(c=>
    commentFilter === 'all' ? true : commentFilter === 'done' ? !!c.done : !c.done);
  if(!shown.length){
    const p = document.createElement('div');
    p.className = 'comment-empty';
    p.textContent = commentFilter === 'done'
      ? 'Nothing resolved yet.'
      : COMMENTS.length ? 'Nothing open — everything here has been resolved.' : 'No suggestions yet.';
    commentList.appendChild(p);
    return;
  }
  shown.forEach(c=>{
    const item = document.createElement('div');
    item.className = 'comment-item k-' + (COMMENT_KINDS.includes(c.kind) ? c.kind : 'correction') + (c.done ? ' done' : '');

    const head = document.createElement('div');
    head.className = 'comment-head';
    const who = document.createElement('span');
    who.className = 'comment-who'; who.textContent = c.nick || 'anonymous';
    const kind = document.createElement('span');
    kind.className = 'comment-kind'; kind.textContent = c.kind || 'correction';
    const when = document.createElement('span');
    when.textContent = c.at || '';
    head.append(who, kind, when);
    if(c.done){
      const done = document.createElement('span');
      done.textContent = '· resolved';
      head.appendChild(done);
    }

    const body = document.createElement('div');
    body.className = 'comment-body';
    body.textContent = c.text || '';

    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const sel = document.createElement('select');
    COMMENT_KINDS.forEach(k=>{
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    });
    sel.value = COMMENT_KINDS.includes(c.kind) ? c.kind : 'correction';
    sel.title = 'Relabel this suggestion';
    sel.addEventListener('change', ()=>{
      applyCommentEdit(()=>{ const t = COMMENTS.find(x=>x.id===c.id); if(t) t.kind = sel.value; });
    });
    const resolve = document.createElement('button');
    resolve.type = 'button'; resolve.className = 'editor-btn';
    resolve.textContent = c.done ? 'Reopen' : 'Resolve';
    resolve.onclick = ()=>{
      applyCommentEdit(()=>{
        const t = COMMENTS.find(x=>x.id===c.id);
        if(t){ if(t.done) delete t.done; else t.done = true; }
      });
    };
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'editor-btn';
    del.textContent = 'Delete';
    del.onclick = ()=>{
      applyCommentEdit(()=>{
        const i = COMMENTS.findIndex(x=>x.id===c.id);
        if(i>=0) COMMENTS.splice(i,1);
      });
    };
    actions.append(sel, resolve, del);
    item.append(head, body, actions);
    commentList.appendChild(item);
  });
}

document.getElementById('commentsToggle').onclick = ()=>{
  if(!SUGGESTIONS_ENABLED) return;
  clearCommentMsg();
  try{
    const saved = localStorage.getItem(COMMENT_NICK_KEY);
    if(saved && !commentNick.value) commentNick.value = saved;
  }catch(e){}
  paintCommentFilter();
  renderComments();
  commentsOverlay.classList.add('open');
};
document.getElementById('commentsClose').onclick = ()=> commentsOverlay.classList.remove('open');
commentsOverlay.addEventListener('click', e=>{ if(e.target===commentsOverlay) commentsOverlay.classList.remove('open'); });

// The baseline everything is compared against: whatever the page was
// carrying when it loaded. Set once, and again after each successful save.
savedParts = snapshotParts();
refreshSaveUI();

// Leaving with unsaved work should ask first - everything lives in this
// tab until Save, so a stray refresh would otherwise take it all.
window.addEventListener('beforeunload', e=>{
  if(!isDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

