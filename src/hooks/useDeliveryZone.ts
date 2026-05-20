import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DeliveryZone {
  deliveryEnabled: boolean;
  radiusKm: number;
  deliveryFee: number;
  minOrderAmount: number;
  estimatedMinutes: number;
  restaurantLat: number | null;
  restaurantLng: number | null;
  loading: boolean;
}

const DEFAULT: DeliveryZone = {
  deliveryEnabled: false,
  radiusKm: 2,
  deliveryFee: 0,
  minOrderAmount: 0,
  estimatedMinutes: 30,
  restaurantLat: null,
  restaurantLng: null,
  loading: true,
};

/**
 * Fetches the delivery configuration for a restaurant. Returns sensible
 * defaults while loading or if delivery isn't configured.
 */
export const useDeliveryZone = (restaurantId: string | null): DeliveryZone => {
  const [zone, setZone] = useState<DeliveryZone>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) {
      setZone({ ...DEFAULT, loading: false });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('restaurants')
        .select(
          'delivery_enabled, delivery_radius_km, delivery_fee, min_order_amount, estimated_delivery_minutes, restaurant_lat, restaurant_lng',
        )
        .eq('id', restaurantId)
        .maybeSingle() as any;
      if (cancelled) return;
      if (!data) {
        setZone({ ...DEFAULT, loading: false });
        return;
      }
      setZone({
        deliveryEnabled: !!data.delivery_enabled,
        radiusKm: Number(data.delivery_radius_km ?? 2),
        deliveryFee: Number(data.delivery_fee ?? 0),
        minOrderAmount: Number(data.min_order_amount ?? 0),
        estimatedMinutes: Number(data.estimated_delivery_minutes ?? 30),
        restaurantLat: data.restaurant_lat != null ? Number(data.restaurant_lat) : null,
        restaurantLng: data.restaurant_lng != null ? Number(data.restaurant_lng) : null,
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return zone;
};
