#!/usr/bin/env python3
"""Assemble the split sources into the single self-contained page.

    python3 build.py                 build dist/ from src/
    python3 build.py --pull live.html   take the chart's data out of a saved
                                        copy of the live artifact first

    --partial   accept a source that is missing whole @@EDIT@@ regions, letting
                those regions fall back to what src/data.js holds
    --force     accept a source in which a region has lost most of its contents

Before either of the two files that hold the chart's contents is written over
— src/data.js on a pull, dist/nexus.html on every build — the previous copy is
put in .backups/, three generations deep.

WHY A BUILD STEP AT ALL

A published artifact is served under a Content Security Policy that blocks
every external host, so the page it serves has to be one file with the CSS
and JavaScript inside it. That is a bad way to WRITE the thing, so the
sources live apart — src/index.html, src/style.css, src/data.js, and the
ordered parts in src/app/ — and this script welds them into dist/nexus.html
for publishing. See APP_PARTS for what "ordered" means and why it is not a
module system.

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

It carries them IN MEMORY. The built page gets the chart and src/data.js is
left as it was; only --pull writes back, because a build should not quietly
rewrite a source file. The consequence is easy to miss and expensive: dist/
is generated and not committed, so a clean checkout has no live page, and a
clean checkout is what CI is — what CI builds, and therefore what the
published site becomes, is src/data.js and nothing else, however far behind
it has drifted. Both of those situations used to pass without a word. Now a
build says when it had nothing to carry from, and says when what it carried
differs from the sources; tools/data_check.py asks the same question on its
own and answers with an exit code.
"""
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / 'src', ROOT / 'dist'
REGIONS = ['NODES', 'COMMENTS', 'STICKERS', 'MEDIA', 'EDGESTYLES', 'TAGCATS', 'REFS', 'SETTINGS']

# The program, in the order it is assembled.
#
# src/app/ holds one file per subsystem, and they are ORDERED: the page is one
# scope, built by writing these files out one after another, exactly as the
# single app.js used to read top to bottom. So this list is not a directory
# listing that happens to be sorted — it is the program's own order, and the
# only place it is written down. src/index.html loads the same files as
# separate scripts in the same order, and check_index_order below refuses to
# build if the two have drifted apart.
#
# What this split is NOT is a module system. Nothing here has its own scope,
# nothing imports anything, and no name changed meaning by moving. The proof
# is mechanical: the file this produces is byte for byte the file the single
# app.js produced.
APP_PARTS = [
    '01-store.js',
    '02-model.js',
    '03-markup.js',
    '04-assets.js',
    '05-render-text.js',
    '06-edge-geometry.js',
    '07-router-ortho.js',
    '08-router-astar.js',
    '09-bends-ports.js',
    '10-decor.js',
    '11-edge-notes.js',
    '12-ports-draw.js',
    '13-render-nodes.js',
    '14-edges-draw.js',
    '15-amalgam.js',
    '16-tags.js',
    '17-ask-refs.js',
    '18-canvas-gestures.js',
    '19-selection-search.js',
    '20-about.js',
    '21-edit-model.js',
    '22-file-comments.js',
    '23-quick-edit.js',
    '24-rich-fields.js',
    '25-figures.js',
    '26-bio-crop.js',
    '27-sticker-ui.js',
    '28-media-ui.js',
    '29-editors.js',
    '30-node-editor.js',
    '31-free-menu.js',
    '32-guides-bends.js',
    '33-leader.js',
    '34-add-node.js',
    '35-draw-out.js',
]
PAGE_BEGIN = '<!-- @@PAGE:BEGIN@@ -->'
PAGE_END = '<!-- @@PAGE:END@@ -->'


def read(p: Path) -> str:
    return p.read_text(encoding='utf-8')


# Where a file goes before it is written over, and how many generations are
# kept. Three, because the mistake this guards against — a pull that carried
# the wrong thing — is usually noticed on the build after the one that made
# it, and sometimes on the one after that.
BACKUPS = ROOT / '.backups'
KEEP = 3

# Only two files in this project hold anything that cannot be rebuilt from
# the others, and they hold the same thing: the chart's contents. src/data.js
# is the sources' copy, dist/nexus.html is the copy a plain rebuild carries
# FROM. Everything else in dist/ is a function of src/ and is regenerated by
# running this script again, so backing it up would only cost disk.
def keep_a_copy(path: Path, why: str):
    """Put the current contents of `path` aside before it is overwritten."""
    if not path.exists():
        return
    BACKUPS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    dest = BACKUPS / f'{path.name}.{stamp}.{why}'
    # A second build inside the same second must not overwrite the first
    # one's copy — that is the exact failure this whole function exists to
    # prevent, in miniature.
    n = 2
    while dest.exists():
        dest = BACKUPS / f'{path.name}.{stamp}-{n}.{why}'
        n += 1
    shutil.copy(path, dest)
    old = sorted(BACKUPS.glob(f'{path.name}.*'))
    for stale in old[:-KEEP]:
        stale.unlink()
    print(f'  kept a copy of {path.name} in .backups/')


def read_app():
    """The whole program, its parts written out in order."""
    missing = [n for n in APP_PARTS if not (SRC / 'app' / n).exists()]
    if missing:
        sys.exit(f'build: src/app/ is missing {", ".join(missing)}')
    stray = sorted(x.name for x in (SRC / 'app').glob('*.js')
                   if x.name not in APP_PARTS)
    if stray:
        # A file nobody listed is a file that is not in the program. That is
        # nearly always a new part someone forgot to add to APP_PARTS, and it
        # fails in the worst possible way — silently, as a function that is
        # simply not there — so it stops the build instead.
        sys.exit(f'build: src/app/ has {", ".join(stray)}, which APP_PARTS does not list')

    texts = [read(SRC / 'app' / n) for n in APP_PARTS]
    # The parts are written out with NOTHING between them, here and in the
    # loader in src/index.html, and that is only safe while every one of them
    # ends in a newline. They all do. Nothing made them, and the day one does
    # not, its last line and the next part's first line become one line: a
    # part ending in a `// comment` would comment out the beginning of the
    # part after it, and the program would be missing whatever that line
    # declared — silently, which is the failure this whole file is arranged
    # to prevent everywhere else.
    #
    # A separator would hide the problem rather than fix it, and would change
    # the bytes of a page that is checked against itself. So the invariant is
    # stated instead: end your part with a newline, as every editor does.
    ragged = [n for n, t in zip(APP_PARTS, texts) if t and not t.endswith('\n')]
    if ragged:
        sys.exit(f'build: {", ".join(ragged)} does not end with a newline. The parts\n'
                 '       are concatenated with nothing between them, so its last line\n'
                 "       would be joined to the next part's first one.")
    return ''.join(texts)


def check_index_order(index):
    """src/index.html must run the same parts, in the same order.

    index.html is a real document you can open through a local server. It
    fetches the parts, joins them, and runs the result as ONE script — see the
    comment there for why separate <script> tags are not the same program. Its
    list and APP_PARTS have to agree, or the page you develop against and the
    page that gets published are two different programs; that is the one
    failure a split like this can introduce, so it is checked every build.
    """
    listed = re.findall(r"^\s*'([^']+\.js)',\s*$", index, re.M)
    if listed != APP_PARTS:
        extra = [n for n in listed if n not in APP_PARTS]
        absent = [n for n in APP_PARTS if n not in listed]
        why = ('order differs' if not extra and not absent
               else f'index has {extra or "-"}, is missing {absent or "-"}')
        sys.exit(f'build: src/index.html does not load src/app/ in APP_PARTS order ({why})')


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


def items_in(block):
    """Roughly how many things a region holds.

    Every serializer in the page writes one item per line, so counting the
    lines that are neither the opening `const X = [` nor the closing `];`
    nor a marker gives a number that tracks the region's contents closely
    enough to notice a chart arriving with its entries missing. It is a
    smoke alarm, not a checksum, and it is only ever compared against the
    same measure taken of the same region.
    """
    n = 0
    for line in block.splitlines():
        t = line.strip()
        if not t or t.startswith('/*') or t.startswith('//'):
            continue
        if t.endswith('= [') or t in (('];'), ('}'), ('};')) or t.endswith('= {'):
            continue
        n += 1
    return n


# How much of a region may vanish in a pull before the build stops and asks.
# A real edit can remove a lot; losing two thirds of a region in one step is
# not an edit, it is a source that was truncated, saved wrong, or is not the
# file the person meant to pass. The proportional test needs a region big
# enough for a proportion to mean anything — going from three references to
# one is an afternoon's work, not an accident — but a region emptied
# COMPLETELY is worth a question at any size, because that is what a
# truncated file looks like no matter how small the chart was.
SHRINK_FLOOR = 0.30
SHRINK_MIN_ITEMS = 8


def carry_data(data_js, source_text, label, partial=False, force=False):
    """Replace src/data.js's regions with the ones in `source_text`.

    A region the source does not carry used to be skipped in silence, which
    is the worst of the three things this could do: the build succeeded, said
    nothing, and quietly reverted that part of the chart to whatever seed data
    src/data.js still held. Now it stops and names what is missing — and takes
    --partial for the one honest reason a region can be absent, which is a
    source file saved before that region existed.

    Returns the rewritten text and the list of regions that actually CHANGED.
    Which of those two things matters depends on who is calling: a --pull is
    expected to change things and writes the result back, so drift there is
    the point. Carrying from dist/nexus.html changes only the page being
    built, and a region that differs means the sources are behind the live
    chart — see the note build() prints about it.
    """
    carried, missing, shrunk, drifted = [], [], [], []
    for name in REGIONS:
        live = region(source_text, name)
        if live is None:
            missing.append(name)
            continue
        pattern = rf'/\* @@EDIT:{name}:START@@ \*/.*?/\* @@EDIT:{name}:END@@ \*/'
        m = re.search(pattern, data_js, re.S)
        if not m:
            sys.exit(f'build: src/data.js has no {name} region to replace')
        held = m.group(0)
        had, now = items_in(held), items_in(live)
        emptied = had > 0 and now == 0
        if emptied or (had >= SHRINK_MIN_ITEMS and now < had * SHRINK_FLOOR):
            shrunk.append(f'{name}: {had} -> {now}')
        # Compared as text, not by the item count. Two regions can hold the
        # same number of things and none of the same things — renaming an
        # entry is the ordinary case — and a count that called that "no
        # change" would be a staleness check that misses most staleness.
        if live.strip() != held.strip():
            drifted.append(f'{name}: {had} -> {now}' if had != now
                           else f'{name}: {now}, edited')
        data_js = data_js[:m.start()] + live + data_js[m.end():]
        carried.append(f'{name} ({now})')

    if missing and not partial:
        sys.exit('build: {} carries no {} region{} — refusing to build, because\n'
                 '       skipping it would silently revert that part of the chart to\n'
                 '       the seed data in src/data.js. Pass --partial if this source\n'
                 '       predates that region and reverting it is what you want.'
                 .format(label, ', '.join(missing), '' if len(missing) == 1 else 's'))
    if shrunk and not force:
        sys.exit('build: {} would lose most of: {}\n'
                 '       That is not what an edit looks like. Check that this is the\n'
                 '       file you meant to pass; add --force if it really is.'
                 .format(label, '; '.join(shrunk)))

    if missing:
        print(f'  NOT in {label}, left as src/data.js has it: {", ".join(missing)}')
    if shrunk:
        print(f'  shrank sharply (allowed by --force): {"; ".join(shrunk)}')
    if carried:
        print(f'  carried from {label}: {", ".join(carried)}')
    return data_js, drifted


def build():
    index = read(SRC / 'index.html')
    check_index_order(index)
    head = slice_between(index, '<!-- @@HEAD:BEGIN@@ -->', '<!-- @@HEAD:END@@ -->',
                         'src/index.html head block').strip('\n')
    body = slice_between(index, '<!-- @@BODY:BEGIN@@ -->', '<!-- @@BODY:END@@ -->',
                         'src/index.html body block').rstrip('\n')
    css = read(SRC / 'style.css')
    data_js = read(SRC / 'data.js')
    app_js = read_app()

    # The live page is the authority on the chart's contents; a code-only
    # rebuild must not roll them back to the sources' seed data.
    partial = '--partial' in sys.argv
    force = '--force' in sys.argv
    if '--pull' in sys.argv:
        i = sys.argv.index('--pull')
        if i + 1 >= len(sys.argv):
            sys.exit('build: --pull needs a file to read')
        pull = Path(sys.argv[i + 1])
        if not pull.exists():
            sys.exit(f'build: {pull} does not exist')
        data_js, _ = carry_data(data_js, read(pull), pull.name, partial, force)
        # The one write in this script that destroys something: the seed data
        # in src/data.js is replaced by whatever came out of the saved page.
        # The guards in carry_data refuse the damage they can recognise; this
        # is for the damage they cannot.
        keep_a_copy(SRC / 'data.js', 'pull')
        (SRC / 'data.js').write_text(data_js, encoding='utf-8')
        print('  wrote those regions back into src/data.js')
    elif (DIST / 'nexus.html').exists():
        data_js, drifted = carry_data(data_js, read(DIST / 'nexus.html'),
                                      'dist/nexus.html', partial, force)
        if drifted:
            # The page just built has the live chart in it. src/data.js does
            # not — and src/data.js is the only one of the two that is in the
            # repository, so it is the one CI builds from and the one that
            # becomes the published site. Left alone, the two go on diverging
            # and the divergence is invisible: every local build looks right,
            # because every local build carries the data across in memory.
            print('  NOTE: src/data.js is behind dist/nexus.html — '
                  + '; '.join(drifted))
            print('        This build is correct; the SOURCES are stale, and the')
            print('        sources are what CI publishes. Carry them across with')
            print('        python3 build.py --pull dist/nexus.html')
    else:
        # Nothing to carry from, so the page gets whatever src/data.js holds.
        # In a fresh clone and in CI that is the only possible answer and the
        # right one. On a machine that HAD a live page it means dist/ was
        # cleaned away, and publishing this build would replace the chart with
        # the seed — which is precisely the accident that leaves no trace, so
        # it is said out loud rather than inferred from a missing line.
        print('  NOTE: no dist/nexus.html to carry the chart from, so this page')
        print('        holds what src/data.js holds and nothing else. Right for a')
        print('        fresh clone and for CI. If this machine had a live page,')
        print('        pull from a saved copy of it before publishing this build.')

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
    # dist/nexus.html is what the NEXT plain rebuild carries its data from, so
    # overwriting it with a bad build is how the chart's contents are lost
    # without anybody having deleted anything.
    keep_a_copy(DIST / 'nexus.html', 'build')
    (DIST / 'nexus.html').write_text(page, encoding='utf-8')
    print(f'  dist/nexus.html        {len(page):>8,} chars')

    # The share copy: same page, minus any ability to write itself.
    title = '<title>Rhizome Project</title>'
    if page.count(title) != 1:
        sys.exit('build: expected exactly one <title> to rename for the share copy')
    share = page.replace(title, '<title>Rhizome Project — read-only</title>')

    # A marker that exists FOR this, rather than a line of the program that
    # happens to sit in the right place. Searching for the declaration that
    # follows it worked, and tied the share copy's build to a function's
    # name: renaming it would have stopped the build for a reason with no
    # connection to what the person had done. See the note beside the marker.
    anchor = '/* @@SHARE:READONLY@@ */'
    if share.count(anchor) != 1:
        sys.exit(f'build: expected exactly one {anchor} to mark where the share copy\n'
                 '       declares itself read-only; see src/app/22-file-comments.js')
    share = share.replace(anchor,
                          '// SHARE COPY: published with no write capability at all, so it\n'
                          '// is a reader by construction and can say so immediately.\n'
                          'markReadOnly(false);')
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
    def whole_document(fragment):
        return ('<!doctype html>\n<html lang="en">\n<head>\n'
                '<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
                '</head>\n<body>\n'
                + fragment +
                '</body>\n</html>\n')

    alone = whole_document(page)
    (DIST / 'nexus-standalone.html').write_text(alone, encoding='utf-8')
    print(f'  dist/nexus-standalone.html {len(alone):>8,} chars')

    # The fourth copy, and the one the public site is.
    #
    # There are two questions about a build and they are independent: may it
    # be edited, and is it a whole document. Three of the four answers had a
    # file and the fourth did not — so the only page that was BOTH a document
    # and read-only did not exist, and GitHub Pages, which needs a document,
    # got the editable one.
    #
    # Nobody could deface anything with it: Pages serves a static file, and a
    # page with no host to publish to saves into the reader's own browser,
    # keyed to the address. But it opened as an editor, and an edit survived
    # a reload, so a reader had every reason to believe they had changed the
    # chart everyone else sees. A public page should not be able to give
    # anybody that impression.
    #
    # Export is deliberately still there: read-only stops writing to THIS
    # chart, not taking a copy away, and a reader who wants to build on it
    # should be able to.
    alone_share = whole_document(share)
    (DIST / 'nexus-share-standalone.html').write_text(alone_share, encoding='utf-8')
    print(f'  dist/nexus-share-standalone.html {len(alone_share):>8,} chars')


if __name__ == '__main__':
    print('building…')
    build()
    print('done')
