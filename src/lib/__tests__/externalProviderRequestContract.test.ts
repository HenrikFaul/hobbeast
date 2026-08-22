import { describe, expect, it } from 'vitest';
import {
  ExternalProviderRequestError,
  parseExternalProviderRequest,
} from '../../../supabase/functions/shared/externalProviderRequest';

function request(body: unknown) {
  return new Request('https://example.invalid/sync', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('external provider request contract', () => {
  it('normalizes an allowlisted Ticketmaster sync request', async () => {
    await expect(parseExternalProviderRequest(request({
      action: 'sync', params: { countryCode: 'HU', city: 'Budapest', size: 50, page: 0, maxPages: 3 },
    }), 'ticketmaster')).resolves.toEqual({
      action: 'sync',
      params: { countryCode: 'HU', city: 'Budapest', size: 50, page: 0, maxPages: 3 },
    });
  });

  it('rejects unknown fields rather than forwarding them to a provider', async () => {
    await expect(parseExternalProviderRequest(request({
      action: 'sync', params: { city: 'Budapest', apiKey: 'must-not-pass' },
    }), 'ticketmaster')).rejects.toMatchObject<Partial<ExternalProviderRequestError>>({ code: 'REQUEST_UNKNOWN_FIELD' });
  });

  it('bounds SeatGeek coordinates, pages and distance syntax', async () => {
    await expect(parseExternalProviderRequest(request({ params: { lat: 91 } }), 'seatgeek'))
      .rejects.toMatchObject({ code: 'REQUEST_INVALID_VALUE' });
    await expect(parseExternalProviderRequest(request({ params: { range: '20km', page: 2, perPage: 25 } }), 'seatgeek'))
      .resolves.toMatchObject({ params: { range: '20km', page: 2, perPage: 25 } });
  });

  it('rejects malformed and oversized bodies', async () => {
    await expect(parseExternalProviderRequest(request('{broken'), 'ticketmaster'))
      .rejects.toMatchObject({ code: 'REQUEST_INVALID_JSON' });
    await expect(parseExternalProviderRequest(request({ params: { q: 'x'.repeat(17_000) } }), 'seatgeek'))
      .rejects.toMatchObject({ code: 'REQUEST_TOO_LARGE' });
  });
});
