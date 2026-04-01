# Shared Dev Governance Controller

This repository is governed by the central pack from `HenrikFaul/governance`.

## Non-negotiable rules
1. Never break already working functionality.
2. Read `.governance/codingLessonsLearnt.md` and the local `CHANGELOG.md` before implementation.
3. Prefer the smallest regression-risk solution.
4. Validate with build, lint, typecheck, tests, and route-specific smoke checks where available.
5. Append new repo-specific lessons to `codingLessonsLearnt.local.md` only; the collector will merge them back to the shared repo.
6. When required by the repo, update `CHANGELOG.md` and the `versioning/` documentation pair.
7. Keep AI instruction files generated from this controller and do not hand-edit them.

## Required delivery checklist
- Read lessons + changelog
- Identify root cause
- Compare at least 2 solution options when risk is non-trivial
- Implement with checklist discipline
- Re-check that previously working features still work
- Update changelog and versioning artifacts when applicable

## Files
- Shared lessons: `.governance/codingLessonsLearnt.md`
- Shared versioning rules: `.governance/versioning-guidelines.md`
- Local lessons append target: `codingLessonsLearnt.local.md`
