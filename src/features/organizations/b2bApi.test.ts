import { describe, it, expect } from 'vitest';
import {
  ERROR_CATEGORIES,
  errorBody,
  openapiDocument,
} from '../../../supabase/functions/api-b2b/openapi.ts';

/**
 * The B2B API's OpenAPI 3.1 document and canonical error envelope are the
 * contract the APIMaster / SwaggerMaster workbench imports and grades. These
 * tests pin the parts that matter to that grader — the security scheme, the
 * category enum, and a description on every operation and parameter (the
 * weakness classifier flags anything vague) — so the spec cannot silently drift.
 */

const BASE = 'https://example.test/functions/v1/api-b2b';
const doc = openapiDocument(BASE);

interface Operation {
  operationId: string;
  summary: string;
  description: string;
  parameters?: Array<{ name: string; description?: string; schema?: unknown }>;
  responses: Record<string, { content: Record<string, { schema: { $ref?: string } }> }>;
}

const operations = (): Operation[] =>
  Object.values(doc.paths).flatMap(
    (item) => Object.values(item as unknown as Record<string, Operation>),
  );

describe('OpenAPI document', () => {
  it('declares OpenAPI 3.1 with a titled, versioned info block', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Hobbeast Organizer API');
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(doc.servers[0].url).toBe(BASE);
  });

  it('authenticates with the x-api-key header and applies it globally', () => {
    expect(doc.components.securitySchemes.apiKey).toEqual({
      type: 'apiKey', name: 'x-api-key', in: 'header',
      description: expect.stringContaining('hbk_live_'),
    });
    expect(doc.security).toEqual([{ apiKey: [] }]);
  });

  it('pins the canonical error category enum on the Error schema', () => {
    const category = doc.components.schemas.Error.properties.error.properties.category;
    expect(category.enum).toEqual([...ERROR_CATEGORIES]);
  });

  it('gives every operation an operationId, a summary and a description', () => {
    const ops = operations();
    expect(ops.length).toBeGreaterThanOrEqual(4);
    for (const op of ops) {
      expect(op.operationId, 'operationId').toBeTruthy();
      expect(op.summary, `summary for ${op.operationId}`).toBeTruthy();
      expect(op.description, `description for ${op.operationId}`).toBeTruthy();
    }
  });

  it('describes every parameter (APIMaster flags vague params)', () => {
    const params = operations().flatMap((op) => op.parameters ?? []);
    for (const param of params) {
      expect(param.description, `description for param ${param.name}`).toBeTruthy();
      expect(param.schema, `schema for param ${param.name}`).toBeTruthy();
    }
  });

  it('maps each operation to a 401 that references the Error schema', () => {
    for (const op of operations()) {
      expect(op.responses['401'].content['application/json'].schema.$ref)
        .toBe('#/components/schemas/Error');
    }
  });
});

describe('error envelope', () => {
  it('marks 5xx and 429 retryable, and 4xx not', () => {
    expect(errorBody('X', 500, 'technical', 'boom', 't').error.retryable).toBe(true);
    expect(errorBody('X', 429, 'rate_limit', 'slow down', 't').error.retryable).toBe(true);
    expect(errorBody('X', 401, 'auth', 'nope', 't').error.retryable).toBe(false);
    expect(errorBody('X', 422, 'validation', 'bad', 't').error.retryable).toBe(false);
  });

  it('carries the machine-readable fields APIMaster expects', () => {
    const body = errorBody('INVALID_DATE', 422, 'validation', 'The event date must be today or later.', 'trace-1');
    expect(body.error).toMatchObject({
      code: 'INVALID_DATE', httpStatus: 422, category: 'validation', traceId: 'trace-1',
    });
    expect(ERROR_CATEGORIES).toContain(body.error.category);
  });

  it('merges extra fields like retryAfterSec', () => {
    const body = errorBody('RATE', 429, 'rate_limit', 'slow', 't', { retryAfterSec: 30 });
    expect((body.error as { retryAfterSec?: number }).retryAfterSec).toBe(30);
  });
});
