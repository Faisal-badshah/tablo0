import type { Order } from '@/context/RestaurantContext';

export type SpeechLang = 'hi' | 'en';

const isDelivery = (o: Order) => ((o as any).order_type || 'dine_in') === 'delivery';
const orderNumber = (o: Order) => (o as any).order_number ?? '';
const activeItems = (o: Order) => o.items.filter(i => (i as any).status !== 'rejected');

export function buildSummary(order: Order, lang: SpeechLang): string {
  const num = orderNumber(order);
  const items = activeItems(order);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const names = items.map(i => i.item_name).join(', ');
  if (lang === 'hi') {
    return `Order number ${num}. kul ${count} items. ${names}.`;
  }
  return `Order number ${num}. ${count} items. ${names}.`;
}

export function buildFullDetail(order: Order, lang: SpeechLang): string {
  const num = orderNumber(order);
  const items = activeItems(order);
  const where = isDelivery(order)
    ? (lang === 'hi' ? 'Delivery order' : 'Delivery order')
    : (lang === 'hi' ? `Table number ${order.table_number}` : `Table ${order.table_number}`);
  const lines = items.map(i => `${i.quantity} ${i.item_name}.`).join(' ');
  const notes = items
    .map(i => (i as any).note)
    .filter(Boolean)
    .join('. ');
  const noteStr = notes ? ` Note: ${notes}.` : '';
  const total = Math.round(order.total_amount);
  if (lang === 'hi') {
    return `Order number ${num}, ${where}. ${lines}${noteStr} Total rupaye ${total}.`;
  }
  return `Order number ${num}, ${where}. ${lines}${noteStr} Total: ${total} rupees.`;
}

export function buildAllOrdersIntro(count: number, lang: SpeechLang): string {
  if (lang === 'hi') return `aap ke paas ${count} pending orders hain.`;
  return `You have ${count} pending orders.`;
}

export function buildShortForAll(order: Order, lang: SpeechLang): string {
  const num = orderNumber(order);
  const items = activeItems(order);
  const parts = items.map(i => `${i.quantity} ${i.item_name}`).join(', ');
  if (lang === 'hi') return `Order ${num}: ${parts}.`;
  return `Order ${num}: ${parts}.`;
}
