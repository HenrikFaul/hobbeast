// Pure builders for the Hobbeast B2B API — no Deno APIs, so both the edge
// function (index.ts) and the vitest suite import this file. The OpenAPI 3.1
// document and the canonical error envelope are the contract the APIMaster /
// SwaggerMaster workbench (C:\Work\api-workbench-pro) imports and validates, so
// they are unit-tested rather than left to drift.

export const ERROR_CATEGORIES = ['business', 'technical', 'validation', 'auth', 'rate_limit', 'dependency'] as const;
export type ErrorCategory = typeof ERROR_CATEGORIES[number];

/** The canonical error envelope body (without the transport status code). */
export function errorBody(
  code: string, httpStatus: number, category: ErrorCategory, message: string,
  traceId: string, extra: Record<string, unknown> = {},
) {
  return {
    error: {
      code, httpStatus, category, message,
      retryable: httpStatus >= 500 || httpStatus === 429,
      traceId, ...extra,
    },
  };
}

/** The rich OpenAPI 3.1 document — the thing SwaggerMaster imports by URL. */
export function openapiDocument(base: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Hobbeast Organizer API',
      version: '1.0.0',
      description: 'A Hobbeast B2B API lets a verified organization read and publish its own events programmatically. Authenticate every request with the `x-api-key` header (mint a key in the Hobbeast organization settings). All responses are JSON; errors use the canonical envelope with a machine-readable `code` and `category`.',
      contact: { name: 'Hobbeast', url: 'https://expericentre.com' },
    },
    servers: [{ url: base, description: 'Production' }],
    tags: [
      { name: 'Organization', description: 'The organization the key belongs to.' },
      { name: 'Events', description: 'Read and publish the organization\u2019s events.' },
    ],
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', name: 'x-api-key', in: 'header', description: 'An organization API key, prefixed `hbk_live_`.' },
      },
      schemas: {
        Error: {
          type: 'object',
          description: 'The canonical error envelope returned for every non-2xx response. `code` is a stable machine-readable string, `category` groups the failure, and `traceId` correlates it with the server logs.',
          required: ['error'],
          example: {
            error: {
              code: 'INVALID_DATE', httpStatus: 422, category: 'validation',
              message: 'The event date must be today or later.', retryable: false,
              traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d',
            },
          },
          properties: {
            error: {
              type: 'object',
              required: ['code', 'httpStatus', 'category', 'message', 'retryable', 'traceId'],
              properties: {
                code: { type: 'string', example: 'INVALID_DATE' },
                httpStatus: { type: 'integer', example: 422 },
                category: { type: 'string', enum: ERROR_CATEGORIES, example: 'validation' },
                message: { type: 'string', example: 'The event date must be today or later.' },
                retryable: { type: 'boolean', example: false },
                retryAfterSec: { type: 'integer', example: 30 },
                traceId: { type: 'string', format: 'uuid', example: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' },
              },
            },
          },
        },
        Organization: {
          type: 'object',
          description: 'A verified organization on Hobbeast — the brand events are published under.',
          example: { id: '3f1a…', name: 'Budapesti Túraklub', slug: 'budapesti-turaklub', verification_status: 'verified', follower_count: 842 },
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Budapesti Túraklub' },
            slug: { type: 'string', example: 'budapesti-turaklub' },
            verification_status: { type: 'string', enum: ['none', 'pending', 'verified', 'rejected'], example: 'verified' },
            follower_count: { type: 'integer', example: 842 },
          },
        },
        Event: {
          type: 'object',
          description: 'An event published under the organization, as returned by the read endpoints.',
          example: { id: '9c2e…', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', event_date: '2026-09-14', event_time: '08:00', city: 'Budapest', max_attendees: 40, status: 'published', url: 'https://expericentre.com/events/9c2e…' },
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', example: 'Vasárnapi futóklub a Városligetben' },
            category: { type: 'string', example: 'Sport' },
            description: { type: 'string', nullable: true },
            event_date: { type: 'string', format: 'date', example: '2026-09-14' },
            event_time: { type: 'string', nullable: true, example: '08:00' },
            city: { type: 'string', nullable: true, example: 'Budapest' },
            address: { type: 'string', nullable: true },
            max_attendees: { type: 'integer', nullable: true, example: 40 },
            status: { type: 'string', enum: ['draft', 'published', 'full', 'started', 'completed', 'cancelled'], example: 'published' },
            url: { type: 'string', format: 'uri', example: 'https://expericentre.com/events/…' },
          },
        },
        NewEvent: {
          type: 'object',
          description: 'The payload for publishing a new event. Only title and event_date are required; the rest are optional.',
          required: ['title', 'event_date'],
          example: { title: 'Őszi tárlatmegnyitó', category: 'Kultúra', event_date: '2026-10-03', event_time: '18:00', city: 'Budapest', address: 'Kazinczy utca 12.', max_attendees: 60, emoji: '🎨' },
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200, example: 'Őszi tárlatmegnyitó' },
            category: { type: 'string', example: 'Kultúra' },
            description: { type: 'string', example: 'Szeretettel várunk mindenkit a megnyitóra.' },
            event_date: { type: 'string', format: 'date', example: '2026-10-03' },
            event_time: { type: 'string', example: '18:00' },
            city: { type: 'string', example: 'Budapest' },
            address: { type: 'string', example: 'Kazinczy utca 12.' },
            max_attendees: { type: 'integer', example: 60 },
            emoji: { type: 'string', example: '🎨' },
          },
        },
      },
    },
    security: [{ apiKey: [] }],
    paths: {
      '/v1/organization': {
        get: {
          tags: ['Organization'], operationId: 'getOrganization',
          summary: 'The organization this key belongs to',
          description: 'Returns the organization the presented API key is scoped to.',
          responses: {
            200: { description: 'The organization.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Organization' }, example: { id: '3f1a…', name: 'Budapesti Túraklub', slug: 'budapesti-turaklub', verification_status: 'verified', follower_count: 842 } } } },
            401: { description: 'Missing or invalid API key.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'API_KEY_INVALID', httpStatus: 401, category: 'auth', message: 'That API key is not recognised or has been revoked.', retryable: false, traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' } } } } },
          },
        },
      },
      '/v1/events': {
        get: {
          tags: ['Events'], operationId: 'listEvents',
          summary: 'List the organization\u2019s events',
          description: 'Returns the events published under this organization, soonest first.',
          parameters: [
            { name: 'from', in: 'query', required: false, description: 'Only events on or after this date (YYYY-MM-DD).', schema: { type: 'string', format: 'date' } },
            { name: 'limit', in: 'query', required: false, description: 'Maximum number of events (1–200).', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          ],
          responses: {
            200: { description: 'A list of events.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Event' } } } }, example: { data: [{ id: '9c2e…', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', event_date: '2026-09-14', event_time: '08:00', city: 'Budapest', max_attendees: 40, status: 'published', url: 'https://expericentre.com/events/9c2e…' }] } } } },
            401: { description: 'Missing or invalid API key.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'API_KEY_REQUIRED', httpStatus: 401, category: 'auth', message: 'Provide your organization API key in the x-api-key header.', retryable: false, traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' } } } } },
          },
        },
        post: {
          tags: ['Events'], operationId: 'createEvent',
          summary: 'Publish a new event',
          description: 'Publishes an event under the organization. Pass an `Idempotency-Key` header to make a retried request safe — the same key returns the same event instead of creating a second one.',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, description: 'A unique key per logical create, so a retry does not duplicate.', schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewEvent' }, example: { title: 'Őszi tárlatmegnyitó', category: 'Kultúra', event_date: '2026-10-03', event_time: '18:00', city: 'Budapest' } } } },
          responses: {
            201: { description: 'The created event.', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, replayed: { type: 'boolean' }, url: { type: 'string', format: 'uri' } } }, example: { id: '9c2e…', replayed: false, url: 'https://expericentre.com/events/9c2e…' } } } },
            422: { description: 'The event failed validation.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'INVALID_DATE', httpStatus: 422, category: 'validation', message: 'The event date must be today or later.', retryable: false, traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' } } } } },
            401: { description: 'Missing or invalid API key.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'API_KEY_INVALID', httpStatus: 401, category: 'auth', message: 'That API key is not recognised or has been revoked.', retryable: false, traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' } } } } },
          },
        },
      },
      '/v1/events/{id}': {
        get: {
          tags: ['Events'], operationId: 'getEvent',
          summary: 'Get one event',
          description: 'Returns a single event that belongs to this organization, including its live participant count.',
          parameters: [{ name: 'id', in: 'path', required: true, description: 'The event id.', schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'The event.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Event' }, example: { id: '9c2e…', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', description: 'Közös kocogás minden szinten.', event_date: '2026-09-14', event_time: '08:00', city: 'Budapest', max_attendees: 40, status: 'published', participants: 12, url: 'https://expericentre.com/events/9c2e…' } } } },
            404: { description: 'No such event under this organization.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'EVENT_NOT_FOUND', httpStatus: 404, category: 'business', message: 'No such event under this organization.', retryable: false, traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' } } } } },
            401: { description: 'Missing or invalid API key.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'API_KEY_REQUIRED', httpStatus: 401, category: 'auth', message: 'Provide your organization API key in the x-api-key header.', retryable: false, traceId: '5b8e2c7a-1f3d-4a9b-8c2e-7d6f5a4b3c2d' } } } } },
          },
        },
      },
    },
  };
}
