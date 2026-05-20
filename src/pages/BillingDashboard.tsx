import { useState, useMemo, useEffect, useRef } from 'react';
import { useRestaurant, Order, TableSession } from '@/context/RestaurantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt, LogOut, Printer, CreditCard, Banknote, History, Clock, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/types/restaurant';
import { useAuth } from '@/hooks/useAuth';
import { useSpeechOrder } from '@/features/speech/useSpeechOrder';
import { SpeechTopBar, VoiceButtons } from '@/features/speech/SpeechControls';
import { playChime } from '@/features/speech/useSpeechOrder';

interface SessionGroup {
  session: TableSession;
  orders: Order[];
  total: number;
  hasReady: boolean;
  readyAt: string | null;
  billRequestedAt: string | null;
}

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const timeOnly = (dateStr: string | null) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const consolidateItems = (orders: Order[]) => {
  const map = new Map<string, { item_name: string; quantity: number; price: number; total: number; key: string }>();
  for (const o of orders) {
    for (const it of o.items) {
      if ((it as any).status === 'rejected') continue;
      const key = `${it.item_name}__${it.price}`;
      const ex = map.get(key);
      if (ex) { ex.quantity += it.quantity; ex.total += it.price * it.quantity; }
      else map.set(key, { key, item_name: it.item_name, quantity: it.quantity, price: it.price, total: it.price * it.quantity });
    }
  }
  return Array.from(map.values());
};

const BillingDashboard = () => {
  const { orders, sessions, updateOrderStatus, updateOrderCustomer, updateOrderPayment, closeSession, restaurantName } = useRestaurant();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [editingCustomer, setEditingCustomer] = useState<Record<string, { name: string; phone: string }>>({});
  const speech = useSpeechOrder();

  // Sessions including bill-requested or with ready orders
  const openSessions: SessionGroup[] = useMemo(() => {
    return sessions.filter(s => s.status === 'open').map(session => {
      const sessionOrders = orders.filter(o => (o as any).session_id === session.id && o.status !== 'rejected');
      const total = sessionOrders.reduce((sum, o) => sum + o.total_amount, 0);
      const hasReady = sessionOrders.some(o => o.status === 'completed' || o.status === 'ready');
      const readyAt = sessionOrders.filter(o => o.status === 'completed' || o.status === 'ready')
        .map(o => (o as any).completed_at).filter(Boolean).sort().pop() || null;
      return {
        session, orders: sessionOrders, total, hasReady, readyAt,
        billRequestedAt: (session as any).bill_requested_at || null,
      };
    }).filter(sg => sg.orders.length > 0 && (sg.hasReady || sg.billRequestedAt));
  }, [sessions, orders]);

  const unlinkedQueue = orders.filter(o => o.status === 'completed' && !(o as any).session_id && ((o as any).order_type || 'dine_in') !== 'delivery');

  const closedSessions: SessionGroup[] = useMemo(() => {
    return sessions.filter(s => s.status === 'closed').map(session => {
      const sessionOrders = orders.filter(o => (o as any).session_id === session.id);
      const total = sessionOrders.reduce((sum, o) => sum + o.total_amount, 0);
      return { session, orders: sessionOrders, total, hasReady: true, readyAt: null, billRequestedAt: null };
    }).filter(sg => sg.orders.length > 0);
  }, [sessions, orders]);

  const billingHistory = orders.filter(o => o.status === 'billed' && !(o as any).session_id);

  // Audio chime when a bill is newly requested
  const prevRequested = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentRequested = new Set(openSessions.filter(sg => sg.billRequestedAt).map(sg => sg.session.id));
    for (const id of currentRequested) {
      if (!prevRequested.current.has(id)) {
        playChime();
        break;
      }
    }
    prevRequested.current = currentRequested;
  }, [openSessions]);

  const handleLogout = async () => { await signOut(); navigate('/staff/login'); };

  const startEditCustomer = (orderId: string, name: string, phone: string) => {
    setEditingCustomer(prev => ({ ...prev, [orderId]: { name, phone } }));
  };
  const saveCustomer = (orderId: string) => {
    const data = editingCustomer[orderId];
    if (data) {
      updateOrderCustomer(orderId, data.name, data.phone);
      setEditingCustomer(prev => { const next = { ...prev }; delete next[orderId]; return next; });
    }
  };

  const handlePrintSession = (sg: SessionGroup) => {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    const items = consolidateItems(sg.orders);
    win.document.write(`
      <html><head><title>Bill - Table ${sg.session.table_number}</title>
      <style>body{font-family:monospace;padding:20px;max-width:350px;margin:0 auto}h2{text-align:center;margin-bottom:4px}p.sub{text-align:center;font-size:0.85em;color:#666}hr{border:none;border-top:1px dashed #333;margin:10px 0}.item{display:flex;justify-content:space-between;padding:2px 0}.total{font-size:1.2em;font-weight:bold;display:flex;justify-content:space-between;padding:6px 0}</style></head>
      <body>
        <h2>${restaurantName}</h2>
        <p class="sub">Table ${sg.session.table_number}</p>
        <p class="sub">${sg.orders.length} round${sg.orders.length === 1 ? '' : 's'}</p>
        <hr/>
        ${items.map(i => `<div class="item"><span>${i.quantity}× ${i.item_name}</span><span>${formatCurrency(i.total)}</span></div>`).join('')}
        <hr/>
        <div class="total"><span>TOTAL</span><span>${formatCurrency(sg.total)}</span></div>
        <hr/>
        <p style="text-align:center;font-size:0.8em;color:#666;margin-top:16px">Thank you for dining with us!</p>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const handlePrint = (order: Order) => {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>Bill - Table ${order.table_number}</title>
      <style>body{font-family:monospace;padding:20px;max-width:350px;margin:0 auto}h2{text-align:center;margin-bottom:4px}p.sub{text-align:center;font-size:0.85em;color:#666}hr{border:none;border-top:1px dashed #333;margin:10px 0}.item{display:flex;justify-content:space-between;padding:2px 0}.total{font-size:1.2em;font-weight:bold;display:flex;justify-content:space-between;padding:6px 0}</style></head>
      <body><h2>${restaurantName}</h2><p class="sub">Table ${order.table_number}</p><hr/>
        ${order.items.map(i => `<div class="item"><span>${i.quantity}× ${i.item_name}</span><span>${formatCurrency(i.price * i.quantity)}</span></div>`).join('')}
        <hr/><div class="total"><span>TOTAL</span><span>${formatCurrency(order.total_amount)}</span></div>
        <hr/><p style="text-align:center;font-size:0.8em;color:#666;margin-top:16px">Thank you!</p>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const [sessionPayment, setSessionPayment] = useState<Record<string, 'cash' | 'card'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const totalReady = openSessions.length + unlinkedQueue.length;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Billing</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{totalReady} ready</Badge>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
        </div>
      </div>

      <SpeechTopBar speech={speech} orders={[...openSessions.flatMap(sg => sg.orders), ...unlinkedQueue]} />

      <div className="p-4 max-w-2xl mx-auto">
        <Tabs defaultValue="queue">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="queue" className="flex-1 gap-1.5"><Receipt className="w-4 h-4" /> Queue ({totalReady})</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5"><History className="w-4 h-4" /> History ({closedSessions.length + billingHistory.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-4">
            {totalReady === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">No orders ready for billing</p>
                <p className="text-sm mt-1">Completed orders from kitchen will appear here</p>
              </div>
            )}

            {openSessions.map(sg => {
              const pm = sessionPayment[sg.session.id];
              const items = consolidateItems(sg.orders);
              const waitingForKitchen = !sg.hasReady && !!sg.billRequestedAt;
              return (
                <div key={sg.session.id} className="bg-card rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold">Table {sg.session.table_number}</span>
                      <Badge variant="outline" className="text-xs">{sg.orders.length} rounds</Badge>
                      {sg.billRequestedAt && (
                        <Badge className="bg-amber-500/20 text-amber-700 border-0 text-xs flex items-center gap-1">
                          <Bell className="w-3 h-3" /> Bill requested
                        </Badge>
                      )}
                    </div>
                    {!waitingForKitchen && <Badge className="bg-primary/10 text-primary border-0">Ready</Badge>}
                  </div>

                  {sg.readyAt && !waitingForKitchen && (
                    <p className="text-xs text-muted-foreground">Ready at {timeOnly(sg.readyAt)}</p>
                  )}
                  {waitingForKitchen && (
                    <p className="text-xs text-amber-700">Waiting for kitchen</p>
                  )}

                  <Separator />

                  <div className="space-y-1">
                    {items.map(it => (
                      <div key={it.key} className="flex justify-between text-sm">
                        <span>{it.quantity}× {it.item_name}</span>
                        <span className="font-medium">{formatCurrency(it.total)}</span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(sg.total)}</span>
                  </div>

                  {sg.orders[0] && (
                    <VoiceButtons speech={speech} order={{
                      ...sg.orders[0], id: sg.session.id, table_number: sg.session.table_number,
                      total_amount: sg.total, items: sg.orders.flatMap(o => o.items),
                    } as any} />
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant={pm === 'cash' ? 'default' : 'outline'} onClick={() => setSessionPayment(p => ({ ...p, [sg.session.id]: 'cash' }))} className="flex-1">
                      <Banknote className="w-4 h-4 mr-1" /> Cash
                    </Button>
                    <Button size="sm" variant={pm === 'card' ? 'default' : 'outline'} onClick={() => setSessionPayment(p => ({ ...p, [sg.session.id]: 'card' }))} className="flex-1">
                      <CreditCard className="w-4 h-4 mr-1" /> Card
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => handlePrintSession(sg)}>
                      <Printer className="w-4 h-4 mr-1" /> Print Bill
                    </Button>
                    <Button className="flex-1" onClick={async () => {
                      setBusy(sg.session.id);
                      try { await closeSession(sg.session.id, pm || 'cash'); } finally { setBusy(null); }
                    }} disabled={!pm || busy === sg.session.id || waitingForKitchen}>
                      Mark Paid
                    </Button>
                  </div>
                </div>
              );
            })}

            {unlinkedQueue.map(order => {
              const editing = editingCustomer[order.id];
              return (
                <div key={order.id} className="bg-card rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">Table {order.table_number}</span>
                    <Badge className="bg-primary/10 text-primary border-0">Ready</Badge>
                  </div>
                  {(order as any).completed_at && (
                    <p className="text-xs text-muted-foreground">Ready at {timeOnly((order as any).completed_at)}</p>
                  )}
                  {editing ? (
                    <div className="flex gap-2">
                      <Input placeholder="Name" value={editing.name} onChange={e => setEditingCustomer(prev => ({ ...prev, [order.id]: { ...prev[order.id], name: e.target.value } }))} className="text-sm" />
                      <Input placeholder="Phone" value={editing.phone} onChange={e => setEditingCustomer(prev => ({ ...prev, [order.id]: { ...prev[order.id], phone: e.target.value } }))} className="text-sm" />
                      <Button size="sm" onClick={() => saveCustomer(order.id)}>Save</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => startEditCustomer(order.id, order.customer_name || '', order.customer_phone || '')}>
                      <span>{order.customer_name || 'Guest'}</span>
                      {order.customer_phone && <span>• {order.customer_phone}</span>}
                      <span className="text-xs underline ml-1">(edit)</span>
                    </div>
                  )}
                  <Separator />
                  <div className="space-y-1">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.quantity}× {item.item_name}</span>
                        <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(order.total_amount)}</span>
                  </div>
                  <VoiceButtons speech={speech} order={order} />
                  <div className="flex gap-2">
                    <Button size="sm" variant={order.payment_method === 'cash' ? 'default' : 'outline'} onClick={() => updateOrderPayment(order.id, 'cash')} className="flex-1">
                      <Banknote className="w-4 h-4 mr-1" /> Cash
                    </Button>
                    <Button size="sm" variant={order.payment_method === 'card' ? 'default' : 'outline'} onClick={() => updateOrderPayment(order.id, 'card')} className="flex-1">
                      <CreditCard className="w-4 h-4 mr-1" /> Card
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => handlePrint(order)}><Printer className="w-4 h-4 mr-1" /> Print Bill</Button>
                    <Button className="flex-1" onClick={() => updateOrderStatus(order.id, 'billed')}>Mark Billed</Button>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {closedSessions.length === 0 && billingHistory.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg">No billing history yet</p>
                <p className="text-sm mt-1">Billed orders will appear here</p>
              </div>
            )}

            {closedSessions.map(sg => {
              const isOpen = expanded[sg.session.id];
              const items = consolidateItems(sg.orders);
              const pm = sg.orders.find(o => o.payment_method)?.payment_method;
              return (
                <div key={sg.session.id} className="bg-card rounded-xl border p-4 space-y-2">
                  <button onClick={() => toggle(sg.session.id)} className="w-full flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">Table {sg.session.table_number}</span>
                      <Badge variant="outline" className="text-xs">{sg.orders.length} rounds</Badge>
                      <Badge variant="secondary">Paid</Badge>
                      {pm && (
                        <Badge className={pm === 'cash' ? 'bg-green-500/20 text-green-700 border-0 text-xs' : 'bg-blue-500/20 text-blue-700 border-0 text-xs'}>
                          {pm === 'cash' ? <Banknote className="w-3 h-3 mr-1 inline" /> : <CreditCard className="w-3 h-3 mr-1 inline" />}
                          {pm}
                        </Badge>
                      )}
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /><span>{formatTime(sg.session.closed_at)}</span></div>
                    <span className="font-semibold text-foreground">{formatCurrency(sg.total)}</span>
                  </div>
                  {isOpen && (
                    <div className="space-y-1 pt-2 border-t">
                      {items.map(it => (
                        <div key={it.key} className="flex justify-between text-sm">
                          <span>{it.quantity}× {it.item_name}</span>
                          <span className="font-medium">{formatCurrency(it.total)}</span>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => handlePrintSession(sg)}>
                        <Printer className="w-4 h-4 mr-1" /> Reprint Bill
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {billingHistory.map(order => {
              const isDelivery = ((order as any).order_type || 'dine_in') === 'delivery';
              const delFee = Number((order as any).delivery_fee || 0);
              const isOpen = expanded[order.id];
              return (
                <div key={order.id} className="bg-card rounded-xl border p-4 space-y-2">
                  <button onClick={() => toggle(order.id)} className="w-full flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{isDelivery ? 'Delivery' : `Table ${order.table_number}`}</span>
                      {isDelivery && <Badge variant="outline" className="text-xs">Delivery</Badge>}
                      <Badge variant="secondary">Paid</Badge>
                      {order.payment_method && (
                        <Badge className={order.payment_method === 'cash' ? 'bg-green-500/20 text-green-700 border-0 text-xs' : 'bg-blue-500/20 text-blue-700 border-0 text-xs'}>
                          {order.payment_method === 'cash' ? <Banknote className="w-3 h-3 mr-1 inline" /> : <CreditCard className="w-3 h-3 mr-1 inline" />}
                          {order.payment_method}
                        </Badge>
                      )}
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /><span>{formatTime(order.billed_at)}</span></div>
                    <span className="font-semibold text-foreground">{formatCurrency(order.total_amount)}</span>
                  </div>
                  {isOpen && (
                    <div className="space-y-1 pt-2 border-t">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span>{item.quantity}× {item.item_name}</span>
                          <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      ))}
                      {isDelivery && delFee > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground"><span>Delivery fee</span><span>{formatCurrency(delFee)}</span></div>
                      )}
                      {!isDelivery && (
                        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => handlePrint(order)}>
                          <Printer className="w-4 h-4 mr-1" /> Reprint Bill
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BillingDashboard;
