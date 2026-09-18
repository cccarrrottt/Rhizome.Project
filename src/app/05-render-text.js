/* ---------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------ */
const svg = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  if(parent) parent.appendChild(e);
  return e;
}

// Off-canvas <text> reused to get real, per-font/weight/style advance
// widths for node label layout (so bold/italic runs and ruby annotations
// line up on their actual rendered width, not a guessed character count).
/* LINE_H is the distance from one baseline to the next. At 15 against
   11.5pt type it was a third again as tall as the type, which is right for
   a paragraph of prose and far too airy for a two-word label in a box —
   the box was mostly the gap between its own lines. 12.8 is a little over
   1.1, which is as close as lines of this size go before the descenders of
   one row start meeting the ascenders of the next.
   RUBY_EXTRA is what a line carrying a reading adds on top, and it is
   untouched: the annotation needs its own storey whatever the leading is,
   and closing the lines up must not take it away. */
const NODE_FS = 11.5, RUBY_FS = 7.5, LINE_H = 12.8, RUBY_GAP = 8, RUBY_EXTRA = 9;
/* The annotation over a ruby unit is set against the size of the run the
   unit sits in, not against the entry's own size — a phrase set bigger
   takes its readings up with it. */
const RUBY_SCALE = RUBY_FS / NODE_FS;
const RUBY_RISE  = RUBY_GAP / NODE_FS;
/* Every look a run can carry, written onto one tspan. Bold, italic, face
   and colour are independent — a word can be all of them at once — and
   face and colour have to share a single style attribute, because the
   `.node text{}` rule sets a fill and a family of its own and a
   presentation attribute loses to a stylesheet. Assigning them one at a
   time through `.style` let the browser rewrite the colour into `rgb(…)`,
   so the value that came back out was no longer the value that went in. */
function applyRunStyle(t, w, skipSize){
  if(w.bold) t.setAttribute('font-weight','700');
  if(w.italic) t.setAttribute('font-style','italic');
  if(!skipSize && w.size) t.setAttribute('font-size', w.size);
  const bits = [];
  if(w.font) bits.push('font-family:' + fontFamilyFor(w.font));
  if(w.color) bits.push('fill:' + w.color);
  /* A rule under the words or through them. Both lines at once is a
     legitimate thing to ask for, so they are written as one declaration —
     `text-decoration-line` takes them together — and the style follows the
     UNDERLINE when the two disagree, since a browser paints one style for
     the whole element and the underline is the one being read along. */
  /* The UNDERLINE is not one of them any more.
   *
   * Chrome breaks an underline around every descender — "skip ink", which
   * is right for a paragraph of prose and wrong at this size, where the
   * pieces left between two y's are a few pixels long and read as a full
   * stop after each letter. On HTML that is one property away; on SVG text
   * the property, its -webkit- spelling, the presentation attribute and
   * text-underline-offset are all ignored, so the only way to draw a rule
   * that actually runs under the words is to draw it. See paintUnderlines,
   * which finds these runs once the text has been laid out.
   *
   * A line THROUGH the words stays a decoration: it crosses the letters at
   * mid-height, where there is no ink to skip, and it is drawn correctly
   * as it is. */
  if(w.strike){
    bits.push('text-decoration-line:line-through');
    bits.push('text-decoration-style:' + ((LINE_STYLES[w.strike] || LINE_STYLES.solid).css));
    if(w.color) bits.push('text-decoration-color:' + w.color);
  }
  if(w.under){
    t.setAttribute('data-ul', w.under);
    if(w.color) t.setAttribute('data-ul-color', w.color);
  }
  if(bits.length) t.setAttribute('style', bits.join(';') + ';');
}

// A small curated set of free Google Fonts a node's text can opt into
// (loaded via the <link> tag in <head>). Key is what's stored in a node's
// opts.font; value is the CSS font-family stack applied via inline style
// (a plain font-family attribute loses to the .node text{} stylesheet
// rule, so callers must set it as `style="font-family:...;"`, not as an
// attribute).
const FONT_OPTIONS = [
  { key:'arial',     label:'Arial (default)',         family:"Arial, Helvetica, sans-serif" },
  { key:'times',     label:'Times New Roman',          family:"'Times New Roman', Times, serif" },
  { key:'plex',      label:'IBM Plex Sans',            family:"'IBM Plex Sans', sans-serif" },
  { key:'serif',     label:'Merriweather (serif)',     family:"'Merriweather', serif" },
  { key:'grotesk',   label:'Space Grotesk (modern)',   family:"'Space Grotesk', sans-serif" },
  { key:'orbitron',  label:'Orbitron (sci-fi)',         family:"'Orbitron', sans-serif" },
  { key:'hand',      label:'Caveat (handwritten)',      family:"'Caveat', cursive" },
  // Embedded as a data: URI in the @font-face block up top, not fetched
  // from a font host — see the note there.
  { key:'autobot',   label:'Autobot Characters',        family:"'Autobot Characters', 'IBM Plex Sans', sans-serif" },
];
function fontFamilyFor(key){
  const opt = FONT_OPTIONS.find(f=>f.key===key);
  return opt ? opt.family : FONT_OPTIONS[0].family;
}

const measureEl = el('text',{x:-9999,y:-9999,visibility:'hidden',
  'font-family':"'IBM Plex Sans',sans-serif"}, svg);
/* A whole BLOCK of text, laid out off-canvas exactly as it will be drawn,
   so its real ink can be measured — every line, every run in its own face
   and size, the annotations over its readings and the stickers among its
   words included. A width taken glyph by glyph cannot answer how far the
   tallest character reaches above the line or the lowest tail below it,
   and those are exactly what the border has to clear. */
const measureBlockG = el('g', {visibility:'hidden'}, svg);
/* The measuring text draws no underlines.
 *
 * They are separate elements laid out beside the text, and this group is
 * measured with getBBox — so a rule under a word would have been counted
 * as part of the block and every underlined entry would have come out a
 * pixel or two taller than the words in it actually are. */
const measureBlockText = el('text', {x:0, y:0, 'data-no-rules':'1'}, measureBlockG);
/* Measured text widths, remembered.

   Every width on this chart comes from putting the string into a hidden
   <text> and asking the browser how wide it came out. That is the only way
   to get a true answer — it accounts for the actual font, its kerning and
   whatever fallback face is really in use — but each call forces the
   browser to lay the element out, and laying out synchronously in a loop
   is the classic way to make a page crawl.

   One render of a 120-entry chart asked 3,360 times and asked about only
   124 DIFFERENT strings: the same labels, the same single space between
   words, the same font at the same size, over and over, because the width
   search steps a candidate box up in tens and re-measures every word at
   every width. Remembering the answers turns almost all of that into a map
   lookup.

   The cache is dropped wholesale once it grows past a sane size rather
   than evicted one entry at a time. Entries go stale in only one way — the
   web fonts finishing loading, which changes every width at once — and
   that is handled by clearing it when they land, below. */
const measureCache = new Map();
const MEASURE_CACHE_MAX = 6000;
function measureText(text, {bold, italic, fontSize, family}={}){
  const size = fontSize || NODE_FS;
  const face = family || "'IBM Plex Sans',sans-serif";
  const key = text + '\u0000' + (bold?1:0) + (italic?1:0) + size + '\u0000' + face;
  const hit = measureCache.get(key);
  if(hit !== undefined) return hit;
  measureEl.setAttribute('font-size', size);
  measureEl.setAttribute('font-weight', bold ? '700' : '500');
  measureEl.setAttribute('font-style', italic ? 'italic' : 'normal');
  measureEl.setAttribute('font-family', face);
  measureEl.textContent = text;
  const w = measureEl.getComputedTextLength() || text.length*6.5;
  if(measureCache.size >= MEASURE_CACHE_MAX) measureCache.clear();
  measureCache.set(key, w);
  return w;
}
/* Widths measured before a web font arrives are the fallback face's, not
   the real one's. When the fonts land every remembered width is wrong at
   once, so the cache is emptied and the chart redrawn — otherwise entries
   would keep their first-paint sizes for the rest of the session. */
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{
    measureCache.clear();
    /* And the block cache with it. It is declared further down — the two
       are emptied for one reason and must be emptied together, so this
       reaches forward rather than growing a second fonts.ready handler
       that could be registered, or removed, independently of this one. */
    blockCache.clear();
    if(typeof rebuildChart === 'function' && nodes && nodes.size) rebuildChart();
  }).catch(()=>{});
}
// Lays out one wrapped line's word-tokens into `textEl`, centered on
// centerX, with each word placed at its real measured width so a ruby
// annotation can be centered exactly over its base word.
function layoutLine(textEl, words, centerX, baselineY, fontOpts){
  const fontSize = (fontOpts && fontOpts.fontSize) || undefined;
  const family = (fontOpts && fontOpts.family) || undefined;
  const SPACE_W = measureText(' ', {fontSize, family}) || 3;
  // A sticker and a citation are set at the size of the run they sit in,
  // so making a phrase bigger takes them with it.
  const widths = words.map(w => w.type==='sticker' ? stickerBox(w.size || fontSize)
    : w.type==='ruby'
    ? runsWidth(w.baseRuns, w.size || fontSize, family)
    : w.type==='ref'
    ? measureText(refMarkText(w.key), {fontSize:(w.size || fontSize || NODE_FS)*REF_FS_SCALE, family})
    : measureText(w.text, {bold: !!w.bold, italic: !!w.italic,
                           fontSize: w.size || fontSize,
                           family: w.font ? fontFamilyFor(w.font) : family}));
  // Glued word-fragments (the character-split CJK/long-run fallback in
  // wrapLabel) sit flush against the previous fragment — no inter-word gap
  // before them, unlike an ordinary word boundary.
  const gaps = words.map((w,i)=> (i===0 || w.glue) ? 0 : SPACE_W);
  const lineWidth = widths.reduce((a,b)=>a+b,0) + gaps.reduce((a,b)=>a+b,0);
  let cursorX = centerX - lineWidth/2;
  words.forEach((w,i)=>{
    cursorX += gaps[i];
    const width = widths[i];
    if(w.type==='sticker'){
      /* An <image> can't live inside <text>, so it is drawn as a sibling
         at the spot the text layout reserved for it — the wrap and width
         maths above already treated it as a glyph, so it lands in the run
         of words rather than on top of them. */
      const src = stickerSrc(w.key);
      const box = width;         // measured at this run's own size above
      const holder = textEl.parentNode;
      if(src && holder){
        const img = el('image', {
          x: cursorX, y: baselineY - box*0.8, width: box, height: box,
          class: 'sticker-glyph', preserveAspectRatio: 'xMidYMid meet'
        }, holder);
        shareTextClip(textEl, img);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
        img.setAttribute('href', src);
      } else if(holder){
        // A sticker whose picture is gone leaves a quiet placeholder
        // rather than a hole in the sentence.
        shareTextClip(textEl,
          el('rect', {x:cursorX, y:baselineY - box*0.8, width:box, height:box,
                      rx:3, class:'sticker-missing'}, holder));
      }
    } else if(w.type==='ref'){
      /* The mark, and ONLY the mark, is clickable.
       *
       * Text on this chart is inert by design — a label is dragged, not
       * pressed — so pointer-events are off for the <text> as a whole and
       * turned back on for this one tspan. That is what keeps "click the
       * little number" from becoming "click anywhere in the sentence",
       * which would collide with dragging the entry the text belongs to.
       *
       * It is set smaller and raised off the baseline, and given a low
       * opacity in the stylesheet, so a sentence carrying four citations
       * still reads as a sentence. */
      // Sized and raised against the run it sits in, so a citation in a
      // phrase set larger grows with the phrase.
      const own = w.size || fontSize || NODE_FS;
      const size = own * REF_FS_SCALE;
      const t = el('tspan', {
        x: cursorX, y: baselineY - own * REF_RISE,
        'font-size': size.toFixed(2), class: 'ref-mark', 'data-ref': w.key
      }, textEl);
      /* Its own colour, set inline so the surrounding text's colour cannot
         reach it — a citation belongs to the reference, not to the
         sentence it sits in. */
      const rc = refColor();
      if(rc) t.setAttribute('style', `fill:${rc};`);
      t.textContent = refMarkText(w.key);
      if(refIndex(w.key) < 0) t.classList.add('ref-missing');
    } else if(w.type==='ruby'){
      /* A reading is two rows of runs, not two strings.
       *
         The base sits on the line and the annotation is centred over it,
         and each of them is laid out run by run — so an annotation can be
         coloured, emboldened or set in another face without the word
         underneath it changing, and the other way round. Both start from
         the look of the run the whole unit sits in, which is what keeps a
         reading inside a bold phrase bold unless it is told otherwise. */
      const own = w.size || fontSize || NODE_FS;
      const drawRow = (runs, startX, y, scale, cls)=>{
        let cx2 = startX;
        (runs || []).forEach(t=>{
          if(t.type !== 'plain') return;
          const size = (t.size || own) * scale;
          const tw = measureText(t.text, {bold: !!t.bold, italic: !!t.italic,
            fontSize: t.size || own,
            family: t.font ? fontFamilyFor(t.font) : family}) * scale;
          const el2 = el('tspan', {x: cx2.toFixed(2), y: y.toFixed(2)}, textEl);
          if(cls) el2.setAttribute('class', cls);
          applyRunStyle(el2, t, true);
          el2.setAttribute('font-size', size.toFixed(2));
          el2.textContent = t.text;
          cx2 += tw;
        });
      };
      drawRow(w.baseRuns, cursorX, baselineY, 1, null);
      const annoW = runsWidth(w.annoRuns, own, family) * RUBY_SCALE;
      drawRow(w.annoRuns, cursorX + width/2 - annoW/2,
              baselineY - own*RUBY_RISE, RUBY_SCALE, 'ruby-anno');
    } else {
      const t = el('tspan',{x:cursorX, y:baselineY}, textEl);
      applyRunStyle(t, w);
      t.textContent = w.text;
    }
    cursorX += width;
  });
}

// background/edge/node layers (no per-continuity labels anymore — tags
// are shown per-node in the legend/filter UI instead, see below)
const bgLayer = el('g',{id:'bgLayer'}, viewport);
// Free-standing images sent behind the arrows land here, between the grid
// and the connectors.
// The fan-fiction weave sits under everything, including the connectors.
const fanLayer = el('g',{id:'fanLayer', style:'pointer-events:none;'}, bgLayer);
/* Scenery that belongs to an entry but is not the entry: a multiversal
   hub's echo rings, a local multiverse's stack of sheets behind its front
   face. It lives BELOW the connectors, because a connector heading for the
   front face has to cross it — drawn with the entry, the sheets tinted
   every line that passed under them and the arrow looked as though it had
   stopped at the back of the stack rather than reaching the front. */
const auraLayer = el('g',{id:'auraLayer', style:'pointer-events:none;'}, bgLayer);
const backLayer = el('g',{id:'backLayer'}, viewport);
const edgeLayer = el('g',{id:'edgeLayer'}, viewport);
/* The handles on the callout anchors, and nothing else.
 *
 * They were drawn with their own leaders, inside edgeLayer — where every
 * connector ALSO lays down a wide invisible path to be clickable by, and
 * the ones routed after the leader covered its dot completely: the handle
 * was there, the cursor changed nowhere, and the anchor could not be
 * picked up at all. A layer of its own, above every connector and below
 * every entry, is the only arrangement in which the order the edges
 * happen to be drawn in cannot decide whether a handle works. */
const leaderHitLayer = el('g',{id:'leaderHitLayer'}, viewport);
const nodeLayer = el('g',{id:'nodeLayer'}, viewport);
/* Arrowheads live ABOVE the entries, not with their own lines. A connector
   stops at the outermost border of the entry it points into, so on an
   entry with a second or third border ring the tip would otherwise be
   buried under those rings and the arrow would look like it stopped short.
   Drawn here, the head lands on top of the border it is pointing at. */
const arrowLayer = el('g',{id:'arrowLayer', style:'pointer-events:none;'}, viewport);
// An image set "in front" goes above even the arrowheads — that is what
// being in front means.
const frontLayer = el('g',{id:'frontLayer'}, viewport);
// Node groups live in two layers now (backdrop images sit under the
// connectors), so every lookup that used to walk nodeLayer walks both.
function qNodes(sel){
  return [...nodeLayer.querySelectorAll(sel),
          ...backLayer.querySelectorAll(sel),
          ...frontLayer.querySelectorAll(sel)];
}
// Connectors live in two layers as well: the lines below the entries, the
// arrowheads and the short caps that reach past a border ring above them.
function qEdges(sel){
  return [...edgeLayer.querySelectorAll(sel), ...arrowLayer.querySelectorAll(sel)];
}
function qNode(sel){
  return nodeLayer.querySelector(sel) || backLayer.querySelector(sel) || frontLayer.querySelector(sel);
}

/* ---------------------------------------------------------------------
   Multi-language text tabs. A node with opts.multiLang + opts.langTabs
   keeps its usual main `label` as the default text, plus a small set of
   alternate texts (e.g. per-language translations) the viewer can switch
   between live, on-canvas, via tiny clickable "symbol" chips tucked into
   the node's top-left corner (the same corner-badge treatment as the
   n.link icon at top-right, just on the other side). Switching is purely
   an in-browser UI toggle (activeLangTab below) — it never touches the
   saved node data or triggers a relayout, so the node's box stays a fixed
   size sized to fit the TALLEST of all its texts (see hasLangTabs in the
   main node-render loop) no matter which text is currently showing.
   ------------------------------------------------------------------ */
const activeLangTab = new Map(); // node id -> 0-based index into n.langTabs, or null for the default/main label
function wrapAndMeasure(text, maxChars, lineH, fontScale, fit){
  const lines = wrapLabel(text, maxChars, fit);
  // A line carrying a sticker needs room for a glyph taller than the text.
  const slots = lines.map(l => lineH + (l.hasRuby ? RUBY_EXTRA*fontScale : 0)
                              + (l.hasSticker ? Math.max(0, stickerBox(NODE_FS*fontScale) - lineH*0.85) : 0));
  const totalH = slots.reduce((a,b)=>a+b,0);
  return { lines, slots, totalH };
}

/* The narrowest box that still holds this node's longest text in at most
   NODE_MAX_LINES lines. Walks up in small steps and measures for real
   rather than estimating from a character count, because a character
   count is exactly what gets glyph widths wrong (see wrapLabel's `fit`).
   Snapped to the grid so hand-placed and auto-sized nodes still line up. */
function autoNodeWidth(texts, fontSize, family, maxLines, maxWidth){
  const lines = maxLines || NODE_MAX_LINES;
  const cap = maxWidth || NODE_MAXW;
  const fontScale = fontSize / NODE_FS;
  const lineH = LINE_H * fontScale;
  for(let w = NODE_MINW; w < cap; w += 10){
    const fit = { maxWidth: w - NODE_PAD_X*2, fontSize, family };
    const chars = Math.max(8, Math.round((w - NODE_PAD_X*2) / (fontSize*0.55)));
    const worst = Math.max(...texts.map(t=> wrapAndMeasure(t, chars, lineH, fontScale, fit).lines.length));
    if(worst <= lines) return w;
  }
  return cap;
}
/* Measured BLOCKS, remembered.
 *
 * measureText above remembers the width of a STRING; this remembers the ink
 * box of a whole laid-out block, and it is the expensive one. Each call
 * builds the text off-canvas and asks getBBox for the result — a forced,
 * synchronous layout, taken while renderNodes is appending to the very same
 * SVG. Measured on a synthetic chain: it is 54–63% of everything a rebuild
 * costs, at exactly two calls per entry.
 *
 * Two calls per entry is not an estimate either. renderNodes measures every
 * text an entry can show in order to size the box, and then measures the
 * ACTIVE one again to centre it — with the same maxChars and the same fit,
 * both computed above and unchanged in between. So half of every render's
 * measurements were already answered during that same render, before any
 * question of remembering them across renders arises.
 *
 * WHAT THE ANSWER DEPENDS ON, which is what the key has to carry:
 *
 * The arguments, and one thing that is not among them. A citation draws as
 * the number the reference has IN REFS — refMarkText reads its position —
 * so reordering the list changes `[9]` to `[10]` and with it the width of
 * every text that cites it. That is the whole of the hidden state: a
 * sticker's box is stickerBox(fontSize), a function of the size alone, so
 * neither the picture nor the library it comes from can move anything.
 *
 * So a text carrying no citation is keyed by its arguments, and one that
 * does also carries the order of the reference keys. Nothing here is a
 * counter that a future write site can forget to bump; the key is derived
 * from the state it depends on, every time.
 *
 * Fonts are the other way answers go stale — every width changes at once
 * when a webfont lands — and that is handled where measureCache handles it,
 * by emptying both and redrawing. */
const blockCache = new Map();
const BLOCK_CACHE_MAX = 4000;
function refOrderKey(){
  let s = '';
  for(let i = 0; i < REFS.length; i++) s += (REFS[i] && REFS[i].key) + '';
  return s;
}
function blockCacheKey(text, maxChars, lineH, fontScale, fontOpts, fit){
  const t = String(text == null ? '' : text);
  return t + '\u0000' + maxChars + '\u0000' + lineH + '\u0000' + fontScale +
    '\u0000' + ((fontOpts && fontOpts.fontSize) || '') +
    '\u0000' + ((fontOpts && fontOpts.family) || '') +
    '\u0000' + ((fit && fit.maxWidth) || '') +
    '\u0000' + ((fit && fit.fontSize) || '') +
    '\u0000' + ((fit && fit.family) || '') +
    '\u0000' + (fit && fit.noWrap ? 1 : 0) +
    '\u0000' + (t.indexOf('{{r:') < 0 ? '' : refOrderKey());
}
/* How much room a block of text actually takes, measured rather than
   estimated.
 *
 * The box used to be sized from a line count times a nominal line height
 * plus two round numbers — 16 across, 26 down — which meant the padding
 * was whatever those numbers happened to leave over. On ordinary text that
 * was a lot; on a line carrying a large glyph, an annotation over a
 * reading, or a letter with a descender it could be too little, and the
 * ink ran into the border. Neither is a padding anyone chose.
 *
 * So the text is laid out off-canvas first and its ink box asked for. What
 * comes back already accounts for the ascenders of the tallest run and the
 * tails of the lowest, and the border is then set a fixed small distance
 * outside it. Make a character bigger or give it a descender and the box
 * follows, because the thing being measured has changed. */
function measureTextBlock(text, maxChars, lineH, fontScale, fontOpts, fit){
  const key = blockCacheKey(text, maxChars, lineH, fontScale, fontOpts, fit);
  const hit = blockCache.get(key);
  // A fresh object every time. Nothing currently writes to what this hands
  // back, and a shared one would make the first thing that did so rewrite
  // the remembered answer for every entry that shares it.
  if(hit) return {width: hit.width, height: hit.height, mid: hit.mid};
  while(measureBlockG.firstChild !== measureBlockText && measureBlockG.firstChild){
    measureBlockG.removeChild(measureBlockG.firstChild);
  }
  Array.from(measureBlockG.childNodes).forEach(c=>{
    if(c !== measureBlockText) measureBlockG.removeChild(c);
  });
  /* Set in the same face and size the entry will be drawn in. Without
     this the measuring element inherited the document's own 16px default,
     and every box was sized for text a third larger than the text it was
     going to hold. */
  const fs = (fontOpts && fontOpts.fontSize) || NODE_FS;
  const fam = (fontOpts && fontOpts.family) || "'IBM Plex Sans',sans-serif";
  measureBlockText.setAttribute('font-size', fs);
  measureBlockText.setAttribute('font-weight', '500');
  measureBlockText.style.fontFamily = fam;
  measureBlockText.style.textAnchor = 'start';
  renderNodeText(measureBlockText, text, 0, 0, maxChars, lineH, fontScale, fontOpts, fit);
  let bb;
  try{ bb = measureBlockG.getBBox(); }
  catch(e){ bb = null; }
  if(!bb || !Number.isFinite(bb.width) || !Number.isFinite(bb.height)){
    // No layout available (a detached document, a test harness): fall back
    // to the arithmetic this replaced, so nothing collapses to nothing.
    // Deliberately NOT remembered: this is what the page says when it
    // cannot measure, not what the text measures, and caching it would
    // keep answering with it after layout became available again.
    const m = wrapAndMeasure(text, maxChars, lineH, fontScale, fit);
    return {width: 0, height: m.totalH, mid: 0};
  }
  /* Where the middle of the ink ended up, measured from the point the
     block was laid out on. It is not zero: a line of type has more above
     its baseline than below, and a reading or a tall glyph pulls it
     further off. Handing this back lets the drawing centre the INK on the
     box rather than the line grid, which is what stops a word with a
     descender sitting high in its border. */
  const out = {width: bb.width, height: bb.height, mid: bb.y + bb.height/2};
  // Dropped wholesale past a sane size rather than evicted one at a time,
  // for the reason measureCache is: the only way an entry here goes stale
  // is the webfonts landing, which invalidates every one of them at once.
  if(blockCache.size >= BLOCK_CACHE_MAX) blockCache.clear();
  blockCache.set(key, out);
  return {width: out.width, height: out.height, mid: out.mid};
}
function textForActive(n, activeIdx){
  if(activeIdx===null || activeIdx===undefined || !n.langTabs) return n.label;
  const t = n.langTabs[activeIdx];
  return t ? t.text : n.label;
}
// (Re)lays out one node's <text> element for whichever text is currently
// active, vertically centered on textAreaCenterY (the center of the
// node's fixed text area, i.e. excluding any reserved symbol-chip strip).
// Reused both for the initial render and for every live tab switch.
function renderNodeText(txtEl, text, textAreaCenterY, centerX, maxChars, lineH, fontScale, fontOpts, fit){
  while(txtEl.firstChild) txtEl.removeChild(txtEl.firstChild);
  const { lines, slots, totalH } = wrapAndMeasure(text, maxChars, lineH, fontScale, fit);
  const centerOffset = (totalH - lineH)/2;
  /* Half the cap height, so the block sits centred on the point it was
     given. It used to be a flat +4, tuned for an entry's 11.5px text — on
     the 8.5px text of a connector's note that pushed the line low in its
     plate, which is what made a comment look badly aligned in its box. */
  const capNudge = ((fontOpts && fontOpts.fontSize) || NODE_FS) * 0.35;
  let baselineY = textAreaCenterY - centerOffset + capNudge;
  lines.forEach((line,i)=>{
    if(i>0){ baselineY += slots[i]; }
    layoutLine(txtEl, line.words, centerX, baselineY, fontOpts);
  });
  paintUnderlines(txtEl);
}
/* Rules under the words, drawn rather than decorated.
 *
 * One line per underlined run, measured off the run itself once it has
 * been laid out — start and end of the glyphs, and the baseline they sit
 * on — so it is exactly as long as the words are and follows them through
 * wrapping, rotation and every font size. The five kinds of line the
 * markup offers are drawn here rather than named to the browser: solid and
 * double as strokes, dashed and dotted through a dash pattern, wavy as a
 * small sine along the run.
 *
 * The lines go in beside the text rather than inside it, because <text>
 * may hold only text — so they are appended to whatever the text itself
 * hangs in, immediately after it. */
function paintUnderlines(txtEl){
  if(!txtEl || txtEl.getAttribute('data-no-rules')) return;
  const host = txtEl.parentNode;
  if(!host) return;
  /* Almost no text on a chart is underlined, and this runs for every piece
     of text on every render — so the cheapest possible question is asked
     first, and a text with no rules in it and none left over from a
     previous pass costs one querySelector that stops at the first match. */
  const runs = [...txtEl.querySelectorAll('tspan[data-ul]')];
  if(!runs.length && !txtEl.dataset.ulKey) return;
  // Whatever an earlier pass over this same text element left behind.
  [...host.querySelectorAll(':scope > .text-underline')].forEach(e=>{
    if(e.dataset.forText === (txtEl.dataset.ulKey || '')) e.remove();
  });
  if(!runs.length) return;
  const key = txtEl.dataset.ulKey || (txtEl.dataset.ulKey = 'ul' + (++underlineSeq));
  runs.forEach(run=>{
    const n = (run.textContent || '').length;
    if(!n) return;
    let a, b, size;
    try{
      a = run.getStartPositionOfChar(0);
      b = run.getEndPositionOfChar(n - 1);
      size = parseFloat(getComputedStyle(run).fontSize) || NODE_FS;
    }catch(e){ return; }
    if(!a || !b || Math.abs(b.x - a.x) < 0.4) return;
    const w = Math.max(0.7, size * 0.055);
    const y = a.y + size * 0.14 + w/2;
    const ink = run.getAttribute('data-ul-color') ||
                getComputedStyle(run).fill || 'currentColor';
    const kind = run.getAttribute('data-ul') || 'solid';
    /* The width goes in an inline STYLE, not an attribute: the rule that
       gives every shape inside an entry its border weight — and the
       thicker one a selected entry gets — would otherwise win over it,
       and a wavy underline would come out as thick as a border. */
    const put = (attrs)=>{
      const e = el(kind === 'wavy' ? 'path' : 'line',
        Object.assign({class:'text-underline', stroke:ink,
                       style:`fill:none;stroke-width:${w.toFixed(2)};`}, attrs), host);
      e.dataset.forText = key;
      shareTextClip(txtEl, e);
      return e;
    };
    if(kind === 'wavy'){
      const amp = Math.max(0.6, size * 0.05), step = Math.max(2, size * 0.22);
      let d = `M${a.x.toFixed(2)},${y.toFixed(2)}`;
      for(let x = a.x, k = 0; x < b.x; x += step, k++){
        const nx = Math.min(b.x, x + step);
        d += ` Q${(x + step/2).toFixed(2)},${(y + (k % 2 ? amp : -amp)).toFixed(2)} ${nx.toFixed(2)},${y.toFixed(2)}`;
      }
      put({d});
      return;
    }
    const dash = kind === 'dashed' ? `${(w*3).toFixed(2)} ${(w*2.4).toFixed(2)}`
               : kind === 'dotted' ? `${w.toFixed(2)} ${(w*1.8).toFixed(2)}`
               : null;
    const base = {x1:a.x.toFixed(2), x2:b.x.toFixed(2)};
    const rows = kind === 'double' ? [y, y + w*2.2] : [y];
    rows.forEach(ry=>{
      const attrs = Object.assign({}, base, {y1:ry.toFixed(2), y2:ry.toFixed(2)});
      if(dash) attrs['stroke-dasharray'] = dash;
      if(kind === 'dotted') attrs['stroke-linecap'] = 'round';
      put(attrs);
    });
  });
}
let underlineSeq = 0;
/* What is drawn BESIDE a text is cut where the text is cut.
 *
 * A label too long for its box is clipped at the border (see clipText in
 * renderNodes) — but the clip is on the <text>, and an underline or an
 * inline sticker cannot live inside a <text>, so they are its siblings and
 * the clip never reached them. The words stopped at the border and their
 * underline ran on across the chart. Whatever window the text is seen
 * through, the things drawn alongside it are seen through the same one. */
function shareTextClip(txtEl, elm){
  if(!txtEl || !elm) return;
  const clip = txtEl.getAttribute('clip-path');
  if(clip) elm.setAttribute('clip-path', clip);
}

