import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createCorrelationId } from '@/lib/observability';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

type ConsentPurpose = 'analytics' | 'marketing';

interface ConsentRow {
  purpose: ConsentPurpose;
  decision: 'granted' | 'denied' | 'withdrawn';
  decided_at: string;
}

const POLICY_VERSION = 'prelaunch-product-consent-v1';

export function PrivacyConsentCard() {
  const [consents, setConsents] = useState<Partial<Record<ConsentPurpose, ConsentRow>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ConsentPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('trust-safety', {
      body: { action: 'my_consents' },
      headers: { 'X-Correlation-ID': createCorrelationId() },
    });
    if (invokeError || !data?.ok) {
      setError('A hozzájárulási előzmények most nem érhetők el.');
    } else {
      const next: Partial<Record<ConsentPurpose, ConsentRow>> = {};
      for (const row of (data.consents || []) as ConsentRow[]) {
        if (row.purpose === 'analytics' || row.purpose === 'marketing') next[row.purpose] = row;
      }
      setConsents(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (purpose: ConsentPurpose, enabled: boolean) => {
    const previous = consents[purpose];
    const optimistic: ConsentRow = {
      purpose,
      decision: enabled ? 'granted' : 'withdrawn',
      decided_at: new Date().toISOString(),
    };
    setConsents((current) => ({ ...current, [purpose]: optimistic }));
    setSaving(purpose);
    const idempotencyKey = createCorrelationId();
    const { data, error: invokeError } = await supabase.functions.invoke('trust-safety', {
      body: {
        action: 'record_consent',
        purpose,
        decision: enabled ? 'granted' : 'withdrawn',
        policyVersion: POLICY_VERSION,
        sourceSurface: 'profile_privacy',
        idempotencyKey,
      },
      headers: {
        'X-Correlation-ID': createCorrelationId(),
        'Idempotency-Key': idempotencyKey,
      },
    });
    setSaving(null);
    if (invokeError || !data?.ok) {
      setConsents((current) => ({ ...current, [purpose]: previous }));
      toast.error('A hozzájárulási döntést nem sikerült menteni.');
      return;
    }
    toast.success(enabled ? 'Hozzájárulás mentve.' : 'Hozzájárulás visszavonva.');
  };

  const enabled = (purpose: ConsentPurpose) => consents[purpose]?.decision === 'granted';

  return (
    <Card className="rounded-2xl shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          Adat- és kommunikációs döntések
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Beállítások betöltése…
          </div>
        ) : (
          <>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-medium">Termékhasználati analitika</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Pszeudonimizált, allowlistelt események. E-mail, telefonszám, pontos cím és szabad szöveg nem küldhető.
                </span>
              </span>
              <Switch
                aria-label="Termékhasználati analitika engedélyezése"
                checked={enabled('analytics')}
                onCheckedChange={(value) => void update('analytics', value)}
                disabled={saving !== null}
              />
            </label>
            <label className="flex items-start justify-between gap-4 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-medium">Marketing kommunikáció</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Opcionális. A tranzakciós és safety értesítések ettől külön kezelendők.
                </span>
              </span>
              <Switch
                aria-label="Marketing kommunikáció engedélyezése"
                checked={enabled('marketing')}
                onCheckedChange={(value) => void update('marketing', value)}
                disabled={saving !== null}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Ezek termékszintű kontrollok, nem helyettesítik a jogilag jóváhagyott adatvédelmi vagy ÁSZF szöveget.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
