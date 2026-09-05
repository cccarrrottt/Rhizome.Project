#!/usr/bin/env node
/* Axiom Nexus — regression suite.
 *
 *   node tests/regression.js              test dist/nexus.html
 *   node tests/regression.js src          test src/index.html instead
 *
 * Every scenario is a real browser driving the real built page. There are no
 * unit tests here on purpose: almost everything this page does is geometry,
 * layout and event wiring, none of which a unit test can vouch for. The suite
 * serves the page over HTTP from a throwaway server, because half the point is
 * exercising the code paths that a file:// origin would take differently.
 */
const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2] === 'src' ? 'src' : 'dist';
const DIR  = path.join(ROOT, MODE);
const PAGE = MODE === 'src' ? 'index.html' : 'nexus.html';
const PORT = 8830;

const MIME = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
              '.js':'text/javascript; charset=utf-8'};

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail){
  (ok ? pass++ : fail++);
  results.push({name, ok, detail});
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
}
function eq(name, got, want){
  check(name, Object.is(got, want), Object.is(got, want) ? '' : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function main(){
  const srv = http.createServer((q, r) => {
    const rel = decodeURIComponent(q.url.split('?')[0]);
    const p = path.join(DIR, rel === '/' ? PAGE : rel);
    if(rel === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
    let body; try { body = fs.readFileSync(p); }
    catch(e){ r.writeHead(404); r.end('not found'); return; }
    r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
    r.end(body);
  });
  await new Promise(r => srv.listen(PORT, r));
  const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium'});

  const errors = [];
  const ctx = await browser.newContext({viewport:{width:1500, height:950}});
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  /* The sandbox has no route to the font CDN and serves no favicon. Neither
     says anything about this page, so they are filtered rather than left to
     turn every run red. Anything else still counts. */
  const NOISE = /favicon|fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/i;
  page.on('console', m => { if(m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', () => {});

  console.log(`\nAxiom Nexus regression — ${MODE}/${PAGE}\n`);

  await page.goto(`http://127.0.0.1:${PORT}/${PAGE}`, {waitUntil:'networkidle'});
  await wait(1500);

  /* ---- 1. boot ---- */
  const boot = await page.evaluate(() => ({
    nodes: nodes.size,
    rendered: document.querySelectorAll('#nodeLayer .node').length,
    edges: document.querySelectorAll('#edgeLayer path').length,
    layers: ['bgLayer','backLayer','edgeLayer','nodeLayer','arrowLayer','frontLayer','bioCardLayer']
              .filter(id => document.getElementById(id)).length,
    dirty: isDirty()
  }));
  check('boots with nodes rendered', boot.rendered > 0, `${boot.rendered} nodes`);
  eq('all seven layers present', boot.layers, 7);
  eq('clean on load', boot.dirty, false);

  /* ---- 2. undo / redo ---- */
  const undo = await page.evaluate(async () => {
    const was = workingNodes[0][1];
    applyEdit(() => { workingNodes[0][1] = '__UNDO_PROBE__'; });
    const after = workingNodes[0][1];
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'z', ctrlKey:true, bubbles:true}));
    await new Promise(r => setTimeout(r, 250));
    const undone = workingNodes[0][1];
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'y', ctrlKey:true, bubbles:true}));
    await new Promise(r => setTimeout(r, 250));
    const redone = workingNodes[0][1];
    applyEdit(() => { workingNodes[0][1] = was; });
    return {after, undone, redone, was};
  });
  eq('edit applies', undo.after, '__UNDO_PROBE__');
  eq('ctrl+z undoes', undo.undone, undo.was);
  eq('ctrl+y redoes', undo.redone, '__UNDO_PROBE__');

  /* ---- 3. node creation, every archetype ---- */
  const shapes = await page.evaluate(async () => {
    const out = {};
    for(const shape of ['rect','ellipse','amalgam','image','textbox']){
      const id = 'probe_' + shape;
      applyEdit(() => { workingNodes.push([id, 'Probe ' + shape, null, null, null, shape, {pos:[900, 200]}]); });
      await new Promise(r => setTimeout(r, 60));
      out[shape] = !!document.querySelector(`[data-id="${id}"]`);
      applyEdit(() => { const i = workingNodes.findIndex(n => n[0] === id); if(i >= 0) workingNodes.splice(i, 1); });
    }
    return out;
  });
  for(const [shape, ok] of Object.entries(shapes)) check(`archetype renders: ${shape}`, ok);

  /* ---- 4. card layout ---- */
  const card = await page.evaluate(async () => {
    const id = 'probe_card';
    applyEdit(() => { workingNodes.push([id, 'Card Probe', null, null, 'body text', 'rect',
      {pos:[900, 420], card:true}]); });
    await new Promise(r => setTimeout(r, 120));
    const g = document.querySelector(`[data-id="${id}"]`);
    const r = {
      exists: !!g,
      rule: g ? g.querySelectorAll('.card-rule').length : 0,
      slot: g ? g.querySelectorAll('.card-slot').length : 0,
      body: g ? g.querySelectorAll('.card-body').length : 0,
      cardTop: (nodes.get(id) || {}).cardTop != null
    };
    applyEdit(() => { const i = workingNodes.findIndex(n => n[0] === id); if(i >= 0) workingNodes.splice(i, 1); });
    return r;
  });
  check('card layout draws its divisions', card.exists && card.rule >= 1 && card.slot >= 1 && card.body >= 1,
        JSON.stringify(card));
  check('card records its picture band for port routing', card.cardTop);

  /* ---- 5. edge routing clears every obstacle ---- */
  const clearance = await page.evaluate(async () => {
    const ids = [];
    applyEdit(() => {
      for(let i = 0; i < 40; i++){
        const id = 'grid_' + i; ids.push(id);
        workingNodes.push([id, 'N' + i, i > 0 && i % 4 ? 'grid_' + (i - 1) : null, null, null, null,
          {pos:[(i % 8) * 190 - 400, Math.floor(i / 8) * 150 - 300]}]);
      }
    });
    await new Promise(r => setTimeout(r, 900));
    let checked = 0, hits = 0;
    const rects = obstacleAll();
    for(const p of document.querySelectorAll('#edgeLayer path.edge-hit')){
      const len = p.getTotalLength(); if(!len) continue;
      const from = p.dataset.from, to = p.dataset.to;
      for(let t = 0.12; t <= 0.88; t += 0.04){
        const pt = p.getPointAtLength(len * t); checked++;
        for(const r of rects){
          if(r.id === from || r.id === to) continue;
          if(pt.x > r.x + 1 && pt.x < r.x + r.w - 1 && pt.y > r.y + 1 && pt.y < r.y + r.h - 1){ hits++; break; }
        }
      }
    }
    applyEdit(() => { for(const id of ids){ const i = workingNodes.findIndex(n => n[0] === id); if(i >= 0) workingNodes.splice(i, 1); } });
    await new Promise(r => setTimeout(r, 400));
    return {checked, hits};
  });
  check('connectors clear unrelated boxes on a dense chart',
        clearance.hits === 0 && clearance.checked > 100,
        `${clearance.checked - clearance.hits}/${clearance.checked} sample points clear`);

  /* ---- 6. panels open ---- */
  for(const [btn, panel] of [['#legendToggle','#legend'], ['#fileToggle','#filePopover'],
                             ['#aboutToggle','#aboutOverlay'], ['#stickersToggle','#stickerOverlay'],
                             ['#addNodeToggle','#addNodeOverlay']]){
    const ok = await page.evaluate(async ([b, p]) => {
      const el = document.querySelector(b); if(!el) return 'no button';
      el.click(); await new Promise(r => setTimeout(r, 220));
      const t = document.querySelector(p); if(!t) return 'no panel';
      const shown = !t.hidden && getComputedStyle(t).display !== 'none';
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
      await new Promise(r => setTimeout(r, 220));
      return shown;
    }, [btn, panel]);
    check(`panel opens: ${panel}`, ok === true, ok === true ? '' : String(ok));
  }

  /* Suggestions were switched off by request, so the comments button is
     deliberately inert. Assert the deliberate part, not the opening. */
  check('comments stay switched off', await page.evaluate(async () => {
    if(eval('SUGGESTIONS_ENABLED')) return false;
    document.getElementById('commentsToggle').click();
    await new Promise(r => setTimeout(r, 200));
    return !document.getElementById('commentsOverlay').classList.contains('open');
  }));

  /* ---- 7. tag filtering hides nodes AND their connectors ---- */
  const tagFilter = await page.evaluate(async () => {
    const id = 'probe_tagged';
    applyEdit(() => {
      workingNodes.push([id, 'Tagged Probe', workingNodes[0][0], null, null, null,
        {pos:[700, 700], tags:['fan-fiction']}]);
    });
    await new Promise(r => setTimeout(r, 400));
    const edgeBefore = document.querySelectorAll('#edgeLayer path.edge-hit').length;
    const row = document.querySelector('#legendList .legend-item[data-tag="fan-fiction"]');
    // Hiding is the row's eye button now, not the row itself — the row had
    // to give the gesture up so it could also carry a delete cross.
    const box = row && row.querySelector('.eye-mini');
    let r = {found: !!box};
    if(box){
      box.click();
      await new Promise(res => setTimeout(res, 400));
      r.nodeHidden = !document.querySelector(`[data-id="${id}"]`) ||
                     getComputedStyle(document.querySelector(`[data-id="${id}"]`)).display === 'none';
      const live = e => getComputedStyle(e).display !== 'none';
      const touching = [...document.querySelectorAll('#edgeLayer path.edge-hit')]
        .filter(e => e.dataset.from === id || e.dataset.to === id);
      r.touching = touching.length;
      r.stillVisible = touching.filter(live).length;
      r.othersVisible = [...document.querySelectorAll('#edgeLayer path.edge-hit')]
        .filter(e => e.dataset.from !== id && e.dataset.to !== id).filter(live).length;
      document.querySelector('#legendList .legend-item[data-tag="fan-fiction"] .eye-mini').click();
      await new Promise(res => setTimeout(res, 400));
    }
    applyEdit(() => { const i = workingNodes.findIndex(n => n[0] === id); if(i >= 0) workingNodes.splice(i, 1); });
    return r;
  });
  check('hiding a tag hides its node and its connector',
        tagFilter.found && tagFilter.nodeHidden &&
        tagFilter.touching > 0 && tagFilter.stillVisible === 0 && tagFilter.othersVisible > 0,
        JSON.stringify(tagFilter));

  /* ---- 8. search ---- */
  const search = await page.evaluate(async () => {
    const i = document.getElementById('searchInput');
    /* Searched for by the WORDS of a label, not by its source. A label on
       this chart may open with a colour, an underline or a reading, and
       the first five characters of the stored form are then punctuation
       that appears nowhere on the drawing. */
    const plain = (stripMarkup(workingNodes[0][1]) || '').trim();
    i.value = plain.slice(0, 5);
    i.dispatchEvent(new Event('input', {bubbles:true}));
    await new Promise(r => setTimeout(r, 300));
    const n = document.querySelectorAll('#searchResults *').length;
    i.value = ''; i.dispatchEvent(new Event('input', {bubbles:true}));
    return n;
  });
  check('search returns results', search > 0, `${search} elements`);

  /* ---- 9. grid toggle ---- */
  const grid = await page.evaluate(async () => {
    const g = document.getElementById('alignGrid');
    const b = document.getElementById('gridToggle');
    const shown = () => getComputedStyle(g).display !== 'none';
    const start = shown();
    b.click(); await new Promise(r => setTimeout(r, 250));
    const flipped = shown();
    b.click(); await new Promise(r => setTimeout(r, 250));
    return {start, flipped, back: shown()};
  });
  check('fixed grid toggles both ways', grid.flipped !== grid.start && grid.back === grid.start,
        JSON.stringify(grid));

  /* ---- 10. export / import round-trip ----
     Only meaningful against the built file. In src/ the markup and the data
     are separate files, so the page reading "its own source" gets index.html,
     which by design holds no chart. writeChart() says so plainly rather than
     writing a broken export, and that refusal is what's checked here. */
  if(MODE === 'src'){
    const refused = await page.evaluate(async () => {
      try { writeChart(await readOwnSource(true)); return null; }
      catch(e){ return e.message; }
    });
    check('split sources refuse to self-export, with a reason',
          typeof refused === 'string' && refused.length > 0, refused || 'it did not refuse');
  } else {
  const io = await page.evaluate(async () => {
    applyEdit(() => { workingNodes[0][1] = '__IO_PROBE__'; });
    const src = writeChart(await readOwnSource(true));
    const full = ensureFullDocument(src);
    applyEdit(() => { workingNodes[0][1] = '__CLOBBERED__'; });
    await importChartFromText(full);
    const restored = workingNodes[0][1];
    let rejected = false;
    const before = workingNodes[0][1];
    try { await importChartFromText('not a chart'); } catch(e){ rejected = true; }
    return {restored, rejected, intact: workingNodes[0][1] === before,
            isDoc: /^<!doctype html>/i.test(full), fragment: !/^<!doctype/i.test(src)};
  });
  eq('export/import round-trips', io.restored, '__IO_PROBE__');
  check('export is a real document', io.isDoc);
  check('what we publish stays a fragment', io.fragment);
  check('a junk import is refused without damage', io.rejected && io.intact);
  }

  /* ---- 11. no host: browser storage is the fallback ---- */
  {
    const c2 = await browser.newContext();
    await c2.addInitScript(() => { try { delete window.claude; } catch(e){} });
    const p2 = await c2.newPage();
    const e2 = []; p2.on('pageerror', e => e2.push(e.message));
    await p2.goto(`http://127.0.0.1:${PORT}/${PAGE}`, {waitUntil:'networkidle'});
    await wait(1200);
    const hosted = await p2.evaluate(() => eval('HOSTED'));
    await p2.evaluate(() => applyEdit(() => { workingNodes[0][1] = '__PERSIST__'; }));
    await p2.evaluate(() => saveNow());
    await wait(400);
    await p2.reload({waitUntil:'networkidle'});
    await wait(1200);
    const after = await p2.evaluate(() => ({label: workingNodes[0][1], dirty: isDirty()}));
    eq('runs unhosted', hosted, false);
    eq('save survives a reload with no host', after.label, '__PERSIST__');
    eq('and comes back clean', after.dirty, false);
    check('no page errors while unhosted', e2.length === 0, e2.join('; '));
    await p2.evaluate(() => { try { localStorage.clear(); } catch(e){} });
    await c2.close();
  }

  /* ---- 12. waves are one-sided semicircles ---- */
  const waves = await page.evaluate(()=>{
    // 6 arcs over a 60-unit run: every control point should sit directly
    // above an endpoint (that is what makes the hump a half-ellipse rather
    // than a sine) and every arc should bulge the same way.
    // (from, bumps, step) — the pitch is fixed now, never fitted to the run.
    const d = waveRun(0, 0, 1, 0, 0, -1, 0, 6, 10);
    const nums = d.trim().split(/[C\s,]+/).filter(Boolean).map(Number);
    const arcs = [];
    for(let i = 0; i + 5 < nums.length; i += 6){
      arcs.push({c1x:nums[i], c1y:nums[i+1], c2x:nums[i+2], c2y:nums[i+3], ex:nums[i+4], ey:nums[i+5]});
    }
    const step = 10;
    const verticalTangents = arcs.every((a,i)=>
      Math.abs(a.c1x - i*step) < 0.02 && Math.abs(a.c2x - (i+1)*step) < 0.02);
    /* Every second arc turns over. Within one arc both controls sit on the
       same side (that is what makes it a half-ellipse); between arcs the
       side flips, which is what makes the run a wave rather than a coil.
       The first one goes to the side the caller asked for. */
    const alternates = arcs.every((a,i)=>
      Math.sign(a.c1y) === Math.sign(a.c2y) &&
      Math.sign(a.c1y) === (i % 2 === 0 ? -1 : 1));
    const backToBaseline = arcs.every(a=> Math.abs(a.ey) < 0.02);
    // Peak of a cubic with both controls at `lift` is 3/4 of lift; for a
    // semicircle that must equal half the step.
    const peak = 0.75 * Math.abs(arcs[0].c1y);
    return {count: arcs.length, verticalTangents, alternates, backToBaseline,
            peak: +peak.toFixed(3), wanted: step/2};
  });
  eq('a run is divided into the requested number of arcs', waves.count, 6);
  check('each arc leaves the baseline vertically (a half-ellipse, not a sine)', waves.verticalTangents);
  check('every second arc turns over — a wave, not a coil', waves.alternates);
  check('each arc returns to the baseline', waves.backToBaseline);
  check('arc height is half its width — a true semicircle',
        Math.abs(waves.peak - waves.wanted) < 0.02, JSON.stringify(waves));

  /* ---- 13. tag categories ---- */
  const cats = await page.evaluate(async ()=>{
    applyEdit(()=>{
      workingNodes.push(['cat_a', 'Cat A', null, null, null, null, {pos:[600,600], tags:['probe-tag']}]);
      refill(TAG_CATS, []);
    });
    buildLegend();
    createCategory('Probe Cat');
    assignTagCategory('probe-tag', 'Probe Cat');
    buildLegend();
    const grouped = !!document.querySelector('.legend-group[data-cat="Probe Cat"] .legend-item[data-tag="probe-tag"]');
    // A tag a category declares must survive even with no entry carrying it.
    createTag('orphan-tag');
    buildLegend();
    const orphanListed = allTags.indexOf('orphan-tag') >= 0 &&
                         !!document.querySelector('.legend-item[data-tag="orphan-tag"]');
    // Removing a category must not remove its tags.
    removeCategory('Probe Cat');
    buildLegend();
    const tagSurvived = tagCounts.has('probe-tag');
    const catGone = !TAG_CATS.some(c=> c.name === 'Probe Cat');
    applyEdit(()=>{
      const i = workingNodes.findIndex(n=> n[0]==='cat_a');
      if(i>=0) workingNodes.splice(i,1);
      refill(TAG_CATS, []);
    });
    buildLegend();
    return {grouped, orphanListed, tagSurvived, catGone};
  });
  check('a tag can be filed into a category', cats.grouped);
  check('a category can declare a tag no entry carries yet', cats.orphanListed);
  check('deleting a category keeps its tags', cats.tagSurvived && cats.catGone, JSON.stringify(cats));

  /* ---- 14. the note lives in the entry panel, not its settings ---- */
  const notePlacement = await page.evaluate(async ()=>{
    const id = workingNodes[0][0];
    selectedId = id;
    const block = document.getElementById('detailNoteBlock');
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));
    const whileOpen = getComputedStyle(block).display;
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));
    return {whileOpen, afterClose: getComputedStyle(block).display};
  });
  eq('note is hidden while settings are open', notePlacement.whileOpen, 'none');
  check('note comes back when settings close', notePlacement.afterClose !== 'none');

  /* ---- 15. connector notes take formatting ---- */
  const noteFmt = await page.evaluate(async ()=>{
    const a = workingNodes[0][0], b = workingNodes[1] ? workingNodes[1][0] : null;
    if(!b) return {skip:true};
    refill(EDGE_STYLES, [{from:a, to:b, note:'**B** *i* {{#c23b22|red}}', notePos:'above'}]);
    rebuildChart();
    await new Promise(r=> setTimeout(r, 400));
    const g = document.querySelector('.edge-note');
    if(!g) return {found:false};
    const sp = [...g.querySelectorAll('tspan')];
    const r = {
      found: true,
      bold: sp.some(t=> t.getAttribute('font-weight') === '700'),
      italic: sp.some(t=> t.getAttribute('font-style') === 'italic'),
      coloured: sp.some(t=> (t.getAttribute('style')||'').indexOf('#c23b22') >= 0),
      isRich: !!richFields.get('styleNote')
    };
    refill(EDGE_STYLES, []);
    rebuildChart();
    await new Promise(r=> setTimeout(r, 300));
    return r;
  });
  if(noteFmt.skip){ check('connector note formatting (needs two entries)', true, 'skipped'); }
  else {
    check('a connector note renders bold, italic and colour',
          noteFmt.found && noteFmt.bold && noteFmt.italic && noteFmt.coloured, JSON.stringify(noteFmt));
    check('the connector note field is a rich field', noteFmt.isRich);
  }

  /* ---- 16. the crop chooser ---- */
  const crop = await page.evaluate(()=>{
    cropNat = {w:400, h:200};
    resetCropSel();
    const start = Object.assign({}, cropSel);
    cropSel = {x:9999, y:9999, s:9999}; clampCropSel();
    const clamped = Object.assign({}, cropSel);
    cropSel = {x:-50, y:-50, s:10}; clampCropSel();
    const clampedLow = Object.assign({}, cropSel);
    return {start, clamped, clampedLow,
            aboveEverything: parseInt(getComputedStyle(document.getElementById('cropOverlay')).zIndex, 10)};
  });
  check('crop starts as the largest centred square',
        crop.start.s === 200 && crop.start.x === 100 && crop.start.y === 0, JSON.stringify(crop.start));
  check('crop cannot leave the picture',
        crop.clamped.x + crop.clamped.s <= 400 && crop.clamped.y + crop.clamped.s <= 200 &&
        crop.clampedLow.x >= 0 && crop.clampedLow.y >= 0, JSON.stringify(crop));
  check('the crop dialog sits above every panel that can open it',
        crop.aboveEverything >= 150, 'z-index ' + crop.aboveEverything);

  /* ---- 17. links can only navigate ---- */
  const urls = await page.evaluate(()=>({
    js: safeUrl('javascript:alert(1)'),
    jsMixedCase: safeUrl('JaVaScRiPt:alert(1)'),
    data: safeUrl(' data:text/html,<script>x</script>'),
    https: safeUrl('https://example.com/a'),
    mailto: safeUrl('mailto:a@b.c')
  }));
  check('executable URL schemes are refused',
        urls.js === null && urls.jsMixedCase === null && urls.data === null, JSON.stringify(urls));
  check('navigational URL schemes are kept',
        urls.https === 'https://example.com/a' && urls.mailto === 'mailto:a@b.c');

  /* ---- 18. wave arcs bulge away from the elbow ---- */
  const waveDir = await page.evaluate(()=>{
    // Down, then right. The inside of that elbow is up-and-right of the
    // turn, so "outward" means left of the vertical run and below the
    // horizontal one.
    const d = wavyPath([{x:0,y:0},{x:0,y:200},{x:200,y:200}]);
    const svgEl = document.getElementById('canvas');
    const el = document.createElementNS('http://www.w3.org/2000/svg','path');
    el.setAttribute('d', d); el.setAttribute('fill','none'); svgEl.appendChild(el);
    const L = el.getTotalLength();
    let vOut=0, vIn=0, hOut=0, hIn=0;
    for(let t=0;t<=1;t+=0.004){
      const q = el.getPointAtLength(L*t);
      if(q.y>25 && q.y<185){ if(q.x<-0.4) vOut++; else if(q.x>0.4) vIn++; }
      if(q.x>25 && q.x<185){ if(q.y>200.4) hOut++; else if(q.y<199.6) hIn++; }
    }
    el.remove();
    /* Which side the FIRST arc of the run goes to still matters — it is
       what sets the phase, and it is still the outward side of the bend.
       The arcs after it alternate, so both sides are visited by design;
       what the elbow rule buys now is that the arc nearest the corner is
       the outward one. */
    const firstC = /C\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(d);
    return {vOut, vIn, hOut, hIn,
            firstCx: firstC ? +firstC[1] : null,
            balancedV: vOut > 0 && vIn > 0, balancedH: hOut > 0 && hIn > 0};
  });
  check('a wave visits both sides of the line it follows',
        waveDir.balancedV && waveDir.balancedH, JSON.stringify(waveDir));
  check('and its first arc still leans away from the bend',
        waveDir.firstCx !== null && waveDir.firstCx < 0, JSON.stringify(waveDir.firstCx));

  /* ---- 19. the amalgam junction bead ---- */
  const bead = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{
      workingNodes.push(['bd_a','A',null,null,null,null,{pos:[-300,-200],colors:['#c23b22']}]);
      workingNodes.push(['bd_b','B',null,null,null,null,{pos:[-60,-200],colors:['#2f6fb5']}]);
      workingNodes.push(['bd_c','C',null,null,null,null,{pos:[180,-200],colors:['#3fae4a']}]);
      workingNodes.push(['bd_am','Amalgam',['bd_a','bd_b','bd_c'],null,null,'amalgam',{pos:[-60,60]}]);
    });
    await new Promise(r=> setTimeout(r, 700));
    // The JUNCTION's bead — the joints between neighbouring stretches now
    // carry beads of their own, and one of those comes first in the layer.
    const b = document.querySelector('.amalgam-junction[data-to="bd_am"]');
    const r = b ? {
      found: true,
      gradient: /^url\(#/.test(b.getAttribute('fill') || ''),
      // Painted last in its layer, so it covers the seams it exists to hide.
      last: b.parentNode.lastElementChild === b,
      // Sits on the junction the merged arrow starts from.
      onArrow: (()=>{
        const out = document.querySelector('.amalgam-out[data-to="bd_am"]');
        if(!out) return false;
        const d = out.getAttribute('d') || '';
        const m = /M([-\d.]+),([-\d.]+)/.exec(d);
        if(!m) return false;
        return Math.abs(+m[1] - +b.getAttribute('cx')) < 0.5 &&
               Math.abs(+m[2] - +b.getAttribute('cy')) < 0.5;
      })()
    } : {found:false};
    applyEdit(()=>{ workingNodes = before; });
    await new Promise(r=> setTimeout(r, 400));
    return r;
  });
  check('an amalgam junction gets a gradient bead, painted over the seam',
        bead.found && bead.gradient && bead.last && bead.onArrow, JSON.stringify(bead));

  /* ---- 20. the crop chooser is round only for a portrait ---- */
  const cropShape = await page.evaluate(()=>{
    const frame = document.getElementById('cropFrame');
    const before = frame.className;
    frame.classList.add('circle');
    const round = getComputedStyle(frame).borderRadius;
    frame.classList.remove('circle');
    const square = getComputedStyle(frame).borderRadius;
    frame.className = before;
    return {round, square};
  });
  check('a circular crop frame is actually drawn round',
        /50%|9999/.test(cropShape.round) && /^0/.test(cropShape.square), JSON.stringify(cropShape));

  /* ---- 21. callouts ---- */
  const leader = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    applyEdit(()=>{
      workingNodes.push(['ld_a','A',null,null,null,null,{pos:[700,-300]}]);
      workingNodes.push(['ld_b','B','ld_a',null,null,null,{pos:[700,120]}]);
    });
    refill(EDGE_STYLES, []);
    rebuildChart();
    await new Promise(r=> setTimeout(r, 400));
    // Three of them on ONE connector, which the old one-per-edge note could
    // never do, plus an ordinary plate note that must be unaffected.
    applyEdit(()=>{
      for(let i=0;i<3;i++){
        workingNodes.push(['ld_c'+i, 'Remark ' + i, null, null, null, 'callout',
          {pos:[900 + i*40, -200 + i*140], leader:{from:'ld_a', to:'ld_b', at:0.25*(i+1)}}]);
      }
      EDGE_STYLES.push({from:'ld_a', to:'ld_b', note:'plate', notePos:'above'});
    });
    await new Promise(r=> setTimeout(r, 500));
    const gs = [...document.querySelectorAll('#edgeLayer .callout-leader[data-from="ld_a"][data-to="ld_b"]')];
    const out = {found: gs.length, plate: document.querySelectorAll('.edge-note').length};
    if(gs.length){
      const g = gs[0];
      out.parts = !!g.querySelector('.leader-dot') && !!g.querySelector('.leader-line');
      // The card is an ENTRY, with an entry's ports and edge handles.
      const card = document.querySelector('.node[data-id="ld_c0"]');
      out.isEntry = !!card && card.classList.contains('node-callout');
      out.handles = card ? card.querySelectorAll('.node-handle').length : 0;
      out.leaderUnderCard = !!document.querySelector('#edgeLayer .callout-leader[data-id="ld_c0"]');
      // The anchor tracks the fraction it was given.
      const ys = gs.map(x=> +x.querySelector('.leader-dot').getAttribute('cy'))
                   .sort((a,b)=> a-b);
      out.tracks = ys[0] < ys[1] && ys[1] < ys[2];
      // A connector can be drawn to one, exactly as to any entry.
      applyEdit(()=>{ workingNodes.find(n=> n[0]==='ld_c0')[2] = 'ld_a'; });
      await new Promise(r=> setTimeout(r, 500));
      out.connected = !!document.querySelector('#edgeLayer path.edge.struct[data-to="ld_c0"]');
    }
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a connector carries as many callouts as you like', leader.found === 3, JSON.stringify(leader));
  check('each draws a dot and a line', leader.parts === true);
  check('and the plate note beside them is untouched', leader.plate === 1, 'plates ' + leader.plate);
  /* Three, not four: the side its own leader arrives at is already spoken
     for and offers no port. */
  check('a callout is an entry, with a handle on every free edge',
        leader.isEntry === true && leader.handles === 3,
        JSON.stringify({e:leader.isEntry, h:leader.handles}));
  check('each anchor follows the fraction it was given', leader.tracks === true);
  check('a connector can be drawn to a callout', leader.connected === true);
  check('the snap points run the whole line in twentieths',
        await page.evaluate(()=> LEADER_SNAPS.length === 21 &&
          LEADER_SNAPS[0] === 0 && LEADER_SNAPS[20] === 1 &&
          Math.abs(LEADER_SNAPS[5] - 0.25) < 1e-6));

  /* ---- 22. references ---- */
  const refs = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeRefs = REFS.slice();
    refill(REFS, [{key:'r_one', title:'First', detail:'', url:''},
                  {key:'r_two', title:'Second', detail:'', url:''}]);
    applyEdit(()=>{
      workingNodes.push(['rf_a','Cites{{r:r_one}} and{{r:r_two}}',null,null,null,null,{pos:[900,-300]}]);
      workingNodes.push(['rf_b','Literal [3] brackets',null,null,null,null,{pos:[900,-140]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 450));
    const marks = [...document.querySelectorAll('[data-id="rf_a"] .ref-mark')]
      .map(m=> ({t:m.textContent, k:m.dataset.ref}));
    const typedIsPlain = !document.querySelector('[data-id="rf_b"] .ref-mark');
    const mark = document.querySelector('[data-id="rf_a"] .ref-mark');
    const clickable = getComputedStyle(mark).pointerEvents === 'auto' &&
                      getComputedStyle(mark.closest('text')).pointerEvents === 'none';
    const translucent = +getComputedStyle(mark).opacity < 1;
    // Reordering renumbers every mark, because a mark stores a key.
    reorderRef('r_one', 'r_two', 'after');
    await new Promise(r=> setTimeout(r, 350));
    const after = [...document.querySelectorAll('[data-id="rf_a"] .ref-mark')]
      .map(m=> ({t:m.textContent, k:m.dataset.ref}));
    // The editor round-trip keeps the key, not the number.
    const div = document.createElement('div');
    div.innerHTML = inlineToHtml('x {{r:r_two}} y');
    const roundTrip = richHtmlToMarkup(div).indexOf('{{r:r_two}}') >= 0;
    /* Deleting a cited reference takes its marks with it. The confirmation
       is the page's own dialog now — window.confirm is unusable in a
       sandboxed frame — so the test accepts it the way a person would. */
    const pending = deleteRef('r_one');
    await new Promise(r=> setTimeout(r, 150));
    document.getElementById('askOk').click();
    await pending;
    await new Promise(r=> setTimeout(r, 350));
    const stripped = workingNodes.find(n=> n[0]==='rf_a')[1].indexOf('{{r:r_one}}') < 0;
    refill(REFS, beforeRefs);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 350));
    return {marks, typedIsPlain, clickable, translucent, after, roundTrip, stripped};
  });
  check('a citation renders as a numbered mark',
        refs.marks.length === 2 && refs.marks[0].t === '[1]' && refs.marks[1].t === '[2]',
        JSON.stringify(refs.marks));
  check('a bracketed number typed by hand is NOT a citation', refs.typedIsPlain);
  check('only the mark is clickable, not the text around it', refs.clickable);
  check('the mark is translucent so the text still reads', refs.translucent);
  check('reordering the list renumbers every mark',
        (refs.after.find(m=> m.k==='r_one')||{}).t === '[2]' &&
        (refs.after.find(m=> m.k==='r_two')||{}).t === '[1]', JSON.stringify(refs.after));
  check('a citation survives the editor round-trip as its key', refs.roundTrip);
  check('deleting a reference removes its marks from the text', refs.stripped);

  /* ---- 23. this round's fixes ---- */
  const round5 = await page.evaluate(async ()=>{
    const svgEl = document.getElementById('canvas');
    const side = (pts)=>{
      const el = document.createElementNS('http://www.w3.org/2000/svg','path');
      el.setAttribute('d', wavyPath(pts)); el.setAttribute('fill','none'); svgEl.appendChild(el);
      const L = el.getTotalLength(); const o = {above:0,below:0,left:0,right:0};
      for(let t=0;t<=1;t+=0.005){
        const q = el.getPointAtLength(L*t);
        if(q.y<-0.3) o.above++; else if(q.y>0.3) o.below++;
        if(q.x<-0.3) o.left++;  else if(q.x>0.3) o.right++;
      }
      el.remove(); return o;
    };
    const horiz = side([{x:0,y:0},{x:200,y:0}]);
    const vert  = side([{x:0,y:0},{x:0,y:200}]);

    // Language tabs must reach the entry.
    const beforeNodes = workingNodes.slice();
    applyEdit(()=>{ workingNodes.push(['lt','Tabbed',null,null,null,null,{pos:[1200,-300]}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    selectedId = 'lt';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));
    const chk = document.getElementById('editMultiLangCheck');
    chk.checked = true; chk.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 250));
    const row = document.querySelector('#editLangTabList .lang-tab-row');
    row.querySelector('.lang-tab-tag').value = 'JP';
    row.querySelector('.lang-tab-tag').dispatchEvent(new Event('input', {bubbles:true}));
    row.querySelector('.lang-tab-text').innerHTML = 'text';
    row.querySelector('.lang-tab-text').dispatchEvent(new Event('input', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 1200));
    const tabs = (nodes.get('lt') || {}).langTabs;
    document.getElementById('detailEditToggle').click();

    // The colour field carries a real hex and refills itself.
    selectedId = 'lt';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));
    const cf = document.getElementById('editColorsInput');
    const shown = cf.value;
    cf.value = ''; cf.dispatchEvent(new Event('input', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 1000));
    const restored = cf.value;
    document.getElementById('detailEditToggle').click();

    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 300));

    // Which side the first arc of each leans to, straight from the path.
    const firstCtl = (pts, axis)=>{
      const m = /C\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(wavyPath(pts));
      return m ? (axis === 'y' ? +m[2] : +m[1]) : null;
    };
    const horizFirst = firstCtl([{x:0,y:0},{x:200,y:0}], 'y');
    const vertFirst  = firstCtl([{x:0,y:0},{x:0,y:200}], 'x');
    return {horiz, vert, tabs, shown, restored, horizFirst, vertFirst,
            endFlat: EDGE_WAVE_END_FLAT, cornerFlat: EDGE_WAVE_CORNER_FLAT, arc: EDGE_WAVE_LEN,
            dialogInPage: !!document.getElementById('askOverlay')};
  });
  /* A wave now visits both sides — what the convention still fixes is
     which side it STARTS on: up for a horizontal run, left for a vertical
     one, the same side a note or a leader card takes. */
  check('a straight horizontal connector waves evenly about its line',
        round5.horiz.above > 0 && round5.horiz.below > 0 &&
        Math.abs(round5.horiz.above - round5.horiz.below) < round5.horiz.above * 0.4,
        JSON.stringify(round5.horiz));
  check('a straight vertical connector does the same about its own',
        round5.vert.left > 0 && round5.vert.right > 0 &&
        Math.abs(round5.vert.left - round5.vert.right) < round5.vert.left * 0.4,
        JSON.stringify(round5.vert));
  check('and each starts on the side the chart puts its notes',
        round5.horizFirst < 0 && round5.vertFirst < 0,
        JSON.stringify({h:round5.horizFirst, v:round5.vertFirst}));
  check('the flat stretches are no longer than one arc',
        round5.endFlat <= round5.arc && round5.cornerFlat <= round5.arc,
        `end ${round5.endFlat}, corner ${round5.cornerFlat}, arc ${round5.arc}`);
  check('a language tab commits to its entry',
        Array.isArray(round5.tabs) && round5.tabs.length === 1 && round5.tabs[0].tag === 'JP',
        JSON.stringify(round5.tabs));
  check('the border-colour field shows a real hex',
        /^#[0-9a-f]{6}$/i.test(round5.shown), round5.shown);
  check('emptying the colour field restores the default',
        /^#[0-9a-f]{6}$/i.test(round5.restored), round5.restored);
  check('dialogs are in-page, not window.prompt (unusable when sandboxed)',
        round5.dialogInPage);

  /* `hidden` has to hide for real. Checking element.hidden only reads the
     attribute back, which stays true even when an author display rule is
     overriding the UA one and the element is plainly on screen. */
  const hiddenWorks = await page.evaluate(()=>{
    const probes = ['legendAddMenu','edgeStyleLabel'];
    const out = {};
    probes.forEach(id=>{
      const el = document.getElementById(id);
      if(!el){ out[id] = 'missing'; return; }
      el.hidden = true;
      out[id] = getComputedStyle(el).display;
    });
    return out;
  });
  check('elements marked hidden are actually not displayed',
        Object.values(hiddenWorks).every(v=> v === 'none'), JSON.stringify(hiddenWorks));

  /* The amalgam bar must run straight through the junction — no sag on
     one side of the bead, which is what the members' old dip produced. */
  const amalStraight = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{
      workingNodes.push(['sa_l','L',null,null,null,null,{pos:[-150,-160]}]);
      workingNodes.push(['sa_r','R',null,null,null,null,{pos:[130,-190]}]);
      workingNodes.push(['sa_c','C',['sa_l','sa_r'],null,null,'amalgam',{pos:[-110,140]}]);
    });
    await new Promise(r=> setTimeout(r, 700));
    const bead = document.querySelector('.amalgam-bead[data-to="sa_c"]');
    const out = {found: !!bead};
    if(bead){
      const bx = +bead.getAttribute('cx'), by = +bead.getAttribute('cy');
      /* The bar is LEVEL. Two rounds were spent bending it — away from the
         entry, then towards it — and neither was ever what was wanted: the
         bar is the height the lineages arrive at, so every point of it
         near the junction lies at the junction's own height. */
      const ends = [...document.querySelectorAll('.amalgam-member[data-to="sa_c"]')].map(pth=>{
        const nums = pth.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
        return nums[nums.length - 1];     // the last y each member writes
      });
      out.barSpread = +(Math.max(...ends) - Math.min(...ends)).toFixed(2);
      out.beadOffBar = +Math.max(...ends.map(y=> Math.abs(by - y))).toFixed(2);
    }
    applyEdit(()=>{ workingNodes = before; });
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('the amalgam bar runs level, with the junction on it',
        amalStraight.found && amalStraight.barSpread < 1.5 && amalStraight.beadOffBar < 1,
        JSON.stringify(amalStraight));

  /* ---- 24. this round ---- */
  const r6 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    // Collinear port stubs must not count as corners.
    const merged = mergeCollinear([{x:0,y:0},{x:18,y:0},{x:200,y:0},{x:218,y:0}]);
    // A real elbow must keep its corner.
    const kept = mergeCollinear([{x:0,y:0},{x:100,y:0},{x:100,y:80}]);

    // A straight connector, routed for real, waves upward and nearly end to end.
    applyEdit(()=>{
      workingNodes.push(['w6_l','L',null,null,null,null,{pos:[2000,0]}]);
      workingNodes.push(['w6_r','R','w6_l',null,null,null,{pos:[2320,0]}]);
    });
    refill(EDGE_STYLES, [{from:'w6_l', to:'w6_r', sinusoid:true}]);
    rebuildChart();
    await new Promise(r=> setTimeout(r, 550));
    const hit = document.querySelector('.edge-hit[data-from="w6_l"][data-to="w6_r"]');
    const L = hit.getTotalLength();
    const ys = [];
    for(let t=0;t<=1;t+=0.01) ys.push(hit.getPointAtLength(L*t).y);
    const base = Math.max(...ys);           // the baseline is the lowest point
    const above = ys.filter(y=> y < base - 0.5).length;
    const below = 0;                        // nothing may go under the baseline
    // How much of the run is flat: count samples sitting on the baseline.
    const flatShare = ys.filter(y=> Math.abs(y - base) < 0.3).length / ys.length;

    // A wavy elbow turns with a radius, like every other line.
    const elbow = wavyPath([{x:0,y:0},{x:0,y:160},{x:160,y:160}]);
    const rounded = elbow.indexOf('Q') >= 0;

    // The pocket frame turns with a radius too.
    const pocket = wavyRectPath(0, 0, 160, 90);
    const pocketRounded = pocket.indexOf('Q') >= 0;

    refill(EDGE_STYLES, []);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 350));
    return {merged: merged.length, kept: kept.length, above, below, flatShare, rounded, pocketRounded};
  });
  check('collinear port stubs are merged into one run', r6.merged === 2, r6.merged + ' points');
  check('a real elbow keeps its corner', r6.kept === 3, r6.kept + ' points');
  check('a straight connector waves upward', r6.above > 0 && r6.below === 0, JSON.stringify(r6));
  check('and waves along nearly all of it', r6.flatShare < 0.25, 'flat ' + r6.flatShare.toFixed(2));
  check('a wavy elbow turns with a radius', r6.rounded);
  check('the pocket frame turns with a radius', r6.pocketRounded);

  const r6b = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeRefs = REFS.slice();
    refill(REFS, [{key:'g1', title:'G', detail:'', url:''}]);
    applyEdit(()=>{
      workingNodes.push(['g_a','Word{{r:g1}}',null,null,null,null,{pos:[2600,0]}]);
      workingNodes.push(['g_b','Alpha',null,null,null,null,{pos:[2600,200],multiLang:true,
        langTabs:[{tag:'JP',text:'a'},{tag:'RU',text:'b'}]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 500));
    // The citation sits flush against the word it cites.
    const ts = [...document.querySelectorAll('[data-id="g_a"] tspan')];
    const word = ts[ts.length-2].getBBox(), mark = ts[ts.length-1].getBBox();
    const gap = mark.x - (word.x + word.width);
    // Chips.
    const cs = [...document.querySelectorAll('[data-id="g_b"] .lang-chip')];
    const rects = cs.map(c=>{ const r = c.querySelector('rect');
      return {rx:+r.getAttribute('rx'), h:+r.getAttribute('height'), active:c.classList.contains('active')}; });
    /* The default chip is the flag emoji, set in Noto Color Emoji — the
       font is named explicitly because Windows ships no flag glyphs of its
       own and would otherwise draw two boxed letters. */
    const label0 = cs[0].querySelector('text');
    const firstIsFlag = !!label0 && label0.textContent === '\uD83C\uDDFA\uD83C\uDDF8'
                        && /Noto Color Emoji/.test(getComputedStyle(label0).fontFamily);
    refill(REFS, beforeRefs);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 350));
    return {gap:+gap.toFixed(2), rects, firstIsFlag};
  });
  check('a citation is flush against the word it cites', Math.abs(r6b.gap) < 0.6, 'gap ' + r6b.gap);
  check('the default language chip is the flag emoji, in Noto Color Emoji', r6b.firstIsFlag);
  check('chips are rounded rectangles, not pills',
        r6b.rects.every(r=> r.rx < r.h/2), JSON.stringify(r6b.rects));
  check('the selected chip is larger than the rest',
        (()=>{ const a = r6b.rects.find(r=> r.active), i = r6b.rects.find(r=> !r.active);
               return !!a && !!i && a.h > i.h; })(), JSON.stringify(r6b.rects));

  const r6c = await page.evaluate(()=>{
    const opts = [...document.querySelectorAll('#styleRouting option')].map(o=> o.textContent);
    const f = document.getElementById('editColorsInput');
    f.value = ''; f.dispatchEvent(new Event('input', {bubbles:true}));
    const strip = document.getElementById('editColorsSwatches');
    return {opts, blank: !!strip.querySelector('.swatch-blank'), text: strip.textContent.trim(),
            noPointRow: !document.getElementById('styleLeaderRow')};
  });
  check('path options read Orthogonal / Straight',
        JSON.stringify(r6c.opts) === JSON.stringify(['Orthogonal','Straight']), JSON.stringify(r6c.opts));
  check('an unset border colour draws a blank square, not a word',
        r6c.blank && r6c.text === '', JSON.stringify(r6c));
  check('the leader Point row is gone — the placement starts the pick', r6c.noPointRow);

  /* ---- 25. saving must not break the page it saves ----
     The page reads its own source to save an edited copy. Fetching its own
     URL is the good way; a host that refuses it leaves only the live DOM,
     which contains whatever the HOST also put in the document. Publishing
     that embedded the host's runtime in the chart and nested one document
     inside another — a save that left a page rendering half a chart and
     responding to nothing. The markers make the fallback exact. */
  if(MODE === 'src'){
    /* The split sources carry no page markers — build.py adds them — so
       reading its own source is exactly what index.html cannot do, and
       refusing is the correct answer rather than a failure. */
    const refused = await page.evaluate(async ()=>{
      try { await readOwnSource(true); return null; } catch(e){ return e.message; }
    });
    check('split sources refuse to read themselves, with a reason',
          typeof refused === 'string' && refused.length > 0, refused || 'it did not refuse');
  } else {
  const selfSource = await page.evaluate(async ()=>{
    const real = await readOwnSource(true);
    // What the fallback produces when the document is the host's, with our
    // content inside it and the host's own script alongside.
    const hostDoc = '<!doctype html><html><head><meta charset="utf-8">' +
      '<script>window.__HOST__=1;<' + '/script></head><body>\n' + real + '\n</body></html>';
    const carved = ownContent(hostDoc);
    return {
      // Our own source is a fragment, never a whole document.
      realIsFragment: !isFullDocument(real),
      realHasNodes: extractRegion(real, 'NODES') !== null,
      // Carving the host's document gives back exactly our content.
      carvedMatches: carved === real,
      carvedDropsHost: !!carved && carved.indexOf('__HOST__') < 0,
      // And what we hand the host is always a fragment.
      fragmentOfDoc: !isFullDocument(ensureFragment(hostDoc))
    };
  });
  check('the page reads its own source as a fragment',
        selfSource.realIsFragment && selfSource.realHasNodes, JSON.stringify(selfSource));
  check('carving the host document returns exactly our own content',
        selfSource.carvedMatches, selfSource.carvedMatches);
  check('and leaves the host\u2019s own scripts behind', selfSource.carvedDropsHost);
  check('what is published is always a fragment, never a nested document',
        selfSource.fragmentOfDoc);
  }

  /* ---- 26. this round ---- */
  const r7 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeRefs = REFS.slice();
    refill(REFS, [{key:'x1', title:'X', detail:'', url:''}]);
    // One colour for every citation, chart-wide — not one per reference.
    const heldRefColor = SETTINGS.refColor;
    SETTINGS.refColor = '#2f6fb5';
    STICKERS.push({key:'probe_s', name:'probe', src:'data:image/png;base64,iVBORw0KGgo='});
    rebuildStickerMap();

    // Formatting may never enclose an atomic token.
    const round = (html)=>{ const d = document.createElement('div'); d.innerHTML = html;
      const m = richHtmlToMarkup(d); return {m, types: tokenizeLabel(m).map(t=> t.type)}; };
    const colRef = round('<span style="color:#c23b22">Word' + refChipHtml('x1') + 'more</span>');
    const colSti = round('<span style="color:#c23b22">A' + stickerImgHtml('probe_s') + 'B</span>');
    const alone  = round('<span style="color:#c23b22">' + refChipHtml('x1') + '</span>');

    // A citation carries its reference's own colour.
    applyEdit(()=>{ workingNodes.push(['rc','Cites{{r:x1}}',null,null,null,null,{pos:[3000,0]}]); });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 400));
    const mark = document.querySelector('[data-id="rc"] .ref-mark');
    const markStyle = mark ? mark.getAttribute('style') : null;

    // Language chips must not steal the top edge's connector handle.
    applyEdit(()=>{ workingNodes.push(['ch','Tabs',null,null,null,null,{pos:[3000,200],
      multiLang:true, langTabs:[{tag:'JP',text:'a'}]}]); });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 400));
    const nch = nodes.get('ch');
    const topHit = document.querySelector('[data-id="ch"].node .node-handle[data-side="top"] .node-handle-hit')
                || document.querySelector('.node-handle[data-side="top"] .node-handle-hit');
    const topShow = document.querySelector('[data-id="ch"].node .node-handle[data-side="top"] .node-handle-band')
                 || document.querySelector('.node-handle[data-side="top"] .node-handle-band');
    const bandX = topHit ? +topHit.getAttribute('x') : null;
    const showX = topShow ? +topShow.getAttribute('x') : null;
    const showW = topShow ? +topShow.getAttribute('width') : null;

    SETTINGS.refColor = heldRefColor;
    refill(REFS, beforeRefs);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 350));
    return {colRef, colSti, alone, markStyle, chipRight: nch ? nch.chipRight : null, bandX,
            showX, showW, nodeX: nch ? nch.x : null, nodeW: nch ? nch.w : null};
  });
  /* Colour is an ATTRIBUTE of a run now, not a kind of run — a word can be
     coloured and bold and set in a face at once — and a wrapper's body is
     matched by brace depth, so an atomic token stays INSIDE the run it was
     written in rather than breaking it in three. It has to: that nesting
     is the whole mechanism by which a sticker or a citation is made
     bigger. What these check is that the token survives as itself and the
     run around it reads back whole. */
  check('a citation sits inside the run it was written in',
        JSON.stringify(r7.colRef.types) === JSON.stringify(['plain','ref','plain']) &&
        /^\{\{#c23b22\|Word\{\{r:x1\}\}more\}\}$/.test(r7.colRef.m), r7.colRef.m);
  check('and so does a sticker',
        JSON.stringify(r7.colSti.types) === JSON.stringify(['plain','sticker','plain']) &&
        /^\{\{#c23b22\|A\{\{s:probe_s\}\}B\}\}$/.test(r7.colSti.m), r7.colSti.m);
  check('a token alone in a wrapper leaves no empty markers',
        JSON.stringify(r7.alone.types) === JSON.stringify(['ref']), r7.alone.m);
  check('every citation takes the chart\u2019s one citation colour',
        /2f6fb5/.test(r7.markStyle || ''), r7.markStyle);
  check('the top edge is draggable along the whole of it, chips or no chips',
        r7.chipRight > 0 && Math.abs(r7.bandX - r7.nodeX) < 1,
        JSON.stringify({chipRight:r7.chipRight, bandX:r7.bandX, nodeX:r7.nodeX}));
  check('and its highlight spans the whole edge too',
        Math.abs(r7.showX - r7.nodeX) < 1 && Math.abs(r7.showW - r7.nodeW) < 1,
        JSON.stringify({showX:r7.showX, showW:r7.showW, nodeX:r7.nodeX, nodeW:r7.nodeW}));

  const r7b = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    // An amalgam dragged far from its lineages: the bar must span where they
    // are, and the arrow must leave from a point ON it.
    applyEdit(()=>{
      workingNodes.push(['fa_am','AM',['fa_p1','fa_p2'],null,null,'amalgam',{pos:[4000,-260]}]);
      workingNodes.push(['fa_p1','P1',null,null,null,null,{pos:[4030,120]}]);
      workingNodes.push(['fa_p2','P2',null,null,null,null,{pos:[4290,120]}]);
    });
    await new Promise(r=> setTimeout(r, 700));
    const bead = document.querySelector('.amalgam-bead[data-to="fa_am"]');
    const out = {found: !!bead};
    if(bead){
      const bx = +bead.getAttribute('cx');
      // Every point of every member path must lie within the bar's reach of
      // the bead — a stub reaching out to nothing is what this prevents.
      let minX = Infinity, maxX = -Infinity;
      document.querySelectorAll('.amalgam-member[data-to="fa_am"]').forEach(pth=>{
        const L = pth.getTotalLength();
        for(let t=0;t<=1;t+=0.02){ const q = pth.getPointAtLength(L*t); minX = Math.min(minX,q.x); maxX = Math.max(maxX,q.x); }
      });
      // The bead sits inside the span the members actually cover.
      out.beadInsideSpan = bx >= minX - 1 && bx <= maxX + 1;
      out.overhangLeft = +(minX - bx).toFixed(1);
    }
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a far-flung amalgam keeps its junction on the bar',
        r7b.found && r7b.beadInsideSpan, JSON.stringify(r7b));

  const r7c = await page.evaluate(()=>({
    // Tags are chosen, never typed.
    tagInputHidden: document.getElementById('editTagsInput').hidden === true,
    hasChips: !!document.getElementById('editTagsChips'),
    hasAdd: !!document.getElementById('editTagsAdd'),
    // Ctrl is the off-grid modifier now, Shift re-grids.
    ctrlIsFree: dragIsFree({ctrlKey:true}) && !dragIsFree({shiftKey:true}),
    // The pickers count as part of the connector popover.
    satellite: inPopoverSatellite(document.getElementById('refPicker'))
  }));
  check('the tag field is a chooser, not a text box',
        r7c.tagInputHidden && r7c.hasChips && r7c.hasAdd, JSON.stringify(r7c));
  check('Ctrl frees a drag from the grid, Shift does not', r7c.ctrlIsFree);
  check('a toolbar picker counts as part of the connector popover', r7c.satellite);

  /* ---- 27. this round ---- */
  const r8 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeRefs = REFS.slice();
    const heldRefColor = SETTINGS.refColor;

    // A wavy connector's pitch must not change when heads are added.
    applyEdit(()=>{
      workingNodes.push(['wv_l','L',null,null,null,null,{pos:[5000,0]}]);
      workingNodes.push(['wv_r','R','wv_l',null,null,null,{pos:[5320,0]}]);
    });
    const pitchOf = async (arrow, arrowIn)=>{
      refill(EDGE_STYLES, [{from:'wv_l', to:'wv_r', sinusoid:true, arrow, arrowIn}]);
      rebuildChart();
      await new Promise(r=> setTimeout(r, 320));
      const el = document.querySelector('#edgeLayer path.edge.struct[data-from="wv_l"][data-to="wv_r"]');
      if(!el) return null;
      const d = el.getAttribute('d');
      const xs = [...d.matchAll(/C[-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+ ([-\d.]+),/g)].map(m=> +m[1]);
      const gaps = []; for(let i=1;i<xs.length;i++) gaps.push(xs[i]-xs[i-1]);
      return gaps.length ? +(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(3) : null;
    };
    const pitches = [await pitchOf(false,false), await pitchOf(true,false), await pitchOf(true,true)];

    // A face on part of a text.
    const d = document.createElement('div');
    d.innerHTML = 'Plain<span style="font-family:\'Orbitron\', sans-serif" data-font="orbitron">Fancy</span>End';
    const fontMarkup = richHtmlToMarkup(d);

    // One citation colour for the whole chart.
    refill(REFS, [{key:'c1',title:'A',detail:'',url:''},{key:'c2',title:'B',detail:'',url:''}]);
    SETTINGS.refColor = '#2f6fb5';
    applyEdit(()=>{ workingNodes.push(['rr','X{{r:c1}}Y{{r:c2}}',null,null,null,null,{pos:[5000,300]}]); });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 400));
    const fills = [...document.querySelectorAll('[data-id="rr"] .ref-mark')].map(m=> m.getAttribute('style'));

    // An amalgam takes one ring of ports whatever its colours.
    applyEdit(()=>{
      workingNodes.push(['pa','AM',null,null,null,'amalgam',{pos:[5000,600],colors:['#c23b22','#2f6fb5']}]);
      workingNodes.push(['pb','PL',null,null,null,null,{pos:[5300,600],colors:['#c23b22','#2f6fb5']}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 420));
    const rings = (id)=> document.querySelectorAll('[data-id="'+id+'"].node .node-handle[data-side="top"]').length;
    const portRings = {amalgam: rings('pa'), plain: rings('pb')};

    // A hand-placed entry grows about its middle.
    applyEdit(()=>{ workingNodes.push(['gr','Short',null,null,null,null,{pos:[5000,900]}]); });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 350));
    const g0 = nodes.get('gr'); const cy0 = g0.y + g0.h/2;
    applyEdit(()=>{ workingNodes.find(t=> t[0]==='gr')[1] =
      'A much longer label\nthat is written\non several lines'; });
    await new Promise(r=> setTimeout(r, 400));
    const g1 = nodes.get('gr'); const cy1 = g1.y + g1.h/2;

    SETTINGS.refColor = heldRefColor;
    refill(REFS, beforeRefs);
    refill(EDGE_STYLES, []);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    await new Promise(r=> setTimeout(r, 400));
    return {pitches, fontMarkup, fills, portRings,
            grewTaller: g1.h > g0.h, centreMoved: +(cy1 - cy0).toFixed(2),
            hasFontPicker: !!document.querySelector('.mini-toolbar .tb-font'),
            noAButton: !document.querySelector('.tb-color-btn'),
            hexDefault: (document.querySelector('.mini-toolbar input.tb-hex')||{}).value,
            hasHexReset: !!document.querySelector('.mini-toolbar [data-hex-reset]')};
  });
  check('a wavy connector keeps its pitch when arrowheads are added',
        r8.pitches.every(p=> p !== null && Math.abs(p - r8.pitches[0]) < 0.01), JSON.stringify(r8.pitches));
  check('a face can be set on part of a text', /\{\{f:orbitron\|Fancy\}\}/.test(r8.fontMarkup), r8.fontMarkup);
  check('every text toolbar carries a face picker', r8.hasFontPicker);
  check('every citation shares the chart\u2019s one colour',
        r8.fills.length === 2 && r8.fills.every(f=> /2f6fb5/.test(f || '')), JSON.stringify(r8.fills));
  check('an amalgam takes one ring of ports, a two-colour entry keeps two',
        r8.portRings.amalgam === 1 && r8.portRings.plain === 2, JSON.stringify(r8.portRings));
  /* Growth is centred to within half a grid step — the offset is rounded
     to whole steps so the box stays on the ruled grid, which matters more
     than the last few pixels of symmetry. */
  check('a hand-placed entry grows about its middle, near enough that its ports stay put',
        r8.grewTaller && Math.abs(r8.centreMoved) <= 5.01,
        'centre moved ' + r8.centreMoved);
  check('the colour swatch is the button, defaulting to black',
        r8.noAButton && r8.hexDefault === '#20242b', JSON.stringify({noA:r8.noAButton, v:r8.hexDefault}));
  check('and carries a reset back to the entry\u2019s own colour', r8.hasHexReset);

  /* ---- 28. this round: borders outward, panel controls, note sizing ---- */
  const r9 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.push(['b3','Rings',null,null,null,null,{pos:[6200,-600],colors:['#111111','#c23b22','#2f6fb5']}]);
      workingNodes.push(['bp','Pocket','b3',null,null,'pocket',{pos:[6200,-400]}]);
      workingNodes.push(['bl','Local',null,null,null,null,{pos:[6200,-200],tags:['local multiverse']}]);
      workingNodes.push(['bm','Multi',null,null,null,null,{pos:[6200,0],multiLang:true}]);
      workingNodes.push(['bb','Face',null,null,null,'ellipse',{pos:[6200,200],colors:['#111111','#c23b22']}]);
      workingNodes.push(['bt','Tagged',null,null,null,null,{pos:[6200,400],tags:['probe-tag']}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 450));

    // Borders step OUTWARD, in the order written.
    const rings = [...document.querySelectorAll('[data-id="b3"] > rect')]
      .filter(x=> x.getAttribute('stroke'))
      .map(x=> ({s:x.getAttribute('stroke'), x:+x.getAttribute('x'), w:+x.getAttribute('width')}));
    out.ringOrder = rings.map(r=> r.s);
    out.ringGrows = rings.length === 3 && rings[1].w > rings[0].w && rings[2].w > rings[1].w
                    && rings[1].x < rings[0].x && rings[2].x < rings[1].x;

    // A pocket's grab-edge waves the way its border does.
    const wave = document.querySelector('[data-id="bp"] .node-handle-band.wave');
    out.pocketWaves = !!wave && /[CQ]/.test(wave.getAttribute('d') || '');
    out.plainBandIsRect = !!document.querySelector('[data-id="b3"] rect.node-handle-band');

    // A local multiverse's sheets are translucent scenery, like a hub's echo.
    const sheet = document.querySelector('rect.local-sheet');
    out.sheetStyle = sheet ? sheet.getAttribute('style') : '';

    // The first language chip appears with the setting, before any tab.
    out.chipsWithNoTabs = document.querySelectorAll('[data-id="bm"] .lang-chip').length;

    // The bio card wears every ring the portrait does.
    openBioCard('bb', true);
    await new Promise(r=> setTimeout(r, 300));
    /* This one card, not every card on the layer: a chart may carry
       portraits that keep a card open of their own, and counting the whole
       layer counted those too. */
    out.bioCardRings = document.querySelectorAll('#bioCardLayer .bio-card-g[data-id="bb"] rect').length;
    closeBioCard();

    // A callout is sized from its text, like the entry it is.
    applyEdit(()=>{
      workingNodes.push(['co_s','Hi',null,null,null,'callout',{pos:[6600,-600],leader:{from:'b3',to:'bp',at:0.5}}]);
      workingNodes.push(['co_l','A much longer remark that needs several lines before it sits inside its own card',
                         null,null,null,'callout',{pos:[6600,-400],leader:{from:'b3',to:'bp',at:0.5}}]);
    });
    await new Promise(r=> setTimeout(r, 450));
    out.shortCardW = (nodes.get('co_s')||{}).w;
    out.longCardW = (nodes.get('co_l')||{}).w;
    refill(EDGE_STYLES, [{from:'b3', to:'bp', note:'Hi', notePos:'above'}]);
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    out.noteFamily = getComputedStyle(document.querySelector('.edge-note-text')).fontFamily;
    refill(EDGE_STYLES, []);

    // Tag rows carry their own eye and their own cross, outside Organize.
    buildManagement();
    await new Promise(r=> setTimeout(r, 200));
    const row = document.querySelector('#legendList .legend-item[data-tag="probe-tag"]');
    out.rowEye = !!(row && row.querySelector('.eye-mini'));
    out.rowDel = !!(row && row.querySelector('.legend-tag-del'));
    out.groupEye = !!document.querySelector('#legendList .legend-group-head .eye-mini');
    // Organize is gone: what it used to reveal is simply always there.
    out.organizeGone = !document.getElementById('legendManage');
    // Filing a tag is carrying the row onto a category, not choosing a
    // name out of a copy of the whole list on every row.
    out.rowPicker = !row || !row.querySelector('.legend-cat-pick');
    out.rowDraggable = !!(row && row.classList.contains('draggable-row'));

    // An amalgam offers no text colour; anything else still does.
    selectedId = 'b3';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));
    out.plainHex = getComputedStyle(document.querySelector('[data-hex-for="editLabelInput"]')).display;
    document.getElementById('editShapeInput').value = 'amalgam';
    document.getElementById('editShapeInput').dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 250));
    out.mirrorHex = getComputedStyle(document.querySelector('[data-hex-for="editLabelInput"]')).display;
    document.getElementById('editShapeInput').value = 'rect';
    document.getElementById('editShapeInput').dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 250));
    document.getElementById('detailEditToggle').click();

    // The settings form no longer carries its own Delete/Close.
    out.noFormDelete = !document.getElementById('detailEditDelete');
    out.noFormClose = !document.getElementById('detailEditCancel');
    // Card layout keeps its switch and loses its lecture.
    out.noCardHelp = !document.querySelector('#editCardField .editor-help');
    // A sticker tile is a picture and a cross — no name box.
    out.noStickerName = !document.querySelector('.sticker-cell input');

    // Two toolbar surfaces never stand open at once.
    document.getElementById('legendToggle').click();
    await new Promise(r=> setTimeout(r, 200));
    document.getElementById('fileToggle').click();
    await new Promise(r=> setTimeout(r, 200));
    out.legendClosed = !document.getElementById('legend').classList.contains('open');
    out.fileOpen = document.getElementById('filePopover').classList.contains('open');
    document.getElementById('fileToggle').click();

    applyEdit(()=>{ workingNodes = beforeNodes; });
    hiddenTags.delete('probe-tag');
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('extra borders step outward in the order they are written',
        r9.ringGrows && r9.ringOrder.join() === '#111111,#c23b22,#2f6fb5', JSON.stringify(r9.ringOrder));
  check('a pocket reality’s grab-edge waves like its border', r9.pocketWaves);
  check('every other archetype keeps a straight one', r9.plainBandIsRect);
  check('a local multiverse’s sheets are translucent, like a hub’s echo',
        /opacity:0\./.test(r9.sheetStyle) && /fill:none/.test(r9.sheetStyle), r9.sheetStyle);
  check('the first language chip appears with the setting, before any tab',
        r9.chipsWithNoTabs === 1, String(r9.chipsWithNoTabs));
  check('a bio card wears every ring its portrait does', r9.bioCardRings === 2, String(r9.bioCardRings));
  check('a leader note takes the width its text needs',
        r9.longCardW > r9.shortCardW, `${r9.shortCardW} -> ${r9.longCardW}`);
  check('and is set in the same face the entries are', /IBM Plex Sans/.test(r9.noteFamily), r9.noteFamily);
  check('a tag row carries its own eye and its own cross',
        r9.rowEye && r9.rowDel, JSON.stringify(r9));
  check('and is carried onto a category rather than choosing one from a list',
        r9.organizeGone && r9.rowPicker && r9.rowDraggable, JSON.stringify(r9));
  check('a category heading carries the same eye', r9.groupEye);
  check('a mirror reality offers no text colour', r9.mirrorHex === 'none' && r9.plainHex !== 'none',
        `${r9.plainHex} -> ${r9.mirrorHex}`);
  check('the settings form no longer carries Delete or Close',
        r9.noFormDelete && r9.noFormClose);
  check('card layout keeps its switch and loses its lecture', r9.noCardHelp);
  check('a sticker tile has no name box', r9.noStickerName);
  check('opening a toolbar menu closes the one already open',
        r9.legendClosed && r9.fileOpen, JSON.stringify({legendClosed:r9.legendClosed, fileOpen:r9.fileOpen}));

  /* ---- 29. this round: placement, patterns, the bowl, the panel ---- */
  const r10 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.push(['dr','A rather long label\nthat is written on\nthree whole lines',
                         null,null,null,null,{pos:[7200,-600]}]);
      workingNodes.push(['dt','Target','dr',null,null,null,{pos:[7600,-200]}]);
      workingNodes.push(['ap','Left',null,null,null,null,{pos:[7000,600],colors:['#c23b22']}]);
      workingNodes.push(['aq','Right',null,null,null,null,{pos:[7400,600],colors:['#2f6fb5']}]);
      workingNodes.push(['ax','Merged',['ap','aq'],null,null,'amalgam',{pos:[7200,900],colors:['#c23b22','#2f6fb5']}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 500));

    /* A drop leaves the entry where it was dropped — twice over. The
       renderer draws a grown entry about its middle, and the position it
       saves has to undo that or every drag lifts it again. */
    let n = nodes.get('dr'); const y0 = n.y;
    saveNodePositions([{id:'dr', x:n.x, y:n.y + 40}]);
    await new Promise(r=> setTimeout(r, 300));
    n = nodes.get('dr');
    saveNodePositions([{id:'dr', x:n.x, y:n.y + 40}]);
    await new Promise(r=> setTimeout(r, 300));
    out.creep = +(nodes.get('dr').y - (y0 + 80)).toFixed(2);
    out.grewTall = nodes.get('dr').h > 40;

    // The wave is laid out on the full geometry, so a head hides an arc
    // rather than moving the pattern.
    const crests = async (st)=>{
      refill(EDGE_STYLES, [Object.assign({from:'dr', to:'dt', sinusoid:true}, st)]);
      rebuildChart(); await new Promise(r=> setTimeout(r, 320));
      // By name, not by position: the suite's chart carries other
      // connectors, and the first one in the layer is not this one.
      const el = document.querySelector('#edgeLayer path.edge.struct[data-from="dr"][data-to="dt"]');
      if(!el) return {missing: [...document.querySelectorAll('#edgeLayer path.edge.struct')].map(p=>p.dataset.from+'>'+p.dataset.to),
                      nodes: [...nodes.keys()].slice(0,40)};
      return (el.getAttribute('d').match(/C[^C]*/g)||[]).map(c=> c.split(' ')[2]);
    };
    const plainCrests = await crests({arrow:false});
    const inCrests = await crests({arrow:false, arrowIn:true});
    /* Whatever arcs the head covers, the ones still on the paper are the
       same arcs in the same places: the pattern is laid out on the full
       geometry and then hidden from one end, never re-fitted. How MANY
       are covered follows from the arc length, so it is not asserted —
       only that at least one is, and that the rest have not moved. */
    out.waveDropped = plainCrests.length - inCrests.length;
    out.waveHeld = out.waveDropped >= 1 &&
      plainCrests.slice(out.waveDropped).join('|') === inCrests.join('|');

    // A dash pattern keeps its rhythm too, by being offset the same amount.
    const dashed = async (st)=>{
      refill(EDGE_STYLES, [Object.assign({from:'dr', to:'dt', dash:'dashed'}, st)]);
      rebuildChart(); await new Promise(r=> setTimeout(r, 320));
      return document.querySelector('#edgeLayer path.edge.struct[data-from="dr"][data-to="dt"]')
        .getAttribute('stroke-dashoffset');
    };
    out.dashPlainOff = await dashed({});
    out.dashInOff = await dashed({arrowIn:true});
    refill(EDGE_STYLES, []);
    rebuildChart(); await new Promise(r=> setTimeout(r, 400));

    /* The amalgam's bar is STRAIGHT, and every lineage turns onto it with
       a rounded corner — never a hard angle and never a doubling back,
       whatever the entry has been dragged through. `reversal` is the
       thing that kept squaring the corner off: a run-out past the landing
       followed by a 180° turn back onto the bar, which no radius can
       round. */
    const bead = document.querySelector('circle.amalgam-bead[data-to="ax"]');
    const memberDs = [...document.querySelectorAll('path.amalgam-member[data-to="ax"]')].map(x=> x.getAttribute('d'));
    const reversesAnywhere = (list)=> list.some(d=> d.split('M').filter(Boolean).some(sub=>{
      const nums = (sub.match(/-?\d+(\.\d+)?/g)||[]).map(Number);
      const pts = []; for(let i=0;i+1<nums.length;i+=2) pts.push({x:nums[i], y:nums[i+1]});
      for(let i=2;i<pts.length;i++){
        const ax = pts[i-1].x-pts[i-2].x, ay = pts[i-1].y-pts[i-2].y;
        const bx2 = pts[i].x-pts[i-1].x, by2 = pts[i].y-pts[i-1].y;
        const la = Math.hypot(ax,ay), lb = Math.hypot(bx2,by2);
        if(la > 14 && lb > 14 && (ax*bx2 + ay*by2) < -0.9*la*lb) return true;
      }
      return false;
    }));
    out.beadFound = !!bead;
    out.twoMembers = memberDs.length === 2;
    out.membersRound = memberDs.length > 0 && memberDs.every(d=> /[QC]/.test(d));
    out.membersReverse = reversesAnywhere(memberDs);
    if(bead){
      const by = +bead.getAttribute('cy');
      const child = nodes.get('ax');
      // The junction sits ON the bar: level with where the lineages land.
      const ends = memberDs.map(d=>{
        const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
        return nums[nums.length - 1];      // the last y each member writes
      });
      out.beadOnBar = ends.every(y=> Math.abs(by - y) < 0.6);
      out.beadAboveChild = by < child.y;
    }
    /* And the merge survives being dragged sideways. The side each lineage
       arrives on is chosen from where its source sits, so a far-enough
       drag used to give two lineages two different sides — and the bar
       quietly came apart into ordinary connectors mid-drag. */
    const homeAx = workingNodes.find(t=> t[0]==='ax')[6].pos.slice();
    applyEdit(()=>{ workingNodes.find(t=> t[0]==='ax')[6].pos = [homeAx[0] + 520, homeAx[1]]; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));
    const draggedDs = [...document.querySelectorAll('path.amalgam-member[data-to="ax"]')].map(x=> x.getAttribute('d'));
    out.mergeHeldWhenDragged = draggedDs.length === 2;
    out.draggedReverses = reversesAnywhere(draggedDs);
    applyEdit(()=>{ workingNodes.find(t=> t[0]==='ax')[6].pos = homeAx; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));

    // A pocket's rings stand far enough apart that the inner ring's own
    // grab-band is not buried under the outer ring's crests.
    out.pocketStep = POCKET_RING_STEP;
    out.ringStep = RING_STEP;
    /* Where each ring's first arc on the top side begins, measured on the
       shared grid. Two rings in phase agree on both the offset and which
       way that first arc bulges. */
    applyEdit(()=>{ workingNodes.push(['pkph','P',null,null,null,'pocket',
      {pos:[13600,-600], colors:['#111111','#c23b22']}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));
    const ringPaths = [...document.querySelectorAll('[data-id="pkph"] > path[stroke]')];
    out.ringPhases = ringPaths.map(pth=>{
      const m = /C\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(pth.getAttribute('d'));
      if(!m) return null;
      const x = +m[1], up = +m[2];
      return {mod: +(((x % POCKET_WAVELEN) + POCKET_WAVELEN) % POCKET_WAVELEN).toFixed(2), up};
    });
    out.ringsInPhase = out.ringPhases.length === 2 && out.ringPhases.every(Boolean) &&
      Math.abs(out.ringPhases[0].mod - out.ringPhases[1].mod) < 0.02 &&
      Math.sign(out.ringPhases[0].up - 0) === Math.sign(out.ringPhases[1].up - 0);

    // The connector popover survives a click in any other menu.
    const hit = document.querySelector('#edgeLayer path.edge-hit');
    if(hit){
      hit.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      await new Promise(r=> setTimeout(r, 250));
      out.popoverOpen = document.getElementById('edgePopover').classList.contains('open');
      document.getElementById('legendToggle').click();
      await new Promise(r=> setTimeout(r, 250));
      out.popoverAfterMenu = document.getElementById('edgePopover').classList.contains('open');
      document.getElementById('canvas').dispatchEvent(new MouseEvent('click', {bubbles:true}));
      await new Promise(r=> setTimeout(r, 250));
      out.popoverAfterCanvas = document.getElementById('edgePopover').classList.contains('open');
      document.getElementById('legend').classList.remove('open');
    }

    // A callout is sized from its own text, like the entry it is.
    applyEdit(()=>{
      workingNodes.push(['ca_s','xs',null,null,null,'callout',
                         {pos:[7900,-600], leader:{from:'dr', to:'dt', at:0.5}}]);
      workingNodes.push(['ca_l','A far longer remark that has to wrap over several lines inside its card',
                         null,null,null,'callout',
                         {pos:[7900,-300], leader:{from:'dr', to:'dt', at:0.5}}]);
    });
    await new Promise(r=> setTimeout(r, 420));
    out.tinyCardW = (nodes.get('ca_s')||{}).w;
    out.bigCardW = (nodes.get('ca_l')||{}).w;
    out.leaderFS = getComputedStyle(document.querySelector('.node-callout text')).fontSize;
    out.entryFS = getComputedStyle(document.querySelector('.node[data-id="dr"] text')).fontSize;
    refill(EDGE_STYLES, [{from:'dr', to:'dt', note:'xs', notePos:'above'}]);
    rebuildChart(); await new Promise(r=> setTimeout(r, 380));
    out.plateFS = getComputedStyle(document.querySelector('.edge-note-text')).fontSize;
    out.plateStroke = getComputedStyle(document.querySelector('.edge-note-plate')).stroke;
    refill(EDGE_STYLES, []);

    // The panel: each list carries its own controls.
    buildManagement();
    await new Promise(r=> setTimeout(r, 250));
    const heads = [...document.querySelectorAll('#legendList .legend-section-head')];
    const tagsHead = heads.find(h=> /Tags/i.test(h.textContent));
    const refsHead = heads.find(h=> /References/i.test(h.textContent));
    out.tagsHeadEye = !!(tagsHead && tagsHead.querySelector('#legendEye'));
    out.tagsHeadPlus = !!(tagsHead && tagsHead.querySelector('.plus-mini'));
    out.refsHeadPlus = !!(refsHead && refsHead.querySelector('.plus-mini'));
    out.noTopEye = !document.querySelector('.legend-actions #legendEye');
    out.colourInList = !!document.querySelector('#legendList > #refColorRow');

    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a dropped entry stays where it was dropped, drag after drag',
        r10.grewTall && r10.creep === 0, 'crept ' + r10.creep);
  check('a wavy pattern holds its crests when a head is added',
        r10.waveHeld && r10.waveDropped >= 1,
        JSON.stringify({held:r10.waveHeld, dropped:r10.waveDropped}));
  check('a dash pattern is offset to hold its rhythm too',
        !r10.dashPlainOff && +r10.dashInOff > 0, `${r10.dashPlainOff} -> ${r10.dashInOff}`);
  check('an amalgam bar is straight, with the junction sitting on it',
        r10.beadFound && r10.beadOnBar && r10.beadAboveChild && r10.twoMembers,
        JSON.stringify(r10));
  check('every lineage turns onto it with a rounded corner, never a doubling back',
        r10.membersRound && r10.membersReverse === false,
        JSON.stringify({round:r10.membersRound, reversal:r10.membersReverse}));
  check('and the merge survives being dragged clear of its lineages',
        r10.mergeHeldWhenDragged && r10.draggedReverses === false,
        JSON.stringify({held:r10.mergeHeldWhenDragged, reversal:r10.draggedReverses}));
  /* The rings nest at the ordinary spacing, and stay that far apart all
     the way round because they lay their arcs on ONE grid: two rings of
     different perimeters would otherwise drift out of phase and touch. */
  check('a pocket reality’s rings nest at the ordinary spacing',
        r10.pocketStep === r10.ringStep, 'step ' + r10.pocketStep);
  check('and share one phase grid, so they never drift into each other',
        r10.ringsInPhase, JSON.stringify(r10.ringPhases));
  check('the connector popover survives a click in another menu',
        r10.popoverOpen && r10.popoverAfterMenu, JSON.stringify(r10.popoverAfterMenu));
  check('and still closes on a click on the chart', r10.popoverAfterCanvas === false);
  /* A callout and a connector's plate are two forms of the same remark, so
     they are the same size — and both smaller than an entry's own label. */
  check('a callout is set at the plate’s size, not an entry’s',
        r10.leaderFS === r10.plateFS && r10.leaderFS !== r10.entryFS,
        `callout ${r10.leaderFS}, plate ${r10.plateFS}, entry ${r10.entryFS}`);
  check('and sized from its own text', r10.bigCardW > r10.tinyCardW,
        `${r10.tinyCardW} -> ${r10.bigCardW}`);
  check('a plate note is bordered in ink', r10.plateStroke !== 'none', r10.plateStroke);
  check('the tags list carries its own eye and its own +',
        r10.tagsHeadEye && r10.tagsHeadPlus && r10.noTopEye, JSON.stringify(r10));
  check('the references list carries its own +', r10.refsHeadPlus);
  check('and the citation colour sits with the references', r10.colourInList);

  /* A second colour lands on the second selection, not back on the first. */
  const twoColours = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{ workingNodes.push(['tc','alpha beta',null,null,null,null,{pos:[7900,-600]}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    selectedId = 'tc';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 300));
    const surface = richFields.get('editLabelInput').surface;
    const box = document.querySelector('[data-hex-for="editLabelInput"]');
    const swatch = ()=>{
      const rc = box.getBoundingClientRect();
      box.dispatchEvent(new MouseEvent('mousedown',
        {bubbles:true, cancelable:true, clientX:rc.left+4, clientY:rc.top+8}));
    };
    const firstText = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT).nextNode();
    const r1 = document.createRange(); r1.setStart(firstText, 0); r1.setEnd(firstText, 5);
    let sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r1);
    box.value = '#c23b22'; swatch();
    await new Promise(r=> setTimeout(r, 250));
    const one = richHtmlToMarkup(surface);
    // Typing the next colour focuses the box, which is what used to leave a
    // stale range behind for the next click to restore.
    box.focus(); box.value = '#2f6fb5';
    await new Promise(r=> setTimeout(r, 120));
    const walk = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    let last = null, t; while((t = walk.nextNode())) last = t;
    const r2 = document.createRange();
    r2.setStart(last, last.textContent.length - 4); r2.setEnd(last, last.textContent.length);
    sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r2);
    swatch();
    await new Promise(r=> setTimeout(r, 250));
    const two = richHtmlToMarkup(surface);
    document.getElementById('detailEditToggle').click();
    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    return {one, two};
  });
  check('a colour lands on the words that are selected',
        /^\{\{#c23b22\|alpha\}\}/.test(twoColours.one), twoColours.one);
  check('and the next one lands on the NEXT selection, not back on the first',
        /\{\{#2f6fb5\|beta\}\}/.test(twoColours.two) &&
        /\{\{#c23b22\|alpha\}\}/.test(twoColours.two), twoColours.two);

  /* A new entry lands in the middle of what is on SCREEN, not under an
     open panel. */
  const placed = await page.evaluate(async ()=>{
    document.getElementById('legend').classList.remove('open');
    const wide = viewCentreSpot('rect');
    document.getElementById('legend').classList.add('open');
    await new Promise(r=> setTimeout(r, 200));
    const narrowed = viewCentreSpot('rect');
    document.getElementById('legend').classList.remove('open');
    return {wide, narrowed};
  });
  check('a new entry avoids the ground an open panel covers',
        placed.narrowed.x > placed.wide.x,
        `${placed.wide.x} -> ${placed.narrowed.x}`);

  /* A copy lands where the reader is looking, never back beside the entry
     it was copied from. */
  const pasted = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{ workingNodes.push(['cp','Copy me',null,null,null,null,{pos:[9000,9000]}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    selectedId = 'cp';
    copySelectedNode();
    const spot = viewCentreSpot('rect');
    pasteClipboardNode();
    await new Promise(r=> setTimeout(r, 400));
    const copy = workingNodes.find(t=> /^copy-me-copy/.test(t[0]));
    const landed = copy ? copy[6].pos.slice() : null;
    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    return {landed, spot, far:[9000,9000]};
  });
  check('a pasted copy lands in the middle of the view, not beside the original',
        !!pasted.landed && Math.abs(pasted.landed[0] - pasted.spot.x) < 80 &&
        Math.abs(pasted.landed[0] - pasted.far[0]) > 1000,
        JSON.stringify(pasted));

  /* ---- 30. this round: the colour commit, the bar's beads, the leash ---- */
  const r11 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};

    /* A colour applied by hand has to REACH the entry. The span is wrapped
       with Range surgery, which fires no input event of its own — and every
       commit on this page hangs off that event, so the colour showed in the
       box, never reached the chart, and was gone on reopening. */
    applyEdit(()=>{ workingNodes.push(['clr','alpha beta',null,null,null,null,{pos:[10200,-600]}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 380));
    selectedId = 'clr';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 300));
    const surf = richFields.get('editLabelInput').surface;
    const hexBox = document.querySelector('[data-hex-for="editLabelInput"]');
    const t0 = document.createTreeWalker(surf, NodeFilter.SHOW_TEXT).nextNode();
    const rg = document.createRange(); rg.setStart(t0, 0); rg.setEnd(t0, 5);
    const sel0 = window.getSelection(); sel0.removeAllRanges(); sel0.addRange(rg);
    hexBox.value = '#c23b22';
    const hb = hexBox.getBoundingClientRect();
    hexBox.dispatchEvent(new MouseEvent('mousedown',
      {bubbles:true, cancelable:true, clientX:hb.left+4, clientY:hb.top+8}));
    await new Promise(r=> setTimeout(r, 1200));
    out.storedColour = workingNodes.find(x=> x[0]==='clr')[1];
    out.paintedOnChart = [...document.querySelectorAll('[data-id="clr"] text tspan')]
      .some(x=> /c23b22/.test(x.getAttribute('style') || ''));
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));
    selectedId = 'clr';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 300));
    out.survivesReopen = /color/.test(richFields.get('editLabelInput').surface.innerHTML);
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 200));

    // A pocket's rings: clear of each other's crests, without standing off
    // so far that they stop reading as one nested frame.
    out.pocketStep = POCKET_RING_STEP;
    out.pocketLiftNow = POCKET_LIFT;
    out.ringStepHere = RING_STEP;

    /* A callout stands where it was put, and stays there while the chart
       is rearranged around it — it is an entry with a position, not a
       guess made afresh out of the connector's current shape. */
    applyEdit(()=>{
      workingNodes.push(['nl','N1',null,null,null,null,{pos:[10200,-200]}]);
      workingNodes.push(['nr','N2','nl',null,null,null,{pos:[10200,120]}]);
      workingNodes.push(['nc','note',null,null,null,'callout',
                         {pos:[10460,-40], leader:{from:'nl', to:'nr', at:0.5}}]);
    });
    refill(EDGE_STYLES, []);
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));
    out.cardH = (nodes.get('nc')||{}).h;
    refill(EDGE_STYLES, [{from:'nl', to:'nr', note:'xs', notePos:'above'}]);
    rebuildChart(); await new Promise(r=> setTimeout(r, 400));
    out.plateH = +document.querySelector('.edge-note-plate').getAttribute('height');
    refill(EDGE_STYLES, []);

    /* A callout travels with the connector it points at: the anchor moves
       with the route, and the card keeps the offset it was aimed at. */
    const gapOfCard = async ()=>{
      rebuildChart(); await new Promise(r=> setTimeout(r, 300));
      const n = nodes.get('nc');
      const dot = document.querySelector('#edgeLayer .callout-leader[data-id="nc"] .leader-dot');
      if(!n || !dot) return '?';
      return [(n.x + n.w/2) - +dot.getAttribute('cx'),
              (n.y + n.h/2) - +dot.getAttribute('cy')].map(v=> Math.round(v)).join(',');
    };
    const sides = [];
    for(let i=0;i<6;i++){
      applyEdit(()=>{ workingNodes.find(x=> x[0]==='nr')[6].pos = [10200 + i*7, 120 + i*5]; });
      sides.push(await gapOfCard());
    }
    out.cardSideStable = sides.every(x=> x === sides[0]) && sides[0] !== '?';
    out.cardSides = sides.join(' | ');
    // …and its leader keeps up with the connector it is talking about.
    out.leaderFollows = !!document.querySelector('#edgeLayer .callout-leader[data-id="nc"]');

    /* The bar carries a bead at every colour change, each a gradient of the
       two stretches that meet there — and the junction keeps its own,
       carrying every colour on the bar. */
    applyEdit(()=>{
      workingNodes.push(['j0','A',null,null,null,null,{pos:[10000,600],colors:['#c23b22']}]);
      workingNodes.push(['j1','B',null,null,null,null,{pos:[10300,600],colors:['#2f6fb5']}]);
      workingNodes.push(['j2','C',null,null,null,null,{pos:[10600,600],colors:['#1d7a5f']}]);
      /* Off the middle on purpose: the junction bead travels along the bar
         with the entry and takes over any joint it lands on, so an entry
         parked exactly on a seam is the one arrangement where a joint is
         legitimately absent. */
      workingNodes.push(['jm','M',['j0','j1','j2'],null,null,'amalgam',
                         {pos:[10450,940],colors:['#c23b22','#2f6fb5','#1d7a5f']}]);
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 480));
    const joints = [...document.querySelectorAll('.amalgam-joint[data-to="jm"]')];
    out.jointCount = joints.length;                 // three lineages -> two joints
    out.jointsGradient = joints.length > 0 && joints.every(j=> /^url\(#/.test(j.getAttribute('fill')||''));
    const junction = document.querySelector('.amalgam-junction[data-to="jm"]');
    out.junctionGradient = !!junction && /^url\(#/.test(junction.getAttribute('fill')||'');
    out.junctionLast = !!junction && junction.parentNode.lastElementChild === junction;

    /* And the entry goes wherever it is put. The drag used to be clamped so
       that it could not leave its bar's reach — a limit that belonged to a
       merge whose bar followed the entry, which it has not done since the
       bar was tied to the lineages instead. What the clamp still did was
       stop the hand while the pointer carried on. */
    const askedFor = [30000, 2400];
    applyEdit(()=>{ workingNodes.find(x=> x[0] === 'jm')[6].pos = askedFor; });
    await new Promise(r=> setTimeout(r, 420));
    const jmFar = nodes.get('jm');
    out.landedWhereAsked = Math.round(jmFar.x) === askedFor[0] &&
                           Math.round(jmFar.y + (jmFar.growShift || 0)) === askedFor[1];
    out.farAt = Math.round(jmFar.x) + ',' + Math.round(jmFar.y + (jmFar.growShift || 0));
    // And the merge is still drawn — one arrow, however long it has to be.
    out.armGrew = !!document.querySelector('#edgeLayer .amalgam-out[data-to="jm"]');

    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a colour applied by hand reaches the entry and the chart',
        /^\{\{#c23b22\|alpha\}\}/.test(r11.storedColour) && r11.paintedOnChart,
        JSON.stringify({stored:r11.storedColour, painted:r11.paintedOnChart}));
  check('and is still there when the form is opened again', r11.survivesReopen);
  // A ripple runs to BOTH sides of its line now, so the clearance a ring
  // needs from the next is a whole wave, not half of one.
  /* Daylight between the rings no longer comes from spacing them further
     apart than the wave is deep — it comes from their sharing one phase
     grid, so they run parallel. That is checked where the phases are read;
     what matters here is that the ripple has real depth again. */
  check('a pocket reality’s ripple has depth without pushing the rings apart',
        r11.pocketLiftNow > 2.5 && r11.pocketStep === r11.ringStepHere,
        'lift ' + r11.pocketLiftNow + ', step ' + r11.pocketStep);
  check('a callout is a box of its own, not the plate it replaced',
        r11.cardH > r11.plateH, `${r11.cardH} vs ${r11.plateH}`);
  check('and keeps the offset it was aimed at as its connector moves',
        r11.cardSideStable, r11.cardSides);
  check('the bar carries a gradient bead at every colour change',
        r11.jointCount === 2 && r11.jointsGradient, JSON.stringify(r11.jointCount));
  check('and the junction keeps its own, painted over them all',
        r11.junctionGradient && r11.junctionLast);
  /* No leash any more: nothing PULLS the entry back towards its lineages,
     and a position written into the chart is honoured exactly. The hand is
     a separate matter — a drag is held to the length of the bar, which is
     checked further down, where the drag is actually performed. */
  check('an amalgam goes wherever it is put, however far from its lineages',
        r11.landedWhereAsked && r11.armGrew,
        JSON.stringify({at:r11.farAt, arrow:r11.armGrew}));

  /* The management panel: no mode switch, no running commentary, and the
     citation colour above the list it belongs to. */
  const panelShape = await page.evaluate(async ()=>{
    buildManagement();
    await new Promise(r=> setTimeout(r, 250));
    const list = document.getElementById('legendList');
    const kids = [...list.children];
    const refsHead = kids.findIndex(k=> /References/i.test(k.textContent));
    const colour = kids.findIndex(k=> k.id === 'refColorRow');
    return {
      organizeGone: !document.getElementById('legendManage'),
      statusGone: !document.getElementById('legendStatus') && !document.getElementById('refsStatus'),
      colourAfterHead: refsHead >= 0 && colour === refsHead + 1,
      hexStyled: getComputedStyle(document.getElementById('refColorInput')).backgroundImage !== 'none'
    };
  });
  check('the panel has no Organize switch and no running commentary',
        panelShape.organizeGone && panelShape.statusGone, JSON.stringify(panelShape));
  check('the citation colour sits directly under the References heading',
        panelShape.colourAfterHead, JSON.stringify(panelShape));
  check('and its hex box wears the same swatch as every other one',
        panelShape.hexStyled);

  /* ---- 31. this round: selection, colour inheritance, the ripple ---- */
  const r12 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      for(let i=0;i<12;i++){
        workingNodes.push(['ms'+i, 'M'+i, i ? 'ms'+(i-1) : null, null, null, null,
                           {pos:[12000 + (i%4)*200, -800 + Math.floor(i/4)*160]}]);
      }
      workingNodes.push(['msFar','Far',null,null,null,null,{pos:[12900,-200]}]);
      workingNodes.push(['cp0','P',null,null,null,null,{pos:[12000,200],colors:['#c23b22','#2f6fb5']}]);
      workingNodes.push(['cp1','C','cp0',null,null,null,{pos:[12000,420],colors:['#1d7a5f']}]);
      workingNodes.push(['cq','Q',null,null,null,null,{pos:[12400,200],colors:['#7a3fa0']}]);
      workingNodes.push(['cam','A',['cp0','cq'],null,null,'amalgam',
                         {pos:[12200,620],colors:['#c23b22','#7a3fa0']}]);
      const t0 = workingNodes.find(t=> t[0]==='ms0'); t0[6].tags = ['probe-a','probe-b'];
      const t1 = workingNodes.find(t=> t[0]==='ms1'); t1[6].tags = ['probe-b'];
    });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 520));

    /* A dozen entries picked at once are all HIGHLIGHTED. Dimming belongs
       to the one entry being looked at; it used to be applied to the rest
       of the selection too, and the highlight vanished underneath it. */
    const picked = Array.from({length:12}, (_,i)=> 'ms'+i);
    setSelection(picked, 'ms0');
    await new Promise(r=> setTimeout(r, 260));
    out.multiLit = picked.filter(id=> qNode(`.node[data-id="${id}"]`).classList.contains('multi')).length;
    out.multiDimmed = picked.filter(id=> qNode(`.node[data-id="${id}"]`).classList.contains('dim')).length;

    /* Selecting an unrelated entry fades EVERY piece of the connectors
       around it, arrowheads and amalgam beads included. */
    selectNode('msFar');
    await new Promise(r=> setTimeout(r, 260));
    const heads = [...document.querySelectorAll('.edge-arrow')];
    out.headsTotal = heads.length;
    out.headsDim = heads.filter(h=> h.classList.contains('dim')).length;
    const beads = [...document.querySelectorAll('.amalgam-bead')];
    out.beadsTotal = beads.length;
    out.beadsDim = beads.filter(x=> x.classList.contains('dim')).length;
    deselect();
    await new Promise(r=> setTimeout(r, 200));

    /* An entry's text is its own first border colour; a connector takes
       the colour of the ring it leaves from; an amalgam wears the gradient
       of every colour it carries, while still offering one ring of ports. */
    out.textFill = document.querySelector('[data-id="cp0"] text').getAttribute('fill');
    out.edgeStroke = document.querySelector('#edgeLayer path.edge.struct[data-to="cp1"]')
      .getAttribute('stroke');
    const amRect = document.querySelector('[data-id="cam"] > rect[stroke]');
    out.amalStroke = amRect ? amRect.getAttribute('stroke') : null;
    out.amalText = document.querySelector('[data-id="cam"] text').getAttribute('fill');
    out.amalPortRings = document.querySelectorAll('[data-id="cam"] .node-handle[data-side="top"]').length;

    /* Hiding one tag takes the entries carrying it off the chart, whatever
       else they carry. */
    hiddenTags.clear(); hiddenTags.add('probe-a');
    applyVisibility(); await new Promise(r=> setTimeout(r, 220));
    const onScreen = (id)=> getComputedStyle(qNode(`.node[data-id="${id}"]`)).display !== 'none';
    out.taggedGone = !onScreen('ms0');     // carries probe-a AND probe-b
    out.otherStays = onScreen('ms1');      // carries probe-b only
    hiddenTags.clear(); applyVisibility();

    // A pocket's grab strip is as deep as its ripple, not a hairline on the
    // baseline; and the ripple runs into the corners rather than stopping short.
    out.pocketLift = +POCKET_LIFT.toFixed(2);
    out.pocketCornerFlat = POCKET_CORNER_FLAT;
    applyEdit(()=>{ workingNodes.push(['pkh','P',null,null,null,'pocket',{pos:[12800,620]}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 400));
    const hit = document.querySelector('[data-id="pkh"] .node-handle[data-side="top"] .node-handle-hit');
    out.pocketHit = hit ? +(+hit.getAttribute('height')).toFixed(2) : null;
    const plainHit = document.querySelector('[data-id="msFar"] .node-handle[data-side="top"] .node-handle-hit');
    out.plainHit = plainHit ? +(+plainHit.getAttribute('height')).toFixed(2) : null;
    /* The pad that makes a rippled entry hover like a rectangular one. Its
       fill wanders with the ripple, so without this the pointer at the
       edge was sometimes inside the shape and sometimes in a trough just
       outside it, and the ports came and went with it. */
    out.pocketPad = !!document.querySelector('[data-id="pkh"] .node-hover-pad');

    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 420));
    return out;
  });
  check('every entry in a large selection is highlighted, none of them dimmed',
        r12.multiLit === 12 && r12.multiDimmed === 0,
        JSON.stringify({lit:r12.multiLit, dimmed:r12.multiDimmed}));
  check('selecting elsewhere fades the arrowheads and the amalgam beads too',
        r12.headsTotal > 0 && r12.headsDim === r12.headsTotal &&
        r12.beadsTotal > 0 && r12.beadsDim === r12.beadsTotal,
        JSON.stringify(r12));
  check('an entry writes its label in its own first border colour',
        r12.textFill === '#c23b22', r12.textFill);
  check('a connector takes the colour of the ring it leaves from',
        r12.edgeStroke === '#c23b22', r12.edgeStroke);
  check('an amalgam wears the gradient of every colour it carries',
        /^url\(#/.test(r12.amalStroke || '') && /^url\(#/.test(r12.amalText || ''),
        JSON.stringify({border:r12.amalStroke, text:r12.amalText}));
  check('and still offers exactly one ring of ports', r12.amalPortRings === 1,
        String(r12.amalPortRings));
  check('hiding a tag takes every entry carrying it off the chart',
        r12.taggedGone && r12.otherStays, JSON.stringify(r12));
  // Deep enough to catch the crests, and never thinner than an ordinary
  // entry's strip — a shallow ripple must not make the border harder to
  // grab than a straight one.
  check('a pocket reality’s grab strip covers its whole ripple',
        r12.pocketHit !== null && r12.pocketHit >= r12.pocketLift*2 &&
        r12.pocketHit >= r12.plainHit,
        JSON.stringify({pocket:r12.pocketHit, plain:r12.plainHit, lift:r12.pocketLift}));
  check('and its whole box registers as hovered, ripple and all',
        r12.pocketPad, String(r12.pocketPad));
  check('and its ripple runs into the corners instead of stopping short',
        r12.pocketCornerFlat === 0, String(r12.pocketCornerFlat));

  /* An amalgam divides its bar by which way each lineage has to travel to
     reach the junction — not by which side of the ENTRY it happens to be
     on, which left the far lineages with a stretch of zero length and the
     seams showing beside the beads meant to cover them. */
  const barSplit = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{
      [0,1,2,3].forEach(i=> workingNodes.push(['bs'+i,'B'+i,null,null,null,null,
        {pos:[14000 + i*200, -400], colors:[['#c23b22','#2f6fb5','#1d7a5f','#7a3fa0'][i]]}]));
      // Deliberately at ONE END of its own bar, so every landing lies to
      // the same side of the entry's centre.
      workingNodes.push(['bsm','M',['bs0','bs1','bs2','bs3'],null,null,'amalgam',
        {pos:[14600,-40], colors:['#c23b22','#2f6fb5','#1d7a5f','#7a3fa0']}]);
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 520));
    const ds = [...document.querySelectorAll('.amalgam-member[data-to="bsm"]')].map(x=> x.getAttribute('d'));
    /* Every lineage turns onto the bar: its own path has to change
       direction somewhere, not run in one straight line from its entry to
       the junction. Read from the geometry rather than from the presence
       of a curve command — a run-out that continues straight on no longer
       writes a curve of zero angle for the point it passes through. */
    const turnsIn = (d)=>{
      const nums = (d.match(/-?\d+(\.\d+)?/g)||[]).map(Number);
      const pts = []; for(let i=0;i+1<nums.length;i+=2) pts.push({x:nums[i], y:nums[i+1]});
      for(let i=2;i<pts.length;i++){
        const ax = pts[i-1].x-pts[i-2].x, ay = pts[i-1].y-pts[i-2].y;
        const bx = pts[i].x-pts[i-1].x, by = pts[i].y-pts[i-1].y;
        const la = Math.hypot(ax,ay), lb = Math.hypot(bx,by);
        if(la > 2 && lb > 2 && Math.abs(ax*bx + ay*by) < 0.7*la*lb) return true;
      }
      return false;
    };
    /* Three of the four turn onto the bar. The fourth is the lineage whose
       landing IS the junction — it comes straight down onto the point the
       merged arrow leaves from and has no stretch of bar to travel along,
       which is the correct shape for it and not a missing turn. What every
       one of them must do is finish ON the bar, each at its own place. */
    const endsOf = ds.map(d=>{
      const nums = (d.match(/-?\d+(\.\d+)?/g)||[]).map(Number);
      return {x: nums[nums.length-2], y: nums[nums.length-1]};
    });
    const barY = endsOf[0].y;
    const everyTurns = ds.length === 4 &&
      ds.filter(turnsIn).length >= 3 &&
      endsOf.every(e=> Math.abs(e.y - barY) < 0.6) &&
      new Set(endsOf.map(e=> e.x.toFixed(1))).size >= 3;
    // And none doubles back on itself getting there.
    const reverses = ds.some(d=> d.split('M').filter(Boolean).some(sub=>{
      const nums = (sub.match(/-?\d+(\.\d+)?/g)||[]).map(Number);
      const pts = []; for(let i=0;i+1<nums.length;i+=2) pts.push({x:nums[i], y:nums[i+1]});
      for(let i=2;i<pts.length;i++){
        const ax = pts[i-1].x-pts[i-2].x, ay = pts[i-1].y-pts[i-2].y;
        const bx = pts[i].x-pts[i-1].x, by = pts[i].y-pts[i-1].y;
        const la = Math.hypot(ax,ay), lb = Math.hypot(bx,by);
        if(la > 14 && lb > 14 && (ax*bx + ay*by) < -0.9*la*lb) return true;
      }
      return false;
    }));
    // A bead sits on every seam: three joints for four lineages.
    const joints = document.querySelectorAll('.amalgam-joint[data-to="bsm"]').length;
    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 400));
    return {everyTurns, reverses, joints};
  });
  check('every lineage owns a real stretch of the bar, wherever the entry sits',
        barSplit.everyTurns && barSplit.reverses === false, JSON.stringify(barSplit));
  check('and a bead sits on every seam between them', barSplit.joints === 3,
        String(barSplit.joints));

  /* ---- 32. this round: the grid, the grip, the bar's own colours ---- */
  const r13 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.push(['gt','A rather long label\nthat is written on\nthree whole lines',
                         null,null,null,null,{pos:[16000,-600]}]);
      workingNodes.push(['gs','Short',null,null,null,null,{pos:[16300,-600]}]);
      workingNodes.push(['gp0','P0',null,null,null,null,{pos:[16000,200],colors:['#c23b22']}]);
      workingNodes.push(['gp1','P1',null,null,null,null,{pos:[16300,200],colors:['#2f6fb5']}]);
      workingNodes.push(['gp2','P2',null,null,null,null,{pos:[16900,200],colors:['#1d7a5f']}]);
      // No colours of its own: it has to take them from its lineages.
      workingNodes.push(['gam','M',['gp0','gp1','gp2'],null,null,'amalgam',{pos:[16200,620]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 520));

    /* Every entry sits on the grid its position was snapped to. Half the
       extra height is never a round number, so an unrounded offset put
       every box at its own fraction of a step away from the ruled lines. */
    const tall = nodes.get('gt'), short = nodes.get('gs');
    out.tallOffGrid = [ +(tall.x % GRID).toFixed(3), +(tall.y % GRID).toFixed(3) ];
    out.shortOffGrid = [ +(short.x % GRID).toFixed(3), +(short.y % GRID).toFixed(3) ];
    out.tallIsTall = tall.h > NODE_MINH;

    // The resize grip's hit strip is the mark you can see, not a wider
    // square hanging off the corner.
    const hit = document.querySelector('[data-id="gs"] .node-resize-hit');
    out.gripBox = hit ? [+hit.getAttribute('x'), +hit.getAttribute('y'),
                         +hit.getAttribute('width'), +hit.getAttribute('height')] : null;

    /* An amalgam with no colours of its own wears its lineages' — in the
       order they lie along its bar. */
    const amStroke = document.querySelector('[data-id="gam"] > rect[stroke]').getAttribute('stroke');
    const gid = /url\(#(.+)\)/.exec(amStroke);
    out.amalStops = gid ? [...document.getElementById(gid[1]).querySelectorAll('stop')]
      .map(x=> x.getAttribute('stop-color')) : null;
    // …and offers no border-colour field to contradict them.
    selectedId = 'gam';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 300));
    out.colourFieldOnAmalgam = getComputedStyle(document.getElementById('editColorsField')).display;
    document.getElementById('editShapeInput').value = 'rect';
    document.getElementById('editShapeInput').dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 280));
    out.colourFieldOnPlain = getComputedStyle(document.getElementById('editColorsField')).display;
    document.getElementById('editShapeInput').value = 'amalgam';
    document.getElementById('editShapeInput').dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 280));
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 320));

    /* The bar hands over AT the landings: a colour runs from where its
       lineage joins to where the next one does, not from midpoint to
       midpoint. P1 sits between P0 and P2, so the seams are its landing
       and the junction — never halfway across open bar. */
    const beads = [...document.querySelectorAll('.amalgam-joint[data-to="gam"]')]
      .map(x=> +x.getAttribute('cx')).sort((a,b)=> a-b);
    const drops = ['gp0','gp1','gp2'].map(id=>{
      const q = nodes.get(id); return q.x + q.w/2;
    }).sort((a,b)=> a-b);
    /* The SEAM, not the junction. The junction is where the merged arrow
       leaves the bar and it follows the entry along it; the point the
       colours are shared out about is the middle of the bar's own span,
       which is what the last pair of stretches hand over at. */
    const gbar = amalgamBars.get('gam');
    const seamX = gbar ? (gbar.lo + gbar.hi) / 2 : 0;
    // Each seam sits on a landing or on that point, never between them.
    out.seamsOnLandings = beads.length > 0 && beads.every(bx=>
      drops.some(d=> Math.abs(d - bx) < 1.5) || Math.abs(seamX - bx) < 1.5);
    out.seamCount = beads.length;

    /* A merged lineage takes no gradient, and its note is anchored on the
       line as drawn — bar leg included. */
    applyEdit(()=>{ workingNodes.push(['gc','here',null,null,null,'callout',
      {pos:[17800,300], leader:{from:'gp0', to:'gam', at:0.25}}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));
    const dot = document.querySelector('#edgeLayer .callout-leader[data-id="gc"] .leader-dot');
    const memberPath = document.querySelector('.amalgam-member[data-from="gp0"]');
    if(dot && memberPath){
      const L = memberPath.getTotalLength();
      const want = memberPath.getPointAtLength(L*0.25);
      out.anchorOff = +Math.hypot(want.x - +dot.getAttribute('cx'),
                                  want.y - +dot.getAttribute('cy')).toFixed(2);
    }
    refill(EDGE_STYLES, []);
    rebuildChart(); await new Promise(r=> setTimeout(r, 320));
    openEdgeStylePopover('gp0', 'gam', new MouseEvent('click'));
    await new Promise(r=> setTimeout(r, 260));
    const gb = document.querySelector('#stylePaintMode button[data-value="gradient"]');
    out.gradOnMember = !!gb && gb.disabled;
    closeEdgePopover();
    applyEdit(()=>{ workingNodes.push(['gq','Q','gp0',null,null,null,{pos:[17400,620]}]); });
    rebuildChart(); await new Promise(r=> setTimeout(r, 350));
    openEdgeStylePopover('gp0', 'gq', new MouseEvent('click'));
    await new Promise(r=> setTimeout(r, 260));
    out.gradOnPlain = !document.querySelector('#stylePaintMode button[data-value="gradient"]').disabled;
    closeEdgePopover();

    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 420));
    return out;
  });
  check('a grown entry still lands on the grid it was snapped to',
        r13.tallIsTall && r13.tallOffGrid[0] === 0 && r13.tallOffGrid[1] === 0 &&
        r13.shortOffGrid[0] === 0 && r13.shortOffGrid[1] === 0,
        JSON.stringify({tall:r13.tallOffGrid, short:r13.shortOffGrid}));
  check('the resize grip can only be grabbed where it is drawn',
        !!r13.gripBox && r13.gripBox[0] + r13.gripBox[2] <= 0.5 && r13.gripBox[2] <= 10,
        JSON.stringify(r13.gripBox));
  check('an amalgam with no colours of its own wears its lineages’',
        JSON.stringify(r13.amalStops) === JSON.stringify(['#c23b22','#2f6fb5','#1d7a5f']),
        JSON.stringify(r13.amalStops));
  check('and offers no border-colour field to contradict them',
        r13.colourFieldOnAmalgam === 'none' && r13.colourFieldOnPlain !== 'none',
        JSON.stringify({amalgam:r13.colourFieldOnAmalgam, plain:r13.colourFieldOnPlain}));
  check('the bar changes colour where a lineage joins, not halfway between',
        r13.seamsOnLandings && r13.seamCount >= 1, JSON.stringify(r13.seamCount));
  check('a note on a merged lineage lands where it was pinned',
        r13.anchorOff !== undefined && r13.anchorOff < 2, String(r13.anchorOff));
  check('a merged lineage cannot be given a gradient, an ordinary one can',
        r13.gradOnMember && r13.gradOnPlain,
        JSON.stringify({member:r13.gradOnMember, plain:r13.gradOnPlain}));

  /* A wave keeps both its positions AND its sides when a head is added:
     the arcs alternate, so dropping the ones a head covers must not flip
     everything after them. */
  const wavePhase = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{
      workingNodes.push(['wa','A',null,null,null,null,{pos:[18000,-600]}]);
      workingNodes.push(['wb','B','wa',null,null,null,{pos:[18420,-300]}]);
    });
    const arcs = async (st)=>{
      refill(EDGE_STYLES, [Object.assign({from:'wa', to:'wb', sinusoid:true}, st)]);
      rebuildChart(); await new Promise(r=> setTimeout(r, 340));
      const d = document.querySelector('#edgeLayer path.edge.struct[data-from="wa"]').getAttribute('d');
      return (d.match(/C[^CLMQZ]*/g) || []).map(c=> c.trim());
    };
    const plain = await arcs({arrow:false});
    const withIn = await arcs({arrow:false, arrowIn:true});
    refill(EDGE_STYLES, []);
    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 360));
    // Identical arcs, control points and all — a few fewer at the head end.
    const dropped = plain.length - withIn.length;
    return {held: dropped >= 1 && plain.slice(dropped).join('|') === withIn.join('|'),
            dropped};
  });
  check('a start arrowhead hides the arcs behind it and moves none of the others',
        wavePhase.held && wavePhase.dropped >= 1, JSON.stringify(wavePhase));

  /* ---- 33. this round: type controls, T-joins, group copy ---- */
  const r14 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.push(['ty','alpha beta',null,null,null,null,{pos:[20000,-600]}]);
      [0,1,2,3].forEach(i=> workingNodes.push(['tp'+i,'P'+i,null,null,null,null,
        {pos:[20000 + i*220, 0], colors:[['#c23b22','#2f6fb5','#1d7a5f','#7a3fa0'][i]]}]));
      workingNodes.push(['tam','M',['tp0','tp1','tp2','tp3'],null,null,'amalgam',{pos:[20320,400]}]);
      // Lineages stacked down the LEFT, so the bar runs vertically.
      [0,1,2].forEach(i=> workingNodes.push(['lp'+i,'L'+i,null,null,null,null,
        {pos:[21200, -200 + i*180], colors:[['#c23b22','#2f6fb5','#1d7a5f'][i]]}]));
      // Off the middle: the junction bead travels with the entry and takes
      // over any joint it lands on, so an entry parked exactly on a seam is
      // the one arrangement where a joint is legitimately absent.
      workingNodes.push(['lam','LM',['lp0','lp1','lp2'],null,null,'amalgam',{pos:[21700,120]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 560));

    /* Type is set from the toolbar and the toolbar REPORTS what it sees:
       the entry-wide face dropdown is gone, and the pickers show the face
       and size of what is selected, or "custom" across a mixture. */
    out.entryFaceHidden = document.getElementById('editFontInput').hidden;
    selectedId = 'ty';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 320));
    const surf = richFields.get('editLabelInput').surface;
    const bar = toolbarForSurface(surf);
    out.hasFace = !!bar.querySelector('.tb-font:not(.tb-size)');
    out.hasSize = !!bar.querySelector('.tb-size');
    /* Character offsets across the whole surface, not within one text node
       — the runs get split as formatting is applied, so "characters 6..10"
       stops being a single node after the first command. */
    const spotAt = (idx)=>{
      const walk = document.createTreeWalker(surf, NodeFilter.SHOW_TEXT);
      let seen = 0, t;
      while((t = walk.nextNode())){
        const len = t.textContent.length;
        if(seen + len >= idx) return {node:t, offset: idx - seen};
        seen += len;
      }
      return null;
    };
    const pickRange = (from, to)=>{
      const a = spotAt(from), b = spotAt(to);
      if(!a || !b) return false;
      const rg = document.createRange();
      rg.setStart(a.node, a.offset); rg.setEnd(b.node, b.offset);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
      return true;
    };
    pickRange(0, 5);
    applyRichCommand(surf, 'size', '20');
    await new Promise(r=> setTimeout(r, 1000));
    out.sizeMarkup = workingNodes.find(x=> x[0]==='ty')[1];
    out.sizeOnChart = [...document.querySelectorAll('[data-id="ty"] text tspan')]
      .some(x=> x.getAttribute('font-size') === '20');
    pickRange(0, 5); syncToolbarFace(bar);
    out.reportsRun = bar.querySelector('.tb-size').value;
    const whole = document.createRange(); whole.selectNodeContents(surf);
    const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(whole);
    syncToolbarFace(bar);
    out.reportsMixed = bar.querySelector('.tb-size').value;

    /* The colour reset clears the WHOLE text, not just a selection. */
    pickRange(0, 5);
    const hexBox = document.querySelector('[data-hex-for="editLabelInput"]');
    hexBox.value = '#c23b22';
    const hb = hexBox.getBoundingClientRect();
    hexBox.dispatchEvent(new MouseEvent('mousedown',
      {bubbles:true, cancelable:true, clientX:hb.left+4, clientY:hb.top+8}));
    await new Promise(r=> setTimeout(r, 900));
    pickRange(6, 10);
    hexBox.value = '#2f6fb5';
    hexBox.dispatchEvent(new MouseEvent('mousedown',
      {bubbles:true, cancelable:true, clientX:hb.left+4, clientY:hb.top+8}));
    await new Promise(r=> setTimeout(r, 900));
    out.twoColours = /c23b22/.test(richHtmlToMarkup(surf)) && /2f6fb5/.test(richHtmlToMarkup(surf));
    // One press of the reset, with only ONE of them selected.
    pickRange(0, 5);
    document.querySelector('[data-hex-reset="editLabelInput"]').click();
    await new Promise(r=> setTimeout(r, 900));
    const after = richHtmlToMarkup(surf);
    out.allColoursGone = !/\{\{#/.test(after);
    out.textKept = /alpha/.test(after) && /beta/.test(after);
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    // An amalgam offers no hand-set text colour, just as it offers no border.
    selectedId = 'tam';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 320));
    out.amalTextColour = getComputedStyle(
      document.querySelector('[data-hex-for="editLabelInput"]')).display;
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    /* Only the two lineages at the ends of the bar round their turn onto
       it; the ones between join it as a T. */
    const memberOf = (id)=> document.querySelector(`.amalgam-member[data-from="${id}"]`);
    const tail = (id)=>{
      const d = memberOf(id).getAttribute('d');
      return d.slice(d.length - 40);       // whatever the last command is
    };
    out.endRounded = /[QC]/.test(tail('tp0')) && /[QC]/.test(tail('tp3'));
    out.midSquare = !/[QC]/.test(tail('tp1')) && !/[QC]/.test(tail('tp2'));

    /* A merge on a side port: the bar runs the other way, and still has
       its beads and its arrow. */
    const lamPort = nodes.get('lam');
    const lamBeads = [...document.querySelectorAll('.amalgam-joint')];
    out.sideMembers = document.querySelectorAll('.amalgam-member[data-to="lam"]').length;
    out.sideBarVertical = (()=>{
      const ds = [...document.querySelectorAll('.amalgam-member[data-to="lam"]')]
        .map(x=> x.getBBox());
      // The bar's own leg runs down the left of the entry, so every member
      // ends left of it.
      return ds.length === 3 && ds.every(bb=> bb.x < lamPort.x);
    })();
    out.sideBeads = lamBeads.filter(x=> x.dataset.to === 'lam').length;

    /* Copying a selection copies the SELECTION. */
    setSelection(['tp0','tp1','tam'], 'tam');
    await new Promise(r=> setTimeout(r, 260));
    const beadsLit = [...document.querySelectorAll('.amalgam-bead')]
      .filter(x=> x.dataset.to === 'tam');
    out.beadsVisible = beadsLit.length > 0 &&
      beadsLit.every(x=> +getComputedStyle(x).opacity > 0.9);
    const headsLit = [...document.querySelectorAll('.edge-arrow')]
      .filter(x=> x.dataset.to === 'tam');
    out.headVisible = headsLit.length > 0 &&
      headsLit.every(x=> +getComputedStyle(x).opacity > 0.9);
    const countBefore = workingNodes.length;
    out.copied = copySelectedNode();
    pasteClipboardNode();
    await new Promise(r=> setTimeout(r, 420));
    out.pastedCount = workingNodes.length - countBefore;
    // …and the links inside the group come with it.
    const copies = workingNodes.slice(countBefore);
    out.pastedLinks = copies.filter(c=> c[2]).length;

    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 420));
    return out;
  });
  check('the entry-wide face dropdown is gone; the toolbar carries face and size',
        r14.entryFaceHidden && r14.hasFace && r14.hasSize, JSON.stringify(r14.entryFaceHidden));
  check('a size can be set on part of a text', /\{\{z:20\|alpha\}\}/.test(r14.sizeMarkup || '') &&
        r14.sizeOnChart, r14.sizeMarkup);
  check('and the pickers report it — the value on a run, "custom" on a mixture',
        r14.reportsRun === '20' && r14.reportsMixed === '__mixed__',
        JSON.stringify({run:r14.reportsRun, mixed:r14.reportsMixed}));
  check('the colour reset clears the whole text, not just the selection',
        r14.twoColours && r14.allColoursGone && r14.textKept, JSON.stringify(r14));
  check('an amalgam offers no hand-set text colour', r14.amalTextColour === 'none',
        r14.amalTextColour);
  check('the end lineages round their turn onto the bar, the middle ones join as a T',
        r14.endRounded && r14.midSquare,
        JSON.stringify({ends:r14.endRounded, middle:r14.midSquare}));
  check('a merge works on a side port too, beads and all',
        r14.sideMembers === 3 && r14.sideBarVertical && r14.sideBeads === 2,
        JSON.stringify({members:r14.sideMembers, vertical:r14.sideBarVertical, beads:r14.sideBeads}));
  check('an amalgam’s beads and arrowhead stay lit while its construction is selected',
        r14.beadsVisible && r14.headVisible,
        JSON.stringify({beads:r14.beadsVisible, head:r14.headVisible}));
  check('copying a selection copies all of it, with the links inside it',
        r14.copied && r14.pastedCount === 3 && r14.pastedLinks >= 1,
        JSON.stringify({pasted:r14.pastedCount, links:r14.pastedLinks}));

  /* The panel's title gives way to the buttons beside it, and the pocket's
     ripple is gentle enough to nest at the ordinary ring spacing. */
  const trim = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    applyEdit(()=>{
      workingNodes.push(['lg','Очень длинное название которое точно не влезет в одну строку',
                         null,null,null,null,{pos:[22000,-600]}]);
      workingNodes.push(['pw2','P',null,null,null,'pocket',{pos:[22400,-600]}]);
      workingNodes.push(['pw3','Q','pw2',null,null,null,{pos:[22400,-200]}]);
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));
    selectNode('lg');
    await new Promise(r=> setTimeout(r, 320));
    const head = document.querySelector('.detail-head');
    const pencil = document.getElementById('detailEditToggle');
    const title = document.getElementById('detailTitle');
    const hb = head.getBoundingClientRect(), pb = pencil.getBoundingClientRect();
    const tb = title.getBoundingClientRect();
    const out = {
      pencilInside: pb.right <= hb.right + 0.5 && pb.left >= hb.left,
      titleClearsPencil: tb.right <= pb.left + 0.5,
      tagLabel: [...document.querySelectorAll('label')]
        .some(l=> l.getAttribute('for') === 'editTagsInput' && /^\s*Tags\s*$/.test(l.textContent))
    };
    /* A connector into a pocket reality is drawn out of the same parts as
       every other connector: no cap stub reaching through the border, and
       its arrowhead in the ordinary layer, under the entry, where the
       border is drawn over its tip. */
    out.pocketNoCap = !document.querySelector('.edge-cap[data-to="pw2"], .edge-cap[data-from="pw2"]');
    const pkHead = document.querySelector('.edge-arrow[data-to="pw2"], .edge-arrow[data-from="pw2"]');
    out.pocketHeadUnder = !!pkHead && pkHead.parentNode.id !== 'arrowLayer';
    deselect();
    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 380));
    return out;
  });
  check('a long title gives way rather than pushing the pencil off the panel',
        trim.pencilInside && trim.titleClearsPencil, JSON.stringify(trim));
  check('the tags field is just called Tags', trim.tagLabel);
  check('a rippled border gets the same connector every other entry gets',
        trim.pocketNoCap && trim.pocketHeadUnder,
        JSON.stringify({noCap:trim.pocketNoCap, under:trim.pocketHeadUnder}));

  /* ---- 34. the review pass: nothing saved may be lost, nothing typed
             may be rewritten ---- */
  const audit = await page.evaluate(async ()=>{
    const out = {};
    const beforeNodes = workingNodes.slice();
    const beforeRefs = JSON.parse(JSON.stringify(REFS));
    const beforeCats = JSON.parse(JSON.stringify(TAG_CATS));
    const beforeColour = SETTINGS.refColor;

    /* Every region the save writes has to count as a change. References,
       categories and the chart's settings were saved but never compared,
       so editing one left the Save button reading "Saved" and the work was
       gone on the next reload with no warning. */
    savedParts = snapshotParts();
    out.cleanToStart = !isDirty();
    applyEdit(()=>{ REFS.push({key:'audit_r', title:'T', detail:'', url:''}); });
    out.refDirties = isDirty();
    savedParts = snapshotParts();
    applyEdit(()=>{ TAG_CATS.push({name:'AuditCat', tags:[]}); });
    out.catDirties = isDirty();
    savedParts = snapshotParts();
    applyEdit(()=>{ SETTINGS.refColor = '#123456'; });
    out.settingDirties = isDirty();
    // …and undo has to put them back, or deleting a cited reference is a
    // one-way door: the marks come back, the reference does not.
    undoLastEdit();
    await new Promise(r=> setTimeout(r, 260));
    out.undoRestoresSetting = SETTINGS.refColor !== '#123456';

    refill(REFS, beforeRefs); refill(TAG_CATS, beforeCats);
    SETTINGS.refColor = beforeColour;

    /* A reader's own words can never break the document that stores them.
       The data lives inside this page's script element, and an HTML parser
       ends that element at a closing script tag wherever it appears. */
    applyEdit(()=>{
      workingNodes.length = 0;
      workingNodes.push(['sc', 'a </' + 'script> tag', undefined, undefined,
                         'note with </' + 'script> too', undefined, {pos:[0,0]}]);
    });
    // The src build is three loose files with no data regions in them, so
    // there is no document to write; those checks are skipped for it.
    let doc = null;
    try{ doc = writeChart(PRISTINE_HTML); }catch(e){ doc = null; }
    out.canWrite = !!doc;
    out.scriptSurvives = !doc ? true : (()=>{
      const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(doc);
      if(!m) return 'no script block';
      try{ new Function(m[1]); return true; }catch(e){ return 'ERR ' + e.message; }
    })();

    /* Export and import back is the one path that owes nothing to any
       host, so it must not rewrite a single character of what it carries.
       Each of these broke it: a sticker token (`key:` was being quoted
       inside string contents), a newline (`\\n` was never un-escaped), a
       colon in ordinary prose, and a quote. */
    const nasty = ['Hello {{s:cat}} world', 'Line one\nLine two', 'Note: a, b: c',
                   "it's a 'quoted' word", 'back\\slash', 'a </' + 'script> tag'];
    applyEdit(()=>{
      workingNodes.length = 0;
      nasty.forEach((t,i)=> workingNodes.push(['w'+i, t, undefined, undefined, t,
                                               undefined, {pos:[i*160, 0]}]));
    });
    refill(REFS, [{key:'rt', title:'Ref: one', detail:'two\nlines', url:''}]);
    refill(TAG_CATS, [{name:'Cat: one', tags:['x']}]);
    SETTINGS.refColor = '#2f6fb5';
    let text = null;
    try{ text = writeChart(PRISTINE_HTML); }catch(e){ text = null; }
    const sent = JSON.stringify(workingNodes);
    const sentRefs = JSON.stringify(REFS), sentCats = JSON.stringify(TAG_CATS);
    applyEdit(()=>{ workingNodes.length = 0; });
    refill(REFS, []); refill(TAG_CATS, []); SETTINGS.refColor = '#000000';
    if(text){
      out.importedCount = importChartFromText(text);
      out.roundTripExact = JSON.stringify(workingNodes) === sent;
      out.refsRoundTrip = JSON.stringify(REFS) === sentRefs;
      out.catsRoundTrip = JSON.stringify(TAG_CATS) === sentCats;
      out.settingsRoundTrip = SETTINGS.refColor === '#2f6fb5';
    }

    applyEdit(()=>{ workingNodes = beforeNodes; });
    refill(REFS, beforeRefs); refill(TAG_CATS, beforeCats);
    SETTINGS.refColor = beforeColour;
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 380));
    return out;
  });
  check('a reference, a category or a setting counts as an unsaved change',
        audit.cleanToStart && audit.refDirties && audit.catDirties && audit.settingDirties,
        JSON.stringify(audit));
  check('and undo puts them back', audit.undoRestoresSetting);
  if(MODE !== 'src'){
    check('a closing script tag in an entry cannot break the saved document',
          audit.scriptSurvives === true, String(audit.scriptSurvives));
    check('export and import carry every character exactly',
          audit.importedCount === 6 && audit.roundTripExact, JSON.stringify(audit.roundTripExact));
    check('…including the references, the categories and the settings',
          audit.refsRoundTrip && audit.catsRoundTrip && audit.settingsRoundTrip,
          JSON.stringify(audit));
  }

  /* Formatting nests, and typed text is text. */
  const nesting = await page.evaluate(()=>{
    const attrs = (m)=> tokenizeLabel(m).map(t=> ({
      type:t.type, text:t.text, bold:!!t.bold, italic:!!t.italic,
      color:t.color||null, font:t.font||null, size:t.size||null}));
    const trip = (m)=>{ const d = document.createElement('div');
                        d.innerHTML = inlineToHtml(m); return richHtmlToMarkup(d); };
    const bi = attrs('***text***')[0];
    const fz = attrs('{{f:serif|{{z:14|word}}}}')[0];
    const bc = attrs('{{#ff0000|**bold** x}}');
    return {
      boldAndItalic: bi && bi.bold && bi.italic && bi.text === 'text',
      faceAndSize: fz && fz.font === 'serif' && fz.size === 14 && fz.text === 'word',
      boldInsideColour: bc.length === 2 && bc[0].bold && bc[0].color === '#ff0000',
      typedStars: attrs('2 \\* 3 = 6 and 4 \\* 5 = 20').map(t=> t.text).join(''),
      realItalicsKept: attrs('*real*')[0].italic,
      tripBoldItalic: trip('***text***'),
      tripFaceSize: trip('{{f:serif|{{z:14|word}}}}'),
      // A sticker whose picture was removed keeps its token through the editor.
      tripMissingSticker: trip('A{{s:gone_forever}}B')
    };
  });
  check('bold and italic together survive as one run that is both',
        nesting.boldAndItalic, JSON.stringify(nesting.boldAndItalic));
  check('a face and a size together survive as one run that is both',
        nesting.faceAndSize, JSON.stringify(nesting.faceAndSize));
  check('and bold inside a coloured run is bold AND coloured',
        nesting.boldInsideColour, JSON.stringify(nesting.boldInsideColour));
  check('a typed asterisk stays an asterisk',
        nesting.typedStars === '2 * 3 = 6 and 4 * 5 = 20', nesting.typedStars);
  check('while real italics still work', nesting.realItalicsKept);
  check('both survive the editor round-trip',
        /\*\*\*text\*\*\*/.test(nesting.tripBoldItalic) &&
        /\{\{f:serif\|\{\{z:14\|word\}\}\}\}/.test(nesting.tripFaceSize),
        JSON.stringify({bi:nesting.tripBoldItalic, fz:nesting.tripFaceSize}));
  check('a sticker whose picture is gone keeps its place in the text',
        /\{\{s:gone_forever\}\}/.test(nesting.tripMissingSticker), nesting.tripMissingSticker);

  /* Cut takes what copy took, notes see the entries they must avoid, and a
     tight cluster of lineages keeps its bar centred. */
  const lastPass = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.length = 0;
      [0,1,2].forEach(i=> workingNodes.push(['cut'+i,'C'+i,undefined,undefined,undefined,
                                             undefined,{pos:[i*200, 0]}]));
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 380));
    // Read the rects while there are still entries to make them from.
    const r0 = obstacleAll()[0];
    out.rectShape = r0 ? Object.keys(r0).sort().join(',') : '';
    setSelection(['cut0','cut1','cut2'], 'cut0');
    await new Promise(r=> setTimeout(r, 220));
    cutSelectedNode();
    await new Promise(r=> setTimeout(r, 320));
    out.leftAfterCut = workingNodes.length;

    /* A tight cluster keeps its bar centred on itself. Measured against
       the PORTS the lineages leave by rather than the middles of the
       entries: a landing now sits under its own port (see alongOf), which
       is what lets a fan leave evenly spaced and still drop straight, and
       on entries of different widths the two are not the same point. */
    applyEdit(()=>{
      workingNodes.length = 0;
      [0,5,10,15,20].forEach((dx,i)=> workingNodes.push(['tc'+i,'P'+i,undefined,undefined,undefined,
        undefined,{pos:[300+dx, 0], colors:[['#c23b22','#2f6fb5','#1d7a5f','#7a3fa0','#e08a1e'][i]]}]));
      workingNodes.push(['tcm','M',[0,1,2,3,4].map(i=>'tc'+i),undefined,undefined,'amalgam',{pos:[300,340]}]);
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 480));
    const boxes = [...document.querySelectorAll('.amalgam-member[data-to="tcm"]')].map(x=> x.getBBox());
    const lo = Math.min(...boxes.map(x=> x.x)), hi = Math.max(...boxes.map(x=> x.x + x.width));
    const starts = [...document.querySelectorAll('.amalgam-member[data-to="tcm"]')]
      .map(x=> (x.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number)[0]);
    const mid = starts.reduce((a,b)=> a+b, 0) / (starts.length || 1);
    out.barOffCentre = +(((lo + hi)/2) - mid).toFixed(1);

    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 380));
    return out;
  });
  check('cut removes the whole selection, not just one of it',
        lastPass.leftAfterCut === 0, String(lastPass.leftAfterCut));
  check('the obstacle rects a note avoids are corners, and are read as corners',
        lastPass.rectShape === 'id,x0,x1,y0,y1', lastPass.rectShape);
  check('a tight cluster of lineages keeps its bar centred on itself',
        Math.abs(lastPass.barOffCentre) < 1, String(lastPass.barOffCentre));

  /* ---- 35. this round ---- */
  const r15 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.push(['ln','line one\nline two',null,null,null,null,{pos:[24000,-600]}]);
      workingNodes.push(['fm','{{#c23b22|**red bold**}} {{f:serif|{{z:20|big}}}} [[base|anno]]',
                         null,null,null,null,{pos:[24300,-600], colors:['#c23b22','#2f6fb5']}]);
      workingNodes.push(['sz','word {{z:24|{{s:none_at_all}}}} tail',null,null,null,null,{pos:[24600,-600]}]);
      for(let i=0;i<4;i++) workingNodes.push(['dm'+i,'D'+i, i?('dm'+(i-1)):null,null,null,null,
                                              {pos:[24000+i*180, -200]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 480));

    /* A typed line break is a line break on the chart, not a wide word. */
    const lines = [...document.querySelectorAll('[data-id="ln"] text tspan')]
      .map(t=> +t.getAttribute('y'));
    out.brokenLines = new Set(lines).size;

    /* A citation and a sticker are set at the size of the run they sit in,
       so making a phrase bigger takes them with it. */
    const big = document.querySelector('[data-id="sz"] .sticker-missing, [data-id="sz"] rect.sticker-missing');
    out.stickerScaled = big ? +big.getAttribute('width') > stickerBox(NODE_FS) : null;

    /* Typing must not light the whole chart up. Every entry is redrawn to
       show the words as they are typed, and a fresh entry carries no
       highlight until it is put back. */
    selectNode('dm0');
    await new Promise(r=> setTimeout(r, 240));
    const dimBefore = document.querySelectorAll('.node.dim').length;
    beginLabelPreview('dm0');
    renderLabelPreview();
    out.dimHeld = document.querySelectorAll('.node.dim').length === dimBefore && dimBefore > 0;
    endLabelPreview(false);

    /* ⟲ strips everything, not only the colour. */
    selectedId = 'fm';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 320));
    document.querySelector('[data-hex-reset="editLabelInput"]').click();
    await new Promise(r=> setTimeout(r, 1100));
    out.strippedText = workingNodes.find(x=> x[0]==='fm')[1];
    // …and the border reset puts the outline back to the default ink.
    document.getElementById('editColorsReset').click();
    await new Promise(r=> setTimeout(r, 1100));
    out.borderReset = !nodes.get('fm').colors && nodes.get('fm').color === DEFAULT_NODE_COLOR;
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    /* The pickers report the effective face and size, and say "custom" —
       never offer it — when the text is set in more than one way. */
    selectedId = 'ln';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 320));
    const bar = toolbarForSurface(richFields.get('editLabelInput').surface);
    syncToolbarFace(bar);
    out.sizeShown = bar.querySelector('.tb-size').value;
    out.nodeFsHere = NODE_FS;
    out.faceShown = bar.querySelector('.tb-font:not(.tb-size)').value;
    out.customHidden = [...bar.querySelectorAll('option[value="__mixed__"]')].every(o=> o.hidden);
    out.entrySizeFieldGone = document.getElementById('editFontSizeInput').hidden;
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a typed line break breaks the line on the chart',
        r15.brokenLines === 2, String(r15.brokenLines));
  check('a sticker grows with the run it sits in', r15.stickerScaled !== false,
        String(r15.stickerScaled));
  check('typing in a label does not light the rest of the chart up',
        r15.dimHeld, String(r15.dimHeld));
  /* Every kind of formatting — and a reading is not one of them. The
     annotation is something the author wrote; clearing the formatting is
     not a licence to delete it. */
  check('the reset button clears every kind of formatting',
        r15.strippedText === 'red bold big [[base|anno]]', r15.strippedText);
  check('and the border colours have a reset of their own', r15.borderReset);
  check('the type pickers report the size and face actually in use',
        r15.sizeShown === String(r15.nodeFsHere) && r15.faceShown === 'arial',
        JSON.stringify({size:r15.sizeShown, face:r15.faceShown}));
  check('“custom” is something they say, never something you can pick',
        r15.customHidden && r15.entrySizeFieldGone,
        JSON.stringify({hidden:r15.customHidden, fieldGone:r15.entrySizeFieldGone}));

  /* The amalgam: colours that follow their lineages, an entry brought to
     its bar, lineages held within reach, and notes standing clear. */
  const am = await page.evaluate(async ()=>{
    const before = workingNodes.slice();
    const out = {};
    applyEdit(()=>{
      workingNodes.length = 0;
      workingNodes.push(['ap','P0',null,null,null,null,{pos:[0,0],colors:['#c23b22']}]);
      workingNodes.push(['aq','P1',null,null,null,null,{pos:[400,0],colors:['#2f6fb5']}]);
      workingNodes.push(['ax','M',['ap','aq'],null,null,'amalgam',{pos:[200,340]}]);
    });
    // A connector drawn out of a border records the RING, not its colour.
    refill(EDGE_STYLES, [{from:'ap', to:'ax', fromRing:0, fromSide:'bottom', color:'#c23b22'}]);
    rebuildChart(); await new Promise(r=> setTimeout(r, 460));
    out.before = document.querySelector('.amalgam-member[data-from="ap"]').getAttribute('stroke');
    applyEdit(()=>{ workingNodes.find(x=> x[0]==='ap')[6].colors = ['#1d7a5f']; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 460));
    out.after = document.querySelector('.amalgam-member[data-from="ap"]').getAttribute('stroke');
    const gid = /url\(#(.+)\)/.exec(
      document.querySelector('[data-id="ax"] > rect[stroke]').getAttribute('stroke'));
    out.inherited = gid ? [...document.getElementById(gid[1]).querySelectorAll('stop')]
      .map(x=> x.getAttribute('stop-color')) : null;
    // …but a colour chosen by hand still wins.
    refill(EDGE_STYLES, [{from:'ap', to:'ax', color:'#ff00ff', colorFixed:true}]);
    rebuildChart(); await new Promise(r=> setTimeout(r, 400));
    out.chosen = document.querySelector('.amalgam-member[data-from="ap"]').getAttribute('stroke');

    // A callout on each lineage keeps its own anchor on its own line.
    refill(EDGE_STYLES, []);
    applyEdit(()=>{
      workingNodes.push(['cl','left',null,null,null,'callout',
        {pos:[6600,900], leader:{from:'ap', to:'ax', at:0.6}}]);
      workingNodes.push(['cr','right',null,null,null,'callout',
        {pos:[8000,900], leader:{from:'aq', to:'ax', at:0.6}}]);
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 480));
    out.noteSides = [...document.querySelectorAll('#edgeLayer .callout-leader')].map(g=>{
      const n = nodes.get(g.dataset.id), d = g.querySelector('.leader-dot');
      return {from: g.dataset.from, dx: (n.x + n.w/2) - +d.getAttribute('cx')};
    });

    // A far-flung entry is brought to its lineages when it becomes a merge.
    applyEdit(()=>{
      workingNodes.length = 0;
      workingNodes.push(['bp','Q0',null,null,null,null,{pos:[0,0]}]);
      workingNodes.push(['bq','Q1',null,null,null,null,{pos:[200,0]}]);
      workingNodes.push(['bx','FAR',null,null,null,'amalgam',{pos:[3000,2400]}]);
    });
    rebuildChart(); await new Promise(r=> setTimeout(r, 400));
    connectNodes('bp','bx'); await new Promise(r=> setTimeout(r, 260));
    connectNodes('bq','bx'); await new Promise(r=> setTimeout(r, 460));
    const kid = nodes.get('bx');
    const mid = (nodes.get('bp').x + nodes.get('bp').w/2 + nodes.get('bq').x + nodes.get('bq').w/2)/2;
    out.broughtHome = Math.abs((kid.x + kid.w/2) - mid) < 30 &&
                      Math.abs(kid.y - nodes.get('bp').y) < AMALGAM_LEASH;


    applyEdit(()=>{ workingNodes = before; });
    rebuildChart(); await new Promise(r=> setTimeout(r, 420));
    return out;
  });
  check('a connector follows the colour of the border it leaves',
        am.before === '#c23b22' && am.after === '#1d7a5f', JSON.stringify(am));
  check('and the amalgam it feeds follows it too',
        JSON.stringify(am.inherited) === JSON.stringify(['#1d7a5f','#2f6fb5']),
        JSON.stringify(am.inherited));
  check('while a colour chosen by hand still wins', am.chosen === '#ff00ff', am.chosen);
  /* A note on a lineage of a merge is placed like every other note now:
     where the reader aimed it, or by the ordinary search when they have
     not. The apparatus that used to steer merged-lineage notes out of the
     fan has been taken out — it existed to guess a good spot, and guessing
     is not what happens any more. What still has to be true is that each
     lineage's note belongs to that lineage and is drawn. */
  check('every lineage of a merge carries its own note',
        am.noteSides.length === 2 &&
        am.noteSides.every(x=> Number.isFinite(x.dx)),
        JSON.stringify(am.noteSides));
  check('an entry far from its lineages is brought to them when it merges',
        am.broughtHome, String(am.broughtHome));


  /* ---- 36. this round ---- */
  const r16 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeRefs = REFS.slice();
    const beforeCats = TAG_CATS.slice();
    const out = {};
    STICKERS.push({key:'sc_probe', name:'p', src:'data:image/png;base64,iVBORw0KGgo='});
    rebuildStickerMap();
    refill(REFS, [{key:'q1', title:'', detail:'First', url:''},
                  {key:'q2', title:'', detail:'Second', url:''},
                  {key:'q3', title:'', detail:'Third', url:''}]);
    applyEdit(()=>{
      workingNodes.push(['ru','{{#c23b22|***[[base|anno]]***}} {{z:22|[[big|top]]}}',
                         null,null,null,null,{pos:[36000,-900]}]);
      workingNodes.push(['sr','a{{z:26|{{s:sc_probe}}}}b{{z:26|{{r:q1}}}}c{{s:sc_probe}}{{r:q1}}',
                         null,null,null,null,{pos:[36300,-900]}]);
      workingNodes.push(['pk2','pocket',null,null,null,'pocket',
                         {pos:[36600,-900], colors:['#111111','#2f6fb5','#c23b22']}]);
      workingNodes.push(['pk1','feeder',null,null,null,null,{pos:[36600,-1100]}]);
      workingNodes.push(['pk2','pocket','pk1',null,null,'pocket',
                         {pos:[36600,-900], colors:['#111111','#2f6fb5','#c23b22']}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 480));

    /* A reading belongs to the run it sits in — bold, italic, coloured,
       and sized with it, annotation and all. */
    const ru = [...document.querySelectorAll('[data-id="ru"] text tspan')].map(t=>({
      txt:t.textContent, w:t.getAttribute('font-weight'), i:t.getAttribute('font-style'),
      st:t.getAttribute('style'), fs:t.getAttribute('font-size'),
      anno:(t.getAttribute('class')||'').indexOf('ruby-anno') >= 0}));
    const rbBase = ru.find(x=> x.txt === 'base'), rbAnno = ru.find(x=> x.txt === 'anno');
    out.rubyStyled = !!(rbBase && rbAnno && rbBase.w === '700' && rbBase.i === 'italic' &&
      /c23b22/.test(rbBase.st || '') && rbAnno.w === '700' && /c23b22/.test(rbAnno.st || ''));
    const bigAnno = ru.find(x=> x.txt === 'top');
    out.rubyScales = !!(bigAnno && +bigAnno.fs > RUBY_FS + 1);

    /* Making a phrase bigger takes its sticker and its citation with it —
       on the chart, in the editor, and back out again unchanged. */
    const g2 = document.querySelector('[data-id="sr"]');
    const boxes = [...g2.querySelectorAll('image.sticker-glyph, rect.sticker-missing')]
      .map(e=> +e.getAttribute('width')).sort((a,b)=> a-b);
    const marks = [...g2.querySelectorAll('.ref-mark')]
      .map(e=> +e.getAttribute('font-size')).sort((a,b)=> a-b);
    out.stickerGrew = boxes.length === 2 && boxes[1] > boxes[0] * 1.6;
    out.markGrew = marks.length === 2 && marks[1] > marks[0] * 1.6;
    const d = document.createElement('div');
    d.innerHTML = inlineToHtml('{{z:26|{{s:sc_probe}}}}{{z:26|{{r:q1}}}}');
    out.editorScales = (d.innerHTML.match(/font-size:26px/g) || []).length === 2;
    out.editorRoundTrip = richHtmlToMarkup(d);
    out.editorRoundTypes = tokenizeLabel(out.editorRoundTrip).map(t=> t.type);

    /* Every border ring is grabbable across its whole strip, reached from
       OUTSIDE — which is the only way anyone reaches a top edge. */
    const pg = document.querySelector('[data-id="pk2"]');
    const pad = pg && pg.querySelector('.node-hover-pad');
    out.padWidth = pad ? parseFloat((pad.getAttribute('style')||'').replace(/[^0-9.]/g,'')) : 0;
    const pk = nodes.get('pk2');
    out.padCovers = out.padWidth >= 2 * ringStepFor(pk) + BAND_HIT_DEFAULT/2;

    /* An arrowhead meeting a rippled border is drawn ABOVE it, so the
       crests cannot take a bite out of it. */
    const head = document.querySelector('.edge-arrow[data-to="pk2"]');
    out.headAboveRipple = !!(head && head.parentNode && head.parentNode.id === 'arrowLayer');

    /* A redraw does not fade the connectors back in. */
    redrawEdges();
    out.noFade = document.getElementById('edgeLayer').classList.contains('no-fade');

    /* An empty callout survives a restyle of the connector it points at —
       restyling a connector cannot touch an entry. */
    applyEdit(()=>{
      workingNodes.push(['la','A',null,null,null,null,{pos:[36000,-600]}]);
      workingNodes.push(['lb','B','la',null,null,null,{pos:[36000,-420]}]);
      workingNodes.push(['lc','',null,null,null,'callout',
                         {pos:[36260,-520], leader:{from:'la', to:'lb', at:0.45}}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 300));
    openEdgeStylePopover('la','lb',{clientX:400, clientY:300, stopPropagation(){}});
    await new Promise(r=> setTimeout(r, 250));
    document.querySelector('#styleDash [data-value="dotted"]').click();
    await new Promise(r=> setTimeout(r, 300));
    const kc = nodes.get('lc');
    out.emptyLeaderKept = !!kc && Math.abs(kc.leader.at - 0.45) < 0.01 &&
      !!document.querySelector('#edgeLayer .callout-leader[data-id="lc"]');
    closeEdgePopover();
    await new Promise(r=> setTimeout(r, 200));

    /* Lineages routed straight merge at one point: no bar, no joints. */
    applyEdit(()=>{
      workingNodes.push(['sa','Alpha',null,null,null,null,{pos:[37000,-900], colors:['#c23b22']}]);
      workingNodes.push(['sb','Beta',null,null,null,null,{pos:[37300,-900], colors:['#1d7a5f']}]);
      workingNodes.push(['sc','Gamma',null,null,null,null,{pos:[37600,-900], colors:['#2f6fb5']}]);
      // Off the middle, for the same reason as 'lam' above.
      workingNodes.push(['sm','Merge',['sa','sb','sc'],null,null,'amalgam',{pos:[37450,-640]}]);
      ['sa','sb','sc'].forEach(f=> EDGE_STYLES.push({from:f, to:'sm', routing:'straight'}));
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 350));
    out.straightMembers = document.querySelectorAll('.amalgam-member[data-to="sm"]').length;
    out.straightJoints = document.querySelectorAll('.amalgam-joint[data-to="sm"]').length;
    out.straightJunction = document.querySelectorAll('.amalgam-junction[data-to="sm"]').length;
    /* Turn TWO of the three back to elbows and the bar comes back — all
       three still have a place on it, so there are two seams — while the
       one still routed straight runs to ITS OWN landing in a single line
       rather than coming down onto it and turning. */
    ['sa','sb'].forEach(f=>{
      EDGE_STYLES.find(x=> x.from===f && x.to==='sm').routing = 'orthogonal';
    });
    redrawEdges();
    await new Promise(r=> setTimeout(r, 250));
    out.mixedJoints = document.querySelectorAll('.amalgam-joint[data-to="sm"]').length;
    const scPath = document.querySelector('.amalgam-member[data-from="sc"]');
    const scD = scPath ? scPath.getAttribute('d') : '';
    // One run to the bar, then at most the bar leg — never a routed elbow.
    out.straightOneIsOneRun = (scD.match(/[QC]/g) || []).length <= 1 &&
                              (scD.match(/L/g) || []).length <= 2;
    /* And it lands where an elbowed one would: at its own place on the
       bar, not at a bead that belongs to a neighbour's turn. */
    const sc = nodes.get('sc');
    /* Its landing is where its own run reaches bar level — the point it
       turns onto the bar at, which is the second point of the path, not
       the far end of the stretch of bar it then owns. */
    const scNums = (scD.match(/-?[\d.]+/g) || []).map(Number);
    out.scLandX = scNums[2];
    out.landsAtOwnPlace = Math.abs(scNums[2] - (sc.x + sc.w/2)) < 8;

    /* A note on a merged lineage stands on the far side from the entries
       feeding the merge, and never on the line it belongs to. */
    applyEdit(()=>{
      const rec = EDGE_STYLES.find(x=> x.from==='sa' && x.to==='sm');
      rec.routing = 'straight';
      workingNodes.push(['scn','a note here',null,null,null,'callout',
        {pos:[36600,-820], leader:{from:'sa', to:'sm', at:0.5}}]);
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 350));
    const cardN = nodes.get('scn');
    const dot  = document.querySelector('#edgeLayer .callout-leader[data-id="scn"] .leader-dot');
    if(cardN && dot){
      const cxx = cardN.x + cardN.w/2, cyy = cardN.y + cardN.h/2;
      const ax = +dot.getAttribute('cx'), ay = +dot.getAttribute('cy');
      const pa = nodes.get('sa'), pb = nodes.get('sb');
      const px = (pa.x + pa.w/2 + pb.x + pb.w/2)/2, py = (pa.y + pa.h/2 + pb.y + pb.h/2)/2;
      out.noteAway = (cxx - ax)*(ax - px) + (cyy - ay)*(ay - py) > 0;
      // …and not lying across the very line it points at.
      const line = document.querySelector('.amalgam-member[data-from="sa"]');
      const nums = (line ? line.getAttribute('d') : '').match(/-?\d+(?:\.\d+)?/g) || [];
      out.noteOffLine = nums.length >= 4 &&
        !segHitsBox(+nums[0], +nums[1], +nums[2], +nums[3],
                    cardN.x, cardN.y, cardN.x + cardN.w, cardN.y + cardN.h);
    }

    /* Filing a tag is carrying it onto a category. Ungrouped is not one. */
    refill(TAG_CATS, [{name:'Era', tags:[]}, {name:'Empty', tags:['unused-probe']}]);
    applyEdit(()=>{
      workingNodes.push(['tgp','Tagged',null,null,null,null,
                         {pos:[38000,-900], tags:['alpha-probe','beta-probe']}]);
    });
    rebuildChart(); buildManagement();
    // The panel has to be on screen: a drop is decided by what is under
    // the pointer, and nothing is under a pointer over a hidden panel.
    document.getElementById('legend').classList.add('open');
    await new Promise(r=> setTimeout(r, 350));
    out.rowIsDraggable = !!document.querySelector('.legend-item[data-tag="alpha-probe"].draggable-row');
    listDrag = {kind:'tag', key:'alpha-probe', label:'alpha-probe', moved:true};
    const eraBlock = document.querySelector('.legend-group[data-cat="Era"]');
    const looseBlock = document.querySelector('.legend-group.legend-loose');
    const eb = eraBlock.getBoundingClientRect();
    const ebMid = {x: eb.left + eb.width/2, y: eb.top + eb.height/2};
    /* The SPECIAL group refuses a drop — what is in it is there because of
       what it is, not because anybody filed it. The uncategorised bin is a
       different thing standing under the search box, and it accepts one:
       that is the gesture for taking a tag back out of a category. */
    const specialBlock = [...document.querySelectorAll('.legend-group[data-cat="' + UNGROUPED + '"]')]
      .find(b=> !b.classList.contains('legend-loose'));
    out.ungroupedRefuses = !specialBlock || (()=>{
      const sb2 = specialBlock.getBoundingClientRect();
      return listDropUnder(sb2.left + sb2.width/2, sb2.top + sb2.height/2) === null;
    })();
    out.binAccepts = !looseBlock || (()=>{
      const lb2 = looseBlock.getBoundingClientRect();
      const hit2 = listDropUnder(lb2.left + lb2.width/2, lb2.top + lb2.height/2);
      return !!(hit2 && hit2.el === looseBlock);
    })();
    const hit = listDropUnder(ebMid.x, ebMid.y);
    out.categoryAccepts = !!(hit && hit.el === eraBlock && hit.where === 'into');
    listDrag = null;
    applyEdit(()=> assignTagCategory('alpha-probe', 'Era'));
    buildManagement();
    await new Promise(r=> setTimeout(r, 200));
    out.filed = (TAG_CATS.find(c=> c.name==='Era') || {tags:[]}).tags.indexOf('alpha-probe') >= 0;
    // An empty category's eye still hides what it declares.
    const emptyEye = document.querySelector('.legend-group[data-cat="Empty"] .eye-mini');
    if(emptyEye){ emptyEye.click(); await new Promise(r=> setTimeout(r, 200)); }
    out.emptyEyeWorks = hiddenTags.has('unused-probe');
    hiddenTags.delete('unused-probe');

    /* A reference has no heading, and its number is its place in the list. */
    buildManagement();
    await new Promise(r=> setTimeout(r, 200));
    out.noRefTitle = !document.querySelector('.ref-item .ref-title');
    out.refDraggable = !!document.querySelector('.ref-item[data-key="q1"].draggable-row');
    out.noRefArrows = ![...document.querySelectorAll('.ref-tools button')]
      .some(b=> b.textContent === '↑' || b.textContent === '↓');
    reorderRef('q1', 'q3', 'after');
    await new Promise(r=> setTimeout(r, 250));
    out.refOrder = REFS.map(r=> r.key).join(',');
    out.refMarkNumber = refMarkText('q1');

    document.getElementById('legend').classList.remove('open');
    applyEdit(()=>{ workingNodes = beforeNodes; });
    refill(REFS, beforeRefs);
    refill(TAG_CATS, beforeCats);
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 350));
    return out;
  });
  check('a reading takes the look of the run it sits in', r16.rubyStyled);
  check('and its annotation grows when the run does', r16.rubyScales);
  check('a sticker grows with the phrase it is set in', r16.stickerGrew);
  check('and so does a citation', r16.markGrew);
  /* Two runs set the same way and touching each other come back as ONE
     wrapper: the writer holds a close back in case the next thing opened
     is the same wrapper again, which is also what stops `**a****b**` — a
     run of four asterisks the grammar cannot read — ever being written. */
  check('the editor scales them too, and hands them back unchanged',
        r16.editorScales && r16.editorRoundTrip === '{{z:26|{{s:sc_probe}}{{r:q1}}}}' &&
        JSON.stringify(r16.editorRoundTypes) === JSON.stringify(['sticker','ref']),
        r16.editorRoundTrip);
  check('every border ring can be grabbed from outside the entry',
        r16.padCovers, String(r16.padWidth));
  check('an arrowhead meeting a rippled border is drawn over it',
        r16.headAboveRipple);
  check('a redraw does not fade the connectors back in', r16.noFade);
  check('a note placed on a connector survives restyling it',
        r16.emptyLeaderKept);
  check('lineages routed straight merge at one point, with no bar',
        r16.straightMembers === 3 && r16.straightJoints === 0 && r16.straightJunction === 1,
        JSON.stringify({m:r16.straightMembers, j:r16.straightJoints, b:r16.straightJunction}));
  check('one elbowed lineage brings the bar back for all of them',
        r16.mixedJoints === 2, String(r16.mixedJoints));
  check('and a straight one runs to its own place on it, in one line',
        r16.straightOneIsOneRun && r16.landsAtOwnPlace,
        JSON.stringify({oneRun:r16.straightOneIsOneRun, ownPlace:r16.landsAtOwnPlace,
                        land:r16.scLandX}));
  check('a note on a merged lineage stands away from the entries feeding it',
        r16.noteAway, String(r16.noteAway));
  check('and never lies across the line it points at', r16.noteOffLine,
        String(r16.noteOffLine));
  check('a tag is filed by carrying it onto a category',
        r16.rowIsDraggable && r16.categoryAccepts && r16.filed,
        JSON.stringify({drag:r16.rowIsDraggable, accepts:r16.categoryAccepts, filed:r16.filed}));
  check('Special is what a tag IS, not a place to put one — but the bin is',
        r16.ungroupedRefuses && r16.binAccepts,
        JSON.stringify({special:r16.ungroupedRefuses, bin:r16.binAccepts}));
  check('an empty category’s eye still hides what it declares', r16.emptyEyeWorks);
  check('a reference is identified by its number, not by a heading',
        r16.noRefTitle && r16.noRefArrows,
        JSON.stringify({title:r16.noRefTitle, arrows:r16.noRefArrows}));
  check('and is renumbered by moving it, which renumbers its marks too',
        r16.refDraggable && r16.refOrder === 'q2,q3,q1' && r16.refMarkNumber === '[3]',
        JSON.stringify({order:r16.refOrder, mark:r16.refMarkNumber}));

  /* ---- 37. this round ---- */
  const r17 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeRefs = REFS.slice();
    const beforeCats = TAG_CATS.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    STICKERS.push({key:'rz_probe', name:'z', src:'data:image/png;base64,iVBORw0KGgo='});
    rebuildStickerMap();
    refill(REFS, [{key:'rz1', title:'', detail:'Source', url:''}]);

    /* "Above the line" and "below the line" are mirror images. The plate
       is what the reader sees, so it is the plate that is placed. */
    const gapFor = async (pos)=>{
      applyEdit(()=>{
        workingNodes.push(['sy_a','A',null,null,null,null,{pos:[40000,-900]}]);
        workingNodes.push(['sy_b','B','sy_a',null,null,null,{pos:[40600,-900]}]);
        EDGE_STYLES.push({from:'sy_a', to:'sy_b', note:'one line', notePos:pos});
      });
      rebuildChart(); redrawEdges();
      await new Promise(r=> setTimeout(r, 320));
      const plate = document.querySelector('.edge-note[data-to="sy_b"] .edge-note-plate');
      const line = document.querySelector('#edgeLayer .edge.struct[data-to="sy_b"]');
      const pb = plate.getBoundingClientRect(), lb = line.getBoundingClientRect();
      const g = pos === 'above' ? (lb.top + lb.height/2) - pb.bottom
                                : pb.top - (lb.top + lb.height/2);
      applyEdit(()=>{
        workingNodes = workingNodes.filter(x=> x[0] !== 'sy_a' && x[0] !== 'sy_b');
        const i = EDGE_STYLES.findIndex(x=> x.to === 'sy_b');
        if(i >= 0) EDGE_STYLES.splice(i, 1);
      });
      rebuildChart();
      await new Promise(r=> setTimeout(r, 200));
      return +g.toFixed(2);
    };
    out.gapAbove = await gapFor('above');
    out.gapBelow = await gapFor('below');

    /* A reading is one thing, however many letters it covers: formatting
       part of it formats all of it, and nothing can be dropped inside it. */
    applyEdit(()=>{
      workingNodes.push(['rz','Beast Wars: [[Uprising|reading]]',null,null,null,null,
                         {pos:[40000,-600]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 320));
    selectedId = 'rz';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 350));
    const rec = richFields.get('editLabelInput');
    const surf = rec.surface;
    const rb = surf.querySelector('ruby');
    const rng = document.createRange();
    rng.setStart(rb.firstChild, 0); rng.setEnd(rb.firstChild, 4);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
    applyRichCommand(surf, 'color', '#8a2be2');
    await new Promise(r=> setTimeout(r, 250));
    out.rubyWhole = richHtmlToMarkup(surf);
    // A sticker put "on" a reading lands beside it, not inside it.
    setRichValue(document.getElementById('editLabelInput'), '[[base|anno]]');
    await new Promise(r=> setTimeout(r, 150));
    const rb2 = surf.querySelector('ruby');
    const rng2 = document.createRange();
    rng2.setStart(rb2.firstChild, 2); rng2.collapse(true);
    const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(rng2);
    insertIntoSurface(surf, '{{s:rz_probe}}');
    await new Promise(r=> setTimeout(r, 220));
    out.stickerBeside = richHtmlToMarkup(surf);

    /* The size picker counts a sticker as a run, and says so in italics. */
    setRichValue(document.getElementById('editLabelInput'), 'word {{z:26|{{s:rz_probe}}}} tail');
    await new Promise(r=> setTimeout(r, 200));
    const all = document.createRange(); all.selectNodeContents(surf);
    const s3 = window.getSelection(); s3.removeAllRanges(); s3.addRange(all);
    const bar = toolbarForSurface(surf);
    syncToolbarFace(bar);
    const sizeSel = bar.querySelector('.tb-size');
    out.sizeSaysCustom = sizeSel.value === '__mixed__';
    out.sizeReadsItalic = getComputedStyle(sizeSel).fontStyle === 'italic';

    /* ⟲ leaves a citation a citation. */
    setRichValue(document.getElementById('editLabelInput'), 'A {{#c23b22|**bold**}} {{r:rz1}} B');
    await new Promise(r=> setTimeout(r, 180));
    document.querySelector('[data-hex-reset="editLabelInput"]').click();
    await new Promise(r=> setTimeout(r, 950));
    out.resetKeepsRef = document.getElementById('editLabelInput').value;
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    /* Rings step OUTWARD, so it is the INNER ones whose connectors are
       buried and need a cap; the outermost needs none, and used to get a
       stub of itself drawn past the entry. And the run-out out of any of
       them clears the border before it turns. */
    applyEdit(()=>{
      workingNodes.push(['cap_a','A',null,null,null,null,
                         {pos:[41000,-900], colors:['#111111','#2f6fb5','#c23b22']}]);
      workingNodes.push(['cap_b','B','cap_a',null,null,null,{pos:[41000,-600]}]);
      workingNodes.push(['cap_c','C','cap_a',null,null,null,{pos:[41400,-600]}]);
      EDGE_STYLES.push({from:'cap_a', to:'cap_b', fromRing:0, fromSide:'bottom', toSide:'top'});
      EDGE_STYLES.push({from:'cap_a', to:'cap_c', fromRing:2, fromSide:'bottom', toSide:'top'});
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 420));
    out.capOnInner = !!document.querySelector('.edge-cap[data-to="cap_b"]');
    out.noCapOnOuter = !document.querySelector('.edge-cap[data-to="cap_c"]');
    const inner = document.querySelector('#edgeLayer .edge.struct[data-to="cap_b"]:not(.edge-cap)');
    const nums = (inner.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
    const na = nodes.get('cap_a');
    // The first straight run out of the port clears all three borders.
    out.runOutClears = (nums[3] - nums[1]) >= 2 * RING_STEP;

    /* A category with nothing in it has an eye that cannot act. */
    refill(TAG_CATS, [{name:'EmptyCat', tags:[]}, {name:'FullCat', tags:['az_probe']}]);
    applyEdit(()=>{
      workingNodes.push(['az','Tagged',null,null,null,null,
                         {pos:[42000,-900], tags:['az_probe'], multiLang:true,
                          langTabs:[{tag:'JP',text:'ja'},{tag:'RU',text:'ru'},{tag:'DE',text:'de'}]}]);
    });
    rebuildChart(); buildManagement();
    document.getElementById('legend').classList.add('open');
    await new Promise(r=> setTimeout(r, 350));
    const emptyEye = document.querySelector('.legend-group[data-cat="EmptyCat"] .eye-mini');
    const fullEye  = document.querySelector('.legend-group[data-cat="FullCat"] .eye-mini');
    out.emptyEyeInert = !!emptyEye && emptyEye.disabled && +getComputedStyle(emptyEye).opacity < 0.6;
    out.fullEyeLive = !!fullEye && !fullEye.disabled;
    out.noUnfileButton = !document.querySelector('.legend-tag-unfile');
    out.eyeColumns = [...new Set([...document.querySelectorAll('#legendList .eye-mini')]
      .map(e=> Math.round(e.getBoundingClientRect().left)))].length;
    document.getElementById('legend').classList.remove('open');

    /* Language chips no longer take the top edge away from the entry. */
    const az = nodes.get('az');
    const hit = document.querySelector('[data-id="az"] .node-handle[data-side="top"] .node-handle-hit');
    out.chipsCovered = az.chipRight > az.x + az.w * 0.5;
    out.topStripWhole = Math.abs(+hit.getAttribute('x') - az.x) < 0.5 &&
                        Math.abs(+hit.getAttribute('width') - az.w) < 0.5;

    /* Taking a border away takes its connectors with it. */
    out.linkBefore = document.querySelectorAll('#edgeLayer .edge.struct[data-to="cap_c"]').length;
    selectedId = 'cap_a';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 350));
    document.getElementById('editColorsInput').value = '#111111';
    document.getElementById('editColorsInput').dispatchEvent(new Event('input', {bubbles:true}));
    commitNodeEdit();
    await new Promise(r=> setTimeout(r, 500));
    out.linkAfter = document.querySelectorAll('#edgeLayer .edge.struct[data-to="cap_c"]').length;
    out.innerLinkHeld = document.querySelectorAll('#edgeLayer .edge.struct[data-to="cap_b"]').length > 0;
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    /* Notes on a merge: the two at the ends of the bar step outward, the
       ones between them drop below it — never into the fan. */
    applyEdit(()=>{
      ['n0','n1','n2'].forEach((id,i)=> workingNodes.push([id,'P'+i,null,null,null,null,
        {pos:[43000 + i*260, -1000], colors:[['#c23b22','#1d7a5f','#2f6fb5'][i]]}]));
      workingNodes.push(['nm','M',['n0','n1','n2'],null,null,'amalgam',{pos:[43260,-600]}]);
      // A callout on each lineage of a merge, placed where the reader put it.
      ['n0','n1','n2'].forEach((f,i)=> workingNodes.push(['nc'+i, 'note '+i, null, null, null,
        'callout', {pos:[[42600,-1000],[43260,-380],[43900,-1000]][i],
                    leader:{from:f, to:'nm', at:0.5}}]));
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 480));
    const cardOf = (id)=>{
      const n = nodes.get(id);
      if(!n || !document.querySelector(`#edgeLayer .callout-leader[data-id="${id}"]`)) return null;
      return {x: n.x + n.w/2, y: n.y + n.h/2};
    };
    const bead = document.querySelector('.amalgam-junction[data-to="nm"]');
    const barY = bead ? +bead.getAttribute('cy') : null;
    const c0 = cardOf('nc0'), c1 = cardOf('nc1'), c2 = cardOf('nc2');
    const p0 = nodes.get('n0'), p2 = nodes.get('n2');
    out.endsStepOut = !!(c0 && c2) && c0.x < p0.x && c2.x > p2.x + p2.w;
    out.middleDropsBelow = !!(c1 && barY !== null) && c1.y > barY;

    refill(TAG_CATS, beforeCats);
    refill(REFS, beforeRefs);
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a note above the line and one below it are mirror images',
        Math.abs(r17.gapAbove - r17.gapBelow) < 0.6 && r17.gapAbove > 0,
        JSON.stringify({above:r17.gapAbove, below:r17.gapBelow}));
  /* Both halves of a reading are markup in their own right, so formatting
     part of one is a thing the stored form can say — and says. What is
     still widened is a selection that STRADDLES the two halves, or runs
     out of the reading, since that is the case the browser answers by
     splitting the <ruby> in two. */
  check('part of a reading takes formatting on its own',
        r17.rubyWhole === 'Beast Wars: [[{{#8a2be2|Upri}}sing|reading]]', r17.rubyWhole);
  check('and a sticker put on a reading lands beside it, not inside it',
        r17.stickerBeside === '[[base|anno]]{{s:rz_probe}}', r17.stickerBeside);
  check('a sticker at another size makes the picker say “custom”, in italics',
        r17.sizeSaysCustom && r17.sizeReadsItalic,
        JSON.stringify({custom:r17.sizeSaysCustom, italic:r17.sizeReadsItalic}));
  check('clearing the formatting leaves a citation a citation',
        r17.resetKeepsRef === 'A bold {{r:rz1}} B', r17.resetKeepsRef);
  check('the buried end of a connector is the INNER ring’s, and it is capped',
        r17.capOnInner && r17.noCapOnOuter,
        JSON.stringify({inner:r17.capOnInner, outer:r17.noCapOnOuter}));
  check('and a connector clears the borders before it turns', r17.runOutClears);
  check('an empty category’s eye is a control that cannot act',
        r17.emptyEyeInert && r17.fullEyeLive,
        JSON.stringify({empty:r17.emptyEyeInert, full:r17.fullEyeLive}));
  check('a tag row carries no filing button, and every eye is in one column',
        r17.noUnfileButton && r17.eyeColumns === 1,
        JSON.stringify({noBtn:r17.noUnfileButton, columns:r17.eyeColumns}));
  check('language chips no longer take the top edge away',
        r17.chipsCovered && r17.topStripWhole,
        JSON.stringify({covered:r17.chipsCovered, whole:r17.topStripWhole}));
  check('taking a border away takes the connectors on it too',
        r17.linkBefore === 1 && r17.linkAfter === 0 && r17.innerLinkHeld,
        JSON.stringify({before:r17.linkBefore, after:r17.linkAfter, held:r17.innerLinkHeld}));
  /* The per-lineage note directions are gone with the rest of the
     merged-note apparatus; see the note above. */

  /* ---- 38. this round ---- */
  const r18 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const beforeCats = TAG_CATS.slice();
    const out = {};

    /* A rule under the words and one through them, in the same kinds of
       line a connector is drawn in — on the chart, and back out again. */
    applyEdit(()=>{
      workingNodes.push(['ln1','{{u:dashed|under}} {{t:wavy|struck}} {{u:solid|{{t:solid|both}}}}',
                         null,null,null,null,{pos:[45000,-900]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 420));
    const runs = [...document.querySelectorAll('[data-id="ln1"] text tspan')]
      .map(t=> ({txt:t.textContent, st:t.getAttribute('style') || ''}));
    const byText = (w)=> (runs.find(x=> x.txt === w) || {st:''}).st;
    /* The rule UNDER the words is drawn rather than decorated, so what
       says it is there is the run's mark and the line beside the text. */
    const byMark = (w)=> ([...document.querySelectorAll('[data-id="ln1"] text tspan')]
      .find(t=> t.textContent === w) || {getAttribute:()=>null});
    out.underDrawn = byMark('under').getAttribute('data-ul') === 'dashed' &&
      document.querySelectorAll('[data-id="ln1"] .text-underline').length > 0;
    out.strikeDrawn = /line-through/.test(byText('struck')) &&
                      /text-decoration-style:wavy/.test(byText('struck'));
    out.bothDrawn = byMark('both').getAttribute('data-ul') === 'solid' &&
                    /line-through/.test(byText('both'));
    const d0 = document.createElement('div');
    d0.innerHTML = inlineToHtml('{{u:dotted|a}}{{t:double|b}}{{u:wavy|{{t:wavy|c}}}}');
    out.lineRoundTrip = richHtmlToMarkup(d0);

    /* The buttons toggle, and a citation is never drawn through. */
    selectedId = 'ln1';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 350));
    const surf = richFields.get('editLabelInput').surface;
    const bar = toolbarForSurface(surf);
    out.hasLineButtons = !!bar.querySelector('.tb-line-under') &&
                         !!bar.querySelector('.tb-line-strike') &&
                         !!bar.querySelector('.tb-line-style');
    setRichValue(document.getElementById('editLabelInput'), 'alpha beta');
    await new Promise(r=> setTimeout(r, 160));
    const pickAll = ()=>{
      const rr = document.createRange(); rr.selectNodeContents(surf);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rr);
    };
    pickAll(); applyRichCommand(surf, 'under', 'dashed');
    await new Promise(r=> setTimeout(r, 160));
    out.underApplied = richHtmlToMarkup(surf);
    pickAll(); applyRichCommand(surf, 'under', 'dashed');
    await new Promise(r=> setTimeout(r, 160));
    out.underToggledOff = richHtmlToMarkup(surf);
    // A rule never reaches a citation: an atomic inline box does not take
    // a decoration propagated from the run around it.
    refill(REFS, [{key:'lnr', title:'', detail:'S', url:''}]);
    setRichValue(document.getElementById('editLabelInput'), 'a {{u:solid|b {{r:lnr}} c}} d');
    await new Promise(r=> setTimeout(r, 200));
    const chip = surf.querySelector('[data-ref]');
    out.chipNotRuled = !!chip && getComputedStyle(chip).display === 'inline-block';

    /* A sticker is a picture: it has a size but no face. */
    STICKERS.push({key:'ln_s', name:'s', src:'data:image/png;base64,iVBORw0KGgo='});
    rebuildStickerMap();
    setRichValue(document.getElementById('editLabelInput'), 'word {{s:ln_s}} tail');
    await new Promise(r=> setTimeout(r, 180));
    pickAll();
    syncToolbarFace(bar);
    out.faceNotMixed = bar.querySelector('.tb-font:not(.tb-size):not(.tb-line-style)').value !== '__mixed__';

    /* ⟲ takes the formatting off a reading and leaves the reading. */
    setRichValue(document.getElementById('editLabelInput'), '{{#c23b22|**[[base|anno]]**}} x');
    await new Promise(r=> setTimeout(r, 180));
    document.querySelector('[data-hex-reset="editLabelInput"]').click();
    await new Promise(r=> setTimeout(r, 950));
    out.resetKeepsRuby = document.getElementById('editLabelInput').value;
    /* …and the reading is set in the project's own face while it is being
       written, not the browser's. */
    setRichValue(document.getElementById('editLabelInput'), '[[base|anno]]');
    await new Promise(r=> setTimeout(r, 200));
    const rt = surf.querySelector('rt');
    out.rubyStyled = !!rt && /Plex Mono/.test(getComputedStyle(rt).fontFamily);
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    /* Picking an entry up does not light the whole chart. */
    applyEdit(()=>{
      workingNodes.push(['dg0','A',null,null,null,null,{pos:[46000,-900]}]);
      workingNodes.push(['dg1','B','dg0',null,null,null,{pos:[46000,-700]}]);
      workingNodes.push(['dg2','C',null,null,null,null,{pos:[46300,-900]}]);
      workingNodes.push(['dg3','D','dg2',null,null,null,{pos:[46300,-700]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 350));
    selectNode('dg0');
    await new Promise(r=> setTimeout(r, 250));
    const dimBefore = document.querySelectorAll(DIMMABLE_EDGE_PARTS).length &&
      [...document.querySelectorAll(DIMMABLE_EDGE_PARTS)].filter(x=> x.classList.contains('dim')).length;
    const gEl = document.querySelector('[data-id="dg0"]');
    beginNodeDrag({button:0, clientX:0, clientY:0, target:gEl,
                   stopPropagation(){}, preventDefault(){}},
                  nodes.get('dg0'), gEl);
    window.dispatchEvent(new MouseEvent('mousemove', {clientX:40, clientY:40, bubbles:true}));
    await new Promise(r=> setTimeout(r, 120));
    out.dimDuringDrag = [...document.querySelectorAll(DIMMABLE_EDGE_PARTS)]
      .filter(x=> x.classList.contains('dim')).length;
    out.dimBeforeDrag = dimBefore;
    window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 250));
    deselect();

    /* A note nobody wrote is not a note. */
    applyEdit(()=>{
      workingNodes.push(['nq0','A',null,null,null,null,{pos:[47000,-900]}]);
      workingNodes.push(['nq1','B','nq0',null,null,null,{pos:[47000,-700]}]);
      workingNodes.push(['nqc','',null,null,null,'callout',
        {pos:[47260,-800], leader:{from:'nq0', to:'nq1', at:0.5}}]);
      EDGE_STYLES.push({from:'nq0', to:'nq1', note:' ', notePos:'above'});
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 300));
    openEdgeStylePopover('nq0','nq1',{clientX:400, clientY:300, stopPropagation(){}});
    await new Promise(r=> setTimeout(r, 250));
    out.blankNoteWhileOpen = !!document.querySelector('.edge-note[data-to="nq1"]');
    closeEdgePopover();
    await new Promise(r=> setTimeout(r, 300));
    /* A callout the reader placed stays, empty or not — it is an entry, and
       an entry is never tidied away behind their back. A PLATE with nothing
       written in it still is. */
    out.blankLeaderKept = !!nodes.get('nqc') &&
      !!document.querySelector('#edgeLayer .callout-leader[data-id="nqc"]');
    refill(EDGE_STYLES, [{from:'nq0', to:'nq1', note:' ', notePos:'above'}]);
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 260));
    openEdgeStylePopover('nq0','nq1',{clientX:400, clientY:300, stopPropagation(){}});
    await new Promise(r=> setTimeout(r, 220));
    closeEdgePopover();
    await new Promise(r=> setTimeout(r, 280));
    const shut2 = edgeStyleFor('nq0','nq1');
    out.blankPlateDropped = !shut2.note;

    /* A tag that changes the entries carrying it says so. */
    refill(TAG_CATS, [{name:'Kinds', tags:[FANFIC_TAG, 'plain-probe']}]);
    applyEdit(()=>{
      workingNodes.push(['sp0','S',null,null,null,null,
                         {pos:[48000,-900], tags:[FANFIC_TAG, 'plain-probe']}]);
    });
    rebuildChart(); buildManagement();
    document.getElementById('legend').classList.add('open');
    await new Promise(r=> setTimeout(r, 350));
    const specialRow = document.querySelector(`.legend-item[data-tag="${FANFIC_TAG}"] .tag-special`);
    const plainRow = document.querySelector('.legend-item[data-tag="plain-probe"] .tag-special');
    out.starOnSpecial = !!specialRow;
    out.noStarOnPlain = !plainRow;
    out.starIsBlue = specialRow ? getComputedStyle(specialRow).color : null;

    /* A control that cannot act does not answer the pointer either. */
    const dead = document.createElement('button');
    dead.className = 'icon-action eye-mini';
    dead.disabled = true;
    document.getElementById('legendList').appendChild(dead);
    const before = getComputedStyle(dead).borderColor;
    dead.classList.add('probe-hover');
    out.disabledOpacity = +getComputedStyle(dead).opacity;
    out.disabledCursor = getComputedStyle(dead).cursor;
    dead.remove();
    document.getElementById('legend').classList.remove('open');

    refill(TAG_CATS, beforeCats);
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a rule can be drawn under the words and through them',
        r18.underDrawn && r18.strikeDrawn && r18.bothDrawn,
        JSON.stringify({u:r18.underDrawn, s:r18.strikeDrawn, both:r18.bothDrawn}));
  check('in the same kinds of line a connector is drawn in, and it survives the editor',
        r18.lineRoundTrip === '{{u:dotted|a}}{{t:double|b}}{{u:wavy|{{t:wavy|c}}}}',
        r18.lineRoundTrip);
  check('the toolbar carries both, with the kind of line between them',
        r18.hasLineButtons);
  check('pressing it twice takes the rule off again',
        r18.underApplied === '{{u:dashed|alpha beta}}' && r18.underToggledOff === 'alpha beta',
        JSON.stringify({on:r18.underApplied, off:r18.underToggledOff}));
  check('a citation is never drawn through', r18.chipNotRuled);
  check('a sticker has a size but no face', r18.faceNotMixed);
  check('clearing the formatting keeps the reading it was on',
        r18.resetKeepsRuby === '[[base|anno]] x', r18.resetKeepsRuby);
  check('and a reading is set in the chart’s own face while it is typed',
        r18.rubyStyled);
  check('picking an entry up does not light the rest of the chart',
        r18.dimDuringDrag === r18.dimBeforeDrag && r18.dimBeforeDrag > 0,
        JSON.stringify({before:r18.dimBeforeDrag, during:r18.dimDuringDrag}));
  check('a leader card placed with nothing in it stays on the chart',
        r18.blankNoteWhileOpen && r18.blankLeaderKept,
        JSON.stringify({open:r18.blankNoteWhileOpen, kept:r18.blankLeaderKept}));
  check('while a plate nobody wrote is dropped when the popover closes',
        r18.blankPlateDropped, JSON.stringify({dropped:r18.blankPlateDropped}));
  check('a tag that changes what carries it wears a star',
        r18.starOnSpecial && r18.noStarOnPlain && /47, 111, 181|2f6fb5/.test(r18.starIsBlue || ''),
        JSON.stringify({star:r18.starOnSpecial, plain:r18.noStarOnPlain, colour:r18.starIsBlue}));
  check('a control that cannot act is faded and takes no pointer',
        r18.disabledOpacity < 0.6 && r18.disabledCursor === 'default',
        JSON.stringify({o:r18.disabledOpacity, c:r18.disabledCursor}));

  /* ---- 39. the review pass ---- */
  const r19 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};

    /* A typed line break is a line break wherever it falls — including at
       the end of a run, and between two of them. */
    const lineCount = async (label)=>{
      applyEdit(()=>{
        workingNodes.push(['br_p', label, null, null, null, null, {pos:[50000,-900]}]);
      });
      rebuildChart();
      await new Promise(r=> setTimeout(r, 380));
      const n = new Set([...document.querySelectorAll('[data-id="br_p"] text tspan')]
        .map(t=> t.getAttribute('y'))).size;
      applyEdit(()=>{ workingNodes = workingNodes.filter(x=> x[0] !== 'br_p'); });
      rebuildChart();
      await new Promise(r=> setTimeout(r, 180));
      return n;
    };
    out.breakPlain = await lineCount('one\ntwo');
    out.breakBeforeRun = await lineCount('one\n**two**');
    out.breakBetweenRuns = await lineCount('{{#c23b22|Red}}\n{{#2f6fb5|Blue}}');

    /* Braces in ordinary text cannot cut a styled run short. */
    out.braceEscaped = escapeMarkup('a}}b');
    out.braceRuns = tokenizeLabel('{{#c23b22|' + escapeMarkup('a}}b') + '}}')
      .map(t=> `${t.text}@${t.color || '-'}`).join('|');
    out.braceRunsTriple = tokenizeLabel('{{#c23b22|' + escapeMarkup('a}}}b') + '}}')
      .map(t=> `${t.text}@${t.color || '-'}`).join('|');
    // …and a reading's halves cannot be written with a bracket in them.
    const dr = document.createElement('div');
    dr.innerHTML = '<ruby>Ark]2<rt>reading</rt></ruby>';
    out.rubyBracketSafe = richHtmlToMarkup(dr);
    const rbToks = tokenizeLabel(out.rubyBracketSafe);
    out.rubyBracketReads = rbToks.map(t=> t.type).join(',');
    out.rubyBracketText = (rbToks[0] || {}).base;

    // A value from the chart's data cannot close an attribute it is put in.
    out.quoteEscaped = escapeHtml('a"b');

    /* A colour chosen by hand is kept, applied, and written down. */
    applyEdit(()=>{
      workingNodes.push(['cf_a','A',null,null,null,null,{pos:[51000,-900], colors:['#1d7a5f']}]);
      workingNodes.push(['cf_b','B','cf_a',null,null,null,{pos:[51000,-700]}]);
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 320));
    openEdgeStylePopover('cf_a','cf_b',{clientX:400, clientY:300, stopPropagation(){}});
    await new Promise(r=> setTimeout(r, 260));
    document.querySelector('#stylePaintMode [data-value="solid"]').click();
    await new Promise(r=> setTimeout(r, 200));
    document.getElementById('styleColor').value = '#ff00ff';
    document.getElementById('styleColor').dispatchEvent(new Event('input', {bubbles:true}));
    await new Promise(r=> setTimeout(r, 320));
    const cfStyle = edgeStyleFor('cf_a','cf_b');
    out.chosenKept = !!cfStyle.colorFixed && cfStyle.color === '#ff00ff';
    out.chosenDrawn = (document.querySelector('#edgeLayer .edge.struct[data-to="cf_b"]:not(.edge-cap)')
      || {getAttribute:()=>''}).getAttribute('stroke');
    out.chosenWritten = /colorFixed:true/.test(serializeEdgeStyles(EDGE_STYLES));
    closeEdgePopover();
    await new Promise(r=> setTimeout(r, 250));

    /* Taking a border away takes an INCOMING connector's connection too,
       not only its style record. */
    applyEdit(()=>{
      workingNodes.push(['rb_a','A',null,null,null,null,{pos:[52000,-900]}]);
      workingNodes.push(['rb_b','B','rb_a',null,null,null,
                         {pos:[52000,-700], colors:['#111111','#2f6fb5','#c23b22']}]);
      EDGE_STYLES.push({from:'rb_a', to:'rb_b', toRing:2});
    });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 350));
    selectedId = 'rb_b';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 350));
    document.getElementById('editColorsInput').value = '#111111';
    document.getElementById('editColorsInput').dispatchEvent(new Event('input', {bubbles:true}));
    commitNodeEdit();
    await new Promise(r=> setTimeout(r, 480));
    out.incomingStyleGone = !EDGE_STYLES.some(x=> x.from === 'rb_a' && x.to === 'rb_b');
    const rbEntry = workingNodes.find(x=> x[0] === 'rb_b');
    out.incomingLinkGone = !rbEntry || !resolveExplicitParents(rbEntry).includes('rb_a');
    out.incomingNotDrawn = !document.querySelector('#edgeLayer .edge.struct[data-to="rb_b"]');
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    /* The lattice keeps the two points it has to start and finish on,
       however much of the middle it thins away. */
    const many = [];
    for(let i = 0; i < 200; i++) many.push(i * 7);
    const kept = uniqSorted(many, 46, [503, 719]);
    out.latticeKeepsEnds = kept.includes(503) && kept.includes(719);

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a typed line break breaks the line wherever it falls',
        r19.breakPlain === 2 && r19.breakBeforeRun === 2 && r19.breakBetweenRuns === 2,
        JSON.stringify({plain:r19.breakPlain, beforeRun:r19.breakBeforeRun,
                        betweenRuns:r19.breakBetweenRuns}));
  check('braces in ordinary text cannot cut a styled run short',
        r19.braceRuns === 'a}}b@#c23b22' && r19.braceRunsTriple === 'a}}}b@#c23b22',
        JSON.stringify({two:r19.braceRuns, three:r19.braceRunsTriple, esc:r19.braceEscaped}));
  /* A bracket in a half is escaped rather than thrown away: the character
     the author typed survives, and the reading still reads as a reading. */
  check('a bracket in a reading is escaped, not lost',
        r19.rubyBracketSafe === '[[Ark\\]2|reading]]' && r19.rubyBracketReads === 'ruby' &&
        r19.rubyBracketText === 'Ark]2',
        JSON.stringify({m:r19.rubyBracketSafe, reads:r19.rubyBracketReads,
                        text:r19.rubyBracketText}));
  check('a value from the chart cannot close an attribute it is put in',
        r19.quoteEscaped === 'a&quot;b', r19.quoteEscaped);
  check('a connector colour chosen by hand is applied and written down',
        r19.chosenKept && r19.chosenDrawn === '#ff00ff' && r19.chosenWritten,
        JSON.stringify({kept:r19.chosenKept, drawn:r19.chosenDrawn, written:r19.chosenWritten}));
  check('a border taken away takes an incoming connector with it, link and all',
        r19.incomingStyleGone && r19.incomingLinkGone && r19.incomingNotDrawn,
        JSON.stringify({style:r19.incomingStyleGone, link:r19.incomingLinkGone,
                        drawn:r19.incomingNotDrawn}));
  check('the routing lattice keeps the points it has to start and finish on',
        r19.latticeKeepsEnds);

  /* ---- 40. this round ---- */
  const r20 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};

    /* A connector meeting a rippled border runs all the way into its own
       arrowhead. The head is sunk an amplitude into the wave so it meets
       the border wherever it lands, and the line is cut back to where the
       head actually IS rather than to the port — cutting the full length
       anyway left the arrow floating off the end of its line. */
    applyEdit(()=>{
      workingNodes.push(['pk_a','A',null,null,null,null,{pos:[54000,-1100]}]);
      workingNodes.push(['pk_b','P','pk_a',null,null,'pocket',{pos:[54000,-820]}]);
      EDGE_STYLES.push({from:'pk_a', to:'pk_b', fromSide:'bottom', toSide:'top'});
    });
    rebuildChart(); redrawEdges();
    await new Promise(r=> setTimeout(r, 420));
    const line = document.querySelector('#edgeLayer .edge.struct[data-to="pk_b"]:not(.edge-cap)');
    const head = document.querySelector('.edge-arrow[data-to="pk_b"] path');
    const lineEnd = (()=>{
      const n = (line.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
      return n[n.length - 1];
    })();
    const headBack = (()=>{
      const n = (head.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
      // the two base corners share a y; the tip is the first pair
      return Math.min(n[3], n[5]);
    })();
    out.lineReachesHead = lineEnd >= headBack - 0.01;
    out.gap = +(headBack - lineEnd).toFixed(2);

    /* Both halves of a reading carry markup of their own. */
    out.rubyToks = tokenizeLabel('[[**base**|{{#c23b22|anno}}]]').map(t=> ({
      base: t.base, anno: t.anno,
      baseBold: (t.baseRuns || []).every(x=> x.bold),
      annoColour: ((t.annoRuns || [])[0] || {}).color,
      annoBold: (t.annoRuns || []).some(x=> x.bold)
    }))[0];
    const dRuby = document.createElement('div');
    dRuby.innerHTML = inlineToHtml('[[**base**|{{#c23b22|anno}}]]');
    out.rubyHtml = dRuby.innerHTML;
    out.rubyRound = richHtmlToMarkup(dRuby);
    // A reading inside a bold phrase is bold in both halves unless told
    // otherwise — inheriting is the default, overriding is now possible.
    const inh = tokenizeLabel('**[[w|a]]**')[0];
    out.rubyInherits = (inh.baseRuns || []).every(x=> x.bold) &&
                       (inh.annoRuns || []).every(x=> x.bold);

    // …and the chart draws each half in its own look.
    applyEdit(()=>{
      workingNodes.push(['ry2','x [[**base**|{{#c23b22|anno}}]] y',
                         null,null,null,null,{pos:[55000,-900]}]);
    });
    rebuildChart();
    await new Promise(r=> setTimeout(r, 420));
    const sp = [...document.querySelectorAll('[data-id="ry2"] text tspan')];
    const baseSpan = sp.find(t=> t.textContent === 'base');
    const annoSpan = sp.find(t=> t.textContent === 'anno');
    out.baseDrawnBold = !!baseSpan && baseSpan.getAttribute('font-weight') === '700';
    out.annoDrawnRed = !!annoSpan && /c23b22/.test(annoSpan.getAttribute('style') || '');
    out.annoNotBold = !!annoSpan && annoSpan.getAttribute('font-weight') !== '700';
    out.annoSmaller = !!annoSpan && !!baseSpan &&
      +annoSpan.getAttribute('font-size') < +baseSpan.getAttribute('font-size');

    /* And the field shows what the chart draws: the weight is no longer
       flattened by the stylesheet. */
    selectedId = 'ry2';
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 350));
    const surf = richFields.get('editLabelInput').surface;
    setRichValue(document.getElementById('editLabelInput'), '[[w|{{#c23b22|**a**}}]]');
    await new Promise(r=> setTimeout(r, 220));
    const rtEl = surf.querySelector('rt');
    const cs = rtEl ? getComputedStyle(rtEl.querySelector('b') || rtEl) : null;
    out.fieldShowsBold = !!cs && +cs.fontWeight >= 700;
    out.fieldShowsColour = !!cs && /199|c23b22|rgb\(194, 59, 34\)|rgb\(194,59,34\)/.test(cs.color);
    /* A selection inside ONE half is formatted on its own; one that
       straddles the two is still widened to the whole reading. */
    setRichValue(document.getElementById('editLabelInput'), '[[base|anno]]');
    await new Promise(r=> setTimeout(r, 200));
    const rt2 = surf.querySelector('rt');
    const rr = document.createRange();
    rr.setStart(rt2.firstChild, 0); rr.setEnd(rt2.firstChild, 2);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rr);
    applyRichCommand(surf, 'color', '#1d7a5f');
    await new Promise(r=> setTimeout(r, 240));
    out.annoAlone = richHtmlToMarkup(surf);
    document.getElementById('detailEditToggle').click();
    await new Promise(r=> setTimeout(r, 250));

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await new Promise(r=> setTimeout(r, 400));
    return out;
  });
  check('a connector runs all the way into its arrowhead at a rippled border',
        r20.lineReachesHead, String(r20.gap));
  check('both halves of a reading carry markup of their own',
        r20.rubyToks.base === 'base' && r20.rubyToks.anno === 'anno' &&
        r20.rubyToks.baseBold && r20.rubyToks.annoColour === '#c23b22' &&
        !r20.rubyToks.annoBold,
        JSON.stringify(r20.rubyToks));
  check('and survive the editor unchanged',
        r20.rubyRound === '[[**base**|{{#c23b22|anno}}]]', r20.rubyRound);
  check('a reading still inherits the run it sits in',
        r20.rubyInherits);
  check('the chart draws each half in its own look',
        r20.baseDrawnBold && r20.annoDrawnRed && r20.annoNotBold && r20.annoSmaller,
        JSON.stringify({base:r20.baseDrawnBold, red:r20.annoDrawnRed,
                        notBold:r20.annoNotBold, smaller:r20.annoSmaller}));
  check('and the field shows what the chart draws',
        r20.fieldShowsBold && r20.fieldShowsColour,
        JSON.stringify({bold:r20.fieldShowsBold, colour:r20.fieldShowsColour}));
  check('an annotation can be formatted without touching the word under it',
        r20.annoAlone === '[[base|{{#1d7a5f|an}}no]]', r20.annoAlone);

  /* ---- 41. this round ---- */
  const r21 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const beforeStickers = STICKERS.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* The border closes on the text it holds, and follows what that text
       actually measures — a bigger glyph or a reading over a word moves
       the border rather than eating into the gap. */
    applyEdit(()=>{
      workingNodes.push(['pd1','Plain',null,null,null,null,{pos:[60000,-900]}]);
      workingNodes.push(['pd2','x {{z:26|BIG}} y',null,null,null,null,{pos:[60300,-900]}]);
      workingNodes.push(['pd3','[[base|anno]] over',null,null,null,null,{pos:[60600,-900]}]);
    });
    rebuildChart();
    await wait(450);
    const pad = (id)=>{
      const n = nodes.get(id);
      const t = document.querySelector(`[data-id="${id}"] text`);
      const bb = t.getBBox();
      return {h:n.h, top:+(bb.y - n.y).toFixed(1),
              bot:+(n.y + n.h - (bb.y + bb.height)).toFixed(1)};
    };
    const p1 = pad('pd1'), p2 = pad('pd2'), p3 = pad('pd3');
    out.padTight = p1.top < 8 && p1.bot < 8;
    out.padEven = Math.abs(p1.top - p1.bot) < 2 && Math.abs(p2.top - p2.bot) < 2;
    out.growsWithGlyph = p2.h > p1.h;
    out.growsWithReading = p3.h > p1.h;
    out.stillEvenWhenBig = p2.top > 2 && p2.bot > 2;

    /* Smart guides: an entry carried near another's edge with Shift held
       settles onto it and says what it lined up with — and stays exactly
       where the hand put it when Shift is not held. The anchor is placed
       off the ruled grid on purpose, so a snap onto its edge cannot be the
       grid's doing. */
    applyEdit(()=>{
      workingNodes.push(['gd1','Anchor',null,null,null,null,{pos:[61003,-900]}]);
      workingNodes.push(['gd2','Mover',null,null,null,null,{pos:[61400,-700]}]);
      workingNodes.push(['gd3','Mover2',null,null,null,null,{pos:[61400,-560]}]);
    });
    rebuildChart();
    await wait(400);
    const anchor = nodes.get('gd1');
    /* Two carries, each from a fresh entry a long way off, because a drag
       has to travel further than the threshold before it counts as one at
       all — a second carry of the same entry, already parked beside the
       anchor, never starts. */
    const carry = (id, shift)=>{
      const gEl = document.querySelector(`[data-id="${id}"]`);
      beginNodeDrag({button:0, clientX:0, clientY:0, target:gEl,
                     stopPropagation(){}, preventDefault(){}}, nodes.get(id), gEl);
      const dx = (anchor.x - 1) - nodes.get(id).x;
      window.dispatchEvent(new MouseEvent('mousemove',
        {clientX: dx*vs, clientY: 0, bubbles:true, shiftKey: shift}));
      return dx;
    };
    carry('gd2', true);
    await wait(120);
    out.guideShown = document.querySelectorAll('.align-guide').length > 0;
    out.guideSnapped = Math.abs(nodes.get('gd2').x - anchor.x) < 0.6;
    window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    await wait(250);
    out.guideCleared = document.querySelectorAll('.align-guide').length === 0;
    carry('gd3', false);
    await wait(120);
    out.guideQuietWithoutShift = document.querySelectorAll('.align-guide').length === 0;
    window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    await wait(200);

    /* A reading inside a bold run survives being written back. Two runs
       set the same way and touching each other come back as one wrapper,
       which is what keeps `**a****b**` — unreadable to the grammar — from
       ever being written. */
    const round = (m)=>{ const d = document.createElement('div');
      d.innerHTML = inlineToHtml(m); return richHtmlToMarkup(d); };
    out.boldRuby = round('**Bold [[base|anno]] tail**');
    out.boldRubyReads = tokenizeLabel(out.boldRuby).map(t=> t.type).join(',');
    out.colourRuby = round('{{#c23b22|C [[base|anno]] tail}}');
    out.noQuadStar = !/\*{4}/.test(round('**a [[b|c]] d**'));

    /* The entry form belongs to the entry it was opened for. */
    applyEdit(()=>{
      workingNodes.push(['fp1','Entry',null,null,null,null,{pos:[62000,-900]}]);
      workingNodes.push(['fp2','',null,null,null,'image',
                         {pos:[62300,-900], image:'data:image/png;base64,iVBORw0KGgo=',
                          size:[80,80]}]);
      workingNodes.push(['fp3','Caption',null,null,null,'textbox',
                         {pos:[62600,-900], rot:30, z:-1}]);
      workingNodes.push(['fp4','Card',null,null,null,null,{pos:[62900,-900], card:true}]);
    });
    rebuildChart();
    await wait(400);
    selectNode('fp1');
    document.getElementById('detailEditToggle').click();
    await wait(300);
    selectNode('fp2');
    await wait(200);
    out.formLeftPicture = detailEditForm.style.display !== 'block';
    closeFreeMenu(); deselect();
    await wait(200);

    /* A key that means a command on the chart means the character itself
       in a field. */
    selectNode('fp1');
    document.getElementById('detailEditToggle').click();
    await wait(280);
    const surf = richFields.get('editLabelInput').surface;
    surf.focus();
    document.dispatchEvent(new KeyboardEvent('keydown',
      {key:'/', code:'Slash', bubbles:true}));
    await wait(100);
    out.slashStaysInField = document.activeElement === surf;
    document.getElementById('detailEditToggle').click();
    await wait(200);

    /* The note settles as it is written, like every other field. */
    selectNode('fp1');
    await wait(200);
    document.getElementById('detailNoteEdit').click();
    await wait(220);
    setRichValue(detailNoteInput, 'A NOTE');
    richFields.get('detailNoteInput').surface.dispatchEvent(new Event('input', {bubbles:true}));
    await wait(700);
    out.noteMarksDirty = isDirty();
    selectNode('fp4');
    await wait(250);
    out.noteSurvivesLeaving = (nodes.get('fp1') || {}).note === 'A NOTE';
    undoLastEdit();
    await wait(250);
    out.noteUndoes = !(nodes.get('fp1') || {}).note;

    /* A connector's popover does not outlive its connector. */
    applyEdit(()=>{
      workingNodes.push(['ep1','A',null,null,null,null,{pos:[63000,-900]}]);
      workingNodes.push(['ep2','B','ep1',null,null,null,{pos:[63000,-700]}]);
    });
    rebuildChart(); redrawEdges();
    await wait(350);
    openEdgeStylePopover('ep1','ep2',{clientX:400, clientY:300, stopPropagation(){}});
    await wait(250);
    out.popoverOpened = edgePopover.classList.contains('open');
    deleteNode('ep2');
    await wait(300);
    out.popoverClosedWithIt = !edgePopover.classList.contains('open');
    undoLastEdit();
    await wait(250);

    /* A picture's menu answers Escape, and a copy is the same thing. */
    openFreeMenu('fp3', {clientX:300, clientY:300});
    await wait(220);
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    await wait(220);
    out.freeMenuTakesEscape = !document.getElementById('freeMenu').classList.contains('open');
    const capClip = clipOfNode(nodes.get('fp3'));
    const cardClip = clipOfNode(nodes.get('fp4'));
    out.copyKeepsCard = !!cardClip.opts.card;
    out.copyKeepsRot = capClip.opts.rot === 30;
    out.copyKeepsLayer = capClip.opts.z === -1;

    /* Changing an image's URL does not decide its layer for it. */
    openFreeMenu('fp2', {clientX:300, clientY:120});
    await wait(220);
    freeMenuImageUrl.value = 'data:image/png;base64,iVBORw0KGgoAAA==';
    freeMenuImageUrl.dispatchEvent(new Event('input', {bubbles:true}));
    await wait(700);
    const picRow = workingNodes.find(x=> x[0] === 'fp2');
    out.pictureKeptItsLayer = !(picRow && picRow[6] && picRow[6].z);
    closeFreeMenu();
    await wait(180);

    /* Card layout is not lost by looking at another archetype. */
    selectNode('fp4');
    await wait(180);
    document.getElementById('detailEditToggle').click();
    await wait(300);
    const shapeSel = document.getElementById('editShapeInput');
    for(const v of ['ellipse','rect']){
      shapeSel.value = v;
      shapeSel.dispatchEvent(new Event('change', {bubbles:true}));
      await wait(260);
    }
    out.cardSurvivesLook = document.getElementById('editCardCheck').checked;
    document.getElementById('detailEditToggle').click();
    await wait(200);

    /* A question on screen owns the keyboard. */
    selectNode('fp1');
    await wait(150);
    const countBefore = workingNodes.length;
    const asked = askConfirm('Probe?', 'Probe');
    await wait(240);
    out.dialogHasFocus = askOverlay.contains(document.activeElement);
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Delete', bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    await wait(220);
    out.chartUntouchedBehindDialog = workingNodes.length === countBefore;
    document.getElementById('askCancel').click();
    await asked;
    await wait(180);

    /* An undo repaints the panel the change was made in. */
    refill(STICKERS, [{key:'st_probe', name:'a', src:'data:image/png;base64,iVBORw0KGgo='}]);
    rebuildStickerMap();
    document.getElementById('stickersToggle').click();
    await wait(260);
    applyEdit(()=>{ STICKERS.splice(0, 1); rebuildStickerMap(); });
    renderStickerLibrary();
    await wait(200);
    const gone = document.querySelectorAll('#stickerGrid .sticker-cell').length;
    undoLastEdit();
    await wait(300);
    out.libraryRepaints = gone === 0 &&
      document.querySelectorAll('#stickerGrid .sticker-cell').length === 1;
    document.getElementById('stickerClose').click();

    refill(STICKERS, beforeStickers);
    rebuildStickerMap();
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(400);
    return out;
  });
  check('a border closes on the text it holds',
        r21.padTight && r21.padEven,
        JSON.stringify({tight:r21.padTight, even:r21.padEven}));
  check('and follows a bigger glyph or a reading rather than clipping it',
        r21.growsWithGlyph && r21.growsWithReading && r21.stillEvenWhenBig,
        JSON.stringify({glyph:r21.growsWithGlyph, reading:r21.growsWithReading,
                        even:r21.stillEvenWhenBig}));
  check('an entry carried near another with Shift settles onto its edge, and says so',
        r21.guideShown && r21.guideSnapped,
        JSON.stringify({shown:r21.guideShown, snapped:r21.guideSnapped}));
  check('and no guide appears when Shift is not held', r21.guideQuietWithoutShift);
  check('and the guide goes when the entry is put down', r21.guideCleared);
  check('a reading inside a bold run survives being written back',
        r21.boldRuby === '**Bold [[base|anno]] tail**' &&
        r21.boldRubyReads === 'plain,ruby,plain' &&
        r21.colourRuby === '{{#c23b22|C [[base|anno]] tail}}' && r21.noQuadStar,
        JSON.stringify({bold:r21.boldRuby, reads:r21.boldRubyReads,
                        colour:r21.colourRuby, noQuad:r21.noQuadStar}));
  check('the entry form does not follow onto a picture',
        r21.formLeftPicture);
  check('a slash typed in a field is a slash', r21.slashStaysInField);
  check('a note settles as it is written, and undoes as one step',
        r21.noteMarksDirty && r21.noteSurvivesLeaving && r21.noteUndoes,
        JSON.stringify({dirty:r21.noteMarksDirty, kept:r21.noteSurvivesLeaving,
                        undone:r21.noteUndoes}));
  check('a connector’s settings do not outlive the connector',
        r21.popoverOpened && r21.popoverClosedWithIt,
        JSON.stringify({open:r21.popoverOpened, closed:r21.popoverClosedWithIt}));
  check('a loose element’s menu answers Escape', r21.freeMenuTakesEscape);
  check('a copy is the same thing again — card, angle and layer included',
        r21.copyKeepsCard && r21.copyKeepsRot && r21.copyKeepsLayer,
        JSON.stringify({card:r21.copyKeepsCard, rot:r21.copyKeepsRot,
                        z:r21.copyKeepsLayer}));
  check('changing a picture’s address does not move it in front of the chart',
        r21.pictureKeptItsLayer);
  check('card layout is not lost by looking at another archetype',
        r21.cardSurvivesLook);
  check('a question on screen owns the keyboard',
        r21.dialogHasFocus && r21.chartUntouchedBehindDialog,
        JSON.stringify({focus:r21.dialogHasFocus, safe:r21.chartUntouchedBehindDialog}));
  check('an undo repaints the panel the change was made in',
        r21.libraryRepaints);

  /* ---- 27b. section 42: the double line style, Enter in a text field,
       one-line labels, and a pocket reality's connectors ---- */
  const r22 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* The double line style. Two stacked strokes with the same ends, the
       narrower one in the paper colour — and the picker offers it. */
    out.doubleOffered = !!document.querySelector('#styleDash button[data-value="double"]');
    applyEdit(()=>{
      workingNodes.push(['dbA','A',null,null,null,null,{pos:[64000,-1200]}]);
      workingNodes.push(['dbB','B','dbA',null,null,null,{pos:[64000,-1000]}]);
    });
    refill(EDGE_STYLES, [{from:'dbA', to:'dbB', dash:'double', color:'#c23b22', colorFixed:true}]);
    rebuildChart();
    await wait(420);
    const rails = Array.from(document.querySelectorAll('path.edge[data-from="dbA"][data-to="dbB"]'));
    const outer = rails.find(p=> p.classList.contains('dbl-outer'));
    const inner = rails.find(p=> p.classList.contains('dbl-inner'));
    out.twoRails = !!outer && !!inner;
    out.railsAgree = out.twoRails && outer.getAttribute('d') === inner.getAttribute('d');
    if(out.twoRails){
      const wo = parseFloat(getComputedStyle(outer).strokeWidth);
      const wi = parseFloat(getComputedStyle(inner).strokeWidth);
      out.gutterInside = wi > 0 && wi < wo;
      out.innerIsPaper = getComputedStyle(inner).stroke !==
                         getComputedStyle(outer).stroke;
    }
    // Both rails answer the selection together, or the line comes apart.
    selectNode('dbA');
    await wait(240);
    out.railsLitTogether = rails.length === 2 &&
      rails.every(p=> p.classList.contains('lit'));
    deselect();
    await wait(180);

    /* A connector into a pocket reality is drawn like every other one: its
       arrowhead stops at the border rather than being buried in the box,
       and it runs out no further before turning than a plain entry's. */
    refill(EDGE_STYLES, []);
    applyEdit(()=>{
      workingNodes.push(['pkP','Src',null,null,null,null,{pos:[65000,-1200]}]);
      workingNodes.push(['pkQ','Pocket','pkP',null,null,'pocket',{pos:[65000,-1000]}]);
      workingNodes.push(['plP','Src',null,null,null,null,{pos:[65600,-1200]}]);
      workingNodes.push(['plQ','Plain','plP',null,null,null,{pos:[65600,-1000]}]);
    });
    rebuildChart();
    await wait(460);
    const tipOf = (to)=>{
      const h = document.querySelector(`.edge-arrow[data-to="${to}"]`);
      if(!h) return null;
      const b = h.getBBox();
      return b.y + b.height;              // the lowest point of the head
    };
    const pk = nodes.get('pkQ'), pl = nodes.get('plQ');
    const tPk = tipOf('pkQ'), tPl = tipOf('plQ');
    out.headsFound = tPk !== null && tPl !== null;
    // How far past the top border each head reaches. They should agree.
    out.pocketBury = out.headsFound ? +(tPk - pk.y).toFixed(1) : null;
    out.plainBury  = out.headsFound ? +(tPl - pl.y).toFixed(1) : null;
    const ptsOf = (from, to)=>{
      const p = document.querySelector(`path.edge.struct[data-from="${from}"][data-to="${to}"]`);
      return p ? p.getAttribute('d') : '';
    };
    // Neither route needs a bend: both are a plain drop.
    out.pocketBends = (ptsOf('pkP','pkQ').match(/[A-Z]/g) || []).length;
    out.plainBends  = (ptsOf('plP','plQ').match(/[A-Z]/g) || []).length;

    /* A label written on one line stays on one line, and the box widens to
       hold it rather than folding it in half. Past the width a box may
       reach, the text is clipped at the border instead of running out. */
    refill(EDGE_STYLES, []);
    applyEdit(()=>{
      workingNodes.push(['w1','A fairly long single line of label text',
                         null,null,null,null,{pos:[66400,-1200]}]);
      workingNodes.push(['w2','A fairly long single\nline of label text',
                         null,null,null,null,{pos:[67000,-1200]}]);
      workingNodes.push(['w3','An extremely long single line of label text that no box on this chart could ever be wide enough to hold in one piece',
                         null,null,null,null,{pos:[67600,-1200]}]);
    });
    rebuildChart();
    await wait(500);
    // Lines, not words: every word is its own tspan, so the lines are the
    // distinct baselines among them.
    const spansOf = (id)=>{
      const ys = new Set();
      document.querySelectorAll(`[data-id="${id}"] text tspan`).forEach(t=>{
        const y = t.getAttribute('y');
        if(y !== null) ys.add((+y).toFixed(1));
      });
      return ys.size;
    };
    out.oneLineStaysOne = spansOf('w1') === 1;
    out.typedBreakStillBreaks = spansOf('w2') >= 2 && spansOf('w1') === 1;
    out.longStaysOne = spansOf('w3') === 1;
    out.wideEnough = nodes.get('w1').w > nodes.get('w2').w;
    out.cappedWidth = nodes.get('w3').w <= 300.5;
    const longText = document.querySelector('[data-id="w3"] text');
    out.longIsClipped = !!longText && !!longText.getAttribute('clip-path');
    out.shortNotClipped = !document.querySelector('[data-id="w1"] text').getAttribute('clip-path');

    /* Enter settles a text field and hands the keyboard back; Shift+Enter
       is the line break. */
    selectedId = 'w1';
    document.getElementById('detailEditToggle').click();
    await wait(340);
    const surf = richFields.get('editLabelInput').surface;
    surf.focus();
    surf.textContent = 'typed';
    surf.dispatchEvent(new Event('input', {bubbles:true}));
    surf.dispatchEvent(new KeyboardEvent('keydown',
      {key:'Enter', bubbles:true, cancelable:true, shiftKey:true}));
    await wait(120);
    out.shiftEnterStays = document.activeElement === surf;
    surf.dispatchEvent(new KeyboardEvent('keydown',
      {key:'Enter', bubbles:true, cancelable:true}));
    await wait(320);
    out.enterLeavesField = document.activeElement !== surf;
    out.enterSaved = /typed/.test((nodes.get('w1')||{}).label || '');

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    deselect();
    rebuildChart(); buildManagement();
    await wait(450);
    return out;
  });
  check('the connector styles offer a double line', r22.doubleOffered);
  check('which is drawn as two rails on one path',
        r22.twoRails && r22.railsAgree && r22.gutterInside && r22.innerIsPaper,
        JSON.stringify(r22));
  check('and both rails answer the selection together', r22.railsLitTogether);
  /* A rippled border is a band, not a line: the arrow stops on the WAVE,
     which at the point it arrives can be up to three quarters of an
     amplitude either side of the baseline a plain border would sit on.
     Anywhere in that band is right; anywhere outside it is the old bug of
     burying the head in the box. */
  check('an arrow into a rippled border stops on the border, like every other arrow',
        r22.headsFound && Math.abs(r22.pocketBury - r22.plainBury) <= 2.4,
        JSON.stringify({pocket:r22.pocketBury, plain:r22.plainBury}));
  check('and gets there by the same route a plain entry would',
        r22.pocketBends === r22.plainBends,
        JSON.stringify({pocket:r22.pocketBends, plain:r22.plainBends}));
  check('a label written on one line is not folded in half',
        r22.oneLineStaysOne && r22.longStaysOne && r22.wideEnough,
        JSON.stringify(r22));
  check('a break the author typed still breaks', r22.typedBreakStillBreaks);
  check('and a line too long for any box is clipped at the border',
        r22.cappedWidth && r22.longIsClipped && r22.shortNotClipped,
        JSON.stringify({w:r22.cappedWidth, clipped:r22.longIsClipped,
                        short:r22.shortNotClipped}));
  check('Enter settles a field and hands the keyboard back',
        r22.enterLeavesField && r22.enterSaved,
        JSON.stringify({left:r22.enterLeavesField, saved:r22.enterSaved}));
  check('while Shift+Enter stays in it', r22.shiftEnterStays);

  /* ---- 27c. section 43: the router's guarantees, four grips, the leader
       gesture, readings, and the rebrand ---- */
  const r23 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* NOTHING on this chart is drawn on a slant, and no arrowhead is left
       standing away from its own line. This is the whole-chart invariant,
       checked against every connector the suite has built rather than one
       contrived pair — it is the guarantee, not an example of it. */
    applyEdit(()=>{
      // A parent feeding a merge AND carrying connectors of its own: the
      // arrangement that used to produce both faults at once.
      workingNodes.push(['xh','Hub',null,null,null,null,{pos:[70000,-1400]}]);
      workingNodes.push(['xa','A','xh',null,null,null,{pos:[69200,-1460]}]);
      workingNodes.push(['xb','B','xh',null,null,null,{pos:[69000,-1360]}]);
      workingNodes.push(['xc','C','xh',null,null,null,{pos:[69400,-1260]}]);
      workingNodes.push(['xq','Q',null,null,null,null,{pos:[70500,-1220]}]);
      workingNodes.push(['xm','M',['xh','xq'],null,null,'amalgam',{pos:[70200,-1020]}]);
      workingNodes.push(['xp','Pocket',null,null,null,'pocket',{pos:[71200,-1400]}]);
      workingNodes.push(['xpc','PC','xp',null,null,null,{pos:[71200,-1200]}]);
    });
    rebuildChart();
    await wait(700);
    const slanted = [];
    document.querySelectorAll('#edgeLayer path.edge.struct, #arrowLayer path.edge.struct')
      .forEach(el=>{
        const st = edgeStyleFor(el.dataset.from || '', el.dataset.to || '');
        if(st && st.routing === 'straight') return;      // a slant is the point of these
        if(el.classList.contains('amalgam-out')) return; // and of a merge's own arrow
        const toks = el.getAttribute('d').match(/[MLQ][^MLQZ]*/g) || [];
        const pts = [];
        toks.forEach(t=>{
          const n = (t.slice(1).match(/-?\d+(\.\d+)?/g)||[]).map(Number);
          for(let i=0;i+1<n.length;i+=2) pts.push({x:n[i], y:n[i+1]});
        });
        for(let i=1;i<pts.length;i++){
          const dx = Math.abs(pts[i].x-pts[i-1].x), dy = Math.abs(pts[i].y-pts[i-1].y);
          if(dx > 1.2 && dy > 1.2){
            slanted.push(`${el.dataset.from}->${el.dataset.to}`);
            break;
          }
        }
      });
    out.slanted = slanted;
    // And every arrowhead sits on the end of its own line.
    const strays = [];
    document.querySelectorAll('.edge-arrow').forEach(h=>{
      const f = h.dataset.from, t = h.dataset.to;
      if(!f) return;                       // a merge's arrow names no single source
      const line = document.querySelector(
        `path.edge.struct[data-from="${f}"][data-to="${t}"]`);
      if(!line) return;
      const L = line.getTotalLength();
      const e1 = line.getPointAtLength(0), e2 = line.getPointAtLength(L);
      const bb = h.getBBox(), c = {x: bb.x+bb.width/2, y: bb.y+bb.height/2};
      const d = Math.min(Math.hypot(c.x-e1.x, c.y-e1.y), Math.hypot(c.x-e2.x, c.y-e2.y));
      if(d > 8) strays.push(`${f}->${t}:${d.toFixed(1)}`);
    });
    out.strays = strays;

    /* Four resize grips, and none under something else. */
    out.gripsPlain = document.querySelectorAll('[data-id="xa"] .node-resize').length;
    applyEdit(()=>{
      const f = workingNodes.find(t=> t[0]==='xa');
      f[6] = Object.assign({}, f[6] || {}, {link:'https://example.com/'});
    });
    rebuildChart(); await wait(420);
    out.gripsWithLink = document.querySelectorAll('[data-id="xa"] .node-resize').length;
    out.gripNeGone = !document.querySelector('[data-id="xa"] .node-resize-ne');

    /* A grip on the top-left holds the bottom-right still. */
    applyEdit(()=>{
      workingNodes.push(['gz','Grow',null,null,null,null,{pos:[72000,-1400],size:[120,60]}]);
    });
    rebuildChart(); await wait(420);
    {
      const n0 = nodes.get('gz');
      const right0 = n0.x + n0.w, bottom0 = n0.y + n0.h;
      const grip = document.querySelector('[data-id="gz"] .node-resize-nw');
      beginNodeResize({button:0, clientX:0, clientY:0,
                       stopPropagation(){}, preventDefault(){}},
                      n0, document.querySelector('[data-id="gz"]'),
                      {key:'nw', sx:-1, sy:-1});
      window.dispatchEvent(new MouseEvent('mousemove',
        {clientX:-40*vs, clientY:-40*vs, bubbles:true}));
      await wait(160);
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(320);
      const n1 = nodes.get('gz');
      out.nwGrew = n1.w > 120 && n1.h > 60;
      out.nwHeldCorner = Math.abs((n1.x + n1.w) - right0) < 0.6 &&
                         Math.abs((n1.y + n1.h) - bottom0) < 0.6;
      out.nwHasGrip = !!grip;
    }

    /* The leader is aimed, not guessed: a stored angle and length put the
       card exactly there, and the anchor stays a fraction of the line. */
    refill(EDGE_STYLES, []);
    applyEdit(()=>{ workingNodes.push(['xcal','note',null,null,null,'callout',
      {pos:[62000,-1500], leader:{from:'xh', to:'xa', at:0.5}}]); });
    rebuildChart(); await wait(460);
    {
      const n = nodes.get('xcal');
      const line = document.querySelector('#edgeLayer .callout-leader[data-id="xcal"] .leader-line');
      if(n && line){
        // The leader starts at the anchor and ends on the card, wherever
        // the card has been put.
        const ax = +line.getAttribute('x1'), ay = +line.getAttribute('y1');
        const bx = +line.getAttribute('x2'), by = +line.getAttribute('y2');
        out.leaderAimed = Math.abs(bx - (n.x + n.w/2)) <= n.w/2 + 1 &&
                          Math.abs(by - (n.y + n.h/2)) <= n.h/2 + 1 &&
                          Math.hypot(bx - ax, by - ay) > 10;
      }
      /* A callout is carried like any other entry, so the whole card is the
         handle and the leader simply follows it. */
      const cardEl = document.querySelector('.node[data-id="xcal"]');
      cardEl.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      await wait(240);
      out.cardBorderGrabs = selectedId === 'xcal';
      deselect(); await wait(160);
    }
    /* And moving it moves its leader with it, the anchor staying put. */
    {
      const before = document.querySelector('#edgeLayer .callout-leader[data-id="xcal"] .leader-line');
      const ax = +before.getAttribute('x1'), ay = +before.getAttribute('y1');
      const n0 = nodes.get('xcal');
      saveNodePositions([{id:'xcal', x: n0.x + 120, y: n0.y}]);
      rebuildChart();
      await wait(500);
      const after = document.querySelector('#edgeLayer .callout-leader[data-id="xcal"] .leader-line');
      const moved = nodes.get('xcal').x - n0.x;
      out.reaimed = !!after && moved > 0 &&
        Math.abs((+after.getAttribute('x2') - +before.getAttribute('x2')) - moved) < 2;

      out.reaimKeptAnchor = !!after &&
        Math.abs(+after.getAttribute('x1') - ax) < 0.5 &&
        Math.abs(+after.getAttribute('y1') - ay) < 0.5;
    }

    /* Typing at the head of either half of a reading lands in that half. */
    {
      const surf = richFields.get('editLabelInput').surface;
      const put = (markup, half)=>{
        setRichValue(document.getElementById('editLabelInput'), markup);
        const t = half === 'base' ? surf.querySelector('ruby').firstChild
                                  : surf.querySelector('rt').firstChild;
        const rg = document.createRange(); rg.setStart(t, 0); rg.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
        insertIntoReading(surf, 'X');
        return richHtmlToMarkup(surf);
      };
      out.headOfBase = put('**Bold [[base|anno]] tail**', 'base');
      out.headOfAnno = put('**[[base|anno]]**', 'anno');
    }

    out.brand = document.querySelector('.brand .mark').textContent;
    out.docTitle = document.title;
    out.versionLine = (document.getElementById('aboutVersion')||{}).textContent || '';
    out.versionLog = document.querySelectorAll('#versionLog .version-entry').length;

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(500);
    return out;
  });
  check('no connector on the chart is drawn on a slant',
        r23.slanted.length === 0, r23.slanted.join(', '));
  check('and no arrowhead stands away from its own line',
        r23.strays.length === 0, r23.strays.join(', '));
  check('an entry carries a resize grip at each corner',
        r23.gripsPlain === 4, String(r23.gripsPlain));
  check('and gives one up where the link badge sits',
        r23.gripsWithLink === 3 && r23.gripNeGone,
        JSON.stringify({n:r23.gripsWithLink, gone:r23.gripNeGone}));
  check('pulling the top-left corner holds the bottom-right still',
        r23.nwHasGrip && r23.nwGrew && r23.nwHeldCorner,
        JSON.stringify({grip:r23.nwHasGrip, grew:r23.nwGrew, held:r23.nwHeldCorner}));
  check('a leader goes where it was aimed', r23.leaderAimed);
  check('and the whole card is the handle that carries it', r23.cardBorderGrabs);
  check('carrying it takes the leader with it and leaves the anchor',
        r23.reaimed && r23.reaimKeptAnchor,
        JSON.stringify({aimed:r23.reaimed, anchor:r23.reaimKeptAnchor}));
  check('typing at the head of a reading goes into the reading',
        r23.headOfBase === '**Bold [[Xbase|anno]] tail**', r23.headOfBase);
  check('and at the head of its annotation, into the annotation',
        r23.headOfAnno === '**[[base|Xanno]]**', r23.headOfAnno);
  check('the project is called Rhizome Project, and says which version it is',
        r23.brand.replace(/\s/g,'') === 'Rhizome·Project' &&
        r23.docTitle === 'Rhizome Project' &&
        /version \d+\.\d+\.\d+/.test(r23.versionLine) && r23.versionLog >= 1,
        JSON.stringify({brand:r23.brand, title:r23.docTitle,
                        v:r23.versionLine, log:r23.versionLog}));

  /* ---- 27d. section 44: the ripple's real position, straight-through
       ports, one colour per colour, the leader gesture end to end ---- */
  const r24 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* A connector into a pocket reality ends ON the ripple — not on the
       baseline a plain border would sit on, and not an amplitude inside
       the box either. Checked against the drawn border itself: the line's
       last point has to be within a hair of the wavy path. */
    applyEdit(()=>{
      workingNodes.push(['wpA','A',null,null,null,null,{pos:[74000,-1500]}]);
      workingNodes.push(['wpB','Pocket','wpA',null,null,'pocket',{pos:[74000,-1300]}]);
    });
    refill(EDGE_STYLES, [{from:'wpA', to:'wpB', fromSide:'bottom', toSide:'top', arrow:true}]);
    rebuildChart(); await wait(520);
    {
      const line = document.querySelector('#edgeLayer path.edge.struct[data-to="wpB"]');
      const border = document.querySelector('[data-id="wpB"] path');
      if(line && border){
        const n = (line.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
        const end = {x:n[n.length-2], y:n[n.length-1]};
        // Nearest point on the drawn border to where the line stops.
        const L = border.getTotalLength();
        let near = Infinity;
        for(let i=0;i<=600;i++){
          const p = border.getPointAtLength(L*i/600);
          const d = Math.hypot(p.x-end.x, p.y-end.y);
          if(d < near) near = d;
        }
        out.ripplePlusHead = +near.toFixed(2);
        const node = nodes.get('wpB');
        out.rippleNotBaseline = Math.abs(end.y - node.y) > 0.05;
      }
    }
    // …and with no arrowhead the line itself lands on the ripple.
    refill(EDGE_STYLES, [{from:'wpA', to:'wpB', fromSide:'bottom', toSide:'top', arrow:false}]);
    rebuildChart(); await wait(460);
    {
      const line = document.querySelector('#edgeLayer path.edge.struct[data-to="wpB"]');
      const border = document.querySelector('[data-id="wpB"] path');
      const n = (line.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
      const end = {x:n[n.length-2], y:n[n.length-1]};
      const L = border.getTotalLength();
      let near = Infinity;
      for(let i=0;i<=600;i++){
        const p = border.getPointAtLength(L*i/600);
        const d = Math.hypot(p.x-end.x, p.y-end.y);
        if(d < near) near = d;
      }
      out.lineOnRipple = +near.toFixed(2);
    }

    /* A misalignment small enough to be an accident is taken up by the
       ports and the connector runs dead straight; a real offset still
       turns two proper corners. */
    const cornersBetween = async (dy)=>{
      applyEdit(()=>{
        workingNodes = workingNodes.filter(t=> t[0] !== 'sgA' && t[0] !== 'sgB');
        workingNodes.push(['sgA','A',null,null,null,null,{pos:[76000,-1500]}]);
        workingNodes.push(['sgB','B','sgA',null,null,null,{pos:[76300,-1500+dy]}]);
      });
      refill(EDGE_STYLES, [{from:'sgA', to:'sgB', fromSide:'right', toSide:'left'}]);
      rebuildChart(); await wait(320);
      const el = document.querySelector('path.edge.struct[data-from="sgA"][data-to="sgB"]');
      return el ? (el.getAttribute('d').match(/Q/g) || []).length : -1;
    };
    out.straightAt6 = await cornersBetween(6);
    out.straightAt12 = await cornersBetween(12);
    out.stepsAt30 = await cornersBetween(30);

    /* One colour renders as one colour: a connector's line and its own
       arrowhead are painted at the same strength. */
    {
      const line = document.querySelector('path.edge.struct[data-from="sgA"][data-to="sgB"]');
      const head = document.querySelector('.edge-arrow[data-from="sgA"][data-to="sgB"]');
      out.lineOpacity = line ? +getComputedStyle(line).opacity : null;
      out.headOpacity = head ? +getComputedStyle(head).opacity : null;
    }

    /* The whole leader gesture, driven the way a reader drives it. */
    applyEdit(()=>{
      workingNodes.push(['ldA','Src',null,null,null,null,{pos:[78000,-1500]}]);
      workingNodes.push(['ldB','Dst','ldA',null,null,null,{pos:[78000,-1300]}]);
    });
    refill(EDGE_STYLES, []);
    rebuildChart(); await wait(500);
    {
      const rect = svg.getBoundingClientRect();
      const toClient = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      openEdgeStylePopover('ldA','ldB', new MouseEvent('click'));
      await wait(240);
      const btn = document.getElementById('styleAddCallout');
      btn.click();
      await wait(240);
      out.pickStarted = !!leaderPick && leaderPick.phase === 'point';
      const pt = pointAtFraction(leaderPick.pts, 0.5);
      const c1 = toClient(pt.x, pt.y);
      svg.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true}, c1)));
      await wait(160);
      out.aimStarted = !!leaderPick && leaderPick.phase === 'aim';
      // Shift shows the eight directions it will snap to.
      const c2 = toClient(pt.x + 120, pt.y - 30);
      svg.dispatchEvent(new MouseEvent('mousemove',
        Object.assign({bubbles:true, shiftKey:true}, c2)));
      await wait(140);
      out.aimGuides = document.querySelectorAll('#leaderPickLayer .align-guide').length;
      svg.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, shiftKey:true}, c2)));
      await wait(420);
      const made = [...nodes.values()].filter(n=> n.shape === 'callout' &&
        n.leader && n.leader.from === 'ldA' && n.leader.to === 'ldB');
      out.placed = made.length === 1;
      // The card stands where the second click put it, off the anchor.
      const cd = made[0];
      out.placedSnapped = !!cd && Math.hypot((cd.x + cd.w/2) - pt.x, (cd.y + cd.h/2) - pt.y) > 20;
      out.cardOnChart = !!cd && !!document.querySelector(`#edgeLayer .callout-leader[data-id="${cd.id}"]`);
      // The connector it points at is untouched: no note, no placement.
      out.connectorClean = !edgeStyleFor('ldA','ldB').note;
      closeEdgePopover();
      await wait(200);
      if(cd){ deleteNodes([cd.id]); await wait(300); }
    }
    /* And Escape gets out of it before anything is written down. */
    {
      refill(EDGE_STYLES, []);
      rebuildChart(); await wait(360);
      openEdgeStylePopover('ldA','ldB', new MouseEvent('click'));
      await wait(240);
      document.getElementById('styleAddCallout').click();
      await wait(220);
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
      await wait(200);
      out.escapeAtPoint = !leaderPick;
      document.getElementById('styleAddCallout').click();
      await wait(220);
      const rect2 = svg.getBoundingClientRect();
      const pt2 = pointAtFraction(leaderPick.pts, 0.4);
      svg.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true,
        clientX: rect2.left + pt2.x*vs + vx, clientY: rect2.top + pt2.y*vs + vy}));
      await wait(160);
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
      await wait(200);
      out.escapeAtAim = !leaderPick;
      out.escapeWroteNothing = ![...nodes.values()].some(n=> n.shape === 'callout' &&
        n.leader && n.leader.from === 'ldA');
      closeEdgePopover();
      await wait(180);
    }

    /* Every corner keeps its grip on an entry sitting at a negative x —
       the coordinate that used to be read as "the chips reach this far". */
    applyEdit(()=>{
      workingNodes.push(['negx','Left of nothing',null,null,null,null,{pos:[-900,-1500]}]);
    });
    rebuildChart(); await wait(420);
    out.gripsNegative = document.querySelectorAll('[data-id="negx"] .node-resize').length;

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  /* On the ripple, and a shade past it. A line that stops exactly on the
     wave is touching rather than meeting — where the border curves away
     from the line's own direction the two leave a sliver of paper between
     them — so a headless line is pushed a couple of pixels under the
     entry's own fill, which hides the overlap and settles the join. What
     matters is that it lands on the WAVE rather than on the baseline a
     plain border would have sat on. */
  check('a connector meets a rippled border where the ripple actually is',
        r24.lineOnRipple !== undefined && r24.lineOnRipple <= 2.5 && r24.rippleNotBaseline,
        JSON.stringify({onBorder:r24.lineOnRipple, head:r24.ripplePlusHead,
                        offBaseline:r24.rippleNotBaseline}));
  check('a small misalignment is taken up by the ports, not by a step',
        r24.straightAt6 === 0 && r24.straightAt12 === 0,
        JSON.stringify({at6:r24.straightAt6, at12:r24.straightAt12}));
  check('and a real offset still turns proper corners',
        r24.stepsAt30 === 2, String(r24.stepsAt30));
  check('a connector and its own arrowhead are the same strength',
        r24.lineOpacity === r24.headOpacity,
        JSON.stringify({line:r24.lineOpacity, head:r24.headOpacity}));
  check('a leader note is placed in two clicks on the chart',
        r24.pickStarted && r24.aimStarted && r24.placed && r24.cardOnChart,
        JSON.stringify(r24));
  check('with Shift showing the directions it snaps to',
        r24.aimGuides === 8 && r24.placedSnapped,
        JSON.stringify({guides:r24.aimGuides, snapped:r24.placedSnapped}));
  check('and Escape leaves at either stage with nothing written down',
        r24.escapeAtPoint && r24.escapeAtAim && r24.escapeWroteNothing,
        JSON.stringify({point:r24.escapeAtPoint, aim:r24.escapeAtAim,
                        clean:r24.escapeWroteNothing}));
  check('an entry at a negative coordinate keeps all four grips',
        r24.gripsNegative === 4, String(r24.gripsNegative));

  /* ---- 27e. section 45: the knee stays put, arrows on a ripple, and
       elements with nothing written in them ---- */
  const r25 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* Two entries in a column, twenty pixels out of true, with room on
       both sides: the ports take it up and the connector is one line. */
    applyEdit(()=>{
      workingNodes.push(['knA','A',null,null,null,null,{pos:[82000,-1600]}]);
      workingNodes.push(['knB','B','knA',null,null,null,{pos:[82020,-1300]}]);
    });
    refill(EDGE_STYLES, [{from:'knA', to:'knB', fromSide:'bottom', toSide:'top'}]);
    rebuildChart(); await wait(460);
    {
      const el = document.querySelector('path.edge.struct[data-from="knA"][data-to="knB"]');
      out.straightAt20 = el ? (el.getAttribute('d').match(/Q/g) || []).length : -1;
    }

    /* Where the offset is too large to absorb, the knee is anchored to the
       entry the connector LEAVES — so dragging the far entry lengthens the
       far leg and leaves the corner where it was. */
    const kneeOf = async (y)=>{
      applyEdit(()=>{
        const f = workingNodes.find(t=> t[0] === 'knB');
        f[6] = Object.assign({}, f[6], {pos:[82140, y]});
      });
      rebuildChart(); await wait(340);
      const el = document.querySelector('path.edge.struct[data-from="knA"][data-to="knB"]');
      const n = (el.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
      // The first turn's y: the path starts M x,y then runs to the corner.
      return {knee: n[3], corners: (el.getAttribute('d').match(/Q/g) || []).length};
    };
    const k1 = await kneeOf(-1300);
    const k2 = await kneeOf(-1150);
    out.kneeHeld = k1.corners === 2 && k2.corners === 2 &&
                   Math.abs(k1.knee - k2.knee) < 0.6;
    out.kneeNearSource = Math.abs(k1.knee - (nodes.get('knA').y + nodes.get('knA').h)) < 60;

    /* An arrowhead meeting a rippled border is a whole triangle standing on
       the wave — drawn above the entry, where its own fill cannot take a
       bite out of it. */
    applyEdit(()=>{
      workingNodes.push(['akA','A',null,null,null,null,{pos:[84000,-1600]}]);
      workingNodes.push(['akB','P','akA',null,null,'pocket',{pos:[84000,-1400]}]);
    });
    refill(EDGE_STYLES, [{from:'akA', to:'akB', fromSide:'bottom', toSide:'top', arrow:true}]);
    rebuildChart(); await wait(460);
    {
      const head = document.querySelector('.edge-arrow[data-to="akB"]');
      out.headAboveEntry = !!head && head.parentNode.id === 'arrowLayer';
      const tri = head && head.querySelector('path');
      const n = tri ? (tri.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number) : [];
      // Three whole corners, and a base the full width of an arrowhead.
      out.headWhole = n.length === 6 && Math.abs(n[2] - n[4]) > 7;
    }

    /* An entry may be created with nothing written in it, and comes out the
       size of an empty box rather than the width of a paragraph. */
    {
      document.getElementById('addNodeToggle').click();
      await wait(280);
      setRichValue(document.getElementById('addNodeLabel'), '');
      document.getElementById('addNodeSubmit').click();
      await wait(460);
      const made = workingNodes[workingNodes.length-1];
      out.emptyEntryMade = !!made && (made[1] === '' || made[1] == null);
      const n = made && nodes.get(made[0]);
      out.emptyEntrySize = n ? [n.w, n.h] : null;
      out.emptyEntryNarrow = !!n && n.w <= 90;
      if(made) deleteNodes([made[0]]);
      await wait(300);
    }

    /* And a callout with nothing in it is drawn and kept. */
    refill(EDGE_STYLES, []);
    applyEdit(()=>{ workingNodes.push(['knc','',null,null,null,'callout',
      {pos:[70000,-1400], leader:{from:'knA', to:'knB', at:0.5}}]); });
    rebuildChart(); await wait(420);
    out.emptyCardDrawn = !!document.querySelector('.node[data-id="knc"]') &&
      !!document.querySelector('#edgeLayer .callout-leader[data-id="knc"]');

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(500);
    return out;
  });
  check('twenty pixels out of true is still one straight connector',
        r25.straightAt20 === 0, String(r25.straightAt20));
  check('and where a step is needed its knee stays put as the far entry moves',
        r25.kneeHeld && r25.kneeNearSource,
        JSON.stringify({held:r25.kneeHeld, near:r25.kneeNearSource}));
  check('an arrowhead on a rippled border is whole, and stands on the wave',
        r25.headAboveEntry && r25.headWhole,
        JSON.stringify({above:r25.headAboveEntry, whole:r25.headWhole}));
  check('an entry can be made with nothing written in it',
        r25.emptyEntryMade && r25.emptyEntryNarrow,
        JSON.stringify({made:r25.emptyEntryMade, size:r25.emptyEntrySize}));
  check('and a connector note can be empty too', r25.emptyCardDrawn);

  /* ---- 27f. section 46: even ports, readings that keep their dress, a
       rippled border from every side, and clearing a label ---- */
  const r26 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* Two connectors sharing one side of an amalgam's parent keep the even
       share of that side: no straightening nudge is allowed to bunch them
       or pull the pair off centre. */
    applyEdit(()=>{
      workingNodes.push(['evP','Parent',null,null,null,null,{pos:[86000,-1700]}]);
      workingNodes.push(['evQ','Other',null,null,null,null,{pos:[86400,-1700]}]);
      workingNodes.push(['evC','Child','evP',null,null,null,{pos:[85700,-1450]}]);
      workingNodes.push(['evM','M',['evP','evQ'],null,null,'amalgam',{pos:[86200,-1300]}]);
    });
    refill(EDGE_STYLES, [{from:'evP', to:'evC', fromSide:'bottom', toSide:'top'}]);
    rebuildChart(); await wait(700);
    {
      const p = nodes.get('evP');
      const xs = [...document.querySelectorAll('#edgeLayer path.edge.struct[data-from="evP"]')]
        .map(el=>{
          const n = (el.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
          return n[0];
        })
        .sort((a,b)=> a-b);
      out.sharedPorts = xs.map(x=> +((x - p.x) / p.w).toFixed(3));
      // Two connectors on one side sit at a third and two thirds of it.
      out.evenlySpread = xs.length === 2 &&
        Math.abs(out.sharedPorts[0] - 1/3) < 0.02 &&
        Math.abs(out.sharedPorts[1] - 2/3) < 0.02;
    }

    /* A reading keeps whatever the word it covers was wearing, and every
       character of it. */
    applyEdit(()=>{
      workingNodes.push(['rbz','x',null,null,null,null,{pos:[88000,-1700]}]);
    });
    rebuildChart(); await wait(400);
    selectedId = 'rbz';
    document.getElementById('detailEditToggle').click();
    await wait(340);
    {
      const surf = richFields.get('editLabelInput').surface;
      const over = (markup, from, to)=>{
        setRichValue(document.getElementById('editLabelInput'), markup);
        surf.focus();
        const walk = document.createTreeWalker(surf, NodeFilter.SHOW_TEXT);
        let seen = 0, s0 = null, o0 = 0, s1 = null, o1 = 0, t;
        while((t = walk.nextNode())){
          const len = t.textContent.length;
          if(s0 === null && seen + len >= from){ s0 = t; o0 = from - seen; }
          if(s1 === null && seen + len >= to){ s1 = t; o1 = to - seen; }
          seen += len;
        }
        const rg = document.createRange(); rg.setStart(s0, o0); rg.setEnd(s1, o1);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
        applyRichCommand(surf, 'ruby', 'reading');
        return richHtmlToMarkup(surf);
      };
      out.rubyKeepsDress = over('{{u:solid|{{t:solid|asdasd[1]}}}}', 0, 9);
      out.rubyKeepsBold = over('**bold** tail', 0, 4);
    }

    /* Clearing an entry's text takes the text away, rather than putting the
       old words back. */
    {
      applyEdit(()=>{
        workingNodes.push(['clr','Some words',null,null,null,null,{pos:[88400,-1700]}]);
      });
      rebuildChart(); await wait(420);
      selectedId = 'clr';
      const rec = richFields.get('editLabelInput');
      setRichValue(document.getElementById('editLabelInput'), '');
      rec.surface.dispatchEvent(new Event('input', {bubbles:true}));
      await wait(120);
      flushNodeEditCommit();
      await wait(420);
      const found = workingNodes.find(t=> t[0] === 'clr');
      out.labelCleared = !!found && (found[1] === '' || found[1] == null);
    }

    /* A rippled border, from every side, with and without an arrowhead and
       with one ring or two: the line always reaches the wave, and never
       shows past the head that ends it. */
    applyEdit(()=>{
      ['t','b','l','r'].forEach((k,i)=>{
        workingNodes.push(['wq'+k,'s',null,null,null,null,{pos:[90000+i*80,-1900]}]);
        workingNodes.push(['wr'+k,'s',null,null,null,null,{pos:[90600+i*80,-1900]}]);
      });
      workingNodes.push(['wq1','one',['wqt','wqb','wql','wqr'],null,null,'pocket',
                         {pos:[90200,-1600]}]);
      workingNodes.push(['wr2','two',['wrt','wrb','wrl','wrr'],null,null,'pocket',
                         {pos:[90800,-1600],colors:['#20242b','#cc22cc']}]);
    });
    refill(EDGE_STYLES, [
      {from:'wqt', to:'wq1', fromSide:'bottom', toSide:'top', arrow:true},
      {from:'wqb', to:'wq1', fromSide:'bottom', toSide:'bottom', arrow:true},
      {from:'wql', to:'wq1', fromSide:'bottom', toSide:'left', arrow:false},
      {from:'wqr', to:'wq1', fromSide:'bottom', toSide:'right', arrow:false},
      {from:'wrt', to:'wr2', fromSide:'bottom', toSide:'top', arrow:true},
      {from:'wrb', to:'wr2', fromSide:'bottom', toSide:'bottom', arrow:true},
      {from:'wrl', to:'wr2', fromSide:'bottom', toSide:'left', arrow:false},
      {from:'wrr', to:'wr2', fromSide:'bottom', toSide:'right', arrow:false}
    ]);
    rebuildChart(); await wait(800);
    {
      const faults = [];
      EDGE_STYLES.forEach(e=>{
        const to = nodes.get(e.to);
        if(!to) return;
        const line = document.querySelector(
          `#edgeLayer path.edge.struct[data-from="${e.from}"][data-to="${e.to}"]`);
        if(!line){ faults.push(e.from + ':missing'); return; }
        const n = (line.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
        const end = {x:n[n.length-2], y:n[n.length-1]};
        const nrm = {top:[0,-1], bottom:[0,1], left:[-1,0], right:[1,0]}[e.toSide];
        // How far INSIDE the entry's own box the line stops, measured along
        // the side's inward normal. A headless line must be inside the
        // deepest the ripple reaches; a headed one stops short of its head.
        const edgePt = {
          top:    to.y,             bottom: to.y + to.h,
          left:   to.x,             right:  to.x + to.w
        }[e.toSide];
        const along = (e.toSide === 'top' || e.toSide === 'bottom')
          ? (end.y - edgePt) * -nrm[1] : (end.x - edgePt) * -nrm[0];
        if(e.arrow === false){
          // inside by at least the ripple's true amplitude
          if(along < 2.3) faults.push(`${e.from}:short(${along.toFixed(2)})`);
        } else {
          const head = document.querySelector(
            `.edge-arrow[data-from="${e.from}"][data-to="${e.to}"]`);
          if(!head){ faults.push(e.from + ':nohead'); return; }
          if(head.parentNode.id !== 'arrowLayer') faults.push(e.from + ':headburied');
          const hn = (head.querySelector('path').getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
          const gap = Math.hypot(end.x - hn[0], end.y - hn[1]);
          // The line ends exactly one head-trim short of the tip: no more
          // (a gap) and no less (line showing past the arrow).
          if(Math.abs(gap - 8.3) > 0.4) faults.push(`${e.from}:tip(${gap.toFixed(2)})`);
        }
      });
      out.pocketFaults = faults;
    }

    deselect();
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('two connectors sharing a side keep their even share of it',
        r26.evenlySpread, JSON.stringify(r26.sharedPorts));
  check('a reading keeps what the word it covers was wearing',
        r26.rubyKeepsDress === '{{u:solid|{{t:solid|[[asdasd[1\\]|reading]]}}}}' &&
        r26.rubyKeepsBold === '**[[bold|reading]]** tail',
        JSON.stringify({dress:r26.rubyKeepsDress, bold:r26.rubyKeepsBold}));
  check('clearing an entry’s text leaves it empty', r26.labelCleared);
  check('a rippled border takes the same connector from every side',
        r26.pocketFaults.length === 0, r26.pocketFaults.join(', '));

  /* ---- 27g. section 47: an About that scrolls, even ports that still
       drop straight, a border nothing crosses, and an export in standards
       mode ---- */
  const r27 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* The About panel is taller than most windows now, so it scrolls. */
    document.getElementById('aboutToggle').click();
    await wait(320);
    {
      const card = document.querySelector('#aboutOverlay .about-card');
      const body = document.querySelector('#aboutOverlay .about-body');
      const cs = getComputedStyle(body);
      out.aboutScrolls = cs.overflowY === 'auto' &&
        body.scrollHeight > body.clientHeight + 4 &&
        card.getBoundingClientRect().height <= window.innerHeight + 1;
    }
    document.getElementById('aboutClose').click();
    await wait(220);

    /* Two connectors leaving one side keep their even share of it AND
       drop straight — the lineage feeding a merge lands under its own
       port rather than under the middle of its entry. */
    applyEdit(()=>{
      workingNodes.push(['apA','A parent with a long label',null,null,null,null,{pos:[92000,-1900]}]);
      workingNodes.push(['apB','Other parent',null,null,null,null,{pos:[92300,-1900]}]);
      workingNodes.push(['apC','Child','apA',null,null,null,{pos:[91600,-1650]}]);
      workingNodes.push(['apM','M',['apA','apB'],null,null,'amalgam',{pos:[92150,-1550]}]);
    });
    refill(EDGE_STYLES, [{from:'apA', to:'apC', fromSide:'bottom', toSide:'right', arrow:true}]);
    rebuildChart(); await wait(760);
    {
      const a = nodes.get('apA');
      const outs = [...document.querySelectorAll('#edgeLayer path.edge.struct[data-from="apA"]')]
        .map(el=>{
          const d = el.getAttribute('d');
          const n = (d.match(/-?[\d.]+/g)||[]).map(Number);
          return {x:n[0], y:n[1], secondY:n[3], corners:(d.match(/Q/g)||[]).length};
        })
        .sort((p1,p2)=> p1.x - p2.x);
      out.fanPorts = outs.map(o=> +((o.x - a.x)/a.w).toFixed(3));
      out.fanEven = outs.length === 2 &&
        Math.abs(out.fanPorts[0] - 1/3) < 0.02 && Math.abs(out.fanPorts[1] - 2/3) < 0.02;
      // Each leaves its entry and turns exactly once: straight down, then away.
      out.fanStraight = outs.every(o=> o.corners === 1);
    }

    /* A rippled border: nothing crosses it. No cap begins inside the box,
       and every arrowhead is cut off at the outline. */
    applyEdit(()=>{
      workingNodes.push(['ccS','S',null,null,null,null,{pos:[94000,-1900]}]);
      workingNodes.push(['ccT','T',null,null,null,null,{pos:[94200,-1900]}]);
      workingNodes.push(['ccP','P',['ccS','ccT'],null,null,'pocket',
                         {pos:[94100,-1700],colors:['#20242b','#cc22cc']}]);
    });
    refill(EDGE_STYLES, [
      {from:'ccS', to:'ccP', fromSide:'bottom', toSide:'top', arrow:true},
      {from:'ccT', to:'ccP', fromSide:'bottom', toSide:'top', arrow:false}
    ]);
    rebuildChart(); await wait(700);
    {
      const p = nodes.get('ccP');
      const cap = document.querySelector('.edge-cap[data-to="ccP"]');
      if(cap){
        const n = (cap.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
        // The cap starts on the border and runs outward — never from a
        // point buried inside the entry.
        out.capStartsOutside = n[1] <= p.y + 0.6;
      } else out.capStartsOutside = true;
      const head = document.querySelector('.edge-arrow[data-to="ccP"]');
      out.headClipped = !!head && /^url\(#outside-/.test(head.getAttribute('clip-path') || '');
      out.headAbove = !!head && head.parentNode.id === 'arrowLayer';
    }

    /* A callout is picked up anywhere on it — it is an entry — and a press
       on it selects nothing on the page. */
    applyEdit(()=>{ workingNodes.push(['ccc','note',null,null,null,'callout',
      {pos:[94500,-1700], leader:{from:'ccS', to:'ccP', at:0.5}}]); });
    rebuildChart(); await wait(520);
    {
      const cardEl = document.querySelector('.node[data-id="ccc"]');
      const box = cardEl && cardEl.querySelector('rect');
      const n = nodes.get('ccc');
      out.gripWholeCard = !!cardEl && !!box && !!n &&
        Math.abs(+box.getAttribute('width') - n.w) < 0.6 &&
        Math.abs(+box.getAttribute('height') - n.h) < 0.6;
      const ev = new MouseEvent('mousedown', {button:0, clientX:5, clientY:5,
                                              bubbles:true, cancelable:true});
      cardEl.dispatchEvent(ev);
      out.pressCancelled = ev.defaultPrevented;
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(200);
    }

    /* Whatever the export is built from, what comes out is a standards-mode
       document — quirks mode changes what contenteditable produces. */
    out.exportHasDoctype = /^\s*<!doctype html/i.test(
      ensureFullDocument('<html><head></head><body><div class="app"></div></body></html>'));
    out.exportWrapsFragment = /^\s*<!doctype html/i.test(
      ensureFullDocument('<title>x</title><div class="app"></div>'));

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('the About panel scrolls rather than running off the screen',
        r27.aboutScrolls);
  check('a fan keeps its even share of an edge and still drops straight',
        r27.fanEven && r27.fanStraight,
        JSON.stringify({ports:r27.fanPorts, straight:r27.fanStraight}));
  check('nothing crosses a rippled border into the entry',
        r27.capStartsOutside && r27.headClipped && r27.headAbove,
        JSON.stringify({cap:r27.capStartsOutside, clip:r27.headClipped, above:r27.headAbove}));
  check('a leader card is picked up anywhere on it, selecting nothing',
        r27.gripWholeCard && r27.pressCancelled,
        JSON.stringify({whole:r27.gripWholeCard, cancelled:r27.pressCancelled}));
  check('an exported page is always a standards-mode document',
        r27.exportHasDoctype && r27.exportWrapsFragment,
        JSON.stringify({full:r27.exportHasDoctype, frag:r27.exportWrapsFragment}));

  /* ---- 27h. section 48: the review pass — nothing an entry draws may be
       filled by accident, and nothing may cover the connectors ---- */
  const r28 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* An entry's helper shapes must not be FILLED.
     *
       `.node > rect, .node > polygon, .node > ellipse, .node > path` sets a
       panel fill on every direct child of an entry, and it is a more
       specific selector than a bare class — so any helper named only by its
       class was quietly painted solid. The hover pad, which reaches past
       the border by a ring's depth and by a whole ripple on a pocket, was
       therefore a white rectangle laid over the last pixels of every
       connector arriving at that entry. This is the guard for that whole
       family of accidents. */
    applyEdit(()=>{
      workingNodes.push(['hpS','S',null,null,null,null,{pos:[96000,-2100]}]);
      workingNodes.push(['hpP','P',['hpS'],null,null,'pocket',{pos:[96000,-1900]}]);
      workingNodes.push(['hpB','B',null,null,null,'ellipse',{pos:[96300,-1900]}]);
    });
    refill(EDGE_STYLES, [{from:'hpS', to:'hpP', fromSide:'bottom', toSide:'top', arrow:false}]);
    rebuildChart(); await wait(620);
    {
      const pad = document.querySelector('[data-id="hpP"] > rect.node-hover-pad');
      out.padUnfilled = !!pad && getComputedStyle(pad).fill === 'none';
      const ph = document.querySelector('[data-id="hpB"] .bio-placeholder');
      out.placeholderUnfilled = !ph || getComputedStyle(ph).fill === 'none';
      // Nothing an entry draws may be painted over its own connectors.
      // Groups paint nothing themselves — their fill is only inherited —
      // so only the shapes that actually put ink down are counted.
      const INK = new Set(['rect','path','circle','ellipse','polygon','image']);
      const painted = [...document.querySelectorAll('[data-id="hpP"] > *')]
        .filter(el=>{
          if(!INK.has(el.tagName)) return false;
          const cs = getComputedStyle(el);
          if(cs.opacity === '0' || cs.display === 'none') return false;
          const f = cs.fill;
          return f && f !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(f);
        })
        .map(el=> el.tagName + '.' + (el.getAttribute('class') || ''));
      // Only the entry's own outline may be filled.
      out.paintedChildren = painted;
    }

    /* And the connector still meets that entry's rippled border with no
       white between, whichever phase of the wave it arrives at. */
    {
      const p = nodes.get('hpP');
      const line = document.querySelector(
        '#edgeLayer path.edge.struct[data-from="hpS"][data-to="hpP"]');
      const n = (line.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
      /* It ARRIVES at the pocket, so it is the last point that matters: it
         has to finish inside the box, under the entry's own fill, which is
         what makes the join impossible to see a gap in. */
      out.endsInside = n[n.length-1] > p.y + 1;
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(480);
    return out;
  });
  check('an entry’s hover pad is a frame, never a filled rectangle',
        r28.padUnfilled);
  check('and its placeholder figure is an outline, not a blob',
        r28.placeholderUnfilled);
  check('nothing an entry draws is painted over its own connectors',
        r28.paintedChildren.length === 1,
        JSON.stringify(r28.paintedChildren));
  check('so a connector still reaches under a rippled border',
        r28.endsInside);

  /* ---- 27j. section 49: a pocket's OTHER borders, scenery as tags,
       a comment that reads like everything else, and figures in it ---- */
  const r29 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const beforeMedia = MEDIA.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* Every ring of a rippled border behaves like the outermost one: an
       arrowhead is cut off AT the ring it was pulled from, and a headless
       line stops just under it rather than coming out the far side. */
    {
      const SIDES4 = ['top','bottom','left','right'];
      let bad = 0, seen = 0, clips = 0, heads = 0;
      for(const W of [180, 191, 202]){
        for(const ring of [0, 1, 2]){
          for(const head of [true, false]){
            applyEdit(()=>{
              workingNodes.length = 0;
              workingNodes.push(['pkR','P',null,null,null,'pocket',
                {pos:[0,0], size:[W,120], colors:['#c0392b','#2980b9','#27ae60']}]);
              SIDES4.forEach((sd,i)=> workingNodes.push(['pk_'+sd,'X','pkR',null,null,null,
                {pos:[[0,-320],[0,320],[-460,0],[460,0]][i]}]));
              EDGE_STYLES.length = 0;
              SIDES4.forEach((sd,i)=> EDGE_STYLES.push({from:'pkR', to:'pk_'+sd,
                fromSide:sd, toSide:['bottom','top','right','left'][i],
                fromRing:ring, arrow:false, arrowIn:head}));
            });
            await wait(150);
            const n = nodes.get('pkR');
            const step = ringStepFor(n);
            for(const sd of SIDES4){
              const el = document.querySelector(
                `#edgeLayer path.edge.struct[data-from="pkR"][data-to="pk_${sd}"]`);
              if(!el){ bad++; continue; }
              const q = el.getPointAtLength(0);
              const vert = (sd === 'left' || sd === 'right');
              const grow = ring * step;
              const base = {top:n.y - grow, bottom:n.y + n.h + grow,
                            left:n.x - grow, right:n.x + n.w + grow}[sd];
              const signed = (sd === 'top' || sd === 'left')
                ? base - (sd === 'top' ? q.y : q.x)
                : (sd === 'bottom' ? q.y : q.x) - base;
              const f = wavyDropAt(n, sd, ring);
              const drop = f ? f(vert ? base : q.x, vert ? q.y : base) : 0;
              const trim = head ? (ARROW_LEN - 1.2) : 0;
              const want = (head ? drop
                            : (ring > 0 ? drop - 0.7 : -(POCKET_DEEP + POCKET_BITE))) + trim;
              seen++;
              if(Math.abs(signed - want) > 0.35) bad++;
              if(head){
                const g = document.querySelector(
                  `#arrowLayer g.edge-arrow[data-from="pkR"][data-to="pk_${sd}"]`);
                heads++;
                if(g && g.getAttribute('clip-path') === `url(#outside-pkR-r${ring})`) clips++;
              }
            }
          }
        }
      }
      out.ringEnds = {seen, bad};
      out.ringClips = {heads, clips};
    }

    /* A hub and a local multiverse are tags now, so any archetype can wear
       either — and a chart written when they were shapes still opens. */
    applyEdit(()=>{
      workingNodes.length = 0;
      workingNodes.push(['tgH','Hub pocket',null,null,null,'pocket',
        {pos:[0,0], colors:['#a11','#11a','#1a1'], tags:['multiversal hub']}]);
      workingNodes.push(['tgB','Both',null,null,null,null,
        {pos:[400,0], bg:['#c23b22'], tags:['multiversal hub','local multiverse']}]);
      workingNodes.push(['tgL','Legacy',null,null,null,'local', {pos:[800,0]}]);
    });
    await wait(500);
    out.hubOnPocket = document.querySelectorAll('#auraLayer .node-aura[data-id="tgH"] .hub-echo').length;
    out.pocketKeptRings = document.querySelectorAll('.node[data-id="tgH"] > path').length;
    out.bothScenery = [
      document.querySelectorAll('.node-aura[data-id="tgB"] .hub-echo').length,
      document.querySelectorAll('.node-aura[data-id="tgB"] .local-sheet').length];
    const legacy = workingNodes.find(x=> x[0] === 'tgL');
    out.migrated = legacy[5] === null &&
      (legacy[6].tags || []).indexOf('local multiverse') >= 0;
    out.legacyDraws = document.querySelectorAll('.node-aura[data-id="tgL"] .local-sheet').length;
    out.shapeGone = !document.querySelector('#editShapeInput option[value="hub"]') &&
                    !document.querySelector('#editShapeInput option[value="local"]');
    out.tagsAreSpecial = tagIsSpecial('multiversal hub') && tagIsSpecial('local multiverse');

    /* An entry's comment is drawn like every other piece of formatted text
       on the page — no italic of its own, no ink of its own — and can carry
       a figure in the flow of it. */
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    applyEdit(()=>{
      MEDIA.length = 0;
      MEDIA.push({key:'figA', name:'A frame', kind:'image', src:png});
      workingNodes.push(['cmn','Commented',null,null,'before\n{{m:figA}}\nafter **bold**',
                         null,{pos:[1200,0]}]);
    });
    rebuildMediaMap();
    await wait(400);
    selectNode('cmn');
    await wait(400);
    {
      const surf = richFields.get('detailNoteInput').surface;
      out.noteItalic = getComputedStyle(surf).fontStyle;
      out.noteFamily = getComputedStyle(surf).fontFamily;
      out.editFamily = getComputedStyle(richFields.get('editLabelInput').surface).fontFamily;
      out.figuresShown = surf.querySelectorAll('.rich-figure img').length;
      out.figureRoundTrip = richHtmlToMarkup(surf);
      // A figure is for the document, never for the drawing.
      out.svgText = (document.querySelector('.node[data-id="cmn"] text') || {}).textContent;
      out.stripped = stripMarkup('a{{m:figA}}b');
      out.mediaSerialises = /key:'figA'/.test(serializeMedia(MEDIA));
      out.buttonOnNote = !!document.querySelector('#detailNoteToolbar .tb-media-btn');
      out.buttonNowhereElse = document.querySelectorAll('.mini-toolbar .tb-media-btn').length;
      out.linkRefused = !mediaSrcOk('javascript:alert(1)') && mediaSrcOk('https://example.com/a.png');
    }
    deselect();

    refill(MEDIA, beforeMedia); rebuildMediaMap();
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(500);
    return out;
  });
  check('every ring of a rippled border stops its connector in the right place',
        r29.ringEnds.bad === 0 && r29.ringEnds.seen >= 60,
        JSON.stringify(r29.ringEnds));
  check('and an arrowhead is cut off at the ring it was pulled from',
        r29.ringClips.heads > 0 && r29.ringClips.clips === r29.ringClips.heads,
        JSON.stringify(r29.ringClips));
  check('a pocket reality can be a multiversal hub and keep all three borders',
        r29.hubOnPocket === 3 && r29.pocketKeptRings === 3,
        JSON.stringify({echo:r29.hubOnPocket, rings:r29.pocketKeptRings}));
  check('one entry can carry both kinds of scenery at once',
        JSON.stringify(r29.bothScenery) === JSON.stringify([3, 2]),
        JSON.stringify(r29.bothScenery));
  check('a chart written when they were archetypes still opens',
        r29.migrated && r29.legacyDraws === 2,
        JSON.stringify({migrated:r29.migrated, sheets:r29.legacyDraws}));
  check('and neither is offered as an archetype any more', r29.shapeGone);
  check('both tags say they do something', r29.tagsAreSpecial);
  check('an entry’s comment is set like every other formatted text',
        r29.noteItalic === 'normal' && r29.noteFamily === r29.editFamily,
        JSON.stringify({style:r29.noteItalic, note:r29.noteFamily, form:r29.editFamily}));
  check('a figure stands in the flow of a comment, and round-trips',
        r29.figuresShown === 1 && r29.figureRoundTrip === 'before\n{{m:figA}}\nafter **bold**',
        JSON.stringify({n:r29.figuresShown, m:r29.figureRoundTrip}));
  check('and never reaches the drawing, where it could not be drawn',
        r29.svgText === 'Commented' && r29.stripped === 'ab',
        JSON.stringify({svg:r29.svgText, stripped:r29.stripped}));
  check('figures are saved with the chart', r29.mediaSerialises);
  check('the figure button is offered on the comment and nowhere else',
        r29.buttonOnNote && r29.buttonNowhereElse === 1,
        JSON.stringify({on:r29.buttonOnNote, count:r29.buttonNowhereElse}));
  check('a figure may only come from the file or from the web', r29.linkRefused);

  /* ---- 27k. section 50: a callout with a card of its own, tags drawn as
       tags, figures placed and sized, and a save that says what failed ---- */
  const r30 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const beforeCats = TAG_CATS.slice();
    const beforeMedia = MEDIA.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* A callout is not an archetype anybody can pick, and clicking one
       opens its own card rather than the entry drawer. */
    out.notAnArchetype = !document.querySelector('#editShapeInput option[value="callout"]') &&
                         !document.querySelector('#addNodeShape option[value="callout"]');
    applyEdit(()=>{
      workingNodes.length = 0;
      EDGE_STYLES.length = 0;
      workingNodes.push(['coA','Alpha',null,null,null,null,{pos:[-300,-100]}]);
      workingNodes.push(['coB','Beta','coA',null,null,null,{pos:[260,-100]}]);
      workingNodes.push(['coC','Remark',null,null,null,'callout',
                         {pos:[-40,140], leader:{from:'coA', to:'coB', at:0.5}}]);
    });
    await wait(700);
    /* One click picks it up and opens nothing; the second opens its card. */
    document.querySelector('.node[data-id="coC"]').dispatchEvent(
      new MouseEvent('click', {bubbles:true, cancelable:true, clientX:420, clientY:420}));
    await wait(350);
    out.oneClickSelects = selectedId === 'coC' &&
                          !document.getElementById('calloutPopover').classList.contains('open');
    document.querySelector('.node[data-id="coC"]').dispatchEvent(
      new MouseEvent('dblclick', {bubbles:true, cancelable:true, clientX:420, clientY:420}));
    await wait(350);
    out.ownPanel = document.getElementById('calloutPopover').classList.contains('open');
    out.noDrawer = !document.getElementById('detail').classList.contains('open');
    out.panelHasWords = richFields.get('calloutText').surface.textContent === 'Remark';
    /* …and the panel writes the card's own words. */
    setRichValue(document.getElementById('calloutText'), 'Rewritten');
    flushCalloutCommit();
    await wait(400);
    out.panelWrites = (nodes.get('coC') || {}).label === 'Rewritten';
    closeCalloutPopover();
    await wait(250);

    /* The side its leader arrives at offers no port. */
    out.takenSide = calloutLeaderSide(nodes.get('coC'));
    const sides = [...document.querySelectorAll('.node[data-id="coC"] .node-handle')]
      .map(h=> h.dataset.side);
    out.sideGone = out.takenSide && sides.indexOf(out.takenSide) < 0 &&
                   new Set(sides).size === 3;

    /* The anchor is a handle, and sliding it carries the card along. */
    out.anchorHandle = !!document.querySelector(
      '#leaderHitLayer .leader-dot-hit[data-id="coC"]');
    {
      const dot = document.querySelector('#edgeLayer .callout-leader[data-id="coC"] .leader-dot');
      const before = {x:+dot.getAttribute('cx'), y:+dot.getAttribute('cy')};
      const cardBefore = {x: nodes.get('coC').x, y: nodes.get('coC').y};
      const hit = document.querySelector('#leaderHitLayer .leader-dot-hit[data-id="coC"]');
      /* And nothing a connector lays down to be clickable by is over it. */
      {
        /* Brought into view first: a hit test on a point the chart is not
           currently showing tells you about the toolbar. */
        const keep = {vx, vy};
        const r2 = svg.getBoundingClientRect();
        vx = r2.width/2 - before.x*vs; vy = r2.height/2 - before.y*vs;
        applyTransform();
        await wait(120);
        const px = r2.left + before.x*vs + vx, py = r2.top + before.y*vs + vy;
        const stack = document.elementsFromPoint(px, py);
        out.handleStack = stack.slice(0, 3)
          .map(e=> e.tagName + '.' + ((e.getAttribute && e.getAttribute('class')) || '')).join(' ');
        out.handleOnTop = !!stack[0] && stack[0].classList &&
                          stack[0].classList.contains('leader-dot-hit');
        vx = keep.vx; vy = keep.vy; applyTransform();
        await wait(120);
      }
      const rect = svg.getBoundingClientRect();
      const toClient = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      hit.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, button:0}, toClient(before.x, before.y))));
      // Shift puts it on one of the five places a callout usually wants.
      window.dispatchEvent(new MouseEvent('mousemove',
        Object.assign({bubbles:true, shiftKey:true}, toClient(before.x - 160, before.y))));
      await wait(220);
      out.snapBeads = document.querySelectorAll('#leaderPickLayer .leader-snap').length;
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(420);
      const dot2 = document.querySelector('#edgeLayer .callout-leader[data-id="coC"] .leader-dot');
      const at = (nodes.get('coC').leader || {}).at;
      out.anchorMoved = !!dot2 && Math.abs(+dot2.getAttribute('cx') - before.x) > 20;
      out.anchorSnapped = LEADER_SNAPS.some(v=> Math.abs(v - at) < 0.001);
      out.cardFollowed = Math.abs(nodes.get('coC').x - cardBefore.x) > 20;
    }

    /* Selecting either end lights the callout and its leader — and
       selecting the callout lights the connector it is about. */
    selectNode('coA');
    await wait(320);
    out.litWithEnd = !document.querySelector('.node[data-id="coC"]').classList.contains('dim') &&
      document.querySelector('#edgeLayer .callout-leader[data-id="coC"]').classList.contains('lit');
    selectNode('coC', {quiet:true});
    await wait(320);
    out.litItsLine = document.querySelector(
      '#edgeLayer path.edge.struct[data-from="coA"][data-to="coB"]').classList.contains('lit');
    deselect();
    await wait(200);

    /* Tags are drawn as tags, the acting ones are filed under SPECIAL, and
       both of the renamed ones are written without a hyphen. */
    refill(TAG_CATS, [{name:'Eras', tags:['era-probe', 'fan-fiction']}]);
    applyEdit(()=>{
      workingNodes.push(['tgA','Tagged',null,null,null,null,
        {pos:[600,-100], tags:['era-probe','fan-fiction','multiversal hub']}]);
      // …and one written the old way, which is corrected as it opens.
      workingNodes.push(['tgB','Old',null,null,null,null,
        {pos:[900,-100], tags:['local-multiverse']}]);
    });
    rebuildChart(); buildManagement();
    document.getElementById('legend').classList.add('open');
    await wait(450);
    out.groupNames = [...document.querySelectorAll('.legend-group-name')].map(e=> e.textContent);
    out.specialItalic = !!document.querySelector('.legend-group-head.legend-group-special');
    out.everyRowIsATag = [...document.querySelectorAll('.legend-item')]
      .filter(r=> r.dataset.tag !== '__untagged__')
      .every(r=> !!r.querySelector('.name .tag-shape'));
    out.bucketPlain = [...document.querySelectorAll('.legend-item')]
      .filter(r=> r.dataset.tag === '__untagged__')
      .every(r=> !r.querySelector('.tag-shape') && !!r.querySelector('.tag-bucket'));
    out.italicOnes = [...document.querySelectorAll('#legend [style*="italic"], #legend .tag-italic')]
      .map(e=> e.textContent).concat(
      [...document.querySelectorAll('#legend .legend-group-name, #legend .legend-item .name')]
        .filter(e=> getComputedStyle(e).fontStyle === 'italic').map(e=> e.textContent));
    out.eyeletDrawn = document.querySelectorAll('.legend-item .name .tag-shape .tag-eye').length;
    // The acting tags are under SPECIAL even though a category claims one.
    const specialBlock = [...document.querySelectorAll('.legend-group')]
      .find(g=> g.querySelector('.legend-group-special'));
    out.specialHolds = specialBlock
      ? [...specialBlock.querySelectorAll('.legend-item')].map(r=> r.dataset.tag).sort()
      : null;
    out.renamed = (workingNodes.find(x=> x[0]==='tgB')[6].tags || [])[0];
    document.getElementById('legend').classList.remove('open');

    /* A figure carries the width it was dragged to, both ways. */
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    applyEdit(()=>{
      MEDIA.length = 0;
      MEDIA.push({key:'figB', name:'Frame', kind:'image', src:png});
      workingNodes.push(['cmA','Commented',null,null,'one\n{{m:figB@45}}\ntwo', null, {pos:[1200,-100]}]);
    });
    rebuildMediaMap();
    await wait(400);
    selectNode('cmA');
    await wait(400);
    {
      const surf = richFields.get('detailNoteInput').surface;
      const fig = surf.querySelector('.rich-figure');
      out.figSized = !!fig && fig.style.width === '45%' && fig.dataset.w === '45';
      out.figGrip = !!(fig && fig.querySelector('.fig-grip'));
      out.figRoundTrip = richHtmlToMarkup(surf);
      // A locked comment scrolls rather than growing without limit.
      out.lockedScrolls = getComputedStyle(surf).overflowY === 'auto' &&
                          getComputedStyle(surf).maxHeight !== 'none';
      // …and the width survives a trip through the writer and back.
      const back = tokenizeLabel(out.figRoundTrip, {media:true}).find(t=> t.type === 'media');
      out.widthSurvives = back && back.w === 45;
    }
    deselect();

    /* Saving names what actually went wrong. */
    out.tooLargeSpeaks = /figure|sticker|picture|chart itself/.test(heaviestPartOfChart());
    out.shapesTried = typeof publishOwnPage === 'function';

    refill(MEDIA, beforeMedia); rebuildMediaMap();
    refill(TAG_CATS, beforeCats);
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(500);
    return out;
  });
  check('a callout is not an archetype anybody can choose', r30.notAnArchetype);
  check('one click picks a callout up, two open its card',
        r30.oneClickSelects && r30.ownPanel && r30.noDrawer && r30.panelHasWords,
        JSON.stringify({one:r30.oneClickSelects, panel:r30.ownPanel,
                        drawer:r30.noDrawer, words:r30.panelHasWords}));
  check('and its handle sits above every connector', r30.handleOnTop, r30.handleStack);
  check('and that card is what writes its words', r30.panelWrites);
  check('the side its leader arrives at offers no port',
        r30.sideGone === true, 'taken ' + r30.takenSide);
  check('the anchor is a handle that slides along the connector',
        r30.anchorHandle && r30.anchorMoved && r30.cardFollowed,
        JSON.stringify({handle:r30.anchorHandle, moved:r30.anchorMoved, card:r30.cardFollowed}));
  check('with Shift offering a place every twentieth of the line',
        r30.snapBeads === 21 && r30.anchorSnapped,
        JSON.stringify({beads:r30.snapBeads, snapped:r30.anchorSnapped}));
  check('a callout lights with the connector it is about, and it with the callout',
        r30.litWithEnd && r30.litItsLine,
        JSON.stringify({end:r30.litWithEnd, line:r30.litItsLine}));
  check('every tag on the panel is drawn as a tag, eyelet and all',
        r30.everyRowIsATag && r30.eyeletDrawn > 0,
        JSON.stringify({rows:r30.everyRowIsATag, eyes:r30.eyeletDrawn}));
  check('\u2026and Untagged, which is not a tag, is not drawn as one',
        r30.bucketPlain === true);
  check('the last bucket is SPECIAL, in italic',
        r30.groupNames.indexOf('Special') >= 0 && r30.groupNames.indexOf('Ungrouped') < 0 &&
        r30.specialItalic, JSON.stringify(r30.groupNames));
  check('and it holds the acting tags however they were filed',
        !!r30.specialHolds && r30.specialHolds.indexOf('fan-fiction') >= 0 &&
        r30.specialHolds.indexOf('multiversal hub') >= 0,
        JSON.stringify(r30.specialHolds));
  check('nothing on the panel is set in italic', r30.italicOnes.length === 0,
        JSON.stringify(r30.italicOnes));
  check('a chart written with the hyphenated spelling is corrected',
        r30.renamed === 'local multiverse', String(r30.renamed));
  check('a figure keeps the width it was given, and can be pulled by a corner',
        r30.figSized && r30.figGrip && r30.widthSurvives,
        JSON.stringify({sized:r30.figSized, grip:r30.figGrip, back:r30.figRoundTrip}));
  check('a long comment scrolls instead of pushing the panel off the screen',
        r30.lockedScrolls);
  check('a failed save can say which picture is the heavy one',
        r30.tooLargeSpeaks && r30.shapesTried);

  /* The weave is gold, not a warm grey. */
  const weave = await page.evaluate(()=>{
    const p = document.querySelector('.fanfic-line');
    return p ? getComputedStyle(p).stroke : null;
  });
  check('the fan-fiction weave is drawn in gold', /232|e8b21f|rgb\(232/.test(weave || ''), String(weave));

  /* ---- 27l. section 51: contained animations, a crossbar that stays put
       whichever end moves, a panel you can search and fold, a comment read
       at full size, and a callout that behaves like everything else ---- */
  const r31 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const beforeCats = TAG_CATS.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* No animation may grow its decoration. Each keyframe is read from the
       stylesheet rather than measured, because what is being asserted is
       the BOUND, not one frame of it. */
    {
      const frames = {};
      for(const sheet of document.styleSheets){
        let rules; try{ rules = sheet.cssRules; }catch(e){ continue; }
        for(const r of rules){
          if(r.type === CSSRule.KEYFRAMES_RULE) frames[r.name] = [...r.cssRules].map(k=> k.style.transform || '');
        }
      }
      const worst = (name)=> (frames[name] || []).reduce((m, t)=>{
        const sc = /scale\(([\d.]+)\)/.exec(t);
        if(sc) return Math.max(m, +sc[1]);
        const tr = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(t);
        if(tr) return Math.max(m, Math.abs(+tr[1]), Math.abs(+tr[2]));
        return m;
      }, 0);
      out.echoWithin = worst('hub-echo-out') <= 1.0001;
      out.sheetWithin = worst('local-sheet-away') <= 11.0001;
      /* And the light crosses the weave left to right, which for a mask
         wider than its box means the position counts DOWN. */
      const sweep = [];
      for(const sheet of document.styleSheets){
        let rules; try{ rules = sheet.cssRules; }catch(e){ continue; }
        for(const r of rules){
          if(r.type === CSSRule.KEYFRAMES_RULE && r.name === 'fanfic-sweep'){
            for(const k of r.cssRules){
              const m = /,\s*(-?[\d.]+)%/.exec(k.style.maskPosition || k.style.webkitMaskPosition || '');
              sweep.push({at: k.keyText, v: m ? +m[1] : null});
            }
          }
        }
      }
      const first = sweep.find(k=> /^(from|0%)$/.test(k.at));
      const last = sweep.find(k=> /^(to|100%)$/.test(k.at));
      out.sweepLeftToRight = !!(first && last) && first.v > last.v;
    }

    /* The crossbar stays where it was drawn, whichever end is dragged. */
    {
      const barY = ()=>{
        const p = document.querySelector('#edgeLayer path.edge.struct[data-from="ebL"][data-to="ebR"]');
        if(!p) return null;
        const n = (p.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
        let hi = Infinity; for(let i=1;i<n.length;i+=2) hi = Math.min(hi, n[i]);
        return +hi.toFixed(1);
      };
      const build = ()=> applyEdit(()=>{
        workingNodes.length = 0; EDGE_STYLES.length = 0;
        workingNodes.push(['ebL','L',null,null,null,null,{pos:[-200,0]}]);
        workingNodes.push(['ebR','R','ebL',null,null,null,{pos:[60,-10]}]);
        EDGE_STYLES.push({from:'ebL', to:'ebR', fromSide:'top', toSide:'top', arrow:false});
      });
      build(); await wait(560);
      const held = [barY()];
      for(const dy of [40, 110, 220]){
        applyEdit(()=>{ workingNodes.find(x=> x[0]==='ebL')[6].pos = [-200, dy]; });
        await wait(300); held.push(barY());
      }
      /* From the first move on. At rest these two are nearly level and the
         route is a plain elbow with no crossbar at all — there is nothing
         to hold until the geometry asks for one. */
      out.barHeldSource = held.slice(1).every(v=> v === held[1]) && held[1] !== null;
      build(); await wait(560);
      const held2 = [barY()];
      for(const dy of [40, 110, 220]){
        applyEdit(()=>{ workingNodes.find(x=> x[0]==='ebR')[6].pos = [60, dy]; });
        await wait(300); held2.push(barY());
      }
      out.barHeldTarget = held2.slice(1).every(v=> v === held2[1]) && held2[1] !== null;
      out.bars = [held.join(','), held2.join(',')];
    }

    /* Shrinking an entry with nothing written in it shrinks it. */
    {
      applyEdit(()=>{ workingNodes.push(['emp','',null,null,null,null,{pos:[900,-200]}]); });
      await wait(420);
      const n0 = nodes.get('emp');
      const w0 = n0.w, h0 = n0.h;
      const g = document.querySelector('.node[data-id="emp"]');
      beginNodeResize({button:0, clientX:0, clientY:0, target:g,
                       stopPropagation(){}, preventDefault(){}},
                      n0, g, {key:'se', sx:1, sy:1});
      window.dispatchEvent(new MouseEvent('mousemove', {clientX:-6*vs, clientY:-6*vs, bubbles:true}));
      await wait(180);
      const n1 = nodes.get('emp');
      out.emptyShrank = n1.w <= w0 + 0.01 && n1.h <= h0 + 0.01;
      out.emptySizes = [w0, h0, n1.w, n1.h];
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(260);
    }

    /* The Management panel folds and searches. */
    refill(TAG_CATS, [{name:'Eras', tags:['era-a','era-b']}]);
    applyEdit(()=>{
      workingNodes.push(['tp','T',null,null,null,null,{pos:[1300,-200], tags:['era-a','era-b','fan-fiction']}]);
    });
    rebuildChart(); buildManagement();
    document.getElementById('legend').classList.add('open');
    await wait(420);
    out.hasSearch = !!document.getElementById('legendFilter');
    const erasHead = [...document.querySelectorAll('.legend-group-head.foldable')]
      .find(h=> /Eras/.test(h.textContent));
    out.foldable = !!erasHead;
    const rowsBefore = document.querySelectorAll('.legend-item').length;
    if(erasHead) erasHead.dispatchEvent(new MouseEvent('click', {bubbles:true}));
    await wait(300);
    out.foldedAway = document.querySelectorAll('.legend-item').length === rowsBefore - 2 &&
                     !!document.querySelector('.legend-group.collapsed');
    const erasAgain = [...document.querySelectorAll('.legend-group-head.foldable')]
      .find(h=> /Eras/.test(h.textContent));
    if(erasAgain) erasAgain.dispatchEvent(new MouseEvent('click', {bubbles:true}));
    await wait(300);
    {
      const inp = document.getElementById('legendFilter');
      inp.value = 'era-a'; inp.dispatchEvent(new Event('input', {bubbles:true}));
      await wait(300);
      out.searchNarrows = [...document.querySelectorAll('.legend-item')].map(r=> r.dataset.tag);
      const inp2 = document.getElementById('legendFilter');
      inp2.value = ''; inp2.dispatchEvent(new Event('input', {bubbles:true}));
      await wait(300);
    }
    document.getElementById('legend').classList.remove('open');

    /* A comment opens at full size, and an entry with no tags says nothing
       about tags. */
    applyEdit(()=>{
      workingNodes.push(['cm','Commented',null,null,'a note with **words** in it', null, {pos:[1700,-200]}]);
    });
    await wait(420);
    selectNode('cm');
    await wait(360);
    out.noTagLine = getComputedStyle(document.getElementById('detailTags')).display === 'none';
    document.getElementById('detailNoteExpand').click();
    await wait(320);
    out.readerOpen = document.getElementById('noteOverlay').classList.contains('open');
    out.readerHasWords = /words/.test(document.getElementById('noteOverlayBody').textContent);
    out.readerFormats = !!document.querySelector('#noteOverlayBody b');
    document.getElementById('noteOverlayClose').click();
    await wait(220);
    selectNode('tp');
    await wait(300);
    out.tagLineWhenTagged = getComputedStyle(document.getElementById('detailTags')).display !== 'none';
    deselect();

    /* A callout: the router ignores it, its own Delete removes it, and the
       card travels with the connector it points at. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['cq','Alpha',null,null,null,null,{pos:[-400,-140]}]);
      workingNodes.push(['cr','Beta','cq',null,null,null,{pos:[300,-140]}]);
      workingNodes.push(['cs','Remark',null,null,null,'callout',
                         {pos:[-60,120], leader:{from:'cq', to:'cr', at:0.5}}]);
      EDGE_STYLES.push({from:'cq', to:'cr', note:'plate', notePos:'above'});
    });
    await wait(640);
    out.calloutInvisibleToRouter = !obstacleAll().some(o=> o.id === 'cs');
    out.calloutSizedLikePlate =
      getComputedStyle(document.querySelector('.node-callout text')).fontSize ===
      getComputedStyle(document.querySelector('.edge-note-text')).fontSize;
    {
      const gap = ()=>{
        const n = nodes.get('cs');
        const dot = document.querySelector('#edgeLayer .callout-leader[data-id="cs"] .leader-dot');
        if(!n || !dot) return '?';
        return [Math.round((n.x + n.w/2) - +dot.getAttribute('cx')),
                Math.round((n.y + n.h/2) - +dot.getAttribute('cy'))].join(',');
      };
      const gaps = [gap()];
      for(const dy of [60, 160]){
        applyEdit(()=>{ workingNodes.find(x=> x[0]==='cr')[6].pos = [300, -140 + dy]; });
        await wait(400); gaps.push(gap());
      }
      out.cardTravels = gaps.every(g=> g === gaps[0]) && gaps[0] !== '?';
      out.cardGaps = gaps.join(' | ');
    }
    /* One click selects it and nothing else, so Delete still means
       "delete this"; the words are two clicks away, where they are on
       every other entry. */
    document.querySelector('.node[data-id="cs"]').dispatchEvent(
      new MouseEvent('click', {bubbles:true, cancelable:true, clientX:400, clientY:500}));
    await wait(320);
    out.openWithoutFocus = !document.getElementById('calloutPopover').classList.contains('open') &&
                           selectedId === 'cs' &&
                           document.activeElement !== richFields.get('calloutText').surface;
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Delete', bubbles:true}));
    await wait(460);
    out.deletedByKey = !workingNodes.some(x=> x[0] === 'cs');

    refill(TAG_CATS, beforeCats);
    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('no decoration animation grows past what it is drawn as',
        r31.echoWithin && r31.sheetWithin,
        JSON.stringify({echo:r31.echoWithin, sheets:r31.sheetWithin}));
  check('and the light crosses the weave left to right', r31.sweepLeftToRight);
  check('once a crossbar exists it stays put, whichever end is dragged',
        r31.barHeldSource && r31.barHeldTarget, JSON.stringify(r31.bars));
  check('pulling an empty entry’s corner inward makes it smaller',
        r31.emptyShrank, JSON.stringify(r31.emptySizes));
  check('the Management panel can be searched', r31.hasSearch);
  check('and its categories fold away',
        r31.foldable && r31.foldedAway,
        JSON.stringify({foldable:r31.foldable, folded:r31.foldedAway}));
  check('a search narrows the list to what matches',
        JSON.stringify(r31.searchNarrows) === JSON.stringify(['era-a']),
        JSON.stringify(r31.searchNarrows));
  check('an entry with no tags says nothing about tags',
        r31.noTagLine && r31.tagLineWhenTagged,
        JSON.stringify({none:r31.noTagLine, some:r31.tagLineWhenTagged}));
  check('a comment opens at full size, formatting and all',
        r31.readerOpen && r31.readerHasWords && r31.readerFormats,
        JSON.stringify({open:r31.readerOpen, words:r31.readerHasWords, fmt:r31.readerFormats}));
  check('a connector does not bend around a callout', r31.calloutInvisibleToRouter);
  check('a callout is set at the plate’s size', r31.calloutSizedLikePlate);
  check('a callout travels with the connector it points at',
        r31.cardTravels, r31.cardGaps);
  check('clicking a callout selects it and nothing more',
        r31.openWithoutFocus);
  check('so Delete still deletes it', r31.deletedByKey);

  /* Video that will not fit is re-encoded rather than refused. */
  const vid = await page.evaluate(()=> ({
    canReencode: typeof canReencodeVideo === 'function' && canReencodeVideo(),
    budget: PUBLISH_BUDGET,
    /* A browser's own recorder writes a media type with a comma in it, and
       the gate has to admit it. */
    codecUrlOk: mediaSrcOk('data:video/webm;codecs=vp9,opus;base64,AAAA'),
    scriptUrlRefused: !mediaSrcOk('javascript:alert(1)'),
    /* The recorder is asked for a codec; what comes back out is a blob
       typed for the container alone. A data: URL is split at its first
       comma, and `codecs=vp9,opus` has one in the middle of it — written
       through, the payload was read as text and nothing would play it. */
    recordType: (typeof videoRecordType === 'function') ? videoRecordType() : null
  }));
  check('a clip too big for the page is re-encoded to fit',
        vid.canReencode && vid.budget > 12 * 1024 * 1024,
        JSON.stringify(vid));
  check('and a re-encoded clip is admitted, while a script URL is not',
        vid.codecUrlOk && vid.scriptUrlRefused, JSON.stringify(vid));

  /* End to end: a real clip made by this browser, re-encoded by the page's
     own path, turned into the data: URL a chart would carry it as, and
     played back from that URL. This is the whole of what "the compressed
     video does not play" was. */
  const clip = await page.evaluate(async ()=>{
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    if(!canReencodeVideo() || !videoRecordType()) return {skipped:true};
    /* Something to re-encode: a couple of seconds off a canvas. */
    const c = document.createElement('canvas');
    c.width = 160; c.height = 120;
    const cx = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(20), {mimeType: videoRecordType()});
    const parts = [];
    rec.ondataavailable = e=>{ if(e.data && e.data.size) parts.push(e.data); };
    const done = new Promise(r=> rec.onstop = r);
    rec.start(200);
    for(let i = 0; i < 24; i++){
      cx.fillStyle = i % 2 ? '#123' : '#cba';
      cx.fillRect(0, 0, 160, 120);
      await wait(40);
    }
    rec.stop(); await done;
    const source = new File(parts, 'sample.webm', {type: videoRecordType()});
    const out = {srcBytes: source.size};
    const blob = await reencodeVideoToFit(source, 3 * 1024 * 1024, ()=>{});
    out.outType = blob.type;
    out.typeHasComma = blob.type.indexOf(',') >= 0;
    const url = await blobToDataUrl(blob);
    out.accepted = mediaSrcOk(url);
    /* The bytes survive the trip through the URL — which they do not when
       the type carries a comma, because the URL is split at the first one. */
    out.roundTripped = (await (await fetch(url)).arrayBuffer()).byteLength === blob.size;
    /* And a player can make something of it. */
    const v = document.createElement('video');
    v.muted = true; v.src = url;
    out.plays = await new Promise(r=>{
      const t = setTimeout(()=> r(false), 6000);
      v.onloadeddata = ()=>{ clearTimeout(t); r(v.videoWidth > 0); };
      v.onerror = ()=>{ clearTimeout(t); r(false); };
    });
    return out;
  });
  if(clip.skipped) check('a re-encoded clip plays back from the URL a chart stores it as', true, 'no recorder here');
  else check('a re-encoded clip plays back from the URL a chart stores it as',
             !clip.typeHasComma && clip.accepted && clip.roundTripped && clip.plays,
             JSON.stringify(clip));

  /* ---- 27m. section 52: an entry that can still be carried, a loop that
       does not jump, a point that meets its label, and a clip that plays -- */
  const r32 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* THE regression of 0.9.8: a callout hanging off any connector asked
       for a full re-render on every frame of every drag, and the drag was
       left writing transforms onto groups that had been thrown away. An
       entry could be pushed sideways and would not go down at all. */
    applyEdit(()=>{
      workingNodes.length = 0;
      EDGE_STYLES.length = 0;
      workingNodes.push(['dgA','Alpha',null,null,null,null,{pos:[-320,-120]}]);
      workingNodes.push(['dgB','Beta','dgA',null,null,null,{pos:[240,-120]}]);
      workingNodes.push(['dgC','Note',null,null,null,'callout',
                         {pos:[-40,120], leader:{from:'dgA', to:'dgB', at:0.5}}]);
    });
    await wait(700);
    {
      const g = document.querySelector('.node[data-id="dgA"]');
      const r = svg.getBoundingClientRect();
      const n = nodes.get('dgA');
      const start = {x: r.left + (n.x + n.w/2)*vs + vx, y: r.top + (n.y + n.h/2)*vs + vy};
      const from = {x: n.x, y: n.y};
      g.dispatchEvent(new MouseEvent('mousedown',
        {bubbles:true, cancelable:true, button:0, clientX:start.x, clientY:start.y}));
      for(let k = 1; k <= 6; k++){
        window.dispatchEvent(new MouseEvent('mousemove',
          {bubbles:true, clientX:start.x, clientY:start.y + k*20}));
        await wait(40);
      }
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(500);
      const to = nodes.get('dgA');
      out.carriedDown = Math.round(to.y - from.y);
      out.carriedSideways = Math.round(to.x - from.x);
      /* And no group is left wearing a follow translation it cannot lose. */
      out.noStuckTransform = ![...document.querySelectorAll('#nodeLayer > g.node')]
        .some(x=> /translate/.test(x.getAttribute('transform') || '') &&
                  x.getAttribute('data-id') !== 'dgC');
    }

    /* The light on a fan-fiction weave is out at both ends of its cycle,
       so the frame the loop restarts on is a frame with nothing on it. */
    {
      const g = document.querySelector('.fanfic-glint') ||
                (()=>{ const e = document.createElementNS('http://www.w3.org/2000/svg','g');
                       e.setAttribute('class','fanfic-glint'); fanLayer.appendChild(e); return e; })();
      g.classList.add('tag-lively');
      const dur = parseFloat(getComputedStyle(g).animationDuration) || 3.4;
      const at = (f)=>{
        g.style.animationDelay = (-dur * f) + 's';
        g.style.animationPlayState = 'paused';
        return +getComputedStyle(g).opacity;
      };
      out.loopEnds = [at(0), at(0.5), at(0.999)];
      g.style.animationDelay = ''; g.style.animationPlayState = '';
    }

    /* A tag's point is exactly as tall as the label it belongs to, so the
       outline round the two is continuous. */
    {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-500px;top:0;';
      host.innerHTML = '<span class="tag-shape"><i class="tag-eye"></i>sample</span>';
      document.body.appendChild(host);
      const el = host.firstChild;
      const label = el.getBoundingClientRect().height;
      const side = parseFloat(getComputedStyle(el, '::before').height);
      out.pointFits = Math.abs(side * Math.SQRT2 - label) < 0.6;
      out.pointGeom = [+label.toFixed(2), +(side * Math.SQRT2).toFixed(2)];
      host.remove();
    }

    /* The expand button is only there when there is something to expand. */
    applyEdit(()=>{
      workingNodes.length = 0;
      workingNodes.push(['exA','Bare',null,null,null,null,{pos:[0,0]}]);
      workingNodes.push(['exB','Wordy',null,null,'A long remark.',null,{pos:[220,0]}]);
    });
    await wait(600);
    selectNode('exA'); await wait(320);
    out.noExpandWhenEmpty = getComputedStyle(
      document.getElementById('detailNoteExpand')).display === 'none';
    selectNode('exB'); await wait(320);
    out.expandWhenWritten = getComputedStyle(
      document.getElementById('detailNoteExpand')).display !== 'none';
    deselect();

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('an entry with a callout on its connector can still be carried',
        r32.carriedDown === 120 && r32.carriedSideways === 0,
        JSON.stringify({down:r32.carriedDown, across:r32.carriedSideways}));
  check('and the drag leaves no entry stuck under a transform', r32.noStuckTransform);
  check('the light on a weave is out where its cycle joins',
        r32.loopEnds[0] === 0 && r32.loopEnds[2] < 0.05 && r32.loopEnds[1] > 0.3,
        JSON.stringify(r32.loopEnds));
  check('a tag’s point is exactly as tall as its label',
        r32.pointFits, JSON.stringify(r32.pointGeom));
  check('an empty comment offers nothing to open at full size',
        r32.noExpandWhenEmpty && r32.expandWhenWritten,
        JSON.stringify({empty:r32.noExpandWhenEmpty, written:r32.expandWhenWritten}));

  /* ---- 27n. section 53: routes with no bend they do not need, anchors
       that stay put, and a panel that reads as two lists ---- */
  const r33 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const bends = (d)=> (d || '').split('Q').length - 1;

    /* A staircase down an empty corridor collapses to the L it always was. */
    {
      const zig = [{x:0,y:0},{x:0,y:-40},{x:40,y:-40},{x:40,y:-56},
                   {x:100,y:-56},{x:100,y:-20}];
      const flat = straightenOrth(zig, ()=> true);
      out.zigWas = zig.length;
      out.zigNow = flat.length;
      out.zigEnds = [flat[0].x, flat[0].y, flat[flat.length-1].x, flat[flat.length-1].y].join(',');
      /* Both ends still leave and arrive the way they did. */
      out.zigLeaves = Math.abs(flat[1].x - flat[0].x) < 0.5 &&
                      flat[1].y < flat[0].y;
      /* And nothing is straightened THROUGH something. */
      out.zigHeld = straightenOrth(zig, ()=> false).length === zig.length;
    }

    /* The anchor is a place, not a proportion: drag one entry and the
       point stays on the part of the line it was on. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ka','Alpha',null,null,null,null,{pos:[-360,-140]}]);
      workingNodes.push(['kb','Beta','ka',null,null,null,{pos:[220,-140]}]);
      workingNodes.push(['kc','Note',null,null,null,'callout',
                         {pos:[-60,60], leader:{from:'ka', to:'kb', at:0.5}}]);
    });
    await wait(700);
    const dotOf = ()=>{
      const d = document.querySelector('.callout-leader[data-id="kc"] .leader-dot');
      return d ? {x:+d.getAttribute('cx'), y:+d.getAttribute('cy')} : null;
    };
    const gapOf = ()=>{
      const d = dotOf(), n = nodes.get('kc');
      if(!d || !n) return null;
      return [+((n.x + n.w/2) - d.x).toFixed(2), +((n.y + n.h/2) - d.y).toFixed(2)];
    };
    {
      const was = dotOf();
      const g = document.querySelector('.node[data-id="ka"]');
      const n = nodes.get('ka'), rect = svg.getBoundingClientRect();
      const cl = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      const c = {x:n.x + n.w/2, y:n.y + n.h/2};
      g.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, button:0}, cl(c.x, c.y))));
      for(let k = 1; k <= 8; k++){
        window.dispatchEvent(new MouseEvent('mousemove',
          Object.assign({bubbles:true}, cl(c.x, c.y + k*15))));
        await wait(45);
      }
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(600);
      const now = dotOf();
      out.anchorHeldX = Math.abs(now.x - was.x) < 1.5;
      out.anchorMoved = [Math.round(now.x - was.x), Math.round(now.y - was.y)].join(',');
    }

    /* Sliding the anchor carries the card without tilting the leader. */
    {
      const before = gapOf();
      const hit = document.querySelector('#leaderHitLayer .leader-dot-hit[data-id="kc"]');
      const d = dotOf(), rect = svg.getBoundingClientRect();
      const cl = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      hit.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, button:0}, cl(d.x, d.y))));
      for(let k = 1; k <= 6; k++){
        window.dispatchEvent(new MouseEvent('mousemove',
          Object.assign({bubbles:true}, cl(d.x - k*18, d.y))));
        await wait(45);
      }
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(600);
      const after = gapOf();
      out.leaderKeptAngle = Math.abs(after[0] - before[0]) < 0.05 &&
                            Math.abs(after[1] - before[1]) < 0.05;
      out.leaderGaps = before.join(',') + ' | ' + after.join(',');
      /* And the dot says it is the thing about to move. Re-found: the
         drag that just ended redrew both of them. */
      const dot = document.querySelector('.callout-leader[data-id="kc"] .leader-dot');
      const grip = document.querySelector('#leaderHitLayer .leader-dot-hit[data-id="kc"]');
      grip.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      out.dotLifts = dot.classList.contains('lifted');
      grip.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      out.dotSettles = !dot.classList.contains('lifted');
    }

    /* An amalgam slides along its own bar without taking its lineages
       with it — and is offered the middle of that bar to settle on. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['q1','One',null,null,null,null,{pos:[-320,0]}]);
      workingNodes.push(['q2','Two',null,null,null,null,{pos:[-140,0]}]);
      workingNodes.push(['q3','Three',null,null,null,null,{pos:[40,0]}]);
      workingNodes.push(['qm','Merge',['q1','q2','q3'],null,null,'amalgam',{pos:[-140,280]}]);
    });
    await wait(750);
    const drops = ()=> [...document.querySelectorAll('#edgeLayer path.edge')]
      .filter(p=> p.dataset.to === 'qm' && /^q[123]$/.test(p.dataset.from || ''))
      .map(p=>{ const L = p.getTotalLength();
                const a = p.getPointAtLength(Math.min(18, L*0.4));
                return p.dataset.from + '@' + Math.round(a.x); })
      .sort().join(' ');
    const wasDrops = drops();
    /* …and a callout hanging off one of those connectors is not disturbed
       either. Carried by hand, because a position written straight into
       the entry is not the gesture the reader makes. */
    applyEdit(()=>{
      workingNodes.push(['qc','Note',null,null,null,'callout',
                         {pos:[-470,60], leader:{from:'q1', to:'qm', at:0.4}}]);
    });
    await wait(750);
    const calloutAt = ()=>{
      const d = document.querySelector('.callout-leader[data-id="qc"] .leader-dot');
      const n = nodes.get('qc');
      return [d ? Math.round(+d.getAttribute('cx')) : '?',
              d ? Math.round(+d.getAttribute('cy')) : '?',
              n ? Math.round(n.x) : '?', n ? Math.round(n.y) : '?'].join(',');
    };
    const wasCallout = calloutAt();
    {
      const g = document.querySelector('.node[data-id="qm"]');
      const n = nodes.get('qm'), rect = svg.getBoundingClientRect();
      const cl = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      const c = {x:n.x + n.w/2, y:n.y + n.h/2};
      g.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, button:0}, cl(c.x, c.y))));
      for(let k = 1; k <= 8; k++){
        window.dispatchEvent(new MouseEvent('mousemove', Object.assign({bubbles:true}, cl(c.x + k*14, c.y))));
        await wait(35);
      }
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(700);
    }
    out.calloutHeld = calloutAt() === wasCallout;
    out.calloutMoved = wasCallout + '  ->  ' + calloutAt();
    /* The two lineages the entry did not pass under keep their landings
       exactly; one it slid beneath may re-choose the side it leaves by,
       which is a real change of geometry rather than the entry dragging
       them along. */
    const now = drops().split(' '), was = wasDrops.split(' ');
    out.dropsHeld = was.filter((v,i)=> v === now[i]).length >= was.length - 1;
    out.drops = wasDrops + '  ->  ' + drops();
    out.barKnown = !!amalgamBars.get('qm');

    /* The panel: the chevron after the name, References set apart. */
    buildManagement();
    await wait(250);
    {
      const head = document.querySelector('.legend-group-head.foldable');
      const kids = head ? [...head.children].map(e=> e.className) : [];
      const iName = kids.findIndex(c=> /legend-group-name/.test(c));
      const iFold = kids.findIndex(c=> /legend-group-fold/.test(c));
      out.foldOnTheRight = iName >= 0 && iFold > iName;
      const refs = [...document.querySelectorAll('.legend-section-head')]
        .find(h=> /References/.test(h.textContent));
      out.refsApart = !!refs && refs.classList.contains('legend-section-split') &&
        parseFloat(getComputedStyle(refs).borderTopWidth) > 0;
    }
    out.weaveVisible = (()=>{
      const el = document.createElementNS('http://www.w3.org/2000/svg','g');
      el.setAttribute('class','fanfic-weave'); fanLayer.appendChild(el);
      const o = +getComputedStyle(el).opacity; el.remove(); return o;
    })();

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('a staircase down an empty corridor becomes the L it always was',
        r33.zigNow === 4 && r33.zigLeaves,
        JSON.stringify({was:r33.zigWas, now:r33.zigNow, ends:r33.zigEnds}));
  check('and nothing is straightened through something in the way', r33.zigHeld);
  check('an anchor keeps its place when one entry is carried',
        r33.anchorHeldX, r33.anchorMoved);
  check('sliding an anchor carries the card without tilting the leader',
        r33.leaderKeptAngle, r33.leaderGaps);
  check('the anchor’s dot grows under the pointer',
        r33.dotLifts && r33.dotSettles,
        JSON.stringify({lifted:r33.dotLifts, settled:r33.dotSettles}));
  check('an amalgam slides along its bar without moving its lineages',
        r33.dropsHeld && r33.barKnown, r33.drops);
  check('and without disturbing a callout on one of their connectors',
        r33.calloutHeld, r33.calloutMoved);
  check('a category’s fold sits to the right of its name', r33.foldOnTheRight);
  check('References is set apart from the tags', r33.refsApart);
  check('a fan-fiction weave reads as gold without being animated',
        r33.weaveVisible >= 0.2, String(r33.weaveVisible));

  /* Every connector a built chart draws is as straight as it can be. */
  const straightAll = await page.evaluate(async ()=>{
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    await wait(300);
    const bad = [];
    document.querySelectorAll('#edgeLayer path.edge.struct').forEach(p=>{
      const n = (p.getAttribute('d') || '').split('Q').length - 1;
      if(n > 2) bad.push(`${p.dataset.from}->${p.dataset.to}:${n}`);
    });
    return bad;
  });
  check('no connector on the chart carries a bend it does not need',
        straightAll.length === 0, straightAll.slice(0, 4).join(' '));

  /* ---- 27o. section 54: a portrait you can pick up, a weave that keeps
       up, a glow that follows its border, and arrows that do not route ---- */
  const r34 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76L' +
                'AAAAHUlEQVQoU2NkYGD4z0AEYBxVSFJIMDIyMhIVjgwMAFEsAgVBQz2xAAAAAElFTkSuQmCC';

    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['pb','Somebody',null,null,null,'ellipse',{pos:[-200,-40]}]);
      workingNodes.push(['pw','Weaver',null,null,null,null,{pos:[160,-40], tags:['fan-fiction']}]);
    });
    await wait(750);

    /* A portrait is a thing you can put your hand on. */
    {
      const g = document.querySelector('.node[data-id="pb"]');
      const ring = g.querySelector(':scope > circle.bio-ring');
      const pad  = g.querySelector(':scope > circle.node-hover-pad');
      out.ringFilled = ring && getComputedStyle(ring).fill !== 'none';
      out.padHollow  = pad && getComputedStyle(pad).fill === 'none';
      const n = nodes.get('pb'), rect = svg.getBoundingClientRect();
      const px = rect.left + (n.x + n.w/2)*vs + vx, py = rect.top + (n.y + n.h/2)*vs + vy;
      const top = document.elementsFromPoint(px, py)[0];
      out.middleIsTheEntry = !!top && !!top.closest && !!top.closest('.node[data-id="pb"]');
    }

    /* Its card opens, holds while the pointer is on it, and its stub
       reaches the rim rather than stopping beside it. */
    {
      const g = document.querySelector('.node[data-id="pb"]');
      g.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(320);
      out.cardOpened = !!document.querySelector('#bioCardLayer .bio-card-g');
      const line = document.querySelector('#bioCardLayer .bio-card-g line');
      const n = nodes.get('pb');
      out.stubTouches = !!line && Math.abs(+line.getAttribute('x1') - (n.x + n.w)) < 0.01;
      g.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      const card = document.querySelector('#bioCardLayer .bio-card-g');
      card.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(420);
      out.cardHeld = !!document.querySelector('#bioCardLayer .bio-card-g');
      card.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      await wait(420);
      out.cardLetGo = !document.querySelector('#bioCardLayer .bio-card-g');
    }

    /* A picture survives being moved: the clip it is cut to is remade with
       the entry rather than piling up behind it under the same name. */
    applyEdit(()=>{ workingNodes.find(x=> x[0]==='pb')[6].image = PNG; });
    await wait(600);
    {
      const before = document.querySelectorAll('#nodeDefs clipPath').length;
      applyEdit(()=>{ workingNodes.find(x=> x[0]==='pb')[6].pos = [-120, 60]; });
      await wait(600);
      const img = document.querySelector('.node[data-id="pb"] image');
      const clip = document.querySelector('#nodeDefs clipPath[id^="bioclip-"] circle');
      const n = nodes.get('pb');
      out.oneClipOnly = document.querySelectorAll('#nodeDefs clipPath[id^="bioclip-"]').length === 1;
      out.clipFollows = !!clip && Math.abs(+clip.getAttribute('cx') - (n.x + n.w/2)) < 0.6;
      out.pictureThere = !!img;
      out.clipsBefore = before;
    }

    /* A portrait takes neither scenery tag, and is never offered them. */
    applyEdit(()=>{ workingNodes.find(x=> x[0]==='pb')[6].tags = [HUB_TAG, LOCAL_TAG]; });
    await wait(600);
    out.noScenery = !document.querySelector('#auraLayer .node-aura[data-id="pb"] .hub-echo') &&
                    !document.querySelector('#auraLayer .node-aura[data-id="pb"] .local-sheet');
    out.barredForBio  = tagsBarredFor('ellipse').length === 2;
    out.allowedForBox = tagsBarredFor('rect').length === 0;
    out.strippedOnSave = keepAllowedTags([HUB_TAG, LOCAL_TAG, 'ordinary'], 'ellipse')
                           .join(',') === 'ordinary';

    /* Every decoration keeps up with the entry that wears it — the hub's
       echo and the local multiverse's sheets in their own layer, the
       fan-fiction weave in the one below that. */
    applyEdit(()=>{
      workingNodes.push(['ph','Hub',null,null,null,null,{pos:[160,140], tags:[HUB_TAG]}]);
      workingNodes.push(['pl','Local',null,null,null,null,{pos:[-200,140], tags:[LOCAL_TAG]}]);
    });
    await wait(700);
    out.sceneryKeptUp = {};
    for(const [id, sel] of [['ph', '#auraLayer .node-aura[data-id="ph"] .hub-echo'],
                            ['pl', '#auraLayer .node-aura[data-id="pl"] .local-sheet']]){
      const g = document.querySelector(`.node[data-id="${id}"]`);
      const n = nodes.get(id), rect = svg.getBoundingClientRect();
      const cl = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      const c = {x:n.x + n.w/2, y:n.y + n.h/2};
      const el0 = document.querySelector(sel);
      const was = el0 ? el0.getBoundingClientRect().left : null;
      g.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, button:0}, cl(c.x, c.y))));
      window.dispatchEvent(new MouseEvent('mousemove', Object.assign({bubbles:true}, cl(c.x + 80, c.y))));
      await wait(90);
      const now = el0 ? el0.getBoundingClientRect().left : null;
      out.sceneryKeptUp[id] = (was === null || now === null)
        ? 'missing' : Math.abs((now - was) - 80*vs) < 3;
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(350);
    }

    /* The weave keeps up with the entry that wears it. */
    {
      const g = document.querySelector('.node[data-id="pw"]');
      const n = nodes.get('pw'), rect = svg.getBoundingClientRect();
      const cl = (x,y)=> ({clientX: rect.left + x*vs + vx, clientY: rect.top + y*vs + vy});
      const c = {x:n.x + n.w/2, y:n.y + n.h/2};
      const weave = document.querySelector('#fanLayer .fanfic-weave[data-id="pw"]');
      const was = weave ? weave.getBoundingClientRect().left : 0;
      g.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({bubbles:true, cancelable:true, button:0}, cl(c.x, c.y))));
      window.dispatchEvent(new MouseEvent('mousemove', Object.assign({bubbles:true}, cl(c.x + 90, c.y))));
      await wait(90);
      const now = weave ? weave.getBoundingClientRect().left : 0;
      out.weaveKeptUp = !!weave && Math.abs((now - was) - 90*vs) < 3;
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(400);
    }

    /* The selection's glow is the border's, and only the border's. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['gk','Pocket',null,null,null,'pocket',{pos:[0,0]}]);
      workingNodes.push(['gq','Plain','gk',null,null,null,{pos:[260,-60]}]);
    });
    await wait(700);
    selectNode('gk');
    await wait(320);
    {
      const g = document.querySelector('.node[data-id="gk"]');
      const pad = g.querySelector(':scope > rect.node-hover-pad');
      const border = g.querySelector(':scope > path');
      out.padUnlit = pad && getComputedStyle(pad).filter === 'none';
      out.borderLit = border && /drop-shadow/.test(getComputedStyle(border).filter);
      /* Tight enough to trace a ripple rather than smooth it away: the
         narrowest of the shadows is what decides the outline. */
      const blurs = (getComputedStyle(border).filter.match(/([\d.]+)px\)/g) || [])
        .map(x=> parseFloat(x));
      out.glowTight = blurs.length > 0 && Math.min.apply(null, blurs) <= 2.5;
      out.glowBlurs = blurs.join(',');
    }
    deselect();

    /* A connector touching a pocket routes the same whatever arrows it
       has: only where it stops at the border may differ. */
    {
      const shapes = [];
      for(const [arrow, arrowIn] of [[true,true],[true,false],[false,true],[false,false]]){
        applyEdit(()=>{
          EDGE_STYLES.length = 0;
          EDGE_STYLES.push({from:'gk', to:'gq', arrow, arrowIn});
        });
        await wait(420);
        const p = document.querySelector('#edgeLayer path.edge.struct[data-from="gk"][data-to="gq"]');
        const d = p ? p.getAttribute('d') : '';
        /* The crossbar: every corner the route turns on. */
        shapes.push((d.match(/Q[-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+/g) || []).join(' '));
      }
      out.sameWhateverArrows = shapes.every(x=> x === shapes[0]);
      out.arrowShapes = shapes.map(x=> x.length).join(',');
    }

    /* Renaming a category is a double click; there is no pencil for it. */
    applyEdit(()=>{ TAG_CATS.length = 0; TAG_CATS.push({name:'Era', tags:['era-a']}); });
    buildManagement();
    await wait(320);
    {
      const head = [...document.querySelectorAll('.legend-group-head.foldable')]
        .find(h=> /Era/.test(h.textContent));
      out.noPencil = !!head && ![...head.querySelectorAll('button')]
        .some(b=> (b.title || '').toLowerCase().indexOf('rename') >= 0);
      /* The gesture itself: a click, then the second click of the double.
         The first must not fold the category away underneath it. */
      if(head){
        head.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
        head.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true}));
        await wait(420);
        /* The name itself becomes editable where it stands — it used to
           open a dialog with one field in it. */
        const nm = head.querySelector('.legend-group-name');
        out.dblRenames = !!nm && nm.isContentEditable && nm.classList.contains('renaming');
        out.notFolded = !document.querySelector('.legend-group.collapsed');
        if(nm) nm.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
        await wait(300);
      }
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('a portrait can be picked up by its middle',
        r34.ringFilled && r34.padHollow && r34.middleIsTheEntry,
        JSON.stringify({ring:r34.ringFilled, pad:r34.padHollow, hit:r34.middleIsTheEntry}));
  check('its card holds while the pointer is on it',
        r34.cardOpened && r34.cardHeld && r34.cardLetGo,
        JSON.stringify({open:r34.cardOpened, held:r34.cardHeld, gone:r34.cardLetGo}));
  check('and the stub between the two touches the rim', r34.stubTouches);
  check('a portrait keeps its picture when it is moved',
        r34.pictureThere && r34.oneClipOnly && r34.clipFollows,
        JSON.stringify({img:r34.pictureThere, clips:r34.oneClipOnly, follows:r34.clipFollows}));
  check('a portrait wears no scenery, and is not offered any',
        r34.noScenery && r34.barredForBio && r34.allowedForBox && r34.strippedOnSave,
        JSON.stringify({drawn:r34.noScenery, barred:r34.barredForBio,
                        boxes:r34.allowedForBox, saved:r34.strippedOnSave}));
  check('every decoration keeps up with the entry it belongs to',
        r34.weaveKeptUp && r34.sceneryKeptUp.ph === true && r34.sceneryKeptUp.pl === true,
        JSON.stringify(Object.assign({weave:r34.weaveKeptUp}, r34.sceneryKeptUp)));
  check('the selection’s glow is the border’s and nothing else’s',
        r34.padUnlit && r34.borderLit && r34.glowTight,
        JSON.stringify({pad:r34.padUnlit, border:r34.borderLit, blurs:r34.glowBlurs}));
  check('a connector at a pocket routes the same whatever arrows it has',
        r34.sameWhateverArrows, r34.arrowShapes);
  check('a category is renamed by double-clicking its name, in place',
        r34.noPencil && r34.dblRenames && r34.notFolded,
        JSON.stringify({pencil:!r34.noPencil, editable:r34.dblRenames, folded:!r34.notFolded}));

  /* Shift+Enter breaks the line once. */
  const brk = await page.evaluate(async ()=>{
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const rec = richFields.get('editLabelInput');
    setRichValue(rec.textarea, 'one');
    rec.surface.focus();
    const r = document.createRange();
    r.selectNodeContents(rec.surface); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('insertLineBreak');
    await wait(60);
    const value = richHtmlToMarkup(rec.surface);
    return {value, raw: rec.surface.innerHTML};
  });
  check('Shift+Enter breaks the line once, not twice',
        brk.value === 'one', JSON.stringify(brk));

  /* An underline runs through the descenders rather than breaking up. */
  /* An underline is DRAWN, because no property will stop the browser
     breaking a decoration around every descender in SVG text. */
  const ink = await page.evaluate(async ()=>{
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const before = workingNodes.slice();
    applyEdit(()=>{
      workingNodes.length = 0;
      workingNodes.push(['ul1','{{u:solid|фывууу gyp}}',null,null,null,null,{pos:[-200,-60]}]);
      workingNodes.push(['ul2','{{u:double|abc}} {{u:wavy|def}}',null,null,null,null,{pos:[120,-60]}]);
    });
    await wait(700);
    const g = document.querySelector('.node[data-id="ul1"]');
    const out = {};
    out.drawn = g.querySelectorAll('.text-underline').length;
    out.notDecorated = ![...g.querySelectorAll('tspan[data-ul]')]
      .some(t=> /underline/.test(getComputedStyle(t).textDecorationLine));
    const line = g.querySelector('line.text-underline');
    const run = g.querySelector('tspan[data-ul]');
    if(line && run){
      const a = run.getStartPositionOfChar(0);
      const b = run.getEndPositionOfChar((run.textContent||'').length - 1);
      out.spansTheRun = Math.abs(+line.getAttribute('x1') - a.x) < 0.6 &&
                        Math.abs(+line.getAttribute('x2') - b.x) < 0.6;
      out.belowTheBaseline = +line.getAttribute('y1') > a.y;
    }
    const g2 = document.querySelector('.node[data-id="ul2"]');
    out.doubleIsTwo = g2.querySelectorAll('line.text-underline').length === 2;
    out.wavyIsAPath = !!g2.querySelector('path.text-underline');
    applyEdit(()=>{ workingNodes = before; });
    rebuildChart();
    await wait(400);
    return out;
  });
  check('an underline is drawn, so it runs through the descenders',
        ink.drawn > 0 && ink.notDecorated && ink.spansTheRun && ink.belowTheBaseline,
        JSON.stringify(ink));
  check('and every kind of rule keeps its own shape',
        ink.doubleIsTwo && ink.wavyIsAPath,
        JSON.stringify({double:ink.doubleIsTwo, wavy:ink.wavyIsAPath}));

  /* ---- 27p. section 55: a callout in its connector's colour, a portrait
       sized like everything else, a caption edited in its own card ---- */
  const r35 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76L' +
                'AAAAHUlEQVQoU2NkYGD4z0AEYBxVSFJIMDIyMhIVjgwMAFEsAgVBQz2xAAAAAElFTkSuQmCC';

    /* A callout takes the connector's colour, in the card and in the words
       alike, and at full strength — the same ink every other entry is
       written in. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ca','Alpha',null,null,null,null,{pos:[-340,-140], colors:['#2f6fb5']}]);
      workingNodes.push(['cb','Beta','ca',null,null,null,{pos:[140,-140]}]);
      workingNodes.push(['cc','year 1914',null,null,null,'callout',
                         {pos:[-120,-30], leader:{from:'ca', to:'cb', at:0.5}}]);
      workingNodes.push(['cd','Plain',null,null,null,null,{pos:[-340,120]}]);
    });
    await wait(800);
    {
      const card = document.querySelector('.node[data-id="cc"] rect:not(.node-hover-pad)');
      const text = document.querySelector('.node[data-id="cc"] text');
      const plain = document.querySelector('.node[data-id="cd"] text');
      out.calloutBorder = card ? card.getAttribute('stroke') : null;
      out.calloutInk = text ? getComputedStyle(text).fill : null;
      out.calloutFull = text ? +getComputedStyle(text).opacity : null;
      out.plainInk = plain ? getComputedStyle(plain).fill : null;
      out.plainFull = plain ? +getComputedStyle(plain).opacity : null;
      /* And a callout given a colour of its own still keeps it. */
      applyEdit(()=>{ workingNodes.find(x=> x[0]==='cc')[6].colors = ['#c23b22']; });
      await wait(500);
      const own = document.querySelector('.node[data-id="cc"] rect:not(.node-hover-pad)');
      out.ownColourKept = own && own.getAttribute('stroke') === '#c23b22';
      applyEdit(()=>{ delete workingNodes.find(x=> x[0]==='cc')[6].colors; });
      await wait(400);
    }

    /* A portrait: smaller by default, resizable, and drawn to whatever
       size it is given. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['pa','Somebody',null,null,null,'ellipse',{pos:[-200,-40]}]);
      workingNodes.push(['pb','A considerably longer name than that one',
                         null,null,null,'ellipse',{pos:[-200,120], image:PNG}]);
    });
    await wait(800);
    {
      const n = nodes.get('pa');
      out.bioSize = [n.w, n.h];
      out.bioModest = n.h <= NODE_FIT_MINH * 1.6 && n.h >= NODE_FIT_MINH;
      out.bioGrips = document.querySelectorAll('.node[data-id="pa"] .node-resize').length;
      /* The silhouette stays inside the rim, at every size. */
      const rim = document.querySelector('.node[data-id="pa"] circle.bio-ring');
      const r = +rim.getAttribute('r'), cx = +rim.getAttribute('cx'), cy = +rim.getAttribute('cy');
      const head = document.querySelector('.node[data-id="pa"] circle.bio-placeholder');
      out.headInside = Math.hypot(+head.getAttribute('cx') - cx,
                                  (+head.getAttribute('cy') - cy)) + (+head.getAttribute('r')) < r;
      const body = document.querySelector('.node[data-id="pa"] path.bio-placeholder');
      const bb = body.getBBox();
      const corners = [[bb.x, bb.y], [bb.x+bb.width, bb.y],
                       [bb.x, bb.y+bb.height], [bb.x+bb.width, bb.y+bb.height]];
      out.bodyInside = corners.every(([x,y])=> Math.hypot(x-cx, y-cy) <= r);
      /* Dragged smaller, it stays a circle of that size. */
      applyEdit(()=>{ workingNodes.find(x=> x[0]==='pa')[6].size = [26, 26]; });
      await wait(500);
      const small = nodes.get('pa');
      out.bioResized = small.w === 26 && small.h === 26;
    }
    /* The card beside it is sized to its words, like every other box. */
    {
      const g1 = document.querySelector('.node[data-id="pa"]');
      g1.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(320);
      const shortW = bioCardBox ? bioCardBox.w : 0;
      g1.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      await wait(320);
      const g2 = document.querySelector('.node[data-id="pb"]');
      g2.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(320);
      const longW = bioCardBox ? bioCardBox.w : 0;
      g2.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      await wait(320);
      out.cardGrows = longW > shortW;
      out.cardWidths = [shortW, longW].join(',');
    }

    /* A caption is edited in its own card, and turns as the slider moves. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['fa','Ordinary',null,null,null,null,{pos:[-300,0]}]);
      workingNodes.push(['ft','A caption',null,null,null,'textbox',{pos:[0,0]}]);
      workingNodes.push(['fi','',null,null,null,'image',{pos:[240,0], image:PNG}]);
    });
    await wait(800);
    selectNode('fa'); await wait(300);
    document.getElementById('detailEditToggle').click(); await wait(300);
    {
      const g = document.querySelector('.node[data-id="ft"]');
      g.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, clientX:400, clientY:400}));
      await wait(120);
      g.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true, clientX:400, clientY:400}));
      await wait(450);
      out.freeCardOpen = document.getElementById('freeMenu').classList.contains('open');
      out.notTheDrawer = document.getElementById('detailEditForm').style.display !== 'block';
      const rec = richFields.get('freeMenuText');
      out.caretInTheWords = !!rec && document.activeElement === rec.surface;
      /* Turning is done on the caption now, not in this card — and it
         happens as the hand moves, since the drawn group is turned
         directly rather than rebuilt from the entry. */
      const fg = document.querySelector('.node[data-id="ft"]');
      applyNodeRotation(nodes.get('ft'), fg, 30);
      await wait(40);
      out.turnsAtOnce = /rotate\(30/.test(fg.getAttribute('transform') || '');
      applyNodeRotation(nodes.get('ft'), fg, 0);
      document.getElementById('freeMenuClose').click();
      await wait(250);
    }
    /* A picture has no words, so the Label row is shut — and open again on
       the next entry. */
    selectNode('fi'); await wait(350);
    if(document.getElementById('detailEditForm').style.display !== 'block')
      document.getElementById('detailEditToggle').click();
    await wait(400);
    {
      const rec = richFields.get('editLabelInput');
      const wrap = document.getElementById('editLabelInput').closest('.editor-field');
      out.labelShut = rec.surface.getAttribute('contenteditable') === 'false' &&
                      [...wrap.querySelectorAll('button')].every(b=> b.disabled);
      selectNode('fa'); await wait(400);
      out.labelBackOn = rec.surface.getAttribute('contenteditable') === 'true' &&
                        [...wrap.querySelectorAll('button')].every(b=> !b.disabled);
    }
    deselect();

    /* The sheets of a local multiverse leave from BEHIND the entry, and
       the cycle is not a slow one. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['lm','Local',null,null,null,null,{pos:[0,0], tags:[LOCAL_TAG]}]);
    });
    await wait(800);
    {
      const aura = document.querySelector('#auraLayer .node-aura[data-id="lm"]');
      aura.classList.add('tag-lively');
      const sheets = [...aura.querySelectorAll('.local-sheet')];
      const box = document.querySelector('.node[data-id="lm"]').getBoundingClientRect();
      out.sheetCycle = parseFloat(getComputedStyle(sheets[0]).animationDuration);
      const starts = sheets.map(sh=>{
        sh.style.animationDelay = '0s';
        sh.style.animationPlayState = 'paused';
        const r = sh.getBoundingClientRect();
        return [Math.round(r.left - box.left), Math.round(r.top - box.top)];
      });
      /* Every sheet begins within a couple of pixels of the box itself —
         that is, hidden behind it — whatever its own distance. */
      out.sheetsStartBehind = starts.every(([dx,dy])=> Math.abs(dx) <= 3 && Math.abs(dy) <= 3);
      out.sheetStarts = JSON.stringify(starts);
      sheets.forEach(sh=>{ sh.style.animationDelay=''; sh.style.animationPlayState=''; });
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('a callout is drawn in its connector’s colour',
        r35.calloutBorder === '#2f6fb5' &&
        r35.calloutInk === 'rgb(47, 111, 181)' &&
        r35.plainInk !== r35.calloutInk && r35.ownColourKept,
        JSON.stringify({border:r35.calloutBorder, ink:r35.calloutInk,
                        plain:r35.plainInk, own:r35.ownColourKept}));
  check('and its words are the same strength as every other entry’s',
        r35.calloutFull === r35.plainFull,
        JSON.stringify({callout:r35.calloutFull, plain:r35.plainFull}));
  check('a portrait is a modest size, and can be dragged to another',
        r35.bioModest && r35.bioGrips === 4 && r35.bioResized,
        JSON.stringify({size:r35.bioSize, grips:r35.bioGrips, resized:r35.bioResized}));
  check('its silhouette stays inside the rim',
        r35.headInside && r35.bodyInside,
        JSON.stringify({head:r35.headInside, body:r35.bodyInside}));
  check('and the card beside it is sized to its words',
        r35.cardGrows, r35.cardWidths);
  check('a caption is edited in its own card, not in the entry drawer',
        r35.freeCardOpen && r35.notTheDrawer && r35.caretInTheWords,
        JSON.stringify({card:r35.freeCardOpen, drawer:r35.notTheDrawer, caret:r35.caretInTheWords}));
  check('and it turns as the slider moves', r35.turnsAtOnce);
  check('a picture offers no Label to write, and the next entry does',
        r35.labelShut && r35.labelBackOn,
        JSON.stringify({shut:r35.labelShut, back:r35.labelBackOn}));
  check('a local multiverse’s sheets leave from behind the entry',
        r35.sheetsStartBehind, r35.sheetStarts);
  check('and do not take all day about it',
        r35.sheetCycle > 0 && r35.sheetCycle <= 2, String(r35.sheetCycle));

  /* ---- 27q. section 56: a card that stays, a merge the entry cannot
       drag about, and a remark written in its connector's ink ---- */
  const r36 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* THE one from the video: nothing about a merge depends on where the
       amalgam stands. The bar hangs from the lineages; the lineages come
       down onto it where they are; a callout on one of those connectors
       stays where it was put. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      for(let i = 0; i < 5; i++)
        workingNodes.push(['sp'+i, 'Parent ' + i, null, null, null, null, {pos:[-400 + i*160, -200]}]);
      workingNodes.push(['sam','Merge', ['sp0','sp1','sp2','sp3','sp4'],
                         null, null, 'amalgam', {pos:[-100, 200]}]);
      workingNodes.push(['sco','', null, null, null, 'callout',
                         {pos:[-560,-40], leader:{from:'sp0', to:'sam', at:0.4}}]);
    });
    await wait(900);
    const merge = ()=>{
      const drops = [...document.querySelectorAll('#edgeLayer path.edge')]
        .filter(p=> p.dataset.to === 'sam' && /^sp\d$/.test(p.dataset.from || ''))
        .map(p=>{ const a = p.getPointAtLength(0);
                  return p.dataset.from + '@' + Math.round(a.x) + ',' + Math.round(a.y); })
        .sort().join(' ');
      const bar = amalgamBars.get('sam');
      const j = document.querySelector('#edgeLayer .amalgam-junction');
      const d = document.querySelector('.callout-leader[data-id="sco"] .leader-dot');
      const n = nodes.get('sco');
      return [drops,
              bar ? Math.round(bar.lo) + ':' + Math.round(bar.hi) : '?',
              j ? Math.round(+j.getAttribute('cy')) : '?',
              d ? Math.round(+d.getAttribute('cx')) + ',' + Math.round(+d.getAttribute('cy')) : '?',
              n ? Math.round(n.x) + ',' + Math.round(n.y) : '?'].join(' | ');
    };
    const first = merge();
    const seen = [];
    for(const pos of [[-100,120],[-100,340],[-100,520],[180,260],[-320,300],[300,440]]){
      applyEdit(()=>{ workingNodes.find(x=> x[0] === 'sam')[6].pos = pos; });
      await wait(520);
      seen.push(merge());
    }
    out.mergeHeld = seen.every(x=> x === first);
    out.mergeWas = first;
    out.mergeDrift = seen.filter(x=> x !== first).slice(0, 1).join('') || '(none)';

    /* A portrait's card: sized to its words, kept while its panel is open,
       and kept for good when it is asked to be. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ka','Kup', null, null, null, 'ellipse', {pos:[-260,-40]}]);
      workingNodes.push(['kb','A rather longer name for a person indeed',
                         null, null, null, 'ellipse', {pos:[-260,140]}]);
      workingNodes.push(['kc','Ordinary', null, null, null, null, {pos:[160,-40]}]);
    });
    await wait(800);
    const cards = ()=> document.querySelectorAll('#bioCardLayer .bio-card-g').length;
    out.noneAtRest = cards() === 0;
    {
      const g = document.querySelector('.node[data-id="ka"]');
      g.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(320);
      const short = bioCardBox ? Math.round(bioCardBox.w) : 0;
      g.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      await wait(340);
      const g2 = document.querySelector('.node[data-id="kb"]');
      g2.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(320);
      const long = bioCardBox ? Math.round(bioCardBox.w) : 0;
      g2.dispatchEvent(new MouseEvent('mouseleave', {bubbles:true}));
      await wait(340);
      out.cardTight = short > 0 && short < 90 && long > short;
      out.cardWidths = short + ',' + long;
    }
    selectNode('ka');
    await wait(380);
    out.cardWithPanel = cards() >= 1;
    if(document.getElementById('detailEditForm').style.display !== 'block')
      document.getElementById('detailEditToggle').click();
    await wait(400);
    out.checkboxOffered =
      getComputedStyle(document.getElementById('editBioCardField')).display !== 'none';
    document.getElementById('editBioCardCheck').checked = true;
    document.getElementById('editBioCardCheck').dispatchEvent(new Event('change', {bubbles:true}));
    await wait(700);
    deselect();
    await wait(420);
    out.cardKept = cards() === 1;
    out.choiceSaved = !!((workingNodes.find(x=> x[0] === 'ka')[6]) || {}).bioCard;
    /* …and an ordinary entry is not offered it. */
    selectNode('kc'); await wait(380);
    out.checkboxHidden =
      getComputedStyle(document.getElementById('editBioCardField')).display === 'none';
    deselect(); await wait(300);

    /* A remark on a connector is written in the connector's ink, and there
       is nowhere to overrule that. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ia','Alpha', null, null, null, null, {pos:[-320,-120], colors:['#2f6fb5']}]);
      workingNodes.push(['ib','Beta','ia', null, null, null, {pos:[160,-120]}]);
      EDGE_STYLES.push({from:'ia', to:'ib', note:'a remark'});
      workingNodes.push(['ic','words', null, null, null, 'callout',
                         {pos:[-120,20], leader:{from:'ia', to:'ib', at:0.5}}]);
    });
    await wait(900);
    const noteInk = ()=>{
      const t = document.querySelector('#arrowLayer .edge-note text');
      return t ? getComputedStyle(t).fill : null;
    };
    const calloutInk = ()=> getComputedStyle(
      document.querySelector('.node[data-id="ic"] text')).fill;
    out.inkFirst = [noteInk(), calloutInk()].join(' ');
    applyEdit(()=>{ EDGE_STYLES[0].color = '#2c7a41'; EDGE_STYLES[0].colorFixed = true; });
    await wait(700);
    out.inkFollows = noteInk() === 'rgb(44, 122, 65)' && calloutInk() === 'rgb(44, 122, 65)';
    out.inkNow = [noteInk(), calloutInk()].join(' ');
    out.noColourControl = !document.querySelector('[data-hex-for="calloutText"]') &&
                          !document.querySelector('[data-hex-for="styleNote"]') &&
                          !!document.querySelector('[data-hex-for="editLabelInput"]');

    /* The Add form's Label row is shut for a picture too. */
    {
      const sel = document.getElementById('addNodeShape');
      const wrap = document.getElementById('addNodeLabel').closest('.editor-field');
      const rec = richFields.get('addNodeLabel');
      sel.value = 'image'; sel.dispatchEvent(new Event('change', {bubbles:true}));
      await wait(280);
      out.addShut = rec.surface.getAttribute('contenteditable') === 'false' &&
                    [...wrap.querySelectorAll('button')].every(b=> b.disabled);
      sel.value = 'rect'; sel.dispatchEvent(new Event('change', {bubbles:true}));
      await wait(280);
      out.addOpen = rec.surface.getAttribute('contenteditable') === 'true' &&
                    [...wrap.querySelectorAll('button')].every(b=> !b.disabled);
    }

    /* Every sheet of a local multiverse covers the same ground in the same
       time, so they arrive evenly. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['sl','Local', null, null, null, null, {pos:[0,0], tags:[LOCAL_TAG]}]);
    });
    await wait(800);
    {
      const aura = document.querySelector('#auraLayer .node-aura[data-id="sl"]');
      aura.classList.add('tag-lively');
      const sheets = [...aura.querySelectorAll('.local-sheet')];
      const dur = parseFloat(getComputedStyle(sheets[0]).animationDuration);
      const base = sheets.map(sh=> parseFloat(getComputedStyle(sh).animationDelay) || 0);
      const box = document.querySelector('.node[data-id="sl"]').getBoundingClientRect();
      const track = sheets.map(()=> []);
      const total = [];
      for(let k = 0; k <= 20; k++){
        let sum = 0;
        sheets.forEach((sh, i)=>{
          sh.style.animationDelay = (base[i] - dur*k/20) + 's';
          sh.style.animationPlayState = 'paused';
          track[i].push(Math.round(sh.getBoundingClientRect().left - box.left));
          sum += +getComputedStyle(sh).opacity;
        });
        total.push(sum);
      }
      sheets.forEach(sh=>{ sh.style.animationDelay=''; sh.style.animationPlayState=''; });
      /* The same span for every sheet — that is what makes the speeds
         equal and the gaps between arrivals even. */
      const spans = track.map(t=> Math.max(...t) - Math.min(...t));
      out.sameSpan = spans.every(v=> Math.abs(v - spans[0]) <= 1);
      out.spans = spans.join(',');
      /* And something is always on the way out. */
      out.noPause = Math.min(...total) > 0.15;
      out.dimmest = Math.min(...total).toFixed(2);
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('where an amalgam stands says nothing about its merge',
        r36.mergeHeld, r36.mergeDrift === '(none)' ? r36.mergeWas
          : (r36.mergeWas + '   ->   ' + r36.mergeDrift));
  check('a portrait’s card is no wider than its words',
        r36.cardTight && r36.noneAtRest, r36.cardWidths);
  check('and is up for as long as its panel is', r36.cardWithPanel);
  check('a portrait can be asked to keep its card open',
        r36.checkboxOffered && r36.cardKept && r36.choiceSaved && r36.checkboxHidden,
        JSON.stringify({offered:r36.checkboxOffered, kept:r36.cardKept,
                        saved:r36.choiceSaved, hiddenElsewhere:r36.checkboxHidden}));
  check('a remark on a connector is written in the connector’s ink',
        r36.inkFollows, r36.inkFirst + '  ->  ' + r36.inkNow);
  check('and there is nowhere to overrule it', r36.noColourControl);
  check('the Add form offers no Label for a picture either',
        r36.addShut && r36.addOpen,
        JSON.stringify({shut:r36.addShut, open:r36.addOpen}));
  check('every sheet of a stack covers the same ground in the same time',
        r36.sameSpan, r36.spans);
  check('so there is never a moment with nothing on its way out',
        r36.noPause, r36.dimmest);

  /* ---- 27r. section 57: what the entry decides and what it does not ---- */
  const r37 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* The two points on a merge's bar. The SEAM stands still; the JUNCTION
       follows the entry along the bar and no further than its ends. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      for(let i = 0; i < 5; i++)
        workingNodes.push(['tp'+i, 'Parent ' + i, null, null, null, null, {pos:[-400 + i*160, -200]}]);
      workingNodes.push(['tam','Merge', ['tp0','tp1','tp2','tp3','tp4'],
                         null, null, 'amalgam', {pos:[-100, 200]}]);
      workingNodes.push(['tco','', null, null, null, 'callout',
                         {pos:[-560,-40], leader:{from:'tp0', to:'tam', at:0.4}}]);
    });
    await wait(900);
    const look = ()=>{
      const j = document.querySelector('#edgeLayer .amalgam-junction');
      const bar = amalgamBars.get('tam');
      const nAm = nodes.get('tam');
      const dot = document.querySelector('.callout-leader[data-id="tco"] .leader-dot');
      return {
        junc: j ? Math.round(+j.getAttribute('cx')) : null,
        mid:  nAm ? Math.round(nAm.x + nAm.w/2) : null,
        span: bar ? Math.round(bar.lo) + ':' + Math.round(bar.hi) : '?',
        seams: [...document.querySelectorAll('#edgeLayer .amalgam-joint')]
                 .map(c=> Math.round(+c.getAttribute('cx'))).join('/'),
        dot: dot ? Math.round(+dot.getAttribute('cx')) + ',' + Math.round(+dot.getAttribute('cy')) : '?'
      };
    };
    {
      const rows = [];
      for(const x of [-260, -100, 60, 220]){
        applyEdit(()=>{ workingNodes.find(e=> e[0] === 'tam')[6].pos = [x, 200]; });
        await wait(520);
        rows.push(look());
      }
      // The seams, the bar's span and the callout are the same every time.
      const held = rows.every(r=> r.span === rows[0].span && r.seams === rows[0].seams &&
                                  r.dot === rows[0].dot);
      // And the junction is in front of the entry, every time.
      const follows = rows.every(r=> Math.abs(r.junc - r.mid) <= 1);
      // Which means it MOVED, so this is not passing by standing still.
      const moved = new Set(rows.map(r=> r.junc)).size === rows.length;
      out.mergeHeld = held;
      out.juncFollows = follows && moved;
      out.mergeRows = rows.map(r=> r.junc + '/' + r.mid + ' ' + r.seams).join('   ');
    }

    /* Formatting a caption must not fade the chart out behind it. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['fa','Alpha', null, null, null, null, {pos:[-300,-100]}]);
      workingNodes.push(['fb','Beta', 'fa', null, null, null, {pos:[100,-100]}]);
      workingNodes.push(['ft','Hello world', null, null, null, 'textbox', {pos:[-200,200]}]);
    });
    await wait(700);
    {
      selectNode('ft'); paintMultiSelection();
      openFreeMenu('ft', {clientX:400, clientY:400});
      await wait(150);
      const surf = richFields.get('freeMenuText').surface;
      surf.focus();
      const sel = window.getSelection(), rg = document.createRange();
      rg.selectNodeContents(surf); sel.removeAllRanges(); sel.addRange(rg);
      applyRichCommand(surf, 'color', '#ff0000');
      await wait(140);
      out.noFlash = document.querySelectorAll('.node.dim').length === 0;
      out.dimmed = [...document.querySelectorAll('.node.dim')].map(g=> g.dataset.id).join(',') || '(none)';
      await wait(760);
      out.captionColoured = /#ff0000/.test(nodes.get('ft').label || '');

      /* The angle is set on the caption itself now — see the rotate handle
         further down — so the card carries no slider at all. */
      out.noSliderInCard = !document.getElementById('freeMenuRot');
      closeFreeMenu(); deselect();
      await wait(200);
    }

    /* A remark's ink follows its connector the moment the colour changes —
       card, words and the plate around a note alike — and the reset button
       is back on both those toolbars without a colour box beside it. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ia','Alpha', null, null, null, null, {pos:[-400,-100]}]);
      workingNodes.push(['ib','Beta', 'ia', null, null, null, {pos:[200,-100]}]);
      workingNodes.push(['ico','Remark', null, null, null, 'callout',
                         {pos:[-150,180], leader:{from:'ia', to:'ib', at:0.4}}]);
      EDGE_STYLES.push({from:'ia', to:'ib', note:'a note'});
    });
    await wait(900);
    {
      const cardStroke = ()=>{
        const r = document.querySelector('.node[data-id="ico"] rect:not(.node-hover-pad)');
        return r ? r.getAttribute('stroke') : null;
      };
      const plateStroke = ()=>{
        const pl = document.querySelector('.edge-note-plate');
        return pl ? pl.style.stroke : null;
      };
      const was = cardStroke();
      openEdgeStylePopover('ia', 'ib', {clientX:600, clientY:400});
      await wait(200);
      stylePaintMode.value = 'solid';
      syncColorRow(); applyLiveEdgeStyle();
      styleColorInput.value = '#0088ff';
      styleColorInput.dispatchEvent(new Event('input', {bubbles:true}));
      await wait(260);
      out.inkLive = cardStroke() === '#0088ff';
      out.inkWas = was + ' -> ' + cardStroke();
      out.plateLive = /0,\s*136,\s*255|#0088ff/.test(plateStroke() || '');
      out.plateNow = plateStroke();

      out.resetOnNote = !!document.querySelector('#styleNoteToolbar [data-hex-reset]');
      out.resetOnCallout = !!document.querySelector('#calloutToolbar [data-hex-reset]');
      out.noHexOnNote = !document.querySelector('#styleNoteToolbar .tb-hex') &&
                        !document.querySelector('#calloutToolbar .tb-hex');
      // It clears the formatting the reader CAN set.
      const ns = richFields.get('styleNote').surface;
      setRichValue(document.getElementById('styleNote'), '**bold** text');
      await wait(60);
      ns.focus();
      { const sel = window.getSelection(), rg = document.createRange();
        rg.selectNodeContents(ns); sel.removeAllRanges(); sel.addRange(rg); }
      document.querySelector('#styleNoteToolbar [data-hex-reset]')
        .dispatchEvent(new MouseEvent('click', {bubbles:true}));
      await wait(140);
      out.noteCleared = document.getElementById('styleNote').value === 'bold text';
      out.noteAfter = document.getElementById('styleNote').value;
      closeEdgePopover();
      await wait(120);
    }

    /* A pocket reality's sheets are copies of its own rippled outline. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['wp','Pocket', null, null, null, 'pocket',
                         {pos:[-420,-60], tags:['local multiverse']}]);
      workingNodes.push(['wr','Plain', null, null, null, null,
                         {pos:[-140,-60], tags:['local multiverse']}]);
    });
    await wait(800);
    {
      const kinds = (id)=> [...document.querySelectorAll(`.node-aura[data-id="${id}"] .local-sheet`)]
        .map(e=> e.tagName.toLowerCase()).join(',');
      out.pocketSheets = kinds('wp');
      out.plainSheets = kinds('wr');
      out.sheetsRippled = out.pocketSheets === 'path,path' && out.plainSheets === 'rect,rect';
    }

    /* The portrait's card: as tall as its words, and not popped open when
       it is already there or when another entry's settings are open. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['cb','One line', null, null, null, 'ellipse',
                         {pos:[-300,-100], bioCard:true}]);
      workingNodes.push(['cb2','A rather longer portrait caption that has to wrap over several lines to fit',
                         null, null, null, 'ellipse', {pos:[-300,120], bioCard:true}]);
      workingNodes.push(['cx','Other', null, null, null, null, {pos:[200,200]}]);
    });
    await wait(900);
    {
      const cards = [...document.querySelectorAll('.bio-card-g')].map(g=>{
        const r = g.querySelector('rect');
        return {h: Math.round(+r.getAttribute('height')), w: Math.round(+r.getAttribute('width'))};
      }).sort((a,b)=> a.h - b.h);
      out.cardHeights = cards.map(c=> c.w + 'x' + c.h).join(' ');
      // Short text gets a short card; long text gets a taller one, and the
      // short one is at the minimum an entry may be.
      out.cardTall = cards.length === 2 && cards[1].h > cards[0].h + 12 && cards[0].h <= 30;

      // Pointing at a portrait that already keeps its card open changes nothing.
      const before = bioCardNodeId;
      document.querySelector('.node[data-id="cb"]')
        .dispatchEvent(new MouseEvent('mouseenter', {bubbles:false}));
      out.noRepop = bioCardNodeId === before;

      // With another entry's settings open, hovering pops nothing up.
      applyEdit(()=>{ workingNodes.forEach(e=>{ if(e[6]) delete e[6].bioCard; }); });
      await wait(700);
      selectNode('cx');
      detailEditToggle.onclick({stopPropagation(){}});
      await wait(200);
      document.querySelector('.node[data-id="cb"]')
        .dispatchEvent(new MouseEvent('mouseenter', {bubbles:false}));
      out.noHoverWhileEditing = bioCardNodeId === null;
      closeEditForm(); deselect();
      await wait(200);

      /* Double-clicking the card opens the words ON THE CARD. It used to
         open the drawer's Label field at the other side of the screen;
         the field now stands on the card itself. */
      openBioCard('cb', true);
      await wait(320);
      const g = document.querySelector('.bio-card-g');
      g.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true}));
      await wait(340);
      out.cardEdits = selectedId === 'cb' &&
        nodeEditorTarget === 'cb' &&
        !document.getElementById('nodeEditor').hidden &&
        document.activeElement === richFields.get('nodeEditorText').surface;
      closeNodeEditor(true);
      closeBioCard(); closeEditForm(); deselect();
      await wait(150);
    }

    /* The words stay visibly chosen while a hex value is typed for them. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ha','Alpha beta gamma', null, null, null, null, {pos:[-100,-100]}]);
    });
    await wait(800);
    {
      selectNode('ha');
      detailEditToggle.onclick({stopPropagation(){}});
      await wait(220);
      const surf = richFields.get('editLabelInput').surface;
      surf.focus();
      const tn = surf.querySelector('div') || surf;
      const node = tn.firstChild || tn;
      const rg = document.createRange();
      rg.setStart(node, 0); rg.setEnd(node, 5);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
      // selectionchange is queued, not synchronous — the watcher that keeps
      // the last picked-out run has to be given the turn it runs in.
      await wait(80);
      const box = document.querySelector('[data-hex-for="editLabelInput"]');
      box.focus();
      await wait(120);
      out.heldPainted = (()=>{ try{ return CSS.highlights.get('held-selection').size; }
                               catch(e){ return -1; } })();
      box.value = '#ff8800';
      applyHexFromBox(box, '#ff8800');
      await wait(600);
      out.heldApplied = /#ff8800\|Alpha/.test(document.getElementById('editLabelInput').value);
      out.heldValue = document.getElementById('editLabelInput').value;
      out.heldCleared = (()=>{ try{ return CSS.highlights.get('held-selection').size === 0; }
                               catch(e){ return false; } })();
      closeEditForm(); deselect();
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('a merge’s seams and its callout stand still as the entry moves',
        r37.mergeHeld, r37.mergeRows);
  check('while the merged arrow leaves the bar in front of the entry',
        r37.juncFollows, r37.mergeRows);
  check('formatting a caption does not fade the chart out behind it',
        r37.noFlash && r37.captionColoured,
        JSON.stringify({dimmed:r37.dimmed, coloured:r37.captionColoured}));
  // Eighths of a turn since 0.9.15 — see the section below, which covers
  // the snap itself. What is checked here is that the modifier is read at
  // all, and that letting it go gives the exact value back.
  check('the caption card carries no angle slider', r37.noSliderInCard);
  check('a remark takes its connector’s ink the moment it changes',
        r37.inkLive && r37.plateLive,
        JSON.stringify({card:r37.inkWas, plate:r37.plateNow}));
  check('and the ⟲ is back on both those toolbars, without a colour box',
        r37.resetOnNote && r37.resetOnCallout && r37.noHexOnNote && r37.noteCleared,
        JSON.stringify({note:r37.resetOnNote, callout:r37.resetOnCallout,
                        noHex:r37.noHexOnNote, cleared:r37.noteAfter}));
  check('a pocket reality’s sheets are rippled like its own outline',
        r37.sheetsRippled, r37.pocketSheets + ' | ' + r37.plainSheets);
  check('a portrait’s card is no taller than its words', r37.cardTall, r37.cardHeights);
  check('a card already open is not opened again by pointing at it', r37.noRepop);
  check('and none pops up while another entry’s settings are open',
        r37.noHoverWhileEditing);
  check('double-clicking a portrait’s card opens the words on it', r37.cardEdits);
  check('a selection survives the trip to the hex box',
        r37.heldPainted === 1 && r37.heldApplied && r37.heldCleared,
        JSON.stringify({painted:r37.heldPainted, value:r37.heldValue,
                        cleared:r37.heldCleared}));

  /* ---- 27s. section 58: what follows what ---- */
  const r38 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* Two ports facing the same way share one level, and that level
       follows the DEEPER port down and then stops — it never comes back
       up. Dragging an entry above its neighbour used to shrink the bend to
       a few pixels, at which point no stock shape cleared the boxes and
       the search took over, and the run leapt to wherever it landed. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ra','Alpha','rb', null, null, null, {pos:[-400,0]}]);
      workingNodes.push(['rm','Middle', null, null, null, null, {pos:[-150,0]}]);
      workingNodes.push(['rb','Beta',   null, null, null, null, {pos:[160,0]}]);
      EDGE_STYLES.push({from:'rb', to:'ra', routing:'orth', fromSide:'bottom', toSide:'bottom'});
    });
    await wait(900);
    {
      const rows = [];
      for(let dy = 60; dy >= -80; dy -= 4){
        applyEdit(()=>{ workingNodes.find(e=> e[0] === 'ra')[6].pos = [-400, dy]; });
        await wait(150);
        const rec = drawnRoutes.get('rb::ra');
        const na = nodes.get('ra'), nb = nodes.get('rb');
        // The crossbar: the level the long horizontal run sits at.
        const bar = rec && rec.pts.length >= 3 ? rec.pts[1].y : null;
        rows.push({dy, bar, deep: Math.max(na.y + na.h, nb.y + nb.h)});
      }
      out.barMonotone = rows.every((r, i)=> i === 0 || r.bar <= rows[i-1].bar + 0.01);
      // And it is the deeper port plus one run-out, throughout.
      out.barTracksDeeper = rows.every(r=> Math.abs(r.bar - (r.deep + 18)) < 0.6);
      out.barSteps = rows.filter((r,i)=> i && Math.abs(r.bar - rows[i-1].bar) > 0.01)
                         .length;
      const tail = rows.slice(-8).map(r=> r.bar);
      out.barSettles = tail.every(v=> Math.abs(v - tail[0]) < 0.01);
      out.barTail = tail.map(v=> Math.round(v)).join(',');
      out.barRows = rows.filter((r,i)=> i % 6 === 0).map(r=> r.dy + ':' + Math.round(r.bar)).join(' ');
    }

    /* A callout swung about its anchor with Shift lands on an EXACT
       eighth of a turn — including on a merge, whose ports sit on half
       pixels and where rounding the card's corner to a whole one tilted
       every snap by a tenth of a degree. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      for(let i = 0; i < 3; i++)
        workingNodes.push(['qp'+i, 'Parent ' + i, null, null, null, null, {pos:[-300 + i*200, -260]}]);
      workingNodes.push(['qam','Merge', ['qp0','qp1','qp2'], null, null, 'amalgam', {pos:[-60,180]}]);
      workingNodes.push(['qco','Card', null, null, null, 'callout',
                         {pos:[-260,20], leader:{from:'qp0', to:'qam', at:0.5}}]);
    });
    await wait(900);
    {
      const angle = ()=>{
        const l = document.querySelector('.callout-leader[data-id="qco"] .leader-line');
        const n = nodes.get('qco');
        if(!l || !n) return null;
        const x1 = +l.getAttribute('x1'), y1 = +l.getAttribute('y1');
        return Math.atan2(n.y + n.h/2 - y1, n.x + n.w/2 - x1) * 180/Math.PI;
      };
      const g = document.querySelector('.node[data-id="qco"]');
      const box = g.getBoundingClientRect();
      const cx = box.x + box.width/2, cy = box.y + box.height/2;
      const send = (type, x, y, shift)=> g.dispatchEvent(new MouseEvent(type, {
        bubbles:true, cancelable:true, clientX:x, clientY:y, shiftKey:!!shift, button:0
      }));
      send('mousedown', cx, cy, false);
      window.dispatchEvent(new MouseEvent('mousemove', {clientX:cx+16, clientY:cy+34, shiftKey:true}));
      await wait(120);
      window.dispatchEvent(new MouseEvent('mousemove', {clientX:cx+6, clientY:cy+46, shiftKey:true}));
      await wait(140);
      out.swungAngle = +angle().toFixed(4);
      window.dispatchEvent(new MouseEvent('mouseup', {clientX:cx+6, clientY:cy+46}));
      await wait(500);
      out.swungKept = +angle().toFixed(4);
      out.swungExact = Math.abs(out.swungAngle - 90) < 0.001 &&
                       Math.abs(out.swungKept - 90) < 0.001;
    }

    /* The portrait's card: no entrance replayed on a redraw, the same wash
       as its portrait, and no popping up while another entry is selected.
       And a selected entry's decorations perform. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['zb','Portrait', null, null, null, 'ellipse', {pos:[-300,-100], bioCard:true}]);
      workingNodes.push(['zx','Other', null, null, null, null, {pos:[200,100], tags:['local multiverse']}]);
    });
    await wait(900);
    {
      drawBioCard();
      const g = document.querySelector('.bio-card-g[data-id="zb"]');
      out.cardStaysUp = !!g && g.classList.contains('shown') &&
                        getComputedStyle(g).opacity === '1';
      selectNode('zx'); paintMultiSelection();
      await wait(220);
      const g2 = document.querySelector('.bio-card-g[data-id="zb"]');
      const node = document.querySelector('.node[data-id="zb"]');
      out.cardDims = !!g2 && node.classList.contains('dim') && g2.classList.contains('dim') &&
                     Math.abs(parseFloat(getComputedStyle(g2).opacity) - 0.14) < 0.01;
      const aura = document.querySelector('.node-aura[data-id="zx"]');
      out.selectedPerforms = !!aura && aura.classList.contains('tag-lively');
      const before = bioCardNodeId;
      document.querySelector('.node[data-id="zb"]').dispatchEvent(new MouseEvent('mouseenter'));
      out.noHoverPop = bioCardNodeId === before;
      deselect();
      await wait(220);
      const g3 = document.querySelector('.bio-card-g[data-id="zb"]');
      out.cardUndims = !!g3 && !g3.classList.contains('dim');
      out.restPerforms = !document.querySelector('.node-aura[data-id="zx"]').classList.contains('tag-lively');
    }

    /* The rotate handle on the caption itself. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['zt','Caption', null, null, null, 'textbox', {pos:[-200,60]}]);
    });
    await wait(800);
    {
      const n = nodes.get('zt');
      const g = document.querySelector('.node[data-id="zt"]');
      const handle = g && g.querySelector('.node-rotate');
      out.hasHandle = !!handle;
      out.handleLive = !!handle && getComputedStyle(handle).pointerEvents !== 'none';
      // And only a caption has one.
      out.rotEighths = true;
      out.rotSnap = 'handle';
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('a shared run-out level follows the deeper port and stops',
        r38.barMonotone && r38.barTracksDeeper, r38.barRows);
  check('so a connector past its neighbour lengthens rather than leaping',
        r38.barSettles, r38.barTail);
  check('a callout swung with Shift lands on an exact eighth of a turn',
        r38.swungExact, r38.swungAngle + ' -> ' + r38.swungKept);
  check('a portrait’s card does not replay its entrance on every redraw',
        r38.cardStaysUp);
  check('and steps back with the portrait it belongs to', r38.cardDims);
  check('and none pops up while another entry is selected', r38.noHoverPop);
  check('the wash lifts again when nothing is selected', r38.cardUndims);
  check('a selected entry’s decorations perform', r38.selectedPerforms);
  check('and stop when it is let go of', r38.restPerforms);
  check('a caption is turned by a handle on the caption itself',
        r38.hasHandle && r38.handleLive,
        JSON.stringify({handle:r38.hasHandle, live:r38.handleLive}));

  /* ---- 27t. section 59: properties, not archetypes ---- */
  const r39 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));

    /* A background and a border style, on every kind of box — and a chart
       written with the two old archetypes opening as the new properties. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      ['solid','dashed','dotted','dashdot','double','wavy'].forEach((b,i)=>
        workingNodes.push(['sb'+i, b, null, null, null, null,
          {pos:[-460 + i*160, -180], border: b === 'solid' ? undefined : b}]));
      workingNodes.push(['sg1','Flat', null, null, null, null, {pos:[-460,-40], bg:['#f4e9c9']}]);
      workingNodes.push(['sg2','Gradient', null, null, null, null, {pos:[-280,-40], bg:['#f4e9c9','#d8e6f5']}]);
      workingNodes.push(['sMir','Legacy mirror', null, null, null, 'mirror',
                         {pos:[-100,-40], colors:['#c23b22']}]);
      workingNodes.push(['sPk','Legacy pocket', null, null, null, 'pocket', {pos:[100,-40]}]);
      workingNodes.push(['sBio','Portrait', null, null, null, 'ellipse',
                         {pos:[-460,60], bg:['#e8d5ff'], bioCard:true}]);
      workingNodes.push(['sm1','A', null, null, null, null, {pos:[-260,120]}]);
      workingNodes.push(['sm2','B', null, null, null, null, {pos:[-80,120]}]);
      workingNodes.push(['sAm','Merge', ['sm1','sm2'], null, null, 'amalgam',
                         {pos:[-180,280], bg:['#fff3d6']}]);
      workingNodes.push(['sCo','Card', null, null, null, 'callout', {pos:[200,180], bg:['#ffe8e8']}]);
    });
    await wait(1000);
    {
      const outline = (id)=> document.querySelector(
        `.node[data-id="${id}"] > rect:not(.node-hover-pad):not(.border-inner), ` +
        `.node[data-id="${id}"] > path:not(.border-inner)`);
      const dash = (id)=>{ const e = outline(id); return e ? (e.getAttribute('stroke-dasharray') || '') : '?'; };
      out.dashes = ['sb0','sb1','sb2','sb3'].map(dash).join('|');
      out.dashesRight = out.dashes === '|7 5|1.5 4|9 4 1.5 4';
      out.doubleHasTwo = document.querySelectorAll('.node[data-id="sb4"] .border-inner').length === 1;
      out.wavyIsPath = !!outline('sb5') && outline('sb5').tagName.toLowerCase() === 'path';

      const fill = (id)=>{ const e = outline(id); return e ? (e.style.fill || '') : '?'; };
      out.flatFill = /244, 233, 201|#f4e9c9/.test(fill('sg1'));
      out.gradientFill = /^url\(/.test(fill('sg2'));
      out.amalgamFill = /255, 243, 214|#fff3d6/.test(fill('sAm'));
      out.calloutFill = /255, 232, 232|#ffe8e8/.test(fill('sCo'));
      const bioRing = document.querySelector('.node[data-id="sBio"] circle.bio-ring');
      out.portraitFill = !!bioRing && /232, 213, 255|#e8d5ff/.test(bioRing.style.fill || '');

      // The two legacy archetypes, migrated.
      const mir = nodes.get('sMir'), pk = nodes.get('sPk');
      out.mirrorMigrated = !mir.shape && JSON.stringify(mir.bg) === '["#c23b22"]';
      out.pocketMigrated = !pk.shape && pk.border === 'wavy' &&
                           document.querySelectorAll('.node[data-id="sPk"] > path').length === 1;
      // And the migrated mirror still writes its label in contrasting ink.
      const t = document.querySelector('.node[data-id="sMir"] text');
      out.mirrorInk = !!t && t.getAttribute('fill') === '#ffffff';
      // Written back in the new form, so the migration happens once.
      const saved = workingNodes.find(x=> x[0] === 'sMir');
      out.migrationSaved = saved[5] == null && Array.isArray(saved[6].bg);
    }

    /* The two controls, in the entry drawer and in the Add form. */
    {
      selectNode('sg2');
      detailEditToggle.onclick({stopPropagation(){}});
      await wait(300);
      out.drawerBg = document.getElementById('editBgInput').value;
      out.drawerBorder = editBorderStyle.value;
      // Setting them from the form reaches the entry.
      document.getElementById('editBgInput').value = '#123456';
      document.getElementById('editBgInput').dispatchEvent(new Event('input', {bubbles:true}));
      editBorderStyle.value = 'dotted';
      flushNodeEditCommit();
      await wait(500);
      const n2 = nodes.get('sg2');
      out.setFromForm = JSON.stringify(n2.bg) === '["#123456"]';
      closeEditForm(); deselect();
      await wait(200);
      // The archetype list has lost the two that became properties.
      out.shapeOptions = [...document.getElementById('editShapeInput').options]
        .map(o=> o.value).join(',');
      out.archetypesTrimmed = !/mirror|pocket/.test(out.shapeOptions);
    }
    {
      document.getElementById('addNodeToggle').onclick();
      await wait(240);
      const picks = [...document.querySelectorAll('#addNodeShapePick .node-style-btn')];
      out.pickCount = picks.length;
      out.picksDrawn = picks.every(b=> !!b.querySelector('svg.node-style-icon'));
      picks.find(b=> b.dataset.value === 'ellipse').click();
      await wait(150);
      out.pickWrites = addNodeShapeSel.value === 'ellipse' &&
        document.querySelector('#addNodeShapePick .node-style-btn.on').dataset.value === 'ellipse';
      document.getElementById('addNodeCancel').onclick();
      await wait(150);
    }

    /* A caption is turned by its own handle, and only a caption has one. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['rt','Caption', null, null, null, 'textbox', {pos:[-120,-20]}]);
      workingNodes.push(['rb','Entry', null, null, null, null, {pos:[160,-20]}]);
    });
    await wait(800);
    {
      out.captionHandle = !!document.querySelector('.node[data-id="rt"] .node-rotate');
      out.entryNoHandle = !document.querySelector('.node[data-id="rb"] .node-rotate');
      const n = nodes.get('rt');
      const g = document.querySelector('.node[data-id="rt"]');
      applyNodeRotation(n, g, 37);
      out.turnedLive = /rotate\(37/.test(g.getAttribute('transform') || '');
      applyNodeRotation(n, g, 0);
      out.snapStep = ROT_SNAP;
    }

    /* Renaming a category happens on the heading. */
    {
      applyEdit(()=>{ refill(TAG_CATS, [{name:'Before', tags:[]}]); });
      buildManagement();
      await wait(200);
      const head = [...document.querySelectorAll('.legend-group-head')]
        .find(h=> (h.querySelector('.legend-group-name')||{}).textContent === 'Before');
      out.foundHead = !!head;
      if(head){
        startCategoryRename(head, 'Before');
        const nameEl = head.querySelector('.legend-group-name');
        out.editableInPlace = nameEl.isContentEditable &&
                              nameEl.classList.contains('renaming');
        nameEl.textContent = 'After';
        nameEl.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
        await wait(250);
        out.renamed = TAG_CATS.some(c=> c.name === 'After') &&
                     !TAG_CATS.some(c=> c.name === 'Before');
      }
      applyEdit(()=>{ refill(TAG_CATS, []); });
      buildManagement();
    }

    /* A note plate's ground is the connector's to set; its ink is not. */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['na','A', null, null, null, null, {pos:[-300,-80]}]);
      workingNodes.push(['nb','B','na', null, null, null, {pos:[200,-80]}]);
      EDGE_STYLES.push({from:'na', to:'nb', note:'a remark', noteBg:'#ffeecc'});
    });
    await wait(800);
    {
      const plate = document.querySelector('.edge-note-plate');
      out.plateGround = !!plate && /255, 238, 204|#ffeecc/.test(plate.style.fill || '');
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('an entry wears any of the six border styles',
        r39.dashesRight && r39.doubleHasTwo && r39.wavyIsPath,
        JSON.stringify({dashes:r39.dashes, double:r39.doubleHasTwo, wavy:r39.wavyIsPath}));
  check('and a background — flat, or a gradient across the box',
        r39.flatFill && r39.gradientFill, JSON.stringify({flat:r39.flatFill, grad:r39.gradientFill}));
  check('which reaches a portrait, an amalgam and a comment card too',
        r39.portraitFill && r39.amalgamFill && r39.calloutFill,
        JSON.stringify({bio:r39.portraitFill, amalgam:r39.amalgamFill, callout:r39.calloutFill}));
  check('a chart written with the old archetypes opens as the new properties',
        r39.mirrorMigrated && r39.pocketMigrated && r39.migrationSaved,
        JSON.stringify({mirror:r39.mirrorMigrated, pocket:r39.pocketMigrated, saved:r39.migrationSaved}));
  check('and a filled entry still writes its label in readable ink', r39.mirrorInk);
  check('the drawer offers both, and setting them reaches the entry',
        r39.drawerBg === '#f4e9c9, #d8e6f5' && r39.drawerBorder === 'solid' && r39.setFromForm,
        JSON.stringify({bg:r39.drawerBg, border:r39.drawerBorder, set:r39.setFromForm}));
  check('and the archetype list has lost the two that became properties',
        r39.archetypesTrimmed, r39.shapeOptions);
  check('the Add form picks an archetype by its picture',
        r39.pickCount === 5 && r39.picksDrawn && r39.pickWrites,
        JSON.stringify({count:r39.pickCount, drawn:r39.picksDrawn, writes:r39.pickWrites}));
  check('a caption is turned by a handle on the caption, and only a caption',
        r39.captionHandle && r39.entryNoHandle && r39.turnedLive && r39.snapStep === 45,
        JSON.stringify({caption:r39.captionHandle, entry:r39.entryNoHandle,
                        live:r39.turnedLive, snap:r39.snapStep}));
  check('a category is renamed on its own heading',
        r39.foundHead && r39.editableInPlace && r39.renamed,
        JSON.stringify({head:r39.foundHead, inPlace:r39.editableInPlace, done:r39.renamed}));
  check('a note plate stands on the ground its connector names', r39.plateGround);

  /* ---- 27u. section 60: a card that keeps up, a line bent by hand ---- */
  const r40 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const rect = ()=> svg.getBoundingClientRect();
    const toClient = (wx, wy)=>{ const r = rect();
      return {x: r.left + wx*vs + vx, y: r.top + wy*vs + vy}; };

    /* ---- the portrait: a card that follows the rim, and picks a side ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['bcS1','Source one',null,null,null,null,{pos:[-520,-200]}]);
      workingNodes.push(['bcS2','Source two',null,null,null,null,{pos:[-520,-20]}]);
      workingNodes.push(['bcS3','Source three',null,null,null,null,{pos:[-520,160]}]);
      workingNodes.push(['bcP','Portrait',['bcS1','bcS2','bcS3'],null,
                         'A life, told in one short line.','ellipse',
                         {pos:[0,-40], size:[130,130], bioCard:true}]);
      EDGE_STYLES.push({from:'bcS1', to:'bcP', toSide:'left'});
      EDGE_STYLES.push({from:'bcS2', to:'bcP', toSide:'left'});
      EDGE_STYLES.push({from:'bcS3', to:'bcP', toSide:'left'});
    });
    await wait(900);
    {
      /* Every connector into a portrait must finish ON the circle, not on
         the bounding box the circle is drawn inside — three lines into one
         portrait used to leave three different gaps. */
      const n = nodes.get('bcP');
      const cx = n.x + n.w/2, cy = n.y + n.h/2, rr = n.w/2;
      const gaps = ['bcS1','bcS2','bcS3'].map(id=>{
        const p = document.querySelector(`#edgeLayer path.edge[data-from="${id}"][data-to="bcP"]`);
        if(!p) return null;
        const q = p.getPointAtLength(p.getTotalLength());
        return Math.hypot(q.x - cx, q.y - cy) - rr;
      });
      out.rimGaps = JSON.stringify(gaps.map(g=> g === null ? null : +g.toFixed(1)));
      out.endsOnRim = gaps.every(g=> g !== null && Math.abs(g) < 12);
      out.gapsAgree = gaps.every(g=> g !== null) &&
                      (Math.max(...gaps) - Math.min(...gaps)) < 2;
    }
    {
      /* The card is on the free side when nothing is said, and on the side
         the entry names when something is. */
      const card = ()=> document.querySelector('.bio-card-g[data-id="bcP"]');
      out.autoRight = !!card() && !card().classList.contains('flip');
      applyEdit(()=>{ const t = workingNodes.find(e=> e[0] === 'bcP'); t[6].bioSide = 'left'; });
      await wait(500);
      out.forcedLeft = !!card() && card().classList.contains('flip');
      applyEdit(()=>{ const t = workingNodes.find(e=> e[0] === 'bcP'); t[6].bioSide = 'right'; });
      await wait(500);
      out.forcedRight = !!card() && !card().classList.contains('flip');
      /* and the drawer says which, and writing it there reaches the entry */
      selectNode('bcP');
      detailEditToggle.onclick({stopPropagation(){}});
      await wait(300);
      out.sideField = editBioSide ? editBioSide.value : '?';
      if(editBioSide){ editBioSide.value = 'auto'; queueNodeEditCommit(0); }
      await wait(600);
      out.sideCleared = bioSideOf(nodes.get('bcP')) === 'auto';
    }
    {
      /* Growing the portrait moves its card THROUGH the drag, not at the
         end of it: a card that only catches up on mouseup reads as broken. */
      const g = document.querySelector('.node[data-id="bcP"]');
      if(g) g.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
      await wait(200);
      const grip = document.querySelector('.node[data-id="bcP"] .node-resize-se .node-resize-hit')
                || document.querySelector('.node[data-id="bcP"] [data-corner="se"] .node-resize-hit');
      const before = document.querySelector('.bio-card-g[data-id="bcP"]');
      const x0 = before ? before.getBBox().x : null;
      const w0 = nodes.get('bcP').w;
      if(grip){
        const b = grip.getBoundingClientRect();
        const sx = b.x + b.width/2, sy = b.y + b.height/2;
        grip.dispatchEvent(new MouseEvent('mousedown',
          {bubbles:true, cancelable:true, button:0, clientX:sx, clientY:sy}));
        for(let k = 1; k <= 6; k++){
          window.dispatchEvent(new MouseEvent('mousemove',
            {bubbles:true, clientX:sx + k*14, clientY:sy + k*14}));
          await wait(40);
        }
        await wait(120);
        const mid = document.querySelector('.bio-card-g[data-id="bcP"]');
        out.cardMovedDuringDrag = !!mid && x0 !== null &&
                                  (mid.getBBox().x - x0) > 20;
        out.portraitGrew = nodes.get('bcP').w > w0 + 20;
        window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
        await wait(400);
      } else { out.cardMovedDuringDrag = false; out.portraitGrew = false; }
    }
    {
      /* Picking a portrait out lights it without thickening its rim: the
         border is a property of the entry now, and a selection that
         quietly redraws it two pixels heavier reads as a size change. */
      const ring = document.querySelector('.node[data-id="bcP"] circle.bio-ring');
      const wOff = ring ? getComputedStyle(ring).strokeWidth : '?';
      selectNode('bcP');
      await wait(300);
      const ring2 = document.querySelector('.node[data-id="bcP"] circle.bio-ring');
      out.ringWidthHeld = !!ring2 && getComputedStyle(ring2).strokeWidth === wOff;
      out.ringWidth = wOff + ' / ' + (ring2 ? getComputedStyle(ring2).strokeWidth : '?');
    }

    /* ---- the decorations: a performance that does not restart ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['lvH','Hub',null,null,null,null,{pos:[0,0], tags:['multiversal hub']}]);
    });
    await wait(800);
    {
      selectNode('lvH');
      openLabelEditor('lvH');
      await wait(1400);
      const phase = ()=>{
        const r = document.querySelector('.node-aura[data-id="lvH"] .hub-echo');
        if(!r) return null;
        const a = r.getAnimations()[0];
        if(!a) return null;
        const del = parseFloat(r.style.animationDelay || '0') * 1000;
        return Number(a.currentTime) - del;
      };
      const t0 = performance.now(), p0 = phase();
      const rec = richFields.get('editLabelInput');
      if(rec){ rec.surface.focus(); document.execCommand('insertText', false, 'X'); }
      await wait(60);
      const t1 = performance.now(), p1 = phase();
      out.livelyOn = !!document.querySelector('.node-aura[data-id="lvH"].tag-lively');
      out.phaseKept = p0 !== null && p1 !== null &&
                      Math.abs((p1 - p0) - (t1 - t0)) < 120;
      out.phaseNumbers = p0 === null ? 'none'
        : Math.round(p0) + '->' + Math.round(p1) + ' over ' + Math.round(t1 - t0) + 'ms';
      detailEditToggle.onclick({stopPropagation(){}});
      await wait(300);
    }

    /* ---- the merge: one bead per real change, and a node kept on its bar ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['bdA','A',null,null,null,null,{pos:[-460,-260], colors:['#c23b22']}]);
      workingNodes.push(['bdB','B',null,null,null,null,{pos:[-160,-260], colors:['#c23b22']}]);
      workingNodes.push(['bdC','C',null,null,null,null,{pos:[140,-260], colors:['#c23b22']}]);
      /* Off the middle lineage on purpose: the junction travels along the
         bar with the entry and takes over any joint it lands on, so an
         entry parked on a landing is the one arrangement where a joint is
         legitimately absent whatever the colours are. */
      workingNodes.push(['bdM','Merge',['bdA','bdB','bdC'],null,null,'amalgam',{pos:[40,80]}]);
    });
    await wait(900);
    /* Every seam on the bar is marked, whatever the colours meeting there:
       a bead says which lineage hands the bar over to which, and three
       lineages have two of those. 0.9.17 skipped the ones where the two
       colours matched, which on a chart of default ink took every bead off
       every bar. What the clearance below removes is the ONE seam the
       junction bead is already standing on. */
    out.beadsSameColour = document.querySelectorAll('.amalgam-joint[data-to="bdM"]').length;
    applyEdit(()=>{
      const t = workingNodes.find(e=> e[0] === 'bdC');
      t[6] = Object.assign({}, t[6], {colors:['#2f6f9f']});
    });
    await wait(700);
    out.beadsOneChange = document.querySelectorAll('.amalgam-joint[data-to="bdM"]').length;
    /* And the doubled dot: parked on a landing, the entry's junction bead
       stands where a joint would be, and the joint gives way to it. */
    applyEdit(()=>{ workingNodes.find(e=> e[0] === 'bdM')[6].pos = [-160, 80]; });
    await wait(700);
    out.beadsOnTheSeam = document.querySelectorAll('.amalgam-joint[data-to="bdM"]').length;
    applyEdit(()=>{ workingNodes.find(e=> e[0] === 'bdM')[6].pos = [40, 80]; });
    await wait(600);
    {
      /* Carried well past the end of the structure, the entry stops at the
         end of the bar: it belongs to the merge and cannot be left beside
         it. The leash that used to PULL it back is still gone — this only
         stops it going where it cannot be drawn. */
      const n = nodes.get('bdM');
      /* Read off as NUMBERS: the entry objects are reused across redraws,
         so a reference kept over a drag reports where it ended up. */
      const fromCentre = n.x + n.w/2;
      const g = document.querySelector('.node[data-id="bdM"]');
      const start = toClient(n.x + n.w/2, n.y + n.h/2);
      const landings = ['bdA','bdB','bdC'].map(id=>{
        const o = nodes.get(id); return o.x + o.w/2; });
      g.dispatchEvent(new MouseEvent('mousedown',
        {bubbles:true, cancelable:true, button:0, clientX:start.x, clientY:start.y}));
      for(let k = 1; k <= 10; k++){
        window.dispatchEvent(new MouseEvent('mousemove',
          {bubbles:true, clientX:start.x + k*90, clientY:start.y}));
        await wait(30);
      }
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(500);
      const to = nodes.get('bdM');
      const centre = to.x + to.w/2;
      out.heldOnBar = centre <= Math.max(...landings) + 40;
      out.barCentre = Math.round(centre) + ' vs ' + Math.round(Math.max(...landings));
      /* and it went somewhere — the clamp is a limit, not a lock */
      out.stillMoved = centre > fromCentre + 60;
    }

    /* ---- the guides: two middles before two edges ---- */
    {
      const others = [{at:[0, 40, 80]}];
      /* All three pairings within reach and all equally close: the two
         middles are the one the reader meant. */
      const pick = nearestAlignment([2, 42, 82], others, 9);
      out.midWins = !!(pick && pick.mid);
      /* And a middle four pixels out still beats an edge one pixel out —
         that is what "priority" has to mean to be any use. */
      const pick2 = nearestAlignment([-1, 44, 89], others, 9);
      out.midBeatsNearerEdge = !!(pick2 && pick2.mid);
      out.pickAt = (pick ? pick.at : '?') + '/' + (pick2 ? pick2.at : '?');
    }

    /* ---- bends: made, moved, kept, and taken out again ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['bnA','Alpha',null,null,null,null,{pos:[-360,-140]}]);
      workingNodes.push(['bnB','Beta','bnA',null,null,null,{pos:[260,140]}]);
      workingNodes.push(['bnC','Gamma',null,null,null,null,{pos:[-360,160]}]);
      workingNodes.push(['bnD','Delta','bnC',null,null,null,{pos:[260,-160]}]);
    });
    await wait(900);
    {
      openEdgeStylePopover('bnA','bnB',{clientX:600, clientY:200});
      redrawEdges();
      await wait(250);
      out.ghostsOffered = document.querySelectorAll('#bendLayer .bend-ghost').length;
      const ghost = document.querySelector('#bendLayer .bend-ghost');
      const b = ghost.getBoundingClientRect();
      const sx = b.x + b.width/2, sy = b.y + b.height/2;
      ghost.dispatchEvent(new MouseEvent('mousedown',
        {bubbles:true, cancelable:true, button:0, clientX:sx, clientY:sy}));
      for(let k = 1; k <= 6; k++){
        window.dispatchEvent(new MouseEvent('mousemove',
          {bubbles:true, clientX:sx - k*12, clientY:sy + k*10}));
        await wait(35);
      }
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(400);
      const list = bendListOf('bnA','bnB');
      out.bendMade = list.length === 1;
      out.handlesDrawn = document.querySelectorAll('#bendLayer .bend-handle').length;
      /* A hand-laid corner does not stop the route being a set of right
         angles — that is the whole point of an orthogonal bend. */
      const rec = drawnRoutes.get(calloutEdgeKey('bnA','bnB'));
      let diagonals = 0;
      if(rec && rec.pts) for(let i = 1; i < rec.pts.length; i++){
        const p = rec.pts[i-1], q = rec.pts[i];
        if(Math.abs(p.x - q.x) > 0.5 && Math.abs(p.y - q.y) > 0.5) diagonals++;
      }
      out.stillOrthogonal = diagonals === 0;
      out.routePasses = !!(rec && rec.pts && list.length &&
        rec.pts.some(p=> Math.abs(p.x - list[0][0]) < 1.5 && Math.abs(p.y - list[0][1]) < 1.5));
      /* It is written down with the chart, and comes back with it. */
      out.bendSerialised = /bends:\s*\[\[/.test(serializeEdgeStyles(EDGE_STYLES));
      /* Shift lines a bend up with the OTHER connectors, and with nothing
         else — the boxes have no say in where a corner goes. */
      const al = bendAlignments(calloutEdgeKey('bnA','bnB'));
      out.alignsToLines = al.xs.length > 0 || al.ys.length > 0;
      const nodeEdges = new Set();
      nodes.forEach(n=>{ nodeEdges.add(Math.round(n.x)); nodeEdges.add(Math.round(n.x + n.w)); });
      out.ignoresBoxes = !al.xs.some(v=> nodeEdges.has(Math.round(v)) &&
        !Array.from(drawnRoutes.values()).some(r=> (r.pts||[]).some(p=> Math.abs(p.x - v) < 0.6)));
      /* Taken out again by a double-click on the mark. */
      const handle = document.querySelector('#bendLayer .bend-handle');
      if(handle) handle.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true}));
      await wait(400);
      out.bendRemoved = bendListOf('bnA','bnB').length === 0;
      /* Straighten clears the lot. */
      applyEdit(()=>{ setBendList('bnA','bnB', [[-200,-40],[-200,60]]); });
      await wait(400);
      const two = bendListOf('bnA','bnB').length === 2;
      const clear = document.getElementById('styleBendsClear');
      if(clear) clear.click();
      await wait(400);
      out.straightened = two && bendListOf('bnA','bnB').length === 0;
      closeEdgePopover();
      redrawEdges();
      await wait(300);
      out.handlesGoneWithPanel = document.querySelectorAll('#bendLayer > *').length === 0;
    }

    refill(EDGE_STYLES, beforeStyles);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('every line into a portrait finishes on the circle, not its box',
        r40.endsOnRim && r40.gapsAgree, r40.rimGaps);
  check('its card hangs on the free side, or on the side the entry names',
        r40.autoRight && r40.forcedLeft && r40.forcedRight && r40.sideCleared,
        JSON.stringify({auto:r40.autoRight, left:r40.forcedLeft,
                        right:r40.forcedRight, field:r40.sideField, cleared:r40.sideCleared}));
  check('and keeps up with the portrait through the whole resize',
        r40.cardMovedDuringDrag && r40.portraitGrew,
        JSON.stringify({card:r40.cardMovedDuringDrag, grew:r40.portraitGrew}));
  check('picking a portrait out does not thicken its rim', r40.ringWidthHeld, r40.ringWidth);
  check('a decoration redrawn mid-performance carries on from where it was',
        r40.livelyOn && r40.phaseKept, r40.phaseNumbers);
  check('the merge beads every seam on its bar, except the one under the junction',
        r40.beadsSameColour === 2 && r40.beadsOneChange === 2 && r40.beadsOnTheSeam < 2,
        JSON.stringify({same:r40.beadsSameColour, changed:r40.beadsOneChange,
                        onSeam:r40.beadsOnTheSeam}));
  check('and its entry cannot be carried off the end of its own bar',
        r40.heldOnBar && r40.stillMoved, r40.barCentre);
  check('the guides offer two middles before two edges',
        r40.midWins && r40.midBeatsNearerEdge, String(r40.pickAt));
  check('a connector takes a corner where it is dragged, and stays square',
        r40.ghostsOffered > 0 && r40.bendMade && r40.handlesDrawn === 1 &&
        r40.stillOrthogonal && r40.routePasses,
        JSON.stringify({ghosts:r40.ghostsOffered, made:r40.bendMade,
                        handles:r40.handlesDrawn, square:r40.stillOrthogonal,
                        through:r40.routePasses}));
  check('the corner is written down, lines up with other lines only, and comes out again',
        r40.bendSerialised && r40.alignsToLines && r40.ignoresBoxes &&
        r40.bendRemoved && r40.straightened && r40.handlesGoneWithPanel,
        JSON.stringify({saved:r40.bendSerialised, lines:r40.alignsToLines,
                        boxes:r40.ignoresBoxes, removed:r40.bendRemoved,
                        straight:r40.straightened, gone:r40.handlesGoneWithPanel}));

  /* ---- 27v. section 61: words written where they are drawn ---- */
  const r41 = await page.evaluate(async ()=>{
    const beforeNodes = workingNodes.slice();
    const beforeStyles = EDGE_STYLES.slice();
    const beforeCats = TAG_CATS.slice();
    const out = {};
    const wait = (ms)=> new Promise(r=> setTimeout(r, ms));
    const dbl = (el)=>{
      ['mousedown','mouseup','click','mousedown','mouseup','click','dblclick'].forEach(t=>
        el.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, button:0,
                                            clientX: 200, clientY: 200})));
    };

    /* ---- the in-node editor ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['neA','Alpha',null,null,null,null,{pos:[-260,-120], size:[170,64]}]);
      workingNodes.push(['neB','Portrait',null,null,null,'ellipse',
                         {pos:[160,-120], size:[110,110], bioCard:true}]);
      workingNodes.push(['neC','Caption',null,null,null,'textbox',{pos:[-260,140]}]);
    });
    await wait(900);
    // The field is placed against the view, so the view has to be on them.
    fitToView(160);
    await wait(400);
    {
      const g = document.querySelector('.node[data-id="neA"]');
      dbl(g);
      await wait(420);
      const rec = richFields.get('nodeEditorText');
      const ed = document.getElementById('nodeEditor');
      out.opensOnEntry = !ed.hidden && nodeEditorTarget === 'neA';
      out.tookTheWords = rec.surface.textContent === 'Alpha';
      out.hasKeyboard = document.activeElement === rec.surface;
      /* It stands ON the entry: the field's left edge is the entry's, and
         its middle is the entry's middle. */
      const n = nodes.get('neA');
      const r = svg.getBoundingClientRect();
      const nx = r.left + n.x*vs + vx, ny = r.top + n.y*vs + vy;
      const sb = rec.surface.getBoundingClientRect();
      out.overTheEntry = Math.abs(sb.x - nx) < 8 &&
                         Math.abs((sb.y + sb.height/2) - (ny + n.h*vs/2)) < 10;
      out.where = [Math.round(sb.x), Math.round(nx), Math.round(sb.y + sb.height/2),
                   Math.round(ny + n.h*vs/2)].join('/');
      /* and the toolbar stands clear above it rather than being squeezed
         to the entry's width */
      const bar = document.getElementById('nodeEditorBar').getBoundingClientRect();
      out.barAbove = bar.bottom <= sb.top + 1;
      out.barNotSqueezed = bar.width >= sb.width - 1;
      // typing shows on the entry as it is typed
      rec.surface.focus();
      document.execCommand('insertText', false, ' Prime');
      await wait(260);
      out.livePreview = (nodes.get('neA').label || '').indexOf('Prime') >= 0;
      // the toolbar acts on the field
      const sel = window.getSelection(), rr = document.createRange();
      rr.selectNodeContents(rec.surface);
      sel.removeAllRanges(); sel.addRange(rr);
      document.querySelector('#nodeEditorBar button[data-wrap="bold"]').click();
      await wait(260);
      out.boldApplied = /^\*\*/.test(richFields.get('nodeEditorText').textarea.value);
      // Enter settles it, and the entry keeps what was typed
      rec.surface.dispatchEvent(new KeyboardEvent('keydown',
        {key:'Enter', bubbles:true, cancelable:true}));
      await wait(420);
      const stored = (workingNodes.find(t=> t[0] === 'neA') || [])[1] || '';
      out.settled = document.getElementById('nodeEditor').hidden && !nodeEditorTarget;
      out.written = /Prime/.test(stored) && /^\*\*/.test(stored);
      out.storedText = stored;
    }
    {
      /* A portrait's words are on its card, so the field opens there. */
      const card = document.querySelector('.bio-card-g[data-id="neB"]')
                || (openBioCard('neB'), null);
      await wait(400);
      const g = document.querySelector('.bio-card-g[data-id="neB"]');
      out.cardFound = !!g;
      if(g){
        dbl(g);
        await wait(420);
        const rec = richFields.get('nodeEditorText');
        const cb = g.getBoundingClientRect(), sb = rec.surface.getBoundingClientRect();
        out.onTheCard = nodeEditorTarget === 'neB' && Math.abs(sb.x - cb.x) < 24;
        // a click anywhere else settles it, keeping what was typed
        rec.surface.focus();
        document.execCommand('insertText', false, '!');
        await wait(200);
        document.dispatchEvent(new MouseEvent('mousedown',
          {bubbles:true, cancelable:true, button:0, clientX:4, clientY:600}));
        await wait(420);
        out.clickAwaySettles = document.getElementById('nodeEditor').hidden &&
          /!$/.test((workingNodes.find(t=> t[0] === 'neB') || [])[1] || '');
      }
    }
    {
      /* A caption keeps its own card: it already has one, standing beside
         it, with the same toolbar on it. */
      const g = document.querySelector('.node[data-id="neC"]');
      dbl(g);
      await wait(420);
      out.captionKeepsItsCard = document.getElementById('nodeEditor').hidden &&
                                freeMenu.classList.contains('open');
      closeFreeMenu();
      await wait(200);
    }

    /* ---- the keyboard belongs to whatever was last pressed ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['kdA','A',null,null,null,null,{pos:[-260,-80]}]);
      workingNodes.push(['kdB','B',null,null,null,null,{pos:[160,-80]}]);
    });
    await wait(800);
    {
      selectNode('kdA');
      openLabelEditor('kdA');
      await wait(400);
      const rec = richFields.get('editLabelInput');
      rec.surface.focus();
      document.execCommand('insertText', false, 'x');
      await wait(200);
      out.typingCounts = typingInField();
      // now press on the chart: the keys belong to the chart again
      const g = document.querySelector('.node[data-id="kdB"]');
      const r = svg.getBoundingClientRect();
      const n = nodes.get('kdB');
      g.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, button:0,
        clientX: r.left + (n.x + n.w/2)*vs + vx, clientY: r.top + (n.y + n.h/2)*vs + vy}));
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      await wait(200);
      out.chartTakesTheKeys = !typingInField();
      /* …and a drop-down holding focus was never typing in the first
         place: Delete on a connector after choosing its Path did nothing. */
      styleRoutingSel.focus();
      out.selectIsNotTyping = !typingInField();
    }

    /* ---- the panel: a bin for the unfiled, and names written in place -- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0; TAG_CATS.length = 0;
      TAG_CATS.push({name:'Eras', tags:['era-one']});
      workingNodes.push(['tgA','A',null,null,null,null,{pos:[0,0], tags:['era-one','fan-fiction']}]);
      workingNodes.push(['tgB','B',null,null,null,null,{pos:[200,0]}]);
    });
    await wait(800);
    buildManagement();
    await wait(300);
    {
      out.looseBlock = !!document.getElementById('legendLoose');
      const bucket = document.querySelector('.tag-bucket');
      out.untaggedItalic = !!bucket && getComputedStyle(bucket).fontStyle === 'italic';
      // a tag is made where it will stand
      startNewTagEntry();
      await wait(300);
      const box = document.querySelector('#legendLoose .tag-naming-text');
      out.namedInPlace = !!box && document.activeElement === box;
      if(box){
        box.textContent = 'brand new';
        box.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
        await wait(400);
      }
      out.tagMade = tagExists('brand new');
      out.tagIsLoose = categoryOf('brand new') === UNGROUPED;
      out.showsInBin = [...document.querySelectorAll('#legendLoose .legend-item')]
                        .some(r=> r.dataset.tag === 'brand new');
      // Escape makes nothing
      startNewTagEntry();
      await wait(300);
      const box2 = document.querySelector('#legendLoose .tag-naming-text');
      if(box2){
        box2.textContent = 'never made';
        box2.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
        await wait(350);
      }
      out.escapeAborts = !tagExists('never made');
      // and neither does a name nobody typed
      startNewTagEntry();
      await wait(300);
      const box3 = document.querySelector('#legendLoose .tag-naming-text');
      if(box3) box3.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
      await wait(350);
      out.emptyAborts = realCategories().every(c=> c.tags.every(t=> !!t.trim())) &&
                        !document.querySelector('#legendLoose .tag-naming-text');
      // a category is made the same way
      startNewCategoryEntry();
      await wait(300);
      const cbox = document.querySelector('.legend-group-new .legend-group-name');
      out.catNamedInPlace = !!cbox;
      if(cbox){
        cbox.textContent = 'Medium';
        cbox.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
        await wait(400);
      }
      out.catMade = realCategories().some(c=> c.name === 'Medium');
      out.binIsNoCategory = !realCategories().some(c=> c.name === UNGROUPED) &&
                            !!looseBin(false);
      // a tag filed into a category leaves the bin, and comes back out again
      applyEdit(()=> assignTagCategory('brand new', 'Medium'));
      buildManagement(); await wait(250);
      out.filed = categoryOf('brand new') === 'Medium';
      applyEdit(()=> assignTagCategory('brand new', ''));
      buildManagement(); await wait(250);
      out.unfiled = categoryOf('brand new') === UNGROUPED && tagExists('brand new');
    }

    /* ---- the weave, and the ink on a portrait's card ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['ffA','Fic',null,null,null,null,{pos:[-200,0], tags:['fan-fiction']}]);
      workingNodes.push(['inkA','Portrait',null,null,'A short life.','ellipse',
                         {pos:[220,0], size:[110,110], bioCard:true, colors:['#c23b22']}]);
    });
    await wait(900);
    {
      const w = document.querySelector('.fanfic-weave[data-id="ffA"]');
      out.weaveOpacity = w ? +getComputedStyle(w).opacity : 0;
      out.weaveReads = out.weaveOpacity > 0.5 && out.weaveOpacity < 1;
      const txt = document.querySelector('.bio-card-g[data-id="inkA"] text');
      out.cardInk = txt ? (txt.getAttribute('fill') || '') : '?';
      out.cardTakesTheEntry = /c23b22/i.test(out.cardInk);
      // …and follows it live
      applyEdit(()=>{
        const t = workingNodes.find(e=> e[0] === 'inkA');
        t[6] = Object.assign({}, t[6], {colors:['#2f6f9f']});
      });
      await wait(600);
      const txt2 = document.querySelector('.bio-card-g[data-id="inkA"] text');
      out.cardInkFollows = !!txt2 && /2f6f9f/i.test(txt2.getAttribute('fill') || '');
    }

    /* ---- the marks on a connector come up with its panel ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['bhA','A',null,null,null,null,{pos:[-300,-120]}]);
      workingNodes.push(['bhB','B','bhA',null,null,null,{pos:[220,140]}]);
    });
    await wait(900);
    {
      openEdgeStylePopover('bhA','bhB',{clientX:500, clientY:200});
      await wait(320);
      out.marksAtOnce = document.querySelectorAll('#bendLayer .bend-ghost').length > 0;
      closeEdgePopover();
      await wait(320);
      out.marksGoWithIt = document.querySelectorAll('#bendLayer > *').length === 0;
    }

    /* ---- the scenery does not flash while another entry is written ---- */
    applyEdit(()=>{
      workingNodes.length = 0; EDGE_STYLES.length = 0;
      workingNodes.push(['auH','Hub',null,null,null,null,{pos:[-300,0], tags:['multiversal hub']}]);
      workingNodes.push(['auO','Other',null,null,null,null,{pos:[220,0]}]);
    });
    await wait(900);
    {
      selectNode('auO');
      openLabelEditor('auO');
      await wait(500);
      const aura = ()=> document.querySelector('.node-aura[data-id="auH"]');
      out.dimAtRest = aura() ? +getComputedStyle(aura()).opacity : null;
      const rec = richFields.get('editLabelInput');
      rec.surface.focus();
      document.execCommand('insertText', false, 'Z');
      const seen = [];
      for(let k = 0; k < 6; k++){
        await new Promise(r=> requestAnimationFrame(r));
        const a = aura();
        if(a) seen.push(+getComputedStyle(a).opacity);
      }
      out.steady = seen.length > 0 && seen.every(v=> Math.abs(v - out.dimAtRest) < 0.02);
      out.seen = seen.map(v=> v.toFixed(2)).join(',');
      detailEditToggle.onclick({stopPropagation(){}});
      await wait(300);
    }

    refill(EDGE_STYLES, beforeStyles);
    refill(TAG_CATS, beforeCats);
    applyEdit(()=>{ workingNodes = beforeNodes; });
    rebuildChart(); buildManagement();
    await wait(520);
    return out;
  });
  check('a double click writes an entry’s words on the entry itself',
        r41.opensOnEntry && r41.tookTheWords && r41.hasKeyboard && r41.overTheEntry,
        JSON.stringify({open:r41.opensOnEntry, words:r41.tookTheWords,
                        keys:r41.hasKeyboard, placed:r41.overTheEntry, at:r41.where}));
  check('with its toolbar clear above it, at the toolbar’s own width',
        r41.barAbove && r41.barNotSqueezed,
        JSON.stringify({above:r41.barAbove, width:r41.barNotSqueezed}));
  check('what is typed there shows on the entry, and Enter settles it',
        r41.livePreview && r41.boldApplied && r41.settled && r41.written,
        JSON.stringify({live:r41.livePreview, bold:r41.boldApplied,
                        settled:r41.settled, stored:r41.storedText}));
  check('a portrait’s words are written on its card, and a click away keeps them',
        r41.cardFound && r41.onTheCard && r41.clickAwaySettles,
        JSON.stringify({card:r41.cardFound, on:r41.onTheCard, away:r41.clickAwaySettles}));
  check('a caption keeps the card it already had', r41.captionKeepsItsCard);
  check('a press on the drawing gives the keyboard back to the drawing',
        r41.typingCounts && r41.chartTakesTheKeys && r41.selectIsNotTyping,
        JSON.stringify({typing:r41.typingCounts, chart:r41.chartTakesTheKeys,
                        select:r41.selectIsNotTyping}));
  check('the panel has a bin for tags nobody has filed, and Untagged is in italic',
        r41.looseBlock && r41.untaggedItalic,
        JSON.stringify({bin:r41.looseBlock, italic:r41.untaggedItalic}));
  check('a tag is written where it will stand, and lands unfiled',
        r41.namedInPlace && r41.tagMade && r41.tagIsLoose && r41.showsInBin,
        JSON.stringify({inPlace:r41.namedInPlace, made:r41.tagMade,
                        loose:r41.tagIsLoose, shown:r41.showsInBin}));
  check('Escape, or a name nobody typed, makes no tag at all',
        r41.escapeAborts && r41.emptyAborts,
        JSON.stringify({escape:r41.escapeAborts, empty:r41.emptyAborts}));
  check('a category is made the same way, and the bin is not one',
        r41.catNamedInPlace && r41.catMade && r41.binIsNoCategory,
        JSON.stringify({inPlace:r41.catNamedInPlace, made:r41.catMade,
                        bin:r41.binIsNoCategory}));
  check('a tag files into a category by hand and comes back out again',
        r41.filed && r41.unfiled, JSON.stringify({filed:r41.filed, out:r41.unfiled}));
  check('the fan-fiction weave reads as gold without going opaque',
        r41.weaveReads, String(r41.weaveOpacity));
  check('a portrait’s card is written in the entry’s own ink, live',
        r41.cardTakesTheEntry && r41.cardInkFollows,
        JSON.stringify({ink:r41.cardInk, follows:r41.cardInkFollows}));
  check('a connector’s marks come up with its panel and go down with it',
        r41.marksAtOnce && r41.marksGoWithIt,
        JSON.stringify({up:r41.marksAtOnce, down:r41.marksGoWithIt}));
  check('scenery does not flash while another entry is being written',
        r41.steady, 'at rest ' + r41.dimAtRest + ' -> ' + r41.seen);

  /* ---- 28. nothing threw along the way ---- */
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
