export const PRODUCTION_FEATURE_FLAGS = [
  'connections',
  'circles',
  'hub2',
  'ai_proposals',
  'new_recommender',
  'moderation',
  'analytics',
  'organizer_pro',
  'promoted_experiences',
] as const;

export type ProductionFeatureFlag = (typeof PRODUCTION_FEATURE_FLAGS)[number];

export interface FeatureFlagSnapshot {
  key: ProductionFeatureFlag;
  enabled: boolean;
  rolloutPercentage: number;
  cohorts: readonly string[];
  eligibilityRule?: Readonly<Record<string, unknown>>;
  expiresAt?: string | null;
}

function stableBucket(subject: string, key: string): number {
  let hash = 2166136261;
  const input = `${key}:${subject}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function evaluateFeatureFlag(
  flag: FeatureFlagSnapshot | null | undefined,
  context: { subjectId: string; cohort?: string; now?: Date },
): boolean {
  if (!flag?.enabled) return false;
  const now = context.now || new Date();
  if (flag.expiresAt && Date.parse(flag.expiresAt) <= now.getTime()) return false;
  if (flag.cohorts.length > 0 && (!context.cohort || !flag.cohorts.includes(context.cohort))) return false;
  if (flag.eligibilityRule && Object.keys(flag.eligibilityRule).length > 0) return false;
  const percentage = Math.max(0, Math.min(100, Math.floor(flag.rolloutPercentage)));
  return percentage === 100 || stableBucket(context.subjectId, flag.key) < percentage;
}
