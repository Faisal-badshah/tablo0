/**
 * Thin wrappers around the OpenStreetMap Nominatim API.
 * Public, free, rate-limited — for production scale, swap in a server-side
 * geocoder. We never store coordinates outside in-memory state.
 */

const BASE = 'https://nominatim.openstreetmap.org';

export interface ReverseGeocodeResult {
  displayName: string;
}

export const reverseGeocode = async (
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> => {
  try {
    const res = await fetch(
      `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.display_name) return null;
    return { displayName: json.display_name as string };
  } catch {
    return null;
  }
};
