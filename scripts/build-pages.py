"""Build the existing NACRE scene with a consistent engine and local Three.js."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
SOURCE_SHA = '9452333db2171ad286844b01d4b73d0f4f43346c'

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Unexpected source; patch must match exactly: ' + old[:80])
    return text.replace(old, new, 1)

def build():
    original = (ROOT / 'aquarium.html').read_text(encoding='utf-8')
    core = (ROOT / 'ecology-core (2).js').read_text(encoding='utf-8')
    app = (ROOT / 'ecology-app.js').read_text(encoding='utf-8')
    core = replace_once(core,
        'if(a===b||!b.alive||a.jump||b.jump||a.rest>0||this.refuge(b))return false;',
        'if(a===b||!a.alive||!b.alive||a.jump||b.jump||a.rest>0||this.refuge(b))return false;')
    core = replace_once(core,
        'const pen=(r-d)*.6,wa=b.mass/(a.mass+b.mass),wb=1-wa;',
        'const pen=Math.max(0,r-d)*.6,wa=b.mass/(a.mass+b.mass),wb=1-wa;')
    core = replace_once(core,
        "if(mother.sex!=='F'||father.sex!=='M'||mother.si!==father.si||!mother.alive||!father.alive||mother.repro>0||father.repro>0)return;",
        "if(mother.sex!=='F'||father.sex!=='M'||mother.si!==father.si||!mother.alive||!father.alive||mother.repro>0||father.repro>0||!this.mature(mother)||!this.mature(father)||this.condition(mother)<.56||this.condition(father)<.56||DIST(mother.p,father.p)>(this.length(mother)+this.length(father)+1)**2||this.blocked(mother.p,father.p))return;")
    for ident, content in [('ecology-core', core), ('ecology-app', app)]:
        pattern = r'(<script\b[^>]*\bid="' + ident + r'"[^>]*>)[\s\S]*?(</script\s*>)'
        if len(re.findall(pattern, original)) != 1:
            raise RuntimeError('Missing or ambiguous script: ' + ident)
        original = re.sub(pattern, lambda m: m[1] + '\n' + content + '\n' + m[2], original)
    original = replace_once(original,
        'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
        './vendor/three/build/three.module.js')
    original = replace_once(original,
        'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/',
        './vendor/three/examples/jsm/')
    original = original.replace('3D при доступном CDN; 2D работает полностью офлайн.',
        '3D использует локальную библиотеку; 2D доступен как запасной режим.')
    original = original.replace('3D использует Three.js из CDN; при недоступности автоматически включается самостоятельный 2D-режим с той же симуляцией.',
        '3D использует локальную Three.js. Если WebGL недоступен, включается запасной 2D-режим с той же симуляцией.')
    original = original.replace('CDN не отвечает: включена офлайн-визуализация.',
        '3D не успел запуститься: включён запасной режим.')
    original = original.replace('NACRE VI — Автономная экосистема', 'NACRE VI.1 — Живая 3D-экосистема')
    ids = re.findall(r'\bid="([^"]+)"', original)
    if len(ids) != len(set(ids)):
        raise RuntimeError('Duplicate HTML IDs')
    for token in ['__NACRE_CORE__', '__NACRE_APP__', '__NACRE_SCENE__']:
        if token in original:
            raise RuntimeError('Unresolved template token')
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    (DIST / 'index.html').write_text(original, encoding='utf-8')
    (DIST / '.nojekyll').write_text('')
    three = ROOT / '.ci/node_modules/three'
    if not (three / 'build/three.module.js').is_file():
        raise RuntimeError('Install CI dependencies before building')
    target = DIST / 'vendor/three'
    shutil.copytree(three / 'build', target / 'build')
    shutil.copytree(three / 'examples/jsm', target / 'examples/jsm')
    shutil.copyfile(three / 'LICENSE', target / 'LICENSE')
    print('Built', DIST / 'index.html')

if __name__ == '__main__':
    build()
