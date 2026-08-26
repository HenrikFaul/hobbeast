import json, re, unicodedata

MAP = {
 'Hobbeast_Instagram_30_Poszt_Terv.xlsx': ('A', 'A_30_poszt_terv'),
 'Hobbeast_Instagram_Kovetkezo_20_Poszt.xlsx': ('B', 'B_kovetkezo_20_poszt'),
 'Hobbeast_Instagram_Oszi_15_Poszt.xlsx': ('C', 'C_oszi_15_poszt'),
}
HU = str.maketrans({'á':'a','é':'e','í':'i','ó':'o','ö':'o','ő':'o','ú':'u','ü':'u','ű':'u',
                    'Á':'a','É':'e','Í':'i','Ó':'o','Ö':'o','Ő':'o','Ú':'u','Ü':'u','Ű':'u'})
def slug(s, n=46):
    s = s.lower().translate(HU)
    s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip('-')
    return s[:n].rstrip('-')

posts = json.load(open('posts.json', encoding='utf-8'))
queries = json.load(open('queries.json', encoding='utf-8'))
queries2 = json.load(open('queries2.json', encoding='utf-8'))
plan = []
for fname, sheets in posts.items():
    code, folder = MAP[fname]
    for sheet, rows in sheets.items():
        hdr = rows[0]
        for i, r in enumerate(rows[1:], 1):
            rec = dict(zip(hdr, r))
            pid = f"{code}{i:02d}"
            plan.append({
                'id': pid, 'workbook': fname, 'sheet': sheet, 'excel_row': i + 1,
                'folder': folder,
                'cel': rec.get('Cél', ''),
                'cim': rec.get('Poszt címe', ''),
                'ertelmezes': rec.get('Értelmezés', ''),
                'kepi_otlet': rec.get('Képi ötlet', ''),
                'stock_kw': rec.get('Stock Keresőszó', ''),
                'ai_prompt': rec.get('AI Prompt', ''),
                'slug': slug(rec.get('Poszt címe', '')),
                'queries': queries[pid] + queries2.get(pid, []),
            })
json.dump(plan, open('plan.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(plan), 'posts planned')
for p in plan[:3] + plan[-2:]:
    print(p['id'], '|', p['folder'], '|', p['slug'], '|', p['queries'][0])
