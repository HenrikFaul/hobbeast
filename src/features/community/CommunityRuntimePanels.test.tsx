import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CircleRuntimeActions,
  CircleSuggestionCards,
  HubRuntimeActions,
} from './CommunityRuntimePanels';
import type { CircleCard, CircleDetail, CircleHealth, CircleSuggestionCard, HubCard, HubHostInsights, HubModerationItem } from './contracts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const loadCircleDetail = vi.fn();
const loadCircleHealth = vi.fn();
const loadVirtualHubHostInsights = vi.fn();
const loadVirtualHubModerationQueue = vi.fn();
const loadVirtualHubPendingRequests = vi.fn();
const loadVirtualHubWelcome = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('./repository', () => ({
  acceptCommunityCircleSuggestion: vi.fn(),
  claimVirtualHubHost: vi.fn(),
  leaveCommunityCircle: vi.fn(),
  loadCircleDetail: (...args: unknown[]) => loadCircleDetail(...args),
  loadCircleHealth: (...args: unknown[]) => loadCircleHealth(...args),
  loadVirtualHubHostInsights: (...args: unknown[]) => loadVirtualHubHostInsights(...args),
  loadVirtualHubModerationQueue: (...args: unknown[]) => loadVirtualHubModerationQueue(...args),
  loadVirtualHubPendingRequests: (...args: unknown[]) => loadVirtualHubPendingRequests(...args),
  loadVirtualHubWelcome: (...args: unknown[]) => loadVirtualHubWelcome(...args),
  recordVirtualHubPreview: vi.fn(),
  requestVirtualHubReactivation: vi.fn(),
  resolveCircleMembershipRequest: vi.fn(),
  resolveVirtualHubJoinRequest: vi.fn(),
  resolveVirtualHubModerationItem: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  loadCircleDetail.mockReset();
  loadCircleHealth.mockReset();
  loadVirtualHubHostInsights.mockReset();
  loadVirtualHubModerationQueue.mockReset();
  loadVirtualHubPendingRequests.mockReset();
  loadVirtualHubWelcome.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent?.includes(label));
}

const circle: CircleCard = {
  id: '11111111-1111-4111-8111-111111111111',
  host_id: '22222222-2222-4222-8222-222222222222',
  name: 'Hétvégi túrák',
  purpose: 'Közös túrázás',
  cadence: 'monthly',
  capacity: 8,
  membership_policy: 'approval',
  lifecycle_state: 'active',
  safety_rules: null,
  visibility: 'members',
};

const detail: CircleDetail = {
  circle_id: circle.id,
  name: circle.name,
  purpose: circle.purpose,
  cadence: circle.cadence,
  capacity: circle.capacity,
  membership_policy: circle.membership_policy,
  lifecycle_state: circle.lifecycle_state,
  venue_preference: null,
  safety_rules: null,
  host_id: circle.host_id,
  members: [],
  shared_interests: [{ label: 'Túrázás', member_count: 2 }],
  pending_requests: [],
  next_event: null,
};

const hub: HubCard = {
  id: '33333333-3333-4333-8333-333333333333',
  hobby_category: 'Túrázás',
  city: 'Budapest',
  purpose: 'Kezdőbarát helyi alkalmak',
  join_policy: 'open',
  lifecycle_state: 'inactive',
  member_count: 6,
  welcome_message: null,
  community_rules: null,
  activity_freshness_at: null,
  host_id: null,
  host_display_name: null,
  host_avatar_url: null,
  membership_status: 'active',
  pending_join_count: 0,
  qualification_score: 70,
  qualification_reasons: ['3 recently active real member(s)'],
  beginner_friendly: true,
  can_claim_host: true,
};

const health: CircleHealth = {
  circle_id: circle.id,
  active_members: 5,
  new_members_30d: 2,
  event_count: 4,
  events_30d: 1,
  returning_attendees: 3,
  returning_rate: 0.6,
  no_show_rate: 0.1,
  open_report_count: 1,
  reports_30d: 1,
  prior_reports_30d: 0,
  pending_requests: 2,
  host_load: 3,
  cadence_status: 'on_track',
  last_activity_at: '2026-08-23T09:00:00Z',
  next_event_at: null,
  generated_at: '2026-08-23T09:00:00Z',
  privacy_note: 'aggregate only',
};

const insights: HubHostInsights = {
  hub_id: hub.id,
  window_days: 90,
  suppression_threshold: 3,
  funnel: {
    discovery: 12,
    preview: 8,
    join_request: 4,
    joined: 4,
    first_activity: 3,
    first_attendance: 3,
    repeat_activity: null,
  },
  new_real_members_30d: 2,
  open_moderation_count: 1,
  qualification_score: 70,
  qualification_reasons: ['verified demand'],
  activity_freshness_at: '2026-08-23T09:00:00Z',
  archive_eligible_at: null,
  privacy_note: 'k=3',
};

describe('Community runtime panels', () => {
  it('shows evidence-gated Circle suggestions as an explicit CTA', () => {
    const suggestion: CircleSuggestionCard = {
      suggestion_id: '44444444-4444-4444-8444-444444444444',
      activity_label: 'Túrázás',
      city: 'Budapest',
      suggested_member_count: 3,
      status: 'draft',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    act(() => root.render(<CircleSuggestionCards suggestions={[suggestion]} onChanged={vi.fn()} />));
    expect(document.body.textContent).toContain('ismételt és hitelesített közös eseménykapcsolatból');
    expect(button('Circle indítása')?.type).toBe('button');
  });

  it('exposes leave only to an active non-host member inside Circle detail', async () => {
    loadCircleDetail.mockResolvedValue({ ok: true, data: detail });
    act(() => root.render(
      <CircleRuntimeActions
        circle={circle}
        membershipStatus="active"
        userId="55555555-5555-4555-8555-555555555555"
        onChanged={vi.fn()}
      />,
    ));
    await act(async () => {
      button('Részletek')?.click();
      await Promise.resolve();
    });
    expect(button('Circle elhagyása')).toBeDefined();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Túrázás · 2 tag');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Szervezzünk újra valamit');
  });

  it('shows host claim and reactivation actions only from server card capabilities', () => {
    act(() => root.render(
      <HubRuntimeActions
        hub={hub}
        userId="55555555-5555-4555-8555-555555555555"
        onChanged={vi.fn()}
      />,
    ));
    expect(button('Host szerep vállalása')).toBeDefined();
    expect(button('Reaktiválás')).toBeDefined();
    expect(button('Welcome és részletek')?.type).toBe('button');
  });

  it('shows aggregate Circle health only to the host', async () => {
    loadCircleDetail.mockResolvedValue({ ok: true, data: detail });
    loadCircleHealth.mockResolvedValue({ ok: true, data: health });
    act(() => root.render(<CircleRuntimeActions circle={circle} membershipStatus="active" userId={circle.host_id} onChanged={vi.fn()} />));
    await act(async () => {
      button('Részletek')?.click();
      await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Circle health');
    expect(dialog?.textContent).toContain('60%');
    expect(dialog?.textContent).toContain('3nyitott host feladat');
  });

  it('shows k-suppressed Hub funnel and redacted moderation queue to the host', async () => {
    const moderationItem: HubModerationItem = {
      moderation_item_id: '77777777-7777-4777-8777-777777777777',
      item_type: 'content_report',
      status: 'open',
      subject_user_id: null,
      subject_display_name: null,
      report_category: 'spam',
      created_at: '2026-08-23T09:00:00Z',
    };
    loadVirtualHubWelcome.mockResolvedValue({ ok: true, data: { hub_id: hub.id, purpose: null, welcome_message: null, community_rules: null, host: null, next_beginner_event: null, privacy_note: 'safe' } });
    loadVirtualHubPendingRequests.mockResolvedValue({ ok: true, data: [] });
    loadVirtualHubHostInsights.mockResolvedValue({ ok: true, data: insights });
    loadVirtualHubModerationQueue.mockResolvedValue({ ok: true, data: [moderationItem] });
    act(() => root.render(<HubRuntimeActions hub={{ ...hub, host_id: 'host-user', can_claim_host: false }} userId="host-user" onChanged={vi.fn()} />));
    await act(async () => {
      button('Welcome és részletek')?.click();
      await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('90 napos aktiválási funnel');
    expect(dialog?.textContent).toContain('<3');
    expect(dialog?.textContent).toContain('A személyazonosság privacy okból rejtett');
    expect(button('Felülvizsgálom')?.type).toBe('button');
  });
});
