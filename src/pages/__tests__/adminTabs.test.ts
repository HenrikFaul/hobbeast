import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Admin page keeps two lists that must stay in sync: the rendered
// <TabsTrigger value="..."> set and the `allowedTabs` allowlist used to resolve
// ?tab=... from the URL. A tab missing from the allowlist silently falls back to
// 'catalog' — that is exactly how the Programgyűjtő tab broke in v1.20.0.
const source = readFileSync(resolve(__dirname, '../Admin.tsx'), 'utf8');

function triggerValues() {
  return [...source.matchAll(/<TabsTrigger\s+value="([a-z-]+)"/g)].map((m) => m[1]);
}

function contentValues() {
  return [...source.matchAll(/<TabsContent\s+value="([a-z-]+)"/g)].map((m) => m[1]);
}

function allowedTabs() {
  const block = source.match(/const allowedTabs = \[([^\]]*)\]/);
  if (!block) throw new Error('allowedTabs allowlist not found in Admin.tsx');
  return [...block[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

describe('Admin tab routing contract', () => {
  it('exposes every rendered tab through the ?tab= allowlist', () => {
    const missing = triggerValues().filter((value) => !allowedTabs().includes(value));
    expect(missing, `tabs rendered but not allowlisted (they would fall back to catalog): ${missing.join(', ')}`).toEqual([]);
  });

  it('renders panel content for every allowlisted tab', () => {
    const orphaned = allowedTabs().filter((value) => !contentValues().includes(value));
    expect(orphaned, `allowlisted tabs without a TabsContent panel: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('keeps the Programgyűjtő tab reachable', () => {
    expect(triggerValues()).toContain('scraper');
    expect(allowedTabs()).toContain('scraper');
    expect(contentValues()).toContain('scraper');
  });
});
