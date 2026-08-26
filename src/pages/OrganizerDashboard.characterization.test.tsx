import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizerDashboard from './OrganizerDashboard';

const organizerMocks = vi.hoisted(() => ({
  getOwnedEvents: vi.fn(),
  getEventParticipants: vi.fn(),
  getEventMessages: vi.fn(),
  getOrganizerAnalytics: vi.fn(),
  getParticipationAudit: vi.fn(),
  transitionParticipation: vi.fn(),
  saveOrganizerNote: vi.fn(),
  createEventMessage: vi.fn(),
  buildAttendeeCsv: vi.fn(() => 'display_name,user_id'),
}));

const authMocks = vi.hoisted(() => ({
  user: { id: 'organizer-1', email_confirmed_at: '2026-01-01T00:00:00.000Z' },
  setMode: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authMocks.user,
    loading: false,
  }),
}));

vi.mock('@/hooks/useOrganizerMode', () => ({
  useOrganizerMode: () => ({ canUseOrganizerMode: true, setMode: authMocks.setMode }),
}));

vi.mock('@/lib/organizer', () => organizerMocks);

vi.mock('@/lib/eventOperations', () => ({
  completeEventAtomic: vi.fn(),
  createOrganizerIncidentHandoff: vi.fn(),
  saveOrganizerReadinessAssessment: vi.fn(),
}));

vi.mock('@/lib/organizerCheckInQueue', () => ({
  flushOrganizerCheckIns: vi.fn().mockResolvedValue({ sent: 0, sentParticipationIds: [] }),
  queueOrganizerCheckIn: vi.fn(),
  readQueuedCheckIns: vi.fn(() => []),
}));

vi.mock('@/lib/organizerProduction', () => ({
  calculateHostReliability: vi.fn(() => ({
    publishToCompletionRate: 0.5,
    cancellationRate: 0.1,
    attendanceRate: 0.75,
    noShowRate: 0.25,
  })),
  validateBulkParticipantTransition: vi.fn(() => ({ allowed: true, invalidStatuses: [] })),
}));

vi.mock('@/lib/eventLifecycle', () => ({
  buildOrganizerReadinessChecklist: vi.fn(() => [
    { key: 'title', label: 'Eseménynév', complete: true },
  ]),
}));

vi.mock('@/lib/productAnalyticsClient', () => ({ trackProductEvent: vi.fn() }));

vi.mock('@/components/organizer/OrganizerAiProposalInbox', () => ({
  OrganizerAiProposalInbox: () => <div>AI proposal inbox</div>,
}));

vi.mock('@/components/organizer/OrganizerOperationsPanel', () => ({
  OrganizerOperationsPanel: () => <div>Organizer operations</div>,
}));

vi.mock('@/features/organizer/dashboard/OrganizerStatCards', () => ({
  MetricCard: ({ label, value }: { label: string; value: string | number }) => <div>{label}: {value}</div>,
  InfoPill: ({ label, value }: { label: string; value: string | number }) => <div>{label}: {value}</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location-search">{location.search}</output>;
}

let container: HTMLDivElement;
let root: Root;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function tab(label: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
    .find((candidate) => candidate.textContent === label);
}

function activateTab(label: string) {
  tab(label)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
}

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button:not([role="tab"])'))
    .find((candidate) => candidate.textContent === label);
}

describe('OrganizerDashboard route characterization', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    organizerMocks.getOwnedEvents.mockResolvedValue([{
      id: 'event-1',
      title: 'Duna-parti séta',
      description: 'Közös séta',
      event_date: '2026-09-01',
      event_time: '18:00',
      location_city: 'Budapest',
      category: 'Túrázás',
      image_emoji: '🥾',
      max_attendees: 12,
      waitlist_enabled: true,
      outcome_status: 'published',
      meeting_instructions: 'A hídnál',
      cancellation_policy: '24 óra',
      accessibility_info: null,
      host_responsibility_accepted_at: '2026-08-01T00:00:00.000Z',
      participantCount: 7,
      goingCount: 4,
      waitlistCount: 2,
      checkedInCount: 1,
    }]);
    organizerMocks.getEventParticipants.mockResolvedValue([{
      id: 'participant-1',
      event_id: 'event-1',
      user_id: 'participant-user-1',
      joined_at: '2026-08-01T12:00:00.000Z',
      status: 'going',
      checked_in_at: null,
      organizer_note: null,
      invite_code: 'ABC123',
      arriving_alone: true,
      first_hobbeast_event: true,
      arrival_visibility: 'host_only',
      profiles: { display_name: 'Ada Lovelace', avatar_url: null, city: 'Budapest' },
    }]);
    organizerMocks.getEventMessages.mockResolvedValue([{
      id: 'message-1',
      event_id: 'event-1',
      message_type: 'reminder',
      audience_filter: 'going',
      subject: 'Találkozó',
      body: 'Találkozunk a hídnál.',
      delivery_state: 'sent',
      scheduled_for: null,
      created_at: '2026-08-01T12:00:00.000Z',
    }]);
    organizerMocks.getOrganizerAnalytics.mockResolvedValue({
      totalViews: 20,
      uniqueViewers: 15,
      detailOpens: 10,
      joinClicks: 7,
      going: 4,
      waitlist: 2,
      checkedIn: 1,
      completed: 0,
      noShow: 0,
      attendanceRate: 0.2,
      sourceBreakdown: [{ source: 'hobbeast_native', views: 20, joins: 7, checkedIn: 1 }],
    });
    organizerMocks.getParticipationAudit.mockResolvedValue([]);
    organizerMocks.transitionParticipation.mockResolvedValue(undefined);
    organizerMocks.saveOrganizerNote.mockResolvedValue(undefined);
    organizerMocks.createEventMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the route, event selection and six-tab visual contract', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/organizer?tab=events']}>
          <Routes>
            <Route path="/organizer" element={<><OrganizerDashboard /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flushEffects();

    expect(document.body.textContent).toContain('Organizer mode');
    expect(Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).map((item) => item.textContent)).toEqual([
      'My events', 'Attendees', 'Check-in', 'Messages', 'Analytics', 'Program sources', 'Settings',
    ]);
    expect(document.body.textContent).toContain('Duna-parti séta');
    expect(document.body.textContent).toContain('Budapest · 2026-09-01');
    expect(document.querySelector('[aria-label="location-search"]')).toHaveTextContent('eventId=event-1');

    await act(async () => activateTab('Attendees'));
    await flushEffects();
    expect(document.body.textContent).toContain('Ada Lovelace');
    expect(document.body.textContent).toContain('egyedül érkezik');
    expect(document.body.textContent).toContain('első Hobbeast esemény');
    await act(async () => button('Check-in')?.click());
    await flushEffects();
    expect(organizerMocks.transitionParticipation).toHaveBeenCalledWith({
      participantId: 'participant-1',
      eventId: 'event-1',
      actorUserId: 'organizer-1',
      nextStatus: 'checked_in',
      metadata: { from_status: 'going' },
    });

    await act(async () => activateTab('Messages'));
    expect(document.body.textContent).toContain('Event communications');
    expect(document.body.textContent).toContain('Találkozunk a hídnál.');
    const messageBody = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Írd ide az üzenet tartalmát"]');
    expect(messageBody).not.toBeNull();
    await act(async () => {
      if (!messageBody) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setValue?.call(messageBody, 'Friss szervezői üzenet');
      messageBody.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Küldés / mentés')?.click());
    await flushEffects();
    expect(organizerMocks.createEventMessage).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      actorUserId: 'organizer-1',
      body: 'Friss szervezői üzenet',
      messageType: 'reminder',
      audienceFilter: 'going',
    }));

    await act(async () => activateTab('Analytics'));
    expect(document.body.textContent).toContain('Join click / intent: 7');
    expect(document.body.textContent).toContain('hobbeast_native');

    await act(async () => activateTab('Settings'));
    expect(document.body.textContent).toContain('Organizer readiness');
    expect(document.body.textContent).toContain('Organizer operations');
    expect(document.body.textContent).toContain('AI proposal inbox');
  }, 15_000);
});
