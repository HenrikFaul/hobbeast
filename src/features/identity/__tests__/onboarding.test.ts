import { describe, expect, it } from 'vitest';
import {
  boundedResumeStep,
  buildAvailabilityWindow,
  canSkipOnboardingStep,
  toggleBoundedChoice,
  validateOnboardingStep,
} from '../onboarding';

const validDraft = {
  displayName: 'Nóra',
  city: 'Budapest',
  hobbies: ['Túrázás', 'Futás', 'Fotózás'],
  activityModes: ['in_person'],
  privacyAccepted: true,
};

describe('progressive onboarding contract', () => {
  it('requires only a display identity on the first step; coarse city remains optional', () => {
    expect(validateOnboardingStep(0, { ...validDraft, displayName: '', city: '' })).toHaveLength(1);
    expect(validateOnboardingStep(0, { ...validDraft, city: '' })).toEqual([]);
    expect(validateOnboardingStep(0, validDraft)).toEqual([]);
  });

  it('allows interests to be completed later and enforces only the upper boundary', () => {
    expect(validateOnboardingStep(1, { ...validDraft, hobbies: [] })).toEqual([]);
    expect(validateOnboardingStep(1, { ...validDraft, hobbies: Array.from({ length: 11 }, (_, i) => `h${i}`) })[0]).toContain('Legfeljebb 10');
  });

  it('marks enrichment steps as skippable without making privacy consent optional', () => {
    expect(canSkipOnboardingStep(0)).toBe(false);
    expect(canSkipOnboardingStep(1)).toBe(true);
    expect(canSkipOnboardingStep(2)).toBe(true);
    expect(canSkipOnboardingStep(3)).toBe(true);
    expect(canSkipOnboardingStep(4)).toBe(false);
  });

  it('normalizes optional availability without inventing invalid time windows', () => {
    expect(buildAvailabilityWindow(['sat', 'sat', 'sun'], '09:00', '13:30')).toEqual({
      days: ['sat', 'sun'],
      from: '09:00',
      to: '13:30',
    });
    expect(buildAvailabilityWindow([], '09:00', '13:30')).toEqual({});
    expect(buildAvailabilityWindow(['sat'], '99:00', '')).toEqual({ days: ['sat'] });
  });

  it('requires explicit privacy consent only on completion', () => {
    expect(validateOnboardingStep(3, { ...validDraft, privacyAccepted: false })).toEqual([]);
    expect(validateOnboardingStep(4, { ...validDraft, privacyAccepted: false })).toHaveLength(1);
  });

  it('bounds persisted resume steps', () => {
    expect(boundedResumeStep(-5)).toBe(0);
    expect(boundedResumeStep(99)).toBe(4);
  });

  it('does not silently exceed a bounded selection', () => {
    expect(toggleBoundedChoice(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleBoundedChoice(['a', 'b'], 'a', 2)).toEqual(['b']);
  });
});
