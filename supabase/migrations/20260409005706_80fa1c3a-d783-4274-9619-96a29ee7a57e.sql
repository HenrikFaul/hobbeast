
-- Trigger function: notify users with matching favorite categories when event created
CREATE OR REPLACE FUNCTION public.notify_favorite_category_on_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_category_parts text[];
  v_top_category text;
  v_activity text;
BEGIN
  -- Extract top-level category and activity from "Category › Subcategory › Activity"
  v_category_parts := string_to_array(NEW.category, ' › ');
  v_top_category := v_category_parts[1];
  v_activity := CASE WHEN array_length(v_category_parts, 1) >= 3 THEN v_category_parts[3] ELSE v_category_parts[1] END;

  -- Find users whose favorite_event_categories contain matching hobby
  -- AND who have favorite_category_event notification enabled
  FOR v_user IN
    SELECT p.user_id
    FROM profiles p
    INNER JOIN notification_preferences np ON np.user_id = p.user_id AND np.favorite_category_event = true
    WHERE p.user_id != NEW.created_by
      AND p.favorite_event_categories IS NOT NULL
      AND (
        -- Match by activity name
        v_activity = ANY(p.favorite_event_categories)
        -- Or match by top-level category
        OR v_top_category = ANY(p.favorite_event_categories)
        -- Or partial match on any category part
        OR EXISTS (
          SELECT 1 FROM unnest(p.favorite_event_categories) AS fav
          WHERE NEW.category ILIKE '%' || fav || '%'
        )
      )
  LOOP
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_user.user_id,
      'favorite_category_event',
      'Új esemény a kedvenc kategóriádban!',
      NEW.title || ' — ' || COALESCE(NEW.location_city, 'Online'),
      jsonb_build_object(
        'event_id', NEW.id,
        'event_title', NEW.title,
        'category', NEW.category,
        'event_date', NEW.event_date,
        'location_city', NEW.location_city
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_favorite_category_on_event_insert
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.notify_favorite_category_on_event();
