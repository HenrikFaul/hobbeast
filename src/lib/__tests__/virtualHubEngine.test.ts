import { describe, expect, it } from 'vitest';
import {
  buildVirtualHubIdentityKey,
  calculateVirtualHubDemandCounts,
  decorateVirtualHubsWithDemand,
  normalizeVirtualHubSegment,
  planVirtualHubMembershipReconciliation,
  profileMatchesVirtualHub,
} from '../../../supabase/functions/shared/virtualHubEngine';

const hub = {
  id: 'hub-1',
  hobby_category: 'Társasjáték',
  city: 'Budapest',
  member_count: 99,
};

describe('virtualHubEngine', () => {
  it('normalizes Unicode, casing and repeated whitespace deterministically', () => {
    expect(normalizeVirtualHubSegment('  TÁRSASJÁTÉK\t Klub  ')).toBe('társasjáték klub');
  });

  it('builds the same identity key for cosmetic text differences', () => {
    expect(buildVirtualHubIdentityKey(hub)).toBe(buildVirtualHubIdentityKey({
      hobby_category: ' társasjáték ',
      city: ' BUDAPEST ',
    }));
  });

  it('keeps category, subcategory, activity and city boundaries distinct', () => {
    const detailedHub = {
      hobby_category: 'Sport',
      hobby_subcategory: 'Labdajáték',
      hobby_activity: 'Kosárlabda',
      city: 'Budapest',
    };

    expect(buildVirtualHubIdentityKey(detailedHub)).not.toBe(buildVirtualHubIdentityKey({
      ...detailedHub,
      hobby_activity: 'Kézilabda',
    }));
    expect(buildVirtualHubIdentityKey(detailedHub)).not.toBe(buildVirtualHubIdentityKey({
      ...detailedHub,
      hobby_subcategory: 'Vízi sport',
    }));
    expect(buildVirtualHubIdentityKey(detailedHub)).not.toBe(buildVirtualHubIdentityKey({
      ...detailedHub,
      city: 'Szeged',
    }));
  });

  it('uses a stable no-city bucket instead of treating it as a public nationwide hub', () => {
    expect(buildVirtualHubIdentityKey({ hobby_category: 'Sakk', city: null }))
      .toBe(buildVirtualHubIdentityKey({ hobby_category: 'sakk', city: ' ' }));

    const [decorated] = decorateVirtualHubsWithDemand(
      [{ id: 'no-city', hobby_category: 'Sakk', city: null }],
      [{ hub_id: 'no-city', user_id: 'real-1' }],
      [{ user_id: 'real-1', user_origin: 'real' }],
      1,
    );
    expect(decorated.qualification_status).toBe('below_threshold');
    expect(decorated.qualification_reasons.join(' ')).toContain('named city');
  });

  it('deduplicates repeated membership rows before counting demand', () => {
    const counts = calculateVirtualHubDemandCounts(
      [
        { hub_id: 'hub-1', user_id: 'real-1' },
        { hub_id: 'hub-1', user_id: 'real-1' },
      ],
      [{ user_id: 'real-1', user_origin: 'real' }],
    ).get('hub-1');

    expect(counts).toEqual({
      real_member_count: 1,
      simulated_member_count: 0,
      unknown_origin_member_count: 0,
      total_member_count: 1,
    });
  });

  it('separates real, generated and unknown members', () => {
    const counts = calculateVirtualHubDemandCounts(
      [
        { hub_id: 'hub-1', user_id: 'real-1' },
        { hub_id: 'hub-1', user_id: 'generated-1' },
        { hub_id: 'hub-1', user_id: 'unknown-1' },
      ],
      [
        { user_id: 'real-1', user_origin: 'real' },
        { user_id: 'generated-1', user_origin: 'generated' },
      ],
    ).get('hub-1');

    expect(counts).toEqual({
      real_member_count: 1,
      simulated_member_count: 1,
      unknown_origin_member_count: 1,
      total_member_count: 3,
    });
  });

  it('qualifies on real demand only', () => {
    const [decorated] = decorateVirtualHubsWithDemand(
      [hub],
      [
        { hub_id: 'hub-1', user_id: 'real-1' },
        { hub_id: 'hub-1', user_id: 'generated-1' },
      ],
      [
        { user_id: 'real-1', user_origin: 'real' },
        { user_id: 'generated-1', user_origin: 'generated' },
      ],
      2,
    );

    expect(decorated.qualification_status).toBe('below_threshold');
    expect(decorated.demand_member_count).toBe(1);
    expect(decorated.total_member_count).toBe(2);
    expect(decorated.qualification_reasons.join(' ')).toContain('simulated members are excluded');
  });

  it('matches hobby and city case-insensitively', () => {
    expect(profileMatchesVirtualHub({
      user_id: 'real-1',
      hobbies: [' társasjáték '],
      city: 'BUDAPEST',
      user_origin: 'real',
    }, hub)).toBe(true);
  });

  it('does not treat a missing city as a match for a named city', () => {
    expect(profileMatchesVirtualHub({
      user_id: 'real-1',
      hobbies: ['Társasjáték'],
      city: null,
      user_origin: 'real',
    }, hub)).toBe(false);
  });

  it('plans only the required scoped membership changes', () => {
    const plan = planVirtualHubMembershipReconciliation(
      hub,
      [
        { user_id: 'real-1', hobbies: ['Társasjáték'], city: 'Budapest', user_origin: 'real' },
        { user_id: 'generated-1', hobbies: ['Társasjáték'], city: 'Budapest', user_origin: 'generated' },
        { user_id: 'other-city', hobbies: ['Társasjáték'], city: 'Szeged', user_origin: 'real' },
      ],
      ['real-1', 'stale-1'],
    );

    expect(plan.add_user_ids).toEqual(['generated-1']);
    expect(plan.keep_user_ids).toEqual(['real-1']);
    expect(plan.remove_user_ids).toEqual(['stale-1']);
    expect(plan.real_member_count).toBe(1);
    expect(plan.simulated_member_count).toBe(1);
    expect(plan.total_member_count).toBe(2);
  });

  it('is idempotent once the desired membership is already present', () => {
    const plan = planVirtualHubMembershipReconciliation(
      hub,
      [{ user_id: 'real-1', hobbies: ['Társasjáték'], city: 'Budapest', user_origin: 'real' }],
      ['real-1'],
    );

    expect(plan.add_user_ids).toEqual([]);
    expect(plan.remove_user_ids).toEqual([]);
    expect(plan.keep_user_ids).toEqual(['real-1']);
  });
});
