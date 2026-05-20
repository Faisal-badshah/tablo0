
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS ar_model_url TEXT,
  ADD COLUMN IF NOT EXISTS ar_usdz_url TEXT,
  ADD COLUMN IF NOT EXISTS ar_enabled BOOLEAN NOT NULL DEFAULT false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ar-models', 'ar-models', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ar_models_public_read" ON storage.objects;
CREATE POLICY "ar_models_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'ar-models');

DROP POLICY IF EXISTS "ar_models_owner_insert" ON storage.objects;
CREATE POLICY "ar_models_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ar-models'
  AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text
);

DROP POLICY IF EXISTS "ar_models_owner_update" ON storage.objects;
CREATE POLICY "ar_models_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'ar-models'
  AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text
);

DROP POLICY IF EXISTS "ar_models_owner_delete" ON storage.objects;
CREATE POLICY "ar_models_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ar-models'
  AND (storage.foldername(name))[1] = public.get_user_restaurant_id(auth.uid())::text
);
