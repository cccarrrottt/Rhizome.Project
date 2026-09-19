/* ---------------------------------------------------------------------
   Placing and sizing a figure.

   A figure in a comment is a piece of the document, and a piece of a
   document is something you arrange. Both gestures are the ones this chart
   already uses everywhere else: pick the thing up and put it down, or pull
   its corner.

   Neither goes through the browser's own drag-and-drop. HTML5 dragging
   inside a contenteditable is a negotiation with the editor over what a
   drop means — it will happily leave the figure behind, duplicate it, or
   drop the alt text as a word — and none of that is visible until it has
   happened. Moving the element by hand is both predictable and short: a
   figure stands on its own line, so where it can go is a position between
   the lines, and that position is drawn as a rule while it is being
   carried rather than guessed at from a caret nobody can see.
   ------------------------------------------------------------------ */
const FIGURE_DRAG_SLOP = 4;      // px before a press becomes a carry
let figureDrag = null;
let figureSize = null;

/* The width of the column a figure stands in, in pixels: the surface's
   content box, since a percentage is measured against that and not against
   the border box the element reports. */
function surfaceColumnWidth(surface){
  const cs = getComputedStyle(surface);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  return Math.max(20, surface.clientWidth - pad);
}
/* Where a carried figure would land: between two of the surface's own
   lines, chosen by which half of which line the pointer is in. */
function figureDropSpot(surface, y){
  const kids = [...surface.children].filter(k=> k !== figureDrag.mark);
  for(const k of kids){
    const r = k.getBoundingClientRect();
    if(y < r.top + r.height/2) return {node:k, before:true};
    if(y <= r.bottom) return {node:k, before:false};
  }
  const last = kids[kids.length - 1];
  return last ? {node:last, before:false} : null;
}
function wireFigureHandles(surface, textarea){
  surface.addEventListener('mousedown', ev=>{
    if(ev.button !== 0 || surface.classList.contains('locked')) return;
    const grip = ev.target.closest && ev.target.closest('.fig-grip');
    const fig = ev.target.closest && ev.target.closest('.rich-figure');
    if(!fig || !surface.contains(fig)) return;
    if(grip){
      ev.preventDefault(); ev.stopPropagation();
      figureSize = {surface, textarea, fig,
                    column: surfaceColumnWidth(surface),
                    startX: ev.clientX,
                    startW: fig.getBoundingClientRect().width};
      fig.classList.add('sizing');
      return;
    }
    /* A video's own controls are inside the figure and are the reason the
       clip is there at all — pressing play must not pick the figure up. */
    if(ev.target.tagName === 'VIDEO') return;
    ev.preventDefault();
    figureDrag = {surface, textarea, fig, startX: ev.clientX, startY: ev.clientY,
                  moved: false, mark: null, spot: null};
  });
}
window.addEventListener('mousemove', ev=>{
  if(figureSize){
    const w = clampFigureWidth(
      (figureSize.startW + (ev.clientX - figureSize.startX)) / figureSize.column * 100);
    if(w){ figureSize.fig.dataset.w = w; figureSize.fig.style.width = w + '%'; }
    return;
  }
  if(!figureDrag) return;
  const st = figureDrag;
  if(!st.moved){
    if(Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < FIGURE_DRAG_SLOP) return;
    st.moved = true;
    st.fig.classList.add('dragging');
    document.body.classList.add('figure-dragging');
    st.mark = document.createElement('div');
    st.mark.className = 'rich-drop-mark';
    st.mark.contentEditable = 'false';
  }
  const spot = figureDropSpot(st.surface, ev.clientY);
  st.spot = spot;
  if(spot){
    if(spot.before) st.surface.insertBefore(st.mark, spot.node);
    else st.surface.insertBefore(st.mark, spot.node.nextSibling);
  }
}, true);
window.addEventListener('mouseup', ()=>{
  if(figureSize){
    const st = figureSize; figureSize = null;
    st.fig.classList.remove('sizing');
    st.textarea.value = richHtmlToMarkup(st.surface);
    st.surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  const st = figureDrag; figureDrag = null;
  if(!st) return;
  document.body.classList.remove('figure-dragging');
  st.fig.classList.remove('dragging');
  if(!st.moved || !st.mark || !st.mark.parentNode){
    if(st.mark && st.mark.parentNode) st.mark.remove();
    return;
  }
  /* The figure moves as its own line. It was inserted as one and it is put
     down as one, so carrying a picture out of the middle of a paragraph
     cannot leave half a sentence wrapped around where it used to be. */
  const line = document.createElement('div');
  const oldLine = st.fig.parentNode;
  line.appendChild(st.fig);
  st.mark.parentNode.insertBefore(line, st.mark);
  st.mark.remove();
  /* And the line it came out of goes if there is nothing left in it. */
  if(oldLine && oldLine !== st.surface && oldLine.parentNode === st.surface &&
     !oldLine.textContent.trim() && !oldLine.querySelector('img,video,.rich-figure')){
    oldLine.remove();
  }
  st.textarea.value = richHtmlToMarkup(st.surface);
  st.surface.dispatchEvent(new Event('input', {bubbles:true}));
}, true);

/* A reading is ONE thing, however many characters it covers.
 *
 * Formatting works on a range, and a range can end in the middle of a word
 * — including in the middle of the word a reading sits over. Colouring
 * `Upri` out of `[[Uprising|reading]]` made the browser split the <ruby>
 * in two so that each half could carry its own colour, and what came back
 * out was a reading over `Upri` followed by the loose letters `s` and
 * `ing`: the word came apart under a mark that is supposed to be attached
 * to the whole of it.
 *
 * So a range that starts or ends inside a reading is widened to take the
 * whole of it. The reading then takes the formatting as a unit, which is
 * also the only thing the markup can express. */
function widenOverRuby(surface, range){
  if(!range) return range;
  const halfOf = (node)=>{
    const e = node && (node.nodeType === 1 ? node : node.parentElement);
    if(!e || !e.closest) return null;
    const r = e.closest('ruby');
    if(!r || !surface.contains(r)) return null;
    return {ruby: r, anno: !!e.closest('rt')};
  };
  const h1 = halfOf(range.startContainer), h2 = halfOf(range.endContainer);
  if(!h1 && !h2) return range;
  /* A selection lying wholly within ONE half of one reading is left alone.
     Both halves are markup in their own right now, so formatting part of a
     base — or an annotation on its own, which is the whole point — is
     something the stored form can say. Only a selection that straddles the
     two, or runs out of the reading entirely, is widened: that is the case
     the browser answers by splitting the <ruby> in two, which came back
     out as a reading over the first half and loose letters after it. */
  if(h1 && h2 && h1.ruby === h2.ruby && h1.anno === h2.anno) return range;
  const a = h1 && h1.ruby, b = h2 && h2.ruby;
  const wide = range.cloneRange();
  if(a) wide.setStartBefore(a);
  if(b) wide.setEndAfter(b);
  const sel = window.getSelection && window.getSelection();
  if(sel){ sel.removeAllRanges(); sel.addRange(wide); }
  return wide;
}
// Applies a formatting command to whichever rich surface has focus.
function applyRichCommand(surface, kind, arg, restyle){
  surface.focus({preventScroll:true});
  // Ask for tags rather than inline styles, so what comes back out is
  // <b>/<i> and maps straight onto the stored markup.
  try{ document.execCommand('styleWithCSS', false, false); }catch(e){}
  /* Every command below reads the live selection for itself, so widening
     it here reaches all of them — bold and italic included, which go
     through execCommand and would otherwise split a reading just as
     colouring did. */
  {
    const sel0 = window.getSelection && window.getSelection();
    if(sel0 && sel0.rangeCount){
      const r0 = sel0.getRangeAt(0);
      if(!r0.collapsed && surface.contains(r0.commonAncestorContainer)) widenOverRuby(surface, r0);
    }
  }
  if(kind === 'bold'){ document.execCommand('bold'); return; }
  if(kind === 'italic'){ document.execCommand('italic'); return; }
  /* Taking a colour OFF. There is no execCommand for "inherit", so the
     colour is stripped from the elements the selection actually covers.
     Without this a coloured run was permanent: an amalgam paints its label
     from its own border gradient, and a run given a flat colour could
     never be handed back to it. */
  /* Size, exactly as face: strip whatever the selection already carries,
     then wrap it in the new one. Kept separate from the face branch only
     because the two are independent — a run can be set in one face at one
     size, and changing either must leave the other alone. */
  if(kind === 'size' || kind === 'unsize'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed || !surface.contains(range.commonAncestorContainer)) return;
    const frag = range.extractContents();
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const elx = child;
        if(!sizeOfEl(elx)) return;
        if(elx.dataset) delete elx.dataset.size;
        if(elx.style) elx.style.removeProperty('font-size');
        const bare = elx.tagName === 'SPAN' &&
          (!elx.getAttribute('style') || !elx.getAttribute('style').trim()) &&
          !elx.getAttribute('data-font') && !elx.getAttribute('data-size');
        if(bare){
          while(elx.firstChild) node.insertBefore(elx.firstChild, elx);
          node.removeChild(elx);
        }
      });
    };
    strip(frag);
    if(kind === 'size'){
      const px = Math.round(parseFloat(arg) * 10) / 10;
      if(!Number.isFinite(px) || px < 6 || px > 40){ range.insertNode(frag); return; }
      const wrap = document.createElement('span');
      wrap.style.fontSize = px + 'px';
      wrap.dataset.size = String(px);
      wrap.appendChild(frag);
      range.insertNode(wrap);
    } else {
      range.insertNode(frag);
    }
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  /* A rule under the words or through them.
   *
   * Toggling, not stacking: pressing it again on a run that already has
   * one takes it off. A citation is stepped around — it is a chip
   * pointing at a reference, and a line drawn across a number reads as a
   * number that has been struck out. `restyle` re-applies the kind of
   * line without toggling, which is what the style picker beside the
   * buttons does. */
  if(kind === 'under' || kind === 'strike'){
    const attr = kind === 'under' ? 'data-under' : 'data-strike';
    const line = kind === 'under' ? 'underline' : 'line-through';
    const other = kind === 'under' ? 'data-strike' : 'data-under';
    const otherLine = kind === 'under' ? 'line-through' : 'underline';
    const style = LINE_STYLES[arg] ? arg : 'solid';
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed || !surface.contains(range.commonAncestorContainer)) return;
    const had = !restyle && !!lineStateOf(surface)[kind === 'under' ? 'under' : 'strike'];
    const frag = range.extractContents();
    // Strip whatever this kind of rule the selection already carries.
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        if(!child.getAttribute || !child.getAttribute(attr)) return;
        child.removeAttribute(attr);
        const keeps = child.getAttribute(other);
        child.style.textDecorationLine = keeps ? otherLine : '';
        if(keeps) child.style.textDecorationStyle = (LINE_STYLES[keeps] || LINE_STYLES.solid).css;
        const bare = child.tagName === 'SPAN' && !keeps &&
          (!child.getAttribute('style') || !child.getAttribute('style').trim()) &&
          !child.getAttribute('data-font') && !child.getAttribute('data-size') &&
          !child.getAttribute('data-ref') && !child.getAttribute('data-sticker');
        if(bare){
          while(child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        }
      });
    };
    strip(frag);
    if(had){
      range.insertNode(frag);
    } else {
      /* One wrapper around the whole selection.
       *
       * A citation inside it is exempt without being stepped around: a
       * rule is a text decoration, and a decoration is not propagated into
       * an atomic inline-level box — which is what `.ref-chip` is made,
       * for exactly this reason. That holds at any depth, which a pass
       * over the fragment's top-level children did not: a citation sitting
       * inside a bold run within the selection was wrapped like ordinary
       * text and drawn through. The chart applies the same exemption from
       * the other side, since a citation is laid out as its own tspan and
       * never takes the run's styling. */
      const wrap = document.createElement('span');
      wrap.style.textDecorationLine = line;
      wrap.style.textDecorationStyle = (LINE_STYLES[style] || LINE_STYLES.solid).css;
      wrap.setAttribute(attr, style);
      wrap.appendChild(frag);
      range.insertNode(wrap);
    }
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'font' || kind === 'unfont'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    // Strip any face already on the selection, then wrap it in the new one.
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const el = child;
        if(!fontKeyOfEl(el)) return;
        if(el.dataset) delete el.dataset.font;
        if(el.style) el.style.removeProperty('font-family');
        const bare = el.tagName === 'SPAN' &&
          (!el.getAttribute('style') || !el.getAttribute('style').trim()) &&
          !el.getAttribute('data-font');
        if(bare){
          while(el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
        }
      });
    };
    strip(frag);
    if(kind === 'font'){
      const wrap = document.createElement('span');
      wrap.style.fontFamily = fontFamilyFor(arg);
      wrap.dataset.font = arg;
      wrap.appendChild(frag);
      range.insertNode(wrap);
    } else {
      range.insertNode(frag);
    }
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  /* Bold, italic and readings off. execCommand can turn bold and italic
     off only by toggling, which turns them ON where they were absent — so
     the tags are unwrapped by hand, exactly as the colour is. A reading
     collapses to the word it was over; the reading itself is an
     annotation, and there is nowhere for it to go. */
  if(kind === 'unstyle'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(range.collapsed || !surface.contains(range.commonAncestorContainer)) return;
    const frag = range.extractContents();
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const t = child.tagName;
        if(t === 'RUBY'){
          /* A reading is CONTENT, not formatting: the annotation is
             something the author wrote, and clearing the formatting is not
             a licence to delete it. This used to collapse the whole thing
             to its base word, so pressing ⟲ silently threw the reading
             away. What comes off is the formatting inside it, which the
             recursion above has already done. */
          child.removeAttribute('style');
          return;
        }
        if(t === 'RT'){ child.removeAttribute('style'); return; }
        if(t === 'B' || t === 'STRONG' || t === 'I' || t === 'EM' || t === 'U'){
          while(child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        if(t === 'SPAN' && child.style){
          child.style.removeProperty('font-weight');
          child.style.removeProperty('font-style');
          child.style.removeProperty('text-decoration-line');
          child.style.removeProperty('text-decoration-style');
          child.style.removeProperty('text-decoration-color');
          child.removeAttribute('data-under');
          child.removeAttribute('data-strike');
          const bare = (!child.getAttribute('style') || !child.getAttribute('style').trim()) &&
            !child.getAttribute('data-font') && !child.getAttribute('data-size') &&
            !child.getAttribute('data-sticker') && !child.getAttribute('data-ref');
          if(bare){
            while(child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          }
        }
      });
    };
    strip(frag);
    range.insertNode(frag);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'uncolor'){
    const sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // Re-emit the selected content with every colour carrier unwrapped.
    const frag = range.extractContents();
    const strip = (node)=>{
      Array.from(node.childNodes).forEach(child=>{
        if(child.nodeType !== 1) return;
        strip(child);
        const el = child;
        const carriesColor = (el.style && el.style.color) || el.tagName === 'FONT';
        if(!carriesColor) return;
        if(el.style) el.style.removeProperty('color');
        if(el.tagName === 'FONT') el.removeAttribute('color');
        /* A span that existed only to carry the colour is now noise — but
           a citation IS a span that carries a colour, its own, and
           unwrapping it left the number it happens to display standing in
           the text as three ordinary characters pointing at nothing. A
           sticker's placeholder is the same shape. Neither is a wrapper. */
        const atomic = el.getAttribute &&
          (el.getAttribute('data-ref') || el.getAttribute('data-sticker'));
        const bare = !atomic && (el.tagName === 'FONT' ||
          (el.tagName === 'SPAN' && (!el.getAttribute('style') || !el.getAttribute('style').trim())));
        if(bare){
          while(el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
        }
      });
    };
    strip(frag);
    range.insertNode(frag);
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'color'){
    const hex = arg;
    if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex || '')) return;
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if(!surface.contains(range.commonAncestorContainer)) return;
    // Wrapped by hand rather than via execCommand('foreColor'), which
    // emits <font> on some engines and CSS spans on others; one span with
    // an inline color maps cleanly onto the {{#hex|…}} markup either way.
    const span = document.createElement('span');
    span.style.color = hex;
    try{
      range.surroundContents(span);
    }catch(e){
      // surroundContents refuses a selection that only partly covers an
      // element; extracting and re-inserting handles that case.
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    const pick = document.createRange();
    pick.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(pick);
    /* The surface has to be TOLD it changed. Bold and italic go through
       execCommand, which fires `input` itself; a span wrapped by hand does
       not, and every commit on this page hangs off that event. So the
       colour appeared in the box, was never written to the entry, never
       reached the chart, and was gone the next time the form was opened —
       from the outside, a colour button that did nothing. */
    surface.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  if(kind === 'ruby'){
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if(!surface.contains(range.commonAncestorContainer)) return;

    // Ruby cannot nest: the stored markup has no grammar for a reading
    // inside a reading ([[a|[[b|c]]]] is not parseable), and the browser
    // would happily build one. Two ways to end up nested, both refused:
    // the caret already sitting inside a ruby, or a selection that spans
    // one. When the caret is already in a ruby the useful thing to do is
    // put it on that ruby's own annotation, which is almost certainly
    // what was meant.
    let anchor = range.commonAncestorContainer;
    if(anchor.nodeType === 3) anchor = anchor.parentNode;
    const enclosing = anchor && anchor.closest ? anchor.closest('ruby') : null;
    if(enclosing){
      const rt = enclosing.querySelector('rt');
      if(rt){
        const pick = document.createRange();
        pick.selectNodeContents(rt);
        sel.removeAllRanges();
        sel.addRange(pick);
      }
      return;
    }
    const contents = range.cloneContents();
    if(contents.querySelector && contents.querySelector('ruby')) return;

    /* A reading is text ABOVE text, and a sticker or a citation is not
       text: `range.toString()` returns nothing for them, so putting a
       reading over a selection containing one silently deleted it. Rather
       than destroy them, the command declines — turning a reading off for
       exactly the things it cannot be applied to. */
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    if(holder.querySelector('[data-sticker], [data-ref]')) return;
    /* The word keeps everything it was wearing.
     *
       This used to take `range.toString()` — the selection's bare
       characters — and put THAT under the reading, so putting a reading
       over a word that was bold, coloured, underlined or struck through
       silently returned it to plain text; over a whole label, the whole
       label. And it stripped every `]` and `|` out of the base as it went,
       on the grounds that those two characters separate a reading's halves
       in the stored form — which was true before both halves learned to
       escape them, and has since meant that `asdasd[1]` came back as
       `asdasd[1`, a character short.
     *
       The selected content is moved into the reading exactly as it stands.
       A selection spanning a line break is the one thing that cannot be:
       a reading is one unit on one line, and a fragment carrying a block
       would build a `<ruby>` around a `<div>`. That falls back to the
       words alone. */
    const frag = range.extractContents();
    const ruby = document.createElement('ruby');
    const probe = document.createElement('div');
    probe.appendChild(frag.cloneNode(true));
    if(probe.querySelector('div, p, br')){
      ruby.appendChild(document.createTextNode(probe.textContent || 'word'));
    } else {
      ruby.appendChild(frag);
      if(!ruby.textContent) ruby.appendChild(document.createTextNode('word'));
    }
    const rt = document.createElement('rt');
    rt.textContent = 'reading';
    ruby.appendChild(rt);
    range.insertNode(ruby);
    // Leave the annotation selected so it can be typed over immediately.
    const pick = document.createRange();
    pick.selectNodeContents(rt);
    sel.removeAllRanges();
    sel.addRange(pick);
    // Same as the colour: inserted by hand, so the commit has to be told.
    surface.dispatchEvent(new Event('input', {bubbles:true}));
  }
}

/* There used to be a toolbar here that addressed a LIST rather than one
   field — the language rows — and worked on whichever row had last been
   touched. It is gone with the rows' toolbar itself: every toolbar on the
   page now names the one surface it acts on, which is the only arrangement
   in which a reader can tell what a button is about to change. */
// The A button takes its colour from the hex box beside it in the same
// toolbar, so each toolbar carries its own current colour.
function toolbarHex(btn){
  const bar = btn.closest('.mini-toolbar');
  const box = bar && bar.querySelector('.tb-hex');
  return box ? box.value.trim() : null;
}
document.querySelectorAll('.mini-toolbar button').forEach(btn=>{
  btn.addEventListener('mousedown', ev=> ev.preventDefault());  // keep the selection alive
  btn.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    /* Named, always. The fallback was the drawer's Label box — the only
       other field an entry's words could be typed into — and with that box
       gone a toolbar button with no target is a bug, not a default. */
    const targetId = btn.dataset.wrapTarget;
    if(!targetId) return;
    const kind = btn.dataset.wrap;
    const arg = kind === 'color' ? toolbarHex(btn) : undefined;
    const rec = richFields.get(targetId);
    if(!rec) return;
    applyRichCommand(rec.surface, kind, arg);
    rec.textarea.value = richHtmlToMarkup(rec.surface);
    // Bold, colour and the rest show up on the entry as you apply them,
    // the same as typing does.
    if(targetId === 'nodeEditorText') queueLabelPreview();
  });
});
/* A live row of swatches under a comma-separated colour field, so the
   border colours can be seen rather than only read as hex. */
function wireSwatchStrip(inputId, stripId){
  const input = document.getElementById(inputId);
  const strip = document.getElementById(stripId);
  if(!input || !strip) return;
  const paint = ()=>{
    strip.innerHTML = '';
    const parts = input.value.split(',').map(s=>s.trim()).filter(Boolean);
    if(!parts.length){
      /* An empty field draws an empty swatch rather than the word
         "default". The strip is a row of colour squares, and a word in
         that row reads as a different kind of thing; a blank square says
         "no colour here" in the strip's own language — and it keeps the
         row the same height whether or not a colour is set. */
      const blank = document.createElement('span');
      blank.className = 'swatch-chip swatch-blank';
      blank.title = 'No colour set — the default is used';
      strip.appendChild(blank);
      return;
    }
    parts.forEach(c=>{
      const chip = document.createElement('span');
      chip.className = 'swatch-chip';
      const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);
      chip.style.background = ok ? c : 'transparent';
      chip.title = ok ? c : c + ' — not a valid hex color';
      if(!ok) chip.style.borderColor = 'var(--accent)';
      strip.appendChild(chip);
    });
  };
  input.addEventListener('input', paint);
  paint();
  return paint;
}
const paintEditSwatches = wireSwatchStrip('editColorsInput', 'editColorsSwatches');
const paintEditBgSwatches = wireSwatchStrip('editBgInput', 'editBgSwatches');
/* The background field, which behaves the OTHER way round from the border
   one: an entry with no background is a perfectly ordinary entry — it is
   drawn on the paper — so an empty box means exactly that and stays empty.
   The reset button empties it. */
{
  const field = document.getElementById('editBgInput');
  const reset = document.getElementById('editBgReset');
  if(field && reset){
    const sync = ()=>{
      reset.disabled = !field.value.trim();
      reset.title = reset.disabled ? 'This entry is already on the paper'
                                   : 'Back to the paper';
    };
    reset.addEventListener('click', ev=>{
      ev.stopPropagation();
      if(!field.value.trim()) return;
      field.value = '';
      if(paintEditBgSwatches) paintEditBgSwatches();
      field.dispatchEvent(new Event('input', {bubbles:true}));
      flushNodeEditCommit();
      sync();
    });
    field.addEventListener('input', sync);
    window.syncBgResetState = sync;
  }
}
/* Emptying the field puts the default straight back.
 *
 * Now that the box always shows a real colour, an empty box is not a
 * state the entry can be in — there is no such thing as an entry with no
 * border colour. Clearing it therefore means "give me the default back",
 * and the quickest way to say that is to show it immediately rather than
 * leave an empty box that silently resolves to something on commit.
 *
 * It waits for the field to lose focus or for a moment's pause, so that
 * selecting-all and typing a replacement is not fought halfway through:
 * the box is briefly empty during that gesture, and refilling it on the
 * keystroke would eat what the user was typing. */
{
  const field = document.getElementById('editColorsInput');
  let restoreTimer = null;
  const restoreIfEmpty = ()=>{
    if(field.value.trim() !== '') return;
    const n = selectedId && nodes.get(selectedId);
    field.value = (n && n.color) || DEFAULT_NODE_COLOR;
    if(paintEditSwatches) paintEditSwatches();
    field.dispatchEvent(new Event('input', {bubbles:true}));
  };
  field.addEventListener('input', ()=>{
    clearTimeout(restoreTimer);
    if(field.value.trim() === '') restoreTimer = setTimeout(restoreIfEmpty, 700);
  });
  field.addEventListener('blur', ()=>{ clearTimeout(restoreTimer); restoreIfEmpty(); });
}
const paintAddSwatches = wireSwatchStrip('addNodeColors', 'addNodeColorsSwatches');

// The hex boxes keep a live swatch of what the A button will apply, and
// must not steal focus from the text being coloured.
/* Black, like every other "no colour set yet" field on the chart. The old
   default was the accent, which meant the box always suggested a change. */
const DEFAULT_TEXT_COLOR = '#20242b';
document.querySelectorAll('.tb-hex').forEach(box=>{
  const paint = ()=>{
    const v = box.value.trim();
    const ok = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
    box.classList.toggle('bad', !ok);
    // Empty draws an empty swatch, the same as an unset border colour does,
    // rather than a stale colour that no longer describes the field.
    box.style.setProperty('--swatch', ok ? v : 'transparent');
  };
  /* Same rules as the border-colour field: the box always shows a real
     colour, and emptying it means "give me the default back" rather than
     leaving a blank that silently resolves to something on use. The pause
     is so that select-all-then-retype is not fought halfway through — the
     box is briefly empty during that gesture. */
  let restoreTimer = null;
  const restoreIfEmpty = ()=>{
    if(box.value.trim() !== '') return;
    box.value = DEFAULT_TEXT_COLOR;
    paint();
  };
  box.addEventListener('input', ()=>{
    paint();
    clearTimeout(restoreTimer);
    if(box.value.trim() === '') restoreTimer = setTimeout(restoreIfEmpty, 700);
  });
  box.addEventListener('blur', ()=>{ clearTimeout(restoreTimer); restoreIfEmpty();
    /* The wash goes with the trip. Leaving it painted after the caret has
       gone somewhere else entirely would be a highlight over words nothing
       is about to happen to. */
    if(typeof paintHeldSelection === 'function') paintHeldSelection(null); });
  box.addEventListener('click', ev=> ev.stopPropagation());

  /* Pressing the swatch is what applies the colour — the separate "A"
     button beside it is gone. The swatch is the leftmost 18px of the box;
     anywhere else is the text field, so a value can still be typed. */
  box.addEventListener('mousedown', ev=>{
    const onSwatch = (ev.clientX - box.getBoundingClientRect().left) < 18;
    if(!onSwatch) return;               // let the caret land in the text
    /* Not preventing the default here would move focus into this box and
       collapse the selection in the text being coloured — which is the
       whole thing the colour is meant to apply to. */
    ev.preventDefault();
    ev.stopPropagation();
    applyHexFromBox(box, box.value.trim());
  });
  /* Focusing the hex box must not throw away the selection either: a value
     is often typed AFTER choosing the words it is for. The surface's own
     selection is remembered on the way in and restored on the way out. */
  box.addEventListener('focus', ()=> rememberSurfaceSelection(box));
  if(!box.value.trim()) box.value = DEFAULT_TEXT_COLOR;
  paint();
});

/* The words a toolbar was last pointed at, so a trip to the hex box and
   back does not lose them. */
const heldSelection = new Map();
function surfaceForHexBox(box){
  const bar = box.closest('.mini-toolbar');
  return bar ? surfaceForToolbar(bar) : null;
}
/* The remembered words go on LOOKING chosen.
 *
 * A document has one selection, so moving the caret into the hex box takes
 * it away from the text being coloured: the range was remembered and put
 * back on use, and it worked — but the highlight vanished the instant the
 * box was clicked, so the reader was typing a colour with no sign of what
 * it was for, and the natural response was to go back and select the words
 * again, which is the round trip the memory exists to avoid. A custom
 * highlight paints the same range in the same wash without owning the
 * selection, so the words stay visibly chosen while the value is typed. */
const heldHighlight = (()=>{
  try{
    if(typeof Highlight !== 'function' || !window.CSS || !CSS.highlights) return null;
    const h = new Highlight();
    CSS.highlights.set('held-selection', h);
    return h;
  }catch(e){ return null; }
})();
function paintHeldSelection(range){
  if(!heldHighlight) return;
  try{
    heldHighlight.clear();
    if(range) heldHighlight.add(range);
  }catch(e){}
}
/* The last run of words picked out in ANY editing surface.
 *
 * Reading the live selection when the hex box takes focus is not reliable:
 * a real click leaves it in place long enough to be read, and moving focus
 * by script clears it first — so the same gesture worked or did not
 * depending on how focus arrived. The selection is watched instead and the
 * last non-empty one kept, which is true whichever way the caret leaves. */
let lastSurfaceRange = null;   // {surface, range}
document.addEventListener('selectionchange', ()=>{
  const sel = window.getSelection && window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if(r.collapsed) return;
  const c = r.commonAncestorContainer;
  const host = c && c.nodeType === 1 ? c : (c && c.parentNode);
  const surface = host && host.closest ? host.closest('.rich-surface') : null;
  if(surface) lastSurfaceRange = {surface, range: r.cloneRange()};
});
function rememberSurfaceSelection(box){
  const surface = surfaceForHexBox(box);
  if(!surface) return;
  let held = null;
  const sel = window.getSelection && window.getSelection();
  if(sel && sel.rangeCount){
    const r = sel.getRangeAt(0);
    if(!r.collapsed && surface.contains(r.commonAncestorContainer)) held = r.cloneRange();
  }
  if(!held && lastSurfaceRange && lastSurfaceRange.surface === surface){
    held = lastSurfaceRange.range;
  }
  if(!held) return;
  heldSelection.set(box, held);
  paintHeldSelection(held);
}
function restoreSurfaceSelection(box){
  const surface = surfaceForHexBox(box);
  if(!surface) return surface;
  /* A LIVE selection in the surface always wins over the remembered one.
     The remembered range is there for the case where focus went into the
     hex box to type a value; once the reader has gone back and picked
     different words, it is stale — and restoring it put the colour on the
     first run again and dragged the visible selection back there with it,
     which is exactly what a second colour on a second phrase looked like. */
  const sel = window.getSelection && window.getSelection();
  if(sel && sel.rangeCount){
    const live = sel.getRangeAt(0);
    if(!live.collapsed && surface.contains(live.commonAncestorContainer)){
      heldSelection.delete(box);
      paintHeldSelection(null);
      return surface;
    }
  }
  const held = heldSelection.get(box);
  if(!held){ paintHeldSelection(null); return surface; }
  paintHeldSelection(null);
  surface.focus({preventScroll:true});
  const s2 = window.getSelection();
  s2.removeAllRanges();
  s2.addRange(held);
  return surface;
}
function applyHexFromBox(box, hex){
  const surface = restoreSurfaceSelection(box) || surfaceForHexBox(box);
  if(!surface) return;
  applyRichCommand(surface, 'color', hex);
}
/* The reset control, which clears the WHOLE text rather than a selection.
 *
 * An entry paints its label in its own border colour, and a run given a
 * colour of its own overrides that. Getting back is the point of this
 * button — and getting back part-way is not a state anyone asked for: if
 * you want the entry's colour again you want it everywhere, and hunting
 * down three separately coloured runs to select each of them in turn was
 * the only way to do it. It selects everything itself and strips the lot,
 * so one press returns the text to inheriting the border. */
document.querySelectorAll('[data-hex-reset]').forEach(btn=>{
  btn.addEventListener('mousedown', ev=> ev.preventDefault());
  btn.addEventListener('click', ev=>{
    ev.stopPropagation();
    /* Two kinds of toolbar carry this button now.
     *
     * On a field that offers a colour it sits beside the hex box and
     * strips the colour along with everything else. On a connector's note
     * and on a callout there IS no colour control — those are written in
     * the connector's own ink, decided by the line and not by the reader —
     * and the button was taken away with the box it stood next to, which
     * removed the only way to undo a face, a size or a bold as well. It
     * stands on its own there and clears everything the reader CAN set,
     * leaving the inherited colour exactly where it is. */
    const box = btn.parentNode.querySelector('.tb-hex');
    const surface = box ? surfaceForHexBox(box)
                        : surfaceForToolbar(btn.closest('.mini-toolbar'));
    if(!surface) return;
    if(box) heldSelection.delete(box);
    if(typeof paintHeldSelection === 'function') paintHeldSelection(null);
    surface.focus({preventScroll:true});
    const all = document.createRange();
    all.selectNodeContents(surface);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(all);
    /* Everything, not only the colour. The button reads as "put this text
       back the way it was", and leaving a face, a size, a bold and a
       reading behind while removing the colour is not that — it is one
       quarter of it, and the reader is left hunting the other three. */
    if(box) applyRichCommand(surface, 'uncolor');
    applyRichCommand(surface, 'unfont');
    applyRichCommand(surface, 'unsize');
    applyRichCommand(surface, 'unstyle');
    if(box){
      box.value = DEFAULT_TEXT_COLOR;
      box.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      // No box to fire the commit for us, so the field says so itself.
      surface.dispatchEvent(new Event('input', {bubbles:true}));
    }
  });
});

['detailNoteInput','addNodeLabel','nodeEditorText']
  .forEach(id=> makeRichField(document.getElementById(id)));
/* The two fields whose Enter means more than "stop typing": the add form's
   label, where Enter is the Add button every other form on the web has
   trained the reader to expect, and the note editor, where Enter is Apply —
   the same thing its own button does, so the note closes rather than being
   left open over the entry it belongs to. */
setRichEnter('addNodeLabel', ()=>{
  const btn = document.getElementById('addNodeSubmit');
  if(btn && !btn.disabled) btn.click();
});
setRichEnter('detailNoteInput', ()=>{
  const btn = document.getElementById('detailNoteApply');
  if(btn) btn.click();
});
/* Typing in either of these redraws the element itself, on the next frame
   so a fast typist doesn't trigger a re-layout per keystroke. A caption, a
   callout and a connector's note all used to have a field of their own in
   a panel; all three are written on the drawing now, by the one field. */
['nodeEditorText'].forEach(id=>{
  const rec = richFields.get(id);
  if(!rec) return;
  rec.surface.addEventListener('input', ()=> queueLabelPreview());
});
// The drawer's Label surface used to drive the entry form's commit from
// here, because a rich surface writes through to a hidden textarea and a
// textarea written to by script fires no input event of its own. There is
// no Label surface any more: the words are committed by the field that
// takes them, which is commitNodeEditorText.

