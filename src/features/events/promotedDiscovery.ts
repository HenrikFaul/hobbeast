import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface PromotedExperienceRow {
  eventId: string;
  disclosureLabel: string;
  qualityScore: number;
  relevanceScore: number;
  startsAt: string;
  endsAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const promotedQueryClient = supabase as unknown as SupabaseClient;

function score(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}

export function normalizePromotedExperienceRows(value: unknown): PromotedExperienceRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.event_id !== 'string' || !UUID_PATTERN.test(row.event_id)) return [];
    if (row.disclosure_label !== 'Promoted') return [];
    if (typeof row.starts_at !== 'string' || Number.isNaN(Date.parse(row.starts_at))) return [];
    if (typeof row.ends_at !== 'string' || Number.isNaN(Date.parse(row.ends_at))) return [];
    return [{
      eventId: row.event_id,
      disclosureLabel: 'Promoted',
      qualityScore: score(row.quality_score),
      relevanceScore: score(row.relevance_score),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    }];
  });
}

export async function loadPromotedExperienceRows(eventIds: string[]) {
  const candidateIds = [...new Set(eventIds.filter((eventId) => UUID_PATTERN.test(eventId)))].slice(0, 200);
  if (candidateIds.length === 0) return [];
  const { data, error } = await promotedQueryClient
    .from('promoted_experience_candidates')
    .select('event_id,disclosure_label,quality_score,relevance_score,starts_at,ends_at')
    .in('event_id', candidateIds);
  if (error) throw new Error('PROMOTED_CONTENT_UNAVAILABLE');
  return normalizePromotedExperienceRows(data);
}
