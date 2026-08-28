import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { listCrawlPages, runSeeds, type CrawlPage, type CrawlRun } from '@/features/admin/crawlControl';

/**
 * The page-by-page record of one crawl run.
 *
 * The aggregate line ("32 pages, 2 unchanged, 0 candidates, 14 dup") answers
 * "how much" but never "what" or "from where". This answers both: the seeds the
 * run set off from — so a barren run's direction is visible and the next one can
 * start elsewhere — and every page it looked at, with why each did or did not
 * become a lead.
 */

const OUTCOME_LABEL: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  fetched: { label: 'letöltve', tone: 'secondary' },
  not_modified: { label: 'változatlan', tone: 'outline' },
  near_duplicate: { label: 'duplikátum', tone: 'outline' },
  candidate: { label: 'jelölt', tone: 'default' },
  auto_promoted: { label: 'felvéve', tone: 'default' },
  robots_disallow: { label: 'robots-tiltás', tone: 'outline' },
  error: { label: 'hiba', tone: 'destructive' },
  skipped: { label: 'kihagyva', tone: 'outline' },
};

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function CrawlRunDetail({ run }: { run: CrawlRun }) {
  const [pages, setPages] = useState<CrawlPage[]>([]);
  const [loading, setLoading] = useState(true);
  const seeds = runSeeds(run);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listCrawlPages(run.id).then((rows) => {
      if (!cancelled) { setPages(rows); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [run.id]);

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          Indulási irányok ({seeds.length})
        </p>
        {seeds.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">A seedek nincsenek elmentve ehhez a futáshoz.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {seeds.map((seed) => (
              <li key={seed}>
                <span className="inline-block rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                  {host(seed)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          Megnézett oldalak {loading ? '' : `(${pages.length})`}
        </p>
        {loading ? (
          <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Betöltés…
          </p>
        ) : pages.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">Nincs rögzített oldal.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border border-border/40">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Kimenetel</th>
                  <th className="px-2 py-1 font-medium">Oldal</th>
                  <th className="px-2 py-1 text-right font-medium">Mély.</th>
                  <th className="px-2 py-1 text-right font-medium">Szó</th>
                  <th className="px-2 py-1 text-right font-medium">Pont</th>
                  <th className="px-2 py-1 font-medium">Innen</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page, index) => {
                  const meta = OUTCOME_LABEL[page.outcome] ?? { label: page.outcome, tone: 'outline' as const };
                  return (
                    <tr key={`${page.url}-${index}`} className="border-t border-border/30 align-top">
                      <td className="px-2 py-1">
                        <Badge variant={meta.tone} className="rounded-full text-[10px]">{meta.label}</Badge>
                      </td>
                      <td className="px-2 py-1">
                        <span className="block max-w-[22rem] truncate font-medium" title={page.url}>{host(page.url)}</span>
                        {page.title && <span className="block max-w-[22rem] truncate text-muted-foreground/80" title={page.title}>{page.title}</span>}
                        {page.error_text && <span className="block text-destructive/80">{page.error_text}</span>}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{page.depth}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{page.word_count ?? '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{page.score ?? '—'}</td>
                      <td className="px-2 py-1">
                        <span className="block max-w-[14rem] truncate text-muted-foreground/70" title={page.discovered_from_url ?? ''}>
                          {page.discovered_from_url ? host(page.discovered_from_url) : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
