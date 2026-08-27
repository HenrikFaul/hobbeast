import { supabase } from '@/integrations/supabase/client';

/**
 * Deciding something together.
 *
 * Groups already decide things — which of three dates, which pub afterwards —
 * and until now they did it in a comment thread nobody could total up. This is
 * the client half of the polls; the rules that make a count trustworthy live
 * in the database, where they cannot be bypassed:
 *
 *   * a vote hangs off a PARTICIPATION, so somebody who never joined has no
 *     voice and somebody who leaves takes their vote with them;
 *   * one row per (option, voter), so a double tap cannot stuff the ballot;
 *   * a single-choice poll replaces the previous answer rather than adding;
 *   * the counts come back from ONE read, so the page never totals votes in
 *     JavaScript — which is where miscounts come from.
 */

export interface PollOption {
  id: string;
  label: string;
  votes: number;
  /** Whether the reader themselves chose this one. */
  mine: boolean;
}

export interface EventPoll {
  id: string;
  question: string;
  allow_multiple: boolean;
  closes_at: string | null;
  closed_at: string | null;
  created_at: string;
  is_closed: boolean;
  can_manage: boolean;
  total_voters: number;
  options: PollOption[];
}

const rpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const POLL_ERROR_TEXT: Record<string, string> = {
  EVENT_OPERATOR_REQUIRED: 'Csak a szervező indíthat szavazást.',
  PARTICIPATION_REQUIRED: 'Előbb jelentkezz a programra, hogy szavazhass.',
  POLL_CLOSED: 'Ez a szavazás már lezárult.',
  POLL_NOT_FOUND: 'Ez a szavazás már nem létezik.',
  AT_LEAST_TWO_OPTIONS_REQUIRED: 'Legalább két választ adj meg.',
  TOO_MANY_OPTIONS: 'Legfeljebb tíz választ adhatsz meg.',
  CLOSING_TIME_IN_PAST: 'A záró időpont már elmúlt.',
};

function readable(message: string): string {
  const code = Object.keys(POLL_ERROR_TEXT).find((key) => message.includes(key));
  return code ? POLL_ERROR_TEXT[code] : 'A művelet nem sikerült.';
}

export async function getEventPolls(eventId: string): Promise<EventPoll[]> {
  try {
    const { data, error } = await rpc.rpc('event_polls_with_results', { p_event_id: eventId });
    if (error || !Array.isArray(data)) return [];
    return data as EventPoll[];
  } catch {
    return [];
  }
}

export async function castVote(
  optionId: string,
  selected: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('cast_event_poll_vote', {
    p_option_id: optionId,
    p_selected: selected,
  });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export async function createPoll(input: {
  eventId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('create_event_poll', {
    p_event_id: input.eventId,
    p_question: input.question.trim(),
    p_options: input.options.map((option) => option.trim()).filter(Boolean),
    p_allow_multiple: input.allowMultiple,
  });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export async function closePoll(pollId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await rpc.rpc('close_event_poll', { p_poll_id: pollId });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

/**
 * The share of the vote an option holds, as a percentage of VOTERS rather than
 * of votes. In a multiple-choice poll the parts deliberately sum to more than
 * a hundred — "two thirds of us can do Saturday" is the useful sentence, and
 * normalising it away would make the bars lie.
 */
export function optionShare(option: PollOption, totalVoters: number): number {
  if (!totalVoters) return 0;
  return Math.round((option.votes / totalVoters) * 100);
}

/** The options currently in the lead, which may be a tie. */
export function leadingOptions(poll: EventPoll): PollOption[] {
  const best = Math.max(0, ...poll.options.map((option) => option.votes));
  return best === 0 ? [] : poll.options.filter((option) => option.votes === best);
}
