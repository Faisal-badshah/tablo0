-- Extend restaurants with delivery configuration
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric(4,1) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_delivery_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS restaurant_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS restaurant_lng numeric(10,7);

-- Extend orders with delivery details (order_type, customer_name, customer_phone already exist)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_distance_km numeric(4,1),
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';

-- Realtime: ensure orders table streams full row updates for status tracker
ALTER TABLE public.orders REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
END $$;