import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  deleteEmailSource,
  getEmailConfig,
  listEmailSources,
  listInboundEmails,
  saveEmailSource,
  updateEmailConfig,
  webhookUrl,
  type EmailIngestConfig,
  type EmailSource,
  type InboundEmail,
} from '@/features/admin/emailIngest';

/**
 * Reading programmes out of newsletter emails.
 *
 * Some sources publish only in an email newsletter. The operator points a
 * technical inbox's forwarding webhook at the address shown here, tells us which
 * sender maps to which publisher, and the worker reads the events out of each
 * arriving mail — the same engine it runs on a web page.
 *
 * Three parts, top to bottom: where mail arrives (the inbox + webhook), which
 * senders we read (the source list), and what has come in (the log).
 */

const EMPTY_DRAFT = {
  matchType: 'address' as 'address' | 'domain',
  matchValue: '',
  publisherName: '',
  countryCode: 'HU',
  categories: '',
  strategy: 'auto' as 'auto' | 'jsonld' | 'prose',
};

function statusTone(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'parsed') return 'default';
  if (status === 'error') return 'destructive';
  if (status === 'no_source') return 'outline';
  return 'secondary';
}

const STATUS_LABEL: Record<string, string> = {
  received: 'beérkezett', matched: 'feldolgozásra vár', parsed: 'feldolgozva',
  no_source: 'nincs forrás', error: 'hiba',
};

export function AdminEmailSources() {
  const [config, setConfig] = useState<EmailIngestConfig | null>(null);
  const [sources, setSources] = useState<EmailSource[]>([]);
  const [inbound, setInbound] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inbox, setInbox] = useState('');
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setLoading(true);
    const [cfg, srcs, mails] = await Promise.all([getEmailConfig(), listEmailSources(), listInboundEmails(40)]);
    if (cfg) { setConfig(cfg); setInbox(cfg.inbox_address ?? ''); }
    setSources(srcs);
    setInbound(mails);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copyWebhook = async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(webhookUrl(config.webhook_secret));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('A másolás nem sikerült.');
    }
  };

  const saveConfig = async (patch: { inbox?: string; enabled?: boolean; rotateSecret?: boolean }) => {
    setBusy(true);
    const result = await updateEmailConfig(patch);
    setBusy(false);
    if (result.ok === false) { toast.error(result.message); return; }
    setConfig(result.config);
    setInbox(result.config.inbox_address ?? '');
    toast.success(patch.rotateSecret ? 'Új titkos kulcs — frissítsd a webhookot!' : 'Mentve.');
  };

  const addSource = async () => {
    setBusy(true);
    const result = await saveEmailSource({
      matchType: draft.matchType,
      matchValue: draft.matchValue,
      publisherName: draft.publisherName,
      countryCode: draft.countryCode,
      categories: draft.categories.split(',').map((c) => c.trim()).filter(Boolean),
      strategy: draft.strategy,
      enabled: true,
    });
    setBusy(false);
    if (result.ok === false) { toast.error(result.message); return; }
    setDraft(EMPTY_DRAFT);
    toast.success('Email-forrás hozzáadva.');
    await load();
  };

  const removeSource = async (id: string) => {
    if (!await deleteEmailSource(id)) { toast.error('A törlés nem sikerült.'); return; }
    setSources((current) => current.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
      </CardContent></Card>
    );
  }
  if (!config) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        Az email-begyűjtés nem érhető el. Ehhez providers.manage jogosultság kell.
      </CardContent></Card>
    );
  }

  const draftValid = draft.matchValue.trim().length >= 3 && draft.publisherName.trim().length >= 2;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-5 w-5 text-primary" aria-hidden="true" /> Email-begyűjtés (hírlevelek)
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Egyes források csak hírlevélben küldik a programokat. Iratkozz fel egy technikai
          címmel, állítsd be, hogy a beérkező leveleket ide továbbítsa, és a rendszer
          kiolvassa belőlük az eseményeket — ugyanazzal a motorral, mint a weboldalakból.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Where mail arrives */}
        <div className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <Label htmlFor="inbox">Technikai postafiók címe</Label>
              <Input id="inbox" value={inbox} onChange={(e) => setInbox(e.target.value)} placeholder="programok@expericentre.com" className="mt-1" />
            </div>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void saveConfig({ inbox })}>Mentés</Button>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={config.enabled} onCheckedChange={(v) => void saveConfig({ enabled: v })} /> Aktív
            </label>
          </div>
          <div>
            <Label>Webhook URL (ezt add meg a levélszolgáltatónál)</Label>
            <div className="mt-1 flex gap-2">
              <Input readOnly value={webhookUrl(config.webhook_secret)} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" onClick={() => void copyWebhook()} aria-label="Webhook URL másolása">
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void saveConfig({ rotateSecret: true })} title="Új titkos kulcs">
                <RefreshCw className="mr-1 h-4 w-4" /> Kulcs csere
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              A titkos kulcs védi a webhookot — csak ezzel a címmel lehet levelet beküldeni. Ha kicseréled, frissítsd a szolgáltatónál is.
            </p>
          </div>
        </div>

        {/* Which senders we read */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">Feladók → kiadók</h3>
          {sources.length === 0 ? (
            <p className="mb-3 rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
              Még nincs email-forrás. Add meg, melyik feladó melyik kiadót jelenti.
            </p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {sources.map((source) => (
                <li key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{source.publisher_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{source.match_value}</span>
                    {source.country_code && <Badge variant="outline" className="ml-2 rounded-full text-[10px]">{source.country_code}</Badge>}
                    {source.events_total > 0 && <span className="ml-2 text-xs text-primary">{source.events_total} esemény</span>}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void removeSource(source.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{source.publisher_name} törlése</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 rounded-xl border border-border/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={draft.matchType}
              onChange={(e) => setDraft({ ...draft, matchType: e.target.value as 'address' | 'domain' })}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Illesztés típusa"
            >
              <option value="address">Pontos cím</option>
              <option value="domain">Teljes domain</option>
            </select>
            <Input value={draft.matchValue} onChange={(e) => setDraft({ ...draft, matchValue: e.target.value })} placeholder={draft.matchType === 'address' ? 'hirlevel@forras.hu' : 'forras.hu'} />
            <Input value={draft.publisherName} onChange={(e) => setDraft({ ...draft, publisherName: e.target.value })} placeholder="Kiadó neve" />
            <Input value={draft.countryCode} onChange={(e) => setDraft({ ...draft, countryCode: e.target.value })} placeholder="HU" />
            <Input value={draft.categories} onChange={(e) => setDraft({ ...draft, categories: e.target.value })} placeholder="Kategóriák (vesszővel)" className="sm:col-span-2" />
            <select
              value={draft.strategy}
              onChange={(e) => setDraft({ ...draft, strategy: e.target.value as 'auto' | 'jsonld' | 'prose' })}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Olvasási mód"
            >
              <option value="auto">Automatikus</option>
              <option value="jsonld">Csak strukturált (JSON-LD)</option>
              <option value="prose">Csak szöveg</option>
            </select>
            <Button disabled={!draftValid || busy} onClick={() => void addSource()}>
              <Plus className="mr-1 h-4 w-4" /> Hozzáadás
            </Button>
          </div>
        </div>

        {/* What has come in */}
        <div>
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            Beérkezett levelek
            <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4" /> Frissítés</Button>
          </h3>
          {inbound.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
              Még nem érkezett levél. Amint a technikai címre befut egy hírlevél, itt megjelenik.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {inbound.map((mail) => (
                <li key={mail.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge variant={statusTone(mail.status)} className="rounded-full">{STATUS_LABEL[mail.status] ?? mail.status}</Badge>
                    <span className="truncate font-medium" title={mail.subject ?? ''}>{mail.subject || '(tárgy nélkül)'}</span>
                    <span className="text-muted-foreground/70">{mail.from_address}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {mail.events_found != null && `${mail.events_found} esemény · `}
                    {new Date(mail.received_at).toLocaleString('hu-HU')}
                    {mail.error_text && <span className="ml-2 text-destructive/80">{mail.error_text.slice(0, 40)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminEmailSources;
