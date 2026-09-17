/* ---------------------------------------------------------------------
   The sticker library.

   A sticker is a small square picture that can be dropped into any text on
   the chart the way an emoji can — inside an entry's label, a note, a
   language tab, a loose text block. The library itself is a flat list of
   {key, name, src}; a text refers to one by key, so the same picture used
   in twenty places is stored once.
   ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Embedded media.

   A comment on an entry is a piece of prose, and prose that describes a
   reality wants to be able to SHOW it — a frame from the episode, a clip
   of the scene. So a comment may carry figures the way a document does:
   they stand in the flow of the text, on lines of their own, at whatever
   width the column gives them.

   The store is a flat list of {key, name, kind, src}, exactly like the
   sticker library, and a comment refers to one by key — so the same
   picture used in three comments is stored once. `src` is normally an
   embedded data: URI, which is what keeps the chart a single file that
   needs nothing from the network; a link is allowed too, for a clip too
   large to embed, and then the chart needs the network to show it.

   Figures are for the COMMENT, not for the chart's own drawing: an entry's
   box holds a name, and a video cannot be drawn into SVG text. So the
   token is parsed everywhere and rendered only where there is a document
   to put it in — see tokenizeLabel, which drops it for every other reader.
   ------------------------------------------------------------------ */
const MEDIA_KINDS = new Set(['image', 'video']);
function sanitizeMedia(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(m=>{
    if(!m || typeof m !== 'object') return;
    const key = typeof m.key === 'string' ? m.key.trim() : '';
    if(!key || !/^[A-Za-z0-9_-]+$/.test(key) || seen.has(key)) return;
    const src = typeof m.src === 'string' ? m.src.trim() : '';
    if(!mediaSrcOk(src)) return;
    seen.add(key);
    out.push({key, name: typeof m.name === 'string' ? m.name : key,
              kind: MEDIA_KINDS.has(m.kind) ? m.kind : 'image', src});
  });
  return out;
}
/* A figure is either carried in the file or fetched from the web, and
   nothing else. `data:` is how an embedded one travels; http(s) is how a
   linked one is reached. Everything else — javascript:, blob:, a bare
   file path — is refused, for the same reason an entry's link is: a chart
   can arrive from someone else, and opening it must not run their code. */
function mediaSrcOk(src){
  if(typeof src !== 'string' || !src) return false;
  /* An embedded one, header and all. Split on the marker rather than
     matched in one pattern: a real media type can carry parameters, and a
     browser's own recorder writes `;codecs=vp9,opus` — a comma inside the
     header, which no single expression reads without also swallowing the
     payload. What matters is what stands before `;base64,`. */
  const at = src.indexOf(';base64,');
  if(at > 5 && src.slice(0, 5).toLowerCase() === 'data:'){
    return /^(image|video)\/[a-z0-9.+-]+/i.test(src.slice(5, at));
  }
  return !!safeUrl(src) && /^https?:/i.test(safeUrl(src));
}
/* The same question about a picture that is not a figure.
 *
 * A sticker and an entry's portrait are drawn the same way a figure is, out
 * of bytes that can have come from somebody else's file — and they were not
 * asked it. Import sanitized MEDIA, TAGCATS and REFS and passed STICKERS
 * straight through, while a portrait went in as whatever `opts.image` said;
 * nothing about that ran anyone's code, because an <img> and an SVG <image>
 * do not execute a `javascript:` source, but "it happens not to be an <a>"
 * is not a rule anybody wrote down. A src on a foreign chart could still
 * name a host, and opening the chart would call on it.
 *
 * So the rule the figures already keep is the rule for every picture:
 * carried in the file, or fetched over http(s), and nothing else. Videos
 * are a figure's business alone — a sticker stands in a line of text. */
function pictureSrcOk(src){
  if(!mediaSrcOk(src)) return false;
  const at = src.indexOf(';base64,');
  if(at > 5 && src.slice(0, 5).toLowerCase() === 'data:'){
    return /^image\//i.test(src.slice(5, at));
  }
  return true;
}
/* A sticker library from somewhere else, admitted on the same terms the
   figures are: a key the markup could actually name, and a source that is
   a picture. An item failing either is dropped rather than refused, so a
   chart with one bad sticker in it still opens — which is what sanitizeMedia
   does, and for the same reason. */
function sanitizeStickers(list){
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach(s=>{
    if(!s || typeof s !== 'object') return;
    const key = typeof s.key === 'string' ? s.key.trim() : '';
    // The same shape the markup's {{s:key}} token will accept. A key outside
    // it could never be written down in a text, so it is not a sticker at
    // all — it is a record nothing can reach.
    if(!key || !/^[A-Za-z0-9_-]+$/.test(key) || seen.has(key)) return;
    const src = typeof s.src === 'string' ? s.src.trim() : '';
    if(!pictureSrcOk(src)) return;
    seen.add(key);
    out.push({key, name: typeof s.name === 'string' ? s.name : key, src});
  });
  return out;
}
const mediaMap = new Map();
function rebuildMediaMap(){
  mediaMap.clear();
  (typeof MEDIA !== 'undefined' ? MEDIA : []).forEach(m=>{
    if(m && m.key && m.src) mediaMap.set(m.key, m);
  });
}
rebuildMediaMap();
function mediaOf(key){ return mediaMap.get(key) || null; }
function uniqueMediaKey(base){
  let k = String(base || 'fig').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '').slice(0, 24) || 'fig';
  if(!mediaMap.has(k)) return k;
  let i = 2;
  while(mediaMap.has(k + '-' + i)) i++;
  return k + '-' + i;
}
/* One figure as HTML. It is contenteditable="false" so the caret steps
   over the whole thing rather than into it, and it carries its key so the
   writer can read it back out — the same contract a citation chip keeps. */
/* A figure's width, as a percentage of the column. Bounded at both ends:
   below a tenth it is a smudge nobody can see and cannot be grabbed to be
   made bigger again, and past the column there is nothing to gain. */
const FIGURE_MIN_W = 10;
function clampFigureWidth(v){
  const n = Math.round(Number(v));
  if(!Number.isFinite(n)) return null;
  return Math.max(FIGURE_MIN_W, Math.min(100, n));
}
function mediaFigureHtml(key, width){
  const m = mediaOf(key);
  if(!m){
    return `<span class="media-missing" data-media="${escapeHtml(key)}" contenteditable="false"` +
           ` title="This figure is no longer in the chart">\u25a2 figure</span>`;
  }
  const cap = escapeHtml(m.name || key);
  const inner = m.kind === 'video'
    ? `<video src="${escapeHtml(m.src)}" controls preload="metadata" playsinline></video>`
    : `<img src="${escapeHtml(m.src)}" alt="${cap}">`;
  const w = clampFigureWidth(width);
  /* The width is written on the element AND kept on a data attribute. The
     style is what the reader sees; the attribute is what the writer reads
     back, and reading a percentage back out of a style string is exactly
     the kind of round trip that loses a figure's size the first time a
     browser normalises it. */
  const sized = w ? ` data-w="${w}" style="width:${w}%"` : '';
  return `<span class="rich-figure" data-media="${escapeHtml(key)}"${sized} contenteditable="false"` +
         ` title="${cap}">${inner}<i class="fig-grip"></i></span>`;
}
const stickerMap = new Map();
function rebuildStickerMap(){
  stickerMap.clear();
  (typeof STICKERS !== 'undefined' ? STICKERS : []).forEach(s=>{
    if(s && s.key && s.src) stickerMap.set(s.key, s);
  });
}
rebuildStickerMap();
function stickerSrc(key){ const s = stickerMap.get(key); return s ? s.src : null; }
function stickerName(key){ const s = stickerMap.get(key); return s ? (s.name || key) : key; }
function stickerImgHtml(key){
  const src = stickerSrc(key);
  /* A sticker whose picture has been removed still carries its key. The
     placeholder used to be a bare span, so the editor could not tell it
     from a typed character: opening the entry and touching one key wrote
     the placeholder back as the literal ▢ and the citation was gone for
     good — even though deleting a sticker deliberately leaves the token
     behind so re-adding the picture brings it back. */
  if(!src) return `<span class="sticker-missing-inline" data-sticker="${escapeHtml(key)}" title="This sticker is no longer in the library">▢</span>`;
  return `<img class="sticker-inline" data-sticker="${escapeHtml(key)}" src="${escapeHtml(src)}" alt="${escapeHtml(stickerName(key))}">`;
}
/* A citation inside an editing surface is one atomic chip: contenteditable
   false, so the caret steps over it whole and a stray keystroke cannot
   leave "[1" behind. It shows the CURRENT number but carries the key, and
   only the key is read back out — see richHtmlToMarkup. */
function refChipHtml(key){
  const c = refColor();
  const style = c ? ` style="color:${escapeHtml(c)}"` : '';
  return `<span class="ref-chip" data-ref="${escapeHtml(key)}" contenteditable="false"${style} title="${escapeHtml(refTitle(key))}">${escapeHtml(refMarkText(key))}</span>`;
}
function refTitle(key){
  const i = refIndex(key);
  if(i < 0) return 'This reference no longer exists';
  return refBodyText(REFS[i]) || `Reference [${i+1}]`;
}
/* One run list as editor HTML. inlineToHtml is this, applied to a whole
   label; a reading's two halves go through it as well, which is what makes
   what is typed inside a reading look like what will be drawn. */
/* What a reading's half adds to the run it sits in.
 *
 * Both halves inherit that run — a reading inside a bold phrase is bold —
 * and the wrappers around the whole unit already say so. Writing the
 * inherited part again inside them said it twice, and every trip through
 * the editor wrapped it once more: `[[base|anno]]` in a bold phrase came
 * back as `[[**base**|**anno**]]`, then `[[****base****|…]]`, growing
 * without limit for as long as the label was edited. */
function rubyHalfRuns(unit, runs){
  const OWN = ['bold','italic','color','font','size','under','strike'];
  return (runs || []).map(rt=>{
    const c = Object.assign({}, rt);
    OWN.forEach(k=>{ if(unit[k] !== undefined && c[k] === unit[k]) delete c[k]; });
    return c;
  });
}
function runsToHtml(runs){
  return (runs || []).map(runToHtml).join('');
}
/* HTML is the one place a figure can actually be shown, so this is the one
   reader that asks for them. */
function inlineToHtml(label){
  return runsToHtml(tokenizeLabel(label, {media:true}));
}
function runToHtml(t){
  {
    /* Everything the run carries, wrapped from the outside in. A sticker
       and a citation are pictures rather than text, so bold, italic and
       colour are made inert on them by the stylesheet — but the SIZE
       wrapper still has to reach them, because both are drawn in `em` and
       that wrapper is how either of them is enlarged. */
    const inner =
      t.type === 'ref' ? refChipHtml(t.key) :
      t.type === 'media' ? mediaFigureHtml(t.key, t.w) :
      t.type === 'sticker' ? stickerImgHtml(t.key) :
      t.type === 'ruby'
        ? `<ruby>${runsToHtml(rubyHalfRuns(t, t.baseRuns))}` +
          `<rt>${runsToHtml(rubyHalfRuns(t, t.annoRuns))}</rt></ruby>` :
      escapeHtml(t.text);
    /* A figure takes no run dressing at all. Bold, a colour or a face on
       a paragraph says nothing about a picture inside it, and a size
       wrapper — which is how a sticker is enlarged — would fight the
       column width the figure is already sized to. */
    if(t.type === 'media') return inner;
    if(t.type === 'ref' || t.type === 'sticker'){
      return t.size
        ? `<span style="font-size:${t.size}px" data-size="${t.size}">${inner}</span>`
        : inner;
    }
    let html = inner;
    if(t.under || t.strike){
      const lines = [t.under ? 'underline' : '', t.strike ? 'line-through' : ''].filter(Boolean);
      const key = t.under || t.strike;
      const css = (LINE_STYLES[key] || LINE_STYLES.solid).css;
      html = `<span style="text-decoration-line:${lines.join(' ')};text-decoration-style:${css}"` +
             `${t.under ? ` data-under="${escapeHtml(t.under)}"` : ''}` +
             `${t.strike ? ` data-strike="${escapeHtml(t.strike)}"` : ''}>${html}</span>`;
    }
    if(t.italic) html = `<i>${html}</i>`;
    if(t.bold) html = `<b>${html}</b>`;
    if(t.size) html = `<span style="font-size:${t.size}px" data-size="${t.size}">${html}</span>`;
    if(t.font) html = `<span style="font-family:${escapeHtml(fontFamilyFor(t.font))}" data-font="${escapeHtml(t.font)}">${html}</span>`;
    if(t.color) html = `<span style="color:${escapeHtml(t.color)}">${html}</span>`;
    return html;
  }
}

