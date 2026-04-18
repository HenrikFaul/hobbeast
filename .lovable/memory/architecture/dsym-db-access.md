---
name: dsym DB query access
description: How to query the dsym (target) Supabase DB — supabase--read_query does NOT work for it
type: constraint
---
The `supabase--read_query` tool ONLY queries the Lovable Cloud DB (olzvugh...). It CANNOT query the target `dsymdijzydaehntlmfzl` project.

To query dsym DB, ALWAYS use REST API via curl with service role key:
```bash
curl -sS "https://dsymdijzydaehntlmfzl.supabase.co/rest/v1/<TABLE>?select=*&limit=10" \
  -H "apikey: $EXTERNAL_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"
```

Never use `supabase--read_query` for dsym tables (places_local_catalog, place_sync_state, place_sync_logs, etc.) — results will be wrong/empty because they live on dsym, not on Lovable Cloud.

**Why:** Lovable's read_query tool is bound to the project's own Supabase. The dsym project is external/target only.
**How to apply:** For any dsym status check or row count, use curl REST. For mutations, use the edge function actions or migration tool against dsym.
