import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useRestaurant } from '@/context/RestaurantContext';
import { formatCurrency } from '@/types/restaurant';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle, UtensilsCrossed, Loader2, AlertTriangle, Clock, ChefHat, CircleCheck, Box, Truck, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ArViewerModal } from '@/features/ar/ArViewerModal';
import { hexToHslTriplet } from '@/lib/brandColor';
import RestaurantNotFound from './RestaurantNotFound';
import { useDeliveryZone } from '@/hooks/useDeliveryZone';
import { DeliveryCheckoutSheet } from '@/features/delivery/DeliveryCheckoutSheet';
import { DeliveryStatusTracker } from '@/features/delivery/DeliveryStatusTracker';

const STORAGE_KEY = 'quickbite_customer';
const ACTIVE_DELIVERY_KEY = 'quickbite_active_delivery'; // stores only orderId, no PII/coords

interface TrackedItem {
  item_name: string;
  status: string;
  quantity: number;
}

const CustomerMenu = () => {
  const { tableNumber: paramTableNumber } = useParams<{ slug?: string; restaurantId?: string; tableNumber: string }>();
  const hasTable = !!paramTableNumber;
  const table = parseInt(paramTableNumber || '1');
  const { toast } = useToast();
  const {
    restaurantName, restaurantId, logoUrl, brandColor, notFound, resolving,
    menuItems, categories, cart, cartTotal, cartCount, loadingMenu,
    addToCart, removeFromCart, updateCartQuantity, updateCartItemNote, placeOrder,
  } = useRestaurant();
  const zone = useDeliveryZone(restaurantId);

  const [orderType, setOrderType] = useState<'dine_in' | 'delivery'>(hasTable ? 'dine_in' : 'delivery');
  const [showDeliveryCheckout, setShowDeliveryCheckout] = useState(false);
  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [deliveryOrderNumber, setDeliveryOrderNumber] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showLogin, setShowLogin] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [arItem, setArItem] = useState<{ name: string; modelUrl: string; iosUrl: string | null; image: string | null } | null>(null);

  // Recover active delivery tracker (only orderId persisted, no PII or coords)
  useEffect(() => {
    try {
      const id = sessionStorage.getItem(ACTIVE_DELIVERY_KEY);
      if (id) setActiveDeliveryId(id);
    } catch { /* ignore */ }
  }, []);

  // Default to delivery when no table, only if delivery is enabled
  useEffect(() => {
    if (!zone.loading && !hasTable && zone.deliveryEnabled) {
      setOrderType('delivery');
    }
  }, [zone.loading, zone.deliveryEnabled, hasTable]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Date.now() - data.savedAt < 30 * 24 * 60 * 60 * 1000) {
          setCustomerName(data.name || '');
          setCustomerPhone(data.phone || '');
          return;
        }
      }
    } catch { /* ignore */ }
    if (hasTable) setShowLogin(true);
  }, [hasTable]);

  // Poll for order item statuses after order placed
  useEffect(() => {
    if (!lastOrderId || !orderPlaced) return;

    const poll = async () => {
      const { data } = await supabase
        .from('order_items')
        .select('item_name, status, quantity')
        .eq('order_id', lastOrderId) as any;
      if (data) setTrackedItems(data);
    };

    poll(); // immediate
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [lastOrderId, orderPlaced]);

  const handleSaveCustomer = () => {
    if (customerName || customerPhone) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: customerName, phone: customerPhone, savedAt: Date.now() }));
    }
    setShowLogin(false);
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const orderId = await placeOrder(table, customerName, customerPhone, notes || undefined);
      if (orderId) {
        setLastOrderId(orderId);
        setTrackedItems([]);
        setOrderPlaced(true);
        setShowCart(false);
        setNotes('');
        // Try to fetch order_number (may need a moment for trigger)
        setTimeout(async () => {
          const { data } = await supabase
            .from('orders')
            .select('order_number')
            .eq('id', orderId)
            .maybeSingle() as any;
          if (data?.order_number) setOrderNumber(data.order_number);
        }, 500);
      } else {
        toast({ title: 'Order failed', description: 'Please try again.', variant: 'destructive' });
      }
    } catch (err) {
      console.error('[handlePlaceOrder] error:', err);
      toast({ title: 'Order failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setPlacing(false);
    }
  };

  const availableItems = menuItems.filter(mi => mi.available);
  const filteredItems = availableItems.filter(mi => selectedCategory === 'All' || mi.category === selectedCategory);

  // Group filtered items by category, preserving the owner's category order
  const groupedSections = (() => {
    const orderedNames = categories.map(c => c.name);
    // Include any item categories not in categories table (legacy) at the end
    const extraNames = Array.from(new Set(filteredItems.map(i => i.category))).filter(n => !orderedNames.includes(n));
    const allNames = [...orderedNames, ...extraNames];
    return allNames
      .map(name => ({ name, items: filteredItems.filter(i => i.category === name) }))
      .filter(s => s.items.length > 0);
  })();

  if (notFound) return <RestaurantNotFound />;

  if (loadingMenu || resolving) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const brandStyle = { ['--primary' as any]: hexToHslTriplet(brandColor) } as React.CSSProperties;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <Clock className="w-4 h-4 text-primary" />;
      case 'preparing': return <ChefHat className="w-4 h-4 text-yellow-600" />;
      case 'ready': return <CircleCheck className="w-4 h-4 text-green-600" />;
      case 'rejected': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Waiting';
      case 'accepted': return 'Accepted';
      case 'preparing': return 'Being prepared';
      case 'ready': return 'Ready!';
      case 'rejected': return 'Unavailable';
      default: return status;
    }
  };

  if (orderPlaced) {
    const rejectedItems = trackedItems.filter(i => i.status === 'rejected');
    const hasRejected = rejectedItems.length > 0;
    const allReady = trackedItems.length > 0 && trackedItems.filter(i => i.status !== 'rejected').every(i => i.status === 'ready');

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="space-y-4 max-w-sm w-full">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${allReady ? 'bg-green-500/10' : 'bg-primary/10'}`}>
            {allReady ? <CircleCheck className="w-10 h-10 text-green-600" /> : <CheckCircle className="w-10 h-10 text-primary" />}
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {allReady ? 'Order Ready!' : 'Order Sent!'}
          </h1>
          {orderNumber && (
            <p className="text-3xl font-bold text-primary">Order #{orderNumber}</p>
          )}
          <p className="text-muted-foreground">Table {table}</p>

          {trackedItems.length > 0 && (
            <div className="bg-card border rounded-xl p-4 text-left space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Order Status</p>
              {trackedItems.map((item, i) => (
                <div key={i} className={`flex items-center justify-between gap-2 text-sm ${item.status === 'rejected' ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className={item.status === 'rejected' ? 'line-through' : ''}>{item.quantity}× {item.item_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{getStatusLabel(item.status)}</span>
                </div>
              ))}
            </div>
          )}

          {hasRejected && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-left">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="font-semibold text-destructive text-sm">Some items are unavailable</span>
              </div>
            </div>
          )}

          <Button onClick={() => { setOrderPlaced(false); setLastOrderId(null); setTrackedItems([]); setOrderNumber(null); }} className="w-full mt-6">
            Order More
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24" style={brandStyle}>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={restaurantName} className="w-9 h-9 rounded-lg object-cover border" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
                {restaurantName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="font-bold text-foreground leading-tight">{restaurantName}</h1>
              <p className="text-xs text-muted-foreground">{hasTable ? `Table ${table}` : 'Browse menu'}</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">{customerName || 'Guest'}</Badge>
        </div>
      </div>

      {zone.deliveryEnabled && (
        <div className="max-w-lg mx-auto px-4 pt-3 space-y-2">
          <div className="inline-flex w-full rounded-full bg-secondary p-1">
            {(hasTable ? (['dine_in', 'delivery'] as const) : (['delivery', 'dine_in'] as const)).map((opt) => (
              <button
                key={opt}
                onClick={() => setOrderType(opt)}
                className={`flex-1 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  orderType === opt ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70'
                }`}
              >
                {opt === 'dine_in' ? 'Dine-in' : 'Delivery'}
              </button>
            ))}
          </div>
          {orderType === 'delivery' && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80 flex items-start gap-2">
              <Truck className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />
              <span>
                {zone.deliveryFee > 0
                  ? `Delivers within ${zone.radiusKm}km · ₹${Math.round(zone.deliveryFee)} delivery fee · ~${zone.estimatedMinutes} min`
                  : `Free delivery within ${zone.radiusKm}km · ~${zone.estimatedMinutes} min`}
                {zone.minOrderAmount > 0 && ` · Min. order ₹${Math.round(zone.minOrderAmount)}`}
              </span>
            </div>
          )}
        </div>
      )}

      {!hasTable && !zone.deliveryEnabled && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
            Scan a table QR code to place a dine-in order.
          </div>
        </div>
      )}

      <div className="sticky top-[57px] z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex gap-2 px-4 py-2 overflow-x-auto max-w-lg mx-auto scrollbar-hide">
          {['All', ...categories.map(c => c.name)].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        {groupedSections.length === 0 && (
          <p className="text-center py-10 text-muted-foreground">No items available.</p>
        )}
        {groupedSections.map(section => (
          <section key={section.name} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">{section.name}</h2>
              <span className="text-xs text-muted-foreground">{section.items.length}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-3">
              {section.items.map(item => {
                const inCart = cart.find(ci => ci.menuItem.id === item.id);
                const imgUrl = (item as any).image_url as string | null;
                const arUrl = (item as any).ar_model_url as string | null;
                const arEnabled = (item as any).ar_enabled as boolean;
                const arVisible = arEnabled && !!arUrl;
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-card rounded-xl border gap-3">
                    {imgUrl && (
                      <img src={imgUrl} alt={item.name} loading="lazy" className="w-20 h-20 rounded-lg object-cover border flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-card-foreground">{item.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="font-bold text-primary">{formatCurrency(item.price)}</p>
                        {arVisible && (
                          <button
                            type="button"
                            onClick={() => setArItem({ name: item.name, modelUrl: arUrl!, iosUrl: (item as any).ar_usdz_url || null, image: imgUrl })}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                            aria-label={`View ${item.name} in AR`}
                          >
                            <Box className="w-3 h-3" /> View in AR
                          </button>
                        )}
                      </div>
                    </div>
                    {inCart ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateCartQuantity(item.id, inCart.quantity - 1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center font-semibold text-sm">{inCart.quantity}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => addToCart(item)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => addToCart(item)} className="flex-shrink-0">
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="max-w-lg mx-auto px-4 pt-4 pb-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        Powered by QuickBite
      </footer>

      {cartCount > 0 && (hasTable || (zone.deliveryEnabled && orderType === 'delivery')) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t no-print">
          {orderType === 'delivery' && zone.deliveryEnabled ? (
            <Button
              className="w-full max-w-lg mx-auto flex justify-between h-14 text-base"
              size="lg"
              onClick={() => setShowDeliveryCheckout(true)}
            >
              <span className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                {cartCount} item{cartCount > 1 ? 's' : ''} · Checkout
              </span>
              <span className="font-bold">{formatCurrency(cartTotal + Math.round(zone.deliveryFee))}</span>
            </Button>
          ) : (
            <Sheet open={showCart} onOpenChange={setShowCart}>
              <SheetTrigger asChild>
                <Button className="w-full max-w-lg mx-auto flex justify-between h-14 text-base" size="lg">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    {cartCount} item{cartCount > 1 ? 's' : ''}
                  </span>
                  <span className="font-bold">{formatCurrency(cartTotal)}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
                <SheetHeader><SheetTitle>Your Order</SheetTitle></SheetHeader>
                <div className="mt-4 space-y-4 overflow-y-auto max-h-[50vh]">
                  {cart.map(ci => (
                    <div key={ci.menuItem.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{ci.menuItem.name}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(ci.menuItem.price)} × {ci.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{formatCurrency(ci.menuItem.price * ci.quantity)}</span>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeFromCart(ci.menuItem.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <Input placeholder="Special instructions (e.g. no onion)" value={ci.note} onChange={e => updateCartItemNote(ci.menuItem.id, e.target.value)} className="text-xs h-8" />
                    </div>
                  ))}
                </div>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <Input placeholder="Any general notes? (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(cartTotal)}</span>
                  </div>
                  <Button className="w-full h-14 text-base" size="lg" onClick={handlePlaceOrder} disabled={placing}>
                    {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Place Order'}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}

      {/* Floating "Track your order" pill while a delivery is active */}
      {activeDeliveryId && !showDeliveryConfirm && (
        <button
          onClick={() => setShowDeliveryConfirm(true)}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground rounded-full shadow-lg px-4 py-2 text-sm font-semibold flex items-center gap-2"
        >
          <Truck className="w-4 h-4" /> Track your order
        </button>
      )}

      {/* Delivery checkout */}
      {zone.deliveryEnabled && (
        <DeliveryCheckoutSheet
          open={showDeliveryCheckout}
          onOpenChange={setShowDeliveryCheckout}
          zone={zone}
          cart={cart}
          cartTotal={cartTotal}
          onPlaced={(id) => {
            setShowDeliveryCheckout(false);
            setActiveDeliveryId(id);
            setShowDeliveryConfirm(true);
            try { sessionStorage.setItem(ACTIVE_DELIVERY_KEY, id); } catch { /* ignore */ }
            setTimeout(async () => {
              const { data } = await supabase.from('orders').select('order_number').eq('id', id).maybeSingle() as any;
              if (data?.order_number) setDeliveryOrderNumber(data.order_number);
            }, 500);
          }}
        />
      )}

      {/* Delivery confirmation / live tracker */}
      <Dialog open={showDeliveryConfirm} onOpenChange={(o) => {
        setShowDeliveryConfirm(o);
        if (!o) {
          // Clear active tracking once user dismisses if order is delivered/failed
          // (Tracker child component shows status; we leave activeDeliveryId until next session anyway.)
        }
      }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" /> Delivery on the way
            </DialogTitle>
          </DialogHeader>
          {activeDeliveryId && (
            <div className="space-y-4">
              {deliveryOrderNumber && (
                <p className="text-center text-2xl font-bold text-primary">Order #{deliveryOrderNumber}</p>
              )}
              <DeliveryStatusTracker
                orderId={activeDeliveryId}
                estimatedMinutes={zone.estimatedMinutes}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowDeliveryConfirm(false);
                  // If user wants to permanently dismiss, they can clear via finishing flow.
                  // Here we keep the floating pill for re-entry.
                }}
              >
                Back to menu
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => {
                  setActiveDeliveryId(null);
                  setShowDeliveryConfirm(false);
                  setDeliveryOrderNumber(null);
                  try { sessionStorage.removeItem(ACTIVE_DELIVERY_KEY); } catch { /* ignore */ }
                }}
              >
                Stop tracking
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
              Quick Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Name (optional)</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Your phone number" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowLogin(false)}>Skip</Button>
              <Button className="flex-1" onClick={handleSaveCustomer}>Continue</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {arItem && (
        <ArViewerModal
          open={!!arItem}
          onOpenChange={(o) => !o && setArItem(null)}
          itemName={arItem.name}
          modelUrl={arItem.modelUrl}
          iosUrl={arItem.iosUrl}
          fallbackImageUrl={arItem.image}
        />
      )}
    </div>
  );
};

export default CustomerMenu;
