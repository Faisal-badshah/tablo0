import { useEffect, useState } from 'react';

let loadPromise: Promise<any> | null = null;

const CSS_HREF = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const JS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

const loadLeaflet = (): Promise<any> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${JS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L));
      existing.addEventListener('error', () => {
        loadPromise = null;
        reject(new Error('Failed to load Leaflet'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = JS_SRC;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Leaflet'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
};

/** Lazy-load Leaflet from cdnjs. Returns the global L when ready. */
export const useLeaflet = (enabled: boolean) => {
  const [L, setL] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadLeaflet()
      .then((lib) => { if (!cancelled) setL(lib); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { L, error };
};
