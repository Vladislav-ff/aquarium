"""Rebuild the single-file application. Python 3.8+, no packages needed."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parent
html = (ROOT / 'aquarium.template.html').read_text(encoding='utf-8')
for token, filename in [
    ('__NACRE_CORE__', 'ecology-core.js'),
    ('__NACRE_APP__', 'ecology-app.js'),
    ('__NACRE_SCENE__', 'aquarium-scene.mjs'),
]:
    if html.count(token) != 1:
        raise SystemExit('Invalid template token: ' + token)
    html = html.replace(token, (ROOT / filename).read_text(encoding='utf-8'))
ids = re.findall(r'\bid="([^"]+)"', html)
if len(ids) != len(set(ids)):
    raise SystemExit('Duplicate HTML IDs')
if any(token in html for token in ['__NACRE_CORE__', '__NACRE_APP__', '__NACRE_SCENE__']):
    raise SystemExit('Unresolved build token')
result = ROOT / 'aquarium.html'
result.write_text(html, encoding='utf-8')
print('Built:', result.name, result.stat().st_size, 'bytes')
