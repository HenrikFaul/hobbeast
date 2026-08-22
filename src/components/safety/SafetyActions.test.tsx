import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SafetyActions } from '@/components/safety/SafetyActions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

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

function renderSafetyActions(targetType: 'event' | 'user' = 'event') {
  act(() => {
    root.render(
      <SafetyActions
        targetType={targetType}
        targetRef="33333333-3333-4333-8333-333333333333"
        targetUserId="22222222-2222-4222-8222-222222222222"
        sourceSurface="test"
      />,
    );
  });
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim().toLocaleLowerCase('hu-HU') === label.toLocaleLowerCase('hu-HU'));
}

describe('SafetyActions accessibility surface', () => {
  it('exposes report and block as named native buttons', () => {
    renderSafetyActions();
    const reportButton = findButton('Jelentés');
    const blockButton = findButton('Tiltás');
    expect(reportButton?.type).toBe('button');
    expect(blockButton?.type).toBe('button');
    expect(document.querySelector('[aria-label="Biztonsági műveletek"]')).not.toBeNull();
  });

  it('opens a labelled report dialog with bounded free text', () => {
    renderSafetyActions();
    act(() => findButton('Jelentés')?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Biztonsági bejelentés');
    expect(dialog?.querySelector('textarea')?.maxLength).toBe(1000);
    expect(dialog?.querySelector('[aria-label="Bejelentés oka"]')).not.toBeNull();
  });

  it('requires a separate alert-dialog confirmation before blocking', () => {
    renderSafetyActions('user');
    act(() => findButton('Tiltás')?.click());
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('Letiltod ezt a felhasználót?');
    expect(findButton('Letiltás')).toBeDefined();
    expect(findButton('Mégse')).toBeDefined();
  });
});
