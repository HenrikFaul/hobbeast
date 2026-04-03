export interface CommonAdminHostRow { label: string; value: string; description: string; }
export interface CommonAdminIntegrationGroup { title: string; providers: Array<{ name: string; detail: string; active: boolean }>; }
export interface CommonAdminReleaseSnapshot { version: string; deployedAt: string; delivered: string[]; notes: string; }

export const COMMON_ADMIN_HOSTS: CommonAdminHostRow[] = [
  { label: 'Adatbázis', value: 'Supabase Postgres', description: 'Auth, DB, storage és edge funkciók ugyanebben a stackben.' },
  { label: 'Backend', value: 'Supabase Edge Functions', description: 'Provider importok, runtime place search és sync taskok.' },
  { label: 'Domain / frontend', value: 'Web app hosting + DNS', description: 'A publikus domain és app hosting a deployment környezetből jön.' },
];

export const COMMON_ADMIN_INTEGRATIONS: CommonAdminIntegrationGroup[] = [
  { title: 'Esemény providerek', providers: [
    { name: 'Eventbrite', detail: 'preview + szervezeti esemény import', active: true },
    { name: 'Ticketmaster', detail: 'preview + import (ticketmaster / universe / frontgate / tmr)', active: true },
    { name: 'SeatGeek', detail: 'preview + import', active: true },
  ]},
  { title: 'Hely / cím providerek', providers: [
    { name: 'Amazon AWS Places V2', detail: 'runtime választható provider', active: true },
    { name: 'Geoapify + TomTom', detail: 'edge orchestration + local sync', active: true },
    { name: 'Lokális címtábla', detail: 'manual sync + preview + state', active: true },
  ]},
  { title: 'Alkalmazás infrastruktúra', providers: [
    { name: 'Supabase Auth/DB', detail: 'felhasználók, táblák, edge functionök', active: true },
    { name: 'Supabase Realtime', detail: 'live update / event sync capability', active: true },
  ]},
];

export const COMMON_ADMIN_RELEASE: CommonAdminReleaseSnapshot = {
  version: '1.4.2',
  deployedAt: 'Deployment ideje environment alapján ellenőrizendő',
  delivered: [
    'Multi-provider import panel: Eventbrite, Ticketmaster, SeatGeek',
    'Runtime címkereső provider konfiguráció és teszt',
    'Lokális címtábla manuális újratöltése és állapotfigyelése',
    'Közös admin inventory és release áttekintés',
  ],
  notes: 'A changelog alapján összefoglalt common_admin capability snapshot.',
};
