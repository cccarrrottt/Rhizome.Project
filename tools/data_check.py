#!/usr/bin/env python3
"""Is the chart in the repository the chart that is live?

The page saves by rewriting its own @@EDIT@@ regions, so the published
artifact holds the current chart and src/data.js holds whatever was last
carried into it. dist/nexus.html is the local copy of the live one, and a
plain `python3 build.py` carries its regions across IN MEMORY — the built
page comes out right and src/data.js is left exactly as stale as it was.

That is fine until something builds from a clean checkout, because a clean
checkout has no dist/ at all: dist/ is generated and ignored, so CI, and
therefore the published site, is built from src/data.js and nothing else.
The two copies can then disagree for months while every local build looks
correct, and the first visible symptom is a published page that has lost
work nobody deleted.

So this asks the question directly, reads only, and answers with an exit
code:

    python3 tools/data_check.py

    0  the two agree — or there is no dist/nexus.html to compare against,
       which is what a fresh clone and CI both look like
    1  they disagree: src/data.js is behind the live chart
    2  the question could not be answered — a region is missing from one
       side or the other, so there is nothing to compare it with. This is
       deliberately not 0: an all-clear given on evidence the tool does not
       have is worse than no tool.

The comparison is on the region TEXT, not on how many things each region
holds. Renaming an entry changes no count, and a check that called that
"no change" would miss most of what staleness actually is.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402  — for REGIONS and the region reader, which it owns

LIVE = build.DIST / 'nexus.html'
SEED = build.SRC / 'data.js'


def main():
    seed_text = build.read(SEED)

    missing = [n for n in build.REGIONS if build.region(seed_text, n) is None]
    if missing:
        print(f'src/data.js has no {", ".join(missing)} region — '
              'these sources cannot be built from.')
        return 2

    if not LIVE.exists():
        # Not a failure. It is the normal state of a fresh clone and of every
        # CI run, and saying otherwise would make the check cry wolf in the
        # one place it runs unattended. What it can still do is state what
        # this checkout would publish, so a run's log carries the inventory.
        print('no dist/nexus.html to compare against — a fresh clone, or CI.')
        print('what src/data.js holds, and therefore what this checkout publishes:')
        for name in build.REGIONS:
            print(f'    {name:<12} {build.items_in(build.region(seed_text, name)):>5}')
        return 0

    live_text = build.read(LIVE)
    rows, drifted, absent = [], [], []
    for name in build.REGIONS:
        here = build.region(seed_text, name)
        there = build.region(live_text, name)
        if there is None:
            absent.append(name)
            rows.append((name, build.items_in(here), None, 'not in the page'))
            continue
        same = here.strip() == there.strip()
        if not same:
            drifted.append(name)
        rows.append((name, build.items_in(here), build.items_in(there),
                     'same' if same else 'DIFFERS'))

    print(f'{"region":<12} {"src":>6} {"dist":>6}')
    for name, a, b, note in rows:
        print(f'{name:<12} {a:>6} {"-" if b is None else b:>6}  {note}')

    if absent:
        # Not "current", and not "behind" either: the comparison could not be
        # made. Saying "current" here would be the one thing this tool must
        # never do — give an all-clear on evidence it does not have.
        print(f'\ndist/nexus.html carries no {", ".join(absent)} region, so the '
              'two\ncannot be compared. It was built by a version that predates '
              'that\nregion; rebuild it and run this again.')
        if drifted:
            print(f'Of what could be compared, these differ: {", ".join(drifted)}')
        return 2
    if not drifted:
        print('\nsrc/data.js is current with dist/nexus.html.')
        return 0

    print(f'\nsrc/data.js is behind dist/nexus.html in: {", ".join(drifted)}')
    print('The built page is right and the sources are stale — and the sources\n'
          'are the half that is in the repository, so they are what CI builds\n'
          'and what the published site becomes. Carry the chart across:\n'
          '    python3 build.py --pull dist/nexus.html')
    return 1


if __name__ == '__main__':
    sys.exit(main())
