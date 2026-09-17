function renderNodes(){
while(nodeDefs.firstChild) nodeDefs.removeChild(nodeDefs.firstChild);
while(nodeLayer.firstChild) nodeLayer.removeChild(nodeLayer.firstChild);
while(backLayer.firstChild) backLayer.removeChild(backLayer.firstChild);
while(frontLayer.firstChild) frontLayer.removeChild(frontLayer.firstChild);
while(fanLayer.firstChild) fanLayer.removeChild(fanLayer.firstChild);
while(auraLayer.firstChild) auraLayer.removeChild(auraLayer.firstChild);
/* Drawn in stacking order rather than in the order the entries happen to be
   listed, so "send to back" and "bring to front" mean something. Anything
   sent behind the connectors is drawn into a layer of its own that sits
   under the arrows — that's what makes a backdrop image work as a backdrop
   rather than as a lid over the whole chart. */
[...nodes.values()].sort((a,b)=> (a.z||0) - (b.z||0)).forEach(n=>{
  const shape = n.shape || 'rect';
  const isBio = shape==='ellipse';
  const isImage = shape==='image';
  const isTextbox = shape==='textbox';
  // A multiversal hub is an ordinary entry that something radiates out of,
  // drawn as the usual box with echo rings spreading from it. A local
  // multiverse is a stack of boxes — several near-identical worlds — with
  // only the front one belonging to the chart's geometry.
  /* Read off the entry's TAGS, not its shape. Free-standing elements — a
     picture, a bare line of text — are not entries and take no scenery. */
  /* A portrait takes none of it either. An echo spreading out of a face
     and a stack of near-identical worlds behind one are both saying
     something about a REALITY; on a character they say nothing, and the
     rectangles they are drawn as do not even follow the circle. */
  const isHub = !isFreeShape(shape) && !isBio && nodeHasTag(n, HUB_TAG);
  const isLocal = !isFreeShape(shape) && !isBio && nodeHasTag(n, LOCAL_TAG);
  const isAmalgam = shape==='amalgam';
  /* A comment card. Drawn by the default branch — a rounded box, one ring
     per colour — so its ports, its edge handles and everything a connector
     does with it are literally the same code. Only the stylesheet knows it
     is a callout, which is all the difference there should be. */
  const isCallout = shape==='callout';
  // Free-standing elements: they sit on the chart but are not part of its
  // lineage — no connector edges, no ports, no link badge, no language tabs.
  const isFree = isImage || isTextbox;
  // Only a boxed entry can be divided into bands.
  const isCard = !!n.card && !isBio && !isFree;
  /* Which of the six ways this entry's border is drawn, and whether that
     is the rippled one — the old pocket-reality edge, now a style any
     entry may wear. */
  const borderKey = borderStyleOf(n);
  const borderDash = (BORDER_STYLES[borderKey] || BORDER_STYLES.solid).dash;
  const isWavy = isWavyBorder(n);
  const z = n.z || 0;
  const g = el('g',{class:'node', 'data-id':n.id},
                 z < 0 ? backLayer : z > 0 ? frontLayer : nodeLayer);
  if(isBio) g.classList.add('node-bio');
  if(isCallout) g.classList.add('node-callout');
  if(isFree) g.classList.add('node-free');
  if(isImage) g.classList.add('node-image');
  if(isTextbox) g.classList.add('node-textbox');
  if(isCard) g.classList.add('node-card');
  const fontFamily = fontFamilyFor(n.font);
  /* A callout and a connector's plate are two forms of the same remark, so
     they are set the same: the plate's size, in the plate's face, wrapping
     at the plate's width. Left at an entry's own size a callout came out
     half again as large as the note beside it on the same connector, and
     the pair read as two different kinds of thing. */
  const isCalloutShape = (n.shape || '') === 'callout';
  const fontSize = (n.fontSize && n.fontSize>=6 && n.fontSize<=28) ? n.fontSize
                 : (isCalloutShape ? EDGE_NOTE_FS : NODE_FS);
  const fontScale = fontSize / NODE_FS;
  const lineH = LINE_H * fontScale;
  n.chipLeft = null; n.chipRight = null;
  let chipGroup = null;
  /* The chip row belongs to the SETTING, not to the tabs: switching
     multi-language on shows the default text's own chip straight away, so
     the row is visibly there to add tabs to rather than appearing out of
     nowhere with the second language. */
  const langTabList = (n.multiLang && Array.isArray(n.langTabs)) ? n.langTabs : [];
  const hasLangTabs = !!n.multiLang;
  const allTexts = hasLangTabs ? [n.label, ...langTabList.map(t=>t.text)] : [n.label];

  /* Size follows the text. A short label gets a small box and a long one a
     wide box, instead of every entry being stamped out at the same fixed
     width with empty space around most of them — which is both tidier and
     a lot less chart to draw. The width is the narrowest that keeps the
     longest of the node's texts within MAX_LINES lines, found by measuring
     rather than guessing, then clamped between MINW and MAXW; the height
     then follows from how that text actually wraps.

     opts.size overrules all of it: a node dragged by its corner keeps
     exactly the size it was given. */
  const manual = n.size;
  /* Whether this entry's text was written as one line.
   *
     If none of its texts carries a break the author typed, the box widens
     to hold the longest of them rather than folding it at a character
     count — see wrapLabel. A text with breaks in it is a small paragraph
     and keeps the wrapping it always had. */
  const noWrap = allTexts.every(t=> String(t == null ? '' : t).indexOf('\n') < 0);
  /* A portrait is a circle, so its two sides are one number: whichever of
     a hand-set width and height is smaller, which is what a corner drag
     naturally produces. */
  const bioSide = isBio
    ? (manual ? Math.max(BIO_MIN_SIZE, Math.round((manual.w + manual.h) / 2)) : BIO_SIZE)
    : 0;
  let w = isBio ? bioSide
        : isImage ? (manual ? manual.w : IMAGE_DEFAULT_W)
        // A loose text block is a caption, not a boxed entry: it wants to
        // run on one line and can be much wider than a chart node before
        // it wraps. Drag its corner to overrule that.
        : isTextbox ? (manual ? manual.w : autoNodeWidth(allTexts, fontSize, fontFamily, 1, TEXTBOX_MAXW))
        // A card needs room for a picture as well as words, so it starts
        // wider than a plain entry and is allowed to grow further.
        : isCard ? (manual ? manual.w : Math.max(CARD_MINW,
                      autoNodeWidth(allTexts, fontSize, fontFamily, 2, CARD_MAXW)))
        /* A one-line label starts at the widest a box may become and is
           then closed onto its own ink a few lines down, so it comes out
           exactly as wide as the words in it — or, past that width, stays
           at the ceiling with the text clipped at the border. */
        /* …and a callout wraps where the plate wraps, rather than running
           on to an entry's full width. */
        : isCalloutShape ? (manual ? manual.w
            : Math.min(EDGE_NOTE_MAXW, autoNodeWidth(allTexts, fontSize, fontFamily, 4, EDGE_NOTE_MAXW)))
        : (manual ? manual.w : noWrap ? NODE_LINE_MAXW : autoNodeWidth(allTexts, fontSize, fontFamily));
  // Re-centre in the layout slot, unless this node was placed by hand — a
  // hand-placed node's x IS the answer and must not drift.
  if(!n.pos && typeof n.slotX === 'number'){
    n.x = n.slotX + (n.slotW - w)/2;
  }
  n.w = w;
  const maxChars = noWrap ? Infinity : Math.max(8, Math.round((w - NODE_PAD_X*2) / (fontSize*0.55)));
  // Hard pixel ceiling for a line of this node's text, so no script's
  // glyph widths can push a label past the border (see wrapLabel's `fit`).
  const fit = { maxWidth: w - NODE_PAD_X*2, fontSize, family: fontFamily, noWrap };
  // Height is sized to fit the TALLEST of every text this node can show
  // (main label + every language tab) so switching tabs never needs a
  // relayout of the rest of the chart — only whichever text is showing
  // is re-centered within that fixed area.
  /* The ink every one of this entry's texts actually makes — the main
     label and every language tab, so switching tabs never resizes the box
     and re-lays the chart around it. Measured, not counted: see
     measureTextBlock. */
  const blocks = allTexts.map(t=>
    measureTextBlock(t, maxChars, lineH, fontScale,
                     {fontSize, family: fontFamily}, fit));
  const maxTotalH = Math.max(...blocks.map(bq=> bq.height));
  const maxInkW = Math.max(...blocks.map(bq=> bq.width));
  /* And the box closes on it.
   *
     The width above is the one the text was WRAPPED at — the narrowest
     that holds it in the allowed number of lines. The widest line it
     actually produced is usually narrower than that, and the difference
     was left as padding nobody chose. Shrinking to the ink cannot change
     the wrap, since every line already fits inside the widest of them. */
  if(!manual && !isBio && !isImage && !isCard && !isFree){
    /* An entry with nothing written in it makes no ink at all, so there is
       nothing to close on — and a one-line entry starts out at the widest
       a box may become, which is how an empty box came out three hundred
       pixels across. With no ink it takes the ordinary minimum instead,
       which is the size an empty box should be. */
    const want = maxInkW > 0 ? Math.ceil(maxInkW) + NODE_PAD_X*2 : NODE_MINW;
    n.w = w = Math.max(NODE_FIT_MINW, Math.min(w, want));
    if(!n.pos && typeof n.slotX === 'number') n.x = n.slotX + (n.slotW - w)/2;
  }
  /* Whether what is about to be drawn is wider than what will hold it.
     Only then is the text clipped — a clip path on every entry would cost
     the chart a few hundred of them for nothing, and would quietly shave
     the overhang off any glyph that legitimately leans past its advance. */
  const clipText = maxInkW > (w - NODE_PAD_X*2) + 0.5;
  // A bio circle is a fixed size that owes nothing to its text — the text
  // isn't drawn in it at all.
  /* A card's height is the three bands added up: the fixed picture, the
     heading as it wraps, and the note as it wraps at the smaller body size.
     With no note there is no third band and the card is simply shorter. */
  const cardBodyFS = fontSize * CARD_BODY_SCALE;
  const cardBodyScale = cardBodyFS / NODE_FS;
  const cardBodyLineH = LINE_H * cardBodyScale;
  const cardBody = isCard ? String(n.note || '').trim() : '';
  const cardBodyFit = { maxWidth: w - 14, fontSize: cardBodyFS, family: fontFamily };
  const cardBodyChars = Math.max(8, Math.round((w - 14) / (cardBodyFS*0.55)));
  const cardHeadH = isCard ? Math.max(22, CARD_PAD_Y + maxTotalH) : 0;
  const cardBodyH = cardBody
    ? CARD_PAD_Y + wrapAndMeasure(cardBody, cardBodyChars, cardBodyLineH, cardBodyScale, cardBodyFit).totalH
    : 0;

  const h = isBio ? bioSide
          : isImage ? (manual ? manual.h : IMAGE_DEFAULT_H)
          : isTextbox ? (manual ? manual.h : Math.max(16, Math.ceil(maxTotalH) + NODE_PAD_Y*2))
          : isCard ? (manual ? manual.h : CARD_IMG_H + cardHeadH + cardBodyH)
          : (manual ? manual.h : Math.max(NODE_FIT_MINH, Math.ceil(maxTotalH) + NODE_PAD_Y*2));
  n.h = h;
  /* A hand-placed entry grows about its MIDDLE, not downward from its top.
   *
   * The stored position is the entry's top-left, so a box that got taller —
   * one more line of text — kept its top and pushed its bottom down, moving
   * its centre with it. A connector meeting the middle of its side then
   * shifted too, and a line that had been laid out straight developed a jog
   * for no reason the reader could see.
   *
   * The position is therefore read as the top of a DEFAULT-height box, and
   * the real box is centred on that one. An entry at the default height is
   * unmoved, which is nearly all of them; a taller one spreads evenly
   * either side of where it was placed and its ports stay put. */
  /* The offset is RECORDED, because saving a dropped position has to undo
     it. opts.pos is the top of the default-height box; n.y is the top of
     the real one. A drag reads n.y and wrote it straight back as pos, so
     every drop shifted the entry up by this much again — and a resized
     entry, which takes no offset at all, was the one case that behaved.
     See saveNodePositions, which adds it back. */
  n.growShift = 0;
  if(n.pos && !manual && !isBio && !isImage){
    /* Quantised to whole grid steps.
     *
     * Half the extra height is almost never a round number — a
     * default-height entry is 41px tall, not 40 — so every entry on the
     * chart was drawn at some fraction of a step above where it was
     * placed, and each at a DIFFERENT fraction, since the offset follows
     * the entry's own height. The ruled grid was drawn at whole steps, as
     * it should be, and nothing on the chart lined up with it.
     *
     * Rounding the offset keeps the entry on the grid its position was
     * snapped to, and keeps growth centred to within half a step, which is
     * what the rule was for: an entry that gains a line spreads either
     * side of where it sits instead of dropping its bottom edge. An entry
     * placed off the grid on purpose (Ctrl) keeps its own offset — the
     * shift is rounded, not the position. */
    /* Only GROWTH is spread either side of the stored position. A box that
       came out shorter than the reference keeps its top-left where it was
       put — a negative offset would have slid every entry on every
       existing chart downward the day the boxes learned to hug their
       text. */
    n.growShift = snapToGrid(Math.max(0, h - NODE_GROW_REF) / 2);
    n.y = n.pos.y - n.growShift;
  }
  // Where the two rules across the card fall, once its height is settled.
  // Recorded on the node because the connector router reads it: see
  // portOnSide, which keeps side ports off the picture.
  const cardImgB = isCard ? n.y + (manual ? Math.min(CARD_IMG_H, h*0.5) : CARD_IMG_H) : 0;
  const cardHeadB = isCard
    ? (cardBody ? Math.min(h + n.y - 14, cardImgB + Math.max(22, h - (cardImgB - n.y) - cardBodyH)) : n.y + h)
    : 0;
  n.cardTop = isCard ? cardImgB - n.y : 0;

  /* The grounds are drawn in the ENTRY'S coordinates, not the chart's.
   *
   * Their rulings are userSpaceOnUse patterns, which are laid out from the
   * origin of whatever space the element stands in. In chart space that
   * origin is fixed, so the ruling was a grid painted on the chart that the
   * patch merely showed a window onto: while an entry was carried, the
   * patch travelled by transform and took the ruling with it, and on the
   * drop it was rebuilt at its new place over the chart's own grid — the
   * lines jumped to a different phase the moment the button came up. Drawn
   * inside a group translated to the entry, the ruling belongs to the
   * entry, and a carry and a drop show the same picture. */
  let groundHost = null;
  const groundAnchor = ()=> groundHost ||
    (groundHost = el('g', {class:'ground-anchor', 'data-ground': n.id,
                           transform:`translate(${n.x},${n.y})`}, fanLayer));
  // The weave for a fan-fiction entry, laid on the canvas under everything
  // else so the entry itself and its connectors stay perfectly crisp.
  if(!isFree && n.tags && n.tags.includes(FANFIC_TAG)){
    const box = {
      x: -FANFIC_HALO, y: -FANFIC_HALO,
      width: n.w + FANFIC_HALO*2, height: h + FANFIC_HALO*2,
      rx: FANFIC_HALO
    };
    el('rect', Object.assign({}, box, {
      class: 'fanfic-weave', 'data-id': n.id,
      fill: 'url(#fanfic-weave)', mask: 'url(#fanfic-mask)'
    }), groundAnchor());
    /* And a second copy of the same weave, drawn brighter and shown only
       where a band of light crosses it. It is invisible until the entry is
       under the pointer or open in the panel; then the band sweeps across,
       and the weave is momentarily more legible wherever the light is —
       see the fanfic-sweep animation. Kept as its own element rather than
       done to the weave itself, because the sweep is a MASK and the weave
       already wears one. */
    el('rect', Object.assign({}, box, {
      class: 'fanfic-glint', 'data-id': n.id,
      fill: 'url(#fanfic-weave-lit)'
    }), groundAnchor());
  }
  /* The ruled ground for an unreleased entry. The same patch and the same
     fade as the weave, so an entry carrying both tags stands on one piece
     of ground with two rulings on it rather than on two overlapping
     patches of different sizes. */
  if(!isFree && n.tags && n.tags.includes(UNRELEASED_TAG)){
    const box = {
      x: -FANFIC_HALO, y: -FANFIC_HALO,
      width: n.w + FANFIC_HALO*2, height: h + FANFIC_HALO*2,
      rx: FANFIC_HALO
    };
    el('rect', Object.assign({}, box, {
      class: 'unreleased-rule', 'data-id': n.id,
      fill: 'url(#unreleased-rule)', mask: 'url(#fanfic-mask)'
    }), groundAnchor());
    el('rect', Object.assign({}, box, {
      class: 'unreleased-glint', 'data-id': n.id,
      fill: 'url(#unreleased-rule-lit)'
    }), groundAnchor());
  }

  // Border: one ring per color in n.colors (an entry with more than one
  // manually-assigned color), or a single outline in the node's resolved
  // color — except for 'mirror' (fill = border color) and 'amalgam'
  // (gradient border), which always draw as a single outline regardless
  // of shape archetype.
  /* A hub and a local multiverse each have a second visual layer of their
     own — the echo rings, the stack behind — and a second and third border
     colour on top of that would be unreadable, so they take exactly one
     colour however many are set. */
  /* An amalgam joins its lineages into ONE bar meeting one port. A second
     border colour on it is a colour, not a second lineage channel, so it
     must not bring a second ring of ports with it — that offered a place
     to connect that the archetype cannot honour. Same reasoning as a hub's
     echo and a local multiverse's stack. */
  /* Two different questions, which used to share one answer.
   *
   * PAINT is every colour the entry carries: an amalgam's border and text
   * are a gradient across all of them, which is the whole point of the
   * archetype — the lineages that merged are visible in the entry itself.
   * PORTS are the rings you can pull a connector from, and there a hub, a
   * local multiverse and an amalgam take exactly one however many colours
   * they carry: each of those has a second visual layer of its own, and a
   * second ring of ports on top of it offers a place to connect that the
   * archetype cannot honour.
   *
   * Collapsing the two was what quietly took the gradient off every
   * amalgam on the chart. */
  /* An amalgam takes its colours from the LINEAGES that merged into it —
     the very colours its bar is tiled in — rather than from a list set on
     the entry. That is what the archetype means: the entry is what those
     lineages became, and reading its gradient tells you which they were.
     A colour of its own would be a second, contradictory answer to the
     same question, which is why the entry offers no colour field at all. */
  /* A callout with no colour of its own takes the CONNECTOR'S.
   *
   * It is a remark about that connector and it is tied to it by a leader
   * drawn in the connector's own paint — so a card drawn in the chart's
   * default ink, with its leader in the line's colour, was one object
   * painted two ways. Same rule the leader already follows: the border
   * the connector leaves from, or the colour set on the connector, or the
   * source entry's. */
  const paintColors = isAmalgam ? amalgamInheritedColors(n)
    : (n.colors && n.colors.length) ? n.colors
    : (isCallout ? [calloutInheritedColor(n) || n.color] : [n.color]);
  /* What the entry is FILLED with, as opposed to what it is outlined in.
   *
   * This used to be one thing an archetype decided for you: a "mirror
   * reality" was an entry filled with its own border colour, and that was
   * the only way any entry on the chart could be anything but white. Fill
   * is not a claim about what an entry is, though — it is a colour — so it
   * became a property, and a mirror reality is now what it always looked
   * like: an ordinary entry with a background. More than one colour makes
   * a gradient, exactly as an amalgam's border does.
   *
   * Kept in nodeDefs rather than the page's own defs, because a gradient
   * is created per entry per render and the shared defs are never cleared. */
  const bgPaint = (n.bg && n.bg.length)
    ? (n.bg.length > 1 ? makeGradient(n.bg, false, nodeDefs) : n.bg[0])
    : null;
  const bgFillStyle = bgPaint ? `fill:${bgPaint};` : '';
  /* One ring of the border, drawn in whatever style the entry wears.
     `make(inset)` gives the geometry for an outline that far inside the
     ring's own line, which is what a DOUBLE border needs a second of. */
  const borderRing = (tag, make, colour, fillStyle)=>{
    const a = Object.assign({}, make(0), {stroke: colour});
    if(fillStyle) a.style = fillStyle;
    if(borderDash) a['stroke-dasharray'] = borderDash;
    const first = el(tag, a, g);
    if(borderKey === 'double'){
      const b = Object.assign({}, make(BORDER_DOUBLE_GAP),
                              {stroke: colour, class: 'border-inner'});
      b.style = 'fill:none;';
      el(tag, b, g);
    }
    return first;
  };
  const ringColors = isAmalgam ? [paintColors[0]] : paintColors;
  /* An archetype's scenery — a hub's echo, a local multiverse's stack —
     belongs to the entry, not to the particular outline it wears, so it is
     drawn before the box and survives card layout. The OUTLINE is what card
     layout replaces: a card is a card whatever archetype it started as, and
     the archetype keeps only its colour and whatever it draws around
     itself. */
  if(isHub || isLocal){
    const c = ringColors[0];
    const aura = el('g', {class:'node-aura', 'data-id':n.id}, auraLayer);
    /* The scenery starts OUTSIDE whatever the entry itself is drawn with.
       As an archetype a hub was always a plain single-bordered box, so the
       echo could step straight out of n.x; as a tag it can sit on an entry
       already wearing three borders and a rippled edge, and stepping out
       of the box would have drawn the first echo straight through them. */
    const own = (ringCountOf(n) - 1) * ringStepFor(n)
              + (isWavy ? POCKET_LIFT : 0);
    if(isHub){
      /* Where every echo starts and where every echo ends — the same two
         places for all of them, so what goes out is one wave repeated
         rather than a small one, a bigger one and a bigger one again.
       *
         A ring is drawn at its own distance and has to be SCALED to cover
         that span, and the two axes need different factors: the margin is
         the same all round, but a box that is wider than it is tall is a
         smaller fraction wider for it. Four numbers per ring, written here
         because this is the only place that knows the geometry; the
         stylesheet reads them out of the keyframes. */
      const outer = own + HUB_ECHOES * HUB_ECHO_STEP;
      for(let i = HUB_ECHOES; i >= 1; i--){
        const grow = own + i * HUB_ECHO_STEP;
        const rw = n.w + grow*2, rh = h + grow*2;
        const sx0 = rw > 0 ? (n.w + own*2) / rw : 1;
        const sy0 = rh > 0 ? (h + own*2) / rh : 1;
        const sx1 = rw > 0 ? (n.w + outer*2) / rw : 1;
        const sy1 = rh > 0 ? (h + outer*2) / rh : 1;
        el('rect', {
          x: n.x - grow, y: n.y - grow,
          width: rw, height: rh,
          rx: 5 + grow, stroke: c, class: 'hub-echo',
          style: `fill:none;opacity:${(0.42 - (i-1)*0.12).toFixed(2)};` +
                 `stroke-width:${(1.5 - (i-1)*0.32).toFixed(2)};` +
                 `--echo-sx0:${sx0.toFixed(4)};--echo-sy0:${sy0.toFixed(4)};` +
                 `--echo-sx1:${sx1.toFixed(4)};--echo-sy1:${sy1.toFixed(4)};`
        }, aura);
      }
    }
    if(isLocal){
      /* A sheet is a COPY of the entry's own outline standing behind it,
         so on a pocket reality it has to be rippled like the outline it
         copies. Drawn as a plain rounded rectangle it read as a stack of
         ordinary boxes behind a wavy one — two different shapes claiming
         to be the same entry seen twice. Same width, same height, same
         corner radius, shifted; only the path differs. */
      /* Card layout replaces the outline with a card, rippled archetype or
         not, so the sheets go back to plain rectangles with it. */
      const sheetShape = (x, y)=> isWavy
        ? {tag:'path', attrs:{d: wavyRectPath(x, y, n.w, h, 0)}}
        : {tag:'rect', attrs:{x, y, width:n.w, height:h, rx:3}};
      /* A sheet is a COPY OF THE ENTRY'S OUTLINE, and an outline has a
         style. The ripple was carried across and nothing else was, so a
         dashed entry stood in front of a stack of solid rectangles and a
         double-bordered one in front of single-railed ones — three boxes
         that were meant to read as the same world seen three times, drawn
         three different ways. Every style is carried now: the dash
         pattern, and the second rail a double border is made of. */
      const sheetDash = (BORDER_STYLES[borderStyleOf(n)] || BORDER_STYLES.solid).dash;
      const sheetDouble = borderStyleOf(n) === 'double' && !n.card;
      for(let i = LOCAL_SHEETS; i >= 1; i--){
        const off = i * LOCAL_SHEET_STEP;
        const shp = sheetShape(n.x + own + off, n.y - own - off);
        if(sheetDouble){
          const inner = isWavy
            ? {tag:'path', attrs:{d: wavyRectPath(n.x + own + off + BORDER_DOUBLE_GAP,
                                                  n.y - own - off + BORDER_DOUBLE_GAP,
                                                  n.w - BORDER_DOUBLE_GAP*2,
                                                  h - BORDER_DOUBLE_GAP*2, 0)}}
            : {tag:'rect', attrs:{x: n.x + own + off + BORDER_DOUBLE_GAP,
                                  y: n.y - own - off + BORDER_DOUBLE_GAP,
                                  width: Math.max(0, n.w - BORDER_DOUBLE_GAP*2),
                                  height: Math.max(0, h - BORDER_DOUBLE_GAP*2),
                                  rx: Math.max(0, 3 - BORDER_DOUBLE_GAP)}};
          el(inner.tag, {
            ...inner.attrs,
            stroke: c, class: 'local-sheet', 'data-sheet': LOCAL_SHEETS - i,
            style: `fill:none;opacity:${(0.42 - (i-1)*0.12).toFixed(2)};` +
                   `stroke-width:${(1.5 - (i-1)*0.32).toFixed(2)};` +
                   `--sheet-off:${(own + off).toFixed(2)}px;` +
                   `--sheet-far:${(own + LOCAL_SHEETS * LOCAL_SHEET_STEP).toFixed(2)}px;`
          }, aura);
        }
        el(shp.tag, {
          ...shp.attrs,
          stroke: c, class: 'local-sheet', 'data-sheet': LOCAL_SHEETS - i,
          ...(sheetDash ? {'stroke-dasharray': sheetDash} : {}),
          /* Two numbers for the animation: its own distance from the box,
             which is where it stands and therefore where it must START
             (behind the entry, that far back); and the distance of the
             OUTERMOST sheet, which is where every one of them travels to.
           *
             Each used to travel only as far as its own place, so with the
             same duration the far sheet moved twice as fast as the near
             one and the two arrived unevenly — a sheet, a sheet, then a
             wait. Same span and the same time is the same speed, and a
             stagger of one turn divided by their number then puts an even
             gap between them. The far sheet's place is still the limit, so
             nothing travels past what the decoration is drawn as. */
          style: `fill:none;opacity:${(0.42 - (i-1)*0.12).toFixed(2)};` +
                 `stroke-width:${(1.5 - (i-1)*0.32).toFixed(2)};` +
                 `--sheet-off:${(own + off).toFixed(2)}px;` +
                 `--sheet-far:${(own + LOCAL_SHEETS * LOCAL_SHEET_STEP).toFixed(2)}px;`
        }, aura);
      }
    }
  }

  /* An entry's text is written in its own first border colour. A coloured
     border is how an entry says which line it belongs to, and its label
     saying it too is what makes a chart of a dozen colours readable at a
     glance; ink for everything turned every entry into the same entry.
     An entry with no colour of its own resolves to the default ink here
     anyway, so nothing changes for a plain one. */
  let textFill = paintColors[0] || 'var(--ink)';

  /* An invisible frame around the borders, drawn before everything else so
     nothing it covers is a control.
   *
     Hovering an entry is what wakes its edge handles — `.node-handles` are
     pointer-transparent until `.node:hover` — and until now the only thing
     that could BE hovered was the entry's own fill. The four strips you
     grab an edge by therefore woke up only once the pointer was already
     inside the box, which is fine for the left, right and bottom edges,
     because that is the direction you come from. It is not how anyone
     reaches the TOP edge: you come down from above, where the connector
     is, and cross nothing but empty ground until you are past the border
     and into the box — by which point you have gone straight through the
     strip you were aiming for. On an entry with extra borders it was
     worse, since the outer rings sit entirely outside the fill and the
     only live pixels on them were the hairline of the stroke itself: the
     rings you could see were not the rings you could grab, and the entry
     answered a hover by lighting ALL of its edges faintly and none of
     them firmly — the whole border, and no port.
   *
     So the region around the borders is made part of the entry. It is a
     frame rather than a filled box: the middle is already the fill's, and
     a pad reaching this far into a neighbour would be rude. */
  if(!isFree){
    const rings = Math.max(0, ringColors.length - 1) * ringStepFor(n);
    const outer = rings + BAND_HIT_DEFAULT/2
                + (isWavy ? POCKET_LIFT + 1 : 0);
    const inner = BAND_HIT_DEFAULT/2;
    const T = outer + inner, c = (outer - inner)/2;
    if(isBio){
      /* A portrait's pad is the SQUARE, filled, not a ring around the
         circle. Its ports stand at the sides of that square and its grips
         at the corners, and a pad shaped like the circle meant the pointer
         left the entry the moment it moved off the picture towards either
         of them — so the controls a reader was reaching for went out as
         the hand arrived. What is being resized is the box; the box is
         what answers the pointer. It is drawn first and painted with
         nothing, so it covers no line and hides no connector. */
      el('rect', {x:n.x - c, y:n.y - c, width:n.w + c*2, height:h + c*2, rx:5,
                  class:'node-hover-pad node-hover-solid'}, g);
    } else {
      el('rect', {x:n.x - c, y:n.y - c, width:n.w + c*2, height:h + c*2, rx:5,
                  class:'node-hover-pad', style:`stroke-width:${T.toFixed(2)};`}, g);
    }
  }

  if(isCard){
    /* Three bands inside one border. The picture is clipped to the card's
       own outline, so its top corners round with the box and it never
       overhangs; two hairlines rule off the heading and the body. There is
       no second border colour here — the rules already divide the card, and
       nested rings on top of them would be noise. */
    const c = ringColors[0];
    const clipId = defId('cardclip-', n.id);
    const clip = el('clipPath', {id:clipId}, nodeDefs);
    el('rect', {x:n.x, y:n.y, width:w, height:h, rx:5}, clip);
    // The card's own ground, under the three bands.
    el('rect', {x:n.x, y:n.y, width:w, height:h, rx:5,
                style:(bgFillStyle || 'fill:var(--panel);') + 'stroke:none;'}, g);

    if(n.image){
      const img = el('image', {
        x:n.x, y:n.y, width:w, height:cardImgB - n.y,
        'clip-path': `url(#${clipId})`,
        preserveAspectRatio: 'xMidYMid slice'
      }, g);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.image);
      img.setAttribute('href', n.image);
    } else {
      // An empty slot still reads as a slot, so a card without a picture
      // yet looks unfinished rather than broken.
      el('rect', {x:n.x, y:n.y, width:w, height:cardImgB - n.y,
                  'clip-path': `url(#${clipId})`, class:'card-slot'}, g);
      const midX = n.x + w/2, midY = n.y + (cardImgB - n.y)/2;
      el('path', {d:`M${midX-15},${midY+8} L${midX-4},${midY-3} L${midX+3},${midY+3} `+
                     `L${midX+9},${midY-2} L${midX+16},${midY+8} z`, class:'card-slot-mark'}, g);
      el('circle', {cx:midX-9, cy:midY-7, r:3, class:'card-slot-mark'}, g);
    }

    borderRing('rect', (i)=>({x:n.x+i, y:n.y+i, width:w-i*2, height:h-i*2, rx:Math.max(0,5-i)}),
               c, 'fill:none;');
    el('line', {x1:n.x, y1:cardImgB, x2:n.x+w, y2:cardImgB, stroke:c, class:'card-rule'}, g);
    if(cardBody){
      el('line', {x1:n.x, y1:cardHeadB, x2:n.x+w, y2:cardHeadB, stroke:c, class:'card-rule'}, g);
    }
  } else if(isImage){
    /* A picture with nothing around it: no box, no border, no words. It is
       a thing you place on the chart, not an entry in the continuity. */
    if(n.image){
      const img = el('image', {
        x:n.x, y:n.y, width:n.w, height:h,
        preserveAspectRatio: 'xMidYMid meet'
      }, g);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.image);
      img.setAttribute('href', n.image);
    } else {
      // An empty frame, so a picture you haven't chosen yet is still
      // something you can find, move and click.
      el('rect', {x:n.x, y:n.y, width:n.w, height:h, rx:4, class:'image-empty'}, g);
      el('path', {d:`M${n.x+n.w*0.2},${n.y+h*0.72} L${n.x+n.w*0.42},${n.y+h*0.44} `+
                     `L${n.x+n.w*0.58},${n.y+h*0.62} L${n.x+n.w*0.72},${n.y+h*0.48} `+
                     `L${n.x+n.w*0.86},${n.y+h*0.72} z`, class:'image-empty-mark'}, g);
      el('circle', {cx:n.x+n.w*0.3, cy:n.y+h*0.32, r:h*0.07, class:'image-empty-mark'}, g);
    }
  } else if(isTextbox){
    /* Words on the chart with no box around them — a caption, a heading, a
       margin note. The faint outline only shows on hover, so you can still
       grab it without it drawing a box you didn't ask for. */
    el('rect', {x:n.x, y:n.y, width:n.w, height:h, rx:3, class:'textbox-frame'}, g);
    if(n.colors && n.colors.length) textFill = n.colors[0];
  } else if(shape==='amalgam'){
    const paint = paintColors.length>1 ? makeGradient(paintColors, false, nodeDefs) : paintColors[0];
    // fill is set via inline style, not the plain attribute, because the
    // .node rect{fill:var(--panel)} stylesheet rule otherwise wins over it
    borderRing('rect', (i)=>({x:n.x+i, y:n.y+i, width:n.w-i*2, height:h-i*2, rx:Math.max(0,5-i)}),
               paint, bgFillStyle);
    textFill = paint;
  } else if(isBio){
    // A portrait clipped to the circle, with the ring drawn over its edge
    // so the border stays crisp. Without an image the circle is simply
    // empty — the chart still reads, it just has no face yet.
    const cx = n.x+n.w/2, cy = n.y+h/2, r = n.w/2;
    if(n.image){
      const clipId = defId('bioclip-', n.id);
      const clip = el('clipPath', {id:clipId}, nodeDefs);
      el('circle', {cx, cy, r:r-1}, clip);
      const img = el('image', {
        x: cx-r, y: cy-r, width: r*2, height: r*2,
        'clip-path': `url(#${clipId})`,
        preserveAspectRatio: 'xMidYMid slice'
      }, g);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.image);
      img.setAttribute('href', n.image);
    }
    /* Named. A portrait's border and the invisible pad that catches the
       pointer are both circles inside the same group, and the stylesheet
       could only tell them apart by ORDER — "the first circle is filled,
       the rest are not". The pad is added before the border, so the pad
       took the fill and the border lost it: a portrait with no picture in
       it had nothing under the pointer at all in its middle, and could
       not be picked up except by its two-pixel rim. */
    ringColors.forEach((c,i)=>{
      const grow = i*RING_STEP;
      borderRing('circle',
        (ins)=>({cx, cy, r: Math.max(0.5, r + grow - ins), class:'bio-ring'}),
        c, (i>0 || n.image) ? 'fill:none;' : bgFillStyle);
    });
    if(!n.image){
      /* A neutral silhouette so an empty portrait still reads as one — and
         drawn TO the circle rather than at a fixed size, so it stays
         inside it at every size the circle is dragged to. It used to be
         set for a fifty-pixel circle: the shoulders' own corners sat
         twenty-seven pixels from the middle of a twenty-five pixel
         radius, so they crossed the rim even before anything was
         resized. */
      const u = r / 25;                       // the size it was drawn for
      el('circle', {cx, cy: cy - 5.5*u, r: 7.6*u, class:'bio-placeholder',
                    style:`stroke-width:${(1.6*u).toFixed(2)};`}, g);
      el('path', {d:`M${(cx-13.2*u).toFixed(2)},${(cy+17.5*u).toFixed(2)} ` +
                    `a${(13.2*u).toFixed(2)},${(11.6*u).toFixed(2)} 0 0 1 ${(26.4*u).toFixed(2)},0`,
                  class:'bio-placeholder',
                  style:`stroke-width:${(1.6*u).toFixed(2)};`}, g);
    }
  } else if(isWavy){
    /* The rippled border — the old pocket-reality edge, now one of the six
       styles any entry may wear. Same box as the plain one, drawn with
       sine-wave sides. */
    ringColors.forEach((c,i)=>{
      const grow = i*POCKET_RING_STEP;
      borderRing('path',
        (ins)=>({d: wavyRectPath(n.x-grow+ins, n.y-grow+ins,
                                 n.w+grow*2-ins*2, h+grow*2-ins*2, grow)}),
        c, i>0 ? 'fill:none;' : (bgFillStyle || 'fill:var(--panel);'));
    });
  } else {
    ringColors.forEach((c,i)=>{
      const grow = i*RING_STEP;
      borderRing('rect',
        (ins)=>({x:n.x-grow+ins, y:n.y-grow+ins,
                 width:n.w+grow*2-ins*2, height:h+grow*2-ins*2,
                 rx:Math.max(0, 5+grow-ins)}),
        c, i>0 ? 'fill:none;' : bgFillStyle);
    });
  }

  /* And the words stay readable on whatever the entry is filled with.
   *
   * An entry writes its label in its own border colour, which is right on
   * white paper and can be invisible on anything else — most obviously on
   * a background set to that same colour, which is exactly what a "mirror
   * reality" was. Where the two are too close to tell apart the label
   * takes the plain contrasting ink instead, so the old archetype comes
   * out of the new properties looking exactly as it did. */
  if(!isFree) textFill = readableOn(textFill, (n.bg && n.bg.length) ? n.bg[0] : null);

  /* A rotated text block turns about its own centre. Only the drawing
     turns: the box the chart reasons with — for dragging, selecting and
     the marquee — stays upright, which keeps every other part of the page
     simple and is invisible at the angles a caption actually uses. */
  if(isTextbox && n.rot){
    g.dataset.rotTransform = `rotate(${n.rot},${(n.x+n.w/2).toFixed(2)},${(n.y+h/2).toFixed(2)})`;
    g.setAttribute('transform', g.dataset.rotTransform);
  }

  const centerX = n.x+n.w/2;
  // On a card the label is a heading in its own band, not a label centred
  // in the whole box.
  const textAreaCenterY = isCard ? (cardImgB + cardHeadB)/2 : n.y + h/2;
  // font-family must be an inline style, not a plain attribute — the
  // .node text{font-family:'IBM Plex Sans',...} stylesheet rule beats a
  // presentation attribute but loses to inline style.
  const txt = el('text',{x:centerX, y:0, 'font-size':fontSize, fill:textFill,
    style:`font-family:${fontFamily};`}, g);
  /* A line too long for its box is cut off at the border rather than run
     out over the chart. The window is the box less its own padding, so the
     text stops exactly where every other entry's text stops — and it is
     only built for the entries that actually overflow (see clipText). */
  if(clipText && !isBio && !isImage){
    const clipId = defId('textclip-', n.id);
    const clip = el('clipPath', {id: clipId}, nodeDefs);
    el('rect', {x: n.x + NODE_PAD_X/2, y: n.y, width: Math.max(1, n.w - NODE_PAD_X),
                height: h}, clip);
    txt.setAttribute('clip-path', `url(#${clipId})`);
  }
  const fontOpts = {fontSize, family:fontFamily};
  // A bio circle shows a portrait, not words: its text belongs to the card
  // that opens beside it when clicked, so nothing is drawn inside.
  if(isBio || isImage){ txt.remove(); }
  else {
    /* Centred on its INK, not on its line grid.
     *
       A line of type has more above its baseline than below it, and a
       reading over a word or a glyph set larger pulls the ink further off
       centre still. Centring the grid therefore left the words sitting
       high in the box by a couple of pixels — a gap at the bottom and none
       at the top, on every entry, which is exactly the uneven padding the
       borders were supposed to have stopped having. */
    const active = textForActive(n, activeLangTab.get(n.id));
    const mb = measureTextBlock(active, maxChars, lineH, fontScale, fontOpts, fit);
    renderNodeText(txt, active, textAreaCenterY - (mb.mid || 0),
                   centerX, maxChars, lineH, fontScale, fontOpts, fit);
  }

  // The card's body: the note, set smaller and quieter than the heading.
  if(isCard && cardBody){
    const bodyEl = el('text', {x:centerX, y:0, 'font-size':cardBodyFS,
      class:'card-body', style:`font-family:${fontFamily};`}, g);
    renderNodeText(bodyEl, cardBody, (cardHeadB + n.y + h)/2, centerX,
                   cardBodyChars, cardBodyLineH, cardBodyScale,
                   {fontSize:cardBodyFS, family:fontFamily}, cardBodyFit);
  }

  if(hasLangTabs && !isBio && !isFree){
    // Tiny clickable "symbol" chips — one for the default/main text ("•")
    // plus one per language tab, using that tab's own short tag as its
    // symbol — tucked into the node's top-left corner, the same
    // corner-badge treatment as the n.link icon at top-right. Clicking one
    // is a purely live, in-canvas swap: it updates the ephemeral
    // activeLangTab map and re-renders just this node's <text>, never the
    // saved data and never the surrounding layout.
    /* The active chip is drawn at full size and the rest a little smaller,
       so which one is showing reads from the shape alone — the colour is
       then a reinforcement rather than the only signal. */
    const CHIP_H = 11, CHIP_GAP = 3, CHIP_FS = 6.3, CHIP_PAD = 4;
    const CHIP_IDLE = 0.82;             // how much smaller an unselected chip is
    const CHIP_R = 2.5;                 // rounded rectangle, not a pill
    const activeIdxNow = activeLangTab.get(n.id) ?? null;
    /* The default text's chip is the US flag rather than a filled dot.
       A dot said nothing about what it switched to, and an orange fill was
       already doing the job of marking which chip is ACTIVE — so the two
       collided, and the default chip looked permanently selected. A flag
       names the language the way every other chip does. */
    const chipLabels = [DEFAULT_LANG_CHIP, ...langTabList.map(t=>t.tag)];
    // On a card they belong to the heading they switch, so they sit on the
    // rule above it rather than at the top of the whole card.
    const chipY = isCard ? cardImgB : n.y;
    let cursorX = n.x + 3;
    // One group, so the whole row can be raised above the edge handles.
    chipGroup = el('g', {class:'lang-chips'}, g);
    chipLabels.forEach((lbl, idx)=>{
      const tabIdx = idx===0 ? null : idx-1;
      const isActive = tabIdx === activeIdxNow;
      const k = isActive ? 1 : CHIP_IDLE;
      const fs = CHIP_FS * k, hh = CHIP_H * k;
      const textW = measureText(lbl, {fontSize:fs, family: lbl === DEFAULT_LANG_CHIP ? EMOJI_FAMILY : undefined});
      const chipW = Math.max(hh, textW + CHIP_PAD*k*2);
      const cx = cursorX + chipW/2;
      const chipG = el('g', {class:'lang-chip' + (isActive ? ' active' : ''),
                             transform:`translate(${cx},${chipY})`}, chipGroup);
      el('rect', {x:-chipW/2, y:-hh/2, width:chipW, height:hh, rx:CHIP_R,
                  class:'lang-chip-bg'}, chipG);
      const chipLabelEl = el('text', {x:0, y:2.1*k, 'text-anchor':'middle', 'font-size':fs,
                                      class:'lang-chip-label' + (lbl === DEFAULT_LANG_CHIP ? ' emoji' : '')}, chipG);
      chipLabelEl.textContent = lbl;
      el('title',{},chipG).textContent = idx===0 ? 'Show the default text' : `Show the "${lbl}" text`;
      chipG.addEventListener('click', ev=>{
        ev.stopPropagation();
        activeLangTab.set(n.id, tabIdx);
        /* The chips change SIZE with the selection, so switching has to
           re-lay them out — toggling a class is no longer enough. */
        renderNodes();
      });
      cursorX += chipW + CHIP_GAP;
    });
    // How far the chips reach along the top edge — reported for the panel
    // and the tests; the edge itself no longer gives up any of its strip
    // for them, since they are drawn over it (see sideBandRect).
    if(chipY === n.y){ n.chipLeft = n.x + 3; n.chipRight = cursorX; }
  }

  /* Corner grips: drag one to give this box a size of its own, overruling
     the text-fitted one. A portrait has them too — it has no text to fit,
     but it has a picture, and how big that picture stands on the chart is
     as much a decision as how big a box is.

     All four corners, not just the bottom-right. A box is resized from
     whichever corner is nearest the hand, and the OPPOSITE corner is what
     stays still — grabbing the top-left and pulling up should grow the box
     upward, the way it does in every drawing program, rather than moving
     the whole entry and resizing it away from the pointer.

     But two of the corners are already spoken for on some entries. The
     link badge sits on the top-right of a plain entry and on the top-left
     of a card; the language chips run along the top edge from the left.
     A grip underneath one of those is a grip the reader cannot hit and,
     worse, one that steals the click from the thing they were aiming at —
     so a covered corner simply has no grip, and its neighbours still do. */
  {
    const linkTopRight = !!(n.link && safeUrl(n.link) && !isFree && !isCard);
    const linkTopLeft  = !!(n.link && safeUrl(n.link) && !isFree && isCard);
    /* How far along the top edge the language chips actually run, or
       nothing when there are none.
     *
       This used to be read as "0 when there are none", and 0 is a
       perfectly good chart coordinate: every entry sitting at a negative x
       — which on this chart is most of the left-hand side — compared its
       own left edge against a reach of zero, decided the chips covered it,
       and quietly lost its top-left grip. A row of chips that does not
       exist reaches nowhere, and `null` is how you say that. */
    const chipL = (typeof n.chipLeft === 'number') ? n.chipLeft : null;
    const chipR = (typeof n.chipRight === 'number' && n.chipRight > (n.chipLeft ?? 0))
      ? n.chipRight : null;
    /* And a corner is only given up where something is genuinely ON it.
       The grip is a small square tucked inside the corner, so the test is
       whether the chip row overlaps THAT square — not whether it starts
       anywhere near the edge. A single chip no longer costs an entry a
       grip at the other end of a two-hundred-pixel box. */
    const GRIP = 10;
    const chipsOver = (cornerX)=>{
      if(chipL === null || chipR === null) return false;
      const gx0 = Math.min(cornerX, cornerX + (cornerX === n.x ? GRIP : -GRIP));
      const gx1 = gx0 + GRIP;
      return chipR > gx0 && chipL < gx1;
    };
    const CORNERS = [
      {key:'se', sx: 1, sy: 1, x: n.x + w, y: n.y + h, blocked:false},
      {key:'sw', sx:-1, sy: 1, x: n.x,     y: n.y + h, blocked:false},
      {key:'ne', sx: 1, sy:-1, x: n.x + w, y: n.y,
       blocked: linkTopRight || chipsOver(n.x + w)},
      {key:'nw', sx:-1, sy:-1, x: n.x,     y: n.y,
       blocked: linkTopLeft || chipsOver(n.x)}
    ];
    /* A portrait's grips sit on the corners of the SQUARE it is inscribed
       in, like every other entry's.
     *
       0.9.16 moved them onto the rim, at the four diagonals, because the
       grips are only live while the entry is hovered and what answered the
       pointer for a portrait was the circle: reaching out to a corner let
       go of the hover that was showing the grip. That solved the symptom
       and moved the controls somewhere they do not belong — the square is
       what is being resized, its corners are where the ports already are,
       and a grip on the rim is a grip on a curve with no corner to pull.
       The cause is fixed instead: the pad below answers the pointer for
       the whole square, so the ports and the grips stay up as long as the
       pointer is anywhere inside the box, and only go when it leaves it. */
    CORNERS.forEach(c=>{
      if(c.blocked) return;
      const grip = el('g', {class:'node-resize node-resize-' + c.key,
        'data-corner': c.key,
        transform:`translate(${c.x},${c.y}) scale(${c.sx},${c.sy})`}, g);
      /* The strip you can grab is the mark you can see, plus a hair. It used
         to reach two pixels PAST the corner and three inside the box, so the
         pointer became a resize handle over ground where nothing was drawn —
         and picking the entry up by its bottom-right corner resized it. */
      el('rect', {x:-9.5, y:-9.5, width:10, height:10, class:'node-resize-hit'}, grip);
      el('path', {d:'M-8,-1 L-1,-8 M-4,-1 L-1,-4', class:'node-resize-mark'}, grip);
      el('title',{},grip).textContent = 'Drag to resize; double-click to fit the text again';
      grip.addEventListener('mousedown', ev=> beginNodeResize(ev, n, g, c));
      grip.addEventListener('click', ev=> ev.stopPropagation());
      grip.addEventListener('dblclick', ev=>{
        ev.stopPropagation();
        if(readOnlyView) return;
        applyEdit(()=>{
          const found = workingEntry(n.id);
          if(!found) return;
          const opts = entryOpts(found.entry);
          delete opts.size;
          putEntry(found.index, found.entry, opts);
        });
      });
    });
    /* And a caption gets one more handle: the round arrow that turns it.
       Only a caption — an entry belongs to a chart that reads left to
       right, and a picture turned on its side is a thing to crop rather
       than to spin. It stands off the top-left corner, where a corner grip
       would be, so the two read as one family of handles. */
    if(isTextbox){
      const rx = n.x - 4, ry = n.y - 4;
      const rot = el('g', {class:'node-rotate', transform:`translate(${rx},${ry})`}, g);
      el('circle', {cx:-5, cy:-5, r:8, class:'node-rotate-hit'}, rot);
      /* Three quarters of a circle with a head on it — the mark every
         drawing program uses, so nobody has to be told what it is. */
      el('path', {d:'M-9.5,-3 A5,5 0 1 1 -3,-1.2', class:'node-rotate-mark'}, rot);
      el('path', {d:'M-1.2,-4.2 L-2.4,0.2 L-6,-1.6 Z', class:'node-rotate-head'}, rot);
      el('title',{},rot).textContent =
        'Drag to turn; hold Shift for eighths of a turn; double-click to put it back level';
      rot.addEventListener('mousedown', ev=> beginNodeRotate(ev, n, g));
      rot.addEventListener('click', ev=> ev.stopPropagation());
      rot.addEventListener('dblclick', ev=>{
        ev.stopPropagation(); ev.preventDefault();
        if(readOnlyView) return;
        applyEdit(()=>{
          const found = workingEntry(n.id);
          if(!found) return;
          const opts = entryOpts(found.entry);
          delete opts.rot;
          putEntry(found.index, found.entry, opts);
        });
      });
    }
  }

  if(n.link && safeUrl(n.link) && !isFree){
    // A real SVG <a> (not a JS window.open() call) — the artifact host
    // renders this page inside a sandboxed iframe, which silently blocks
    // script-initiated window.open() but allows a genuine user-clicked
    // hyperlink through, so the link only works reliably as one.
    const linkWrap = el('a', {href:safeUrl(n.link), target:'_blank', rel:'noopener'}, g);
    // A plain entry wears the badge at its top-right corner; a card wears
    // it at the top-left of its picture, where it reads as belonging to the
    // picture rather than hovering over the heading.
    const lg = el('g',{class:'node-link',
      transform: isCard ? `translate(${n.x+9},${n.y+9})` : `translate(${n.x+n.w},${n.y})`}, linkWrap);
    el('circle',{r:7, cx:0, cy:0}, lg);
    el('path',{d:'M-2.4,2.4 L2.4,-2.4 M-0.8,-2.4 L2.4,-2.4 L2.4,0.8', fill:'none'}, lg);
    el('title',{},lg).textContent = 'Open linked page ↗';
    linkWrap.addEventListener('click', ev=>{ ev.stopPropagation(); });
  }

  // Grab a SIDE, not a point: hovering a node lights up whichever edge the
  // pointer is nearest, and dragging from it draws a connector out of that
  // edge. Ports along the edge are worked out by the router, so there is
  // nothing to aim at — the whole edge is the target.
  //
  // A node with more than one border color has one band per ring, each
  // grabbable in its own right: pull from the black ring and the connector
  // comes out black, from the grey ring and it comes out grey. That's what
  // makes a two-colour node able to carry two differently-coloured
  // lineages without them being confused for one.
  const handles = isFree ? null : el('g', {class:'node-handles'}, g);
  /* The side a callout's own leader arrives at is not a side you can
     connect to. Something is already attached there — the line back to the
     place on the connector this card is talking about — and a second line
     landing on the same edge reads as one line passing through the card.
     The other three sides behave exactly as any entry's do. */
  const takenSide = isCallout ? calloutLeaderSide(n) : null;
  if(!isFree) SIDES.forEach(side=>{
    if(side === takenSide) return;
    // Innermost ring first, so where two hit strips still graze each other
    // the inner one is the one on top and stays reachable.
    ringColors.map((c,i)=>[c,i]).reverse().forEach(([ringColor, ring])=>{
      // Rings step outward, so ring 1 sits OUTSIDE the box — a negative
      // inset is what sideBandRect wants for that.
      const inset = -ring*ringStepFor(n);
      /* A rippled border is not a line but a band a whole ripple deep, so
         the strip you grab it by has to be that deep too — a 5px strip on
         the baseline missed every crest, and the border you could see was
         mostly not the border you could grab. */
      const band = sideBandRect(n, h, side, inset,
                                isWavy
                                  ? Math.max(BAND_HIT_DEFAULT, POCKET_LIFT*2 + 2)
                                  : BAND_HIT_DEFAULT);
      const hg = el('g', {class:'node-handle', 'data-side':side,
                          'data-ring':ring, 'data-id':n.id}, handles);
      // A wide invisible strip catches the pointer; the visible highlight
      // is the thinner one drawn on the border itself.
      el('rect', Object.assign({class:'node-handle-hit'}, band.hit), hg);
      if(isWavy){
        const grow = ring*POCKET_RING_STEP;
        el('path', {class:'node-handle-band wave',
                    d: wavySideOpenPath(n.x-grow, n.y-grow, n.w+grow*2, h+grow*2, side, grow),
                    style:`fill:none;stroke:${ringColor};stroke-width:${BAND_W};`}, hg);
      } else {
        el('rect', Object.assign({class:'node-handle-band', style:`fill:${ringColor};`}, band.show), hg);
      }
      el('title',{},hg).textContent = ringColors.length > 1
        ? `Drag from this ${side} edge (${ringColor}) to connect`
        : `Drag from the ${side} edge to connect`;
      hg.addEventListener('mousedown', ev=> beginConnectorDrag(ev, n, side, ring, ringColor));
      hg.addEventListener('click', ev=> ev.stopPropagation());
    });
  });

  /* The chips are built before the connector handles, so they would sit
     under them. Moving them to the end puts them back on top: the edge's
     highlight sweeps behind the chips, and the chips stay clickable. */
  if(chipGroup && chipGroup.parentNode === g) g.appendChild(chipGroup);

  /* A tag that DOES something to its entry says so when you look at the
     entry. The decorations are still, and still is right for a chart being
     read — a page of things quietly moving is a page nobody can read — but
     under the pointer, and while the entry is open in the panel, each one
     performs what it means: the hub's echo goes out, the weave catches the
     light, the stack streams away. Hover and open are the same gesture in
     two speeds, so both drive it; see syncTagLiveliness, which is what
     reaches the decorations, since they live in layers of their own and no
     stylesheet can reach a sibling three parents away. */
  g.addEventListener('mouseenter', ()=>{ hoverLivelyId = n.id; syncTagLiveliness(); });
  g.addEventListener('mouseleave', ()=>{
    if(hoverLivelyId === n.id){ hoverLivelyId = null; syncTagLiveliness(); }
  });
  g.addEventListener('mousedown', ev=> beginNodeDrag(ev, n, g));
  g.addEventListener('click',(ev)=>{
    ev.stopPropagation();
    // A drag that actually moved the node ends with a click event too —
    // swallow that one so letting go of a node doesn't also re-select it.
    if(suppressNodeClick){ suppressNodeClick = false; return; }
    // Ctrl/Cmd-click adds to or removes from the selection instead of
    // replacing it.
    if(ev.ctrlKey || ev.metaKey){ toggleInSelection(n.id); return; }
    /* Selecting is immediate — that is what the entry looks like being
       pressed. Opening a PANEL waits to see whether a second click is
       coming: a double click means "edit this", and the panel the first
       click would have opened flashed up and was replaced a moment later,
       which read as the wrong menu opening by mistake. */
    /* A callout is not opened in the entry panel. It has no lineage, no
       archetype, no tags and no note — the whole of it is the words on the
       card — so the panel that would open is a form about a thing that
       does not exist. It gets a card of its own instead, and opens at
       once: there is no second click to wait for, because the only other
       gesture on a callout is carrying it. */
    /* One click picks it up, two open it — the same pair of gestures every
       other entry answers to. Opening the card on the first click meant a
       reader could not simply select a callout to move or delete it
       without a form appearing over the drawing each time. */
    if(isCallout){
      selectNode(n.id, {quiet:true});
      paintMultiSelection();
      /* The card that used to hold a copy of the words now holds only the
         Delete, so it is no longer a form appearing over the drawing and
         can come up on a single click again — which is what puts a
         callout's one remaining control back within reach, now that a
         double click is how its words are opened. */
      openCalloutPopover(n.id, ev, {focus:false});
      return;
    }
    selectNode(n.id);
    paintMultiSelection();
    clearTimeout(nodeClickTimer);
    const wantsBio = isBio, wantsFree = isFree, evForMenu = ev;
    nodeClickTimer = setTimeout(()=>{
      nodeClickTimer = null;
      if(wantsBio) openBioCard(n.id, true); else closeBioCard();
      if(wantsFree) openFreeMenu(n.id, evForMenu); else closeFreeMenu();
    }, DOUBLE_CLICK_GRACE);
  });
  /* Double-click is the shortcut everyone tries first: it skips the
     select-then-find-the-pencil dance and drops the cursor straight into
     this entry's text, with the box itself updating as you type. */
  g.addEventListener('dblclick', (ev)=>{
    ev.stopPropagation(); ev.preventDefault();
    // The pending single-click panel never happens: this was a double.
    clearTimeout(nodeClickTimer); nodeClickTimer = null;
    if(document.body.classList.contains('read-only')) return;
    /* A free-standing element is edited in its OWN card, not in the
       entry drawer.
     *
       Double-clicking a loose caption used to open the drawer's entry
       form and put the cursor in its Label — a form about lineage,
       archetype, colours and tags, none of which a caption has, and which
       still showed the last ENTRY that was open in it. A caption's text
       lives in the free card, so that is what a double click opens, with
       the cursor in the words. A picture has no text at all, so for one
       the card opens on its file picker. */
    if(isFree){
      selectNode(n.id); paintMultiSelection();
      /* A caption's words are written ON the caption now, like every other
         piece of text on the chart. Its card is still one click away and
         still holds everything else a caption has — the face, the size,
         the angle, the colour, the Delete — but the box that held a second
         copy of the words is gone from it. A picture has no words at all,
         so a double click on one opens its card at the file picker. */
      if(!isImage && openNodeEditor(n.id)) return;
      openFreeMenu(n.id, ev);
      return;
    }
    /* A callout is an entry, and its words are on the card it is drawn as
       — so they are written there, not in a panel beside it. */
    if(isCallout){
      closeCalloutPopover();
      if(openNodeEditor(n.id)) return;
    }
    /* A portrait holds a PICTURE, not words. Its words are on the card
       beside it, and that is where a double click on the card opens them;
       a double click on the circle is a double click on an image, and what
       a reader wants from an image is the settings — the file, the crop,
       the size, the side its card hangs on. */
    if(isBio){ openEntrySettings(n.id); return; }
    /* Everywhere else: on the entry itself, where the words are. The
       settings are the fallback for the one archetype that has no words to
       write — a picture — and for a reader who cannot write at all. */
    if(openNodeEditor(n.id)) return;
    openEntrySettings(n.id);
  });
  if(isBio){
    // The card is a reading aid, so it appears on hover — clicking is only
    // needed when you want it to stay while you work elsewhere.
    g.addEventListener('mouseenter', ()=>{
      if(bioCardPinned) return;
      if(!bioHoverWanted(n.id)) return;
      openBioCard(n.id);
    });
    g.addEventListener('mouseleave', ()=>{
      if(bioCardPinned || bioCardNodeId !== n.id) return;
      // A short grace period so crossing the gap to the card doesn't
      // flicker it away.
      bioHoverTimer = setTimeout(()=>{ if(!bioCardPinned) closeBioCard(); }, 160);
    });
    g.addEventListener('mouseenter', ()=> clearTimeout(bioHoverTimer));
  }
  g.addEventListener('mouseenter',()=>g.classList.add('hover'));
  g.addEventListener('mouseleave',()=>g.classList.remove('hover'));
});
}
renderNodes();

// draw edge paths now that node heights are known. Style (routing + line
// pattern) is per-edge via edgeStyleFor(from,to) — see EDGE_STYLES above.
// Each visible path gets an invisible wider "hit" path layered with it so
// clicking anywhere near the line (not just exactly on a thin stroke) opens
// that edge's style popover. redrawEdges() is also called by the popover to
// live-preview a change without touching node layout.
