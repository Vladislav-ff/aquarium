"""Apply the low-density fish upgrade to the freshly built dist site."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
def main():
    target = ROOT / 'dist/index.html'
    html = target.read_text(encoding='utf-8')
    core = (ROOT / 'scripts/natural-motion.js').read_text(encoding='utf-8')
    visual = (ROOT / 'scripts/natural-appearance.js').read_text(encoding='utf-8')
    pattern = r'(<script\b[^>]*\bid="ecology-core"[^>]*>)([\s\S]*?)(</script\s*>)'
    if len(re.findall(pattern, html)) != 1:
        raise RuntimeError('Missing or ambiguous ecology core')
    html = re.sub(pattern, lambda m: m[1]+m[2]+'\n'+core+'\n'+m[3], html)
    html = html.replace('nacre-ecosystem-v6', 'nacre-ecosystem-v6-natural-1')
    anchor = 'syncScene();applyQuality();visualStep(0,[]);controls.update();renderer.compile(scene,camera);'
    if html.count(anchor) != 1:
        raise RuntimeError('Scene initialization anchor changed')
    html = html.replace(anchor, visual+'\n'+anchor, 1)
    target.write_text(html, encoding='utf-8')
    print('Applied natural motion, detailed skin, 10/8 initial fish and 20/13 capacity')
if __name__ == '__main__':
    main()
