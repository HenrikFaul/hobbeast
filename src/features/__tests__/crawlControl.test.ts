import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The operator's crawl controls. The rules that keep the crawl safe live in the
 * worker and the database; these tests pin the client contract — in particular
 * that the config round-trips through the text fields without losing or
 * inventing values, and that a partial save sends only what changed.
 */

const rpcMock = vi.fn();
const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const {
  getCrawlConfig, updateCrawlConfig, runCrawlNow, linesToArray, arrayToLines,
  runSeeds, listSeedStats,
} = await import('@/features/admin/crawlControl');

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
});

describe('list <-> text round trip', () => {
  it('trims, drops blanks, and keeps order', () => {
    expect(linesToArray('  a \n\n b \n c  ')).toEqual(['a', 'b', 'c']);
    expect(arrayToLines(['a', 'b'])).toBe('a\nb');
    expect(arrayToLines(null)).toBe('');
  });
});

describe('reading the config', () => {
  it('unwraps a single-row result', async () => {
    rpcMock.mockResolvedValue({ data: [{ enabled: true, max_depth: 2 }], error: null });
    const cfg = await getCrawlConfig();
    expect(cfg?.max_depth).toBe(2);
  });

  it('returns null when the operator may not read it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CAPABILITY_REQUIRED' } });
    expect(await getCrawlConfig()).toBeNull();
  });
});

describe('saving the config', () => {
  it('sends every field the RPC expects', async () => {
    rpcMock.mockResolvedValue({ data: { enabled: false }, error: null });
    await updateCrawlConfig({
      max_depth: 3, max_pages_per_run: 100, allowed_countries: ['HU', 'AT'],
      exclude_substrings: ['/kosar'],
    });
    const args = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_max_depth).toBe(3);
    expect(args.p_max_pages_per_run).toBe(100);
    expect(args.p_allowed_countries).toEqual(['HU', 'AT']);
    expect(args.p_exclude_substrings).toEqual(['/kosar']);
    // A field not given is sent as null, so the RPC leaves it untouched.
    expect(args.p_delay_ms).toBeNull();
  });

  it('explains a capability failure and a range failure differently', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CAPABILITY_REQUIRED' } });
    expect(await updateCrawlConfig({ max_depth: 2 })).toEqual({
      ok: false, message: 'Ehhez providers.manage jogosultság kell.',
    });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'violates check constraint "crawl_config_sane"' } });
    expect((await updateCrawlConfig({ max_depth: 99 })) as { message: string }).toMatchObject({
      message: 'Valamelyik érték a megengedett tartományon kívül esik.',
    });
  });
});

describe('running a crawl now', () => {
  it('dispatches through the scraper control plane with the crawl flag', async () => {
    invokeMock.mockResolvedValue({ data: { dispatched: true }, error: null });
    expect(await runCrawlNow(50)).toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith('scraper-control', {
      body: { action: 'run', crawl: true, crawl_pages: 50 },
    });
  });

  it('reports a dispatch failure rather than pretending it started', async () => {
    invokeMock.mockResolvedValue({ data: { dispatched: false }, error: null });
    expect(await runCrawlNow()).toEqual({ ok: false, message: 'A crawl indítása nem sikerült.' });
  });
});

describe('run detail and seed memory', () => {
  it('pulls the seeds a run set off from out of its config snapshot', () => {
    const run = { config_snapshot: { seeds: ['https://a.hu/', 'https://b.hu/', 42] } } as never;
    // Non-string entries are ignored rather than rendered as junk.
    expect(runSeeds(run)).toEqual(['https://a.hu/', 'https://b.hu/']);
  });

  it('treats a run with no stored seeds as an empty direction list', () => {
    expect(runSeeds({ config_snapshot: {} } as never)).toEqual([]);
    expect(runSeeds({ config_snapshot: { seeds: 'nope' } } as never)).toEqual([]);
  });

  it('reads the seed-memory stats, or nothing when it may not', async () => {
    rpcMock.mockResolvedValue({ data: [{ host: 'a38.hu', candidates_total: 3 }], error: null });
    expect((await listSeedStats())[0].host).toBe('a38.hu');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CAPABILITY_REQUIRED' } });
    expect(await listSeedStats()).toEqual([]);
  });
});
