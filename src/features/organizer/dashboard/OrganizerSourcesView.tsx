import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { SourceInspector } from '@/features/sources/SourceInspector';

/**
 * Providers register their own program page here. The submission is inspected
 * live — so the provider sees straight away whether we can read their site —
 * and then queued for an admin decision. Nothing goes into the catalogue on a
 * provider's word alone.
 */

interface MySubmission {
  id: string;
  publisher_name: string;
  endpoint_url: string;
  status: string;
  detected_events: number;
  review_note: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  pending: { label: 'Jóváhagyásra vár', variant: 'secondary' },
  approved: { label: 'Jóváhagyva — gyűjtjük', variant: 'default' },
  rejected: { label: 'Elutasítva', variant: 'destructive' },
};

export function OrganizerSourcesTab() {
  const [submissions, setSubmissions] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('my_event_source_submissions');
    setSubmissions((data as unknown as MySubmission[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <TabsContent value="sources" className="mt-4 space-y-4">
      <SourceInspector mode="provider" onSaved={() => void load()} />

      <Card className="rounded-2xl border shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span>Beküldött forrásaim</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Frissítés
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Betöltés…</p>}
          {!loading && submissions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Még nem küldtél be programforrást. Illeszd be fent a program- vagy naptároldalad címét.
            </p>
          )}
          {submissions.map((submission) => {
            const status = STATUS_LABELS[submission.status] ?? { label: submission.status, variant: 'secondary' as const };
            return (
              <div key={submission.id} className="rounded-xl border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{submission.publisher_name}</span>
                  <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                  {submission.detected_events > 0 && (
                    <Badge variant="outline" className="text-[10px]">{submission.detected_events} program</Badge>
                  )}
                </div>
                <p className="mt-1 break-all text-xs text-muted-foreground">{submission.endpoint_url}</p>
                {submission.review_note && (
                  <p className="mt-1 text-xs text-muted-foreground">Visszajelzés: {submission.review_note}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
