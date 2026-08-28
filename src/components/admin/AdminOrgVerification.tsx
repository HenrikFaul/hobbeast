import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listVerificationRequests,
  reviewVerification,
  type OrgVerificationRequest,
} from '@/features/organizations/organizations';

/**
 * Platform-admin review of organization verification requests (Slice O-E).
 *
 * An organization submits evidence (website, social proof); an admin approves
 * or rejects, which stamps the verified badge that appears on the brand page
 * and everywhere the organization is shown.
 */

export function AdminOrgVerification() {
  const [requests, setRequests] = useState<OrgVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRequests(await listVerificationRequests());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, decision: 'verified' | 'rejected') => {
    setBusy(id);
    const ok = await reviewVerification(id, decision);
    setBusy(null);
    if (!ok) { toast.error('A művelet nem sikerült.'); return; }
    toast.success(decision === 'verified' ? 'Szervezet hitelesítve.' : 'Kérelem elutasítva.');
    setRequests((current) => current.filter((r) => r.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /> Szervezeti verifikáció
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Hitelesítési kérelmek a szervezetektől. A jóváhagyott szervezet a nyilvános
          oldalán és mindenhol megkapja a hitelesített jelvényt.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
          </p>
        ) : requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            Nincs elbírálásra váró kérelem.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a href={`/szervezet/${request.org_slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                      {request.org_name} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    {request.website_url && <p className="text-xs text-muted-foreground">{request.website_url}</p>}
                    {request.social_proof && <p className="text-xs text-muted-foreground">{request.social_proof}</p>}
                    {request.note && <p className="mt-1 text-xs text-muted-foreground/80">{request.note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={busy === request.id} onClick={() => void decide(request.id, 'verified')}>
                      {busy === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      <span className="ml-1">Hitelesít</span>
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === request.id} onClick={() => void decide(request.id, 'rejected')}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminOrgVerification;
