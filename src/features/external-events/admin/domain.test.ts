import { describe, expect, it } from 'vitest';
import {
  eventFeedApprovalDraft,
  filterDbRows,
  hasEventFeedApprovalEvidence,
  isAdminExternalProviderTab,
  isEventFeedApprovalDraftReady,
  isEventFeedSourceTrustedActive,
  normalizeDbQueryResult,
  normalizeEventFeedActionResults,
  normalizeEventFeedStatus,
  normalizeEventbriteEvent,
  normalizeExternalEvent,
} from './domain';

describe('external-events admin normalized domain', () => {
  it('keeps the four established provider tabs and accepts the additive feeds tab', () => {
    expect(['eventbrite', 'ticketmaster', 'seatgeek', 'places', 'feeds'].every(isAdminExternalProviderTab)).toBe(true);
    expect(isAdminExternalProviderTab('unknown')).toBe(false);
  });

  it('normalizes feed status, run counters and action results without exposing raw payloads', () => {
    const snapshot = normalizeEventFeedStatus({
      summary: { total: 2, pending_review: 1, approved: 1, enabled: 1, healthy: 1, quarantined_items: 3 },
      sources: [{
        source_id: 'src_1234abcd',
        publisher_name: 'Budapest Közösségi Ház',
        format: 'rss',
        city: 'Budapest',
        endpoint_url: 'https://events.example.test/feed.xml',
        fetch_hosts: ['events.example.test'],
        health_status: 'healthy',
        review_state: 'approved',
        legal_review_status: 'approved',
        robots_allowed: true,
        enabled: true,
        poll_interval_minutes: 1440,
        min_publish_quality: 80,
        last_successful_parse_at: '2026-08-25T08:00:00.000Z',
        next_poll_at: '2026-08-26T08:00:00.000Z',
        raw_body: '<private />',
      }],
      runs: [{
        id: 'run-1',
        source_id: 'src_1234abcd',
        action: 'sync',
        status: 'succeeded',
        discovered_count: 8,
        quarantined_count: 2,
        published_count: 5,
        duplicate_count: 1,
        started_at: '2026-08-25T08:00:00.000Z',
      }],
    });

    expect(snapshot.summary).toEqual({
      total: 2,
      pendingReview: 1,
      approved: 1,
      enabled: 1,
      healthy: 1,
      quarantinedItems: 3,
    });
    expect(snapshot.sources[0]).toEqual(expect.objectContaining({
      sourceId: 'src_1234abcd',
      publisherName: 'Budapest Közösségi Ház',
      format: 'rss',
      reviewState: 'approved',
      endpointUrl: 'https://events.example.test/feed.xml',
      minPublishQuality: 80,
    }));
    expect(snapshot.sources[0]).not.toHaveProperty('raw_body');
    expect(snapshot.runs[0]).toEqual(expect.objectContaining({
      sourceId: 'src_1234abcd',
      discovered: 8,
      quarantined: 2,
      published: 5,
      duplicates: 1,
    }));
    expect(normalizeEventFeedActionResults({
      ok: true,
      results: [{ source_id: 'src_1234abcd', status: 'succeeded', discovered: 4, quarantined: 1, published: 2 }],
    })).toEqual([{
      sourceId: 'src_1234abcd',
      status: 'succeeded',
      discovered: 4,
      quarantined: 1,
      published: 2,
    }]);

    const draft = eventFeedApprovalDraft(snapshot.sources[0]);
    expect(draft).toEqual(expect.objectContaining({
      fetchHost: 'events.example.test',
      legalReviewApproved: false,
      robotsAllowed: false,
      minPublishQuality: 80,
      reason: '',
    }));
    expect(isEventFeedApprovalDraftReady(draft)).toBe(false);
    expect(isEventFeedApprovalDraftReady({
      ...draft,
      legalReviewApproved: true,
      robotsAllowed: true,
      reason: 'Forrás ellenőrizve',
    })).toBe(true);
    expect(hasEventFeedApprovalEvidence(snapshot.sources[0])).toBe(true);
    expect(isEventFeedSourceTrustedActive(snapshot.sources[0])).toBe(true);
    expect(isEventFeedSourceTrustedActive({
      ...snapshot.sources[0],
      legalReviewStatus: 'pending',
    })).toBe(false);
  });

  it('normalizes Eventbrite DTOs into the shared admin provider card contract', () => {
    expect(normalizeEventbriteEvent({
      id: 'eb-1',
      title: 'Meetup',
      category: 'Community',
      event_date: '2026-09-01',
      event_time: '18:00',
      location_city: 'Budapest',
      location_district: null,
      location_address: null,
      location_free_text: null,
      location_type: 'city',
      max_attendees: null,
      image_emoji: '🤝',
      tags: [],
      description: null,
      created_by: '',
      participant_count: 0,
      source: 'eventbrite',
      eventbrite_url: 'https://example.test/eb',
      eventbrite_logo_url: null,
    })).toEqual(expect.objectContaining({
      id: 'eb-1',
      provider: 'eventbrite',
      title: 'Meetup',
      sourceLabel: 'Eventbrite',
      freshnessState: 'unknown',
    }));
  });

  it('normalizes external event DTOs without leaking provider-specific payload fields', () => {
    const normalized = normalizeExternalEvent({
      external_source: 'ticketmaster',
      external_id: 'tm-1',
      external_url: null,
      title: 'Concert',
      category: 'Music',
      subcategory: 'Live',
      tags: ['night'],
      description: null,
      event_date: '2026-10-01',
      event_time: null,
      location_type: 'city',
      location_city: 'Budapest',
      location_address: null,
      location_free_text: null,
      location_lat: null,
      location_lon: null,
      price_min: null,
      price_max: null,
      currency: null,
      is_free: null,
      max_attendees: null,
      image_url: null,
      organizer_name: null,
      source_payload: { secret_provider_shape: true },
      source_last_synced_at: '2026-08-23T00:00:00.000Z',
    });
    expect(normalized).toEqual(expect.objectContaining({
      id: 'ticketmaster-tm-1',
      provider: 'ticketmaster',
      category: 'Live',
      sourceLabel: 'Ticketmaster',
    }));
    expect(normalized).not.toHaveProperty('source_payload');
  });

  it('normalizes DB provider rows and preserves the selected projection and timing evidence', () => {
    const normalized = normalizeDbQueryResult({
      results: [{ provider: 'db', external_id: '1', name: 'Alpha', city: 'Budapest', latitude: 47, longitude: 19 }],
      rows: [{ id: '1', name: 'Alpha', city: 'Budapest' }],
      columns: ['id', 'name', 'city'],
      totalCount: 4,
      debug: { response_ms: 42 },
    }, ['id'], 'kávé', 'catering.cafe', 70);

    expect(normalized.columns).toEqual(['id', 'name', 'city']);
    expect(normalized.rows).toEqual([{ id: '1', name: 'Alpha', city: 'Budapest' }]);
    expect(normalized.totalCount).toBe(4);
    expect(normalized.responseMs).toBe(42);
    expect(normalized.debug).toEqual(expect.objectContaining({
      requested_category: 'kávé',
      mapped_category: 'catering.cafe',
      frontend_response_ms: 70,
    }));
  });

  it('keeps column filters frontend-only and conjunctive', () => {
    const rows = [
      { name: 'Alpha Café', city: 'Budapest' },
      { name: 'Beta Park', city: 'Budapest' },
      { name: 'Alpha Hall', city: 'Pécs' },
    ];
    expect(filterDbRows(rows, { name: 'alpha', city: 'budapest' })).toEqual([rows[0]]);
    expect(filterDbRows(rows, { name: '', city: '' })).toEqual(rows);
  });
});
