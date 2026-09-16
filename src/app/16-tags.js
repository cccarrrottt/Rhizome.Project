/* ---------------------------------------------------------------------
   Legend — tag-based filtering. Every user-assigned tag (opts.tags) gets
   a row; nodes with no tags at all fall into an implicit "Untagged"
   bucket so they're still filterable. A node is visible as long as at
   least one of its effective tags (its own tags, or the Untagged
   pseudo-tag if it has none) isn't hidden.
   ------------------------------------------------------------------ */
const UNTAGGED = '__untagged__';
function effectiveTags(n){
  return (n.tags && n.tags.length) ? n.tags : [UNTAGGED];
}
const tagCounts = new Map(); // tag -> count
// Which tags the user has switched off. Survives a rebuild — a filter is a
// view preference, not part of the data, so adding a node shouldn't quietly
// un-hide everything.
const hiddenTags = new Set();
let allTags = [];
const legendList = document.getElementById('legendList');

/* ---- tags and their categories -------------------------------------
 *
 * Two things had to change here. A tag used to exist only because some
 * entry carried it: the list was derived from the chart every rebuild, so
 * there was no way to make a tag before the entry that would wear it, and
 * no place to record how tags relate to each other.
 *
 * TAG_CATS is that place. A category names a set of tags, and a tag it
 * names counts as existing whether or not any entry carries it yet — which
 * is what lets you set up a vocabulary first and apply it afterwards. A tag
 * belongs to at most one category; the rest gather under "Ungrouped".
 *
 * Categories are chart data, not a view setting, so they live in their own
 * @@EDIT@@ region and travel with an export. What stays a view setting is
 * which tags are hidden — that is still `hiddenTags`, still per-browser,
 * and still nothing to do with this. */
const UNGROUPED = '__ungrouped__';
function sanitizeTagCats(list){
  /* Imported data decides the shape of the tag panel, so it is normalized
     once here rather than guarded at each of the places that read it: a
     category needs a name, its tags must be strings, and a tag may not sit
     in two categories at once (the first claim wins, so the result can
     never render one tag twice). */
  /* The one entry allowed to bear the reserved name is the loose bin —
     see looseBin below. It is not a category and is never shown as one,
     but it is a real entry of this list because it is the only thing that
     persists a tag no entry carries and no category claims. */
  const seenCat = new Set(), claimed = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(c=>{
    if(!c || typeof c !== 'object') return;
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if(!name || seenCat.has(name)) return;
    seenCat.add(name);
    const tags = [];
    (Array.isArray(c.tags) ? c.tags : []).forEach(t=>{
      if(typeof t !== 'string') return;
      const tag = t.trim();
      if(!tag || tag === UNTAGGED || claimed.has(tag)) return;
      claimed.add(tag); tags.push(tag);
    });
    out.push({name, tags});
  });
  return out;
}
/* The loose bin, and the real categories.
 *
 * A tag that belongs to no category still has to be kept somewhere, or it
 * would not survive the next rebuild: TAG_CATS is the only thing that
 * remembers a tag nobody carries. So the uncategorised ones are kept in an
 * entry of TAG_CATS under the reserved name, and everything that asks
 * "what categories are there" asks realCategories instead. The bin is
 * never listed, renamed, removed or offered as a place to file into. */
function looseBin(make){
  let bin = TAG_CATS.find(c=> c.name === UNGROUPED);
  if(!bin && make){ bin = {name: UNGROUPED, tags: []}; TAG_CATS.push(bin); }
  return bin;
}
function realCategories(){ return TAG_CATS.filter(c=> c.name !== UNGROUPED); }
/* Also the suite's, for the same reason: it is the plain statement of which
   category owns a tag, which the legend's own grouping is checked against. */
// eslint-disable-next-line no-unused-vars
function categoryOf(tag){
  for(const c of realCategories()) if(c.tags.indexOf(tag) >= 0) return c.name;
  return UNGROUPED;
}
// Every tag that exists: the ones entries carry, plus the ones a category
// declares but nothing wears yet.
function knownTags(){
  const set = new Set(tagCounts.keys());
  set.delete(UNTAGGED);
  TAG_CATS.forEach(c=> c.tags.forEach(t=> set.add(t)));
  return Array.from(set).sort((a,b)=> a.localeCompare(b));
}
function tagExists(tag){ return tagCounts.has(tag) || TAG_CATS.some(c=> c.tags.indexOf(tag) >= 0); }
// Puts a tag in a category, taking it out of whichever one held it before.
// '' or UNGROUPED means "no category".
function assignTagCategory(tag, catName){
  TAG_CATS.forEach(c=>{ const i = c.tags.indexOf(tag); if(i >= 0) c.tags.splice(i, 1); });
  if(!catName || catName === UNGROUPED){ looseBin(true).tags.push(tag); return; }
  const cat = TAG_CATS.find(c=> c.name === catName);
  if(cat) cat.tags.push(tag);
  else looseBin(true).tags.push(tag);
}
/* There is no longer a mode. "Organize" existed to fold the editing
   controls away and leave a panel that only filtered — but every row now
   carries its own eye and its own cross, so the panel is an editor either
   way and a switch that revealed two more controls was one more thing to
   find. What it used to hide is simply always there. */

/* ---- references -----------------------------------------------------
 *
 * A reference is {key, title, detail, url}. The key is what a text stores;
 * the number the reader sees is the position in this list, computed at
 * draw time by refIndex(). Nothing anywhere stores a number, which is what
 * makes reordering safe.
 *
 * The panel sits beside the tag panel and shares its shape deliberately:
 * both are lists of things the chart refers to, and both are opened from
 * the same corner of the toolbar. */
function sanitizeRefs(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(r=>{
    if(!r || typeof r !== 'object') return;
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    if(!key || !/^[A-Za-z0-9_-]+$/.test(key) || seen.has(key)) return;
    seen.add(key);
    out.push({
      key,
      title: typeof r.title === 'string' ? r.title : '',
      detail: typeof r.detail === 'string' ? r.detail : '',
      // Run through the same gate as an entry's link: a reference is a
      // place a reader is invited to click, so it may only navigate.
      url: (typeof r.url === 'string' && safeUrl(r.url)) ? r.url : ''
    });
  });
  return out;
}
function uniqueRefKey(base){
  let k = String(base || 'ref').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'ref';
  if(refIndex(k) < 0) return k;
  let i = 2;
  while(refIndex(k + '-' + i) >= 0) i++;
  return k + '-' + i;
}
// Every text on the chart that could carry a citation, so a reference can
// report how many places use it — and warn before deleting a used one.
function refUsageCount(key){
  const token = '{{r:' + key + '}}';
  let n = 0;
  const scan = t=>{ if(typeof t === 'string' && t.indexOf(token) >= 0) n++; };
  workingNodes.forEach(t=>{
    scan(t[1]); scan(t[4]);
    const opts = t[6];
    if(opts && Array.isArray(opts.langTabs)) opts.langTabs.forEach(x=> scan(x && x.text));
  });
  EDGE_STYLES.forEach(e=> scan(e && e.note));
  COMMENTS.forEach(c=> scan(c && c.text));
  REFS.forEach(r=>{ scan(r.detail); });
  return n;
}
function stripRefToken(text, key){
  return typeof text === 'string' ? text.split('{{r:' + key + '}}').join('') : text;
}

/* One panel, two lists. Rebuilt together because they share a container
   and because a change to either can affect what the other shows — a tag
   deleted here, a reference renumbered there. */
/* A section heading, and the controls that belong to that section.
   Both lists used to be worked from one row of buttons at the top of the
   panel, which meant a single + that had to ask which of three things you
   meant and one eye that could only ever mean "tags". Each heading now
   carries what acts on the list under it, so the button says what it does
   by where it is. */
function sectionHead(title, count){
  const head = document.createElement('div');
  head.className = 'legend-group-head legend-section-head';
  head.innerHTML = `<span class="legend-group-name">${escapeHtml(title)}</span>` +
                   `<span class="legend-group-count">${count}</span>`;
  return head;
}
function makePlusButton(title){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'icon-action plus-mini'; b.title = title;
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  return b;
}
// The two-item menu the Tags + opens, parked under whichever heading asked
// for it. One element, moved, rather than one per rebuild.
function openTagAddMenu(afterEl){
  const menu = document.getElementById('legendAddMenu');
  if(!menu) return;
  if(!menu.hidden && menu.previousSibling === afterEl){ menu.hidden = true; return; }
  afterEl.parentNode.insertBefore(menu, afterEl.nextSibling);
  menu.hidden = false;
}
function buildManagement(){
  buildLegend();
  const head = sectionHead('References', REFS.length);
  /* Set apart from the tags above it. Two lists in one panel, with only
     the usual heading rule between them, read as one list with a subtitle
     in the middle of it. */
  head.classList.add('legend-section-split');
  if(!readOnlyView){
    const add = makePlusButton('Add a reference');
    add.addEventListener('click', ev=>{ ev.stopPropagation(); addRef(); });
    head.appendChild(add);
  }
  legendList.appendChild(head);
  /* The citation colour is a setting OF the references, so it sits with
     them — and above the list rather than below it, where a long list of
     references would otherwise push it out of sight. */
  const colorRow = document.getElementById('refColorRow');
  if(colorRow && !readOnlyView){ colorRow.hidden = false; legendList.appendChild(colorRow); }
  else if(colorRow) colorRow.hidden = true;
  buildRefsInto(legendList);
  syncLegendEye();
}
function buildLegend(){
  tagCounts.clear();
  nodes.forEach(n=>{
    effectiveTags(n).forEach(t=> tagCounts.set(t, (tagCounts.get(t)||0)+1));
  });
  allTags = knownTags();
  if(tagCounts.has(UNTAGGED)) allTags.push(UNTAGGED);
  /* A tag can now outlive the last entry carrying it, so long as a category
     still declares it — dropping it from hiddenTags on that basis would
     silently un-hide it. Only a tag that has stopped existing altogether is
     forgotten. */
  Array.from(hiddenTags).forEach(t=>{
    if(t !== UNTAGGED && !tagExists(t)) hiddenTags.delete(t);
    if(t === UNTAGGED && !tagCounts.has(UNTAGGED)) hiddenTags.delete(t);
  });

  // Group the tags for display: declared categories in their own order,
  // then whatever is left.
  /* The last bucket is SPECIAL, and it is not merely "whatever is left".
     The tags that DO something — the ones that put a weave under an entry
     or an echo around it — belong together and belong nowhere else: filing
     one under "Eras" would say it is a kind of era, which it is not. They
     are collected here whatever else claims them, along with the Untagged
     bucket and any tag nobody has filed yet. */
  const reserved = new Set(allTags.filter(t=> t === UNTAGGED || tagIsSpecial(t)));
  const groups = realCategories().map(c=> ({
    name: c.name,
    tags: c.tags.filter(t=> allTags.indexOf(t) >= 0 && !reserved.has(t))
                .sort((a,b)=> a.localeCompare(b))
  }));
  const grouped = new Set();
  groups.forEach(g=> g.tags.forEach(t=> grouped.add(t)));
  /* Two different kinds of "not in a category", which used to share one
     bucket at the foot of the panel. SPECIAL is a real group — the tags
     that DO something, collected together whatever else claims them, and
     the Untagged bin. UNCATEGORISED is not a group at all: it is where a
     tag sits before anybody has decided where it goes, which is where
     every tag starts and where a tag dragged out of a category lands. It
     belongs at the TOP, under the search box, because it is a staging area
     and not an archive. */
  const uncategorised = allTags.filter(t=> !grouped.has(t) && !reserved.has(t));
  const special = allTags.filter(t=> reserved.has(t));
  if(special.length) groups.push({name: UNGROUPED, tags: special});

  /* The add menu and the citation-colour row are moved INTO this list on
     every build, so they have to be rescued before it is emptied or they
     would be destroyed along with it. */
  const parked = document.getElementById('legend');
  ['legendAddMenu', 'refColorRow'].forEach(id=>{
    const elm = document.getElementById(id);
    if(elm && parked) parked.appendChild(elm);
  });
  const addMenu = document.getElementById('legendAddMenu');
  if(addMenu) addMenu.hidden = true;
  legendList.innerHTML = '';
  const tagHead = sectionHead('Tags', allTags.length);
  const globalEye = makeEyeButton(everythingHidden(),
    everythingHidden() ? 'Show every tag' : 'Hide every tag');
  globalEye.id = 'legendEye';
  globalEye.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(everythingHidden()) hiddenTags.clear();
    else allTags.forEach(t=> hiddenTags.add(t));
    applyVisibility(); buildManagement();
  });
  tagHead.insertBefore(globalEye, tagHead.firstChild);
  if(!readOnlyView){
    const add = makePlusButton('Add a tag or a category');
    add.addEventListener('click', ev=>{ ev.stopPropagation(); openTagAddMenu(tagHead); });
    tagHead.appendChild(add);
  }
  legendList.appendChild(tagHead);
  legendList.appendChild(buildTagFilterRow());
  legendList.appendChild(buildLooseBlock(uncategorised.filter(tagMatchesFilter)));
  const shown = groups.map(g=> ({name:g.name, tags:g.tags.filter(tagMatchesFilter)}));
  let any = false;
  shown.forEach(group=>{
    if(!group.tags.length && group.name === UNGROUPED && TAG_CATS.length) return;
    /* While a search is running, a category with nothing matching in it is
       not an empty category — it is one the reader is not looking at. */
    if(tagFilterText && !group.tags.length) return;
    any = true;
    legendList.appendChild(buildCategoryBlock(group));
  });
  if(pendingNewCat) legendList.appendChild(buildNewCategoryBlock());
  if(tagFilterText && !any && !uncategorised.length){
    const none = document.createElement('div');
    none.className = 'legend-empty';
    none.textContent = `No tag matches \u201c${tagFilterText}\u201d.`;
    legendList.appendChild(none);
  }
}

/* ---- where a tag lives before it is filed ---------------------------
 *
 * A headless block, directly under the search box, holding every tag no
 * category claims — and the place a brand-new tag is made and named. It is
 * also a drop target, which is the gesture for taking a tag back OUT of a
 * category: there was none before, and a filing decision you cannot undo
 * by hand is not a filing decision. */
function buildLooseBlock(tags){
  const wrap = document.createElement('div');
  wrap.id = 'legendLoose';
  wrap.className = 'legend-group legend-loose' + (readOnlyView ? '' : ' drop-zone');
  wrap.dataset.cat = UNGROUPED;
  tags.forEach(tag=> wrap.appendChild(buildTagRow(tag, UNGROUPED)));
  if(pendingNewTag) wrap.appendChild(buildNewTagRow());
  else if(!tags.length){
    const hint = document.createElement('div');
    hint.className = 'legend-loose-hint';
    hint.textContent = readOnlyView
      ? 'Every tag is filed under a category.'
      : 'Tags with no category appear here. Drag one out of a category to bring it back.';
    wrap.appendChild(hint);
  }
  return wrap;
}
/* Naming a thing where it stands: the same gesture the category headings
   already use, shared so the two cannot drift apart. */
function focusNaming(box){
  if(!box) return;
  box.focus({preventScroll:true});
  try{
    const sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(box);
    sel.removeAllRanges(); sel.addRange(r);
  }catch(e){}
}
/* Making a tag where it will live.
 *
 * A tag used to be made in a dialog — a window, a field, an OK button —
 * and then appeared somewhere else on the panel, under whichever category
 * happened to be first. It is written into an empty tag shape in the
 * uncategorised block instead, exactly as a category is renamed on its own
 * heading, and carried into a category afterwards if it wants one. Nothing
 * typed, Escape, or a click anywhere else, and no tag was ever made. */
let pendingNewTag = false, pendingNewCat = false;
function startNewTagEntry(){
  if(readOnlyView) return;
  pendingNewCat = false;
  pendingNewTag = true;
  buildManagement();
  focusNaming(document.querySelector('#legendLoose .tag-naming-text'));
}
function startNewCategoryEntry(){
  if(readOnlyView) return;
  pendingNewTag = false;
  pendingNewCat = true;
  buildManagement();
  focusNaming(document.querySelector('.legend-group-new .legend-group-name'));
}
function buildNewTagRow(){
  const row = document.createElement('div');
  row.className = 'legend-item legend-item-new';
  row.innerHTML =
    `<div class="swatch" style="background:var(--accent)"></div>` +
    `<div class="name"><span class="tag-shape"><i class="tag-eye"></i>` +
    `<span class="tag-naming-text" contenteditable="plaintext-only" spellcheck="false"></span>` +
    `</span></div><div class="count">0</div>`;
  row.insertBefore(makeEyeButton(false, 'A new tag'), row.firstChild);
  const box = row.querySelector('.tag-naming-text');
  let done = false;
  const finish = (keep)=>{
    if(done) return;
    done = true;
    const typed = (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    pendingNewTag = false;
    if(keep && typed) createTag(typed);
    else buildManagement();
  };
  box.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  });
  // Anywhere else is "never mind", which is what a half-typed name means.
  box.addEventListener('blur', ()=> finish(false));
  box.addEventListener('click', ev=> ev.stopPropagation());
  box.addEventListener('mousedown', ev=> ev.stopPropagation());
  return row;
}
function buildNewCategoryBlock(){
  const wrap = document.createElement('div');
  wrap.className = 'legend-group legend-group-new';
  const head = document.createElement('div');
  head.className = 'legend-group-head';
  head.innerHTML =
    `<span class="legend-group-name renaming" contenteditable="plaintext-only" spellcheck="false"></span>` +
    `<span class="legend-group-fold">\u2304</span><span class="legend-group-count">0</span>`;
  head.insertBefore(makeEyeButton(false, 'A new category'), head.firstChild);
  const box = head.querySelector('.legend-group-name');
  let done = false;
  const finish = (keep)=>{
    if(done) return;
    done = true;
    const typed = (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    pendingNewCat = false;
    if(keep && typed) createCategory(typed);
    else buildManagement();
  };
  box.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  });
  box.addEventListener('blur', ()=> finish(false));
  box.addEventListener('click', ev=> ev.stopPropagation());
  box.addEventListener('mousedown', ev=> ev.stopPropagation());
  wrap.appendChild(head);
  return wrap;
}
/* The search. A chart of any age has more tags than fit on the panel, and
   scrolling a list to find a name you already know is the one thing a list
   is worst at. Typing narrows it; clearing it puts everything back, folded
   categories and all — and while anything is typed the categories are held
   open, since a match hidden inside a folded category is a search that
   answers "nothing found" while holding the answer. */
function buildTagFilterRow(){
  const row = document.createElement('div');
  row.className = 'legend-filter';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'legendFilter';
  input.placeholder = 'Find a tag\u2026';
  input.spellcheck = false;
  input.value = tagFilterText;
  input.addEventListener('input', ()=>{
    tagFilterText = input.value.trim().toLowerCase();
    buildManagement();
    const again = document.getElementById('legendFilter');
    if(again){ again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
  });
  input.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key === 'Escape'){ input.value = ''; tagFilterText = ''; buildManagement(); }
  });
  input.addEventListener('click', ev=> ev.stopPropagation());
  row.appendChild(input);
  return row;
}

/* The eye, at every scale. One shape for "this is showing / this is
   hidden" — the whole panel's eye, a category's, a single tag's — so the
   control reads the same wherever it appears instead of the top button
   being an eye and the rows being dots. */
const EYE_OPEN_SVG = '<svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const EYE_SHUT_SVG = '<svg class="eye-shut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.8-6.5 10-6.5c2 0 3.7.7 5.1 1.5M22 12s-3.8 6.5-10 6.5c-2 0-3.7-.7-5.1-1.5"/><circle cx="12" cy="12" r="2.8"/><line x1="3.5" y1="20.5" x2="20.5" y2="3.5"/></svg>';
function makeEyeButton(shut, title){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-action eye-mini' + (shut ? ' shut' : '');
  b.title = title;
  b.innerHTML = EYE_OPEN_SVG + EYE_SHUT_SVG;
  return b;
}

/* Which categories are folded shut, and what the reader is looking for.
 *
 * Both belong to the session rather than to the chart: they are how
 * somebody is reading the list right now, not something about the list. A
 * chart opened tomorrow shows every category, which is the right default
 * for a panel whose job is to say what tags exist. */
const collapsedCats = new Set();
let tagFilterText = '';
function tagMatchesFilter(tag){
  if(!tagFilterText) return true;
  const name = tag === UNTAGGED ? 'untagged' : tag;
  return name.toLowerCase().indexOf(tagFilterText) >= 0;
}
let headDblTimer = 0;
function buildCategoryBlock(group){
  const isLoose = group.name === UNGROUPED;
  const wrap = document.createElement('div');
  // Ungrouped is where a tag with no category shows up, not a category to
  // file one into — so it is marked, and never accepts a drop.
  wrap.className = 'legend-group' + (isLoose || readOnlyView ? '' : ' drop-zone');
  wrap.dataset.cat = group.name;

  const head = document.createElement('div');
  head.className = 'legend-group-head';
  /* What the eye acts on is every tag the category DECLARES, not only the
     ones some entry happens to carry. A category whose tags are all unused
     shows as empty, and judging the eye by what is on the panel left it
     pointing at nothing: it drew as open, and clicking it did nothing at
     all. A category is a filing decision, and it keeps that decision
     whether or not anything is filed under it today. */
  const owned = isLoose ? group.tags
    : (TAG_CATS.find(c=> c.name === group.name) || {tags: group.tags}).tags;
  const allOff = owned.length > 0 && owned.every(t=> hiddenTags.has(t));
  if(isLoose) head.classList.add('legend-group-special');
  /* Folded shut, a category is one line instead of twenty. A chart can
     carry more tags than a panel has room for, and the reader is almost
     always working inside one of them at a time. The chevron says which
     way it will go; the whole heading is the target, because a heading is
     what anybody would click. */
  const shut = collapsedCats.has(group.name) && !tagFilterText;
  wrap.classList.toggle('collapsed', shut);
  head.innerHTML =
    `<span class="legend-group-name">${escapeHtml(isLoose ? 'Special' : group.name)}</span>` +
    `<span class="legend-group-fold">${shut ? '\u2039' : '\u2304'}</span>` +
    `<span class="legend-group-count">${group.tags.length}</span>`;
  head.classList.add('foldable');
  head.title = (shut ? 'Show this category' : 'Fold this category away') +
               (isLoose || readOnlyView ? '' : ' — double-click the name to rename it');
  head.addEventListener('click', ev=>{
    if(ev.target.closest('button')) return;
    if(headDblTimer){ clearTimeout(headDblTimer); headDblTimer = 0; return; }
    /* A moment's wait, because the second click of a double means
       "rename", and folding the category away underneath the cursor
       first is the wrong answer to it. */
    headDblTimer = setTimeout(()=>{
      headDblTimer = 0;
      if(collapsedCats.has(group.name)) collapsedCats.delete(group.name);
      else collapsedCats.add(group.name);
      buildManagement();
    }, DOUBLE_CLICK_GRACE);
  });
  /* Renaming is a double click on the name, like every other name on this
     page. It used to have a pencil of its own in the heading, next to the
     ✕ that removes the category — two buttons a few pixels apart, one of
     which edits and one of which deletes. */
  if(!isLoose && !readOnlyView){
    head.addEventListener('dblclick', ev=>{
      if(ev.target.closest('button')) return;
      ev.preventDefault(); ev.stopPropagation();
      if(headDblTimer){ clearTimeout(headDblTimer); headDblTimer = 0; }
      startCategoryRename(head, group.name);
    });
  }
  const groupEye = makeEyeButton(!!allOff, owned.length
    ? (allOff ? 'Show' : 'Hide') + ' this whole category'
    : 'This category is empty — drag a tag onto it');
  // Nothing to show or hide: the eye stays, so the heading still reads
  // like every other heading, but it cannot be pressed.
  if(!owned.length) groupEye.disabled = true;
  groupEye.addEventListener('click', ev=>{
    ev.stopPropagation();
    // One gesture for the group: if any of it is showing, hide it all;
    // otherwise bring it all back.
    if(allOff) owned.forEach(t=> hiddenTags.delete(t));
    else owned.forEach(t=> hiddenTags.add(t));
    applyVisibility(); buildManagement();
  });
  head.insertBefore(groupEye, head.firstChild);
  if(!isLoose && !readOnlyView){
    const tools = document.createElement('span');
    tools.className = 'legend-group-tools';
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕'; del.title = 'Remove this category (its tags stay)';
    del.addEventListener('click', ev=>{ ev.stopPropagation(); removeCategory(group.name); });
    tools.appendChild(del);
    head.appendChild(tools);
  }
  wrap.appendChild(head);

  if(!shut) group.tags.forEach(tag=> wrap.appendChild(buildTagRow(tag, group.name)));
  return wrap;
}

function buildTagRow(tag, catName){
  const row = document.createElement('div');
  row.className = 'legend-item' + (hiddenTags.has(tag) ? ' off' : '');
  row.dataset.tag = tag;
  const count = tagCounts.get(tag) || 0;
  const displayName = tag === UNTAGGED ? 'Untagged' : tag;
  const hidden = hiddenTags.has(tag);
  /* A star on the ones that act. It is a mark on the NAME, not a column of
     its own, so the rows still line up and a chart with no special tags in
     it looks exactly as it did. */
  row.innerHTML =
    `<div class="swatch" style="background:var(--accent)"></div>` +
    `<div class="name">${tagShapeHtml(displayName, {special: tagIsSpecial(tag),
                                                    reserved: tag === UNTAGGED,
                                                    why: SPECIAL_TAGS[tag]})}</div>` +
    `<div class="count">${count}</div>`;
  /* Showing and hiding is the eye, here as everywhere else. It used to be
     the whole row, which meant the row could not also carry a delete
     button without every attempt to remove a tag hiding it first. */
  const eye = makeEyeButton(hidden, (hidden ? 'Show' : 'Hide') + ' this tag');
  eye.addEventListener('click', ev=>{
    ev.stopPropagation();
    if(hiddenTags.has(tag)) hiddenTags.delete(tag);
    else hiddenTags.add(tag);
    applyVisibility();
    // The category's own eye reflects its tags, so it has to be repainted.
    buildManagement();
  });
  row.insertBefore(eye, row.firstChild);
  /* The Untagged bucket is not a tag anyone wrote — it is where entries
     with no tags at all show up — so it cannot be filed or deleted. */
  if(tag !== UNTAGGED){
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'legend-tag-del';
    del.textContent = '\u2715';
    del.title = count ? `Remove this tag from all ${count} entries carrying it` : 'Delete this unused tag';
    del.addEventListener('click', ev=>{ ev.stopPropagation(); deleteTagEverywhere(tag, count); });
    row.appendChild(del);
  }
  if(tag !== UNTAGGED && !readOnlyView){
    /* Filing a tag is carrying it: pick the row up and drop it on the
       category it belongs to. The dropdown that used to sit here said the
       same thing in the abstract — a list of names, none of which was the
       category you were looking at — and every tag on the panel carried a
       copy of the whole list. */
    row.classList.add('draggable-row');
    row.title = 'Drag onto a category to file this tag there';
    row.addEventListener('mousedown', ev=> beginListDrag(ev, 'tag', tag, displayName));
  }
  return row;
}

/* ---- dragging a row out of one list and into another ----------------
 *
 * Two lists in the Management panel are arrangements rather than
 * collections: which category a tag belongs to, and what order the
 * references are in. Both were operated by proxy — a dropdown beside the
 * tag, a pair of arrows beside the reference — and in both cases the thing
 * being changed is a POSITION, which a control that is not the row itself
 * can only describe. So the row is the control: pick it up and put it
 * where it goes.
 *
 * Pointer events rather than the HTML drag-and-drop API. This page is
 * rendered inside a sandboxed frame, and the drag API's behaviour there
 * depends on the host: the drag image, the cursor and whether a drop fires
 * at all vary in ways the rest of the chart's dragging — nodes, connector
 * ends, leader points — does not. One mechanism for every drag on the
 * page is worth more than the API's free drag image.
 */
let listDrag = null;
const LIST_DRAG_THRESHOLD = 4;

function beginListDrag(ev, kind, key, label){
  if(ev.button !== 0 || readOnlyView) return;
  /* Not on a control. A row carries an eye, a delete button, a select —
     pressing one of those is pressing it, not picking the row up. */
  if(ev.target.closest('button, select, input, a')) return;
  ev.preventDefault();
  listDrag = {kind, key, label, startX:ev.clientX, startY:ev.clientY,
              moved:false, ghost:null, target:null, where:null};
}
function listDragGhost(){
  if(listDrag.ghost) return listDrag.ghost;
  const g = document.createElement('div');
  g.className = 'list-drag-ghost';
  g.textContent = listDrag.label;
  document.body.appendChild(g);
  listDrag.ghost = g;
  document.body.classList.add('list-dragging');
  return g;
}
function clearListDragMarks(){
  document.querySelectorAll('.drop-into, .drop-before, .drop-after')
    .forEach(e=> e.classList.remove('drop-into','drop-before','drop-after'));
}
function listDropUnder(x, y){
  const under = document.elementFromPoint(x, y);
  if(!under || !under.closest) return null;
  if(listDrag.kind === 'tag'){
    const grp = under.closest('.legend-group');
    if(!grp) return null;
    /* The uncategorised block IS a place to drop: dropping there is how a
       tag comes back OUT of a category, which nothing offered before. The
       Special group is not — what is in it is there because of what it is,
       not because anybody filed it. */
    if(grp.dataset.cat === UNGROUPED && !grp.classList.contains('legend-loose')) return null;
    return {el: grp, where: 'into'};
  }
  const row = under.closest('.ref-item');
  if(!row || row.dataset.key === listDrag.key) return null;
  const r = row.getBoundingClientRect();
  return {el: row, where: y < r.top + r.height/2 ? 'before' : 'after'};
}
window.addEventListener('mousemove', ev=>{
  if(!listDrag) return;
  if(!listDrag.moved){
    if(Math.hypot(ev.clientX - listDrag.startX, ev.clientY - listDrag.startY) < LIST_DRAG_THRESHOLD) return;
    listDrag.moved = true;
  }
  const g = listDragGhost();
  g.style.left = (ev.clientX + 12) + 'px';
  g.style.top  = (ev.clientY + 12) + 'px';
  clearListDragMarks();
  const hit = listDropUnder(ev.clientX, ev.clientY);
  listDrag.target = hit ? hit.el : null;
  listDrag.where = hit ? hit.where : null;
  if(hit) hit.el.classList.add('drop-' + hit.where);
});
window.addEventListener('mouseup', ()=>{
  const st = listDrag;
  listDrag = null;
  if(!st) return;
  if(st.ghost) st.ghost.remove();
  document.body.classList.remove('list-dragging');
  clearListDragMarks();
  if(!st.moved || !st.target) return;
  if(st.kind === 'tag'){
    const cat = st.target.dataset.cat;
    if(!cat) return;
    if(cat === UNGROUPED){
      if(!st.target.classList.contains('legend-loose')) return;
      applyEdit(()=> assignTagCategory(st.key, ''));
      buildManagement();
      setLegendStatus('ok', `“${st.key}” is out of its category.`);
      return;
    }
    applyEdit(()=> assignTagCategory(st.key, cat));
    buildManagement();
    setLegendStatus('ok', `“${st.key}” is now under ${cat}.`);
  } else if(st.kind === 'ref'){
    reorderRef(st.key, st.target.dataset.key, st.where);
  }
});

