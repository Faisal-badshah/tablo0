import { useRestaurant } from '@/context/RestaurantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ChefHat, LogOut, Clock, Volume2, VolumeX, Check, X, CookingPot, CircleCheck, Package, Bike } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useNewOrderSound } from '@/hooks/useNewOrderSound';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpeechOrder, playChime } from '@/features/speech/useSpeechOrder';
import { SpeechTopBar, VoiceButtons } from '@/features/speech/SpeechControls';

const AUTO_KEY = 'speech.autoAnnounce.kitchen';

const KitchenDashboard = () => {
  const { orders, menuItems, categories, acceptOrder, rejectOrder, markOrderReady, updateOrderItemStatus, setItemAvailable } = useRestaurant();
  const { signOut, role } = useAuth();
  const navigate = useNavigate();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const speech = useSpeechOrder();
  const [autoAnnounce, setAutoAnnounce] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(AUTO_KEY) === '1';
  });
  useEffect(() => { try { localStorage.setItem(AUTO_KEY, autoAnnounce ? '1' : '0'); } catch { /* noop */ } }, [autoAnnounce]);

  // Track recently finalized orders so they linger briefly on screen
  const [finalized, setFinalized] = useState<Record<string, number>>({}); // id -> ts
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);

  // Clean up linger map
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setFinalized(prev => {
        const next: Record<string, number> = {};
        for (const [id, ts] of Object.entries(prev)) {
          // completed lingers 30s, rejected 5s
          const order = orders.find(o => o.id === id);
          const limit = order?.status === 'rejected' ? 5000 : 30000;
          if (now - ts < limit) next[id] = ts;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [orders]);

  // When an order leaves active state, add to finalized
  const prevActive = useRef<Set<string>>(new Set());
  useEffect(() => {
    const activeIds = new Set(orders.filter(o => o.status === 'pending' || o.status === 'in_progress').map(o => o.id));
    for (const id of prevActive.current) {
      if (!activeIds.has(id) && !finalized[id]) {
        setFinalized(prev => ({ ...prev, [id]: Date.now() }));
      }
    }
    prevActive.current = activeIds;
  }, [orders, finalized]);

  const kitchenOrders = useMemo(() => {
    const list = orders.filter(o => o.status === 'pending' || o.status === 'in_progress' || finalized[o.id]);
    // delivery first then by created_at ASC within group
    return list.sort((a, b) => {
      const aDel = ((a as any).order_type || 'dine_in') === 'delivery' ? 0 : 1;
      const bDel = ((b as any).order_type || 'dine_in') === 'delivery' ? 0 : 1;
      if (aDel !== bDel) return aDel - bDel;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [orders, finalized]);

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  // Auto-announce new pending orders
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const pending = orders.filter(o => o.status === 'pending');
    if (seenIds.current === null) { seenIds.current = new Set(pending.map(o => o.id)); return; }
    if (!autoAnnounce) { pending.forEach(o => seenIds.current!.add(o.id)); return; }
    const newOnes = pending.filter(o => !seenIds.current!.has(o.id));
    newOnes.forEach(o => seenIds.current!.add(o.id));
    if (newOnes.length && document.visibilityState === 'visible') {
      playChime();
      setTimeout(() => { newOnes.forEach((o, i) => setTimeout(() => speech.speakSummary(o), i * 100)); }, 350);
    }
  }, [orders, autoAnnounce, speech]);

  useNewOrderSound(soundEnabled ? pendingCount : -1);

  const handleLogout = async () => { await signOut(); navigate('/staff/login'); };

  const getItemStatusBadge = (status: string) => {
    switch (status) {
      case 'preparing': return <Badge className="bg-yellow-500/20 text-yellow-600 border-0 text-xs">Preparing</Badge>;
      case 'ready': return <Badge className="bg-green-500/20 text-green-600 border-0 text-xs">Ready</Badge>;
      case 'rejected': return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
      default: return <Badge variant="outline" className="text-xs">Pending</Badge>;
    }
  };

  const getOrderNumber = (order: any) => (order as any).order_number ? `#${(order as any).order_number}` : '';

  const handleAccept = async (id: string) => {
    setBusyId(id);
    try { await acceptOrder(id); } finally { setBusyId(null); }
  };

  const handleConfirmReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectOrder(id, rejectReason.trim() || undefined);
      // Broadcast rejection so customer menu can show toast
      const channel = (await import('@/integrations/supabase/client')).supabase.channel(`order-${id}`);
      await channel.subscribe();
      channel.send({ type: 'broadcast', event: 'rejected', payload: { orderId: id, reason: rejectReason.trim() || null } });
      setTimeout(() => channel.unsubscribe(), 1000);
    } finally {
      setBusyId(null);
      setRejectingId(null);
      setRejectReason('');
    }
  };

  const handleMarkReady = async (id: string) => {
    setBusyId(id);
    try { await markOrderReady(id); } finally { setBusyId(null); }
  };

  const canManageAvailability = role === 'kitchen' || role === 'owner';

  return (
    <div className="min-h-screen dark bg-background text-foreground">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Kitchen Orders</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Badge variant="secondary">{kitchenOrders.filter(o => !finalized[o.id]).length} active</Badge>
          {canManageAvailability && (
            <Sheet open={showAvailability} onOpenChange={setShowAvailability}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" title="Item availability"><Package className="w-4 h-4" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader><SheetTitle>Item availability</SheetTitle></SheetHeader>
                <div className="mt-4 space-y-2">
                  {menuItems.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No items.</p>}
                  {menuItems.map(mi => (
                    <div key={mi.id} className="flex items-center justify-between p-3 bg-card rounded-lg border gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{mi.name}</p>
                        <Badge variant="outline" className="text-[10px] mt-0.5">{mi.category}</Badge>
                      </div>
                      <Switch
                        checked={(mi as any).is_available !== false}
                        onCheckedChange={(v) => setItemAvailable(mi.id, v)}
                        aria-label={`Toggle ${mi.name} availability`}
                      />
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
          <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? 'Mute' : 'Unmute'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
        </div>
      </div>

      <SpeechTopBar speech={speech} orders={kitchenOrders} showAutoAnnounce autoAnnounce={autoAnnounce} onAutoAnnounceChange={setAutoAnnounce} />

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {kitchenOrders.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No pending orders</p>
            <p className="text-sm mt-1">New orders will appear here instantly</p>
          </div>
        )}
        {kitchenOrders.map(order => {
          const isDelivery = ((order as any).order_type || 'dine_in') === 'delivery';
          const isFinalized = !!finalized[order.id];
          const isCompleted = order.status === 'completed' || order.status === 'ready';
          const isRejected = order.status === 'rejected';
          const activeItems = order.items.filter(i => (i as any).status !== 'rejected');
          const allReady = activeItems.length > 0 && activeItems.every(i => (i as any).status === 'ready');

          // Finalized collapsed state
          if (isFinalized && (isCompleted || isRejected)) {
            return (
              <div key={order.id} className={`rounded-xl border p-3 flex items-center justify-between opacity-60 ${isRejected ? 'border-destructive/40' : 'border-green-600/40'}`}>
                <div className="flex items-center gap-2">
                  <CircleCheck className={`w-4 h-4 ${isRejected ? 'text-destructive' : 'text-green-600'}`} />
                  <span className="text-sm font-medium">Order {getOrderNumber(order)}</span>
                  <Badge variant="outline" className="text-xs">{isDelivery ? 'Delivery' : `Table ${order.table_number}`}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{isRejected ? 'Rejected' : 'Sent to billing'}</span>
              </div>
            );
          }

          return (
            <div
              key={order.id}
              className="bg-card rounded-xl border p-4 space-y-3"
              style={isDelivery ? { borderLeft: '4px solid #F59E0B' } : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold">Order {getOrderNumber(order)}</span>
                  {isDelivery ? (
                    <Badge className="bg-amber-500/20 text-amber-600 border-0 text-xs flex items-center gap-1">
                      <Bike className="w-3 h-3" /> Delivery
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Table {order.table_number}</Badge>
                  )}
                  <Badge variant={order.status === 'pending' ? 'destructive' : 'secondary'}>
                    {order.status === 'pending' ? 'NEW' : 'Accepted'}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                </span>
              </div>

              {isDelivery && (order.customer_name || order.customer_phone) && (
                <p className="text-xs text-muted-foreground">
                  For: <span className="text-foreground font-medium">{order.customer_name || 'Guest'}</span>
                  {order.customer_phone ? ` · ${order.customer_phone}` : ''}
                </p>
              )}

              {/* Pending: order-level accept/reject */}
              {order.status === 'pending' && rejectingId !== order.id && (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleAccept(order.id)} disabled={busyId === order.id}>
                    <Check className="w-4 h-4 mr-1" /> Accept order
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => setRejectingId(order.id)} disabled={busyId === order.id}>
                    <X className="w-4 h-4 mr-1" /> Reject order
                  </Button>
                </div>
              )}
              {order.status === 'pending' && rejectingId === order.id && (
                <div className="space-y-2 p-2 rounded-md bg-destructive/5 border border-destructive/30">
                  <Input placeholder="Reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="bg-background" />
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</Button>
                    <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleConfirmReject(order.id)} disabled={busyId === order.id}>Confirm reject</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {order.items.map((item) => {
                  const itemStatus = (item as any).status || 'pending';
                  const itemNote = (item as any).note || '';
                  return (
                    <div key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm flex-1">
                          <span className="font-mono font-bold text-primary">{item.quantity}×</span>
                          <span className={itemStatus === 'rejected' ? 'line-through text-muted-foreground' : ''}>{item.item_name}</span>
                          {getItemStatusBadge(itemStatus)}
                        </div>
                        {order.status === 'in_progress' && (
                          <>
                            {itemStatus === 'preparing' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-600/30 hover:bg-green-600/10"
                                onClick={() => updateOrderItemStatus(item.id, 'ready', order.id)}>
                                <CircleCheck className="w-3 h-3 mr-1" /> Ready
                              </Button>
                            )}
                            {itemStatus === 'ready' && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                                onClick={() => updateOrderItemStatus(item.id, 'preparing', order.id)}>
                                <CookingPot className="w-3 h-3 mr-1" /> Undo
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                      {itemNote && itemStatus !== 'rejected' && (
                        <p className="text-xs text-yellow-600 ml-8 italic">⚠ {itemNote}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {order.notes && <p className="text-sm text-muted-foreground italic">Note: {order.notes}</p>}

              <VoiceButtons order={order} speech={speech} />

              {order.status === 'in_progress' && allReady && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white animate-pulse"
                  onClick={() => handleMarkReady(order.id)}
                  disabled={busyId === order.id}
                >
                  <CircleCheck className="w-4 h-4 mr-1" /> Order ready — notify billing
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KitchenDashboard;
