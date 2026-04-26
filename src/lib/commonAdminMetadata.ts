export interface CommonAdminHostRow { label: string; value: string; description: string; }
export interface CommonAdminIntegrationEntry { name: string; detail: string; active: boolean; category: 'events' | 'places' | 'infra'; }
export interface CommonAdminReleaseSnapshot { version: string; deployedAt: string; delivered: string[]; notes: string; }

export const COMMON_ADMIN_HOSTS: CommonAdminHostRow[] = [
  { label: 'Adatbázis', value: 'Supabase Postgres', description: 'Auth, DB, storage és edge funkciók ugyanebben a stackben.' },
  { label: 'Backend', value: 'Supabase Edge Functions', description: 'Provider importok, runtime place search és Geodata db:* provider lekérdezések.' },
  { label: 'Domain / frontend', value: 'Web app hosting + DNS', description: 'A publikus domain és app hosting a deployment környezetből jön.' },
];

export const COMMON_ADMIN_INTEGRATIONS: CommonAdminIntegrationEntry[] = [
  { name: 'Eventbrite', detail: 'preview + szervezeti esemény import', active: true, category: 'events' },
  { name: 'Ticketmaster', detail: 'preview + import (ticketmaster / universe / frontgate / tmr)', active: true, category: 'events' },
  { name: 'SeatGeek', detail: 'preview + import', active: true, category: 'events' },
  { name: 'Amazon AWS Places V2', detail: 'runtime választható provider', active: true, category: 'places' },
<<<<<<< HEAD
  { name: 'Geoapify + TomTom', detail: 'live külső provider fallback', active: true, category: 'places' },
  { name: 'Geodata Supabase db:*', detail: 'konfigurálható public.unified_pois / local_pois / geoapify_pois venue források', active: true, category: 'places' },
  { name: 'Mapy.cz', detail: 'címkeresés / útvonaltervezés', active: true, category: 'places' },
=======
  { name: 'Geoapify + TomTom', detail: 'edge orchestration + local sync', active: true, category: 'places' },
  { name: 'Lokális címtábla', detail: 'manual sync + preview + state', active: true, category: 'places' },
>>>>>>> 4ddfa564f90f9638a41adb38adb70d6754044976
  { name: 'Supabase Auth/DB', detail: 'felhasználók, táblák, edge functionök', active: true, category: 'infra' },
  { name: 'Supabase Realtime', detail: 'live update / event sync capability', active: true, category: 'infra' },
];

export const COMMON_ADMIN_RELEASE: CommonAdminReleaseSnapshot = {
<<<<<<< HEAD
  version: '1.6.5',
=======
  version: '1.4.4',
>>>>>>> 4ddfa564f90f9638a41adb38adb70d6754044976
  deployedAt: 'Deployment ideje environment alapján ellenőrizendő',
  delivered: [
    'Multi-provider import panel: Eventbrite, Ticketmaster, SeatGeek',
    'Runtime címkereső provider konfiguráció és teszt',
    'Geodata Supabase db:* táblaprovider konfigurátor a venue kereséshez',
    'Lokális címtábla batch/scheduler UI és edge funkció kivezetése',
    'Közös admin inventory és release áttekintés',
  ],
  notes: 'A changelog alapján összefoglalt common_admin capability snapshot.',
};
