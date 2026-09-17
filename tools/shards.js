/* The whole suite, in parallel, in about a quarter of the time.
 *
 * tests/regression.js is 67 named scenarios that do not depend on one
 * another — which is checked rather than assumed: run it as four shards and
 * the four together print exactly the checks one whole run prints, by name.
 * So there is no reason to wait for them one after another.
 *
 *     node tools/shards.js            # dist, four ways
 *     node tools/shards.js src        # the split sources instead
 *     node tools/shards.js --shards=8
 *
 * Each shard gets a port of its own, because they all want 8830 otherwise
 * and that is the only way they collide. Output is collected rather than
 * interleaved: four suites printing at once is not a log anyone can read.
 * Failures are printed in full; passes are counted.
 */
const {spawn} = require('child_process');
const path = require('path');

const ARGS = process.argv.slice(2);
const MODE = ARGS.includes('src') ? 'src' : 'dist';
const flag = ARGS.find(a => a.startsWith('--shards='));
const N = flag ? Number(flag.slice(9)) : 4;
if (!Number.isInteger(N) || N < 1 || N > 16) {
  console.error(`--shards wants a whole number between 1 and 16, not ${flag && flag.slice(9)}`);
  process.exit(2);
}
// Away from 8830, so a sharded run and a plain one can overlap.
const BASE = Number(process.env.RHIZOME_TEST_PORT) || 8860;
const SUITE = path.join(__dirname, '..', 'tests', 'regression.js');

const runShard = (i) => new Promise((resolve) => {
  const args = [SUITE];
  if (MODE === 'src') args.push('src');
  args.push(`--shard=${i}/${N}`);
  const child = spawn(process.execPath, args, {
    env: {...process.env, RHIZOME_TEST_PORT: String(BASE + i)}
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('close', code => resolve({i, code, out}));
});

(async () => {
  const started = Date.now();
  console.log(`regression — ${MODE}, ${N} shards, ports ${BASE}..${BASE + N - 1}\n`);
  const results = await Promise.all([...Array(N).keys()].map(runShard));

  let pass = 0, fail = 0, scenarios = 0;
  for (const r of results.sort((a, b) => a.i - b.i)) {
    const m = r.out.match(/(\d+) passed, (\d+) failed — (\d+) scenario/);
    if (m) { pass += +m[1]; fail += +m[2]; scenarios += +m[3]; }
    const failures = r.out.split('\n').filter(l => l.startsWith('  FAIL'));
    const tally = m ? `${m[1]} passed, ${m[2]} failed, ${m[3]} scenarios` : 'no summary';
    console.log(`  shard ${r.i}  ${tally}${r.code ? '   (exit ' + r.code + ')' : ''}`);
    failures.forEach(l => console.log('      ' + l.trim()));
    // A shard that fell over without reaching its own summary has to be
    // shown whole: its output is the only account of what happened.
    if (!m) console.log(r.out.split('\n').map(l => '      ' + l).join('\n'));
  }

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n${pass} passed, ${fail} failed — ${scenarios} scenarios in ${secs}s\n`);
  process.exit(results.some(r => r.code) ? 1 : 0);
})();
