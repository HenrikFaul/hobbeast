Address Manager parallel rebuild package

Place these files into the repo with the same relative paths.

Files included:
- src/components/admin/AdminAddressManager.tsx
- supabase/functions/address-manager-discovery/index.ts
- supabase/functions/address-manager-task-generator/index.ts
- supabase/functions/address-manager-worker/index.ts
- supabase/functions/address-manager-shared/constants.ts
- supabase/functions/address-manager-shared/repository.ts
- supabase/functions/address-manager-shared/types.ts
- supabase/migrations/20260423193000_address_manager_parallel_rebuild.sql
- supabase/config.address-manager.snippet.toml

Important:
1. Append the TOML snippet into the real supabase/config.toml.
2. Run the SQL migration or add it under supabase/migrations and deploy DB migrations.
3. Deploy these functions:
   npx supabase functions deploy address-manager-discovery --project-ref dsymdijzydaehntlmfzl
   npx supabase functions deploy address-manager-task-generator --project-ref dsymdijzydaehntlmfzl
   npx supabase functions deploy address-manager-worker --project-ref dsymdijzydaehntlmfzl
4. Frontend deploy remains separate (Vercel).

What this package does:
- keeps legacy sync-local-places untouched
- moves the Address Manager tab to the new backend path
- stores provider results in public.raw_venues
- stores matrix state in public.sync_discovery_matrix
- lets the UI list raw_venues content directly from the new function
