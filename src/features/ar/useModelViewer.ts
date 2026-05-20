import { useEffect, useState } from 'react';

let loadPromise: Promise<void> | null = null;

const loadModelViewer = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).customElements?.get('model-viewer')) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load model-viewer'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
};

export const useModelViewer = (enabled: boolean) => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadModelViewer()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { ready, error };
};
