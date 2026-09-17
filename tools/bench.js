/* What a rebuild costs, and how much of it is text measurement.
 *
 * Drives dist/nexus.html in a real browser, replaces the chart with a
 * synthetic one of N entries, and times rebuildChart() with the calls to
 * measureTextBlock counted and timed separately — because the claim being
 * tested is that those calls are most of it.
 *
 * measureTextBlock is a top-level function declaration in a classic script,
 * so it is a property of the global object and can be wrapped from outside
 * without touching the page's source.
 *
 *     node tools/bench.js        # against dist/, so build first
 */
const {chromium} = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.BENCH_PORT || 8840);
const SIZES = [50, 200, 600];
const REPEATS = 5;

const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url).split('?')[0].replace(/^\/+/, '') || 'nexus.html';
  fs.readFile(path.join(ROOT, 'dist', rel), (e, b) => {
    if (e) { res.statusCode = 404; return res.end('no'); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(b);
  });
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const PINNED = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(
    fs.existsSync(PINNED) ? {executablePath: PINNED} : {});
  const ctx = await browser.newContext({viewport: {width: 1500, height: 950}});
  const page = await ctx.newPage();
  // The font hosts are unreachable through this sandbox's proxy. Aborting
  // them makes that explicit and keeps every run on the same fallback face,
  // which is what a comparison needs.
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/nexus.html`, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof rebuildChart === 'function');

  const rows = await page.evaluate(({sizes, repeats}) => {
    const orig = window.measureTextBlock;
    let calls = 0, spent = 0;
    window.measureTextBlock = function (...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      spent += performance.now() - t0;
      calls++;
      return r;
    };

    const chartOf = (n) => {
      const list = [];
      for (let i = 0; i < n; i++) {
        list.push(['b' + i,
                   'Entry number ' + i + (i % 3 === 0 ? '\nwith a second line' : ''),
                   i > 0 ? 'b' + (i - 1) : null,
                   null, null, null, {tags: ['t' + (i % 5)]}]);
      }
      return list;
    };

    const out = [];
    for (const n of sizes) {
      workingNodes = chartOf(n);
      rebuildChart();                       // settle; not measured
      const times = [];
      calls = 0; spent = 0;
      for (let k = 0; k < repeats; k++) {
        const t0 = performance.now();
        rebuildChart();
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      out.push({
        n,
        rebuildMs: +times[Math.floor(times.length / 2)].toFixed(1),
        measureCalls: Math.round(calls / repeats),
        measureMs: +(spent / repeats).toFixed(1)
      });
    }
    return out;
  }, {sizes: SIZES, repeats: REPEATS});

  console.log('entries   rebuild   measureTextBlock      share');
  for (const r of rows) {
    const share = ((r.measureMs / r.rebuildMs) * 100).toFixed(0);
    console.log(
      String(r.n).padStart(7) +
      String(r.rebuildMs + ' ms').padStart(10) +
      String(r.measureCalls + ' calls, ' + r.measureMs + ' ms').padStart(22) +
      String(share + '%').padStart(11));
  }

  await browser.close();
  srv.close();
})();
