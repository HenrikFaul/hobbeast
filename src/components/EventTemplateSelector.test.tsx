import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTemplateSelector } from './EventTemplateSelector';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' },
  load: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/features/organizer/eventTemplates', () => ({
  CURATED_EVENT_TEMPLATES: [{
    id: 'curated-walk', template_name: 'Közösségi séta', category: 'Utazás',
    description: null, image_emoji: null, tags: ['séta'], location_type: null,
    location_city: null, location_district: null, location_address: null,
    location_free_text: null, max_attendees: null, event_time: null,
  }],
  loadOwnedEventTemplates: (...args: unknown[]) => mocks.load(...args),
  deleteOwnedEventTemplate: (...args: unknown[]) => mocks.remove(...args),
  saveOwnedEventTemplate: (...args: unknown[]) => mocks.save(...args),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.load.mockReset().mockResolvedValue([{
    id: 'saved-1', template_name: 'Saját túra', category: 'Természet & Túra',
    description: null, image_emoji: '🥾', tags: ['túra'], location_type: null,
    location_city: null, location_district: null, location_address: null,
    location_free_text: null, max_attendees: null, event_time: null,
  }]);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.save.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('EventTemplateSelector', () => {
  it('exposes built-in and owned templates without nested interactive controls', async () => {
    const onSelect = vi.fn();
    act(() => root.render(<EventTemplateSelector onSelect={onSelect} />));
    const trigger = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((item) => item.textContent?.includes('Sablon használata'))!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      trigger.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.textContent).toContain('Közösségi séta');
    expect(document.body.textContent).toContain('Saját túra');
    const savedSelect = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((item) => item.textContent?.includes('Saját túra'))!;
    expect(savedSelect.querySelector('button')).toBeNull();
    expect(document.querySelector('[aria-label="Saját túra sablon törlése"]')).not.toBeNull();

    const curated = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((item) => item.textContent?.includes('Közösségi séta'))!;
    act(() => curated.click());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'curated-walk' }));
  });
});
