# Software Valuation Toolkit

Drop this folder into **any** software repository and an AI agent will produce a
branded, presentation-quality **Software Valuation & Technical Due-Diligence
Report** for that product:

- how long a human team would take to **build** it to its current state,
- which **specialists** and team setup would be required,
- what it would **cost** to build,
- and what the software is **worth** on the market today.

The report is generated in **English and Hungarian** out of the box (more
languages are easy to add). This toolkit is fully **product-agnostic** — there is
no hard-coded reference to any specific application. It reads *your* repo and
writes a report about *your* product.

---

## How to use it (3 steps)

### 1. Drop the folder in
Copy this `valuation/` folder into the root of the repository you want valued.

### 2. Tell your AI assistant
Open the repo in an AI-enabled editor (Cursor, Claude Code, Windsurf, Copilot
Chat, …) and say:

> **"Read `valuation/AI_INSTRUCTIONS.md` and follow it end-to-end."**

The AI scans the repo, researches the market, fills in the JSON data files, and
runs the generator.

### 3. Collect the PDF
The reports appear in `valuation/output/`:

```
valuation-report-en.pdf
valuation-report-hu.pdf
```

---

## How it works

The toolkit cleanly separates **rendering** from **content**:

```
                ┌─────────────────────┐
   your repo ──▶│   scan_repo.py      │──▶ data/repo_scan.json  (objective stats)
                └─────────────────────┘
                          │
          AI reads repo + scan + market, writes ▼
                ┌──────────────────────────┐
                │  data/project.json       │  branding, languages
                │  data/valuation/*.json   │  per-language 12-section content
                └──────────────────────────┘
                          │
            pure renderer ▼ (you never edit this)
              ┌──────────────────────────┐
              │  generate_valuation_pdf  │
              └──────────────────────────┘
                          │
                          ▼
                  output/*.pdf  (EN + HU)
```

`generate_valuation_pdf.py` is **deliberately dumb** — it only turns JSON into a
polished PDF. All the intelligence (reading the repo, estimating, researching the
market, triangulating value) is done by the AI following the two briefs:

- `valuation-report-prompt.md` — *what* analysis to do and to what standard.
- `AI_INSTRUCTIONS.md` — *where* the output goes and *what JSON shape* to produce.

---

## Files

| File | Purpose |
|---|---|
| `AI_INSTRUCTIONS.md` | The mechanical protocol the AI follows. **Start here if you're an AI.** |
| `valuation-report-prompt.md` | The deep analytical brief — methodology, research, quality bar. |
| `generate_valuation_pdf.py` | Renders the Valuation PDF from JSON. |
| `scan_repo.py` | Scans the host repo for objective stats (LOC, stack, git history). |
| `_fonts.py` + `fonts/` | Bundled Unicode fonts (correct Hungarian ő/ű, accents, dashes). |
| `requirements.txt` | One dependency: `reportlab`. |
| `data/` | The JSON the AI fills in. |
| `examples/` | A complete worked example (a fictional HR-SaaS) — reference shape. |
| `output/` | Where the generated PDF lands. |

---

## Run it manually

```bash
pip install -r requirements.txt

python scan_repo.py                              # optional: refresh repo stats
python generate_valuation_pdf.py --all-languages
```

Useful flags: `--lang en` (single language), `--output path.pdf` (custom path),
`--project path.json` / `--data path.json` (custom inputs).

---

## Try the example first

```bash
cp examples/project.example.json       data/project.json
mkdir -p data/valuation
cp examples/valuation/en.example.json  data/valuation/en.json
cp examples/valuation/hu.example.json  data/valuation/hu.json

python generate_valuation_pdf.py --all-languages
```

Open `output/` to see a finished report. When the AI runs on your own repo it
replaces the example data with your product's reality.

---

## Requirements

- Python 3.10+
- `reportlab` (installed via `requirements.txt`)
- Fonts are **bundled** — no system font installation needed; works on any OS.

> **Tip:** want valuation *and* a growth-strategy report from the same toolkit?
> The companion `growth_strategy/` pack includes this valuation generator plus a
> ranked growth-initiative report.

---

## License

MIT for the toolkit code. Bundled DejaVu fonts retain their own permissive
license — see `fonts/DejaVu-LICENSE.txt`.
