import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useModelViewer } from './useModelViewer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  modelUrl: string | null;
  iosUrl?: string | null;
  fallbackImageUrl?: string | null;
}

export const ArViewerModal = ({ open, onOpenChange, itemName, modelUrl, iosUrl, fallbackImageUrl }: Props) => {
  const { ready, error } = useModelViewer(open);
  const [slowFallback, setSlowFallback] = useState(false);

  useEffect(() => {
    if (!open) { setSlowFallback(false); return; }
    const t = setTimeout(() => setSlowFallback(true), 8000);
    return () => clearTimeout(t);
  }, [open, modelUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{itemName} — 3D View</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted relative">
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-4 text-center">
              <AlertTriangle className="w-8 h-8 mb-2" />
              <p className="text-sm">Couldn't load 3D viewer.</p>
              {fallbackImageUrl && <img src={fallbackImageUrl} alt={itemName} className="mt-3 max-h-40 rounded" />}
            </div>
          )}
          {!error && !ready && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">Preparing 3D model…</p>
            </div>
          )}
          {!error && ready && modelUrl && (
            slowFallback && fallbackImageUrl ? (
              <img src={fallbackImageUrl} alt={itemName} className="w-full h-full object-cover" />
            ) : (
              // @ts-expect-error model-viewer is a web component
              <model-viewer
                src={modelUrl}
                ios-src={iosUrl || undefined}
                ar
                ar-modes="webxr scene-viewer quick-look"
                camera-controls
                auto-rotate
                touch-action="pan-y"
                aria-label={itemName}
                style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
              />
            )
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Drag to rotate · Pinch to zoom · Tap the AR icon (mobile) to place in your space
        </p>
      </DialogContent>
    </Dialog>
  );
};
