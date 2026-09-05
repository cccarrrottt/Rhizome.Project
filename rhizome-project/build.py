#!/usr/bin/env python3
"""Assemble the split sources into the single self-contained page.

    python3 build.py                 build dist/ from src/
    python3 build.py --pull live.html   take the chart's data out of a saved
                                        copy of the live artifact first

WHY A BUILD STEP AT ALL

A published artifact is served under a Content Security Policy that blocks
every external host, so the page it serves has to be one file with the CSS
and JavaScript inside it. That is a bad way to WRITE the thing, so the
sources live apart — src/index.html, src/style.css, src/data.js, src/app.js
— and this script welds them into dist/nexus.html for publishing.

src/index.html is a real, standalone document: open it through any local
server and the chart runs, with the stylesheet and scripts loaded normally.
Only the built file has them inlined, and the built file also drops the
doctype/head/body wrapper, because the artifact host supplies its own.

THREE OUTPUTS

  dist/nexus.html        the editable chart; published WITH the artifact
                         write capability, which is what makes Save work
  dist/nexus-share.html  the same chart with no write capability, so it can
                         be shared to a public link; it knows it is a reader
                         from the first frame rather than finding out when
                         someone presses Save
  dist/nexus-standalone.html
                         the same chart wrapped in a real <!doctype html>
                         document, for hosting anywhere or opening straight
                         off disk. Nothing about the page needs claude.ai:
                         with no host to publish to, Save keeps the chart in
                         the browser instead, and Export writes a fresh copy
                         of this same file with the current data baked in.

WHERE THE CHART'S CONTENTS LIVE

Not here. Pressing Save in the published page rewrites the @@EDIT@@ regions
of the PUBLISHED file, so the live artifact — not src/data.js — holds the
current entries, connector styles and stickers. A plain rebuild therefore
carries those regions over from the existing dist/nexus.html instead of
resetting them to whatever src/data.js happens to say. If you have edited
the chart in the browser since the last build, save that page and pass it
with --pull so the edits come back into the sources.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / 'src', ROOT / 'dist'
REGIONS = ['NODES', 'COMMENTS', 'STICKERS', 'MEDIA', 'EDGESTYLES', 'TAGCATS', 'REFS', 'SETTINGS']
PAGE_BEGIN = '<!-- @@PAGE:BEGIN@@ -->'
PAGE_END = '<!-- @@PAGE:END@@ -->'


def read(p: Path) -> str:
    return p.read_text(encoding='utf-8')


def slice_between(text, begin, end, what):
    """The text between two markers, or a clear error naming what is wrong."""
    a = text.find(begin)
    b = text.find(end)
    if a < 0 or b < 0 or b < a:
        sys.exit(f'build: {what} — could not find {begin} … {end}')
    return text[a + len(begin):b]


def region(text, name):
    """One @@EDIT@@ block, markers included, or None if the file has none."""
    m = re.search(rf'/\* @@EDIT:{name}:START@@ \*/.*?/\* @@EDIT:{name}:END@@ \*/',
                  text, re.S)
    return m.group(0) if m else None


def carry_data(data_js, source_text, label):
    """Replace src/data.js's regions with the ones in `source_text`."""
    carried = []
    for name in REGIONS:
        live = region(source_text, name)
        if live is None:
            continue
        pattern = rf'/\* @@EDIT:{name}:START@@ \*/.*?/\* @@EDIT:{name}:END@@ \*/'
        if not re.search(pattern, data_js, re.S):
            sys.exit(f'build: src/data.js has no {name} region to replace')
        data_js = re.sub(pattern, lambda _m: live, data_js, count=1, flags=re.S)
        carried.append(name)
    if carried:
        print(f'  carried {", ".join(carried)} from {label}')
    return data_js


def build():
    index = read(SRC / 'index.html')
    head = slice_between(index, '<!-- @@HEAD:BEGIN@@ -->', '<!-- @@HEAD:END@@ -->',
                         'src/index.html head block').strip('\n')
    body = slice_between(index, '<!-- @@BODY:BEGIN@@ -->', '<!-- @@BODY:END@@ -->',
                         'src/index.html body block').rstrip('\n')
    css = read(SRC / 'style.css')
    data_js = read(SRC / 'data.js')
    app_js = read(SRC / 'app.js')

    # The live page is the authority on the chart's contents; a code-only
    # rebuild must not roll them back to the sources' seed data.
    pull = None
    if '--pull' in sys.argv:
        i = sys.argv.index('--pull')
        if i + 1 >= len(sys.argv):
            sys.exit('build: --pull needs a file to read')
        pull = Path(sys.argv[i + 1])
        if not pull.exists():
            sys.exit(f'build: {pull} does not exist')
        data_js = carry_data(data_js, read(pull), pull.name)
        (SRC / 'data.js').write_text(data_js, encoding='utf-8')
        print(f'  wrote those regions back into src/data.js')
    elif (DIST / 'nexus.html').exists():
        data_js = carry_data(data_js, read(DIST / 'nexus.html'), 'dist/nexus.html')

    # Markers around everything the page is made of.
    #
    # A published page has to be able to read its own source back in order
    # to save an edited copy of itself. Fetching its own URL is the good
    # way, but a host may refuse that, and the fallback — serialising the
    # live DOM — hands back whatever the HOST also put in the document,
    # not just us. Saving that embeds the host's own runtime into the
    # chart, and the next load runs it twice; a downloaded copy carries
    # references to things that are not there at all.
    #
    # These markers make the fallback exact: the page can cut out its own
    # content and nothing else, and what it cuts is a fragment by
    # construction, which is what the artifact host expects to be handed.
    # The opening marker goes AFTER the charset meta, not before it.
    #
    # A comment that appears before <html> is attached to the document, not
    # to <head>, and documentElement.outerHTML starts at <html> — so a
    # marker in the first line is simply not there when the page serialises
    # itself, which is the one situation it exists for. After the first
    # element the parser is inside <head> and keeps it.
    charset = '<meta charset="utf-8">'
    head_rest = head[len(charset):].lstrip('\n') if head.startswith(charset) else head
    page = (f'{charset}\n{PAGE_BEGIN}\n{head_rest}\n\n<style>{css}</style>{body}\n\n'
            f'<script>\n{data_js.rstrip(chr(10))}\n{app_js}</script>\n{PAGE_END}\n')

    DIST.mkdir(exist_ok=True)
    (DIST / 'nexus.html').write_text(page, encoding='utf-8')
    print(f'  dist/nexus.html        {len(page):>8,} chars')

    # The share copy: same page, minus any ability to write itself.
    title = '<title>Rhizome Project</title>'
    if page.count(title) != 1:
        sys.exit('build: expected exactly one <title> to rename for the share copy')
    share = page.replace(title, '<title>Rhizome Project — read-only</title>')

    anchor = 'function isReadOnlyError(e){'
    if share.count(anchor) != 1:
        sys.exit('build: could not find the read-only anchor for the share copy')
    share = share.replace(anchor,
                          '// SHARE COPY: published with no write capability at all, so it\n'
                          '// is a reader by construction and can say so immediately.\n'
                          'markReadOnly(false);\n' + anchor)
    (DIST / 'nexus-share.html').write_text(share, encoding='utf-8')
    print(f'  dist/nexus-share.html  {len(share):>8,} chars')

    # The standalone copy. Identical code — the page decides at runtime that
    # there is no host to publish to — but wrapped in the document skeleton
    # the artifact host would otherwise supply, so it is standards-mode HTML
    # rather than a fragment a browser has to guess the shape of.
    # The same marked fragment, inside a real document. Keeping the markers
    # around exactly the same content everywhere means the page extracts
    # itself identically however it was opened. The charset and viewport are
    # repeated in the wrapper's own head because a charset declared from
    # inside <body> is read too late to count.
    alone = (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '</head>\n<body>\n'
        + page +
        '</body>\n</html>\n')
    (DIST / 'nexus-standalone.html').write_text(alone, encoding='utf-8')
    print(f'  dist/nexus-standalone.html {len(alone):>8,} chars')


if __name__ == '__main__':
    print('building…')
    build()
    print('done')
