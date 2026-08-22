import { supabase } from '@/integrations/supabase/client';
import type { RecommendationSource } from '@/lib/recommendationEngine';

export async function setDiscoveryPreference(input: {
  canonicalIdentity: string;
  source: RecommendationSource;
  preference: 'less_like_this' | 'neutral';
}) {
  const { data, error } = await supabase.functions.invoke('discovery-feedback', {
    body: {
      action: 'set',
      canonical_identity: input.canonicalIdentity,
      candidate_source: input.source,
      preference: input.preference,
      idempotency_key: crypto.randomUUID(),
    },
  });
  if (error) throw new Error('DISCOVERY_FEEDBACK_FAILED');
  return data as { preference: { canonical_identity: string; preference: string; replayed: boolean } | null };
}

export async function getDiscoveryBootstrap() {
  const { data, error } = await supabase.functions.invoke('discovery-feedback', {
    body: { action: 'bootstrap' },
  });
  if (error) throw new Error('DISCOVERY_BOOTSTRAP_FAILED');
  const payload = data as {
    preferences?: Array<{
      canonical_identity: string;
      candidate_source: RecommendationSource;
      preference: 'less_like_this' | 'neutral';
    }>;
    new_recommender_enabled?: boolean;
  };
  return {
    preferences: payload.preferences ?? [],
    newRecommenderEnabled: payload.new_recommender_enabled === true,
  };
}
