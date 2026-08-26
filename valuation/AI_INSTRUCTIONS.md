# AI_INSTRUCTIONS.md — Repo → Software Valuation Report

> **For the human:** drop this `valuation/` folder into any project's repository,
> open the repo in an AI-enabled editor (Cursor / Claude Code / Windsurf / …), and
> give the AI one instruction:
>
> > **"Read `valuation/AI_INSTRUCTIONS.md` and follow it end-to-end."**
>
> The AI analyzes the repo and generates a branded 12-section valuation PDF in
> every configured language into `valuation/output/`.

---

## 0 · What you (the AI) are producing

A **Software Valuation & Technical Due-Diligence Report** — a rigorous,
evidence-based estimate of:

- how long a human team would take to build the product to its current state,
- which specialists are required and what the team should look like,
- what it would cost to build,
- and what the software is worth on the market today.

Output: one PDF per language declared in `data/project.json` (e.g.
`valuation-report-en.pdf`, `valuation-report-hu.pdf`).

`generate_valuation_pdf.py` is a **pure renderer** — it reads JSON and emits a PDF.
You do **not** edit it. Your job is to produce correct JSON.

```
valuation/
├── generate_valuation_pdf.py    ← renderer — do not edit
├── scan_repo.py                 ← repo auto-scanner — run it, don't edit
├── valuation-report-prompt.md   ← the deep analytical brief — read it, it defines the standard
├── _fonts.py / fonts/           ← Unicode fonts — leave alone
├── data/                        ← YOU FILL THIS
│   ├── project.json
│   ├── valuation/en.json , hu.json , ...
│   └── repo_scan.json           ← produced by scan_repo.py
├── examples/                    ← reference (a fictional HR-SaaS) — copy & adapt
└── output/                      ← generated PDF lands here
```

---

## 1 · Setup

```bash
pip install -r valuation/requirements.txt        # only dependency: reportlab
python valuation/scan_repo.py                    # writes data/repo_scan.json
```

`repo_scan.json` gives objective numbers — file counts, lines of code, detected
stack, git history. **Use these real numbers.** Inventing figures destroys credibility.

If `data/project.json` does not exist, copy `examples/project.example.json` to
`data/project.json` and edit it.

---

## 2 · Read `valuation-report-prompt.md`

That file is the full analytical brief — it defines the methodology, the required
research, the analytical rules, and the quality bar. **Follow it.** This file
(`AI_INSTRUCTIONS.md`) only adds the mechanical detail of *where the output goes*
and *what JSON shape the renderer expects*.

Key rules from the brief, repeated because they matter:

- Never give a single number without a range (Low / Most Likely / High).
- Use multiple estimation methods; triangulate. PERT: `E = (O + 4·M + P) / 6`.
- Separate **effort** from **duration**, **build cost** from **market value**.
- Include non-coding work: QA, PM, design, DevOps, documentation.
- Research **real** comparable products and market multiples online.
- Triangulate market value across ≥3 lenses; never a single-point claim.
- State currency/region basis and confidence honestly.
- Separate hard evidence from inference.

---

## 3 · Understand the product

Before writing JSON, read enough of the repo to know: what the product is, who
uses it, its tech stack (cross-check `repo_scan.json`), its market category, the
team/market region (drives currency and rates), its maturity stage, and its real
competitors. Read the repo's own `README.md`, its manifest
(`package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod`), the `src/` tree,
several representative source files, the `CHANGELOG.md`, and migrations.

---

## 4 · Fill `data/project.json`

Branding + metadata. See `examples/project.example.json` for all fields.

| Field | How to fill |
|---|---|
| `product_name`, `logo_letter` | From code/README; `logo_letter` is the first letter. |
| `languages` | Subset of `["en","hu","de"]` (these ship built-in). |
| `repository`, `version` | From git / manifest. Omit if genuinely unknown — don't invent. |
| `prepared_date` | Today, ISO format. |
| `confidence_label` | Overall confidence, e.g. `"Medium-High"`. |
| `brand` | Optional hex colours; default theme is indigo/slate. |
| currency | Switch all figures to `$` / `£` / etc. if the market isn't € based. |

---

## 5 · Fill the valuation content — `data/valuation/<lang>.json`

One file per language, identical structure, only text differs. Build English
first, then translate. Use `examples/valuation/en.json` and `hu.json` as the
canonical shape — they are complete and render correctly.

### Universal section shape

Every section is **optional except `executive_summary`**; a missing section is
skipped. Each section uses this shape — fill only what you have evidence for:

```jsonc
{
  "title": "Optional — overrides the canonical section name",
  "intro": "Optional opening paragraph(s) — string or array of strings",
  "h2_blocks": [
    {
      "title": "Subsection heading",
      "body":  "Paragraph(s) — string or array",
      "tables": [
        {
          "title": "Optional heading above the table",
          "headers": ["Col A", "Col B"],
          "rows": [["a1","a2"], ["b1","b2"]],
          "col_widths": [250, 250],          // optional, points; sum ≈ 500
          "highlight_penultimate": true,     // subtotal row styling
          "highlight_last": true             // total row styling
        }
      ],
      "subsections": [ { "title": "...", "body": "..." } ],
      "bullets": ["...", "..."],
      "bullet_marker": "→",                  // optional; ✓ / ~ / ✗ for evidence tiers
      "kpis": [ { "label": "Lines of Code", "value": "31,435" } ],
      "callouts": ["⚠ <b>Note:</b> boxed emphasis text"]
    }
  ],
  "callout": "Section-level boxed emphasis (optional)",
  "closing": "Italic small-print closer (optional)"
}
```

Inline HTML allowed in text fields: `<b>`, `<i>`, `<br/>`, `<font color='#RRGGBB'>`.

### The 12 sections (top-level keys)

| # | Key | Content |
|---|---|---|
| 1 | `executive_summary` | **Required.** `description`, `kpis` (real numbers), three summary `tables` (Build Effort / Build Cost / Market Value), `callout` naming the biggest uncertainty. |
| 2 | `product_reconstruction` | Tech-stack table; feature-module map. |
| 3 | `scope_decomposition` | Complexity-by-area table; complexity multipliers. |
| 4 | `methodology` | Estimation methods as `subsections`; key distinctions as bullets. |
| 5 | `team_composition` | Required-roles table; 3 delivery-team options as `callouts`. |
| 6 | `effort_estimate` | PERT breakdown table (`highlight_penultimate`+`highlight_last`); multi-unit summary. |
| 7 | `cost_estimate` | Detailed cost-model table (`highlight_last` on TOTAL); scenario ranges. |
| 8 | `market_comparison` | Comparable-products table; valuation-multiples table. Research real peers. |
| 9 | `market_value_estimate` | 5 valuation lenses as `subsections`; final-ranges table; `callout` with central estimate. |
| 10 | `assumptions_limitations` | Three bullet groups: Known (`✓`), Inferred (`~`), Missing (`✗`). |
| 11 | `next_steps` | Recommendation groups (cost optimisation / sale-fundraising / tech-debt). |
| 12 | `appendix` | Detail tables (DB inventory, confidence assessment); italic `closing`. |

---

## 6 · Generate the PDF

```bash
cd valuation
python generate_valuation_pdf.py --all-languages
```

Single language: `--lang en`. Custom output: `--output path/to/file.pdf`.
Output lands in `valuation/output/`.

---

## 7 · Verify before finishing

- [ ] Script ran with **no errors**; the PDF(s) exist in `output/`.
- [ ] `repo_scan.json` numbers match what the report claims.
- [ ] Zero example ("Effectime") text remains — everything reflects the real repo.
- [ ] Every figure is range-based; market value triangulated across ≥3 lenses.
- [ ] Comparable products are real and were researched, not invented.
- [ ] Hungarian / non-English text renders correctly (bundled DejaVu fonts handle
      this — keep the `fonts/` folder next to the script).
- [ ] Currency is consistent and appropriate for the product's market.

Then tell the human: the headline build-cost and market-value ranges, the
confidence level, and the single biggest uncertainty driver.

---

## 8 · Notes & edge cases

- **Adding a language:** add a key to `UI_STRINGS` in `generate_valuation_pdf.py`,
  add the language to `project.json → languages`, supply the translated data file.
- **No git history:** `repo_scan.json` git fields are null — estimate the timeline
  from changelog/file dates and state that in Section 10.
- **Monorepo:** point `scan_repo.py --root` at the specific package directory.
- **The renderer is protected:** never edit `generate_valuation_pdf.py`, `_fonts.py`,
  or `fonts/`. All customization happens in `data/` and `project.json`.
