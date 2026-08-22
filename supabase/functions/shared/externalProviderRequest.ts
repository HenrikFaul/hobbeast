export type ExternalProviderRequestName = 'ticketmaster' | 'seatgeek';
export type ExternalProviderRequestAction = 'search_preview' | 'sync';

export interface TicketmasterProviderParams {
  countryCode?: string;
  city?: string;
  localStartDateTime?: string;
  classificationName?: string;
  keyword?: string;
  size?: number;
  page?: number;
  source?: string;
  maxPages?: number;
}

export interface SeatGeekProviderParams {
  q?: string;
  venueCity?: string;
  datetimeUtcGte?: string;
  taxonomyName?: string;
  perPage?: number;
  page?: number;
  lat?: number;
  lon?: number;
  range?: string;
  maxPages?: number;
}

interface ProviderParamsByName {
  ticketmaster: TicketmasterProviderParams;
  seatgeek: SeatGeekProviderParams;
}

export class ExternalProviderRequestError extends Error {
  constructor(readonly code: 'REQUEST_TOO_LARGE' | 'REQUEST_INVALID_JSON' | 'REQUEST_INVALID_SHAPE' | 'REQUEST_UNKNOWN_FIELD' | 'REQUEST_INVALID_VALUE') {
    super(code);
    this.name = 'ExternalProviderRequestError';
  }
}

const MAX_BODY_BYTES = 16 * 1024;
const TOP_LEVEL_FIELDS = new Set(['action', 'params']);
const PARAM_FIELDS: Record<ExternalProviderRequestName, Set<string>> = {
  ticketmaster: new Set(['countryCode', 'city', 'localStartDateTime', 'classificationName', 'keyword', 'size', 'page', 'source', 'maxPages']),
  seatgeek: new Set(['q', 'venueCity', 'datetimeUtcGte', 'taxonomyName', 'perPage', 'page', 'lat', 'lon', 'range', 'maxPages']),
};

function objectRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExternalProviderRequestError('REQUEST_INVALID_SHAPE');
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, maximumLength: number, pattern?: RegExp) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ExternalProviderRequestError('REQUEST_INVALID_VALUE');
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || (pattern && !pattern.test(normalized))) {
    throw new ExternalProviderRequestError('REQUEST_INVALID_VALUE');
  }
  return normalized;
}

function optionalNumber(value: unknown, minimum: number, maximum: number, integer = true) {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < minimum || value > maximum) {
    throw new ExternalProviderRequestError('REQUEST_INVALID_VALUE');
  }
  return value;
}

function validateParams(provider: 'ticketmaster', raw: Record<string, unknown>): TicketmasterProviderParams;
function validateParams(provider: 'seatgeek', raw: Record<string, unknown>): SeatGeekProviderParams;
function validateParams(provider: ExternalProviderRequestName, raw: Record<string, unknown>) {
  for (const key of Object.keys(raw)) {
    if (!PARAM_FIELDS[provider].has(key)) throw new ExternalProviderRequestError('REQUEST_UNKNOWN_FIELD');
  }
  if (provider === 'ticketmaster') {
    return {
      countryCode: optionalString(raw.countryCode, 2, /^[A-Z]{2}$/),
      city: optionalString(raw.city, 120),
      localStartDateTime: optionalString(raw.localStartDateTime, 40, /^\d{4}-\d{2}-\d{2}T/),
      classificationName: optionalString(raw.classificationName, 100),
      keyword: optionalString(raw.keyword, 160),
      size: optionalNumber(raw.size, 1, 100),
      page: optionalNumber(raw.page, 0, 50),
      source: optionalString(raw.source, 80),
      maxPages: optionalNumber(raw.maxPages, 1, 5),
    };
  }
  return {
    q: optionalString(raw.q, 160),
    venueCity: optionalString(raw.venueCity, 120),
    datetimeUtcGte: optionalString(raw.datetimeUtcGte, 40, /^\d{4}-\d{2}-\d{2}T/),
    taxonomyName: optionalString(raw.taxonomyName, 100),
    perPage: optionalNumber(raw.perPage, 1, 100),
    page: optionalNumber(raw.page, 1, 50),
    lat: optionalNumber(raw.lat, -90, 90, false),
    lon: optionalNumber(raw.lon, -180, 180, false),
    range: optionalString(raw.range, 20, /^\d+(mi|km)$/),
    maxPages: optionalNumber(raw.maxPages, 1, 5),
  };
}

export async function parseExternalProviderRequest<P extends ExternalProviderRequestName>(
  request: Request,
  provider: P,
): Promise<{ action: ExternalProviderRequestAction; params: ProviderParamsByName[P] }> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new ExternalProviderRequestError('REQUEST_TOO_LARGE');
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new ExternalProviderRequestError('REQUEST_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new ExternalProviderRequestError('REQUEST_INVALID_JSON');
  }
  const body = objectRecord(parsed);
  for (const key of Object.keys(body)) {
    if (!TOP_LEVEL_FIELDS.has(key)) throw new ExternalProviderRequestError('REQUEST_UNKNOWN_FIELD');
  }
  const action = body.action === undefined ? 'search_preview' : body.action;
  if (action !== 'search_preview' && action !== 'sync') throw new ExternalProviderRequestError('REQUEST_INVALID_VALUE');
  const params = body.params === undefined ? {} : objectRecord(body.params);
  return { action, params: validateParams(provider, params) as ProviderParamsByName[P] };
}
