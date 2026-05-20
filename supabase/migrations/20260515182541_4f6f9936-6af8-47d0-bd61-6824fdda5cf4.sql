
-- 1. menu_items extensions
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 2. menu_categories sort_order already exists per schema; ensure index for fast sort
CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON public.menu_items(restaurant_id, sort_order);

-- 3. orders rejection reason
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 4. table_sessions bill request
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS bill_requested_at TIMESTAMPTZ;

-- 5. user_roles display name
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 6. RLS: kitchen/billing staff can update is_available on menu_items in their restaurant
DROP POLICY IF EXISTS menu_items_staff_availability ON public.menu_items;
CREATE POLICY menu_items_staff_availability
ON public.menu_items
FOR UPDATE
TO authenticated
USING (restaurant_id = public.get_user_restaurant_id(auth.uid()))
WITH CHECK (restaurant_id = public.get_user_restaurant_id(auth.uid()));

-- 7. Slug aliases for backwards compatibility
CREATE TABLE IF NOT EXISTS public.restaurant_slug_aliases (
  slug TEXT PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurant_slug_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS slug_aliases_select ON public.restaurant_slug_aliases;
CREATE POLICY slug_aliases_select ON public.restaurant_slug_aliases
  FOR SELECT TO anon, authenticated USING (true);

-- 8. Cleanup existing dirty slugs ("name--abcdef") -> store alias, set canonical
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT id, slug FROM public.restaurants
    WHERE slug ~ '--[0-9a-f]{4,}$'
  LOOP
    INSERT INTO public.restaurant_slug_aliases(slug, restaurant_id)
    VALUES (r.slug, r.id)
    ON CONFLICT (slug) DO NOTHING;

    base := regexp_replace(r.slug, '--[0-9a-f]{4,}$', '');
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.restaurants WHERE slug = candidate AND id <> r.id) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    UPDATE public.restaurants SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 9. Realtime publication coverage
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.table_sessions REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
