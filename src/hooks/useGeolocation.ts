import { useCallback, useState } from 'react';

export type GeolocationStatus = 'idle' | 'loading' | 'denied' | 'unavailable' | 'error' | 'success';

export interface GeolocationState {
  status: GeolocationStatus;
  coords: { lat: number; lng: number } | null;
  error: string | null;
  request: () => void;
}

/**
 * Wraps the browser Geolocation API with explicit loading / denied / error
 * states. Coordinates are only kept in memory.
 */
export const useGeolocation = (): GeolocationState => {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation not supported on this device');
      return;
    }
    setStatus('loading');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('success');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission denied');
        } else {
          setStatus('error');
          setError(err.message || 'Unable to get location');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  return { status, coords, error, request };
};
