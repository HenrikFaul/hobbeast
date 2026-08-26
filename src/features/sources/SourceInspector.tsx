import { useState } from 'react';
import { Loader2, Search, Sparkles, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * "Paste a link, get programs."
 *
 * The engine inspects the page, runs every extraction recipe that could fit and
 * reports how many dated programs each one actually produced — with samples, so
 * nobody has to take the machine's word for it. Admins save straight into the
 * collector; everyone else submits the source for review.
 */

export interface RecipeSample {
  title: string;
  date: string;
  time: string | null;
  url: string | null;
  location: string | null;
}

export interface RecipeCandidate {
  strategy: string;
  label: string;
  hint: string;
  needsBrowser: boolean;
  unsupported?: boolean;
  endpointUrl: string;
  eventCount: number;
  samples: RecipeSample[];
  evidence: string;
  confidence: number;
}

export interface InspectResult {
  url: string | null;
  homepageUrl: string | null;
  publisherName: string | null;
  candidates: RecipeCandidate[];
  warnings: string[];
}

// These map 1:1 onto the collector's category resolver, so what is picked here
// is the category the programs will carry.
const CATEGORY_OPTIONS = [
  'Zene', 'Természet & Túra', 'Társasjáték', 'Színház & Előadás', 'Gasztro',
  'Sport & Mozgás', 'Kultúra', 'Családi', 'Tánc', 'Program',
];

function formatDate(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

export function SourceInspector({ mode, onSaved }: { mode: 'admin' | 'provider'; onSaved?: () => void }) {
  const [url, setUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [publisherName, setPublisherName] = useState('');
  const [city, setCity] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const chosen = result?.candidates.find((c) => c.strategy === strategy) ?? null;
  const usable = Boolean(chosen && !chosen.unsupported);

  const inspect = async () => {
    if (!url.trim()) return;
    setInspecting(true);
    setResult(null);
    setStrategy(null);
    const { data, error } = await supabase.functions.invoke('source-manager', {
      body: { action: 'inspect', url: url.trim() },
    });
    setInspecting(false);
    if (error || !data) {
      toast.error('Az oldal elemzése nem sikerült.');
      return;
    }
    const payload = data as InspectResult;
    setResult(payload);
    const best = payload.candidates.find((c) => !c.unsupported) ?? payload.candidates[0] ?? null;
    setStrategy(best?.strategy ?? null);
    if (payload.publisherName && !publisherName) setPublisherName(payload.publisherName);
    if (!payload.candidates.length) toast.error('Ezen a címen nem találtunk programokat.');
  };

  const save = async () => {
    if (!chosen || !publisherName.trim()) return;
    setSaving(true);
    const body = {
      action: mode === 'admin' ? 'save' : 'submit',
      endpoint_url: chosen.endpointUrl,
      homepage_url: result?.homepageUrl ?? null,
      publisher_name: publisherName.trim(),
      strategy: chosen.strategy,
      city: city.trim() || null,
      categories,
      note: note.trim() || null,
      detected_events: chosen.eventCount,
      inspection: {
        strategy: chosen.strategy,
        event_count: chosen.eventCount,
        evidence: chosen.evidence,
        samples: chosen.samples.slice(0, 3),
      },
    };
    const { data, error } = await supabase.functions.invoke('source-manager', { body });
    setSaving(false);
    if (error || !data) {
      toast.error(mode === 'admin' ? 'A forrás mentése nem sikerült.' : 'A beküldés nem sikerült.');
      return;
    }

    if (mode === 'admin') {
      const sourceId = (data as { source_id?: string }).source_id;
      toast.success('A forrás bekerült a gyűjtésbe. Próbafuttatás indul…');
      if (sourceId) {
        const verify = await supabase.functions.invoke('source-manager', {
          body: { action: 'verify', source_id: sourceId },
        });
        if (verify.error) toast.error('A próbafuttatást nem sikerült elindítani.');
        else toast.success('Próbafuttatás elindítva — az eredmény néhány percen belül megjelenik a listában.');
      }
    } else {
      toast.success('Köszönjük! A forrást jóváhagyásra beküldtük.');
    }

    setUrl('');
    setResult(null);
    setStrategy(null);
    setPublisherName('');
    setCity('');
    setCategories([]);
    setNote('');
    onSaved?.();
  };

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Új programforrás
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Illeszd be a szervező program- vagy naptároldalának címét. Megnézzük az oldalt, kiválasztjuk a hozzá illő
          kiolvasási módot, és megmutatjuk, milyen programokat talált.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void inspect(); }}
            placeholder="https://pelda.hu/esemenyek"
            inputMode="url"
            aria-label="A forrás webcíme"
          />
          <Button onClick={() => void inspect()} disabled={inspecting || !url.trim()} className="sm:w-40">
            {inspecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
            Elemzés
          </Button>
        </div>

        {inspecting && (
          <p className="text-xs text-muted-foreground">
            Megnyitjuk az oldalt, és sorra kipróbáljuk a lehetséges kiolvasási módokat. Ez 5–30 másodperc.
          </p>
        )}

        {result?.warnings.map((warning) => (
          <Alert key={warning} variant="default" className="border-amber-500/40">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription className="text-xs">{warning}</AlertDescription>
          </Alert>
        ))}

        {result && result.candidates.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Kiolvasási mód</Label>
            {result.candidates.map((candidate) => {
              const active = candidate.strategy === strategy;
              return (
                <button
                  key={candidate.strategy}
                  type="button"
                  onClick={() => setStrategy(candidate.strategy)}
                  aria-pressed={active}
                  disabled={candidate.unsupported}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition',
                    active ? 'border-primary bg-primary/5' : 'border-border/70 hover:border-primary/50',
                    candidate.unsupported && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{candidate.label}</span>
                    {candidate.eventCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{candidate.eventCount} program</Badge>
                    )}
                    {candidate.needsBrowser && !candidate.unsupported && (
                      <Badge variant="outline" className="text-[10px]">próbafuttatással ellenőrizhető</Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{candidate.evidence}</span>
                  {candidate.samples.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {candidate.samples.slice(0, 4).map((sample) => (
                        <li key={`${sample.date}-${sample.title}`} className="text-xs">
                          <span className="font-medium text-foreground">{formatDate(sample.date)}</span>
                          {sample.time ? <span className="text-muted-foreground"> {sample.time}</span> : null}
                          <span className="text-muted-foreground"> · {sample.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {usable && (
          <div className="space-y-3 rounded-xl border border-border/70 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="source-publisher" className="text-xs">Szervező neve</Label>
                <Input
                  id="source-publisher"
                  value={publisherName}
                  onChange={(event) => setPublisherName(event.target.value)}
                  placeholder="Pl. Játsz/Ma Társasjáték Kávézó"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="source-city" className="text-xs">Város (opcionális)</Label>
                <Input
                  id="source-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Budapest"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Kategóriák</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((option) => {
                  const active = categories.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategories((prev) => (
                        prev.includes(option) ? prev.filter((c) => c !== option) : [...prev, option].slice(0, 4)
                      ))}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 hover:border-primary/50',
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === 'provider' && (
              <div className="space-y-1">
                <Label htmlFor="source-note" className="text-xs">Megjegyzés a jóváhagyónak (opcionális)</Label>
                <Textarea
                  id="source-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Pl. hetente frissülő klubnaptár"
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Begyűjtési cím: <span className="break-all font-mono">{chosen?.endpointUrl}</span>
            </p>

            <Button onClick={() => void save()} disabled={saving || !publisherName.trim()} className="w-full sm:w-auto">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {mode === 'admin' ? 'Mentés és próbafuttatás' : 'Beküldés jóváhagyásra'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
