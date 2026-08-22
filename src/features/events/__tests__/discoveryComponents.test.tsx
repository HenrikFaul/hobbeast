import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryFilterDialog } from '../CategoryFilterDialog';
import { EventDiscoveryCard, type DiscoveryCardEntry } from '../EventDiscoveryCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent?.includes(label));
}

describe('discovery presentation boundaries', () => {
  it('exposes the category picker as a labelled, focus-managed dialog', () => {
    const toggleCategory = vi.fn();
    act(() => root.render(
      <CategoryFilterDialog
        open
        selectedCategoryIds={new Set()}
        selectedSubcategoryKeys={new Set()}
        selectedActivityKeys={new Set()}
        onOpenChange={vi.fn()}
        onToggleCategory={toggleCategory}
        onToggleSubcategory={vi.fn()}
        onToggleActivity={vi.fn()}
        onClear={vi.fn()}
      />,
    ));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog?.textContent).toContain('Választhatsz fő kategóriát');
    act(() => button('Természet & Túra')?.click());
    expect(toggleCategory).toHaveBeenCalledWith('nature');
    expect(button('Természet & Túra')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps promoted disclosure exact and card navigation keyboard-accessible', () => {
    const open = vi.fn();
    const entry: DiscoveryCardEntry = {
      isPromoted: true,
      disclosureLabel: 'Promoted',
      item: {
        eventId: 'event-1',
        id: 'event-1',
        title: 'Kezdő túra',
        category: 'Túrázás',
        event_date: '2026-09-10',
        event_time: '09:00',
        location_city: 'Budapest',
        location_district: null,
        location_address: 'Normafa',
        location_free_text: null,
        location_type: 'address',
        max_attendees: 12,
        image_emoji: '🥾',
        tags: ['Kezdőbarát'],
        description: null,
        created_by: 'host-1',
        participant_count: 4,
        source: 'hobbeast',
      },
    };
    act(() => root.render(
      <EventDiscoveryCard
        entry={entry}
        index={0}
        relation="default"
        showRecommendationReason={false}
        joinPending={false}
        onOpen={open}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onLessLikeThis={vi.fn()}
      />,
    ));
    expect(document.querySelector('[aria-label="Promoted event"]')?.textContent).toBe('Promoted');
    const openButton = document.querySelector<HTMLButtonElement>('[aria-label="Kezdő túra részleteinek megnyitása"]');
    expect(openButton?.type).toBe('button');
    act(() => openButton?.click());
    expect(open).toHaveBeenCalledWith(entry.item);
  });
});
