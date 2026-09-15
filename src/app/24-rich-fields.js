/* ---------------------------------------------------------------------
   Rich text fields.

   The label and language-tab boxes store their formatting as markup —
   **bold**, *italic*, [[base|ruby]] — and that's still exactly what gets
   saved. What changed is that you no longer type or read it: each of those
   boxes is now a contenteditable surface showing the formatting itself, so
   pressing Bold makes the selected words bold on the spot instead of
   dropping asterisks around them.

   The original <textarea> is kept, hidden, as the single source of truth:
   every keystroke in the editable surface writes markup back into it, so
   all the save/validate code goes on reading `.value` and never has to
   know any of this exists. Going the other way — loading a node into the
   form — goes through setRichValue().
   ------------------------------------------------------------------ */

function markupToRichHtml(markup){
  /* Parsed FIRST, broken into lines afterwards.
   *
   * It used to be the other way round: the stored markup was split on its
   * newlines and each line handed to the reader on its own. That is only
   * correct while no piece of formatting spans a break — and the moment
   * one does, which is what happens the instant you press Shift+Enter in
   * the middle of an underlined phrase, the first line holds an opening
   * `{{u:solid|` with no end and the second an end with no opening.
   * Neither parses, so both were printed as the literal characters: the
   * markup itself appearing in the words, in the editor and on the chart.
   *
   * The whole value is read once, which is the only way a wrapper spanning
   * a break can be understood at all, and the RUNS are then cut at their
   * newlines — each fragment keeping everything the run carried, so the
   * underline simply continues onto the next line. */
  const runs = tokenizeLabel(String(markup == null ? '' : markup), {media:true});
  const lines = [[]];
  runs.forEach(t=>{
    const text = (t.type === 'plain') ? (t.text || '') : null;
    if(text === null || text.indexOf('\n') < 0){ lines[lines.length-1].push(t); return; }
    text.split('\n').forEach((part, i)=>{
      if(i > 0) lines.push([]);
      if(part !== '') lines[lines.length-1].push(Object.assign({}, t, {text:part}));
    });
  });
  return lines.map(ls=> `<div>${ls.length ? runsToHtml(ls) : '<br>'}</div>`).join('');
}

// HTML -> markup. Walks the editable surface and re-emits the stored form.
// `state` tracks whether we're already inside bold/italic so nesting emits
// one wrapper rather than an unparseable pile of asterisks — the markup
// format has no notion of nested emphasis, so the outermost one wins.
function isBoldEl(el){
  if(el.tagName==='B' || el.tagName==='STRONG') return true;
  const w = el.style && el.style.fontWeight;
  return w === 'bold' || (parseInt(w,10) >= 600);
}
function isItalicEl(el){
  if(el.tagName==='I' || el.tagName==='EM') return true;
  return el.style && el.style.fontStyle === 'italic';
}
// Colour can arrive as an inline style or, from execCommand on some
// engines, as <font color>. Both normalize to a hex string.
function rgbToHex(v){
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if(!m) return null;
  return '#' + [1,2,3].map(i=> Number(m[i]).toString(16).padStart(2,'0')).join('');
}
/* Which of the chart's faces an element is set in, if any. The key is read
   from the data attribute the editor writes; falling back to matching the
   family string keeps text pasted from an older copy working. */
function fontKeyOfEl(el){
  const k = el.dataset && el.dataset.font;
  if(k && FONT_OPTIONS.some(f=> f.key === k)) return k;
  const fam = el.style && el.style.fontFamily;
  if(!fam) return null;
  const norm = fam.replace(/["']/g, '').toLowerCase();
  const hit = FONT_OPTIONS.find(f=> f.family.replace(/["']/g, '').toLowerCase() === norm);
  return hit ? hit.key : null;
}
/* The size a run is set at, in px, if it carries one of its own. Read from
   the data attribute the editor writes, falling back to the inline style so
   text pasted from elsewhere keeps its sizes. */
function sizeOfEl(el){
  const raw = (el.dataset && el.dataset.size) || (el.style && el.style.fontSize) || '';
  const v = parseFloat(raw);
  if(!Number.isFinite(v) || v < 6 || v > 40) return null;
  return Math.round(v * 10) / 10;
}
function colorOfEl(el){
  const raw = (el.style && el.style.color) || (el.tagName==='FONT' ? el.getAttribute('color') : '');
  if(!raw) return null;
  if(/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return rgbToHex(raw);
}
/* A rule under a run or through it, as the editor holds it. The style key
   is kept on a data attribute rather than read back out of the computed
   decoration, because a browser normalises those and `wavy` and `double`
   would come back as something else on the way round. */
function underOfEl(el){
  const k = el.getAttribute && el.getAttribute('data-under');
  return (k && LINE_STYLES[k]) ? k : null;
}
function strikeOfEl(el){
  const k = el.getAttribute && el.getAttribute('data-strike');
  return (k && LINE_STYLES[k]) ? k : null;
}
/* HTML -> markup.
 *
 * The writer keeps its open wrappers on a stack, and writes an opener
 * lazily: one is only committed once something real follows it, so a
 * wrapper the user left empty disappears instead of closing on nothing.
 *
 * A sticker and a citation are atomic — they are one token, never text to
 * be split — but they are not exempt from the run they sit in. A size
 * wrapper around one is the whole mechanism by which either of them is
 * enlarged, so the wrappers stay open across it. */
/* `opts.rubyHalf` says this text is going inside a reading, where a bare
   `|` divides the two halves and a bare `]` ends the unit. Those two
   characters are escaped in the TEXT rather than stripped out of the
   finished markup — stripping was the obvious thing and was wrong, because
   the finished markup contains structural `|`s of its own: an annotation
   written in red came back as `{{#c23b22anno}}`, the wrapper's own divider
   gone and the colour with it. */
/* A newline at the very END of a block is not content.
 *
 * The surface is set in pre-wrap, so a line break inside a block is a real
 * newline character rather than an element — and when the caret is at the
 * end of the block the browser writes TWO of them: one for the break and
 * one to stand where the caret now is, because a block's last newline is
 * not drawn. Read back literally, that second one became a blank line in
 * the value: press Shift+Enter once at the end of a label and everything
 * moved down two lines instead of one.
 *
 * The rule is general, not a patch on that one gesture: whatever ends a
 * block, the block boundary is what separates it from the next, so a
 * newline sitting immediately before that boundary says nothing. Taken
 * off a COPY, so the caret in the live surface is not disturbed. */
function withoutBlockTailNewlines(root){
  const copy = root.cloneNode(true);
  const blocks = [copy].concat([...copy.querySelectorAll('div,p')]);
  blocks.forEach(b=>{
    let node = b.lastChild;
    while(node && node.nodeType === 1 &&
          !/^(DIV|P)$/.test(node.tagName) && node.lastChild){
      node = node.lastChild;
    }
    if(node && node.nodeType === 3 && node.nodeValue.slice(-1) === '\n'){
      node.nodeValue = node.nodeValue.slice(0, -1);
    }
  });
  return copy;
}
function richHtmlToMarkup(root, opts){
  const rubyHalf = !!(opts && opts.rubyHalf);
  if(root && root.nodeType === 1 && !(opts && opts.raw)) root = withoutBlockTailNewlines(root);
  let out = '';
  const pending = [];   // opened, nothing written inside yet
  const active = [];    // opened and committed
  /* Closed, but the close not yet written.
   *
   * The editor gives every run its own wrappers, so a bold sentence is a
   * row of separate <b> elements — one per run — and writing each close
   * the moment it was reached produced `**Bold ****[[…]]**** tail**`.
   * Four asterisks in a row is not two closes and two opens to the
   * grammar; it is a run of four, and what came back was plain text with
   * the reading in it destroyed. A whole label could be wrecked by typing
   * one character into it.
   *
   * So a close waits. If the very next thing opened is the same wrapper,
   * with nothing written between, then it never closed at all and both
   * marks disappear — which is also what the reader means by one bold
   * phrase rather than three touching ones. */
  const closing = [];   // in the order the closes must be written

  function settle(){
    while(closing.length) out += closing.shift().close;
  }
  function flushPending(){
    /* A deferred close cancels against a matching re-open. The one that
       can cancel is the LAST close due — the outermost — because
       everything closed inside it has to be written first either way. */
    while(pending.length && closing.length){
      const open = pending[0], shut = closing[closing.length - 1];
      if(open.open !== shut.open || open.close !== shut.close) break;
      closing.pop();
      pending.shift();
      active.push(shut);
    }
    settle();
    while(pending.length){
      const f = pending.shift();
      out += f.open;
      active.push(f);
    }
  }
  function writeText(t){
    if(t === '') return;
    flushPending();
    out += t;
  }
  function pushFmt(open, close){ pending.push({open, close}); }
  function popFmt(){
    // Closing the innermost wrapper: if it never got any text, it simply
    // never existed.
    if(pending.length){ pending.pop(); return; }
    const f = active.pop();
    if(f) closing.push(f);
  }
  function writeAtomic(tok){
    /* A sticker or a citation now sits INSIDE the wrappers that are open
       around it, and has to: that `{{z:20|…}}` is the only way either of
       them is ever made bigger, and stepping out of it — which is what
       this did — was exactly why the size picker offered a change that
       never arrived on the chart.
       It was safe to step out only while the grammar was flat, when a
       wrapper's body stopped at the first `}` and `{{#c23b22|Word{{r:bw}}}}`
       fell through as literal text. Bodies are matched by brace depth now,
       so the nesting reads back the way it was written. */
    flushPending();
    out += tok;
  }

  function walk(node, state){
    node.childNodes.forEach(child=>{
      /* Typed text is DATA, so anything in it that the markup would read
         as a mark is escaped on the way out. Without this, typing an
         ordinary "2 * 3 = 6 and 4 * 5 = 20" stored those asterisks raw and
         the chart rendered the middle of the sentence in italics with both
         of them swallowed — formatting the reader never asked for, out of
         a sentence they simply typed. */
      if(child.nodeType === 3){
        let t = escapeMarkup(child.nodeValue);
        if(rubyHalf) t = t.replace(/([|\]])/g, '\\$1');
        writeText(t);
        return;
      }
      if(child.nodeType !== 1) return;
      const tag = child.tagName;
      if(tag === 'BR'){ writeText('\n'); return; }
      /* A sticker in the editor is an <img> carrying its key — or, when
         its picture has been removed from the library, a placeholder
         carrying the same key. Either way the key is what round-trips. */
      if(child.dataset && child.dataset.sticker){
        writeAtomic(`{{s:${child.dataset.sticker}}}`);
        return;
      }
      if(tag === 'IMG') return;         // any other picture is not ours
      /* A citation is one atomic chip carrying its key. Its visible text is
         the current number, which is exactly why the KEY round-trips —
         reading the "[3]" back would freeze a position that is only true
         until the list is reordered. */
      if(child.dataset && child.dataset.ref){
        writeAtomic(`{{r:${child.dataset.ref}}}`);
        return;
      }
      /* A figure — or the placeholder left where one used to be — is one
         atomic token carrying its key, exactly like a citation, plus the
         width it has been dragged to if it has been dragged to one. */
      if(child.dataset && child.dataset.media){
        const w = clampFigureWidth(child.dataset.w);
        writeAtomic(`{{m:${child.dataset.media}${w ? '@' + w : ''}}}`);
        return;
      }
      if(tag === 'RUBY'){
        /* Both halves are markup of their own, so both are serialised by
           the same writer that produced them — an annotation set in red
           over a plain word comes back as red over plain, rather than as
           two bare strings that lost whatever was done to them.
         *
           A reading is written as `[[base|annotation]]`, so neither half
           may hold a bare `|` or `]`: the scanner that finds the divider
           and the end stops at the first of either, and a base with a
           bracket in it came back as the literal characters
           `[[Ark]2|reading]]` printed on the chart, the reading gone. Both
           are ordinary editable text, so that is one keystroke away. */
        const rt = child.querySelector('rt');
        const holder = document.createElement('span');
        Array.from(child.childNodes).forEach(c=>{
          if(c.nodeType === 1 && c.tagName === 'RT') return;
          holder.appendChild(c.cloneNode(true));
        });
        const base = richHtmlToMarkup(holder, {rubyHalf:true}).trim();
        const anno = rt ? richHtmlToMarkup(rt, {rubyHalf:true}).trim() : '';
        if(base) writeText(anno ? `[[${base}|${anno}]]` : base);
        return;
      }
      if(tag === 'RT') return;               // handled by its <ruby>
      // Block-level children start a new line, except the very first one.
      const isBlock = (tag === 'DIV' || tag === 'P');
      if(isBlock && out !== '' && !out.endsWith('\n')) writeText('\n');
      const bold = !state.bold && isBoldEl(child);
      const italic = !state.italic && isItalicEl(child);
      const color = !state.color && colorOfEl(child);
      const font = !state.font && fontKeyOfEl(child);
      const size = !state.size && sizeOfEl(child);
      const under = !state.under && underOfEl(child);
      const strike = !state.strike && strikeOfEl(child);
      if(bold) pushFmt('**', '**');
      if(italic) pushFmt('*', '*');
      if(color) pushFmt(`{{${color}|`, '}}');
      if(font) pushFmt(`{{f:${font}|`, '}}');
      if(size) pushFmt(`{{z:${size}|`, '}}');
      if(under) pushFmt(`{{u:${under}|`, '}}');
      if(strike) pushFmt(`{{t:${strike}|`, '}}');
      walk(child, {bold: state.bold || bold, italic: state.italic || italic,
                   color: state.color || !!color, font: state.font || !!font,
                   size: state.size || !!size,
                   under: state.under || !!under, strike: state.strike || !!strike});
      if(strike) popFmt();
      if(under) popFmt();
      if(size) popFmt();
      if(font) popFmt();
      if(color) popFmt();
      if(italic) popFmt();
      if(bold) popFmt();
    });
  }
  walk(root, {bold:false, italic:false, color:false, font:false, size:false,
              under:false, strike:false});
  settle();
  // Anything still open never received text.
  for(let i = active.length - 1; i >= 0; i--) out += active[i].close;
  /* The browser's own bookkeeping blocks — the empty <div><br></div> a
     contenteditable starts life with, and whatever it leaves at the end —
     should not become blank lines in the saved value. */
  return out.replace(/^\n+/, '').replace(/\n+$/, '');
}

/* Typing inside a reading goes where the caret is.
 *
 * A reading is a `<ruby>` holding two pieces of text — the word and the
 * annotation over it — and a collapsed caret sitting at the very start of
 * either of them is a position contenteditable cannot tell apart from the
 * position just BEFORE that piece. Left to itself the browser resolves the
 * tie the wrong way every time: a character typed at the head of the word
 * landed in the text in front of the reading, taking whatever formatting
 * that text had rather than the reading's; a character typed at the head
 * of the annotation landed on the END of the word underneath it, so the
 * reading being annotated silently grew a letter and the annotation did
 * not change at all.
 *
 * The caret's own range says exactly which half it is in, so once the
 * caret is anywhere inside a reading the character is placed by hand and
 * the browser is not consulted. Everywhere else it behaves as it always
 * has — this only takes over where the ambiguity exists. */
function insertIntoReading(surface, data){
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  if(!r.collapsed) return false;
  let node = r.startContainer;
  const host = node.nodeType === 1 ? node : node.parentElement;
  if(!host || !host.closest) return false;
  const ruby = host.closest('ruby');
  if(!ruby || !surface.contains(ruby)) return false;
  let off = r.startOffset;
  if(node.nodeType !== 3){
    /* An empty half — an annotation nobody has written yet — has no text
       node for the character to go into, so it is given one. */
    const t = document.createTextNode('');
    node.insertBefore(t, node.childNodes[off] || null);
    node = t; off = 0;
  }
  node.insertData(off, data);
  const nr = document.createRange();
  nr.setStart(node, off + data.length);
  nr.collapse(true);
  sel.removeAllRanges(); sel.addRange(nr);
  return true;
}
const richFields = new Map();   // textarea id -> {textarea, surface}
/* What Enter does in a given rich field once its text has been settled and
   the field has let go of the keyboard. Blurring alone is enough for the
   fields that commit as you type; the ones with a button of their own name
   it here so Enter and the button are the same gesture. */
const richEnterActions = new Map();
function setRichEnter(id, fn){ richEnterActions.set(id, fn); }
function setRichValue(textarea, markup){
  textarea.value = markup;
  const rec = richFields.get(textarea.id);
  if(rec) rec.surface.innerHTML = markupToRichHtml(markup);
}
// Turns one textarea into a rich field. The textarea stays in the DOM
// (hidden) so nothing that reads or writes `.value` has to change.
function makeRichField(textarea){
  if(!textarea || richFields.has(textarea.id)) return;
  /* If a surface is already sitting beside this textarea, that is one this
     page was SAVED with — an exported copy, or any other route that
     captured the live DOM rather than the source. Building a second one
     leaves two editors stacked on the same field, and the toolbar acts on
     whichever it finds first, which is not the one being typed into. The
     existing surface is adopted instead; setRichValue below refills it. */
  const prev = textarea.previousElementSibling;
  if(prev && prev.classList && prev.classList.contains('rich-surface')) prev.remove();
  const surface = document.createElement('div');
  surface.className = 'rich-surface';
  surface.contentEditable = 'true';
  surface.spellcheck = false;
  surface.dataset.placeholder = textarea.getAttribute('placeholder') || '';
  // Match the box it replaces, so the two forms keep their proportions.
  if(textarea.rows) surface.style.minHeight = (textarea.rows * 20 + 14) + 'px';
  textarea.parentNode.insertBefore(surface, textarea);
  textarea.style.display = 'none';
  surface.addEventListener('input', ()=>{ textarea.value = richHtmlToMarkup(surface); });
  // See insertIntoReading: a character typed inside a reading is placed by
  // hand, because the browser puts it in the wrong half at either edge.
  surface.addEventListener('beforeinput', ev=>{
    if(ev.inputType !== 'insertText' || typeof ev.data !== 'string' || !ev.data) return;
    if(!insertIntoReading(surface, ev.data)) return;
    ev.preventDefault();
    textarea.value = richHtmlToMarkup(surface);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
  });
  /* Enter finishes; Shift+Enter is the line break.
   *
   * A text field on this chart is not a document being composed — it is a
   * label or a note being SET, and the reader almost always wants to look
   * at what they typed rather than keep typing. So Enter does what pressing
   * the field's own button does: it settles the text and hands the keyboard
   * back to the chart, which is also what makes the arrow keys, Delete and
   * every other shortcut work again without having to click away first.
   *
   * A break is still one keystroke away. Shift+Enter inserts a BREAK rather
   * than letting the browser start whatever block it fancies — contenteditable
   * answers a plain Enter with a <div> or a <p> depending on the browser, and
   * the markup reader then has to guess at line boundaries. */
  surface.addEventListener('keydown', ev=>{
    if(ev.key !== 'Enter' || ev.isComposing) return;
    ev.preventDefault();
    if(ev.shiftKey){ document.execCommand('insertLineBreak'); textarea.value = richHtmlToMarkup(surface); surface.dispatchEvent(new Event('input', {bubbles:true})); return; }
    // Whatever is in the surface reaches the textarea BEFORE the field is
    // asked to settle, so a field that settles from `.value` never loses
    // the last thing typed into it.
    textarea.value = richHtmlToMarkup(surface);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    const done = richEnterActions.get(textarea.id);
    surface.blur();
    if(done) done();
  });
  // and paste comes in as plain text so foreign markup can't leak in.
  surface.addEventListener('paste', ev=>{
    ev.preventDefault();
    const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  wireFigureHandles(surface, textarea);
  richFields.set(textarea.id, {textarea, surface});
  setRichValue(textarea, textarea.value);
}

