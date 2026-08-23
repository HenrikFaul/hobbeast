#!/usr/bin/env node
// Reproducible database verification against a disposable PostgreSQL cluster.
//
// Two modes:
//   --mode=restore (default)  restore a production dump, then replay every
//                             repository migration that the dump has not seen.
//                             This is the only gate that proves the live data
//                             can actually reach the repository's schema head.
//   --mode=fresh              replay the whole migration chain on an empty
//                             database, which proves a new environment can be
//                             provisioned from the repository alone.
//
// Afterwards every fixture in supabase/tests/*.sql runs; each fixture is
// self-rolling-back, so they neither depend on nor pollute each other.
//
// Nothing here ever touches a hosted project. The cluster is created with
// initdb into a temporary directory, listens on 127.0.0.1 only, and is removed
// on exit unless --keep is passed.
//
// Environment:
//   PG_BIN              directory holding initdb/pg_ctl/psql/pg_restore
//   HOBBEAST_DB_DUMP    dump file, or a directory to take the newest dump from
//
// Usage:
//   node scripts/verify-database.mjs [--mode=restore|fresh] [--keep] [--port=N]

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const mode = flag('mode', 'restore');
const keep = args.includes('--keep');
const forcedPort = Number(flag('port', '0')) || null;

const DEFAULT_DUMP_DIR = 'E:/databasebackup/Hobbeast/backups';
const EXT_SHARE_DIR = join(root, 'supabase', 'tests', '_local', 'pgshare');
const ROLES_SQL = join(root, 'supabase', 'tests', '_local', '00_roles.sql');
const PLATFORM_SQL = join(root, 'supabase', 'tests', '_local', '01_platform.sql');
const MIGRATIONS_DIR = join(root, 'supabase', 'migrations');
const FIXTURES_DIR = join(root, 'supabase', 'tests');
const PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':';

function fail(message) {
  console.error(`\u2717 db:verify — ${message}`);
  process.exit(1);
}

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const roots = ['C:/Program Files/PostgreSQL', 'C:/Program Files (x86)/PostgreSQL'];
  for (const base of roots) {
    if (!existsSync(base)) continue;
    const versions = readdirSync(base)
      .filter((entry) => /^\d+$/.test(entry))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const bin = join(base, version, 'bin');
      if (existsSync(join(bin, 'initdb.exe')) || existsSync(join(bin, 'initdb'))) return bin;
    }
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['initdb'], {
    encoding: 'utf8',
  });
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).find(Boolean);
    if (first) return resolve(first, '..');
  }
  return null;
}

function resolveDump() {
  const configured = process.env.HOBBEAST_DB_DUMP || DEFAULT_DUMP_DIR;
  if (!existsSync(configured)) return null;
  if (statSync(configured).isFile()) return configured;
  const candidates = readdirSync(configured)
    .filter((name) => name.endsWith('.dump'))
    .map((name) => join(configured, name))
    .filter((path) => statSync(path).size > 0)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

async function freePort() {
  if (forcedPort) return forcedPort;
  return new Promise((done, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

const pgBin = findPgBin();
if (!pgBin) fail('no PostgreSQL installation found; set PG_BIN to a directory containing initdb');
const tool = (name) => join(pgBin, name);

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

let clusterDir = null;
let port = null;

function psql(sqlArgs, database = 'hobbeast_verify') {
  return run(tool('psql'), [
    '-w',
    '-h', '127.0.0.1',
    '-p', String(port),
    '-U', 'postgres',
    '-d', database,
    '-q',
    ...sqlArgs,
  ]);
}

function psqlQuery(sql, database = 'hobbeast_verify') {
  const result = psql(['-tAc', sql], database);
  if (result.status !== 0) fail(`query failed: ${sql}\n${result.stderr}`);
  return result.stdout.replace(/\r/g, '').trim();
}

function stopCluster() {
  if (!clusterDir) return;
  run(tool('pg_ctl'), ['-D', clusterDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  if (!keep) {
    try {
      rmSync(resolve(clusterDir, '..'), { recursive: true, force: true });
    } catch {
      /* a locked temp directory is not a verification failure */
    }
  }
}

process.on('exit', stopCluster);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));

const workDir = mkdtempSync(join(tmpdir(), 'hobbeast-dbverify-'));
clusterDir = join(workDir, 'data');
port = await freePort();

console.log(`db:verify — mode=${mode} port=${port}`);
console.log(`db:verify — cluster ${clusterDir}`);

const init = run(tool('initdb'), [
  '-D', clusterDir,
  '-U', 'postgres',
  '--auth=trust',
  '--encoding=UTF8',
  '--locale=C',
]);
if (init.status !== 0) fail(`initdb failed\n${init.stderr}`);

const logFile = join(workDir, 'server.log');
// stdio must be fully detached: on Windows the postmaster inherits pg_ctl's
// pipes, so a piped spawnSync would block forever waiting for them to close.
const start = run(
  tool('pg_ctl'),
  ['-D', clusterDir, '-l', logFile, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start'],
  { stdio: 'ignore' },
);
if (start.status !== 0) {
  let log = '';
  try {
    log = readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-10).join('\n');
  } catch {
    /* the log may not exist when startup failed very early */
  }
  fail(`could not start the disposable cluster\n${log}`);
}

const createDb = psql(['-c', 'create database hobbeast_verify'], 'postgres');
if (createDb.status !== 0) fail(`create database failed\n${createDb.stderr}`);

// The stub extension share directory supplies pg_net / pg_cron / supabase_vault
// so hosted-platform statements replay without any network or scheduler.
const extPath = `$system${PATH_SEPARATOR}${EXT_SHARE_DIR.replace(/\\/g, '/')}`;
const setExtPath = psql(
  ['-c', `alter database hobbeast_verify set extension_control_path = '${extPath}'`],
  'postgres',
);
if (setExtPath.status !== 0) {
  fail(
    'could not set extension_control_path; PostgreSQL 18 or newer is required for the ' +
      `platform extension stubs\n${setExtPath.stderr}`,
  );
}

const roles = psql(['-v', 'ON_ERROR_STOP=1', '-f', ROLES_SQL]);
if (roles.status !== 0) fail(`role bootstrap failed\n${roles.stderr}`);

let ledgerMax = '00000000000000';

if (mode === 'restore') {
  const dump = resolveDump();
  if (!dump) {
    fail(
      'no production dump found; set HOBBEAST_DB_DUMP to a .dump file or a directory, ' +
        'or run with --mode=fresh',
    );
  }
  console.log(`db:verify — restoring ${dump}`);
  const restore = run(tool('pg_restore'), [
    '-h', '127.0.0.1',
    '-p', String(port),
    '-U', 'postgres',
    '-d', 'hobbeast_verify',
    '--no-password',
    dump,
  ]);
  const restoreErrors = (restore.stderr.match(/^pg_restore: error/gm) || []).length;
  if (restoreErrors > 0) {
    console.error(restore.stderr.split(/\r?\n/).filter((l) => l.startsWith('pg_restore: error')).join('\n'));
    fail(`restore produced ${restoreErrors} error(s)`);
  }
  console.log('db:verify — restore clean (0 errors)');
  ledgerMax = psqlQuery(
    "select coalesce(max(version), '00000000000000') from supabase_migrations.schema_migrations",
  );
  console.log(`db:verify — dump migration ledger head: ${ledgerMax}`);
} else {
  // Fresh mode has no dump to supply the platform schemas GoTrue/Storage own
  // on hosted Supabase, so a minimal scaffold provides exactly the objects the
  // repository migrations reference.
  const platform = psql(['-v', 'ON_ERROR_STOP=1', '-f', PLATFORM_SQL]);
  if (platform.status !== 0) fail(`platform bootstrap failed\n${platform.stderr}`);
  psql(['-c', 'create schema if not exists supabase_migrations']);
  psql([
    '-c',
    'create table if not exists supabase_migrations.schema_migrations (version text primary key)',
  ]);
}

const applied = new Set(
  psqlQuery('select version from supabase_migrations.schema_migrations')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
);

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const results = { pass: 0, reconcile: 0, skipped: 0 };
for (const name of migrations) {
  const version = name.slice(0, 14);
  if (applied.has(version)) {
    results.skipped += 1;
    continue;
  }
  const file = join(MIGRATIONS_DIR, name);

  if (version <= ledgerMax) {
    // The dump already contains these objects even though its ledger never
    // recorded them. Replay leniently and report the divergence rather than
    // pretending the file was verified.
    const lenient = psql(['-v', 'ON_ERROR_STOP=0', '-f', file]);
    const hardErrors = (lenient.stderr.match(/^psql:.*ERROR:.*$/gm) || []).filter(
      (line) => !/already exists/i.test(line),
    );
    if (hardErrors.length > 0) {
      console.error(hardErrors.slice(0, 5).join('\n'));
      fail(`ledger reconciliation failed at ${name}`);
    }
    console.log(`  RECONCILE ${name} (objects predate the ledger entry)`);
    results.reconcile += 1;
  } else {
    let applyResult = psql(['-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', file]);
    if (applyResult.status !== 0 && /cannot run inside a transaction block/.test(applyResult.stderr)) {
      applyResult = psql(['-v', 'ON_ERROR_STOP=1', '-f', file]);
    }
    if (applyResult.status !== 0) {
      const lines = applyResult.stderr
        .split(/\r?\n/)
        .filter((line) => /ERROR|DETAIL|HINT|CONTEXT/.test(line))
        .slice(0, 10);
      console.error(lines.join('\n'));
      fail(`migration failed: ${name}`);
    }
    results.pass += 1;
  }

  const record = psql([
    '-c',
    `insert into supabase_migrations.schema_migrations(version) values ('${version}') on conflict do nothing`,
  ]);
  if (record.status !== 0) fail(`could not record ${version}\n${record.stderr}`);
}

console.log(
  `db:verify — migrations: ${results.pass} applied, ${results.reconcile} reconciled, ` +
    `${results.skipped} already in the ledger`,
);

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const failures = [];
for (const name of fixtures) {
  const file = join(FIXTURES_DIR, name);
  const result = psql(['-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', file]);
  if (result.status === 0) {
    console.log(`  PASS ${name}`);
  } else {
    const firstError =
      (result.stderr.split(/\r?\n/).find((line) => /ERROR/.test(line)) || '').trim() ||
      'unknown failure';
    console.log(`  FAIL ${name}`);
    console.log(`       ${firstError}`);
    failures.push({ name, firstError });
  }
}

const summary = {
  mode,
  migrations: results,
  fixtures: { total: fixtures.length, failed: failures.length },
  failures,
};
writeFileSync(join(workDir, 'summary.json'), JSON.stringify(summary, null, 2));

if (failures.length > 0) {
  fail(`${failures.length} of ${fixtures.length} fixture(s) failed`);
}

console.log(`\u2713 db:verify — ${fixtures.length} fixture(s) passed against a ${mode} database`);
