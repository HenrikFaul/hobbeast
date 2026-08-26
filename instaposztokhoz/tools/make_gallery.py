"""Builds a local HTML picker: every post with its candidate clips and stills.

Opened straight from the media folder, so the sources are plain relative paths -
no server, no upload, nothing leaves the machine.
"""
import json, os, html, time
from collections import defaultdict

OUT = r"C:\Work\Expericentre\instaposztokhoz\media"


def load_state(path, tries=6):
    """The collectors rewrite their state files continuously; retry past a half-written read."""
    if not os.path.exists(path):
        return {'rows': []}
    for _ in range(tries):
        try:
            return json.load(open(path, encoding='utf-8'))
        except Exception:
            time.sleep(0.4)
    raise SystemExit(f'{path} unreadable')


plan = {p['id']: p for p in json.load(open('plan.json', encoding='utf-8'))}
by_post = defaultdict(lambda: {'videó': [], 'kép': []})
counts = {'videó': 0, 'kép': 0}
for path, kind, sub in (('state.json', 'videó', 'videok'), ('state_img.json', 'kép', 'kepek')):
    for r in load_state(path)['rows']:
        by_post[r['post']][kind].append(dict(r, sub=sub))
        counts[kind] += 1

WB_TITLE = {
    'A_30_poszt_terv': 'Hobbeast_Instagram_30_Poszt_Terv.xlsx',
    'B_kovetkezo_20_poszt': 'Hobbeast_Instagram_Kovetkezo_20_Poszt.xlsx',
    'C_oszi_15_poszt': 'Hobbeast_Instagram_Oszi_15_Poszt.xlsx',
}
FOLDERS = ['A_30_poszt_terv', 'B_kovetkezo_20_poszt', 'C_oszi_15_poszt']

CSS = """
:root{--bg:#12100e;--card:#1c1917;--line:#2f2a26;--fg:#f5f1ea;--mut:#a8a29e;--acc:#e8833a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}
a{color:var(--acc)}
header{position:sticky;top:0;z-index:5;background:#12100eF2;backdrop-filter:blur(8px);
 border-bottom:1px solid var(--line);padding:14px 22px}
h1{margin:0;font-size:18px}
.sub{color:var(--mut);font-size:13px;margin-top:3px}
.nav{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.nav a{color:var(--mut);text-decoration:none;border:1px solid var(--line);border-radius:99px;
 padding:3px 11px;font-size:12px}
.nav a:hover{color:var(--fg);border-color:var(--acc)}
main{padding:22px;max-width:1560px;margin:0 auto}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;
 padding:18px;margin-bottom:20px}
h2{margin:0 0 2px;font-size:16px}
h2 .id{color:var(--acc);font-variant-numeric:tabular-nums;margin-right:8px}
h3{margin:16px 0 9px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;
 color:var(--mut);font-weight:600}
.meta{color:var(--mut);font-size:13px}
.meta b{color:#d6d3d1;font-weight:600}
.grid{display:grid;gap:13px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
figure{margin:0;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#000}
video,img.shot{width:100%;display:block;background:#000;aspect-ratio:4/5;object-fit:contain}
figcaption{padding:7px 9px;font-size:11px;color:var(--mut);background:var(--card);
 word-break:break-all;line-height:1.35}
figcaption a{text-decoration:none}
.tag{display:inline-block;border:1px solid var(--line);border-radius:4px;padding:0 5px;
 margin:0 5px 3px 0;color:#d6d3d1}
.tag.p{border-color:#3f6212;color:#a3e635}
"""


def figure(r, kind):
    name = os.path.basename(r['file'])
    src = html.escape(f"{r['sub']}/{r['folder']}/{name}")
    media = (f'<video src="{src}" controls preload="metadata" playsinline muted loop></video>'
             if kind == 'videó' else
             f'<img class="shot" src="{src}" loading="lazy" alt="">')
    dur = f'<span class="tag">{r["sec"]}s</span>' if r.get('sec') else ''
    cls = 'tag p' if r['orientation'] == 'portrait' else 'tag'
    return (f'<figure>{media}<figcaption>'
            f'<span class="{cls}">{r["orientation"]}</span>'
            f'<span class="tag">{r["w"]}x{r["h"]}</span>{dur}'
            f'<span class="tag">{round(r["bytes"]/1048576,1)}MB</span><br>{html.escape(name)}<br>'
            f'<a href="{html.escape(r["page"])}">{r["source"]}</a> · '
            f'{html.escape(r["query"])}</figcaption></figure>')


def page(folder):
    ids = sorted(pid for pid in by_post if plan[pid]['folder'] == folder)
    nv = sum(len(by_post[i]['videó']) for i in ids)
    ni = sum(len(by_post[i]['kép']) for i in ids)
    out = ['<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
           f'<title>{WB_TITLE[folder]} – média válogató</title><style>{CSS}</style>',
           '<header>', f'<h1>{html.escape(WB_TITLE[folder])} – média válogató</h1>',
           f'<div class="sub">{len(ids)} poszt · {nv} videó · {ni} kép · '
           'Pexels / Pixabay / Openverse – szabadon felhasználható, attribúció nélkül</div>',
           '<div class="nav">' + ' '.join(f'<a href="#{i}">{i}</a>' for i in ids) + '</div>',
           '</header><main>']
    for pid in ids:
        p = plan[pid]
        out += [f'<section id="{pid}">',
                f'<h2><span class="id">{pid}</span>{html.escape(p["cim"])}</h2>',
                f'<div class="meta"><b>Cél:</b> {html.escape(p["cel"])} &nbsp;·&nbsp; '
                f'<b>Excel sor:</b> {p["excel_row"]}<br>'
                f'<b>Képi ötlet:</b> {html.escape(p["kepi_otlet"])}</div>']
        for kind in ('videó', 'kép'):
            items = by_post[pid][kind]
            if not items:
                continue
            out += [f'<h3>{kind}k &nbsp;({len(items)})</h3>', '<div class="grid">']
            out += [figure(r, kind) for r in items]
            out.append('</div>')
        out.append('</section>')
    out.append('</main>')
    return '\n'.join(out)


os.makedirs(OUT, exist_ok=True)
files = []
for folder in FOLDERS:
    if not any(plan[pid]['folder'] == folder for pid in by_post):
        continue
    fn = f'valogato_{folder}.html'
    open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(page(folder))
    files.append((fn, folder))

index = ['<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
         '<title>Hobbeast Instagram – média válogató</title>', f'<style>{CSS}</style>',
         '<header><h1>Hobbeast Instagram – média válogató</h1>',
         f'<div class="sub">{counts["videó"]} videó és {counts["kép"]} kép '
         f'{len(by_post)} poszthoz</div></header>',
         '<main><section><div class="nav">']
for fn, folder in files:
    index.append(f'<a href="{fn}">{html.escape(WB_TITLE[folder])}</a>')
index += ['</div></section></main>']
open(os.path.join(OUT, 'valogato.html'), 'w', encoding='utf-8').write('\n'.join(index))
print('gallery:', ', '.join([f for f, _ in files] + ['valogato.html']))
