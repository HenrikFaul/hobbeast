import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'supabase', 'seeds', 'hungarian_event_feed_sources_v4.json');

function fail(message) {
  console.error(`✗ event-feeds:validate — ${message}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const sources = Array.isArray(registry.sources) ? registry.sources : [];

if (registry.schema_version !== 1) fail('unsupported registry schema version');
if (registry.activation_policy !== 'candidate_only_pending_review_disabled') {
  fail('the source snapshot must remain candidate-only and disabled by default');
}
if (sources.length !== registry.source_count || sources.length !== 185) {
  fail(`expected 185 source candidates, received ${sources.length}`);
}

const ids = new Set();
const endpoints = new Set();
let httpsEndpoints = 0;
let unresolvedEndpoints = 0;

for (const [index, source] of sources.entries()) {
  const row = index + 2;
  const sourceId = String(source.source_id || '').trim();
  const endpoint = String(source.endpoint_url || '').trim();

  if (!/^src_[a-f0-9]{8}$/.test(sourceId)) fail(`invalid source_id at workbook row ${row}`);
  if (ids.has(sourceId)) fail(`duplicate source_id ${sourceId}`);
  if (!endpoint) fail(`missing endpoint_url for ${sourceId}`);
  if (endpoints.has(endpoint.toLocaleLowerCase('hu-HU'))) fail(`duplicate endpoint_url for ${sourceId}`);
  if (/\b(?:token|secret|password|authorization)\b/i.test(JSON.stringify(source))) {
    fail(`credential-like field found for ${sourceId}`);
  }

  ids.add(sourceId);
  endpoints.add(endpoint.toLocaleLowerCase('hu-HU'));

  try {
    const url = new URL(endpoint);
    if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')) {
      httpsEndpoints += 1;
    } else {
      unresolvedEndpoints += 1;
    }
  } catch {
    unresolvedEndpoints += 1;
  }
}

if (httpsEndpoints !== 67 || unresolvedEndpoints !== 118) {
  fail(`workbook drift detected: expected 67 strict HTTPS and 118 unresolved candidates, got ${httpsEndpoints}/${unresolvedEndpoints}`);
}

console.log(`✓ event-feeds:validate — ${sources.length} unique candidates; ${httpsEndpoints} strict HTTPS; ${unresolvedEndpoints} held for URL review`);
