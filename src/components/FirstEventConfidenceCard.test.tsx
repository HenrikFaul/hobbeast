import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstEventConfidenceCard } from './FirstEventConfidenceCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const loadMyFirstEventConfidence = vi.fn();
const saveMyFirstEventConfidence = vi.fn();

vi.mock('@/features/identity/privacyRuntimeRepository', () => ({
  loadMyFirstEventConfidence: (...args: unknown[]) => loadMyFirstEventConfidence(...args),
  saveMyFirstEventConfidence: (...args: unknown[]) => saveMyFirstEventConfidence(...args),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  loadMyFirstEventConfidence.mockReset();
  saveMyFirstEventConfidence.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent?.includes(label));
}

describe('FirstEventConfidenceCard', () => {
  it('loads an optional private-by-default confidence profile', async () => {
    loadMyFirstEventConfidence.mockResolvedValue({
      data: {
        preferred_event_formats: ['guided_beginner'],
        beginner_friendly: true,
        solo_arrival_comfort: 'prefer_buddy',
        preferred_group_size: 'small',
        accessibility_needs: 'Lépcsőmentes bejárat',
        communication_preference: 'minimal',
        visibility: 'private',
        updated_at: '2026-08-23T09:00:00Z',
      },
      error: null,
    });
    await act(async () => {
      root.render(<FirstEventConfidenceCard />);
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('Vezetett kezdő alkalom');
    expect(document.body.textContent).toContain('Csak te látod');
    expect(button('Mentés')?.type).toBe('button');
    expect(button('Opcionális adatok törlése')?.type).toBe('button');
  });

  it('shows a retry state instead of silently failing', async () => {
    loadMyFirstEventConfidence.mockResolvedValue({ data: null, error: { code: 'PGRST301' } });
    await act(async () => {
      root.render(<FirstEventConfidenceCard />);
      await Promise.resolve();
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('most nem tölthetők be');
    expect(button('Újrapróbálom')).toBeDefined();
  });
});
