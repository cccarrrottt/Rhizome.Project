/* ---------------------------------------------------------------------
   Add node — a small form that appends a new node to the live NODES
   data (optionally connected from an existing node) and publishes the
   result.
   ------------------------------------------------------------------ */
const addNodeOverlay = document.getElementById('addNodeOverlay');
const addNodeLabel = document.getElementById('addNodeLabel');
const addNodeTags = document.getElementById('addNodeTags');
const addNodeShapeSel = document.getElementById('addNodeShape');
const addNodeFontSel = document.getElementById('addNodeFont');
const addNodeFontSizeInput = document.getElementById('addNodeFontSize');
const addNodeColors = document.getElementById('addNodeColors');
const addNodeBg = document.getElementById('addNodeBg');
const addNodeBorderStyle = makeChoiceGroup('addNodeBorderStyle');
/* ---------------------------------------------------------------------
   Choosing an archetype by its picture.
 *
 * Five archetypes is a short enough set to show whole, and every one of
 * them is a SHAPE — which is the one thing a drop-down of words cannot
 * say. "Amalgam reality (gradient border & text)" is a sentence about a
 * thing you would recognise instantly if you were shown it. So the add
 * form shows them: a plain box, a portrait circle, a box with two lineages
 * merging into its top edge, a box with a T in it, a box with a picture in
 * it. Each button draws the archetype itself, at a size where its
 * silhouette is what you read.
 *
 * The <select> stays, hidden, because it is the value the rest of the form
 * — the image field, the label lock, the commit — already reads, and there
 * is no reason for any of that to learn a second way of being asked.
   ------------------------------------------------------------------ */
const NODE_STYLE_PICKS = [
  {value:'rect',    label:'Default',       hint:'An ordinary entry: a rounded box with its name in it.'},
  {value:'ellipse', label:'Character bio', hint:'A portrait circle, with its words on a card beside it.'},
  {value:'amalgam', label:'Amalgam',       hint:'A reality made of others: its lineages merge into one bar and one arrow.'},
  {value:'textbox', label:'Text field',    hint:'A loose line of text on the chart — no connections.'},
  {value:'image',   label:'Image',         hint:'A picture placed on the chart — no connections.'}
];
function nodeStyleIcon(kind){
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 40 30');
  svg.setAttribute('class', 'node-style-icon');
  const add = (tag, attrs)=>{
    const e = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([k,v])=> e.setAttribute(k, v));
    svg.appendChild(e);
    return e;
  };
  const box = (y, h)=> add('rect', {x:6, y, width:28, height:h, rx:3, class:'nsi-box'});
  if(kind === 'rect'){
    box(8, 14);
  } else if(kind === 'ellipse'){
    add('circle', {cx:20, cy:15, r:10, class:'nsi-box'});
    add('circle', {cx:20, cy:12, r:3.1, class:'nsi-mark'});
    add('path', {d:'M14.4,22.6 a5.6,5 0 0 1 11.2,0', class:'nsi-mark'});
  } else if(kind === 'amalgam'){
    // Two lineages coming down onto one bar, and one arrow out of it.
    add('path', {d:'M11,3 V7 H29 V3', class:'nsi-line'});
    add('path', {d:'M20,7 V12', class:'nsi-line'});
    add('path', {d:'M17,10 L20,13.4 L23,10 Z', class:'nsi-fill'});
    box(14, 12);
  } else if(kind === 'textbox'){
    box(8, 14);
    add('path', {d:'M15,12 H25 M20,12 V19', class:'nsi-mark'});
  } else {
    box(8, 14);
    add('path', {d:'M9,20 L15,14 L19,17.5 L23,13.5 L31,20 Z', class:'nsi-fill-soft'});
    add('circle', {cx:14, cy:12, r:1.9, class:'nsi-fill-soft'});
  }
  return svg;
}
let paintAddShapePick = null;
{
  const host = document.getElementById('addNodeShapePick');
  if(host && addNodeShapeSel){
    NODE_STYLE_PICKS.forEach(p=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'node-style-btn';
      b.dataset.value = p.value;
      b.title = p.label + ' — ' + p.hint;
      b.appendChild(nodeStyleIcon(p.value));
      const cap = document.createElement('span');
      cap.className = 'node-style-cap';
      cap.textContent = p.label;
      b.appendChild(cap);
      b.addEventListener('click', ev=>{
        ev.stopPropagation();
        addNodeShapeSel.value = p.value;
        addNodeShapeSel.dispatchEvent(new Event('change', {bubbles:true}));
        paintAddShapePick();
      });
      host.appendChild(b);
    });
    paintAddShapePick = ()=>{
      const v = addNodeShapeSel.value || 'rect';
      host.querySelectorAll('.node-style-btn').forEach(b=>
        b.classList.toggle('on', b.dataset.value === v));
    };
    paintAddShapePick();
  }
}
const addNodeStatusEl = document.getElementById('addNodeStatus');
function setAddNodeStatus(kind, msg){ addNodeStatusEl.className = 'editor-status show ' + kind; addNodeStatusEl.textContent = msg; }
function clearAddNodeStatus(){ addNodeStatusEl.className = 'editor-status'; addNodeStatusEl.textContent = ''; }

/* The new-entry form is a popover, not a modal: it sits over one corner of
   the chart with no backdrop, so the map stays visible and navigable while
   it is open. It also carries only what you need to make an entry —
   connections, notes, links and language tabs are all things you set on an
   entry that already exists, and having them here made the form long
   enough to hide the chart it was adding to. */
document.getElementById('addNodeToggle').onclick = ()=>{
  closeToolbarMenus('addNodeOverlay');
  setRichValue(addNodeLabel, '');
  addNodeColors.value=''; addNodeTags.value='';
  if(paintAddSwatches) paintAddSwatches();
  addNodeBg.value = '';
  addNodeBorderStyle.value = 'solid';
  addNodeShapeSel.value = 'rect';
  if(typeof paintAddShapePick === 'function') paintAddShapePick();
  addNodeImageInput.value = '';
  syncImageFieldVisibility(addNodeShapeSel, addNodeImageField);
  populateFontOptions(addNodeFontSel);
  addNodeFontSel.value = FONT_OPTIONS[0].key;
  addNodeFontSizeInput.value = '';
  clearAddNodeStatus();
  addNodeOverlay.classList.add('open');
  const surface = richFields.get('addNodeLabel');
  if(surface) surface.surface.focus({preventScroll:true});
};
document.getElementById('addNodeCancel').onclick = ()=> addNodeOverlay.classList.remove('open');
document.getElementById('addNodeClose').onclick = ()=> addNodeOverlay.classList.remove('open');
addNodeOverlay.addEventListener('click', e=> e.stopPropagation());

function slugify(label){
  let base = stripMarkup(label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  if(!base) base = 'node';
  return base;
}
function uniqueId(base, existingIds){
  let id = base, n = 2;
  while(existingIds.has(id)){ id = base + '-' + n; n++; }
  return id;
}

// ---- copy / cut / paste ------------------------------------------------
// Snapshots the selected node's own content and styling — everything except
// its identity and its connections — into the cross-reload clipboard.
// Everything worth carrying about one entry, without its position.
function clipOfNode(n){
  const opts = {};
  if(n.link) opts.link = n.link;
  if(n.colors && n.colors.length) opts.colors = n.colors;
  if(n.tags && n.tags.length) opts.tags = n.tags;
  if(n.font) opts.font = n.font;
  if(typeof n.fontSize === 'number') opts.fontSize = n.fontSize;
  if(n.image) opts.image = n.image;
  if(n.size) opts.size = [n.size.w, n.size.h];
  if(n.multiLang) opts.multiLang = true;
  if(n.langTabs && n.langTabs.length) opts.langTabs = n.langTabs;
  /* Card layout, rotation and stacking travel with the copy too.
   *
     They were the three that did not, so a card came back as a plain box,
     a caption turned to thirty degrees came back level, and anything sent
     behind the chart came back in front of it. A copy is supposed to be
     the same thing again. */
  if(n.card) opts.card = true;
  /* A copied callout keeps pointing at the same place: it is a comment
     ABOUT that connector, and a copy of it is a second remark on the same
     thing rather than a card pointing at nothing. */
  if(n.leader) opts.leader = {from: n.leader.from, to: n.leader.to, at: n.leader.at};
  if(typeof n.rot === 'number' && n.rot) opts.rot = n.rot;
  if(typeof n.z === 'number' && n.z) opts.z = n.z;
  return {
    id: n.id,
    label: n.label,
    note: n.note || null,
    shape: n.shape || null,
    opts,
    // Where it sat, so a group of entries keeps its own arrangement when
    // it is put down somewhere else.
    x: n.x, y: n.y
  };
}
/* Copy takes the WHOLE selection.
 *
 * It used to take the primary entry and nothing else, so lassoing a dozen
 * entries and pressing copy quietly copied one of them — the gesture said
 * "these" and the clipboard heard "that one". A group is stored as a list
 * plus the connections BETWEEN its members, so what comes back is the
 * arrangement, not a heap of unrelated boxes. */
function copySelectedNode(){
  const ids = (multiSelection.size > 1)
    ? Array.from(multiSelection).filter(id=> nodes.has(id))
    : (selectedId && nodes.has(selectedId) ? [selectedId] : []);
  if(!ids.length) return false;
  const inSet = new Set(ids);
  const items = ids.map(id=> clipOfNode(nodes.get(id)));
  // Only the links whose BOTH ends are being copied travel with them.
  const links = [];
  ids.forEach(id=>{
    (nodes.get(id).parents || []).forEach(pid=>{
      if(inSet.has(pid)) links.push([pid, id]);
    });
  });
  const head = items[0];
  writeClipboard(Object.assign({}, head, {items, links}));
  return true;
}

function cutSelectedNode(){
  /* Copy takes the whole selection, so cut has to remove the whole
     selection. It removed the primary entry only, which meant a lasso of
     twelve followed by Ctrl+X put twelve on the clipboard, took one off the
     chart, and left the reader believing eleven had been cut. */
  const ids = (multiSelection.size > 1)
    ? Array.from(multiSelection).filter(id=> nodes.has(id))
    : (selectedId && nodes.has(selectedId) ? [selectedId] : []);
  if(!ids.length) return;
  if(!copySelectedNode()) return;
  if(ids.length > 1 && typeof deleteNodes === 'function') deleteNodes(ids);
  else deleteNode(ids[0]);
}

function pasteClipboardNode(){
  const clip = readClipboard();
  /* A picture element legitimately has no label, so testing for one
     refused a perfectly good clipboard: copy an image, paste, and the page
     said there was nothing to paste while holding it. */
  const hasSomething = clip && (clip.label || clip.id ||
    (Array.isArray(clip.items) && clip.items.length));
  if(!hasSomething){ setSaveState('ok', 'Nothing on the clipboard'); setTimeout(refreshSaveUI, 1400); return; }
  const items = (Array.isArray(clip.items) && clip.items.length) ? clip.items : [clip];
  const links = Array.isArray(clip.links) ? clip.links : [];
  const existingIds = new Set(workingNodes.map(it=>it[0]));
  /* A copy lands in the middle of what is on screen — always, wherever the
     entries it was copied from happen to be. Pasting beside the originals
     is only ever right while you are still looking at them, and the reader
     who pans across the chart and pastes is not: they are looking at where
     they want the copy. A group keeps its own arrangement: the spot places
     the group's top-left corner, and everything else keeps its offset from
     it. viewCentreSpot steps aside from anything already sitting there, so
     a run of pastes cascades rather than stacking. */
  const home = viewCentreSpot(items[0].shape || 'rect');
  const originX = Math.min(...items.map(it=> typeof it.x === 'number' ? it.x : 0));
  const originY = Math.min(...items.map(it=> typeof it.y === 'number' ? it.y : 0));
  const idMap = new Map();
  const made = [];
  applyEdit(()=>{
    items.forEach(it=>{
      const opts = Object.assign({}, it.opts || {});
      opts.pos = [ snapToGrid(home.x + ((it.x || 0) - originX)),
                   snapToGrid(home.y + ((it.y || 0) - originY)) ];
      const newId = uniqueId(slugify(it.label) + '-copy', existingIds);
      existingIds.add(newId);
      idMap.set(it.id || it.label, newId);
      made.push(newId);
      workingNodes.push([newId, it.label, undefined, undefined, it.note || undefined,
                         it.shape || undefined, Object.keys(opts).length ? opts : undefined]);
    });
    // The connections INSIDE the group come with it, pointing at the copies.
    links.forEach(([from, to])=>{
      const f = idMap.get(from), t = idMap.get(to);
      if(!f || !t) return;
      const entry = workingNodes.find(x=> x[0] === t);
      if(!entry) return;
      const parents = resolveExplicitParents(entry);
      if(parents.includes(f)) return;
      parents.push(f);
      entry[2] = parents.length === 1 ? parents[0] : parents;
    });
  });
  // Each paste starts from where the group was PUT, so a run of them walks
  // across the chart instead of landing on top of itself.
  writeClipboard(Object.assign({}, clip, {
    x: home.x, y: home.y,
    items: items.map(it=> Object.assign({}, it, {
      x: home.x + ((it.x || 0) - originX),
      y: home.y + ((it.y || 0) - originY)
    }))
  }));
  if(made.length > 1) setSelection(made, made[0]);
  else if(made.length) selectNode(made[0]);
}
function parseColorsField(raw){
  const colors = raw.trim() ? raw.trim().split(',').map(s=>s.trim()).filter(Boolean) : [];
  for(const c of colors){
    if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)){
      throw new Error(`"${c}" isn't a valid hex color (e.g. #c23b22).`);
    }
  }
  return colors;
}

document.getElementById('addNodeSubmit').onclick = ()=>{
  clearAddNodeStatus();
  const label = addNodeLabel.value.trim();
  /* An entry with nothing written in it is a perfectly good entry.
   *
     It used to be refused, on the reasoning that a box with no words says
     nothing — but plenty of things on a chart say something without words:
     a placeholder for a title nobody has settled on, a box whose whole
     content is a picture or a sticker, a spacer in a row, a shape carrying
     only its archetype and its colour. Refusing them meant typing a
     character and deleting it afterwards, which is not a rule, it is an
     obstacle. The only thing a label was still needed for is the entry's
     id, and that has a fallback. */
  // A new entry lands in the middle of what you are looking at, rather
  // than at the chart's origin, which may be nowhere near the screen.
  const parentId = null;
  const shapeVal = addNodeShapeSel.value==='rect' ? undefined : addNodeShapeSel.value;
  const image = (shapeVal==='ellipse' || shapeVal==='image') ? addNodeImageInput.value.trim() : '';
  const tags = keepAllowedTags(parseTagsField(addNodeTags.value), shapeVal);
  const font = addNodeFontSel.value===FONT_OPTIONS[0].key ? undefined : addNodeFontSel.value;
  const fontSizeRaw = addNodeFontSizeInput.value.trim();
  let fontSize;
  if(fontSizeRaw){
    fontSize = Number(fontSizeRaw);
    if(!Number.isFinite(fontSize) || fontSize<6 || fontSize>28){
      setAddNodeStatus('err', 'Font size must be a number between 6 and 28.');
      return;
    }
  }
  let colors, bg;
  try{ colors = parseColorsField(addNodeColors.value); }
  catch(e){ setAddNodeStatus('err', e.message); return; }
  try{ bg = parseColorsField(addNodeBg.value); }
  catch(e){ setAddNodeStatus('err', e.message); return; }
  const border = addNodeBorderStyle.value;
  const existingIds = new Set(workingNodes.map(it=>it[0]));
  /* Named after its words when it has some, and after its kind when it has
     none — an id is a handle for the chart's own bookkeeping, never
     something the reader reads. */
  const newNodeId = uniqueId(slugify(label), existingIds);
  const spot = viewCentreSpot(shapeVal);
  applyEdit(()=>{
    const opts = { pos: [spot.x, spot.y] };
    if(colors.length) opts.colors = capColors(colors, shapeVal);
    if(bg.length) opts.bg = bg;
    if(border && border !== 'solid') opts.border = border;
    if(tags.length) opts.tags = tags;
    if(font) opts.font = font;
    if(fontSize) opts.fontSize = fontSize;
    if(image) opts.image = image;
    workingNodes.push([newNodeId, label || '', parentId||undefined, undefined,
                       undefined, shapeVal, opts]);
  });
  addNodeOverlay.classList.remove('open');
  selectNode(newNodeId);
};

/* Where a brand-new entry should land: the middle of whatever the reader is
   currently looking at. The chart's origin is often far off screen after any
   amount of panning, so dropping a new box there means it appears to have
   gone nowhere. This reads the visible rectangle of the canvas, converts its
   centre back into chart coordinates, offsets by half the box so the box —
   not its corner — is centred, and snaps to the grid like a drag would. If
   something is already sitting there, it steps down and right until it finds
   clear ground, so two entries made in a row don't stack. */
/* The part of the canvas a reader can actually see. The panels are drawn
   OVER the canvas rather than beside it, so the canvas's own rectangle
   runs on underneath them — and an entry placed at the middle of that
   rectangle lands half-hidden behind whichever panel is open. */
function visibleCanvasRect(){
  const rect = svg.getBoundingClientRect();
  let left = rect.left, right = rect.right;
  /* A panel counts as covering its side of the canvas if it sits anywhere
     in the outer part of it — not only when it is flush against the edge.
     Both of these are inset by a margin, so testing for flushness found
     neither of them and the entry went on landing underneath them. */
  const edgeBand = rect.width * 0.4;
  const panel = document.getElementById('detail');
  if(panel && getComputedStyle(panel).display !== 'none'){
    const p = panel.getBoundingClientRect();
    if(p.width && p.right > right - edgeBand) right = Math.min(right, p.left);
  }
  const legend = document.getElementById('legend');
  if(legend && legend.classList.contains('open')){
    const p = legend.getBoundingClientRect();
    if(p.width && p.left < left + edgeBand) left = Math.max(left, p.right);
  }
  if(right - left < 120){ left = rect.left; right = rect.right; }
  return {left, right, top: rect.top, bottom: rect.bottom,
          width: right - left, height: rect.height};
}
// Is this chart position inside the part of the canvas on show?
function viewCentreSpot(shapeVal){
  const rect = visibleCanvasRect();
  const w = shapeVal==='ellipse' ? BIO_SIZE : shapeVal==='image' ? IMAGE_DEFAULT_W : 120;
  const h = shapeVal==='ellipse' ? BIO_SIZE : shapeVal==='image' ? IMAGE_DEFAULT_H : NODE_MINH;
  const c = clientToWorld(rect.left + rect.width/2, rect.top + rect.height/2);
  let x = snapToGrid(c.x - w/2), y = snapToGrid(c.y - h/2);
  const taken = [...nodes.values()].map(n=>({x:n.x, y:n.y, w:n.w, h:n.h}));
  const clash = (px,py)=> taken.some(t=> px < t.x + t.w + 6 && px + w + 6 > t.x &&
                                         py < t.y + t.h + 6 && py + h + 6 > t.y);
  for(let i=0; i<40 && clash(x,y); i++){ x += GRID; y += GRID; }
  return {x, y};
}

