import type { NormalizedPlaceDetails, NormalizedPlaceSummary } from './types';
import { placesConfig } from './config';

interface CacheEnvelope<T> {
  createdAt: number;
  value: T;
}

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const storagePrefix = 'hobbeast:places:';

const now = () => Date.now();

function readFromLocalStorage<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storagePrefix + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

function writeToLocalStorage<T>(key: string, envelope: CacheEnvelope<T>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storagePrefix + key, JSON.stringify(envelope));
  } catch {
    // best effort cache only
  }
}

function isFresh(envelope: CacheEnvelope<unknown>) {
  return now() - envelope.createdAt < placesConfig.cacheTtlMs;
}

export function getCached<T>(key: string): T | null {
  const inMemory = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  if (inMemory && isFresh(inMemory)) return inMemory.value;

  const fromStorage = readFromLocalStorage<T>(key);
  if (fromStorage && isFresh(fromStorage)) {
    memoryCache.set(key, fromStorage);
    return fromStorage.value;
  }

  return null;
}

export function setCached<T>(key: string, value: T) {
  const envelope: CacheEnvelope<T> = { createdAt: now(), value };
  memoryCache.set(key, envelope);
  writeToLocalStorage(key, envelope);
}

export function buildSearchCacheKey(query: string, lat?: number, lon?: number) {
  return `search:${query.trim().toLowerCase()}:${lat ?? 'na'}:${lon ?? 'na'}`;
}

export function buildDetailsCacheKey(place: Pick<NormalizedPlaceSummary, 'sourceIds' | 'name' | 'lat' | 'lon'>) {
  return `details:${place.sourceIds.geoapify ?? ''}:${place.sourceIds.tomtom ?? ''}:${place.name.toLowerCase()}:${place.lat}:${place.lon}`;
}

export function tagCacheHit<T extends NormalizedPlaceSummary | NormalizedPlaceDetails>(value: T): T {
  return {
    ...value,
    diagnostics: {
      ...(value.diagnostics ?? {}),
      cacheUsed: true,
    },
  };
}
