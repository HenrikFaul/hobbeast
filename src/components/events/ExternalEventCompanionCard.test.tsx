import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const getPlan = vi.fn();
const createPlan = vi.fn();
const setMembership = vi.fn();

vi.mock('@/lib/eventOperations', () => ({
  getExternalEventCompanionPlan: (...args: unknown[]) => getPlan(...args),
  createExternalEventCompanionPlan: (...args: unknown[]) => createPlan(...args),
  setExternalEventCompanionMembership: (...args: unknown[]) => setMembership(...args),
}));

vi.mock('@/lib/productAnalyticsClient', () => ({
  trackProductEvent: vi.fn(async () => ({ accepted: true })),
}));

import { ExternalEventCompanionCard } from '@/components/events/ExternalEventCompanionCard';

const EVENT_ID = '7031c2cf-2f0e-429f-b8cb-bfa0527e4832';

function renderCard(overrides: Partial<Parameters<typeof ExternalEventCompanionCard>[0]> = {}) {
  const onDecline = vi.fn();
  const onRequestSignIn = vi.fn();
  render(
    <ExternalEventCompanionCard
      externalEventId={EVENT_ID}
      eventTitle="Esti csillagászati program"
      eventDate="2026-09-04"
      eventTime="20:30:00"
      venueHint="Bükki Csillagda"
      sourceLabel="Programajánló"
      authenticated
      onRequestSignIn={onRequestSignIn}
      autoPrompt
      onDecline={onDecline}
      {...overrides}
    />,
  );
  return { onDecline, onRequestSignIn };
}

beforeEach(() => {
  getPlan.mockReset();
  createPlan.mockReset();
  setMembership.mockReset();
  sessionStorage.clear();
});

describe('ExternalEventCompanionCard', () => {
  it('offers to organise a joint visit instead of showing a missing-event error', async () => {
    getPlan.mockResolvedValue({ featureEnabled: true, available: true, plan: null });
    renderCard();

    expect(await screen.findByText(/még nincs közös látogatás/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Igen, szervezzünk egyet/i })).toBeTruthy();
  });

  it('sends the visitor back to the map when they decline', async () => {
    getPlan.mockResolvedValue({ featureEnabled: true, available: true, plan: null });
    const { onDecline } = renderCard();

    const no = await screen.findByRole('button', { name: /vissza a térképre/i });
    fireEvent.click(no);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('prefills the form from the original program so only the meeting point is left to decide', async () => {
    getPlan.mockResolvedValue({ featureEnabled: true, available: true, plan: null });
    createPlan.mockResolvedValue({
      featureEnabled: true,
      available: true,
      plan: { id: 'plan-1', hostName: 'Kata', isHost: true, meetingPoint: 'Bükki Csillagda', meetTime: '20:30', note: null, maxCompanions: null, companionCount: 1, spotsLeft: null, iJoined: true, createdAt: null },
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: /Igen, szervezzünk egyet/i }));

    const meetingPoint = screen.getByLabelText(/Hol találkozzatok/i) as HTMLInputElement;
    const meetTime = screen.getByLabelText(/Hánykor/i) as HTMLInputElement;
    expect(meetingPoint.value).toBe('Bükki Csillagda');
    expect(meetTime.value).toBe('20:30');

    fireEvent.click(screen.getByRole('button', { name: /Kész, létrehozom/i }));
    await waitFor(() => expect(createPlan).toHaveBeenCalledWith({
      externalEventId: EVENT_ID,
      meetingPoint: 'Bükki Csillagda',
      meetTime: '20:30',
      note: null,
    }));
  });

  it('shows an existing plan and lets a second person join it rather than start another', async () => {
    getPlan.mockResolvedValue({
      featureEnabled: true,
      available: true,
      plan: {
        id: 'plan-1', hostName: 'Kata', isHost: false, meetingPoint: 'Főbejárat', meetTime: '20:00:00',
        note: null, maxCompanions: 6, companionCount: 2, spotsLeft: 4, iJoined: false, createdAt: null,
      },
    });
    setMembership.mockResolvedValue({
      featureEnabled: true,
      available: true,
      plan: {
        id: 'plan-1', hostName: 'Kata', isHost: false, meetingPoint: 'Főbejárat', meetTime: '20:00:00',
        note: null, maxCompanions: 6, companionCount: 3, spotsLeft: 3, iJoined: true, createdAt: null,
      },
    });
    renderCard();

    expect(await screen.findByText(/2 hobbeastos tag megy együtt/i)).toBeTruthy();
    // No offer dialog when a plan already exists.
    expect(screen.queryByText(/még nincs közös látogatás/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Én is megyek/i }));
    await waitFor(() => expect(setMembership).toHaveBeenCalledWith({ planId: 'plan-1', active: true }));
  });

  it('stays quiet when the program is no longer publicly available', async () => {
    getPlan.mockResolvedValue({ featureEnabled: true, available: false, plan: null });
    const { container } = render(
      <ExternalEventCompanionCard
        externalEventId={EVENT_ID}
        eventTitle="Lejárt program"
        eventDate={null}
        eventTime={null}
        venueHint={null}
        sourceLabel="Programajánló"
        authenticated
        onRequestSignIn={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
