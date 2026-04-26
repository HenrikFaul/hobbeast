## APPEND - 2026-04-08 DSYM routing consistency

### [ROUTING-001] Mixed Supabase project refs cause frontend/backend drift
- Frontend VITE variables, CLI project_id, and internal edge-function base URL must be aligned to the same intended Supabase target when the architecture requires direct routing to that project.
- Leaving one layer on an old project ref leads to symptoms like wrong function endpoint calls, invalid auth behavior, and misleading debugging signals.
