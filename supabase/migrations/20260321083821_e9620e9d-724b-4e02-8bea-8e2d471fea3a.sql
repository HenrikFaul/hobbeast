ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS location_lat double precision,
ADD COLUMN IF NOT EXISTS location_lon double precision;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS location_lat double precision,
ADD COLUMN IF NOT EXISTS location_lon double precision;

CREATE INDEX IF NOT EXISTS idx_profiles_location_coords
ON public.profiles (location_lat, location_lon);

CREATE INDEX IF NOT EXISTS idx_events_location_coords
ON public.events (location_lat, location_lon);