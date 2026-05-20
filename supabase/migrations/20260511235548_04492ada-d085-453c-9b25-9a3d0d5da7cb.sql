ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#F97316',
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS restaurants_anon_select ON public.restaurants;
CREATE POLICY restaurants_anon_select ON public.restaurants
  FOR SELECT TO anon
  USING (status = ANY (ARRAY['trial'::text, 'active'::text]) AND is_active = true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-logos', 'restaurant-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'restaurant-logos');

DROP POLICY IF EXISTS "logos_owner_write" ON storage.objects;
CREATE POLICY "logos_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "logos_owner_update" ON storage.objects;
CREATE POLICY "logos_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "logos_owner_delete" ON storage.objects;
CREATE POLICY "logos_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text
  );