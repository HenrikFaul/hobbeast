import { describe, expect, it } from 'vitest';
import {
  PLACE_SEARCH_ADMIN_ACTIONS,
  PlaceSearchContractError,
  normalizePlaceSearchBody,
  parsePlaceSearchRequest,
} from '../../../supabase/functions/place-search/requestContract';

describe('place-search Edge request contract', () => {
  it('defaults to autocomplete and clamps the provider limit', () => {
    expect(normalizePlaceSearchBody({ query: '  Budapest  ', limit: 500 })).toMatchObject({
      action: 'autocomplete',
      query: 'Budapest',
      limit: 80,
    });
  });

  it('rejects unsupported actions and invalid coordinates', () => {
    expect(() => normalizePlaceSearchBody({ action: 'raw_sql' })).toThrow(PlaceSearchContractError);
    expect(() => normalizePlaceSearchBody({ action: 'reverse', lat: 91, lon: 19 })).toThrow(/lat/);
  });

  it('rejects unknown and action-incompatible fields instead of forwarding them', () => {
    expect(() => normalizePlaceSearchBody({ query: 'Budapest', raw_sql: 'select 1' })).toThrow(/Unsupported place-search field/);
    expect(() => normalizePlaceSearchBody({ action: 'get_all_provider_configs', query: 'leak' })).toThrow(/not allowed/);
    expect(() => normalizePlaceSearchBody({ action: 'reverse', lat: 47.5, lon: 19.1, provider: 'db:any' })).toThrow(/not allowed/);
  });

  it('validates provider, group, table and nested table configuration allowlists', () => {
    expect(() => normalizePlaceSearchBody({ action: 'save_provider_config', group: 'root', provider: 'aws' })).toThrow(/group/);
    expect(() => normalizePlaceSearchBody({ action: 'save_provider_config', group: 'venue', provider: 'shell' })).toThrow(/provider/);
    expect(() => normalizePlaceSearchBody({
      action: 'save_db_table_config',
      tables: [{ table: 'public.profiles', label: 'Profiles' }],
    })).toThrow(/geodata table/);
    expect(() => normalizePlaceSearchBody({
      action: 'save_db_table_config',
      tables: [{ table: 'public.unified_pois', provider: 'db:unified', label: 'Unified', secret: 'nope' }],
    })).toThrow(/Unsupported tables/);
  });

  it('returns only normalized allowlisted values', () => {
    expect(normalizePlaceSearchBody({
      action: 'autocomplete',
      query: '  kávézó ',
      bias: { lat: 47.5, lon: 19.05 },
      provider_mode: 'geoapify_tomtom',
      group: 'venue',
      open_now: true,
    })).toEqual({
      action: 'autocomplete',
      query: 'kávézó',
      category: undefined,
      categories: undefined,
      activityHint: undefined,
      city: undefined,
      source: undefined,
      table: undefined,
      label: undefined,
      tables: undefined,
      limit: undefined,
      lat: undefined,
      lon: undefined,
      latitude: undefined,
      longitude: undefined,
      bias: { lat: 47.5, lon: 19.05 },
      radius_km: undefined,
      open_now: true,
      lenient: undefined,
      provider_mode: 'geoapify_tomtom',
      columns: undefined,
      group: 'venue',
      provider: undefined,
    });
  });

  it('keeps every configuration or raw-table action behind the admin boundary', () => {
    expect([...PLACE_SEARCH_ADMIN_ACTIONS].sort()).toEqual([
      'discover_db_table_facets',
      'get_all_provider_configs',
      'get_db_table_config',
      'save_db_table_config',
      'save_provider_config',
      'test_db_table_query',
    ]);
  });

  it('returns a controlled 400-class error for malformed JSON', async () => {
    await expect(parsePlaceSearchRequest(new Request('https://example.test', {
      method: 'POST',
      body: '{broken',
    }))).rejects.toMatchObject({ status: 400, message: 'Malformed JSON body' });
  });
});
