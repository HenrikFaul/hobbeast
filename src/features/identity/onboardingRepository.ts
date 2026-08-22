import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { HobbyExperienceLevel } from './onboarding';

export interface OnboardingActivityOption {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
}

export interface PersistedOnboardingPreference {
  activity_id: string;
  activity_name: string;
  experience_level: HobbyExperienceLevel | null;
}

export interface OnboardingSavePayload {
  display_name: string;
  avatar_url: string | null;
  city: string;
  hobbies: string[];
  activity_modes: string[];
  availability_window: Record<string, unknown>;
  normalized_preferences: Array<{
    activity_id: string;
    experience_level: HobbyExperienceLevel | null;
  }>;
  beginner_friendly: boolean | null;
  solo_arrival_comfort: string;
  preferred_group_size: string;
  accessibility_needs: string;
  communication_preference: string;
  profile_visibility: string;
  interests_visibility: string;
  privacy_accepted: boolean;
  notification_consent: boolean;
}

interface OnboardingRpcResult {
  step: number;
  completed: boolean;
  normalized_preference_count: number;
  legacy_interest_count: number;
}

interface OnboardingRpcClient {
  rpc(
    name: 'save_my_onboarding_progress',
    args: { _payload: OnboardingSavePayload; _step: number; _complete: boolean },
  ): Promise<{ data: OnboardingRpcResult | null; error: PostgrestError | null }>;
  rpc(
    name: 'get_my_onboarding_preferences',
  ): Promise<{ data: PersistedOnboardingPreference[] | null; error: PostgrestError | null }>;
}

const onboardingRpcClient = supabase as unknown as OnboardingRpcClient;

export async function loadOnboardingCatalog(): Promise<OnboardingActivityOption[]> {
  const { data, error } = await supabase
    .from('hobby_activities')
    .select('id,name,slug,emoji')
    .eq('is_active', true)
    .order('sort_order')
    .limit(120);
  if (error) return [];
  return data;
}

export async function loadMyOnboardingPreferences(): Promise<PersistedOnboardingPreference[]> {
  const { data, error } = await onboardingRpcClient.rpc('get_my_onboarding_preferences');
  if (error) return [];
  return data || [];
}

export async function saveMyOnboardingProgress(
  payload: OnboardingSavePayload,
  step: number,
  complete: boolean,
) {
  return onboardingRpcClient.rpc('save_my_onboarding_progress', {
    _payload: payload,
    _step: step,
    _complete: complete,
  });
}

