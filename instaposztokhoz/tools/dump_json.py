import openpyxl, json, os
base = r"C:\Work\Expericentre\instaposztokhoz"
out = {}
for f in sorted(os.listdir(base)):
    if not f.endswith(".xlsx"): continue
    wb = openpyxl.load_workbook(os.path.join(base,f), data_only=True)
    sheets = {}
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append(["" if c is None else str(c) for c in row])
        sheets[ws.title] = rows
    out[f] = sheets
with open("posts.json","w",encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=1)
print("ok")
