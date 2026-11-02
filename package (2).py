"""Build/test and produce one deterministic ZIP of the frozen source tree."""
from pathlib import Path
import argparse, hashlib, subprocess, zipfile
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--skip-checks',action='store_true',help='Package existing reports without rerunning tests')
parser.add_argument('--output',default=str(ROOT.parent/'nacre-pages-final.zip'))
args=parser.parse_args()
if not args.skip_checks:
    for command in [['node','scripts/build.mjs'],['node','--test','tests/unit.test.mjs'],['node','scripts/check-site.mjs']]:
        result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
        if result.returncode:
            raise SystemExit(result.stdout+result.stderr)
        if '--test' in command:
            (ROOT/'tests/unit-results.tap').write_text(result.stdout+result.stderr,encoding='utf-8')
        elif command[-1].endswith('check-site.mjs'):
            (ROOT/'tests/site-check.txt').write_text(result.stdout+result.stderr,encoding='utf-8')
EXCLUDED={'.git','node_modules','site','reports','__pycache__'}
files=sorted(p for p in ROOT.rglob('*') if p.is_file() and not p.is_symlink() and not any(x in EXCLUDED for x in p.relative_to(ROOT).parts) and p.name!='CHECKSUMS.sha256')
(ROOT/'CHECKSUMS.sha256').write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(ROOT).as_posix() for p in files)+'\n',encoding='utf-8')
files=sorted(files+[ROOT/'CHECKSUMS.sha256'])
dest=Path(args.output).resolve();dest.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p in files:
        info=zipfile.ZipInfo(p.relative_to(ROOT).as_posix(),date_time=(1980,1,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100644<<16
        archive.writestr(info,p.read_bytes())
with zipfile.ZipFile(dest) as archive:
    assert archive.testzip() is None
    assert 'index.html' in archive.namelist() and '.nojekyll' in archive.namelist()
print(dest.name,dest.stat().st_size,hashlib.sha256(dest.read_bytes()).hexdigest())
