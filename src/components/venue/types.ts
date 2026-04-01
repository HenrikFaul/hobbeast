export interface CachedVenue {
  id: string;
  provider: string;
  external_id: string;
  name: string;
  category: string | null;
  tags: string[];
  address: string | null;
  city: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  website: string | null;
  rating: number | null;
  image_url: string | null;
  opening_hours_text: string[] | null;
  details: Record<string, unknown>;
  /** Client-computed distance in km */
  distanceKm?: number;
}

export interface VenueSelection {
  displayName: string;
  city: string;
  district: string;
  address: string;
  lat: number;
  lon: number;
  placeId: string;
  source: string;
  categories: string[];
}
