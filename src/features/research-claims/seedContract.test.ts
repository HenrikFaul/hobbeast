import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

interface AcceptedLiteratureRow {
  sourceRow: number;
  sequence: number;
  statement: string;
  publication: string;
  authors: string;
  year: number;
  locale: string;
  sourceUrl: string | null;
  doi: string | null;
}

const quoteSql = (value: string | null): string => (
  value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`
);

describe('reviewed literature seed contract', () => {
  it('keeps every published seed tuple byte-for-byte aligned with the reviewed source manifest', () => {
    const manifest = JSON.parse(readFileSync(
      resolve(process.cwd(), '.tmp/research-quotes-20260825/processed-literature.json'),
      'utf8',
    )) as { acceptedRows: AcceptedLiteratureRow[] };
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260825121000_seed_reviewed_community_research_claims.sql'),
      'utf8',
    );

    expect(manifest.acceptedRows).toHaveLength(30);
    expect(new Set(manifest.acceptedRows.map((row) => row.sequence)).size).toBe(30);

    for (const row of manifest.acceptedRows) {
      expect(row.locale).toBe('hu-HU');
      expect(migration).toContain(
        `('literature-source-${row.sequence}', ${row.sequence}, 'hu-HU', ${row.year}, ${quoteSql(row.sourceUrl)}, ${quoteSql(row.doi)},`,
      );
      const statementHash = createHash('sha256').update(row.statement, 'utf8').digest('hex');
      expect(migration).toContain(`'${statementHash}'`);
      expect(migration).toContain(
        `('literature-source-${row.sequence}', 'hu-HU', ${quoteSql(row.statement)}, ${quoteSql(row.publication)}, NULL::text, ${quoteSql(row.authors)})`,
      );
      expect(migration).toContain(`"source_row":${row.sourceRow}`);
    }
  });
});
