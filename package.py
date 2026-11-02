"""Build, test and produce one ZIP. Python stdlib + Node.js 20+, no npm install."""
from pathlib import Path
import hashlib, subprocess, zipfile
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT.parent / 'nacre-pages-complete.zip'
for command in [['node', 'scripts/build.mjs'], ['node', '--test', 'tests/unit.test.mjs'], ['node', 'scripts/check-site.mjs']]:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    print(result.stdout, end='')
    if result.returncode:
        raise SystemExit(result.stderr or 'Verification failed')
    if '--test' in command:
        (ROOT / 'tests/unit-results.tap').write_text(result.stdout + result.stderr, encoding='utf-8')
    elif command[-1].endswith('check-site.mjs'):
        (ROOT / 'tests/site-check.txt').write_text(result.stdout + result.stderr, encoding='utf-8')
EXCLUDED = {'.git', 'node_modules', 'site', 'reports', '__pycache__'}
files = sorted(p for p in ROOT.rglob('*') if p.is_file() and not p.is_symlink() and not any(part in EXCLUDED for part in p.relative_to(ROOT).parts) and p.name != 'CHECKSUMS.sha256')
checks = '\n'.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(ROOT).as_posix() for p in files) + '\n'
(ROOT / 'CHECKSUMS.sha256').write_text(checks, encoding='utf-8')
files.append(ROOT / 'CHECKSUMS.sha256')
with zipfile.ZipFile(DEST, 'w', zipfile.ZIP_DEFLATED) as archive:
    for p in files:
        archive.write(p, p.relative_to(ROOT).as_posix())
with zipfile.ZipFile(DEST) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive CRC check failed')
    if 'index.html' not in archive.namelist() or '.nojekyll' not in archive.namelist():
        raise SystemExit('Invalid archive root')
print('Created:', DEST.name, DEST.stat().st_size, 'bytes')
