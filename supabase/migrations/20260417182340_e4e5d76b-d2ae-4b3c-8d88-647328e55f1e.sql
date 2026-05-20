-- 1. Create menu_categories table
CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_categories_restaurant ON public.menu_categories(restaurant_id);
CREATE UNIQUE INDEX idx_menu_categories_unique_name ON public.menu_categories(restaurant_id, lower(name));

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON public.menu_categories
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "categories_insert" ON public.menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = public.get_user_restaurant_id(auth.uid()));

CREATE POLICY "categories_update" ON public.menu_categories
  FOR UPDATE TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id(auth.uid()));

CREATE POLICY "categories_delete" ON public.menu_categories
  FOR DELETE TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id(auth.uid()));

-- 2. Add image_url and category_id to menu_items
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL;

-- 3. Seed default categories for existing restaurants and link existing menu items
DO $$
DECLARE
  r RECORD;
  cat_id uuid;
  cat_name text;
  default_cats text[] := ARRAY['Appetizers','Mains','Desserts','Drinks'];
BEGIN
  FOR r IN SELECT id FROM public.restaurants LOOP
    FOREACH cat_name IN ARRAY default_cats LOOP
      INSERT INTO public.menu_categories (restaurant_id, name, sort_order)
      VALUES (r.id, cat_name, array_position(default_cats, cat_name))
      ON CONFLICT DO NOTHING
      RETURNING id INTO cat_id;
    END LOOP;
  END LOOP;
END $$;

-- Link existing menu_items to their matching category by name
UPDATE public.menu_items mi
SET category_id = mc.id
FROM public.menu_categories mc
WHERE mi.category_id IS NULL
  AND mi.restaurant_id = mc.restaurant_id
  AND lower(mi.category) = lower(mc.name);

-- 4. Storage bucket for menu images
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "menu_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-images');

CREATE POLICY "menu_images_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'menu-images');