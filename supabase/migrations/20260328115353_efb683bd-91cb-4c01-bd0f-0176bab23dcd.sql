
-- Allow participants table to be updated (organizer status changes)
CREATE POLICY "Event owners can update participants"
ON public.event_participants
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM events WHERE events.id = event_participants.event_id AND events.created_by = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM events WHERE events.id = event_participants.event_id AND events.created_by = auth.uid()
));

-- Add unique constraint on places_cache cache_key for upsert
ALTER TABLE public.places_cache DROP CONSTRAINT IF EXISTS places_cache_cache_key_key;
ALTER TABLE public.places_cache ADD CONSTRAINT places_cache_cache_key_key UNIQUE (cache_key);

-- Allow anon/authenticated to read places_cache (for edge function)
CREATE POLICY "Anyone can read places cache" ON public.places_cache FOR SELECT TO public USING (true);
