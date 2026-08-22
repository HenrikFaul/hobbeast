import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMocks = vi.hoisted(() => ({
  listAdminProfiles: vi.fn(),
  loadAdminHubs: vi.fn(),
  loadAdminUserDetail: vi.fn(),
  reconcileAdminHubs: vi.fn(),
  updateAdminProfile: vi.fn(),
  previewAdminBulkSelection: vi.fn(),
  applyAdminBulkAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/features/admin/users/repository', () => ({
  ...repositoryMocks,
  AdminUsersRepositoryError: class AdminUsersRepositoryError extends Error {},
}));

vi.mock('sonner', () => ({ toast: toastMocks }));

vi.mock('@/components/admin/AdminMassUsers', () => ({
  AdminMassUsers: () => <div>Mass user creator</div>,
}));

vi.mock('@/components/admin/HubDetailModal', () => ({
  HubDetailModal: ({ open }: { open: boolean }) => open ? <div role="dialog">Hub detail</div> : null,
}));

import { AdminUsers } from './AdminUsers';

const profileReal = {
  id: 'profile-real',
  user_id: 'user-real',
  display_name: 'Anna Futó',
  city: 'Budapest',
  district: 'XI.',
  hobbies: ['Futás'],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
  avatar_url: null,
  bio: 'Régi bio',
  gender: 'female',
  age_band: '25–34',
  preferred_radius_km: 10,
  user_origin: 'real' as const,
  is_active: true,
};

const profileGenerated = {
  ...profileReal,
  id: 'profile-generated',
  user_id: 'user-generated',
  display_name: 'Béla Túrázó',
  city: 'Pécs',
  hobbies: ['Túrázás'],
  user_origin: 'generated' as const,
  is_active: false,
};

let container: HTMLDivElement;
let root: Root;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  act(() => {
    setter?.call(control, value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent?.trim() === label);
}

describe('AdminUsers safe-refactor characterization', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    repositoryMocks.listAdminProfiles.mockResolvedValue({
      profiles: [profileReal, profileGenerated],
      truncated: false,
    });
    repositoryMocks.loadAdminHubs.mockResolvedValue({
      hubs: [{
        id: 'hub-running',
        hobby_category: 'Esti futók',
        city: 'Budapest',
        member_count: 2,
        real_member_count: 1,
        simulated_member_count: 1,
        unknown_origin_member_count: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      userHubMap: new Map([['user-real', [{
        id: 'hub-running',
        hobby_category: 'Esti futók',
        city: 'Budapest',
        member_count: 2,
        created_at: '2026-01-01T00:00:00.000Z',
      }]]]),
      originStatus: 'available',
      membershipWarning: null,
    });
    repositoryMocks.loadAdminUserDetail.mockResolvedValue({
      participations: [{
        id: 'participation-1',
        event_id: 'event-1',
        joined_at: '2026-02-01T00:00:00.000Z',
        event: {
          id: 'event-1',
          title: 'Duna-parti séta',
          category: 'Séta',
          event_date: '2026-09-01',
          image_emoji: '🚶',
        },
      }],
      events: [{ id: 'event-1', title: 'Duna-parti séta', category: 'Séta', event_date: '2026-09-01' }],
      hobbyOptions: ['Futás', 'Túrázás'],
      warnings: [],
    });
    repositoryMocks.updateAdminProfile.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAdminUsers() {
    await act(async () => root.render(<AdminUsers />));
    await flushEffects();
  }

  it('loads profiles and Hub membership through repositories and keeps cross-field search', async () => {
    await renderAdminUsers();

    expect(repositoryMocks.listAdminProfiles).toHaveBeenCalledOnce();
    expect(repositoryMocks.loadAdminHubs).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Felhasználók: 2 összes');
    expect(document.body.textContent).toContain('1 valódi / 1 generált / 0 ismeretlen');
    expect(document.body.textContent).toContain('Anna Futó');
    expect(document.body.textContent).toContain('Béla Túrázó');
    expect(document.body.textContent).toContain('Esti futók');

    const search = document.querySelector<HTMLInputElement>('[aria-label="Felhasználók keresése"]');
    expect(search).not.toBeNull();
    setControlValue(search!, 'Pécs');
    expect(document.body.textContent).not.toContain('Anna Futó');
    expect(document.body.textContent).toContain('Béla Túrázó');
  });

  it('keeps generated-only destructive bulk eligibility tied to the selection', async () => {
    await renderAdminUsers();

    const generatedCheckbox = document.querySelector<HTMLElement>('[aria-label="Béla Túrázó kijelölése"]');
    const realCheckbox = document.querySelector<HTMLElement>('[aria-label="Anna Futó kijelölése"]');
    expect(button('Törlés')?.disabled).toBe(true);

    act(() => generatedCheckbox?.click());
    expect(button('Törlés')?.disabled).toBe(false);

    act(() => realCheckbox?.click());
    expect(button('Törlés')?.disabled).toBe(true);
  });

  it('keeps allowlisted detail editing behind an audit reason and repository capability boundary', async () => {
    await renderAdminUsers();

    const detailButton = document.querySelector<HTMLButtonElement>('[aria-label="Anna Futó részletei"]');
    await act(async () => detailButton?.click());
    await flushEffects();

    expect(repositoryMocks.loadAdminUserDetail).toHaveBeenCalledWith('user-real');
    expect(document.body.textContent).toContain('25–34 év');
    expect(document.body.textContent).toContain('Duna-parti séta');
    expect(button('Profil mentése')?.disabled).toBe(true);

    const reason = document.querySelector<HTMLTextAreaElement>('#profile-edit-reason');
    expect(reason).not.toBeNull();
    setControlValue(reason!, 'Ügyfélszolgálati helyesbítés');
    expect(button('Profil mentése')?.disabled).toBe(false);

    await act(async () => button('Profil mentése')?.click());
    await flushEffects();
    expect(repositoryMocks.updateAdminProfile).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-real',
      reason: 'Ügyfélszolgálati helyesbítés',
      eventIds: ['event-1'],
      hobbies: ['Futás'],
    }));
  });
});
