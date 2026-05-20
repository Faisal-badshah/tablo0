import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Clock, ChefHat, Truck, Package } from 'lucide-react';

export type DeliveryStatus = 'pending' | 'preparing' | 'out_for_delivery' | 'delivered' | 'failed';

const STAGES: { key: DeliveryStatus; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'pending', label: 'Received', icon: Clock },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'out_for_delivery', label: 'Out for delivery', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
];

const indexOfStatus = (s: string): number => {
  const idx = STAGES.findIndex((x) => x.key === s);
  return idx < 0 ? 0 : idx;
};

interface Props {
  orderId: string;
  initialStatus?: DeliveryStatus;
  estimatedMinutes?: number | null;
}

export const DeliveryStatusTracker = ({ orderId, initialStatus = 'pending', estimatedMinutes }: Props) => {
  const [status, setStatus] = useState<DeliveryStatus>(initialStatus);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;

    const fetchStatus = async () => {
      const { data } = await supabase
        .from('orders')
        .select('delivery_status')
        .eq('id', orderId)
        .maybeSingle() as any;
      if (!cancelled && data?.delivery_status) setStatus(data.delivery_status);
    };

    // Initial fetch
    fetchStatus();

    // Realtime subscription
    const channel = supabase
      .channel(`delivery-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload: any) => {
          const next = payload?.new?.delivery_status;
          if (next) setStatus(next);
        },
      )
      .subscribe();

    // Poll fallback every 15s
    pollTimer = window.setInterval(fetchStatus, 15000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [orderId]);

  const activeIdx = indexOfStatus(status);
  const failed = status === 'failed';

  return (
    <div className="space-y-4">
      {estimatedMinutes != null && status !== 'delivered' && status !== 'failed' && (
        <p className="text-sm text-muted-foreground text-center">
          Estimated delivery in <span className="font-semibold text-foreground">~{estimatedMinutes} min</span>
        </p>
      )}
      <ol className="space-y-3">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const reached = i <= activeIdx && !failed;
          const current = i === activeIdx && !failed;
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                  reached
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-muted border-border text-muted-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-sm ${reached ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {stage.label}
                {current && <span className="ml-2 text-xs text-primary">· In progress</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {failed && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <Package className="w-4 h-4" /> Delivery failed. Please contact the restaurant.
        </div>
      )}
    </div>
  );
};
