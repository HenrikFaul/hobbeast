import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const configPath = path.resolve(repoRoot, process.argv[2] || 'scripts/performance-budgets.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const assetRoot = path.resolve(repoRoot, config.distDirectory);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const files = await listFiles(assetRoot);
const measured = await Promise.all(files.map(async (absolute) => {
  const contents = await readFile(absolute);
  const metadata = await stat(absolute);
  return {
    name: path.relative(assetRoot, absolute).replaceAll('\\', '/'),
    rawBytes: metadata.size,
    gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
  };
}));

const results = [];
for (const budget of config.budgets) {
  const pattern = new RegExp(budget.pattern, 'i');
  const matches = measured.filter((file) => pattern.test(file.name));
  if (!matches.length) {
    results.push({ id: budget.id, status: budget.required ? 'FAIL' : 'NOT_FOUND', matches: [] });
    continue;
  }

  if (budget.perFile) {
    const failures = matches.filter((file) => file.rawBytes > budget.maxRawBytes || file.gzipBytes > budget.maxGzipBytes);
    results.push({ id: budget.id, status: failures.length ? 'FAIL' : 'PASS', matches, failures });
    continue;
  }

  const totals = matches.reduce((sum, file) => ({
    rawBytes: sum.rawBytes + file.rawBytes,
    gzipBytes: sum.gzipBytes + file.gzipBytes,
  }), { rawBytes: 0, gzipBytes: 0 });
  results.push({
    id: budget.id,
    status: totals.rawBytes <= budget.maxRawBytes && totals.gzipBytes <= budget.maxGzipBytes ? 'PASS' : 'FAIL',
    totals,
    limits: { rawBytes: budget.maxRawBytes, gzipBytes: budget.maxGzipBytes },
    matches,
  });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: path.relative(repoRoot, configPath).replaceAll('\\', '/'),
  distDirectory: path.relative(repoRoot, assetRoot).replaceAll('\\', '/'),
  status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
  results,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
