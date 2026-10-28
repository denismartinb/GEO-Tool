#!/usr/bin/env python3
"""Builds proto/i-consola.html from i-src. Run: python3 build.py"""
import pathlib, re
H = pathlib.Path(__file__).resolve().parent
P = H.parent  # proto/

def inner(name):
    s = (P / name).read_text()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    s = re.sub(r'<\?xml[^>]*>', '', s)
    s = re.sub(r'^.*?<svg[^>]*>', '', s, flags=re.S)
    s = re.sub(r'</svg>\s*$', '', s.strip())
    s = re.sub(r'<title>.*?</title>', '', s, flags=re.S)
    return vb, s.strip()

out = []
for k, f in [('chatgpt', 'chatgpt.svg'), ('gemini', 'gemini.svg'), ('claude', 'claude.svg'),
             ('perplexity', 'perplexity.svg'), ('google', 'google.svg'), ('gs', 'genscore-mark.svg')]:
    vb, b = inner(f)
    if k == 'chatgpt':
        b = b.replace('fill="#000000"', 'fill="currentColor"')
    if k == 'gemini':
        b = b.replace('id="g"', 'id="gmg3"').replace('url(#g)', 'url(#gmg3)')
    if k == 'gs':
        b = b.replace('fill="#0B1426"', 'style="fill:var(--ink)"').replace('fill="#2563EB"', 'style="fill:var(--blue)"')
    out.append(f'<symbol id="e-{k}" viewBox="{vb}">{b}</symbol>')

css = [*sorted((H / 'css').glob('*.css')), *sorted((H / 'screens').glob('*.css'))]
js = [H / 'js' / 'core.js', *sorted((H / 'screens').glob('*.js')), H / 'js' / 'boot.js']
doc = (H / '0-head.html').read_text().rstrip() + '\n<style>\n'
doc += '\n'.join(f'/* --- {p.relative_to(H)} --- */\n' + p.read_text() for p in css)
doc += '\n</style>\n' + (H / '1-body.html').read_text().replace('%%LOGOS%%', '\n'.join(out))
doc += '\n<script>\n(()=>{\n' + '\n'.join(f'/* --- {p.relative_to(H)} --- */\n' + p.read_text() for p in js) + '\n})();\n</script>\n'
(P / 'i-consola.html').write_text(doc)
print('wrote', P / 'i-consola.html', len(doc), 'bytes')
