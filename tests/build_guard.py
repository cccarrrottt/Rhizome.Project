#!/usr/bin/env python3
"""What build.py must refuse.

The browser suite can only test the page. This tests the one part of the
project that runs outside it, and it tests the part that can lose work:
--pull takes the chart's contents out of a saved copy of the live page and
writes them back into src/data.js, so a source file that is truncated, or
saved wrong, or simply not the file the person meant to pass, is a data
loss with no undo behind it.

Every case runs against a throwaway copy of the project, so nothing here
can touch the real src/data.js.

    python3 tests/build_guard.py
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASS = FAIL = 0


def check(name, ok, detail=''):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'  ok   {name}')
    else:
        FAIL += 1
        print(f'  FAIL {name}' + (f'\n       {detail}' if detail else ''))


def sandbox():
    """A copy of the project with a live page to pull from."""
    tmp = Path(tempfile.mkdtemp(prefix='rhizome-build-'))
    for part in ('src', 'dist', 'tools'):
        if (ROOT / part).exists():
            shutil.copytree(ROOT / part, tmp / part)
    shutil.copy(ROOT / 'build.py', tmp / 'build.py')
    return tmp


def parts_of(tmp):
    """APP_PARTS, read out of the sandbox's own copy of build.py."""
    body = (tmp / 'build.py').read_text(encoding='utf-8')
    m = re.search(r'APP_PARTS = \[(.*?)\]', body, re.S)
    assert m, 'fixture: build.py has no APP_PARTS'
    return re.findall(r"'([^']+)'", m.group(1))


def run(tmp, *args):
    return subprocess.run([sys.executable, 'build.py', *args],
                          cwd=tmp, capture_output=True, text=True)


def run_check(tmp):
    return subprocess.run([sys.executable, 'tools/data_check.py'],
                          cwd=tmp, capture_output=True, text=True)


def edit_one_label(text):
    """A page whose chart has been edited, with the same number of entries.

    The hard case for a staleness check, and the ordinary one in life:
    somebody renamed something. A check that compares how many items a
    region holds sees nothing at all here, which is why the real one
    compares the text.
    """
    m = re.search(r'(/\* @@EDIT:NODES:START@@ \*/)(.*?)(/\* @@EDIT:NODES:END@@ \*/)',
                  text, re.S)
    assert m, 'fixture: no NODES region in the built page'
    body, n = re.subn(r"(\[\s*'[^']*',\s*')([^']*)(')",
                      lambda g: g.group(1) + g.group(2) + ' EDITED' + g.group(3),
                      m.group(2), count=1)
    assert n == 1, 'fixture: found no entry label to rename'
    return text[:m.start(2)] + body + text[m.end(2):]


def strip_region(text, name):
    return re.sub(rf'/\* @@EDIT:{name}:START@@ \*/.*?/\* @@EDIT:{name}:END@@ \*/',
                  '/* region removed by the test */', text, count=1, flags=re.S)


def shrink_nodes(text, keep=0):
    """A NODES region with all but `keep` entries gone — a truncated save."""
    m = re.search(r'(/\* @@EDIT:NODES:START@@ \*/\n)(.*?)(/\* @@EDIT:NODES:END@@ \*/)',
                  text, re.S)
    assert m, 'fixture: no NODES region in the built page'
    lines = m.group(2).split('\n')
    head = lines[0]                       # `const NODES = [`
    kept = [l for l in lines[1:] if l.strip() not in ('];', '')][:keep]
    return text[:m.start(2)] + '\n'.join([head] + kept + ['];', '']) + text[m.end(2):]


def main():
    base = sandbox()
    live = (base / 'dist' / 'nexus.html').read_text(encoding='utf-8')

    # 1. A region the source does not carry must stop the build, not be
    #    skipped in silence — skipping reverts that part of the chart to the
    #    seed data in src/data.js and says nothing about it.
    tmp = sandbox()
    (tmp / 'live.html').write_text(strip_region(live, 'STICKERS'), encoding='utf-8')
    r = run(tmp, '--pull', 'live.html')
    check('a missing region stops the build', r.returncode != 0, r.stdout + r.stderr)
    check('and the message names the region that is missing',
          'STICKERS' in (r.stdout + r.stderr), r.stdout + r.stderr)
    before = (tmp / 'src' / 'data.js').read_text(encoding='utf-8')
    check('and src/data.js is left exactly as it was',
          before == (base / 'src' / 'data.js').read_text(encoding='utf-8'))

    # 2. --partial is the one honest reason: a source saved before that
    #    region existed. It has to be asked for.
    r = run(tmp, '--pull', 'live.html', '--partial')
    check('--partial lets that same source through', r.returncode == 0,
          r.stdout + r.stderr)
    check('and says out loud what it did not carry',
          'STICKERS' in r.stdout, r.stdout)

    # 3. A region emptied completely is what a truncated file looks like,
    #    whatever the size of the chart.
    tmp = sandbox()
    (tmp / 'live.html').write_text(shrink_nodes(live, keep=0), encoding='utf-8')
    r = run(tmp, '--pull', 'live.html')
    check('a region emptied completely stops the build',
          r.returncode != 0, r.stdout + r.stderr)
    check('and the message names it, with the counts',
          'NODES' in (r.stdout + r.stderr) and '->' in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    r = run(tmp, '--pull', 'live.html', '--force')
    check('--force lets it through when that really is the intent',
          r.returncode == 0, r.stdout + r.stderr)

    # 4. And so does a region that kept a couple of entries out of many.
    tmp = sandbox()
    (tmp / 'live.html').write_text(shrink_nodes(live, keep=2), encoding='utf-8')
    r = run(tmp, '--pull', 'live.html')
    check('a region that lost most of its entries stops the build too',
          r.returncode != 0, r.stdout + r.stderr)

    # 5. A region that lost only a few entries is an ordinary edit.
    tmp = sandbox()
    (tmp / 'live.html').write_text(shrink_nodes(live, keep=12), encoding='utf-8')
    r = run(tmp, '--pull', 'live.html')
    check('an ordinary deletion is not treated as damage',
          r.returncode == 0, r.stdout + r.stderr)

    # 6. The ordinary case still works, and still reports what came in.
    tmp = sandbox()
    (tmp / 'live.html').write_text(live, encoding='utf-8')
    r = run(tmp, '--pull', 'live.html')
    check('a whole page pulls cleanly', r.returncode == 0, r.stdout + r.stderr)
    check('and every region is reported with its count',
          all(n in r.stdout for n in ('NODES', 'STICKERS', 'MEDIA', 'SETTINGS')),
          r.stdout)
    for name in ('nexus.html', 'nexus-share.html', 'nexus-standalone.html',
                 'nexus-share-standalone.html'):
        check(f'dist/{name} was written', (tmp / 'dist' / name).exists())

    # Two independent questions — may it be edited, is it a whole document —
    # and all four answers have to have a file. Three of them did, and the
    # missing one was read-only-and-a-document: so GitHub Pages, which needs
    # a document, was given the editable build and anybody who opened the
    # published site got an editor.
    grid = {'nexus.html':                   (False, False),
            'nexus-share.html':             (True,  False),
            'nexus-standalone.html':        (False, True),
            'nexus-share-standalone.html':  (True,  True)}
    for name, (want_ro, want_doc) in grid.items():
        body = (tmp / 'dist' / name).read_text(encoding='utf-8')
        is_ro = body.count('markReadOnly(false);') == 1
        is_doc = body.lstrip().lower().startswith('<!doctype html>')
        check(f'{name} is {"read-only" if want_ro else "editable"} and '
              f'{"a whole document" if want_doc else "a fragment"}',
              is_ro == want_ro and is_doc == want_doc,
              f'read-only {is_ro}, document {is_doc}')

    # 7. Nothing that holds the chart's contents is written over without the
    #    previous copy being put aside first.
    tmp = sandbox()
    (tmp / 'live.html').write_text(live, encoding='utf-8')
    seed = (tmp / 'src' / 'data.js').read_text(encoding='utf-8')
    was = (tmp / 'dist' / 'nexus.html').read_text(encoding='utf-8')
    run(tmp, '--pull', 'live.html')
    bak = tmp / '.backups'
    check('a pull puts the previous src/data.js aside',
          any(f.name.endswith('.pull') and f.read_text(encoding='utf-8') == seed
              for f in bak.glob('data.js.*')),
          str(sorted(f.name for f in bak.glob('*'))))
    check('and a build puts the previous dist/nexus.html aside',
          any(f.name.endswith('.build') and f.read_text(encoding='utf-8') == was
              for f in bak.glob('nexus.html.*')),
          str(sorted(f.name for f in bak.glob('*'))))

    # 8. Kept a few generations deep, and no deeper — a build every minute
    #    must not fill the disk with copies of a 2 MB page.
    for _ in range(5):
        run(tmp, '--pull', 'live.html')
    check('only a few generations are kept',
          1 <= len(list(bak.glob('nexus.html.*'))) <= 3 and
          1 <= len(list(bak.glob('data.js.*'))) <= 3,
          str(sorted(f.name for f in bak.glob('*'))))
    # Two builds inside one second must not land on one another: the copy a
    # backup would overwrite is exactly the copy worth keeping.
    check('two builds in the same second keep two copies',
          len({f.name for f in bak.glob('nexus.html.*')}) ==
          len(list(bak.glob('nexus.html.*'))),
          str(sorted(f.name for f in bak.glob('*'))))

    # 9. The program is one scope assembled in one order, and there are three
    #    ways for that order to quietly stop being true. None of them may
    #    produce a page — a part left out of an assembled program does not
    #    fail loudly, it fails as a function that is simply not there.
    tmp = sandbox()
    parts = parts_of(tmp)
    check('the sandbox has every part APP_PARTS names',
          all((tmp / 'src' / 'app' / n).exists() for n in parts), str(parts[:3]))

    gone = tmp / 'src' / 'app' / parts[3]
    keep = gone.read_text(encoding='utf-8')
    gone.unlink()
    r = run(tmp)
    check('a part that APP_PARTS names but src/app/ has not stops the build',
          r.returncode != 0 and parts[3] in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    gone.write_text(keep, encoding='utf-8')

    stray = tmp / 'src' / 'app' / '99-stray.js'
    stray.write_text('function strayFn(){ return 1; }\n', encoding='utf-8')
    r = run(tmp)
    check('a part in src/app/ that APP_PARTS does not name stops it too',
          r.returncode != 0 and '99-stray.js' in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    stray.unlink()

    idx = tmp / 'src' / 'index.html'
    html = idx.read_text(encoding='utf-8')
    a, b = f"    '{parts[0]}',", f"    '{parts[1]}',"
    idx.write_text(html.replace(a + '\n' + b, b + '\n' + a), encoding='utf-8')
    r = run(tmp)
    check('index.html running the parts in another order stops it',
          r.returncode != 0 and 'index.html' in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    idx.write_text(html.replace(a + '\n', ''), encoding='utf-8')
    r = run(tmp)
    check('and so does index.html leaving a part out',
          r.returncode != 0 and 'index.html' in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    idx.write_text(html, encoding='utf-8')

    # 10. And the page really is those files, in that order, with nothing
    #     added between them: the split is a move, not a transformation.
    r = run(tmp)
    check('with all of it in place the build runs again', r.returncode == 0,
          r.stdout + r.stderr)
    joined = ''.join((tmp / 'src' / 'app' / n).read_text(encoding='utf-8')
                     for n in parts)
    built = (tmp / 'dist' / 'nexus.html').read_text(encoding='utf-8')
    check('and the built page contains the parts concatenated verbatim',
          joined in built, f'{len(joined)} chars of parts, {len(built)} of page')

    # 10b. The parts are joined with nothing between them, which is only safe
    #      while each of them ends in a newline. One that does not would have
    #      its last line joined to the next part's first — and a part ending
    #      in a comment would comment that line out. Nothing about the page
    #      would look wrong; something would simply not be there.
    tmp = sandbox()
    parts = parts_of(tmp)
    victim = tmp / 'src' / 'app' / parts[2]
    whole = victim.read_text(encoding='utf-8')
    victim.write_text(whole.rstrip('\n') + '\n// a trailing comment, unterminated by a newline',
                      encoding='utf-8')
    r = run(tmp)
    check('a part that does not end in a newline stops the build',
          r.returncode != 0 and parts[2] in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    victim.write_text(whole, encoding='utf-8')
    r = run(tmp)
    check('and putting the newline back lets it build again',
          r.returncode == 0, r.stdout + r.stderr)

    # 10c. The share copy is made by replacing a marker that exists for that
    #      and nothing else. It used to be made by finding a function
    #      declaration that happened to sit in the right place, so renaming
    #      that function was a change to how the share copy is built.
    tmp = sandbox()
    r = run(tmp)
    share = (tmp / 'dist' / 'nexus-share.html').read_text(encoding='utf-8')
    editable = (tmp / 'dist' / 'nexus.html').read_text(encoding='utf-8')
    check('the share copy declares itself read-only and the editable one does not',
          share.count('markReadOnly(false);') == 1 and
          'markReadOnly(false);' not in editable,
          f'share {share.count("markReadOnly(false);")}, editable '
          f'{editable.count("markReadOnly(false);")}')
    # The marker is a comment in the sources, so the editable page keeps it,
    # exactly as it keeps every other comment; the share copy is the one
    # where it is spent. Both halves are worth pinning: a marker still
    # present in the share copy would mean the replacement silently did not
    # happen, and one missing from the editable page would mean the build
    # was rewriting a page it has no business rewriting.
    check('the marker is spent in the share copy and left alone in the editable one',
          '@@SHARE:READONLY@@' not in share and '@@SHARE:READONLY@@' in editable)

    part = next(p for p in parts_of(tmp)
                if '@@SHARE:READONLY@@' in (tmp / 'src' / 'app' / p).read_text(encoding='utf-8'))
    f = tmp / 'src' / 'app' / part
    kept = f.read_text(encoding='utf-8')
    # Renaming the function that used to be the anchor must now be nothing
    # to do with the build.
    f.write_text(kept.replace('function isReadOnlyError(e){',
                              'function isRefusalAboutWriting(e){')
                     .replace('isReadOnlyError(', 'isRefusalAboutWriting('),
                 encoding='utf-8')
    r = run(tmp)
    check('renaming the function that used to be the anchor no longer matters',
          r.returncode == 0, r.stdout + r.stderr)
    # Losing the marker must stop the build, and say where it lived.
    f.write_text(kept.replace('/* @@SHARE:READONLY@@ */', ''), encoding='utf-8')
    r = run(tmp)
    check('but losing the marker stops the build and names its file',
          r.returncode != 0 and '22-file-comments.js' in (r.stdout + r.stderr),
          r.stdout + r.stderr)
    f.write_text(kept, encoding='utf-8')

    # 11. The chart lives in two places and only one of them is committed.
    #     dist/ is generated and ignored, so a clean checkout has no live page
    #     at all and builds from src/data.js — which means CI, and the site CI
    #     publishes, are built from the sources' copy however stale it is.
    #     Neither half of that may happen in silence.
    tmp = sandbox()
    shutil.rmtree(tmp / 'dist')
    r = run(tmp)
    check('a build with no live page to carry from still succeeds',
          r.returncode == 0, r.stdout + r.stderr)
    check('and says that it used src/data.js and nothing else',
          'src/data.js' in r.stdout and 'NOTE' in r.stdout, r.stdout)
    r = run_check(tmp)
    check('the data check calls a missing dist/ a fresh clone, not a failure',
          r.returncode == 0, r.stdout + r.stderr)

    # A live page that is ahead of the sources is the state this exists for,
    # and the entry count is deliberately left alone: renaming something is
    # what staleness usually looks like.
    tmp = sandbox()
    live_page = tmp / 'dist' / 'nexus.html'
    live_page.write_text(edit_one_label(live_page.read_text(encoding='utf-8')),
                         encoding='utf-8')
    r = run_check(tmp)
    check('the data check fails when the sources are behind the live page',
          r.returncode == 1, r.stdout + r.stderr)
    check('and names the region, though the entry count is unchanged',
          'NODES' in r.stdout and 'DIFFERS' in r.stdout, r.stdout)
    r = run(tmp)
    check('a build says so too, rather than carrying it across in silence',
          r.returncode == 0 and 'NOTE' in r.stdout and 'NODES' in r.stdout,
          r.stdout)

    # And the cure it prescribes has to be the cure. A message naming a
    # command that does not settle the thing it is named for is worse than
    # no message, because it is followed.
    r = run(tmp, '--pull', 'dist/nexus.html')
    check('the remedy the message gives runs', r.returncode == 0,
          r.stdout + r.stderr)
    r = run_check(tmp)
    check('and leaves the sources current', r.returncode == 0,
          r.stdout + r.stderr)

    # A page built before a region existed cannot be compared against a
    # source that has it. That is neither "current" nor "behind", and the
    # answer must not round down to an all-clear: a tool that says the
    # sources are fine on evidence it does not have is worse than no tool.
    tmp = sandbox()
    live_page = tmp / 'dist' / 'nexus.html'
    live_page.write_text(
        re.sub(r'/\* @@EDIT:REFS:START@@ \*/.*?/\* @@EDIT:REFS:END@@ \*/',
               'const REFS = [];', live_page.read_text(encoding='utf-8'),
               count=1, flags=re.S),
        encoding='utf-8')
    r = run_check(tmp)
    check('a region missing from the built page is not reported as current',
          r.returncode == 2 and 'current' not in r.stdout.split('REFS')[-1],
          r.stdout + r.stderr)
    check('and the reason names the region and what to do',
          'REFS' in r.stdout and 'rebuild' in r.stdout, r.stdout)

    # The other way round matters as much: a check that cries wolf on a
    # checkout that is already current gets switched off within a week.
    r = run_check(sandbox())
    check('a checkout that is current is reported as current',
          r.returncode == 0 and 'DIFFERS' not in r.stdout, r.stdout)
    tmp = sandbox()
    r = run(tmp)
    check('and its build says nothing about staleness',
          r.returncode == 0 and 'NOTE' not in r.stdout, r.stdout)

    print(f'\n{PASS} passed, {FAIL} failed\n')
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
