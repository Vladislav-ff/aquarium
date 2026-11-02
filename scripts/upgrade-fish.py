"""Rebuild behavior-enhanced dist with the shared browser/CI transform."""
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
SCRIPT = r"""
import {readFileSync,writeFileSync} from 'node:fs';
import {prepare} from './scripts/prepare-scene.mjs';
const read=p=>readFileSync(p,'utf8');
const html=prepare({html:read('dist/index.html'),motion:read('scripts/natural-motion.js'),visual:read('scripts/natural-appearance.js'),behavior:read('scripts/behavior-patterns.js')});
writeFileSync('dist/index.html',html);
"""
if __name__ == '__main__':
    subprocess.run(['node', '--input-type=module', '-e', SCRIPT], cwd=ROOT, check=True)
