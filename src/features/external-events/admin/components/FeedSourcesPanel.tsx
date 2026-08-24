import { Activity, AlertCircle, CheckCircle, Clock, Pause, Play, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  hasEventFeedApprovalEvidence,
  isEventFeedApprovalDraftReady,
  isEventFeedSourceTrustedActive,
  isExactEventFeedHost,
} from '../domain';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';

interface FeedSourcesPanelProps {
  model: ExternalEventsAdminController['feeds'];
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Ellenőrzésre vár',
  approved: 'Jóváhagyott',
  disabled: 'Kikapcsolva',
  paused: 'Szüneteltetve',
  rejected: 'Elutasított',
  healthy: 'Egészséges',
  degraded: 'Akadozik',
  unhealthy: 'Hibás',
  unknown: 'Ismeretlen',
  running: 'Fut',
  succeeded: 'Sikeres',
  not_modified: 'Nem változott',
  partial: 'Részleges',
  failed: 'Sikertelen',
  cancelled: 'Megszakítva',
};

function statusLabel(value: string) {
  return STATUS_LABELS[value] || value.replace(/_/g, ' ');
}

function statusVariant(value: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (value === 'approved' || value === 'healthy' || value === 'succeeded' || value === 'not_modified') return 'secondary';
  if (value === 'failed' || value === 'unhealthy' || value === 'rejected') return 'destructive';
  return 'outline';
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('hu-HU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function FeedSourcesPanel({ model }: FeedSourcesPanelProps) {
  const actionRunning = Boolean(model.actionSourceId);

  return (
    <div className="space-y-5" aria-busy={model.loading || actionRunning}>
      <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Ellenőrzött esemény-feed registry</p>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              RSS, Atom, ICS és JSON-LD források állapota. A próba nem publikál; a szinkron is csak a backend jóváhagyási és minőségi kapuin át tehet eseményt láthatóvá.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void model.refresh()} disabled={model.loading || actionRunning}>
          <RefreshCw className={model.loading ? 'animate-spin' : ''} />
          Frissítés
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Feed registry összesítés">
        {[
          ['Összes forrás', model.summary.total],
          ['Ellenőrzésre vár', model.summary.pendingReview],
          ['Review approved', model.summary.approved],
          ['Enabled flag', model.summary.enabled],
          ['Egészséges', model.summary.healthy],
          ['Karantén tételek', model.summary.quarantinedItems],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card/70 p-3 shadow-sm">
            <p className="text-xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {model.error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {model.error}
        </div>
      )}

      {model.loading && model.sources.length === 0 ? (
        <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground" role="status">
          <RefreshCw className="h-4 w-4 animate-spin" /> Feed registry betöltése…
        </div>
      ) : model.sources.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nincs megjeleníthető feed forrás.
        </div>
      ) : (
        <section className="space-y-3" aria-labelledby="feed-sources-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 id="feed-sources-heading" className="font-display text-base font-semibold">Források</h3>
            <span className="text-xs text-muted-foreground">{model.sources.length} látható sor</span>
          </div>
          <div className="max-h-[48rem] space-y-3 overflow-y-auto pr-1">
            {model.sources.map((source) => {
              const sourceBusy = model.actionSourceId === source.sourceId;
              const approvalDraft = model.approvalDrafts[source.sourceId];
              const approvalReady = isEventFeedApprovalDraftReady(approvalDraft);
              const reviewReady = (approvalDraft?.reason.trim().length ?? 0) >= 8;
              const fieldId = `feed-approval-${source.sourceId}`;
              const approvalEvidenceComplete = hasEventFeedApprovalEvidence(source);
              const trustedActive = isEventFeedSourceTrustedActive(source);
              const reviewEvidenceMismatch = source.reviewState === 'approved' && !approvalEvidenceComplete;
              return (
                <article key={source.sourceId} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium">{source.publisherName}</h4>
                        <Badge variant="outline">{source.format.toLocaleUpperCase('hu-HU')}</Badge>
                        <Badge variant={reviewEvidenceMismatch ? 'destructive' : statusVariant(source.reviewState)}>
                          {approvalEvidenceComplete
                            ? 'Auditált'
                            : reviewEvidenceMismatch
                              ? 'Review eltérés'
                              : statusLabel(source.reviewState)}
                        </Badge>
                        <Badge variant={trustedActive ? 'default' : source.enabled ? 'destructive' : 'outline'}>
                          {trustedActive ? 'Auditált · aktív' : source.enabled ? 'Aktiválás blokkolva' : 'Nem aktív'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={source.sourceId}>{source.sourceId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void model.probe(source.sourceId)}
                        disabled={model.loading || actionRunning}
                        aria-label={`${source.publisherName} feed próba`}
                      >
                        <Search /> Próba
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void model.sync(source.sourceId)}
                        disabled={model.loading || actionRunning}
                        aria-label={`${source.publisherName} feed szinkron`}
                      >
                        <Play /> Szinkron
                      </Button>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Város</dt>
                      <dd className="mt-1 font-medium">{source.city || 'Nincs megadva'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Health</dt>
                      <dd className="mt-1"><Badge variant={statusVariant(source.healthStatus)}>{statusLabel(source.healthStatus)}</Badge></dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Utolsó siker</dt>
                      <dd className="mt-1 font-medium tabular-nums">{formatDateTime(source.lastSuccessAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Következő poll</dt>
                      <dd className="mt-1 font-medium tabular-nums">{formatDateTime(source.nextPollAt)}</dd>
                    </div>
                  </dl>

                  <fieldset className="mt-4 space-y-4 rounded-xl border border-primary/15 bg-primary/[0.025] p-4">
                    <legend className="px-1 text-sm font-semibold">Auditált jóváhagyás</legend>
                    <p id={`${fieldId}-requirements`} className="text-xs leading-relaxed text-muted-foreground">
                      A jóváhagyás fail-closed: minden bizonyítékot ennél a forrásnál külön kell megerősíteni. A próba és a szinkron ezt nem kerüli meg.
                    </p>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)]">
                      <div className="min-w-0">
                        <label htmlFor={`${fieldId}-host`} className="text-xs font-medium">Exact fetch host</label>
                        <Input
                          id={`${fieldId}-host`}
                          className="mt-1.5 font-mono text-xs"
                          value={approvalDraft?.fetchHost ?? ''}
                          onChange={(event) => model.updateApprovalDraft(source.sourceId, { fetchHost: event.target.value })}
                          placeholder="events.example.hu"
                          aria-label={`${source.publisherName} exact fetch host`}
                          aria-describedby={`${fieldId}-host-help`}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          disabled={!approvalDraft || model.loading || actionRunning}
                        />
                        <p id={`${fieldId}-host-help`} className={`mt-1 break-all text-[11px] ${approvalDraft?.fetchHost && !isExactEventFeedHost(approvalDraft.fetchHost) ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {approvalDraft?.fetchHost && !isExactEventFeedHost(approvalDraft.fetchHost)
                            ? 'Csak pontos FQDN adható meg, séma, port, wildcard és útvonal nélkül.'
                            : source.endpointUrl || 'Az endpoint URL nem érkezett meg a registryből.'}
                        </p>
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-poll`} className="text-xs font-medium">Poll intervallum (perc)</label>
                        <Input
                          id={`${fieldId}-poll`}
                          className="mt-1.5"
                          type="number"
                          min={15}
                          max={10_080}
                          step={15}
                          value={approvalDraft?.pollIntervalMinutes ?? 1440}
                          onChange={(event) => model.updateApprovalDraft(source.sourceId, {
                            pollIntervalMinutes: event.target.valueAsNumber,
                          })}
                          aria-label={`${source.publisherName} poll intervallum`}
                          disabled={!approvalDraft || model.loading || actionRunning}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-quality`} className="text-xs font-medium">Minimum minőség (%)</label>
                        <Input
                          id={`${fieldId}-quality`}
                          className="mt-1.5"
                          type="number"
                          min={50}
                          max={100}
                          step={1}
                          value={approvalDraft?.minPublishQuality ?? 80}
                          onChange={(event) => model.updateApprovalDraft(source.sourceId, {
                            minPublishQuality: event.target.valueAsNumber,
                          })}
                          aria-label={`${source.publisherName} minimum publikálási minőség`}
                          disabled={!approvalDraft || model.loading || actionRunning}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
                      <label className="flex min-h-11 items-start gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                        <Checkbox
                          checked={approvalDraft?.legalReviewApproved ?? false}
                          onCheckedChange={(checked) => model.updateApprovalDraft(source.sourceId, {
                            legalReviewApproved: checked === true,
                          })}
                          aria-label={`${source.publisherName} jogi ellenőrzése jóváhagyva`}
                          disabled={!approvalDraft || model.loading || actionRunning}
                        />
                        <span><strong>Jogi review: approved</strong><span className="mt-1 block text-xs text-muted-foreground">A forrás felhasználása jogilag ellenőrzött.</span></span>
                      </label>
                      <label className="flex min-h-11 items-start gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                        <Checkbox
                          checked={approvalDraft?.robotsAllowed ?? false}
                          onCheckedChange={(checked) => model.updateApprovalDraft(source.sourceId, {
                            robotsAllowed: checked === true,
                          })}
                          aria-label={`${source.publisherName} robots engedélyezve`}
                          disabled={!approvalDraft || model.loading || actionRunning}
                        />
                        <span><strong>Robots engedélyezve</strong><span className="mt-1 block text-xs text-muted-foreground">A pontos endpoint lekérése megengedett.</span></span>
                      </label>
                      <label className="flex min-h-11 items-start gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                        <Checkbox
                          checked={approvalDraft?.enable ?? false}
                          onCheckedChange={(checked) => model.updateApprovalDraft(source.sourceId, {
                            enable: checked === true,
                          })}
                          aria-label={`${source.publisherName} feed engedélyezése jóváhagyáskor`}
                          disabled={!approvalDraft || model.loading || actionRunning}
                        />
                        <span><strong>Azonnal engedélyezem</strong><span className="mt-1 block text-xs text-muted-foreground">Kikapcsolva hagyva csak a review állapot változik.</span></span>
                      </label>
                    </div>

                    <div>
                      <label htmlFor={`${fieldId}-reason`} className="text-xs font-medium">Admin művelet indoklása</label>
                      <Input
                        id={`${fieldId}-reason`}
                        className="mt-1.5"
                        value={approvalDraft?.reason ?? ''}
                        onChange={(event) => model.updateApprovalDraft(source.sourceId, { reason: event.target.value })}
                        placeholder="Legalább 8 karakter — pl. robots és jogi ellenőrzés rendben"
                        aria-label="Feed művelet indoklása"
                        aria-describedby={`${fieldId}-reason-help`}
                        maxLength={500}
                        disabled={!approvalDraft || model.loading || actionRunning}
                      />
                      <p id={`${fieldId}-reason-help`} className="mt-1 text-[11px] text-muted-foreground">
                        A jóváhagyás és a kikapcsolás külön auditált művelet; az indoklás ehhez a forráshoz tartozik.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void model.approve(source.sourceId)}
                        disabled={model.loading || actionRunning || !approvalReady}
                        aria-label={`${source.publisherName} feed jóváhagyása`}
                        aria-describedby={`${fieldId}-requirements`}
                      >
                        <CheckCircle /> Jóváhagyás
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void model.disable(source.sourceId)}
                        disabled={model.loading || actionRunning || !reviewReady}
                        aria-label={`${source.publisherName} feed kikapcsolása`}
                      >
                        <Pause /> Kikapcsolás
                      </Button>
                    </div>
                  </fieldset>

                  {sourceBusy && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Művelet folyamatban…
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="feed-runs-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="feed-runs-heading" className="flex items-center gap-2 font-display text-base font-semibold">
            <Clock className="h-4 w-4 text-primary" /> Legutóbbi futások
          </h3>
          <span className="text-xs text-muted-foreground">{model.runs.length} futás</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Ezek backend futási számlálók; önmagukban nem jelentik, hogy a forrás auditált, aktív vagy nyilvánosan publikáló.
        </p>
        {model.runs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Még nincs megjeleníthető feed futás.
          </div>
        ) : (
          <div className="space-y-2">
            {model.runs.map((run) => (
              <div key={run.id} className="flex flex-col gap-2 rounded-xl border bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{run.sourceId}</span>
                    <Badge variant="outline">{statusLabel(run.action)}</Badge>
                    <Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(run.startedAt)}{run.finishedAt ? ` → ${formatDateTime(run.finishedAt)}` : ''}
                  </p>
                </div>
                <p className="break-words text-xs tabular-nums text-muted-foreground">
                  {run.discovered} észlelt · {run.quarantined} karantén · {run.published} publikálási számláló · {run.duplicates} duplikátum
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
