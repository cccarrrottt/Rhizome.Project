#!/usr/bin/env python3
"""Lint the program as the program, and report against the files it lives in.

src/app/ holds one file per subsystem, but they are not modules: the page is a
single scope, assembled by writing the parts out one after another. That is
exactly the thing the three lint rules are about — a name nothing defines, a
name nothing reads, a name declared twice — and every one of those questions
is meaningless about a part on its own. Linted separately, every part reports
hundreds of errors that say only "this file is not the whole program".

So the parts are assembled into one file, that file is linted, and each
message is carried back to the part and line it came from. The assembly is
pure concatenation, so the arithmetic is exact: no source map, nothing to get
out of step.

    python3 tools/lint.py
"""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402  — for APP_PARTS and the paths, which it owns

ROOT = Path(build.ROOT)
SCRATCH = ROOT / '.lint'
ASSEMBLED = SCRATCH / 'app.js'


def assemble():
    """The parts, in order, plus where each one starts in the result."""
    at, text, starts = 1, [], []
    for name in build.APP_PARTS:
        part = (ROOT / 'src' / 'app' / name).read_text(encoding='utf-8')
        starts.append((at, name))
        text.append(part)
        at += part.count('\n')
    SCRATCH.mkdir(exist_ok=True)
    ASSEMBLED.write_text(''.join(text), encoding='utf-8')
    return starts


def locate(starts, line):
    """Which part a line of the assembled file belongs to, and its line there."""
    found = starts[0]
    for entry in starts:
        if entry[0] <= line:
            found = entry
        else:
            break
    return found[1], line - found[0] + 1


def run_eslint(targets):
    """eslint, wherever this machine keeps it.

    A machine with it installed globally answers the first form. A checkout
    that ran `npm ci` has it in node_modules/.bin, which npm puts on PATH for
    `npm run lint` but not for a bare `python3 tools/lint.py` — the second
    form reaches it there without installing anything.
    """
    for argv in (['eslint'], ['npx', '--no-install', 'eslint']):
        try:
            return subprocess.run([*argv, '-f', 'json', *targets],
                                  cwd=ROOT, capture_output=True, text=True)
        except FileNotFoundError:
            continue
    return None


def main():
    starts = assemble()
    targets = [str(ASSEMBLED), 'src/data.js', 'tests', 'tools']
    r = run_eslint(targets)
    if r is None:
        sys.stderr.write('eslint not found. Run: npm ci\n')
        return 2
    if not r.stdout.strip():
        sys.stderr.write(r.stderr)
        return 2
    report = json.loads(r.stdout)

    errors = warnings = 0
    for f in report:
        path = Path(f['filePath'])
        for m in f['messages']:
            if path == ASSEMBLED:
                where, line = locate(starts, m['line'])
                where = f'src/app/{where}'
            else:
                where, line = str(path.relative_to(ROOT)), m['line']
            kind = 'error' if m['severity'] == 2 else 'warning'
            errors += kind == 'error'
            warnings += kind == 'warning'
            print(f'{where}:{line}:{m.get("column", 0)}  {kind}  '
                  f'{m["message"]}  {m.get("ruleId") or ""}')

    total = errors + warnings
    print(f'\n{total} problem{"" if total == 1 else "s"} '
          f'({errors} error{"" if errors == 1 else "s"}, {warnings} warning'
          f'{"" if warnings == 1 else "s"}) '
          f'across {len(build.APP_PARTS)} parts')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
