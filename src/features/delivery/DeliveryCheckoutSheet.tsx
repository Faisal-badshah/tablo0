import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, MapPin, AlertTriangle } from 'lucide-react';
import { useRestaurant, CartItem } from '@/context/RestaurantContext';
import { formatCurrency } from '@/types/restaurant';
import { useGeolocation } from '@/hooks/useGeolocation';
import { reverseGeocode } from '@/lib/nominatim';
import { calculateHaversineDistance } from '@/lib/geo';
import { DeliveryZone } from '@/hooks/useDeliveryZone';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: DeliveryZone;
  cart: CartItem[];
  cartTotal: number;
  onPlaced: (orderId: string) => void;
}

export const DeliveryCheckoutSheet = ({ open, onOpenChange, zone, cart, cartTotal, onPlaced }: Props) => {
  const { placeDeliveryOrder } = useRestaurant();
  const geo = useGeolocation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // When geolocation succeeds, reverse geocode (in-memory only, no storage)
  useEffect(() => {
    if (geo.status !== 'success' || !geo.coords) return;
    setCoords(geo.coords);
    setAddressLoading(true);
    const ctrl = new AbortController();
    reverseGeocode(geo.coords.lat, geo.coords.lng, ctrl.signal).then((r) => {
      if (r?.displayName) setAddress(r.displayName);
      setAddressLoading(false);
    });
    return () => ctrl.abort();
  }, [geo.status, geo.coords]);

  const distance = useMemo(() => {
    if (!coords || zone.restaurantLat == null || zone.restaurantLng == null) return null;
    return calculateHaversineDistance(coords.lat, coords.lng, zone.restaurantLat, zone.restaurantLng);
  }, [coords, zone.restaurantLat, zone.restaurantLng]);

  const outOfZone = distance != null && distance > zone.radiusKm;
  const belowMinimum = zone.minOrderAmount > 0 && cartTotal < zone.minOrderAmount;
  const total = cartTotal + Math.round(zone.deliveryFee);

  const phoneValid = /^[0-9+\s\-()]{7,20}$/.test(phone.trim());
  const canSubmit =
    name.trim().length > 0 &&
    phoneValid &&
    address.trim().length >= 6 &&
    coords != null &&
    !outOfZone &&
    !belowMinimum &&
    cart.length > 0 &&
    !placing;

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!coords || distance == null) {
      setSubmitError('Please share your delivery location.');
      return;
    }
    setPlacing(true);
    const orderId = await placeDeliveryOrder({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      deliveryAddress: address.trim(),
      deliveryLat: coords.lat,
      deliveryLng: coords.lng,
      deliveryDistanceKm: distance,
      deliveryFee: zone.deliveryFee,
    });
    setPlacing(false);
    if (!orderId) {
      setSubmitError('Could not place order. Please try again.');
      return;
    }
    onPlaced(orderId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Delivery details</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <Label>Your name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Full name" />
          </div>

          <div>
            <Label>Phone number</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.slice(0, 20))}
              placeholder="+91 9876543210"
            />
            {phone && !phoneValid && (
              <p className="text-xs text-destructive mt-1">Enter a valid phone number</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Delivery address</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={geo.request}
                disabled={geo.status === 'loading'}
              >
                {geo.status === 'loading' ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Locating…</>
                ) : (
                  <><MapPin className="w-3 h-3 mr-1" /> Use my location</>
                )}
              </Button>
            </div>
            <Input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                // Manual edits invalidate auto-coords so user must re-locate
                if (geo.status === 'success' && e.target.value !== address && coords) {
                  // keep coords; address text just reflects user override
                }
              }}
              placeholder={addressLoading ? 'Resolving address…' : 'Street, city, landmark'}
              maxLength={500}
            />
            {geo.status === 'denied' && (
              <p className="text-xs text-muted-foreground mt-1">
                Location permission denied — type your address; we still need a precise pin to verify the zone. Try
                enabling location for accurate delivery.
              </p>
            )}
            {geo.status === 'error' && geo.error && (
              <p className="text-xs text-destructive mt-1">{geo.error}</p>
            )}
            {coords && distance != null && !outOfZone && (
              <p className="text-xs text-muted-foreground mt-1">{distance.toFixed(1)} km from the restaurant</p>
            )}
            {outOfZone && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Sorry, we only deliver within {zone.radiusKm}km. Your location is {distance?.toFixed(1)}km away.
                </span>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-1 text-sm">
            {cart.map((ci) => (
              <div key={ci.menuItem.id} className="flex justify-between">
                <span>{ci.quantity}× {ci.menuItem.name}</span>
                <span>{formatCurrency(ci.menuItem.price * ci.quantity)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span>{zone.deliveryFee > 0 ? formatCurrency(Math.round(zone.deliveryFee)) : 'Free'}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
            {belowMinimum && (
              <p className="text-xs text-destructive pt-1">
                Minimum order for delivery is {formatCurrency(Math.round(zone.minOrderAmount))}.
              </p>
            )}
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-12 text-base">
            {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Place delivery order'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
