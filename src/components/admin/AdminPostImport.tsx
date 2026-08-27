import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardPaste, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { parseSocialPost } from '@/features/events/socialPostParser';
import { takePostImportHandoff } from '@/features/events/postImportHandoff';

/**
 * A programme entered from a post the operator read.
 *
 * The collector cannot fetch a Facebook page: logged out the platform serves
 * nothing, and fetching it with a member's own account is against its terms
 * and risks that account. The source wizard says so and refuses the URL.
 *
 * What a person can lawfully do is read the post they were shown and pass it
 * on. This reads that text the way the collector reads a page — date, time,
 * venue, price, link — and fills the form, which a human then checks. Nothing
 * is published without that check.
 */

const rpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const ERROR_TEXT: Record<string, string> = {
  CAPABILITY_REQUIRED: 'Ehhez a providers.manage jogosultság kell.',
  INVALID_TITLE: 'A cím túl rövid.',
  DATE_REQUIRED: 'A dátum kötelező.',
  DATE_IN_PAST: 'A dátum már elmúlt — a katalógus csak jövőbeli programot mutat.',
  HTTPS_URL_REQUIRED: 'https:// kezdetű hivatkozás kell, e nélkül a program nem jelenne meg.',
};

const EMPTY = {
  title: '', eventDate: '', eventTime: '', url: '', city: '', address: '',
  venue: '', category: '', organizer: '', description: '', isFree: null as boolean | null,
};

export function AdminPostImport() {
  const [raw, setRaw] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [parsed, setParsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);

  const draft = useMemo(() => (raw.trim() ? parseSocialPost(raw) : null), [raw]);

  const applyDraft = (fallbackUrl?: string) => {
    if (!draft) return;
    setForm({
      title: draft.title || '',
      eventDate: draft.eventDate || '',
      eventTime: draft.eventTime || '',
      // A post rarely links to itself; the page it came from is the honest
      // fallback so the catalogue entry has somewhere to point.
      url: draft.url || fallbackUrl || '',
      city: draft.city || '',
      address: draft.address || '',
      venue: draft.venue || '',
      category: '',
      organizer: '',
      description: draft.description,
      isFree: draft.isFree,
    });
    setParsed(true);
    setError(null);
  };

  /**
   * A hand-off from the extension fills the box and reads it straight away, so
   * the operator lands on a filled form rather than on a panel holding an
   * unexplained blob of text. The fragment is cleared once taken: a reload
   * must not silently re-import something already filed.
   */
  const handoffTaken = useRef(false);
  useEffect(() => {
    if (handoffTaken.current) return;
    const handoff = takePostImportHandoff();
    if (!handoff) return;
    handoffTaken.current = true;
    setRaw(handoff.text);
    setHandoffUrl(handoff.url || null);
  }, []);

  // `draft` only exists on the render after `raw` is set, so the parse is
  // applied here rather than in the effect above.
  const handoffApplied = useRef(false);
  useEffect(() => {
    if (!handoffTaken.current || handoffApplied.current || !draft) return;
    handoffApplied.current = true;
    applyDraft(handoffUrl || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, handoffUrl]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await rpc.rpc('admin_create_external_event', {
        p_title: form.title.trim(),
        p_event_date: form.eventDate || null,
        p_event_time: form.eventTime || null,
        p_external_url: form.url.trim(),
        p_city: form.city.trim() || null,
        p_address: form.address.trim() || null,
        p_venue: form.venue.trim() || null,
        p_category: form.category.trim() || null,
        p_description: form.description.trim() || null,
        p_is_free: form.isFree,
        p_organizer_name: form.organizer.trim() || null,
        p_source_note: 'Közösségi bejegyzésből, kézzel ellenőrizve',
      });
      if (rpcError) {
        const code = Object.keys(ERROR_TEXT).find((key) => rpcError.message.includes(key));
        setError(code ? ERROR_TEXT[code] : 'A mentés nem sikerült.');
        return;
      }
      toast.success('A program bekerült a katalógusba.');
      setRaw('');
      setForm(EMPTY);
      setParsed(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" aria-hidden="true" /> Program bejegyzésből
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Másold be a bejegyzés szövegét — kiolvassuk belőle a dátumot, az időpontot, a
            helyszínt és a linket. Közösségi oldalról gyűjteni nem tudunk (bejelentkezés nélkül
            nem adja ki, fiókkal lekérni pedig a szabályzatába ütközik), de amit elolvastál,
            azt továbbadhatod.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={raw}
            onChange={(event) => { setRaw(event.target.value); setParsed(false); }}
            rows={10}
            placeholder="Ide másold be a bejegyzés teljes szövegét…"
            aria-label="A bejegyzés szövege"
            className="font-mono text-sm"
          />

          {draft && !parsed && (
            <div className="rounded-xl border border-primary/20 bg-secondary/40 p-4">
              <p className="mb-2 text-sm font-semibold">Ezt olvastam ki:</p>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">Cím: </dt><dd className="inline font-medium">{draft.title || '—'}</dd></div>
                <div><dt className="inline text-muted-foreground">Dátum: </dt><dd className="inline font-medium">
                  {draft.eventDate || '—'}{draft.endDate ? ` – ${draft.endDate}` : ''}
                </dd></div>
                <div><dt className="inline text-muted-foreground">Időpont: </dt><dd className="inline font-medium">
                  {draft.eventTime || '—'}{draft.endTime ? `–${draft.endTime}` : ''}
                </dd></div>
                <div><dt className="inline text-muted-foreground">Helyszín: </dt><dd className="inline font-medium">{draft.venue || draft.address || draft.city || '—'}</dd></div>
                <div><dt className="inline text-muted-foreground">Belépő: </dt><dd className="inline font-medium">
                  {draft.isFree === true ? 'ingyenes' : draft.priceText || (draft.isFree === false ? 'fizetős' : '—')}
                </dd></div>
                <div><dt className="inline text-muted-foreground">Link: </dt><dd className="inline font-medium break-all">{draft.url || '—'}</dd></div>
              </dl>

              {draft.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {draft.warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-2 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {warning}
                    </li>
                  ))}
                </ul>
              )}

              <Button size="sm" className="mt-3" onClick={() => applyDraft()}>
                <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Átveszem az űrlapra
              </Button>
            </div>
          )}

          {parsed && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[11px]">Kézzel ellenőrzött</Badge>
                <p className="text-xs text-muted-foreground">
                  Nézd át, mielőtt mented. A hivatkozásnak https:// kezdetűnek kell lennie.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="post-title">Cím *</Label>
                  <Input id="post-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-date">Dátum *</Label>
                  <Input id="post-date" type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-time">Kezdés</Label>
                  <Input id="post-time" type="time" value={form.eventTime} onChange={(e) => setForm({ ...form, eventTime: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="post-url">Hivatkozás *</Label>
                  <Input id="post-url" value={form.url} placeholder="https://…" onChange={(e) => setForm({ ...form, url: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-city">Város</Label>
                  <Input id="post-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-venue">Helyszín neve</Label>
                  <Input id="post-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="post-address">Cím</Label>
                  <Input id="post-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-category">Kategória</Label>
                  <Input id="post-category" value={form.category} placeholder="pl. Társasjáték" onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-organizer">Szervező</Label>
                  <Input id="post-organizer" value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} />
                </div>
              </div>

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> Mentés…</> : 'Mentés a katalógusba'}
                </Button>
                <Button variant="ghost" onClick={() => { setParsed(false); setError(null); }} disabled={saving}>
                  Vissza a szöveghez
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
