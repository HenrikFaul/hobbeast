import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  allVisibleProfilesSelected,
  applyClientBulkFilters,
  buildBulkConfirmation,
  buildUserHubMap,
  filterProfiles,
  hasServerBulkFilters,
  mergePreviewSelection,
  selectedProfilesAreGeneratedOnly,
  toggleVisibleProfileSelection,
  type ProfileRow,
  type VirtualHub,
} from './domain';

const profiles: ProfileRow[] = [
  {
    id: 'profile-real',
    user_id: 'user-real',
    display_name: 'Anna Futó',
    city: 'Budapest',
    district: null,
    hobbies: ['Futás', 'Kávé'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    avatar_url: null,
    bio: null,
    gender: null,
    age_band: '25–34',
    preferred_radius_km: 10,
    user_origin: 'real',
    is_active: true,
  },
  {
    id: 'profile-generated',
    user_id: 'user-generated',
    display_name: 'Béla Túrázó',
    city: 'Pécs',
    district: null,
    hobbies: ['Túrázás'],
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-02-02T00:00:00.000Z',
    avatar_url: null,
    bio: null,
    gender: null,
    age_band: null,
    preferred_radius_km: null,
    user_origin: 'generated',
    is_active: false,
  },
];

const hubs: VirtualHub[] = [{
  id: 'hub-running',
  hobby_category: 'Esti futók',
  city: 'Budapest',
  member_count: 2,
  created_at: '2026-01-03T00:00:00.000Z',
}];

describe('AdminUsers domain characterization', () => {
  const userHubMap = buildUserHubMap(hubs, {
    'user-real': [{ hub_id: 'hub-running' }, { hub_id: 'missing-hub' }],
  });

  it('keeps name, city, hobby, origin and Hub text in one case-insensitive search surface', () => {
    expect(filterProfiles(profiles, 'anna', userHubMap).map((profile) => profile.id)).toEqual(['profile-real']);
    expect(filterProfiles(profiles, 'pécs', userHubMap).map((profile) => profile.id)).toEqual(['profile-generated']);
    expect(filterProfiles(profiles, 'KÁVÉ', userHubMap).map((profile) => profile.id)).toEqual(['profile-real']);
    expect(filterProfiles(profiles, 'esti futók', userHubMap).map((profile) => profile.id)).toEqual(['profile-real']);
    expect(filterProfiles(profiles, 'generated', userHubMap).map((profile) => profile.id)).toEqual(['profile-generated']);
  });

  it('keeps select-all scoped to currently visible profiles without mutating the previous selection', () => {
    const initial = new Set(['outside-page']);
    const selected = toggleVisibleProfileSelection(initial, profiles, true);
    expect([...selected]).toEqual(['outside-page', 'user-real', 'user-generated']);
    expect([...initial]).toEqual(['outside-page']);
    expect(allVisibleProfilesSelected(profiles, selected)).toBe(true);
    expect([...toggleVisibleProfileSelection(selected, [profiles[0]], false)]).toEqual(['outside-page', 'user-generated']);
  });

  it('allows destructive bulk action only when the selected profiles are generated', () => {
    expect(selectedProfilesAreGeneratedOnly(profiles, new Set(['user-generated']))).toBe(true);
    expect(selectedProfilesAreGeneratedOnly(profiles, new Set(['user-real', 'user-generated']))).toBe(false);
    expect(selectedProfilesAreGeneratedOnly(profiles, new Set())).toBe(false);
  });

  it('preserves exact confirmation phrases for destructive and state-change actions', () => {
    expect(buildBulkConfirmation('delete', 2)).toBe('DELETE 2 GENERATED USERS');
    expect(buildBulkConfirmation('activate', 3)).toBe('ACTIVATE 3 USERS');
    expect(buildBulkConfirmation('deactivate', 1)).toBe('DEACTIVATE 1 USERS');
    expect(buildBulkConfirmation(null, 0)).toBe('');
  });

  it('merges server user/profile matches before applying hobby and Hub intersections', () => {
    const merged = mergePreviewSelection(profiles, ['profile-real'], ['user-generated']);
    expect([...merged]).toEqual(['user-generated', 'user-real']);

    const hobbyOnly = applyClientBulkFilters(merged, profiles, userHubMap, {
      ...EMPTY_FILTERS,
      hobbyFilter: 'fut',
    });
    expect([...hobbyOnly]).toEqual(['user-real']);

    const hubOnly = applyClientBulkFilters(merged, profiles, userHubMap, {
      ...EMPTY_FILTERS,
      hubFilter: 'budapest',
    });
    expect([...hubOnly]).toEqual(['user-real']);
  });

  it('routes only server-owned criteria to preview while hobby and Hub filters stay local', () => {
    expect(hasServerBulkFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasServerBulkFilters({ ...EMPTY_FILTERS, hobbyFilter: 'futás', hubFilter: 'Budapest' })).toBe(false);
    expect(hasServerBulkFilters({ ...EMPTY_FILTERS, userType: 'generated' })).toBe(true);
    expect(hasServerBulkFilters({ ...EMPTY_FILTERS, inactiveDays: '40' })).toBe(true);
  });
});
