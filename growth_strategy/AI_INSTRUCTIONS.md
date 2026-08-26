# AI_INSTRUCTIONS.md — Repo → Valuation + Growth Strategy reports

> **For the human:** drop this `growth_strategy/` folder into any project's repository, open the repo in an AI-enabled editor (Cursor / Claude Code / Windsurf / etc.), and give the AI one instruction:
>
> > **"Read `growth_strategy/AI_INSTRUCTIONS.md` and follow it end-to-end."**
>
> The AI analyzes the repo, fills in JSON data files, and generates four branded PDFs (Valuation EN/HU + Growth Strategy EN/HU) into `growth_strategy/output/`.

---

## 0 · What you (the AI) are producing

Two PDF reports, each in every language declared in `data/project.json`:

1. **Valuation Report** — 12-section software valuation & technical due-diligence.
2. **Growth Strategy Report** — Top-N ranked initiatives that raise the product's valuation.

The two Python scripts are **pure renderers** — they read JSON and emit PDF. You do **not** edit them. Your job is to produce correct JSON.

```
growth_strategy/
├── generate_growth_pdf.py        ← renderer (growth)   — do not edit
├── generate_valuation_pdf.py     ← renderer (valuation)— do not edit
├── scan_repo.py                  ← repo auto-scanner    — run it, don't edit
├── _fonts.py / fonts/            ← Unicode fonts        — leave alone
├── data/                         ← YOU FILL THIS
│   ├── project.json
│   ├── growth_strategy.json
│   ├── valuation/en.json , hu.json , ...
│   └── repo_scan.json            ← produced by scan_repo.py
├── examples/                     ← reference (Effectime) — copy & adapt, never ship as-is
└── output/                       ← generated PDFs land here
```

---

## 1 · Setup (run once)

```bash
pip install -r growth_strategy/requirements.txt      # only dependency: reportlab
python growth_strategy/scan_repo.py                  # writes data/repo_scan.json
```

`repo_scan.json` gives you objective numbers — file counts, lines of code, detected
stack, git history. **Use these real numbers.** Inventing LOC figures destroys the
report's credibility.

If `data/project.json` does not exist, copy `examples/project.example.json` to
`data/project.json` as a starting point.

---

## 2 · Understand the product (do this before writing any JSON)

Read enough of the repo to answer each of these in one honest sentence:

- **What is this product?** e.g. "A multi-tenant HR leave-management SaaS for CEE SMEs."
- **Who are the users / personas?**
- **Core value proposition** — why does anyone use it?
- **Technical stack** — frontend / backend / database / hosting (cross-check `repo_scan.json`).
- **Market category** — HR SaaS, dev tools, fintech, e-commerce, gaming, infra, …
- **Team / target market region** — affects currency and rate assumptions.
- **Maturity stage** — pre-product, MVP, early customers, growth, mature.
- **Visible competitors** — from README, package names, comments, docs.
- **Standout / unique features** — the things that are genuinely differentiated.

Sources to read: the repo's own top-level `README.md`, `package.json` /
`pyproject.toml` / `Cargo.toml` / `go.mod`, the `src/` or `app/` tree, 4–8
representative source files, any `CHANGELOG.md`, `docs/`, and migration files.

**Do not generalize.** Every initiative and every valuation lens must be grounded
in *this* repo. If the product is a CLI log parser, "AI scheduling copilot" is not
a valid growth initiative — "structured-output plugin API" might be.

---

## 3 · Fill `data/project.json`

Shared branding + metadata for both reports. Full field reference is in
`examples/project.example.json`. Key rules:

| Field | How to fill |
|---|---|
| `product_name` | Exact name from code/README. |
| `logo_letter` | First letter of the product name (cover-page logo block). |
| `languages` | Subset of `["en","hu","de"]`. Add more only if you extend `UI_STRINGS` in both renderers. |
| `repository`, `version` | From git remote / `package.json` / git tag. Omit if genuinely unknown — never invent. |
| `prepared_date` | Today's date, ISO format. |
| `baseline_valuation` | The product's **current** value — comes out of the valuation report (Section 9). |
| `target_valuation` | Value **after** all growth initiatives ship — sum of initiative impacts + baseline. |
| `value_multiple` | `target ÷ baseline`, e.g. `"8–10×"`. |
| `brand` | Optional hex-colour overrides. Default theme is indigo/slate. Match the product's real brand if it has one. |
| currency | If the product/market is not € based, switch every figure to `$`, `£`, etc. |

---

## 4 · Fill the Valuation Report — `data/valuation/<lang>.json`

One file per language, identical structure, only the text differs. Build the
English file first, then translate. Use `examples/valuation/en.json` and `hu.json`
as the canonical shape — they are complete and render correctly.

### Universal section shape

Every section is **optional except `executive_summary`**. A missing section is
silently skipped. Every section (2–12) uses this shape; fill only what you have
evidence for:

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
          "headers": ["Col A", "Col B", "Col C"],
          "rows": [["a1","a2","a3"], ["b1","b2","b3"]],
          "col_widths": [150, 110, 200],          // optional, points; columns sum ≈ 500
          "highlight_penultimate": true,           // subtotal row styling
          "highlight_last": true                   // total row styling
        }
      ],
      "subsections": [ { "title": "...", "body": "..." } ],
      "bullets": ["...", "..."],
      "bullet_marker": "→",                        // optional, default "•"; use ✓ / ~ / ✗ for evidence tiers
      "kpis": [ { "label": "Lines of Code", "value": "31,435" } ],
      "callouts": ["⚠ <b>Note:</b> boxed emphasis text"]
    }
  ],
  "callout": "Section-level boxed emphasis (optional)",
  "closing": "Italic small-print closer (optional)"
}
```

Inline HTML allowed in any text field: `<b>`, `<i>`, `<br/>`, `<font color='#RRGGBB'>`.

### What goes in each of the 12 sections

| # | Key | Content |
|---|---|---|
| 1 | `executive_summary` | **Required.** `description`, `kpis` (real numbers from `repo_scan.json`), three summary `tables` (Build Effort / Build Cost / Market Value), and a `callout` naming the biggest uncertainty. |
| 2 | `product_reconstruction` | Tech-stack table; feature-module map table. |
| 3 | `scope_decomposition` | Complexity-by-area table; complexity-multiplier table. |
| 4 | `methodology` | Estimation methods as `subsections`; "Important Distinctions" bullets. |
| 5 | `team_composition` | Required-roles table; 3 delivery-team options as `callouts`. |
| 6 | `effort_estimate` | PERT breakdown table (use `highlight_penultimate`+`highlight_last`); multi-unit summary table. |
| 7 | `cost_estimate` | Detailed cost-model table (`highlight_last` on TOTAL); scenario-range table. |
| 8 | `market_comparison` | Comparable-products table; valuation-multiples table. Research real competitors. |
| 9 | `market_value_estimate` | 5 valuation lenses as `subsections`; final-ranges table; `callout` with the central estimate. **This produces the `baseline_valuation` you wrote in `project.json`.** |
| 10 | `assumptions_limitations` | Three bullet groups: Known (`✓`), Inferred (`~`), Missing (`✗`). |
| 11 | `next_steps` | Recommendation groups (cost optimisation / sale-fundraising / tech-debt). |
| 12 | `appendix` | Detail tables (DB inventory, confidence assessment); italic `closing`. |

### Estimation discipline (these rules are non-negotiable)

- Never give a single number without a range (Low / Most Likely / High).
- Use PERT: `E = (O + 4·M + P) / 6`. State assumptions explicitly.
- Separate **effort** from **duration**, and **build cost** from **market value**.
- Include non-coding work: QA, PM, design, DevOps, documentation.
- State the currency/region basis. State confidence honestly.
- Triangulate market value across ≥3 lenses; never a single-point claim.
- Separate hard evidence from inference (Section 10 enforces this).

---

## 5 · Fill the Growth Strategy Report — `data/growth_strategy.json`

A list of ranked initiatives. The renderer handles **any count** (5, 10, 20, 30…)
— rank #1 is the highest-impact. Use `examples/growth_strategy.example.json` as the
shape.

```jsonc
{
  "initiatives": [
    {
      "value": "+€800k–€1,350k",          // shared across languages; drives auto-totals
      "translations": {
        "en": {
          "title":   "AI Scheduling Copilot (Conversational AI Layer)",
          "desc":    ["Paragraph 1 — what it is and why it's #1.",
                      "Paragraph 2 — market evidence, competitor data, cite sources.",
                      "Paragraph 3 — concrete technical approach for THIS codebase."],
          "impl":    ["Implementation prompt, line by line.",
                      "Reference real files/paths from the repo.",
                      "Written to be pasted straight into an AI coding assistant."],
          "metrics": [["Valuation multiple (ARR)", "3.5× → 6–8×"],
                      ["Enterprise deal conversion", "+35–45%"]],
          "regen":   "A meta-prompt that regenerates THIS initiative in more depth."
        },
        "hu": { "...": "same keys, Hungarian text" }
      }
    }
  ]
}
```

### How to choose and rank initiatives

1. Brainstorm 20–30 candidate improvements grounded in the actual product.
2. Score each on: valuation impact, strategic moat, feasibility on the current
   stack, market-timing, and differentiation.
3. Rank by impact. Keep the top 10–20 (10 is a solid default; the example has 10).
4. For each: write 3 description paragraphs, a real implementation prompt
   (reference actual files), 2–4 metrics, a shared `value` range, and a regen prompt.
5. `value` strings like `"+€800k–€1,350k"` or `"+$2M–$4M"` are parsed automatically
   for the TOC and summary-matrix totals — keep the format consistent
   (`+<cur><num>[k|M]–<cur><num>[k|M]`).

### Quality bar for initiatives

- **Specific, not generic.** "Add AI" is not an initiative. "Conversational
  scheduling copilot via a Supabase Edge Function calling the existing
  `smartSchedule` engine" is.
- **Evidence-backed.** Cite real market data, competitors, analyst reports.
- **Implementable.** The `impl` block must reference real files and be runnable
  by an AI coding assistant inside this repo.
- **Honest economics.** Value ranges triangulated, not wishful.

---

## 6 · Generate the PDFs

```bash
cd growth_strategy

python generate_valuation_pdf.py --all-languages
python generate_growth_pdf.py    --all-languages
```

Single language: `--lang en`. Custom output: `--output path/to/file.pdf`.

Output lands in `growth_strategy/output/`:
`valuation-report-en.pdf`, `valuation-report-hu.pdf`,
`growth-strategy-en.pdf`, `growth-strategy-hu.pdf`.

---

## 7 · Verify before finishing

- [ ] Both scripts ran with **no errors**; four PDFs exist in `output/`.
- [ ] `repo_scan.json` numbers match what the reports claim.
- [ ] Zero "Effectime" / example text remains — everything reflects the real repo.
- [ ] Every growth initiative is specific to this product and implementable.
- [ ] Valuation figures are range-based and triangulated.
- [ ] `baseline_valuation` in `project.json` matches Section 9 of the valuation report.
- [ ] Hungarian (and any other non-English) text renders correctly — the bundled
      DejaVu fonts handle this; keep the `fonts/` folder next to the scripts.
- [ ] Currency is consistent and appropriate for the product's market.

Then tell the human: which PDFs were generated, the headline valuation and
target numbers, and the single biggest uncertainty driver.

---

## 8 · Notes & edge cases

- **Adding a language:** add a key to `UI_STRINGS` in *both* renderers, add the
  language to `project.json → languages`, and supply the translations in the
  data files. `en`, `hu`, `de` ship built-in.
- **No git history:** `repo_scan.json` git fields are null — estimate the timeline
  from changelog/file dates and say so in Section 10.
- **Monorepo:** point `scan_repo.py --root` at the specific package directory.
- **Re-running:** safe and idempotent. Re-run after the repo changes to refresh.
- **The renderers are protected:** never edit `generate_*.py`, `_fonts.py`, or
  `fonts/`. All customization happens in `data/` and `project.json`.
