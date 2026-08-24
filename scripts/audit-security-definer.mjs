#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const migrationRoot = resolve(root, 'supabase', 'migrations');
const allMigrationNames = readdirSync(migrationRoot)
  .filter((name) => /^\d{14}.*\.sql$/i.test(name))
  .sort();
const migrationNames = allMigrationNames
  .filter((name) => /^202608(?:22|25)\d+.*\.sql$/i.test(name));

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

    if (!/SET\s+search_path\s*=\s*(?:pg_catalog\s*,\s*)?public(?:\s*,\s*pg_temp)?/i.test(segment)) {
      failures.push(`${migrationName}: ${functionName} has no explicit safe search_path`);
    }

    const unqualified = functionName.replace(/^public\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const revokePattern = new RegExp(
      `REVOKE\\s+(?:ALL|EXECUTE)[^;]*ON\\s+FUNCTION\\s+public\\.${unqualified}\\s*\\(`,
      'i',
    );
    if (!revokePattern.test(sql)) {
      failures.push(`${migrationName}: ${functionName} is not explicitly revoked from PUBLIC`);
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
