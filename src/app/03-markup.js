/* ---------------------------------------------------------------------
   Inline label markup — **bold**, *italic*, [[base|ruby]] — plus the
   text-wrap helper built on top of it. A "word" here is a wrap unit:
   plain/bold/italic runs split on whitespace, but a ruby unit never
   splits (its base+annotation always stay on one line).
   ------------------------------------------------------------------ */
// {{#hex|text}} colours a run of text. The braces are doubled so a lone
// brace in ordinary prose is never mistaken for markup.
/* A reference is {{r:key}}. It is deliberately NOT "[3]".
 *
 * Typing [3] by hand must stay ordinary text — a chart about fiction is
 * full of bracketed numbers that are not citations, and a system that
 * silently claimed them would be worse than none. So a reference is a token
 * like every other piece of markup here, and the [3] a reader sees is
 * RENDERED, never stored: the number is the reference's position in the
 * list at the moment of drawing. Reorder the list and every mark in the
 * chart renumbers itself, which is the whole reason to store a key rather
 * than a number.
 *
 * The new alternative is appended rather than inserted, so the existing
 * capture-group numbers below are untouched. */
/* `opts.media` keeps embedded figures in the run list.
 *
 * They are dropped by default, and that default is what makes the rest of
 * the chart safe: every other reader of a run list — the box that measures
 * a label, the SVG that draws it, the search index, the plain-text
 * stripper — is drawing TEXT, and a figure is not text. Only the two
 * readers that render a document ask for them. */
function tokenizeLabel(label, opts){
  const out = [];
  parseMarkupInto(String(label === null || label === undefined ? '' : label), {}, out);
  return (opts && opts.media) ? out : out.filter(t=> t.type !== 'media');
}
/* Where the closing `}}` of a wrapper is, counting nested ones. */
function matchWrapEnd(src, from){
  let depth = 0;
  for(let i = from; i < src.length - 1; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){ depth++; i++; continue; }
    if(src[i] === '}' && src[i+1] === '}'){
      if(depth === 0) return i;
      depth--; i++;
    }
  }
  return -1;
}
/* Where the next run of at least `len` asterisks starts, skipping escaped
   ones and anything inside a `{{…}}` wrapper. */
function matchStarRun(src, from, len){
  for(let i = from; i < src.length; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){
      const e = matchWrapEnd(src, i + 2);
      if(e < 0) return -1;
      i = e + 1; continue;
    }
    /* A reading is stepped over whole, the same way a wrapper is. Its two
       halves carry markup of their own now, so the asterisks inside one of
       them are not the closing pair of a bold run that began outside it —
       and reading them as such split `**Bold [[**base**|…]] tail**` at the
       wrong place and left the whole label as plain text. */
    if(src[i] === '[' && src[i+1] === '['){
      const bar = rubySplit(src, i + 2);
      const end = bar >= 0 ? rubyEnd(src, bar + 1) : -1;
      if(end >= 0){ i = end + 1; continue; }
    }
    if(src[i] !== '*') continue;
    let run = 0;
    while(src[i + run] === '*') run++;
    if(run >= len) return i;
    i += run - 1;
  }
  return -1;
}
/* The markup, parsed as a TREE and flattened into runs that each carry
   everything true of them at once.
 *
 * It used to be one regular expression producing a flat list where a run
 * was bold OR coloured OR set in a face, never two of them — and the
 * editor could not know that. Pressing Bold and then Italic on the same
 * word wrote `***text***`, which the flat grammar read as a stray asterisk,
 * a bold run and another stray asterisk, and the chart showed the
 * asterisks. Choosing a face and then a size wrote a wrapper inside a
 * wrapper, whose body the flat pattern `[^}]*` cut short at the inner
 * closing brace, and the chart showed the raw `{{z:14|word}}`. Both are
 * two ordinary clicks.
 *
 * A run of asterisks is read by its LENGTH — three means bold and italic
 * together, which is what the editor writes for both — and a wrapper's
 * body is found by matching braces rather than by stopping at the first
 * one. A backslash escapes the character after it, so an entry that says
 * `2 \* 3` is two, an asterisk, three. */
/* The kinds of line the text engine can draw under a word or through it.
 *
 * The same variety a connector offers, as far as type allows: a browser
 * draws a text decoration in one of five styles and dash-dot is not among
 * them, so the connector's ─· is answered here by a double rule, which is
 * the one classical text line the connector has no use for. Each key is
 * what the markup stores, so these names are part of the saved format. */
const LINE_STYLES = {
  solid:  {label:'\u2500\u2500', css:'solid'},
  dashed: {label:'\u254C\u254C', css:'dashed'},
  dotted: {label:'\u2508\u2508', css:'dotted'},
  double: {label:'\u2550\u2550', css:'double'},
  wavy:   {label:'\u223F',        css:'wavy'}
};
/* The `|` that divides a reading's two halves, and the `]]` that ends it —
   found by scanning, so that a half containing a `{{…}}` wrapper (whose
   body may hold anything) does not end the unit early. Escapes are
   honoured; neither half may hold a bare `|` or `]` of its own, which is
   what the writer guarantees. */
function rubySplit(src, from){
  for(let i = from; i < src.length; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){
      const e = matchWrapEnd(src, i + 2);
      if(e < 0) return -1;
      i = e + 1; continue;
    }
    if(src[i] === ']') return -1;
    if(src[i] === '|') return i;
  }
  return -1;
}
function rubyEnd(src, from){
  for(let i = from; i < src.length - 1; i++){
    if(src[i] === '\\'){ i++; continue; }
    if(src[i] === '{' && src[i+1] === '{'){
      const e = matchWrapEnd(src, i + 2);
      if(e < 0) return -1;
      i = e + 1; continue;
    }
    if(src[i] === ']' && src[i+1] === ']') return i;
  }
  return -1;
}
// The words a run list says, with nothing of how they are set.
function runsText(runs){
  return (runs || []).map(t=> t.type === 'plain' ? t.text
    : t.type === 'ruby' ? t.base : '').join('');
}
function parseMarkupInto(src, st, out){
  let i = 0, buf = '';
  const flush = ()=>{
    if(!buf) return;
    out.push(Object.assign({type:'plain', text:buf}, st));
    buf = '';
  };
  while(i < src.length){
    const ch = src[i];
    if(ch === '\\' && i + 1 < src.length){ buf += src[i+1]; i += 2; continue; }
    if(ch === '{' && src[i+1] === '{'){
      /* A figure may carry a width, as a percentage of the column it
         stands in: `{{m:key@60}}`. A percentage rather than pixels because
         the same comment is read in a drawer, in an exported page and in
         whatever width the reader's window happens to be — a figure set to
         "half the column" stays half the column everywhere, and a figure
         set to 380px is right in exactly one of them. */
      const atomic = /^\{\{([srm]):([A-Za-z0-9_-]+)(?:@(\d{1,3}))?\}\}/.exec(src.slice(i));
      if(atomic){
        flush();
        const kind = {s:'sticker', r:'ref', m:'media'}[atomic[1]];
        const tok = Object.assign({type: kind, key: atomic[2]}, st);
        if(kind === 'media' && atomic[3]) tok.w = clampFigureWidth(+atomic[3]);
        out.push(tok);
        i += atomic[0].length;
        continue;
      }
      const head = /^\{\{(#[0-9a-fA-F]{3,8}|f:[A-Za-z0-9_-]+|z:\d{1,2}(?:\.\d)?|[ut]:[a-z]+)\|/.exec(src.slice(i));
      if(head){
        const bodyAt = i + head[0].length;
        const endAt = matchWrapEnd(src, bodyAt);
        if(endAt >= 0){
          flush();
          const tag = head[1];
          const next = Object.assign({}, st);
          if(tag[0] === '#') next.color = tag;
          else if(tag[0] === 'f') next.font = tag.slice(2);
          else if(tag[0] === 'z') next.size = +tag.slice(2);
          // A line UNDER the words or THROUGH them, in one of the same
          // kinds of line a connector can be drawn in. See LINE_STYLES.
          else if(tag[0] === 'u') next.under = LINE_STYLES[tag.slice(2)] ? tag.slice(2) : 'solid';
          else next.strike = LINE_STYLES[tag.slice(2)] ? tag.slice(2) : 'solid';
          parseMarkupInto(src.slice(bodyAt, endAt), next, out);
          i = endAt + 2;
          continue;
        }
      }
      buf += ch; i++; continue;
    }
    if(ch === '[' && src[i+1] === '['){
      /* A reading, whose two halves are markup in their own right.
       *
       * They used to be plain strings, and the unit took the look of the
       * run around it whole — so an annotation written over a bold red
       * word was bold and red because the word was, and there was no way
       * to say otherwise. Each half is parsed on its own now: the base
       * still inherits the run it sits in, and the annotation starts from
       * the run too but can be given anything of its own on top.
       *
       * Scanned rather than matched by a pattern, because a half may now
       * contain `{{…}}` wrappers with braces of their own. */
      const bar = rubySplit(src, i + 2);
      if(bar >= 0){
        const end = rubyEnd(src, bar + 1);
        if(end >= 0){
          flush();
          const baseRuns = [], annoRuns = [];
          parseMarkupInto(src.slice(i + 2, bar), Object.assign({}, st), baseRuns);
          parseMarkupInto(src.slice(bar + 1, end), Object.assign({}, st), annoRuns);
          out.push(Object.assign({type:'ruby',
            base: runsText(baseRuns), anno: runsText(annoRuns),
            baseRuns, annoRuns}, st));
          i = end + 2;
          continue;
        }
      }
    }
    if(ch === '*'){
      let run = 0;
      while(src[i + run] === '*') run++;
      const use = Math.min(run, 3);
      const closeAt = matchStarRun(src, i + use, use);
      if(closeAt >= 0){
        flush();
        const next = Object.assign({}, st);
        if(use >= 2) next.bold = true;
        if(use === 1 || use === 3) next.italic = true;
        parseMarkupInto(src.slice(i + use, closeAt), next, out);
        i = closeAt + use;
        continue;
      }
    }
    buf += ch; i++;
  }
  flush();
}
/* The inverse: text as it would be WRITTEN, with anything that would
   otherwise be read as markup escaped. Typing "2 * 3 = 6 and 4 * 5 = 20"
   used to store those asterisks raw, and the chart rendered the middle of
   the sentence in italics with both of them swallowed. */
function escapeMarkup(text){
  /* Braces, one at a time.
   *
     `}}` closes a wrapper, and it was not escaped at all: colouring `a}}b`
     wrote `{{#c23b22|a}}b}}`, which reads back as a red `a` followed by a
     plain `b}}` — the styling stopping halfway through the run with a pair
     of braces printed on the chart.
   *
     Escaping the PAIR is not enough either, because the pairs are matched
     without overlapping: `}}}` would become `\}}` + `}`, and the scanner
     that finds where a wrapper's body ends — which reads a backslash as
     covering exactly one character — would step over the first brace and
     stop on the next two. One backslash per brace is the only form that
     survives any number of them in a row. */
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/([{}])/g, '\\$1')
    .replace(/\[\[/g, '\\[[');
}
/* Splitting a text into wrap units, and remembering which of them were
   written with no space between.
 *
 * Every unit used to start a fresh word, so the layout put an inter-word
 * space in front of each one. For a citation written flush against the
 * word it cites — "Uprising{{r:bw}}", which is how a citation is always
 * written — that produced "Uprising [1]", floating the mark away from the
 * thing it belongs to. Same for a sticker mid-word.
 *
 * `glue` says "no space before this one". It already existed for the
 * character-split fallback; here it is set from the source text, so the
 * rendered spacing matches what was typed. */
function expandForWrap(tokens){
  const words = [];
  let glue = false;   // the next unit continues the previous one
  /* A break that has not landed on a word yet.
   *
   * `br` is carried on the FIRST word after the newline, and until this it
   * was a per-token local — so a break that fell at the end of a run, or
   * between two runs, was set on a token that then pushed no more words
   * and was thrown away with it. `one\ntwo` broke; `one\n**two**` did not,
   * and neither did a line beginning with a colour, a sticker or a
   * citation. The editor showed two lines and the chart drew one. */
  let brk = false;
  const push = w=>{
    words.push(Object.assign(w, {glue: glue && words.length > 0, br: brk}));
    brk = false;
    glue = true;
  };
  tokens.forEach(tok=>{
    /* A ruby unit, a sticker and a reference mark are each one indivisible
       wrap unit. A reference in particular must never break: "[" at the end
       of one line and "12]" at the start of the next would read as two
       different things. */
    if(tok.type==='ruby' || tok.type==='sticker' || tok.type==='ref'){
      push(Object.assign({}, tok));
      return;
    }
    /* A newline is a line break, not a character inside a word.
     *
     * Pressing Enter in the editor writes one, and the field showed the
     * break — but the chart did not: the text was split on spaces only, so
     * "one\ntwo" stayed one wide unbreakable word that the wrapper then
     * pushed around trying to fit. The break is carried on the first word
     * after it and honoured where the lines are actually assembled. */
    const text = tok.text || '';
    text.split('\n').forEach((chunk, ci)=>{
      if(ci > 0){ brk = true; glue = false; }
      chunk.split(' ').forEach((w, i)=>{
        // An empty fragment IS the space: it breaks the glue and draws nothing.
        if(w === ''){ glue = false; return; }
        if(i > 0) glue = false;
        // Everything the run carries travels with each of its words: a word
        // can be bold AND coloured AND set at its own size at once.
        push(Object.assign({}, tok, {text:w}));
      });
    });
  });
  return words;
}
// A sticker occupies about two characters' worth of the character-count
// wrap pass; the pixel pass below measures it exactly.
function wordLen(w){
  if(w.type==='sticker') return 2;
  if(w.type==='ref') return refMarkText(w.key).length;
  return w.type==='ruby' ? w.base.length : w.text.length;
}
/* What a reference mark reads as. A key with no reference behind it still
   draws something — "[?]" — rather than vanishing: a dangling mark is a
   mistake the author should be able to see and fix, and silently dropping
   it would hide the very thing that needs attention. */
/* A citation is a mark, not a word: it should read as a superscript beside
   the text rather than as a second, slightly smaller word standing in it.
   At 0.72 of the body it was still large enough to compete with what it
   cites — on an entry's own label, where the type is already small, a
   bracketed number took as much room as a syllable. */
const REF_FS_SCALE = 0.56;   // marks are set smaller than the text they cite
const REF_RISE = 0.38;       // ...and raised by this much of the body size
function refIndex(key){
  for(let i=0;i<REFS.length;i++) if(REFS[i].key === key) return i;
  return -1;
}
/* One colour for every citation on the chart.
 *
 * It used to be per-reference, which made the marks a rainbow: the number
 * in a sentence is a citation FIRST and a particular source second, and
 * having each one a different colour said the opposite. It is a chart-wide
 * setting now, and lives in SETTINGS with the other chart-wide choices. */
const DEFAULT_REF_COLOR = '#c23b22';
function refColor(){
  return (SETTINGS && SETTINGS.refColor) || DEFAULT_REF_COLOR;
}
function refMarkText(key){
  const i = refIndex(key);
  return i < 0 ? '[?]' : '[' + (i+1) + ']';
}
// A sticker draws as a square a little taller than the text it sits in,
// so it reads as a glyph rather than as an illustration.
/* A sticker stands in a sentence as a letter does, so it is set to the
   height of a CAPITAL of the text around it. It used to be one and a half
   times the type size — taller than any letter in the line, so a sticker
   dropped into a label pushed the whole line apart to make room for
   itself. The cap height of the faces used here is about seven tenths of
   the size; a hair over that keeps a square picture reading as the same
   weight as a capital rather than slightly lighter. */
const STICKER_CAP = 0.78;
function stickerBox(fontSize){ return (fontSize || NODE_FS) * STICKER_CAP; }
// Real rendered width of one wrapped line's word list, including the
// inter-word spaces (glued fragments sit flush, so they contribute none) —
// the same arithmetic layoutLine uses to place them.
/* How wide a reading's half comes out, set the way it will be drawn: each
   of its runs measured in its own face, weight and size. */
function runsWidth(runs, fallback, family){
  return (runs || []).reduce((w, t)=>{
    if(t.type !== 'plain') return w + 0;
    return w + measureText(t.text, {bold: !!t.bold, italic: !!t.italic,
      fontSize: t.size || fallback,
      family: t.font ? fontFamilyFor(t.font) : family});
  }, 0);
}
function lineWidth(words, fontOpts){
  const fontSize = (fontOpts && fontOpts.fontSize) || undefined;
  const family = (fontOpts && fontOpts.family) || undefined;
  const SPACE_W = measureText(' ', {fontSize, family}) || 3;
  let total = 0;
  words.forEach((w,i)=>{
    if(i>0 && !w.glue) total += SPACE_W;
    total += w.type==='sticker' ? stickerBox(w.size || fontSize)
      : w.type==='ruby'
      ? runsWidth(w.baseRuns, w.size || fontSize, family)
      : w.type==='ref'
      ? measureText(refMarkText(w.key), {fontSize:(w.size || fontSize || NODE_FS)*REF_FS_SCALE, family})
      : measureText(w.text, {bold: !!w.bold, italic: !!w.italic,
                             fontSize: w.size || fontSize,
                             family: w.font ? fontFamilyFor(w.font) : family});
  });
  return total;
}
// `fit`, when given as {maxWidth, fontSize, family}, adds a second wrap
// pass measured in real pixels. The primary pass counts characters, which
// is right for Latin text and is what every label on this chart has always
// used — but a character count assumes every glyph is about one Latin
// character wide, and full-width scripts (CJK, Hangul) are roughly double
// that, so a "24-character" line of Japanese ran well past the node's
// border. The measured pass only ever splits a line further, so labels
// that already fit keep byte-for-byte the layout they had before.
function wrapLabel(label, maxChars, fit){
  let words = expandForWrap(tokenizeLabel(label));
  /* A label written on ONE line stays on one line.
   *
     Wrapping is for text the author laid out as a paragraph; a name typed
     straight across is a name, and breaking it in half at whatever
     character the box happened to end on read as a mistake in the chart
     rather than a fact about the entry. So a single-line text is never
     broken by the measurer: the box widens to hold it, and past the width
     a box is allowed to reach the text is simply clipped at the border —
     the same bargain a spreadsheet cell makes. Breaks the author typed
     still break, because those ARE the author's layout. */
  const noWrap = !!(fit && fit.noWrap);
  // A "word" that could never fit on a line by itself (nothing to break on
  // — CJK/Hangul running text has no spaces, or it's simply one long
  // unbroken run) gets split into individual characters, glued together
  // with no inter-character space, so it wraps like everything else
  // instead of silently overflowing the node's boundary.
  words = words.flatMap(w=>{
    if(noWrap) return [w];
    if(w.type==='ruby' || w.type==='sticker' || w.type==='ref' || wordLen(w) <= maxChars) return [w];
    // The first character keeps whatever glue the whole word had, or the
    // split would reintroduce the space this word was written without.
    return Array.from(w.text).map((ch,i)=>
      Object.assign({}, w, {text:ch, glue: i>0 || !!w.glue}));
  });
  let lines = [];
  let cur = [], curLen = 0;
  words.forEach(w=>{
    // A break the author typed wins over anything the measuring says.
    if(w.br && cur.length){ lines.push(cur); cur = []; curLen = 0; }
    const len = wordLen(w);
    const gap = (cur.length && !w.glue) ? 1 : 0;
    const testLen = curLen + gap + len;
    if(!noWrap && testLen > maxChars && cur.length){
      lines.push(cur); cur = [w]; curLen = len;
    } else {
      cur.push(w); curLen = testLen;
    }
  });
  if(cur.length) lines.push(cur);

  if(fit && fit.maxWidth > 0 && !noWrap){
    const fontOpts = {fontSize: fit.fontSize, family: fit.family};
    const refit = [];
    lines.forEach(lineWords=>{
      if(lineWidth(lineWords, fontOpts) <= fit.maxWidth){ refit.push(lineWords); return; }
      let acc = [];
      lineWords.forEach(w=>{
        const test = acc.concat([w]);
        if(acc.length && lineWidth(test, fontOpts) > fit.maxWidth){
          refit.push(acc); acc = [w];
        } else {
          acc = test;
        }
      });
      if(acc.length) refit.push(acc);
    });
    lines = refit;
  }
  return lines.map(words=>({
    words,
    hasRuby: words.some(w=>w.type==='ruby'),
    hasSticker: words.some(w=>w.type==='sticker')
  }));
}
function stripMarkup(label){
  return tokenizeLabel(label).map(t=>{
    if(t.type==='ruby') return t.base;
    if(t.type==='sticker') return '';
    return t.text;
  }).join('');
}
/* A link on an entry becomes a real <a href>, and a chart can now arrive
   from a file someone else wrote — so the two are no longer independent.
   "javascript:" and "data:" hrefs both execute on click, which would turn
   opening a shared chart into running its author's code. Only the schemes
   that merely navigate are allowed through; anything else renders as no
   link at all rather than as a link that quietly does something else.
   Protocol-relative and relative URLs resolve against this page, which is
   why they are resolved here rather than pattern-matched. */
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'ftp:']);
function safeUrl(raw){
  if(typeof raw !== 'string') return null;
  const t = raw.trim();
  if(!t) return null;
  let u;
  try{ u = new URL(t, location.href); }
  catch(e){ return null; }
  return SAFE_URL_SCHEMES.has(u.protocol) ? u.href : null;
}
/* Text going into HTML — including into an ATTRIBUTE, which is why the
   quotes are here. Chart data is not all typed by the person looking at
   it: a file brought in from somewhere else carries whatever it carries,
   and a reference title or a sticker name holding a `"` would otherwise
   close the attribute it was written into and let the rest of the value
   be read as markup. */
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

