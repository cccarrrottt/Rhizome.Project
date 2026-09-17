/* Three rules, and no more than three, on purpose.
 *
 * They are run against the ASSEMBLED program, not against the parts — see
 * tools/lint.py, and the ignores below.
 *
 * A linter's value here is not style — the file has a voice, and a tool that
 * argued with it would be switched off within a week. It is the small class
 * of mistakes that an 18,000-line single-scope program makes easy and that no
 * test can catch, because none of them is wrong at the point it is written:
 *
 *   no-unused-vars   the dead binding. A helper kept "for symmetry", a name
 *                    left behind by a refactor. Eight of these were cut by
 *                    hand in 0.9.20; the point of the rule is that the ninth
 *                    is found the day it appears rather than a year later.
 *   no-undef         the typo that becomes an implicit global — the one
 *                    failure mode of a program with no modules and no
 *                    bundler, and the one that shows up as a blank chart.
 *   no-redeclare     two declarations of one name in one scope. In a file
 *                    this long the second is never deliberate, and the first
 *                    silently stops existing.
 *
 * Everything else is off. Adding a fourth rule should take an argument about
 * a bug it would have caught.
 */

/* The browser surface this page actually touches, written out rather than
 * pulled from the `globals` package. One dependency fewer, and a list that
 * says something true: everything on it is reached for somewhere in app.js,
 * so a name arriving here is a note that the page learned a new trick. */
const BROWSER = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  location: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  console: 'readonly', fetch: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  Image: 'readonly', Blob: 'readonly', URL: 'readonly', FileReader: 'readonly',
  XMLSerializer: 'readonly', DOMParser: 'readonly', CSS: 'readonly',
  Event: 'readonly', MouseEvent: 'readonly', KeyboardEvent: 'readonly',
  HTMLCanvasElement: 'readonly', MediaRecorder: 'readonly',
  getComputedStyle: 'readonly', matchMedia: 'readonly', alert: 'readonly',
  performance: 'readonly', crypto: 'readonly', btoa: 'readonly', atob: 'readonly',
  MutationObserver: 'readonly', ResizeObserver: 'readonly',
  /* Not everywhere yet: the custom-highlight API is feature-detected before
     use, which is exactly why it has to be declared — an undeclared name in
     a `typeof` guard reads to the linter like the typo it is guarding against. */
  Highlight: 'readonly',
  /* The host's own injected global. Its absence is meaningful: see HOSTED. */
  claude: 'readonly'
};

/* src/data.js declares these and src/app.js works on them. They are one
 * scope in the built file — the build concatenates the two — which is what
 * this tells the linter, since it has no way to see the concatenation. */
const CHART_DATA = {
  NODES: 'readonly', EDGE_STYLES: 'readonly',
  STICKERS: 'writable', MEDIA: 'writable', COMMENTS: 'writable',
  TAG_CATS: 'writable', REFS: 'writable', SETTINGS: 'writable'
};

const RULES = {
  /* `args: 'none'` — a handler that ignores its event still has to declare it.
     `caughtErrors: 'none'` — `catch(e){}` around storage and JSON is the
     house idiom for "this is allowed to fail", and naming the error is how
     the language spells that catch, not a claim that it will be read. */
  'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_'}],
  'no-undef': 'error',
  'no-redeclare': 'error'
};

export default [
  /* src/app/ is deliberately not linted where it lies: the parts are one
     scope assembled in order, and every one of these three rules asks a
     question that only has an answer about the whole program. tools/lint.py
     assembles it into .lint/app.js, lints that, and carries each message back
     to the part it came from — which is what `npm run lint` runs. */
  {ignores: ['dist/**', 'node_modules/**', 'src/app/**', '.backups/**']},
  {
    files: ['.lint/app.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'script',
      globals: {...BROWSER, ...CHART_DATA}
    },
    linterOptions: {reportUnusedDisableDirectives: true},
    rules: RULES
  },
  {
    /* The data file only declares; everything that reads it is next door, so
       "assigned but never used" is the normal state of every line in it. */
    files: ['src/data.js'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'script', globals: BROWSER},
    rules: {'no-redeclare': 'error', 'no-undef': 'error'}
  },
  {
    /* The test runner and the benchmark are Node, but most of their bodies
       are callbacks handed to Playwright's page.evaluate — source that is
       compiled in the BROWSER, against the chart's own scope, which nothing
       here can see. no-undef would report every one of those as an error and
       mean nothing by it. */
    files: ['tests/**/*.js', 'tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'script',
      globals: {require: 'readonly', module: 'writable', process: 'readonly',
                __dirname: 'readonly', Buffer: 'readonly', console: 'readonly',
                setTimeout: 'readonly', ...BROWSER, ...CHART_DATA}
    },
    rules: {'no-unused-vars': RULES['no-unused-vars'], 'no-redeclare': 'error'}
  }
];
