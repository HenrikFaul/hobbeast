import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, Loader2, Lock, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  castVote,
  closePoll,
  createPoll,
  getEventPolls,
  leadingOptions,
  optionShare,
  type EventPoll,
} from '@/features/events/eventPolls';

/**
 * Group decisions on the event page.
 *
 * Quiet by default: with no polls and no right to start one, this renders
 * nothing at all. An organizer sees a single "Szavazás indítása" button until
 * they use it — the form is not sitting open on every event page.
 *
 * Results are visible to everyone who can vote. A poll whose outcome only the
 * organizer can see is a survey, and showing it as a poll would mislead the
 * people answering it.
 */

interface EventPollsCardProps {
  eventId: string | null;
  /** Somebody holding a place; the database enforces this too. */
  participating: boolean;
}

const EMPTY_DRAFT = { question: '', options: ['', ''], allowMultiple: false };

export function EventPollsCard({ eventId, participating }: EventPollsCardProps) {
  const [polls, setPolls] = useState<EventPoll[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const load = useCallback(async () => {
    if (!eventId || !participating) {
      setPolls([]);
      setLoaded(true);
      return;
    }
    setPolls(await getEventPolls(eventId));
    setLoaded(true);
  }, [eventId, participating]);

  useEffect(() => { void load(); }, [load]);

  const canManage = polls.some((poll) => poll.can_manage);

  const vote = async (poll: EventPoll, optionId: string, currentlyMine: boolean) => {
    setBusy(optionId);
    // Tapping your own choice again in a single-choice poll would leave you
    // with no answer, which is never what the tap meant.
    const nextSelected = poll.allow_multiple ? !currentlyMine : true;
    const result = await castVote(optionId, nextSelected);
    setBusy(null);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    await load();
  };

  const submitDraft = async () => {
    if (!eventId) return;
    setBusy('new');
    const result = await createPoll({
      eventId,
      question: draft.question,
      options: draft.options,
      allowMultiple: draft.allowMultiple,
    });
    setBusy(null);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    toast.success('Szavazás elindítva.');
    setDraft(EMPTY_DRAFT);
    setComposing(false);
    await load();
  };

  const finish = async (pollId: string) => {
    setBusy(pollId);
    const result = await closePoll(pollId);
    setBusy(null);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    await load();
  };

  // Nothing to show and nothing to start: stay off the page entirely.
  if (!loaded || (!polls.length && !participating)) return null;

  const draftValid = draft.question.trim().length >= 3
    && draft.options.filter((option) => option.trim()).length >= 2;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          Közös döntés
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {polls.length === 0 && !composing && (
          <p className="text-sm text-muted-foreground">
            Még nincs szavazás. Ha valamit közösen kell eldönteni — melyik nap,
            melyik hely —, itt tudjátok.
          </p>
        )}

        {polls.map((poll) => {
          const leaders = poll.is_closed ? leadingOptions(poll) : [];
          return (
            <section key={poll.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold leading-snug">{poll.question}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {poll.total_voters} szavazó
                    {poll.allow_multiple && ' · több válasz is adható'}
                    {poll.is_closed && ' · lezárva'}
                  </p>
                </div>
                {poll.can_manage && !poll.is_closed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === poll.id}
                    onClick={() => void finish(poll.id)}
                  >
                    <Lock className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Lezárás
                  </Button>
                )}
              </div>

              <ul className="space-y-1.5">
                {poll.options.map((option) => {
                  const share = optionShare(option, poll.total_voters);
                  const winning = leaders.some((leader) => leader.id === option.id);
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={poll.is_closed || busy === option.id}
                        aria-pressed={option.mine}
                        onClick={() => void vote(poll, option.id, option.mine)}
                        className={`relative w-full overflow-hidden rounded-xl border p-2.5 text-left transition-colors ${
                          option.mine ? 'border-primary bg-primary/5' : 'border-border/60'
                        } ${poll.is_closed ? 'cursor-default' : 'hover:border-primary/60'}`}
                      >
                        {/* The bar is the count made visible, never the source of it. */}
                        <span
                          className="absolute inset-y-0 left-0 bg-primary/10"
                          style={{ width: `${share}%` }}
                          aria-hidden="true"
                        />
                        <span className="relative flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            {option.mine && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                            <span className="truncate text-sm">{option.label}</span>
                            {winning && (
                              <Badge variant="secondary" className="shrink-0 rounded-full text-[10px]">
                                {leaders.length > 1 ? 'holtverseny' : 'nyert'}
                              </Badge>
                            )}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {option.votes} · {share}%
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {composing ? (
          <div className="space-y-3 rounded-xl border border-border/60 p-3">
            <div>
              <Label htmlFor="poll-question">Mit döntsünk el?</Label>
              <Input
                id="poll-question"
                value={draft.question}
                onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                placeholder="Pl. Melyik nap lenne jó?"
                className="mt-1"
              />
            </div>

            <div className="space-y-2">
              <Label>Válaszok</Label>
              {draft.options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={option}
                    aria-label={`${index + 1}. válasz`}
                    onChange={(event) => {
                      const options = [...draft.options];
                      options[index] = event.target.value;
                      setDraft({ ...draft, options });
                    }}
                    placeholder={index === 0 ? 'Péntek' : 'Szombat'}
                  />
                  {draft.options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDraft({
                        ...draft,
                        options: draft.options.filter((_, i) => i !== index),
                      })}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{index + 1}. válasz törlése</span>
                    </Button>
                  )}
                </div>
              ))}
              {draft.options.length < 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Még egy válasz
                </Button>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.allowMultiple}
                onChange={(event) => setDraft({ ...draft, allowMultiple: event.target.checked })}
              />
              Több válasz is adható
            </label>

            <div className="flex gap-2">
              <Button disabled={!draftValid || busy === 'new'} onClick={() => void submitDraft()}>
                {busy === 'new' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Indítás
              </Button>
              <Button variant="ghost" onClick={() => { setComposing(false); setDraft(EMPTY_DRAFT); }}>
                Mégse
              </Button>
            </div>
          </div>
        ) : (
          (canManage || polls.length === 0) && (
            <Button variant="outline" size="sm" onClick={() => setComposing(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Szavazás indítása
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
