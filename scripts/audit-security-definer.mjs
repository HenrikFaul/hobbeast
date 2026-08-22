#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const migrationRoot = resolve(root, 'supabase', 'migrations');
const migrationNames = readdirSync(migrationRoot)
  .filter((name) => /^20260822\d+.*\.sql$/i.test(name))
  .sort();

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

if (failures.length > 0) {
  console.error(`Security-definer audit failed (${failures.length} finding(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Security-definer audit passed: ${audited} function definition(s) across ${migrationNames.length} migration(s).`);
