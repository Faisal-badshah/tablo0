import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type MenuItem = Tables<'menu_items'>;
type OrderRow = Tables<'orders'>;
type OrderItemRow = Tables<'order_items'>;
type RestaurantTable = Tables<'restaurant_tables'>;

export interface MenuCategoryRow {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  note: string;
}

export interface Order extends OrderRow {
  items: OrderItemRow[];
}

export interface TableSession {
  id: string;
  restaurant_id: string | null;
  table_number: number;
  status: string;
  created_at: string;
  closed_at: string | null;
  bill_requested_at?: string | null;
}

interface RestaurantContextType {
  restaurantName: string;
  restaurantSlug: string | null;
  restaurantId: string | null;
  logoUrl: string | null;
  brandColor: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  notFound: boolean;
  resolving: boolean;
  updateRestaurantSettings: (updates: { name?: string; slug?: string; logo_url?: string | null; primary_color?: string; address?: string | null; owner_phone?: string | null; is_active?: boolean; delivery_enabled?: boolean; delivery_radius_km?: number; delivery_fee?: number; min_order_amount?: number; estimated_delivery_minutes?: number; restaurant_lat?: number | null; restaurant_lng?: number | null }) => Promise<{ error?: string }>;
  placeDeliveryOrder: (params: { customerName: string; customerPhone: string; deliveryAddress: string; deliveryLat: number; deliveryLng: number; deliveryDistanceKm: number; deliveryFee: number; notes?: string }) => Promise<string | null>;
  updateOrderDeliveryStatus: (orderId: string, deliveryStatus: string) => Promise<void>;
  uploadLogo: (file: File) => Promise<string | null>;
  checkSlugAvailable: (candidate: string) => Promise<boolean>;
  menuItems: MenuItem[];
  categories: MenuCategoryRow[];
  tables: RestaurantTable[];
  orders: Order[];
  sessions: TableSession[];
  cart: CartItem[];
  cartTotal: number;
  cartCount: number;
  loadingMenu: boolean;
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, qty: number) => void;
  updateCartItemNote: (itemId: string, note: string) => void;
  clearCart: () => void;
  placeOrder: (tableNumber: number, customerName: string, customerPhone: string, notes?: string) => Promise<string | null>;
  updateOrderStatus: (orderId: string, status: string) => Promise<void>;
  updateOrderItemStatus: (itemId: string, status: string, orderId: string) => Promise<void>;
  updateOrderCustomer: (orderId: string, name: string, phone: string) => Promise<void>;
  updateOrderPayment: (orderId: string, method: 'cash' | 'card') => Promise<void>;
  closeSession: (sessionId: string, paymentMethod: 'cash' | 'card') => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  rejectOrder: (orderId: string, reason?: string) => Promise<void>;
  markOrderReady: (orderId: string) => Promise<void>;
  setItemAvailable: (itemId: string, available: boolean) => Promise<void>;
  reorderMenuItems: (itemIds: string[]) => Promise<void>;
  reorderCategories: (categoryIds: string[]) => Promise<void>;
  requestBillForTable: (tableNumber: number) => Promise<boolean>;
  addMenuItem: (item: { name: string; price: number; category: string; description: string; available: boolean; image_url?: string | null; category_id?: string | null }) => Promise<void>;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (id: string) => Promise<void>;
  addCategory: (name: string) => Promise<MenuCategoryRow | null>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  uploadMenuImage: (file: File) => Promise<string | null>;
  uploadArModel: (file: File, kind: 'glb' | 'usdz') => Promise<string | null>;
  addTable: (tableNumber: number) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  updateTableStatus: (id: string, status: string) => Promise<void>;
  refreshOrders: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | null>(null);

export const useRestaurant = () => {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('Must be inside RestaurantProvider');
  return ctx;
};

interface ProviderProps {
  children: ReactNode;
  restaurantId?: string | null;
  slug?: string | null;
  tableNumber?: string;
}

export const RestaurantProvider = ({ children, restaurantId: propRestaurantId, slug, tableNumber }: ProviderProps) => {
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(slug || null);
  const [resolvedRestaurantId, setResolvedRestaurantId] = useState<string | null>(propRestaurantId || null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState<string>('#F97316');
  const [address, setAddress] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [resolving, setResolving] = useState<boolean>(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategoryRow[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);

  const restaurantId = resolvedRestaurantId;

  const applyRestaurantRow = (data: any) => {
    setRestaurantName(data.name);
    setRestaurantSlug(data.slug ?? null);
    setLogoUrl(data.logo_url ?? null);
    setBrandColor(data.primary_color || '#F97316');
    setAddress(data.address ?? null);
    setPhone(data.owner_phone ?? null);
    setIsActive(data.is_active ?? true);
  };

  // Resolve restaurant by slug or ID
  useEffect(() => {
    const resolve = async () => {
      setResolving(true);
      setNotFound(false);
      if (slug) {
        const { data } = await supabase
          .from('restaurants')
          .select('id, name, slug, logo_url, primary_color, address, owner_phone, is_active')
          .eq('slug', slug)
          .maybeSingle() as any;
        if (data && data.is_active !== false) {
          setResolvedRestaurantId(data.id);
          applyRestaurantRow(data);
        } else {
          setNotFound(true);
          setRestaurantName('Restaurant Not Found');
        }
      } else if (propRestaurantId) {
        setResolvedRestaurantId(propRestaurantId);
        const { data } = await supabase
          .from('restaurants')
          .select('name, slug, logo_url, primary_color, address, owner_phone, is_active')
          .eq('id', propRestaurantId)
          .maybeSingle() as any;
        if (data) applyRestaurantRow(data);
      } else {
        setRestaurantName('Restaurant');
      }
      setResolving(false);
    };
    resolve();
  }, [slug, propRestaurantId]);

  // Fetch menu items
  const refreshMenu = useCallback(async () => {
    if (!restaurantId) { setLoadingMenu(false); return; }
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('name');
    if (data) setMenuItems(data);
    setLoadingMenu(false);
  }, [restaurantId]);
  useEffect(() => { refreshMenu(); }, [refreshMenu]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      if (!restaurantId) { setCategories([]); return; }
      const { data } = await (supabase as any).from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order');
      if (data) setCategories(data);
    };
    fetchCategories();
  }, [restaurantId]);

  // Fetch tables
  useEffect(() => {
    const fetchTables = async () => {
      if (!restaurantId) return;
      const { data } = await supabase.from('restaurant_tables').select('*').eq('restaurant_id', restaurantId).order('table_number');
      if (data) setTables(data);
    };
    fetchTables();
  }, [restaurantId]);

  // Fetch sessions
  const refreshSessions = useCallback(async () => {
    if (!restaurantId) { setSessions([]); return; }
    const { data } = await supabase
      .from('table_sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }) as any;
    if (data) setSessions(data);
  }, [restaurantId]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // Fetch orders with items
  const refreshOrders = useCallback(async () => {
    if (!restaurantId) { setOrders([]); return; }
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .not('status', 'eq', 'archived')
      .order('created_at', { ascending: false });

    if (!ordersData) { setOrders([]); return; }

    const orderIds = ordersData.map(o => o.id);
    if (orderIds.length === 0) { setOrders([]); return; }

    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds);

    const itemsByOrder = (itemsData || []).reduce<Record<string, OrderItemRow[]>>((acc, item) => {
      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push(item);
      return acc;
    }, {});

    setOrders(ordersData.map(o => ({ ...o, items: itemsByOrder[o.id] || [] })));
  }, [restaurantId]);

  // Real-time subscription
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('restaurant-realtime-' + restaurantId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refreshOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => refreshOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => refreshSessions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` }, () => refreshMenu())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshOrders, refreshSessions, refreshMenu, restaurantId]);

  useEffect(() => { refreshOrders(); }, [refreshOrders]);

  const cartTotal = useMemo(() => cart.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, ci) => s + ci.quantity, 0), [cart]);

  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(ci => ci.menuItem.id === item.id);
      if (existing) return prev.map(ci => ci.menuItem.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, { menuItem: item, quantity: 1, note: '' }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(ci => ci.menuItem.id !== itemId));
  }, []);

  const updateCartQuantity = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(ci => ci.menuItem.id !== itemId)); return; }
    setCart(prev => prev.map(ci => ci.menuItem.id === itemId ? { ...ci, quantity: qty } : ci));
  }, []);

  const updateCartItemNote = useCallback((itemId: string, note: string) => {
    setCart(prev => prev.map(ci => ci.menuItem.id === itemId ? { ...ci, note } : ci));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const placeOrder = useCallback(async (tableNumber: number, customerName: string, customerPhone: string, notes?: string) => {
    const totalAmount = cart.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
    const orderId = crypto.randomUUID();

    console.log('[placeOrder] restaurant_id:', restaurantId, 'table:', tableNumber, 'items:', cart.length, 'total:', totalAmount);

    // Find or create a session for this table
    let sessionId: string | null = null;
    if (restaurantId) {
      const { data: existingSession } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('table_number', tableNumber)
        .eq('status', 'open')
        .maybeSingle() as any;

      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const newSessionId = crypto.randomUUID();
        const { error: sessionError } = await supabase
          .from('table_sessions')
          .insert({ id: newSessionId, restaurant_id: restaurantId, table_number: tableNumber, status: 'open' } as any);
        if (!sessionError) sessionId = newSessionId;
      }
    }

    const insertData: Record<string, unknown> = {
      id: orderId,
      table_number: tableNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      total_amount: totalAmount,
      notes: notes || '',
      status: 'pending',
      order_type: 'dine_in',
    };
    if (restaurantId) insertData.restaurant_id = restaurantId;
    if (sessionId) insertData.session_id = sessionId;

    const { error: orderError } = await supabase
      .from('orders')
      .insert(insertData as any);

    if (orderError) {
      console.error('[placeOrder] order insert failed:', orderError);
      return null;
    }

    const orderItems = cart.map(ci => ({
      order_id: orderId,
      item_name: ci.menuItem.name,
      quantity: ci.quantity,
      price: ci.menuItem.price,
      status: 'pending',
      note: ci.note || '',
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems as any);
    if (itemsError) {
      console.error('[placeOrder] order_items insert failed:', itemsError);
      return null;
    }

    console.log('[placeOrder] success, orderId:', orderId, 'sessionId:', sessionId);
    setCart([]);
    return orderId;
  }, [cart, restaurantId]);

  const updateOrderStatus = useCallback(async (orderId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    if (status === 'billed') updates.billed_at = new Date().toISOString();
    await supabase.from('orders').update(updates).eq('id', orderId);
  }, []);

  const updateOrderItemStatus = useCallback(async (itemId: string, status: string, orderId: string) => {
    await supabase.from('order_items').update({ status } as any).eq('id', itemId);

    // After updating, check all items for this order to derive order status
    const { data: allItems } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId) as any;

    if (!allItems) return;

    const allDecided = allItems.every((i: any) => i.status !== 'pending');
    if (!allDecided) return;

    const hasAccepted = allItems.some((i: any) => i.status === 'accepted' || i.status === 'preparing' || i.status === 'ready');
    const allRejected = allItems.every((i: any) => i.status === 'rejected');
    const allReady = allItems.filter((i: any) => i.status !== 'rejected').every((i: any) => i.status === 'ready');

    let newStatus: string;
    if (allRejected) {
      newStatus = 'rejected';
    } else if (allReady) {
      newStatus = 'completed';
    } else {
      newStatus = 'in_progress';
    }

    // Recalculate total based on non-rejected items
    const activeItems = allItems.filter((i: any) => i.status !== 'rejected');
    const newTotal = activeItems.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);

    await supabase.from('orders').update({
      status: newStatus,
      total_amount: newTotal,
      ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', orderId);
  }, []);

  const updateOrderCustomer = useCallback(async (orderId: string, name: string, phone: string) => {
    await supabase.from('orders').update({ customer_name: name, customer_phone: phone }).eq('id', orderId);
  }, []);

  const updateOrderPayment = useCallback(async (orderId: string, method: 'cash' | 'card') => {
    await supabase.from('orders').update({ payment_method: method }).eq('id', orderId);
  }, []);

  const closeSession = useCallback(async (sessionId: string, paymentMethod: 'cash' | 'card') => {
    const sessionOrders = orders.filter(o => (o as any).session_id === sessionId);
    const now = new Date().toISOString();
    for (const order of sessionOrders) {
      if (order.status !== 'billed' && order.status !== 'rejected') {
        await supabase.from('orders').update({
          status: 'billed',
          billed_at: now,
          payment_method: paymentMethod,
        }).eq('id', order.id);
      }
    }
    await supabase.from('table_sessions').update({
      status: 'closed',
      closed_at: now,
    } as any).eq('id', sessionId);
  }, [orders]);

  const acceptOrder = useCallback(async (orderId: string) => {
    await supabase.from('order_items').update({ status: 'preparing' } as any).eq('order_id', orderId).eq('status', 'pending');
    await supabase.from('orders').update({ status: 'in_progress' } as any).eq('id', orderId);
  }, []);

  const rejectOrder = useCallback(async (orderId: string, reason?: string) => {
    await supabase.from('order_items').update({ status: 'rejected' } as any).eq('order_id', orderId);
    await supabase.from('orders').update({ status: 'rejected', rejection_reason: reason || null } as any).eq('id', orderId);
  }, []);

  const markOrderReady = useCallback(async (orderId: string) => {
    await supabase.from('order_items').update({ status: 'ready' } as any).eq('order_id', orderId).neq('status', 'rejected');
    await supabase.from('orders').update({ status: 'completed', completed_at: new Date().toISOString() } as any).eq('id', orderId);
  }, []);

  const setItemAvailable = useCallback(async (itemId: string, available: boolean) => {
    await supabase.from('menu_items').update({ is_available: available } as any).eq('id', itemId);
    setMenuItems(prev => prev.map(mi => mi.id === itemId ? { ...mi, is_available: available } as any : mi));
  }, []);

  const reorderMenuItems = useCallback(async (itemIds: string[]) => {
    setMenuItems(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      const reordered = itemIds.map((id, i) => ({ ...(map.get(id) as MenuItem), sort_order: i } as MenuItem));
      const missing = prev.filter(p => !itemIds.includes(p.id));
      return [...reordered, ...missing];
    });
    await Promise.all(itemIds.map((id, i) => supabase.from('menu_items').update({ sort_order: i } as any).eq('id', id)));
  }, []);

  const reorderCategories = useCallback(async (categoryIds: string[]) => {
    setCategories(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      const reordered = categoryIds.map((id, i) => ({ ...(map.get(id) as MenuCategoryRow), sort_order: i }));
      const missing = prev.filter(p => !categoryIds.includes(p.id));
      return [...reordered, ...missing];
    });
    await Promise.all(categoryIds.map((id, i) => (supabase as any).from('menu_categories').update({ sort_order: i }).eq('id', id)));
  }, []);

  const requestBillForTable = useCallback(async (tableNumber: number): Promise<boolean> => {
    if (!restaurantId) return false;
    const { data: session } = await supabase
      .from('table_sessions')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('table_number', tableNumber)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as any;
    if (!session) return false;
    await supabase.from('table_sessions').update({ bill_requested_at: new Date().toISOString() } as any).eq('id', session.id);
    return true;
  }, [restaurantId]);

  const addMenuItem = useCallback(async (item: { name: string; price: number; category: string; description: string; available: boolean; image_url?: string | null; category_id?: string | null }) => {
    const insertData: Record<string, unknown> = { ...item };
    if (restaurantId) insertData.restaurant_id = restaurantId;
    const { data } = await supabase.from('menu_items').insert(insertData as any).select().single();
    if (data) setMenuItems(prev => [...prev, data]);
  }, [restaurantId]);

  const addCategory = useCallback(async (name: string): Promise<MenuCategoryRow | null> => {
    if (!restaurantId) return null;
    const sort_order = categories.length;
    const { data, error } = await (supabase as any)
      .from('menu_categories')
      .insert({ restaurant_id: restaurantId, name: name.trim(), sort_order })
      .select()
      .single();
    if (error || !data) return null;
    setCategories(prev => [...prev, data]);
    return data as MenuCategoryRow;
  }, [restaurantId, categories.length]);

  const updateCategory = useCallback(async (id: string, name: string) => {
    await (supabase as any).from('menu_categories').update({ name: name.trim() }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: name.trim() } : c));
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await (supabase as any).from('menu_categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
  }, []);

  const uploadMenuImage = useCallback(async (file: File): Promise<string | null> => {
    if (!restaurantId) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: false });
    if (error) {
      console.error('[uploadMenuImage] failed:', error);
      return null;
    }
    const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
    return data.publicUrl;
  }, [restaurantId]);

  const uploadArModel = useCallback(async (file: File, kind: 'glb' | 'usdz'): Promise<string | null> => {
    if (!restaurantId) return null;
    const path = `${restaurantId}/${crypto.randomUUID()}.${kind}`;
    const contentType = kind === 'glb' ? 'model/gltf-binary' : 'model/vnd.usdz+zip';
    const { error } = await supabase.storage.from('ar-models').upload(path, file, { upsert: false, contentType });
    if (error) {
      console.error('[uploadArModel] failed:', error);
      return null;
    }
    const { data } = supabase.storage.from('ar-models').getPublicUrl(path);
    return data.publicUrl;
  }, [restaurantId]);

  const updateMenuItem = useCallback(async (id: string, updates: Partial<MenuItem>) => {
    await supabase.from('menu_items').update(updates).eq('id', id);
    setMenuItems(prev => prev.map(mi => mi.id === id ? { ...mi, ...updates } : mi));
  }, []);

  const deleteMenuItem = useCallback(async (id: string) => {
    await supabase.from('menu_items').delete().eq('id', id);
    setMenuItems(prev => prev.filter(mi => mi.id !== id));
  }, []);

  const addTable = useCallback(async (tableNumber: number) => {
    const insertData: Record<string, unknown> = { table_number: tableNumber, status: 'available' };
    if (restaurantId) insertData.restaurant_id = restaurantId;
    const { data, error } = await supabase.from('restaurant_tables').insert(insertData as any).select().single();
    if (error) throw error;
    if (data) setTables(prev => [...prev, data]);
  }, [restaurantId]);

  const deleteTable = useCallback(async (id: string) => {
    await supabase.from('restaurant_tables').delete().eq('id', id);
    setTables(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTableStatus = useCallback(async (id: string, status: string) => {
    await supabase.from('restaurant_tables').update({ status } as any).eq('id', id);
    setTables(prev => prev.map(t => t.id === id ? { ...t, status } as any : t));
  }, []);

  const uploadLogo = useCallback(async (file: File): Promise<string | null> => {
    if (!restaurantId) return null;
    const ext = file.name.split('.').pop() || 'png';
    const path = `${restaurantId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('restaurant-logos').upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      console.error('[uploadLogo] failed:', error);
      return null;
    }
    const { data } = supabase.storage.from('restaurant-logos').getPublicUrl(path);
    return data.publicUrl;
  }, [restaurantId]);

  const checkSlugAvailable = useCallback(async (candidate: string): Promise<boolean> => {
    if (!candidate) return false;
    const { data } = await supabase.from('restaurants').select('id').eq('slug', candidate).maybeSingle() as any;
    if (!data) return true;
    return data.id === restaurantId;
  }, [restaurantId]);

  const updateRestaurantSettings = useCallback(async (updates: { name?: string; slug?: string; logo_url?: string | null; primary_color?: string; address?: string | null; owner_phone?: string | null; is_active?: boolean; delivery_enabled?: boolean; delivery_radius_km?: number; delivery_fee?: number; min_order_amount?: number; estimated_delivery_minutes?: number; restaurant_lat?: number | null; restaurant_lng?: number | null }) => {
    if (!restaurantId) return { error: 'No restaurant context' };
    const { error } = await supabase.from('restaurants').update(updates as any).eq('id', restaurantId);
    if (error) return { error: error.message };
    if (updates.name !== undefined) setRestaurantName(updates.name);
    if (updates.slug !== undefined) setRestaurantSlug(updates.slug);
    if (updates.logo_url !== undefined) setLogoUrl(updates.logo_url);
    if (updates.primary_color !== undefined) setBrandColor(updates.primary_color);
    if (updates.address !== undefined) setAddress(updates.address);
    if (updates.owner_phone !== undefined) setPhone(updates.owner_phone);
    if (updates.is_active !== undefined) setIsActive(updates.is_active);
    return {};
  }, [restaurantId]);

  const placeDeliveryOrder = useCallback(async (params: { customerName: string; customerPhone: string; deliveryAddress: string; deliveryLat: number; deliveryLng: number; deliveryDistanceKm: number; deliveryFee: number; notes?: string }) => {
    if (!restaurantId) return null;
    const subtotal = cart.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
    const totalAmount = subtotal + Math.round(params.deliveryFee);
    const orderId = crypto.randomUUID();

    const insertData: Record<string, unknown> = {
      id: orderId,
      restaurant_id: restaurantId,
      table_number: 0,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      total_amount: totalAmount,
      notes: params.notes || '',
      status: 'pending',
      order_type: 'delivery',
      delivery_address: params.deliveryAddress,
      delivery_lat: params.deliveryLat,
      delivery_lng: params.deliveryLng,
      delivery_distance_km: params.deliveryDistanceKm,
      delivery_fee: params.deliveryFee,
      delivery_status: 'pending',
    };

    const { error: orderError } = await supabase.from('orders').insert(insertData as any);
    if (orderError) {
      console.error('[placeDeliveryOrder] order insert failed:', orderError);
      return null;
    }

    const orderItems = cart.map(ci => ({
      order_id: orderId,
      item_name: ci.menuItem.name,
      quantity: ci.quantity,
      price: ci.menuItem.price,
      status: 'pending',
      note: ci.note || '',
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems as any);
    if (itemsError) {
      console.error('[placeDeliveryOrder] order_items insert failed:', itemsError);
      return null;
    }

    setCart([]);
    return orderId;
  }, [cart, restaurantId]);

  const updateOrderDeliveryStatus = useCallback(async (orderId: string, deliveryStatus: string) => {
    const updates: Record<string, unknown> = { delivery_status: deliveryStatus };
    // When marked delivered, also flip order status to 'billed' so revenue counts and it leaves the active queue.
    if (deliveryStatus === 'delivered') {
      updates.status = 'billed';
      updates.billed_at = new Date().toISOString();
      updates.completed_at = new Date().toISOString();
    }
    await supabase.from('orders').update(updates as any).eq('id', orderId);
  }, []);

  const value = useMemo(() => ({
    restaurantName, restaurantSlug, restaurantId: restaurantId ?? null,
    logoUrl, brandColor, address, phone, isActive, notFound, resolving,
    updateRestaurantSettings, uploadLogo, checkSlugAvailable,
    menuItems, categories, tables, orders, sessions, cart, cartTotal, cartCount, loadingMenu,
    addToCart, removeFromCart, updateCartQuantity, updateCartItemNote, clearCart, placeOrder,
    placeDeliveryOrder, updateOrderDeliveryStatus,
    updateOrderStatus, updateOrderItemStatus, updateOrderCustomer, updateOrderPayment, closeSession,
    acceptOrder, rejectOrder, markOrderReady, setItemAvailable, reorderMenuItems, reorderCategories, requestBillForTable,
    addMenuItem, updateMenuItem, deleteMenuItem, addCategory, updateCategory, deleteCategory, uploadMenuImage, uploadArModel,
    addTable, deleteTable, updateTableStatus, refreshOrders,
  }), [restaurantName, restaurantSlug, restaurantId, logoUrl, brandColor, address, phone, isActive, notFound, resolving,
    updateRestaurantSettings, uploadLogo, checkSlugAvailable,
    menuItems, categories, tables, orders, sessions, cart, cartTotal, cartCount, loadingMenu,
    addToCart, removeFromCart, updateCartQuantity, updateCartItemNote, clearCart, placeOrder,
    placeDeliveryOrder, updateOrderDeliveryStatus,
    updateOrderStatus, updateOrderItemStatus, updateOrderCustomer, updateOrderPayment, closeSession,
    acceptOrder, rejectOrder, markOrderReady, setItemAvailable, reorderMenuItems, reorderCategories, requestBillForTable,
    addMenuItem, updateMenuItem, deleteMenuItem, addCategory, updateCategory, deleteCategory, uploadMenuImage, uploadArModel,
    addTable, deleteTable, updateTableStatus, refreshOrders]);

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
};
