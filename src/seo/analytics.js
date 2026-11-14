// GA4 analytics — fully gated on VITE_GA4_ID. With no id configured, nothing
// loads and every helper is a no-op, so the site ships analytics-ready without
// pulling in Google until you set the id. Events use real product/transaction
// data. If you later add GTM, point these at dataLayer instead.

const GA_ID = import.meta.env.VITE_GA4_ID || '';
let loaded = false;

function ensureLoaded() {
  if (!GA_ID || loaded || typeof window === 'undefined') return;
  loaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

export function initAnalytics() { ensureLoaded(); }

export function track(event, params = {}) {
  if (!GA_ID || typeof window === 'undefined') return;
  ensureLoaded();
  window.gtag?.('event', event, params);
}

const item = (p, qty) => ({
  item_id: p.id, item_name: p.name, item_category: p.category,
  price: Number(p.price) || 0, ...(qty ? { quantity: qty } : {}),
});

export const trackViewItem = (p) => track('view_item', { currency: 'INR', value: Number(p?.price) || 0, items: p ? [item(p)] : [] });
export const trackViewItemList = (list, name) => track('view_item_list', { item_list_name: name, items: (list || []).slice(0, 12).map((p) => item(p)) });
export const trackAddToCart = (p, qty = 1) => track('add_to_cart', { currency: 'INR', value: (Number(p?.price) || 0) * qty, items: p ? [item(p, qty)] : [] });
export const trackSearch = (q) => track('search', { search_term: q });
export const trackWhatsApp = () => track('whatsapp_click');
export const trackContact = () => track('contact_click');
export const trackDirections = () => track('directions_click');
