import { useEffect, useRef, useState } from 'react';
import { useLeaflet } from '@/hooks/useLeaflet';
import { reverseGeocode } from '@/lib/nominatim';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Called whenever the address is reverse-geocoded so the parent can auto-fill an address field. */
  onAddressResolved?: (address: string) => void;
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

export const RestaurantLocationPicker = ({ lat, lng, onChange, onAddressResolved }: Props) => {
  const { L, error } = useLeaflet(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const geo = useGeolocation();

  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;
    const initial: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
    const initialZoom = lat != null && lng != null ? 15 : 5;

    const map = L.map(containerRef.current).setView(initial, initialZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(initial, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const { lat: la, lng: ln } = marker.getLatLng();
      onChange(la, ln);
    });
    map.on('click', (e: any) => {
      marker.setLatLng(e.latlng);
      onChange(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (lat != null && lng != null) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15));
    }
  }, [lat, lng]);

  // When geolocation succeeds, set coords on parent
  useEffect(() => {
    if (geo.status === 'success' && geo.coords) {
      onChange(geo.coords.lat, geo.coords.lng);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.coords]);

  // Reverse geocode whenever coords change
  useEffect(() => {
    if (lat == null || lng == null) { setAddress(null); return; }
    setLoadingAddress(true);
    const ctrl = new AbortController();
    reverseGeocode(lat, lng, ctrl.signal).then((r) => {
      const display = r?.displayName ?? null;
      setAddress(display);
      setLoadingAddress(false);
      if (display && onAddressResolved) onAddressResolved(display);
    });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  if (error) {
    return <p className="text-xs text-destructive">Could not load map: {error}</p>;
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="default"
        className="w-full"
        onClick={geo.request}
        disabled={geo.status === 'loading'}
      >
        {geo.status === 'loading' ? (
          <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Getting your location…</>
        ) : (
          <><MapPin className="w-4 h-4 mr-1.5" /> 📍 Use my current location</>
        )}
      </Button>
      {geo.status === 'denied' && (
        <p className="text-xs text-muted-foreground">
          Location access denied — please drag the pin to your restaurant.
        </p>
      )}
      {geo.status === 'error' && geo.error && (
        <p className="text-xs text-destructive">{geo.error}</p>
      )}

      <div
        ref={containerRef}
        className="w-full h-56 rounded-lg border bg-muted relative overflow-hidden"
      >
        {!L && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span className="break-words">
          {lat == null || lng == null
            ? 'Tap “Use my current location” or click the map'
            : loadingAddress
              ? 'Resolving address…'
              : address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
        </span>
      </div>
    </div>
  );
};
