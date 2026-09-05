#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const migrationRoot = resolve(root, 'supabase', 'migrations');
const allMigrationNames = readdirSync(migrationRoot)
  .filter((name) => /^\d{14}.*\.sql$/i.test(name))
  .sort();
// Every migration, not a hand-picked window. This used to read
// /^202608(?:22|25|26)/, which meant NOTHING written after 2026-08-26 was ever
// audited — the count sat at "300 across 81" while four more migrations landed.
// Widening it surfaced 24 SECURITY DEFINER functions with no explicit revoke;
// 20260905210000_revoke_security_definer_from_public.sql closes them, so this
// passes on merit rather than by narrowing what it looks at.
const migrationNames = allMigrationNames;

// Revoking only FROM PUBLIC is a no-op on Supabase. Its default privileges
// grant EXECUTE DIRECTLY to anon and authenticated when a function is created,
// so the direct grant outlives a PUBLIC-only revoke — measured on the live
// database, where the ACL still read `anon=X/postgres` afterwards. A revoke
// that does not name anon therefore protects nothing.
//
// 152 historical revokes are PUBLIC-only and are left alone: rewriting
// append-only migrations is not on, and each needs its own decision about which
// roles to grant back. This is a ratchet instead — every migration from the
// cutoff must name anon, so the count of anon-callable SECURITY DEFINER
// functions can only go down from here. It was 159 of 347 when this rule
// landed; the remainder is tracked in .governance/codingLessonsLearnt.md.
const ANON_REVOKE_CUTOFF = '20260905';

const SAFE_SEARCH_PATH =
  /SET\s+search_path\s*(?:=|TO)\s*'?(?:pg_catalog'?\s*,\s*'?)?public'?(?:\s*,\s*'?pg_temp'?)?/i;

// A REVOKE stays in force until something grants the privilege back, so it
// counts wherever it was written — not only inside the file that happens to
// hold the newest CREATE OR REPLACE of the function.
const allMigrationSql = allMigrationNames
  .map((name) => readFileSync(resolve(migrationRoot, name), 'utf8'))
  .join('\n');

const failures = [];
let audited = 0;

for (const migrationName of migrationNames) {
  const sql = readFileSync(resolve(migrationRoot, migrationName), 'utf8');
  const starts = [...sql.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([\w.]+)\s*\(/gi)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const functionName = start[1].toLowerCase();
    const nextOffset = starts[index + 1]?.index ?? sql.length;
    const segment = sql.slice(start.index, nextOffset);
    if (!/SECURITY\s+DEFINER/i.test(segment)) continue;
    audited += 1;

    // Both spellings are safe and both are used in this repo:
    //   SET search_path = public
    //   SET search_path TO 'pg_catalog', 'public'
    if (!SAFE_SEARCH_PATH.test(segment)) {
      failures.push(`${migrationName}: ${functionName} has no explicit safe search_path`);
    }

    const unqualified = functionName.replace(/^public\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const revokePattern = new RegExp(
      `REVOKE\\s+(?:ALL|EXECUTE)[^;]*ON\\s+FUNCTION\\s+public\\.${unqualified}\\s*\\(`,
      'i',
    );
    if (!revokePattern.test(allMigrationSql)) {
      failures.push(`${migrationName}: ${functionName} is not explicitly revoked from PUBLIC`);
    }

    // The ratchet: a revoke written from the cutoff onwards must name anon,
    // because a PUBLIC-only one leaves Supabase's direct anon grant standing.
    if (migrationName >= ANON_REVOKE_CUTOFF) {
      const revokeRoles = new RegExp(
        `REVOKE\\s+(?:ALL|EXECUTE)[^;]*ON\\s+FUNCTION\\s+public\\.${unqualified}\\s*\\([^;]*?FROM\\s+([^;]+);`,
        'i',
      ).exec(sql);
      if (revokeRoles && !/\banon\b/i.test(revokeRoles[1])) {
        failures.push(
          `${migrationName}: ${functionName} is revoked from PUBLIC only — name anon too, `
          + 'or Supabase\'s default direct grant leaves it callable by anonymous clients',
        );
      }
    }
  }
}

// Historical migrations are append-only, so audit the effective permission
// state of secret-bearing helpers instead of pretending their old GRANT text
// disappeared. Any later remediation must explicitly revoke every client role.
const protectedFunctions = [
  'resolve_internal_service_role_key',
  'enqueue_local_places_batch',
  'schedule_daily_local_places_sync',
];
const clientRoles = new Set(['public', 'anon', 'authenticated']);
const effectiveClientGrants = new Map(protectedFunctions.map((name) => [name, new Set()]));

for (const migrationName of allMigrationNames) {
  const sql = readFileSync(resolve(migrationRoot, migrationName), 'utf8');
  for (const functionName of protectedFunctions) {
    const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const permissionPattern = new RegExp(
      `\\b(GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION|REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION)\\s+public\\.${escaped}\\s*\\([^;]*?\\)\\s+(TO|FROM)\\s+([^;]+);`,
      'gi',
    );
    for (const match of sql.matchAll(permissionPattern)) {
      const operation = match[1].toUpperCase().startsWith('GRANT') ? 'grant' : 'revoke';
      const roles = match[3]
        .split(',')
        .map((role) => role.trim().replace(/^"|"$/g, '').toLowerCase())
        .filter((role) => clientRoles.has(role));
      for (const role of roles) {
        if (operation === 'grant') effectiveClientGrants.get(functionName).add(role);
        else effectiveClientGrants.get(functionName).delete(role);
      }
    }
  }
}

for (const [functionName, roles] of effectiveClientGrants) {
  if (roles.size > 0) {
    failures.push(`effective permissions: public.${functionName} remains executable by ${[...roles].join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error(`Security-definer audit failed (${failures.length} finding(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Security-definer audit passed: ${audited} function definition(s) across ${migrationNames.length} migration(s).`);
