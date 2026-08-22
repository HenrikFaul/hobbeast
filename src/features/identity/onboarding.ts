export const ONBOARDING_STEP_COUNT = 5;

export interface OnboardingDraft {
  displayName: string;
  city: string;
  hobbies: string[];
  activityModes: string[];
  privacyAccepted: boolean;
}

export type HobbyExperienceLevel = 'new' | 'beginner' | 'intermediate' | 'advanced';

export interface CanonicalHobbyPreference {
  activityId: string;
  label: string;
  experienceLevel: HobbyExperienceLevel | null;
}

export function validateOnboardingStep(step: number, draft: OnboardingDraft): string[] {
  if (step === 0) {
    return [
      ...(draft.displayName.trim().length < 2 ? ['Adj meg legalább két karakteres megjelenített nevet.'] : []),
    ];
  }
  if (step === 1) {
    if (draft.hobbies.length > 10) return ['Legfeljebb 10 érdeklődési kört válassz.'];
  }
  if (step === 4 && !draft.privacyAccepted) {
    return ['Az adatkezelési tájékoztató elfogadása szükséges a befejezéshez.'];
  }
  return [];
}

export function canSkipOnboardingStep(step: number): boolean {
  return step >= 1 && step <= 3;
}

export function buildAvailabilityWindow(
  days: string[],
  from: string,
  to: string,
): Record<string, unknown> {
  const normalizedDays = [...new Set(days.filter((day) => /^[a-z]{3}$/.test(day)))];
  if (normalizedDays.length === 0) return {};
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return {
    days: normalizedDays,
    ...(validTime(from) ? { from } : {}),
    ...(validTime(to) ? { to } : {}),
  };
}

export function boundedResumeStep(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(ONBOARDING_STEP_COUNT - 1, Math.trunc(value ?? 0)));
}

export function toggleBoundedChoice(values: string[], value: string, maximum: number): string[] {
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (values.length >= maximum) return values;
  return [...values, value];
}
