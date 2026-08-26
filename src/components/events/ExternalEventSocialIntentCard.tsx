import { useCallback, useEffect, useState } from 'react';
import { Users, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getExternalEventSocialSummary,
  setExternalEventSocialIntent,
  type ExternalEventSocialSummary,
} from '@/lib/eventOperations';
import { trackProductEvent } from '@/lib/productAnalyticsClient';

interface ExternalEventSocialIntentCardProps {
  externalEventId: string;
  authenticated: boolean;
  onRequestSignIn: () => void;
}

export function ExternalEventSocialIntentCard({
  externalEventId,
  authenticated,
  onRequestSignIn,
}: ExternalEventSocialIntentCardProps) {
  const [summary, setSummary] = useState<ExternalEventSocialSummary | null>(null);
  const [loading, setLoading] = useState(authenticated);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await getExternalEventSocialSummary(externalEventId));
    } catch {
      setError('A társasági érdeklődés állapota most nem tölthető be.');
    } finally {
      setLoading(false);
    }
  }, [authenticated, externalEventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setIntent = async (intent: 'interested' | 'looking_for_company') => {
    if (!authenticated) {
      onRequestSignIn();
      return;
    }
    if (!summary?.featureEnabled || saving) return;
    const active = !(summary.myIntent === intent && summary.myStatus === 'active');
    setSaving(true);
    setError(null);
    try {
      await setExternalEventSocialIntent({ externalEventId, intent, active });
      void trackProductEvent('external_social_intent', {
        event_id: externalEventId,
        variant: intent,
        status: active ? 'set' : 'cleared',
        surface: 'external_event_detail',
      });
      await refresh();
    } catch (intentError) {
      const code = intentError instanceof Error ? intentError.message : '';
      setError(code === 'EXTERNAL_EVENT_NOT_AVAILABLE'
        ? 'Ez a külső program már nem elérhető vagy nem elég friss.'
        : code === 'FEATURE_DISABLED'
          ? 'A társasági funkció rolloutja jelenleg szünetel.'
          : 'A beállítást nem sikerült elmenteni. Próbáld újra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6 rounded-xl" aria-labelledby="external-social-title">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            {/* Deliberately not "menjünk együtt": that is the companion plan
                above. This is the lighter signal for people who do not want to
                organise anything, only to be counted. */}
            <h2 id="external-social-title" className="font-semibold">Csak jeleznéd, hogy érdekel?</h2>
            <p className="text-sm text-muted-foreground">
              Szervezés nélkül is jelezheted az érdeklődésed. Ez továbbra is külső program:
              a Hobbeast nem válik szervezővé, csak névtelen, összesített érdeklődést gyűjt.
            </p>
          </div>
        </div>

        {!authenticated ? (
          <Button variant="outline" onClick={onRequestSignIn}>Bejelentkezem és jelzem az érdeklődést</Button>
        ) : loading ? (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Társasági állapot betöltése…</p>
        ) : summary && !summary.featureEnabled ? (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            A társasági funkció fokozatos rollout alatt áll; a külső forráslink továbbra is használható.
          </p>
        ) : summary ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={summary.myIntent === 'interested' && summary.myStatus === 'active' ? 'default' : 'outline'}
                disabled={saving}
                onClick={() => void setIntent('interested')}
              >
                {summary.myIntent === 'interested' && summary.myStatus === 'active' ? 'Érdeklődés visszavonása' : 'Érdekel'}
              </Button>
              <Button
                type="button"
                variant={summary.myIntent === 'looking_for_company' && summary.myStatus === 'active' ? 'default' : 'outline'}
                disabled={saving}
                onClick={() => void setIntent('looking_for_company')}
              >
                {summary.myIntent === 'looking_for_company' && summary.myStatus === 'active' ? 'Társaságkeresés visszavonása' : 'Társaságot keresek'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summary.thresholdMet
                ? `${summary.companyInterestCount} valódi tag keres társaságot ehhez a programhoz.`
                : 'A létszám csak legalább 3 valódi érdeklődőnél jelenik meg.'}
            </p>
          </>
        ) : null}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Más tag neve vagy profilja nem látható; az intent csak sajátként és aggregáltan olvasható.
        </p>
      </CardContent>
    </Card>
  );
}
