#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = resolve(process.cwd());
const binaryExtensions = new Set(['.zip', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2']);
const patterns = [
  ['aws-access-key', /AKIA[0-9A-Z]{16}/],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{36,255}/],
  ['slack-token', /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ['stripe-live-secret', /sk_live_[0-9A-Za-z]{16,}/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['signed-jwt', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
];

// Scan both tracked and currently untracked, non-ignored repository content.
// Release evidence must not miss a credential merely because it has not been
// staged yet (for example imported requirement packs or generated handoffs).
const repositoryFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\0')
  .filter(Boolean);
const findings = [];

for (const relativePath of repositoryFiles) {
  if (binaryExtensions.has(extname(relativePath).toLowerCase()) || relativePath.endsWith('.lock')) continue;
  let text;
  try {
    text = readFileSync(resolve(root, relativePath), 'utf8');
  } catch {
    continue;
  }
  for (const [category, pattern] of patterns) {
    if (pattern.test(text)) findings.push({ category, relativePath });
  }
}

if (findings.length > 0) {
  console.error(`Secret scan blocked: ${findings.length} credential-like tracked file finding(s). Values are intentionally redacted.`);
  for (const finding of findings) console.error(`- ${finding.category}: ${finding.relativePath}`);
  process.exit(1);
}

console.log(`Secret scan passed: ${repositoryFiles.length} tracked/untracked non-ignored path(s), no credential-value pattern found.`);
