# Local coding lessons learnt

## 2026-08-24 — v1.9.6 visual redesign

- For a mature product-wide reskin, remapping stable compatibility classes and shared
  primitives gives broad coverage with lower regression risk than renaming every old
  `tech-grid`/`chrome-panel` consumer.
- A token-only colour swap is not enough when the visual problem is compositional.
  Recompose the highest-traffic surfaces while keeping data and action handlers intact.
- Tailwind custom opacity values must use bracket syntax (for example
  `bg-card/[0.78]`); unsupported forms such as `bg-card/78` silently produce no CSS.
- Screenshot review must include the first mobile viewport. A desktop split hero can
  hide the human image below the fold unless the mobile layout is intentionally
  reordered.
- Custom modals need the same baseline guarantees as Radix dialogs: mobile gutters,
  labelled close controls, bounded inner scrolling and background-scroll cleanup.
- Offline UI QA should record expected provider/config errors separately from visual
  regressions; it is local proof, never hosted or production proof.
- Re-read `HEAD`, `origin/main` and the worktree immediately before committing. If a
  concurrent process has already committed and published the owned slice, never
  duplicate or amend that shared history; append a factual closure commit instead.
