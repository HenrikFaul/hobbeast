import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Group decisions.
 *
 * The rules that make a count trustworthy live in the database and are proven
 * there: a vote hangs off a participation, one row per (option, voter), a
 * single-choice poll replaces rather than accumulates. These tests pin the
 * client half — in particular that the page never totals votes itself.
 */

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const {
  castVote, closePoll, createPoll, getEventPolls, leadingOptions, optionShare,
} = await import('@/features/events/eventPolls');

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

const poll = {
  id: 'p1',
  question: 'Melyik nap?',
  allow_multiple: false,
  closes_at: null,
  closed_at: null,
  created_at: '2026-08-27T10:00:00Z',
  is_closed: false,
  can_manage: false,
  total_voters: 4,
  options: [
    { id: 'o1', label: 'Péntek', votes: 3, mine: true },
    { id: 'o2', label: 'Szombat', votes: 1, mine: false },
  ],
};

describe('reading polls', () => {
  it('takes the counts from the database rather than totting them up here', async () => {
    rpcMock.mockResolvedValue({ data: [poll], error: null });
    const polls = await getEventPolls('event-1');
    expect(rpcMock).toHaveBeenCalledWith('event_polls_with_results', { p_event_id: 'event-1' });
    expect(polls[0].total_voters).toBe(4);
    expect(polls[0].options[0].votes).toBe(3);
  });

  it('is empty rather than broken when the reader may not see them', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await getEventPolls('event-1')).toEqual([]);
    rpcMock.mockRejectedValue(new Error('offline'));
    expect(await getEventPolls('event-1')).toEqual([]);
  });
});

describe('share of the vote', () => {
  it('is a share of VOTERS, so a multiple-choice poll can exceed 100%', () => {
    // "Two thirds of us can do Saturday" is the useful sentence; normalising
    // it away would make the bars lie about what people said.
    const multi = { ...poll, allow_multiple: true, total_voters: 3 };
    expect(optionShare({ id: 'a', label: 'a', votes: 3, mine: false }, multi.total_voters)).toBe(100);
    expect(optionShare({ id: 'b', label: 'b', votes: 2, mine: false }, multi.total_voters)).toBe(67);
  });

  it('is zero rather than a division by nothing when nobody has voted', () => {
    expect(optionShare({ id: 'a', label: 'a', votes: 0, mine: false }, 0)).toBe(0);
  });
});

describe('who is winning', () => {
  it('names the leader', () => {
    expect(leadingOptions(poll).map((option) => option.label)).toEqual(['Péntek']);
  });

  it('names every option in a tie rather than picking one arbitrarily', () => {
    const tied = { ...poll, options: [
      { id: 'o1', label: 'Péntek', votes: 2, mine: false },
      { id: 'o2', label: 'Szombat', votes: 2, mine: false },
    ] };
    expect(leadingOptions(tied)).toHaveLength(2);
  });

  it('names nobody when nobody has voted', () => {
    const empty = { ...poll, options: poll.options.map((o) => ({ ...o, votes: 0 })) };
    expect(leadingOptions(empty)).toEqual([]);
  });
});

describe('acting on a poll', () => {
  it('sends a vote as a selection, which the database then interprets', async () => {
    await castVote('o2', true);
    expect(rpcMock).toHaveBeenCalledWith('cast_event_poll_vote', {
      p_option_id: 'o2', p_selected: true,
    });
  });

  it('drops blank options before creating, so the count cannot be padded', async () => {
    await createPoll({ eventId: 'e1', question: '  Melyik nap? ', options: ['Péntek', '  ', 'Szombat', ''], allowMultiple: true });
    expect(rpcMock).toHaveBeenCalledWith('create_event_poll', {
      p_event_id: 'e1',
      p_question: 'Melyik nap?',
      p_options: ['Péntek', 'Szombat'],
      p_allow_multiple: true,
    });
  });

  it('turns each refusal into something a person can act on', async () => {
    const cases: Array<[string, string]> = [
      ['PARTICIPATION_REQUIRED', 'Előbb jelentkezz a programra, hogy szavazhass.'],
      ['POLL_CLOSED', 'Ez a szavazás már lezárult.'],
      ['EVENT_OPERATOR_REQUIRED', 'Csak a szervező indíthat szavazást.'],
      ['AT_LEAST_TWO_OPTIONS_REQUIRED', 'Legalább két választ adj meg.'],
    ];
    for (const [code, message] of cases) {
      rpcMock.mockResolvedValue({ data: null, error: { message: `oops ${code} here` } });
      expect(await castVote('o1', true)).toEqual({ ok: false, message });
    }
  });

  it('closes a poll by id', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await closePoll('p1')).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('close_event_poll', { p_poll_id: 'p1' });
  });
});
