import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from './api';
import i18n from './i18n';

// ============================================================
// AUTH CONTEXT — current user + session token
// ============================================================
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const AUTH_KEY = 'redlook_auth_v1';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        const { user, token } = JSON.parse(raw);
        setUser(user);
        setToken(token);
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const persist = (u, t) => {
    if (u && t) localStorage.setItem(AUTH_KEY, JSON.stringify({ user: u, token: t }));
    else localStorage.removeItem(AUTH_KEY);
  };

  // Adopt the server-stored language preference whenever a session lands. If
  // the user picked a different language in this browser than what's saved
  // server-side, the server wins so the choice follows them across devices.
  const adoptUserLanguage = (u) => {
    if (u?.language && i18n.language !== u.language) {
      i18n.changeLanguage(u.language);
    }
  };

  const login = async (identifier, password) => {
    const { data } = await api.login(identifier, password);
    setUser(data.user);
    setToken(data.token);
    persist(data.user, data.token);
    adoptUserLanguage(data.user);
    return data.user;
  };

  const completeRegistration = (u, t) => {
    setUser(u);
    setToken(t);
    persist(u, t);
    adoptUserLanguage(u);
  };

  // Called by LanguageSwitcher when the user changes language while signed in
  // — fires PUT /users/:id so the choice follows them across devices.
  // Best-effort: silent failures are fine (next login will rewrite anyway).
  const syncLanguage = async (lang) => {
    if (!user) return;
    try {
      const response = await api.updateUser(user.customer_id, { language: lang });
      setUser(response.data);
      persist(response.data, token);
    } catch { /* network or auth glitch — local choice still applies */ }
  };

  const logout = async () => {
    if (token) { try { await api.logout(token); } catch { /* ignore */ } }
    setUser(null);
    setToken(null);
    persist(null, null);
  };

  const refreshUser = async () => {
    if (!user) return;
    const { data } = await api.getUser(user.customer_id);
    if (data) {
      setUser(data);
      persist(data, token);
      adoptUserLanguage(data);
    }
  };

  const updateUser = async (patch) => {
    const response = await api.updateUser(user.customer_id, patch);
    setUser(response.data);
    persist(response.data, token);
    // Return the full response (includes optional dev_otp echo when SMS is
    // mocked + the phone changed) so the profile page can toast it. The
    // updated user is at .data — callers that previously relied on the
    // raw user need to read .data now.
    return response;
  };

  return (
    <AuthContext.Provider value={{
      user, token, hydrated,
      isAuthenticated: !!user,
      login, logout, completeRegistration, refreshUser, updateUser, syncLanguage,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// CART CONTEXT — global cart, persisted per user (or guest)
// ============================================================
const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

const cartKey = (userId) => `redlook_cart_${userId || 'guest'}_v1`;

export function CartProvider({ children }) {
  const auth = useAuth();
  const userId = auth?.user?.customer_id;
  const [items, setItems] = useState([]);

  // Load cart for current user/guest whenever identity changes
  useEffect(() => {
    if (!auth?.hydrated) return;
    try {
      const raw = localStorage.getItem(cartKey(userId));
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, [userId, auth?.hydrated]);

  // Persist on every change
  useEffect(() => {
    if (!auth?.hydrated) return;
    localStorage.setItem(cartKey(userId), JSON.stringify(items));
  }, [items, userId, auth?.hydrated]);

  const addItem = (product, qty = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { id: product.id, name: product.name, price: product.price, mrp: product.mrp, unit: product.unit, image: product.image, qty }];
    });
  };
  const updateQty = (id, qty) => {
    if (qty <= 0) return removeItem(id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  };
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const clearCart = () => setItems([]);

  // Re-pull current prices for everything in the cart. Cart items are
  // persisted to localStorage with a price snapshot taken at add-time, so
  // an admin enabling a discount (or changing one) after items were added
  // wouldn't otherwise be reflected. CartPage and CheckoutPage call this on
  // mount so the totals the customer sees match what the backend will charge
  // at order placement.
  //
  // Stable (empty-deps) so consumers can use it in a one-shot useEffect
  // without retriggering. setItems uses the functional form to avoid a
  // stale-items closure.
  const refreshPrices = useCallback(async () => {
    try {
      const r = await api.getProducts();
      if (!r?.data) return;
      const fresh = Object.fromEntries(r.data.map((p) => [p.id, p]));
      setItems((prev) => prev.map((item) => {
        const f = fresh[item.id];
        if (!f) return item;
        // Only write back when something actually changed — avoids
        // dropping a re-render bomb on every page navigation.
        if (item.price === f.price && item.mrp === f.mrp) return item;
        return { ...item, price: f.price, mrp: f.mrp };
      }));
    } catch { /* ignore network blips — stale price is better than crash */ }
  }, []);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, refreshPrices, subtotal, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

// ============================================================
// WISHLIST CONTEXT — saved product IDs
// ============================================================
const WishlistContext = createContext(null);
export const useWishlist = () => useContext(WishlistContext);

export function WishlistProvider({ children }) {
  const { user, hydrated } = useAuth();
  const [ids, setIds] = useState([]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) { setIds([]); return; }
    api.getWishlist(user.customer_id).then(r => setIds(r.data || []));
  }, [user, hydrated]);

  const toggle = useCallback(async (productId) => {
    if (!user) throw new Error('NOT_AUTHENTICATED');
    if (ids.includes(productId)) {
      const { data } = await api.removeFromWishlist(user.customer_id, productId);
      setIds(data);
    } else {
      const { data } = await api.addToWishlist(user.customer_id, productId);
      setIds(data);
    }
  }, [user, ids]);

  const has = useCallback((id) => ids.includes(id), [ids]);

  return (
    <WishlistContext.Provider value={{ ids, toggle, has }}>
      {children}
    </WishlistContext.Provider>
  );
}

// ============================================================
// SETTINGS CONTEXT — operational thresholds + support contacts
// Fetched once on the customer side and shared with the footer, the floating
// help widget, and any other component that needs them. Falls back to
// sensible defaults if the request fails so the storefront never breaks.
// ============================================================
const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

// Default copy for the product-detail badges and home hero trust pills.
// Declared before DEFAULT_SETTINGS because that object spreads them. Mirrors
// the JSONB defaults on BusinessSettings so the storefront looks identical
// before the API settles. Returns badge has a second variant for the
// non-returnable case. Template tokens {free_delivery_over} and {next_slot}
// are resolved at render time on the storefront.
export const DEFAULT_PRODUCT_DETAIL_BADGES = [
  { key: 'delivery',  enabled: true, title: 'Free shipping',    subtitle: 'On qualifying orders' },
  { key: 'returns',   enabled: true, title: 'Easy returns',     subtitle: 'Within 7 days of delivery',
                                     title_alt: 'Non-returnable', subtitle_alt: 'No returns on this item' },
  { key: 'freshness', enabled: true, title: '100% genuine',     subtitle: 'Authenticity guaranteed' },
  // Slot subtitle is auto-filled with the live next-slot label by the
  // storefront — admins only edit the title.
  { key: 'slot',      enabled: true, title: 'Next slot',        subtitle: '' },
];

export const DEFAULT_HOME_HERO_FEATURES = [
  // Top-to-bottom page order: announcement pill, h1 (top + gradient bottom),
  // subheadline paragraph, optional background image (disabled by default),
  // then the three icon+label trust pills under the hero CTAs. Keep this
  // list in sync with HOME_HERO_KEYS in backend/src/routes/adminSettings.js.
  { key: 'announcement',     enabled: true,  title: 'Free shipping on orders above ₹999' },
  { key: 'headline_top',     enabled: true,  title: 'Style that turns heads,' },
  { key: 'headline_bottom',  enabled: true,  title: 'delivered to your door.' },
  { key: 'subheadline',      enabled: true,  title: 'Hand-picked drops from emerging Indian labels and trusted classics. Easy 7-day returns, no questions asked.' },
  { key: 'background_image', enabled: false, title: '' },
  { key: 'delivery',         enabled: true,  title: 'Fast nationwide delivery' },
  { key: 'freshness',        enabled: true,  title: '100% genuine guarantee' },
  { key: 'speed',            enabled: true,  title: 'Checkout in under 2 minutes' },
];

const DEFAULT_SETTINGS = {
  min_order_value: 499,
  min_order_quantity: 1,
  delivery_charge: 79,
  free_delivery_over: 999,
  delivery_slot_buffer_hours: 5,
  // Admin-configurable delivery slot catalog. Storefront falls back to its
  // bundled DEFAULT_DELIVERY_SLOTS when this is empty (mock mode / pre-
  // /api/settings paint), so leaving the array empty here keeps the
  // contract simple — the real values arrive over the wire.
  delivery_slots: [],
  // Sale-promo marquee catalog. Empty = no marquee rendered above hero.
  category_promotions: [],
  support_phone: null,
  support_whatsapp: null,
  support_email: null,
  support_message: null,
  theme: 'emerald',
  cancellation_cutoff_status: 'Out for Delivery',
  // Hours after delivery during which a return can still be filed. Admin-
  // configurable; default 168 (7 days) matches the apparel-industry norm.
  return_window_hours: 168,
  // Customer-facing return-policy copy. Null = hide the policy line.
  return_window_message: null,
  // Geofence — null lat/lng = "not configured", which means the backend
  // skips the radius check. 9 km matches the BRD default.
  firm_latitude: null,
  firm_longitude: null,
  delivery_radius_km: 9,
  // Company branding. Defaults match the original hardcoded strings so
  // the storefront looks identical pre-/post- the admin first opening
  // settings.
  company_name: 'Redlook',
  company_tagline: 'Curated style, delivered.',
  company_address: null,
  product_detail_badges: DEFAULT_PRODUCT_DETAIL_BADGES,
  home_hero_features: DEFAULT_HOME_HERO_FEATURES,
  // Resolved cap for the storefront "Max price" slider. The backend swaps
  // this for MAX(price) of Active products when admin has auto-mode on.
  // Default ₹2999 covers the seed catalog headroom (priciest item is the
  // ₹2299 White Sneakers).
  max_price_filter_cap: 2999,
};

// Mirrors backend CANCEL_CUTOFF_VALUES in routes/adminSettings.js.
// The cutoff is the first lifecycle status at which cancel is BLOCKED.
export const CANCEL_CUTOFF_OPTIONS = [
  { value: 'Confirmed',        label: 'Confirmed',        hint: 'Customer can cancel only while still "Placed".' },
  { value: 'Packed',           label: 'Packed',           hint: 'Customer can cancel up to "Confirmed".' },
  { value: 'Out for Delivery', label: 'Out for Delivery', hint: 'Customer can cancel up to "Packed". (Default)' },
  { value: 'Delivered',        label: 'Delivered',        hint: 'Customer can cancel anytime up to "Out for Delivery".' },
];

// Forward order of the lifecycle — used to compute "is current status before
// the cutoff". Mirrors ORDER_LIFECYCLE in backend lib/orderPolicy.js.
const ORDER_LIFECYCLE = ['Placed', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];

// Pure helper: can an order in `currentStatus` still be cancelled given the
// admin-configured cutoff? Used by the order tracking page to hide the
// Cancel CTA past the cutoff.
export function canCancelOrderClient(currentStatus, cutoffStatus) {
  if (['Cancelled', 'ReturnRequested'].includes(currentStatus)) return false;
  const cutoff = ORDER_LIFECYCLE.indexOf(cutoffStatus || 'Out for Delivery');
  const current = ORDER_LIFECYCLE.indexOf(currentStatus);
  if (cutoff < 0 || current < 0) return false;
  return current < cutoff;
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    api.getSettings()
      .then((r) => { if (!cancelled && r.data) setSettings({ ...DEFAULT_SETTINGS, ...r.data }); })
      .catch(() => { /* keep defaults on failure */ });
    return () => { cancelled = true; };
  }, []);
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

// ============================================================
// THEME — admin-controlled, site-wide
// ============================================================
//
// Reads `theme` from public /api/settings on mount and applies it to
// <html> via `data-theme` (drives the body background gradients in
// index.css) plus the `dark` class when theme === 'dark' (drives every
// Tailwind `dark:` variant across the codebase).
//
// Wraps both customer and admin branches so the admin's branding choice
// applies everywhere — that's the user-stated scope. Per-user theme
// overrides are intentionally NOT supported; this is a branding control.

// Catalog mirrors backend THEME_KEYS in routes/adminSettings.js. Adding a
// theme: extend backend enum + add a CSS block in index.css + add a swatch
// preview here for the picker UI.
export const THEMES = [
  { id: 'emerald',  label: 'Emerald',  hint: 'Default — fresh greens.',                preview: 'linear-gradient(135deg, #34d399, #10b981)' },
  { id: 'dark',     label: 'Dark',     hint: 'Slate dark mode for low-light reading.', preview: 'linear-gradient(135deg, #0f172a, #1e293b)' },
  { id: 'sunrise',  label: 'Sunrise',  hint: 'Warm amber and yellow palette.',         preview: 'linear-gradient(135deg, #fb923c, #fbbf24)' },
  { id: 'ocean',    label: 'Ocean',    hint: 'Cool cyan and blue palette.',            preview: 'linear-gradient(135deg, #38bdf8, #3b82f6)' },
  { id: 'lavender', label: 'Lavender', hint: 'Soft purple and pink palette.',          preview: 'linear-gradient(135deg, #c084fc, #f472b6)' },
  { id: 'marvel',   label: 'Marvel',   hint: 'Heroic red and gold — Iron Man energy.', preview: 'linear-gradient(135deg, #dc2626, #f59e0b)' },
  { id: 'dc',       label: 'DC',       hint: 'Midnight blue with a yellow signal.',    preview: 'linear-gradient(135deg, #1e3a8a, #fbbf24)' },
];
export const THEME_IDS = THEMES.map((t) => t.id);
const DEFAULT_THEME = 'emerald';

// Synchronously apply the theme to <html>. Called both on mount (after the
// fetch resolves) and from the admin settings page when an admin saves a
// new theme — gives the admin instant feedback without a page reload.
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const valid = THEME_IDS.includes(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', valid);
  document.documentElement.classList.toggle('dark', valid === 'dark');
}

const ThemeContext = createContext({ theme: DEFAULT_THEME, setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  // Fetch the active theme on mount. Public endpoint — no auth required.
  // We deliberately apply BEFORE the fetch lands too: render with the
  // default emerald look so the page isn't unstyled while the request
  // is in flight.
  useEffect(() => {
    applyTheme(DEFAULT_THEME);
    let cancelled = false;
    api.getSettings()
      .then((r) => {
        if (cancelled) return;
        const next = r?.data?.theme;
        if (THEME_IDS.includes(next)) {
          setThemeState(next);
          applyTheme(next);
        }
      })
      .catch(() => { /* keep default theme on failure */ });
    return () => { cancelled = true; };
  }, []);

  // Exposed setter — admin settings page calls this after a successful
  // PUT so the new theme reflects immediately.
  const setTheme = (next) => {
    if (!THEME_IDS.includes(next)) return;
    setThemeState(next);
    applyTheme(next);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

// ============================================================
// TOAST CONTEXT — transient notifications
// ============================================================
const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // duration in ms; default 3s. Pass a longer value (e.g. 12000) for toasts
  // the user needs time to read and copy — the dev-OTP echo on
  // register/resend/phone-change uses this so the 6-digit code doesn't
  // disappear before the customer has finished typing it.
  const push = useCallback((msg, type = 'success', duration = 3000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  // Stable reference so consumers that list `toast` as a hook dependency
  // (useCallback/useEffect) don't refire every time a toast is pushed or
  // auto-dismisses — that was causing the credit drawer to refetch and
  // collapse to a skeleton mid-edit, producing a visible "shake".
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideIn_.2s_ease-out] ${
              t.type === 'error' ? 'bg-red-600 text-white' :
              t.type === 'info' ? 'bg-stone-900 text-white' :
              'bg-emerald-600 text-white'
            }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

