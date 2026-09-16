/* ---------------------------------------------------------------------
   The character-bio card.

   A bio circle holds a portrait and no words, so its text opens in a card
   beside it. The card is drawn in SVG through the very same code that
   draws a default node — same width, same border radius, same wrapping,
   same font handling — so it doesn't merely resemble a node, it is one.
   That also means it pans and zooms with the chart instead of floating
   over it at a fixed size.

   The card is read-only: a bio's text is its label, edited in the node's
   own settings form like every other entry's, so there is one place to
   change it rather than two that could drift apart.
   ------------------------------------------------------------------ */
const bioCardLayer = el('g', {id:'bioCardLayer'}, viewport);
// Written here, read by the regression suite, which measures the card by it
// rather than by guessing at the drawing.
// eslint-disable-next-line no-unused-vars
let bioCardBox = null;   // world-space rect of the drawn card

const BIO_CARD_GAP = 16;
function bioSideOf(n){
  const v = n && n.bioSide;
  return (v === 'left' || v === 'right') ? v : 'auto';
}

/* Every card that should be on the drawing right now.
 *
 * There used to be exactly one — whichever portrait the pointer was over —
 * so a portrait asked to keep its card open could not have one at the same
 * time as another was being hovered. The layer holds as many as are
 * wanted: every portrait that carries the choice, plus the transient one. */
function drawBioCard(){
  /* Which cards were ALREADY up before this redraw.
   *
   * A card fades and slides in when it opens, which is right for a card
   * that has just been asked for and quite wrong for one that was on the
   * drawing a moment ago: this layer is cleared and rebuilt whenever
   * anything else on the chart is redrawn — a click, a keystroke, an edit
   * anywhere — so a portrait keeping its card open replayed the entrance
   * every time the reader touched the chart. From the outside: a card
   * blinking at you for no reason. One that was up comes back up, with no
   * animation at all; only a genuinely new one is introduced. */
  const wasShown = new Set();
  bioCardLayer.querySelectorAll('.bio-card-g.shown').forEach(g=>{
    if(g.dataset.id) wasShown.add(g.dataset.id);
  });
  while(bioCardLayer.firstChild) bioCardLayer.removeChild(bioCardLayer.firstChild);
  bioCardBox = null;
  const want = [];
  nodes.forEach(n=>{ if((n.shape || '') === 'ellipse' && n.bioCard) want.push(n); });
  if(bioCardNodeId){
    const n = nodes.get(bioCardNodeId);
    if(n && want.indexOf(n) < 0) want.push(n);
  }
  want.forEach(n=> drawOneBioCard(n, wasShown.has(n.id)));
  paintBioCardDim();
}
/* A card steps back exactly as its portrait does.
 *
 * Selecting an entry fades everything unrelated to it, and the cards are
 * in a layer of their own that the wash never reached — so a portrait
 * asked to keep its card open faded to a ghost with a card at full
 * strength floating beside it, joined by a faded stub. The card is the
 * portrait's text, so it takes whatever the portrait takes: read off the
 * drawn entry rather than worked out a second time, which is also what
 * keeps the two from ever disagreeing. */
function paintBioCardDim(){
  bioCardLayer.querySelectorAll('.bio-card-g').forEach(g=>{
    let node = null;
    try{ node = qNode(`.node[data-id="${cssEscape(g.dataset.id || '')}"]`); }catch(e){}
    g.classList.toggle('dim', !!(node && node.classList.contains('dim')));
  });
}
// Builds the card with the node renderer's own primitives.
function drawOneBioCard(n, already){
  if(!n) return;
  const fontFamily = fontFamilyFor(n.font);
  const fontSize = (n.fontSize && n.fontSize>=6 && n.fontSize<=28) ? n.fontSize : NODE_FS;
  const fontScale = fontSize / NODE_FS;
  const lineH = LINE_H * fontScale;
  /* Sized to its words, like every other box on the chart — and then
     CLOSED ONTO THEM, the way an entry is.
   *
     It used to be a fixed BOXW whatever it held, so a two-word name sat in
     a card wide enough for a paragraph. Wrapping it to the narrowest width
     that holds the text is only half the answer: that width is where the
     text was allowed to break, and the widest line it actually made is
     usually narrower still. A portrait's card stands beside the drawing
     rather than in the flow of it, so every pixel it does not need is a
     pixel of chart it is covering. */
  let w = autoNodeWidth([n.label || ''], fontSize, fontFamily, NODE_MAX_LINES, BOXW);
  {
    const probe = { maxWidth: w - 16, fontSize, family: fontFamily };
    const chars = Math.max(8, Math.round((w - 16) / (fontSize*0.55)));
    const ink = measureTextBlock(n.label, chars, lineH, fontScale,
                                 {fontSize, family: fontFamily}, probe).width;
    if(ink > 0) w = Math.max(NODE_FIT_MINW, Math.min(w, Math.ceil(ink) + NODE_PAD_X*2));
  }
  const maxChars = Math.max(8, Math.round((w - NODE_PAD_X*2) / (fontSize*0.55)));
  const fit = { maxWidth: w - NODE_PAD_X*2, fontSize, family: fontFamily };
  const totalH = wrapAndMeasure(n.label, maxChars, lineH, fontScale, fit).totalH;
  /* The same arithmetic the width already uses, and the same an ordinary
     entry uses for both: the ink, plus the entry padding, never below the
     minimum. It used to carry eight extra pixels of floor and twelve of
     padding that nothing else on the chart has, so a card closed neatly
     onto its words across and sat in a band of empty space down — the two
     dimensions of one box behaving as though they belonged to different
     objects. */
  const h = Math.max(NODE_FIT_MINH, Math.ceil(totalH) + NODE_PAD_Y*2);

  /* Which side the card stands on.
   *
   * Right by default, and left when the right is occupied and the left is
   * not — a card is a reading aid, and one laid over the neighbouring
   * entry is worse than no card at all. Both sides busy or both clear, it
   * goes right, because a chart reads left to right and the words belong
   * after the face. A portrait may also be told which side to use, for the
   * cases arithmetic cannot know about: a card that must not cover a
   * particular thing, or a row of portraits whose cards should all hang
   * the same way whatever happens to be near each one. */
  const cy = n.y + n.h/2;
  const wantSide = bioSideOf(n);
  const busy = (left)=>{
    const bx = left ? (n.x - BIO_CARD_GAP - w) : (n.x + n.w + BIO_CARD_GAP);
    return Array.from(nodes.values()).some(o=>
      o.id!==n.id && o.x < bx + w + 8 && o.x + o.w > bx - 8 &&
      o.y < cy + h/2 + 8 && o.y + o.h > cy - h/2 - 8);
  };
  let flip = wantSide === 'left';
  if(wantSide === 'auto') flip = busy(false) && !busy(true);
  let x = flip ? (n.x - BIO_CARD_GAP - w) : (n.x + n.w + BIO_CARD_GAP);
  const y = cy - h/2;
  bioCardBox = {x, y, w, h};

  /* Named after the portrait it belongs to. The layer holds as many cards
     as are wanted, so "the card" is not a thing that can be looked up any
     more — a caller, or a test, has to be able to say which one. */
  /* The card's OWN rectangle, written on the group.
   *
   * The group also holds the stub that joins the card to the portrait, so
   * its bounding box starts at the circle's rim and is half as wide again
   * as the card — which is why a field opened on a card stood well to the
   * left of it and hung off the end. Anything that wants the card as a box
   * has to be told where the box is; measuring the group gives it the
   * whole assembly instead. */
  const g = el('g', {class:'bio-card-g' + (flip ? ' flip' : ''), 'data-id': n.id,
                     'data-box': [x, y, w, h].map(v=> (+v).toFixed(2)).join(' ')},
               bioCardLayer);
  /* Reading the card means moving onto it, and moving onto it means
     leaving the portrait — which is what closed it. So the card holds
     itself open, and the stub's own width is enough to cross. */
  g.addEventListener('mouseenter', ()=> clearTimeout(bioHoverTimer));
  g.addEventListener('mouseleave', ()=>{
    if(bioCardPinned) return;
    clearTimeout(bioHoverTimer);
    bioHoverTimer = setTimeout(()=>{ if(!bioCardPinned) closeBioCard(); }, 160);
  });
  /* Double-click the card to edit the words on it.
   *
   * The card IS the portrait's text — the circle holds a picture and
   * nothing else — so it is the thing a reader points at when they want to
   * change what it says. Every other piece of text on the chart opens for
   * editing on a double click, and this one asked you to work out that the
   * words belonged to the circle beside it and to double-click that
   * instead. Same gesture, same destination: the entry's own Label, with
   * the cursor in it. */
  g.addEventListener('dblclick', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    if(document.body.classList.contains('read-only')) return;
    // On the card, which is where a portrait's words are.
    if(openNodeEditor(n.id)) return;
    openEntrySettings(n.id);
  });
  g.addEventListener('click', ev=> ev.stopPropagation());
  /* The stub joining the portrait to its card.
   *
   * Two things were wrong with it. It was painted in --line while the card
   * it leads to is painted in the entry's own border colour, so a portrait
   * with a coloured border produced a three-colour assembly out of what is
   * meant to read as one object; it now takes n.color like the card does.
   *
   * And it began at n.x + n.w — the bounding box's edge, which on a circle
   * is exactly the rightmost point of the rim. Starting there laid the
   * stub's stroke directly over the portrait's 2px border. It now starts
   * clear of the rim: half the border's width to get off the stroke, plus
   * a hair so antialiasing on the two edges does not touch either. */
  /* Starting ON the rim, not beside it.
   *
   * It used to start clear of the border's outer edge so the two strokes
   * would not overlap — which left a gap of a pixel or two at the one
   * place the eye is certain to look, and the card read as a thing
   * floating near the portrait rather than as the portrait's own card.
   * The overlap is the lesser evil, and at these weights it is invisible:
   * the stub now starts at the centre of the outermost ring's stroke, so
   * whatever the border's width the two always touch. */
  const outerR = n.w/2 + Math.max(0, ((n.colors && n.colors.length) || 1) - 1) * RING_STEP;
  const rim = n.w/2 - outerR;             // negative: outside the box, by the rings
  el('line', {x1: flip ? n.x + rim : n.x + n.w - rim, y1: cy,
              x2: flip ? x + w : x, y2: cy,
              stroke: n.color, 'stroke-width':1.2}, g);
  /* The card wears the entry's whole border, not just its first colour.
     A portrait with two or three ring colours drew them all around the
     circle and then a single plain outline around the card it opens, which
     read as two different entries side by side. Same list, same step, same
     centre-outward order as everywhere else. */
  const cardRings = (n.colors && n.colors.length) ? n.colors : [n.color];
  /* And the entry's background, on the same terms as the box: one colour
     fills the card, more than one make a gradient across it. The card is
     one of the boxes the background was said to reach in 0.9.16 and was
     the one that went on being drawn on plain paper. */
  const cardBg = (n.bg && n.bg.length)
    ? (n.bg.length > 1 ? makeGradient(n.bg, false, nodeDefs) : n.bg[0])
    : null;
  cardRings.forEach((c, i)=>{
    const grow = i*RING_STEP;
    el('rect', {x:x-grow, y:y-grow, width:w+grow*2, height:h+grow*2, rx:5+grow,
                stroke:c, style: i>0 ? 'fill:none;'
                                     : `fill:${cardBg || 'var(--panel)'};`}, g);
  });
  /* The card is written in the ENTRY's ink.
   *
   * The card IS the portrait's label — the circle holds a picture and
   * nothing else — and every other entry on the chart writes its label in
   * its own colour. This one was set in the plain body ink, so recolouring
   * a portrait repainted its rim, its stub and its card's border and left
   * the words inside black. It follows the entry now, live, and steps
   * aside for whatever colour a run of the text sets for itself; and where
   * the entry's colour would be lost against its own background it takes
   * the plain contrasting ink, exactly as a box's label does. */
  const cardInk = readableOn(cardRings[0] || 'var(--ink)',
                             (n.bg && n.bg.length) ? n.bg[0] : null);
  const txt = el('text', {x:x+w/2, y:0, 'font-size':fontSize, fill:cardInk,
    style:`font-family:${fontFamily};`}, g);
  renderNodeText(txt, n.label, y + h/2, x + w/2, maxChars, lineH, fontScale,
                 {fontSize, family:fontFamily}, fit);

  // No editing controls on the card itself: a bio's text is edited in the
  // node's own settings form like every other entry's label, so there is
  // one place to change it rather than two that could disagree.
  /* A card that was already on the drawing is put back at full strength in
     this same turn, before the browser has resolved a style for the new
     element — so there is no earlier value to animate from and no
     transition runs. A new one still arrives. */
  if(already) g.classList.add('shown');
  else requestAnimationFrame(()=> g.classList.add('shown'));
}

// The card lives inside the viewport group, so it pans and zooms with the
// chart by itself — there is nothing to re-anchor.
function positionBioCard(){}
/* Whether hovering this portrait should pop its card open.
 *
 * Two cases where it should not. A portrait asked to KEEP its card open
 * already has one on the drawing — pointing at it then set bioCardNodeId
 * as though a transient card were being opened, which redrew the layer and
 * played the card's entrance animation again under the pointer: a card
 * that is already there flickering because it was looked at.
 *
 * And while the settings of ANOTHER entry are open, the drawer is what the
 * reader is working in; a card popping up over the chart because the
 * pointer crossed a portrait on the way to the panel is a second thing
 * appearing uninvited. A pinned card is unaffected — that one was asked
 * for. */
function bioHoverWanted(id){
  const n = nodes.get(id);
  if(!n) return false;
  if(n.bioCard) return false;
  /* Whenever ANOTHER entry is the one being looked at. It used to be only
     while that entry's settings were open, on the grounds that the drawer
     alone is a lighter state — but a selection is a selection: the chart
     around it has stepped back, and a card popping up over the faded
     drawing because the pointer crossed a portrait on the way somewhere is
     the same interruption whether a form is open under it or not. */
  if(selectedId && selectedId !== id) return false;
  return true;
}
function openBioCard(id, pinned){
  const n = nodes.get(id);
  if(!n) return;
  clearTimeout(bioHoverTimer);
  if(pinned) bioCardPinned = true;
  if(bioCardNodeId === id) return;   // already showing this one
  bioCardNodeId = id;
  drawBioCard();
}
function closeBioCard(){
  /* Not while its words are being written on it.
   *
   * The card is a piece of SVG and the field that opens on it is HTML laid
   * over the top, so moving the pointer from one to the other LEAVES the
   * card as far as the DOM is concerned — and leaving the card is what
   * closed it. The field then stood over nothing, on an entry whose text
   * had gone from the screen mid-sentence. Held open by the fact that the
   * editor is open on this entry, rather than by a flag somebody has to
   * remember to set and clear: when the field closes, the ordinary rules
   * resume on the next movement. */
  if(nodeEditorTarget && nodeEditorTarget.kind === 'entry' &&
     nodeEditorTarget.id === bioCardNodeId) return;
  clearTimeout(bioHoverTimer);
  bioCardPinned = false;
  bioCardNodeId = null;
  bioCardBox = null;
  // The cards that were ASKED for stay; only the transient one goes.
  drawBioCard();
}

/* ---------------------------------------------------------------------
   Portrait picker, shared by both forms.

   A chosen file is embedded as a data: URI rather than linked, so the
   portrait keeps working for every viewer instead of depending on a host
   that may disappear — but a full-size photo would bloat the page, so it
   is drawn onto a canvas at BIO_IMAGE_MAX first. A URL typed by hand is
   passed through untouched.
   ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Choosing which part of a picture to use.
 *
 * Both places that take an image want a square: a character bio is a
 * circular portrait, and a sticker is drawn into a square cell so that
 * stickers of different proportions still line up in a line of text.
 * Before this, both simply centred the whole picture, which is the wrong
 * answer for most photographs — a face is rarely in the middle of the
 * frame — and there was no way to say otherwise.
 *
 * The selection is held in the IMAGE's own pixels, never the preview's.
 * The preview is whatever size the layout gives it, and it changes when
 * the window resizes; keeping the rectangle in source pixels means one
 * conversion at each edge (pointer in, crop out) instead of a scale
 * factor threaded through every drag, and it cannot drift.
 *
 * openCropper() resolves with a source rect, or null if the user cancels
 * or asks for the whole image — callers treat null as "no crop", which is
 * exactly the old behaviour, so nothing had to change downstream.
 * ------------------------------------------------------------------ */
const cropOverlay = document.getElementById('cropOverlay');
const cropStage = document.getElementById('cropStage');
const cropImage = document.getElementById('cropImage');
const cropFrame = document.getElementById('cropFrame');
let cropResolve = null;      // settles the open openCropper() promise
let cropNat = {w:0, h:0};    // the image's natural size
let cropSel = {x:0, y:0, s:0};  // selection, in natural pixels
const CROP_MIN = 24;         // in natural pixels

// The preview's on-screen box, and the scale from natural px to preview px.
function cropView(){
  const img = cropImage.getBoundingClientRect();
  const stage = cropStage.getBoundingClientRect();
  return {left: img.left - stage.left, top: img.top - stage.top,
          w: img.width, h: img.height,
          k: cropNat.w ? img.width / cropNat.w : 1};
}
function paintCropFrame(){
  const v = cropView();
  cropFrame.style.left   = (v.left + cropSel.x * v.k) + 'px';
  cropFrame.style.top    = (v.top  + cropSel.y * v.k) + 'px';
  cropFrame.style.width  = (cropSel.s * v.k) + 'px';
  cropFrame.style.height = (cropSel.s * v.k) + 'px';
}
function clampCropSel(){
  const maxS = Math.min(cropNat.w, cropNat.h);
  cropSel.s = Math.max(Math.min(CROP_MIN, maxS), Math.min(cropSel.s, maxS));
  cropSel.x = Math.max(0, Math.min(cropSel.x, cropNat.w - cropSel.s));
  cropSel.y = Math.max(0, Math.min(cropSel.y, cropNat.h - cropSel.s));
}
// Starts with the largest centred square — the old behaviour, so leaving
// the dialog untouched gives exactly the previous result.
function resetCropSel(){
  const s = Math.min(cropNat.w, cropNat.h);
  cropSel = {x:(cropNat.w - s)/2, y:(cropNat.h - s)/2, s};
  paintCropFrame();
}
function closeCropper(result){
  cropOverlay.classList.remove('open');
  const done = cropResolve; cropResolve = null;
  if(cropImage.src && cropImage.src.startsWith('blob:')) URL.revokeObjectURL(cropImage.src);
  if(done) done(result);
}
/* `shape` is 'circle' for a character bio and 'square' for a sticker.
   It changes only what the chooser DRAWS. The selection stays a square
   either way, because a bio's picture is stored square and clipped to a
   circle when the entry is rendered — so a circular selection would be
   the same rectangle with the corners thrown away twice. What the round
   frame buys is honesty: the user sees the part that will actually
   survive the clip, instead of picking a square and being surprised by
   which corners vanish. */
function openCropper(file, title, shape){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error(`"${file.name}" is not an image this browser can read.`)); };
    probe.onload = ()=>{
      cropNat = {w: probe.naturalWidth, h: probe.naturalHeight};
      cropImage.src = url;
      document.getElementById('cropTitle').textContent = title || 'Choose the part to use';
      cropFrame.classList.toggle('circle', shape === 'circle');
      document.getElementById('cropHint').textContent = shape === 'circle'
        ? 'Drag inside the circle to move it, or a corner to resize. Only what is inside the circle is kept.'
        : 'Drag inside the square to move it, or a corner to resize.';
      cropOverlay.classList.add('open');
      cropResolve = resolve;
      // The frame can only be placed once the preview has been laid out.
      requestAnimationFrame(()=> requestAnimationFrame(resetCropSel));
    };
    probe.src = url;
  });
}

/* Dragging. One pointer handler for both gestures: inside the frame moves
   it, a corner grip resizes it. Corners resize about the OPPOSITE corner,
   which is what makes a square selection feel like it is being pulled
   rather than sliding away from the pointer. */
{
  let mode = null, grip = null, startPt = null, startSel = null;
  const toNatural = ev=>{
    const v = cropView();
    const stage = cropStage.getBoundingClientRect();
    return {x: (ev.clientX - stage.left - v.left) / v.k,
            y: (ev.clientY - stage.top  - v.top ) / v.k};
  };
  cropFrame.addEventListener('pointerdown', ev=>{
    ev.preventDefault(); ev.stopPropagation();
    grip = ev.target && ev.target.dataset ? ev.target.dataset.grip : null;
    mode = grip ? 'resize' : 'move';
    startPt = toNatural(ev);
    startSel = Object.assign({}, cropSel);
    cropFrame.setPointerCapture(ev.pointerId);
  });
  cropFrame.addEventListener('pointermove', ev=>{
    if(!mode) return;
    const p = toNatural(ev);
    const dx = p.x - startPt.x, dy = p.y - startPt.y;
    if(mode === 'move'){
      cropSel.x = startSel.x + dx;
      cropSel.y = startSel.y + dy;
    } else {
      // The corner being dragged away from stays put; the square grows
      // toward the pointer by whichever axis moved further, so the shape
      // stays square without the pointer having to move diagonally.
      const west = grip === 'nw' || grip === 'sw';
      const north = grip === 'nw' || grip === 'ne';
      const anchorX = west ? startSel.x + startSel.s : startSel.x;
      const anchorY = north ? startSel.y + startSel.s : startSel.y;
      let s = Math.max(startSel.s + (west ? -dx : dx), startSel.s + (north ? -dy : dy));
      s = Math.max(CROP_MIN, s);
      // Never let a corner push the square off the picture.
      s = Math.min(s, west ? anchorX : cropNat.w - anchorX,
                      north ? anchorY : cropNat.h - anchorY);
      cropSel.s = s;
      cropSel.x = west ? anchorX - s : anchorX;
      cropSel.y = north ? anchorY - s : anchorY;
    }
    clampCropSel();
    paintCropFrame();
  });
  const end = ev=>{
    if(!mode) return;
    mode = null; grip = null;
    try{ cropFrame.releasePointerCapture(ev.pointerId); }catch(e){}
  };
  cropFrame.addEventListener('pointerup', end);
  cropFrame.addEventListener('pointercancel', end);
  window.addEventListener('resize', ()=>{ if(cropOverlay.classList.contains('open')) paintCropFrame(); });
}
document.getElementById('cropUse').onclick = ()=> closeCropper(Object.assign({}, cropSel));
document.getElementById('cropWhole').onclick = ()=> closeCropper(null);
document.getElementById('cropCancel').onclick = ()=> closeCropper('cancel');
document.getElementById('cropClose').onclick = ()=> closeCropper('cancel');
cropOverlay.addEventListener('click', ev=>{ if(ev.target === cropOverlay) closeCropper('cancel'); });
document.addEventListener('keydown', ev=>{
  if(ev.key === 'Escape' && cropOverlay.classList.contains('open')){
    ev.stopPropagation();
    closeCropper('cancel');
  }
}, true);

const BIO_IMAGE_MAX = 240;
const bioImageFile = document.getElementById('bioImageFile');
let bioImageTargetInput = null;

// `crop` is a rect in the source image's own pixels, or null for all of it.
function downscaleToDataURI(file, crop){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error('could not read that file.'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('that file is not an image this browser can read.'));
      img.onload = ()=>{
        const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
        const sw = crop ? crop.s : img.width, sh = crop ? crop.s : img.height;
        const scale = Math.min(1, BIO_IMAGE_MAX/Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw*scale));
        const h = Math.max(1, Math.round(sh*scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        // JPEG unless the source had transparency worth keeping.
        const type = /png|webp|gif/i.test(file.type) ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
bioImageFile.addEventListener('change', async ()=>{
  const file = bioImageFile.files && bioImageFile.files[0];
  bioImageFile.value = '';
  if(!file || !bioImageTargetInput) return;
  const target = bioImageTargetInput;
  try{
    /* This picker also feeds the free-standing Image element and a card's
       picture slot, which are rectangles — only a character bio is round,
       so the round frame is shown only when the entry actually is one.
       Both selects are reached by id at call time rather than captured:
       they are declared further down the file, and a `const` read before
       its declaration throws even through `typeof`. */
    const shapeSel = target && target.id === 'addNodeImage'
      ? document.getElementById('addNodeShape')
      : document.getElementById('editShapeInput');
    const roundTarget = !!shapeSel && shapeSel.value === 'ellipse';
    const crop = await openCropper(file, 'Choose the part of the picture to use',
                                   roundTarget ? 'circle' : 'square');
    if(crop === 'cancel') return;
    target.value = await downscaleToDataURI(file, crop);
    target.dispatchEvent(new Event('input', {bubbles:true}));
  }catch(err){
    setEditStatus('err', 'Portrait: ' + err.message);
  }
});
function wireImagePicker(pickBtnId, clearBtnId, inputId){
  const input = document.getElementById(inputId);
  document.getElementById(pickBtnId).onclick = (ev)=>{
    ev.stopPropagation();
    bioImageTargetInput = input;
    bioImageFile.click();
  };
  document.getElementById(clearBtnId).onclick = (ev)=>{
    ev.stopPropagation();
    input.value = '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
  };
}
wireImagePicker('editImagePick', 'editImageClear', 'editImageInput');
wireImagePicker('addNodeImagePick', 'addNodeImageClear', 'addNodeImage');

