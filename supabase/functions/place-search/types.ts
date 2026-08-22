import type { DbProviderMode, GeodataTableName } from './requestContract.ts'

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface ProviderPlace {
  provider: string
  external_id: string
  name: string
  category?: string
  categories?: string[]
  address?: string
  city?: string
  district?: string
  postal_code?: string
  latitude?: number
  longitude?: number
  distance_km?: number
  rating?: number
  review_count?: number
  image_url?: string | null
  phone?: string | null
  website?: string | null
  email?: string | null
  open_now?: boolean
  opening_hours_text?: string[]
  metadata?: Record<string, unknown>
  score?: number
  match_type?: 'query' | 'nearby' | 'db'
}

export interface DbSearchTableConfig {
  id: string
  provider: DbProviderMode
  label: string
  table: GeodataTableName
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface RuntimeConfigRow {
  key?: unknown
  provider?: unknown
  options?: { tables?: unknown }
}

export interface GeodataAuth {
  url: string
  key: string
}

