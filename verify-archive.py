"""Verify ZIP CRC, safe paths and all supplied per-file SHA256 checksums."""
import argparse, hashlib, zipfile
from pathlib import PurePosixPath
parser=argparse.ArgumentParser();parser.add_argument('archive');args=parser.parse_args()
with zipfile.ZipFile(args.archive) as z:
    names=z.namelist()
    if len(names)!=len(set(names)) or any(n.startswith('/') or '..' in PurePosixPath(n).parts for n in names):
        raise SystemExit('Unsafe or duplicate archive member')
    if z.testzip():
        raise SystemExit('ZIP CRC error')
    expected=set()
    for line in z.read('CHECKSUMS.sha256').decode('utf-8').splitlines():
        digest,name=line.split('  ',1);expected.add(name)
        if hashlib.sha256(z.read(name)).hexdigest()!=digest:
            raise SystemExit('SHA256 mismatch: '+name)
    if expected != set(names)-{'CHECKSUMS.sha256'}:
        raise SystemExit('Unlisted or missing archive members')
print('PASS: all archive members verified')
