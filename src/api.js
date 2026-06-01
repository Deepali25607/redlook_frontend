// ============================================================
// API LAYER - Single point to swap mocks for real backend
// ============================================================
// Configured via Vite env vars (in `.env` at the frontend root):
//   VITE_USE_MOCK=true   → in-memory + localStorage mock (Phase 1 demo)
//   VITE_USE_MOCK=false  → real backend at VITE_API_BASE_URL (Phase 2+)
// Defaults below kick in when no .env is present.
// ============================================================

export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Host portion of the API for static asset URLs (uploaded product images
// are served from /uploads/... at the API origin, NOT the /api prefix).
// In mock mode there's no real host — relative URLs would 404, so we leave
// this empty and the resolveImageUrl helper short-circuits to null.
export const API_HOST = USE_MOCK ? '' : API_BASE_URL.replace(/\/api\/?$/, '');

// Returns a fully-qualified image URL when src is an upload path or absolute
// URL, or null when src is an emoji / unrecognised string. Callers that want
// "render <img> if URL else render text" branch on the return value.
export function resolveImageUrl(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
  if (src.startsWith('/uploads/')) return API_HOST ? `${API_HOST}${src}` : null;
  return null;
}

// Stored separately by AuthContext; we read it here so the mock layer can ignore
// it but the real fetch path can attach the Bearer header automatically.
const AUTH_KEY = 'redlook_auth_v1';
function readToken() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || '{}').token || null; }
  catch { return null; }
}

// Admin token lives in its own localStorage slot so customer logout never
// clears admin auth and vice versa.
export const ADMIN_AUTH_KEY = 'redlook_admin_v1';
function readAdminToken() {
  try { return JSON.parse(localStorage.getItem(ADMIN_AUTH_KEY) || '{}').token || null; }
  catch { return null; }
}

// ------------------------------------------------------------
// Static catalog (would come from DB in Phase 2)
// ------------------------------------------------------------
export const MOCK_CATEGORIES = [
  { id: 'sarees',   name: 'Sarees',         icon: '🥻' },
  { id: 'lehengas', name: 'Lehengas',       icon: '💃' },
  { id: 'bridal',   name: 'Bridal Couture', icon: '👰' },
  { id: 'festive',  name: 'Festive Edit',   icon: '✨' },
  { id: 'designer', name: 'Designer',       icon: '👑' },
];

// Mirror of prisma/seed.js PRODUCTS — keep in sync. Used as the fallback
// catalog when VITE_USE_MOCK=true (offline demo). `freshness` here is the
// drop label ("Bestseller" / "Bridal Couture" / etc.) and `isOrganic` is
// the "Premium / Heritage" flag — semantics inherited from the upstream
// schema fork (kept stable so admin/orders code doesn't need refactoring).
export const MOCK_PRODUCTS = [
  { id: 'p1',  name: 'Banarasi Silk Saree — Crimson Zari',          category: 'sarees',   price:  4999, unit: 'piece', stock: 30, isOrganic: true,  image: '🥻', description: 'Hand-woven Banarasi silk in deep crimson with classic zari motifs along the border. Includes an unstitched blouse piece. Made in Varanasi by master weavers.',                rating: 4.9, reviews: 312, freshness: 'Bestseller' },
  { id: 'p2',  name: 'Kanjeevaram Pure Silk — Peacock Blue',        category: 'sarees',   price:  8999, unit: 'piece', stock: 22, isOrganic: true,  image: '🥻', description: 'Authentic Kanjeevaram from Tamil Nadu with a contrasting gold-thread pallu. Mulberry silk, heavyweight, an heirloom drape for weddings and pujas.',                            rating: 4.9, reviews: 198, freshness: 'Heritage' },
  { id: 'p3',  name: 'Chiffon Floral Saree — Blush Pink',           category: 'sarees',   price:  1799, unit: 'piece', stock: 80, isOrganic: false, image: '🌸', description: 'Lightweight chiffon with a watercolour floral print and a delicate sequin border. Effortless for daytime soirées and cocktail evenings.',                                   rating: 4.5, reviews: 156, freshness: 'New Arrival' },
  { id: 'p4',  name: 'Linen Cotton Saree — Ivory & Gold',           category: 'sarees',   price:  2499, unit: 'piece', stock: 60, isOrganic: false, image: '🤍', description: 'Breathable linen-cotton blend in ivory with hand-painted gold motifs. Office-ready, festive enough for daytime poojas.',                                                  rating: 4.4, reviews: 89,  freshness: 'Festive Edit' },
  { id: 'p5',  name: 'Bridal Lehenga — Royal Maroon',               category: 'lehengas', price: 14999, unit: 'piece', stock: 12, isOrganic: true,  image: '👰', description: 'Heavily embroidered velvet lehenga in royal maroon with zardozi work, kundan accents, and a 4-metre flare. Includes choli and net dupatta.',                                rating: 5.0, reviews: 87,  freshness: 'Bridal Couture' },
  { id: 'p6',  name: 'Designer Lehenga — Emerald & Gold',           category: 'lehengas', price:  9999, unit: 'piece', stock: 18, isOrganic: true,  image: '💚', description: 'Raw silk lehenga in deep emerald with intricate dabka embroidery. Cocktail-ready silhouette by an emerging Mumbai atelier.',                                                rating: 4.8, reviews: 142, freshness: 'Designer' },
  { id: 'p7',  name: 'Sangeet Lehenga — Rose Gold',                 category: 'lehengas', price:  6999, unit: 'piece', stock: 25, isOrganic: false, image: '🌹', description: 'Net lehenga with rose-gold sequin scatter, hand-stitched blouse, and a contrasting dupatta. Made to move under sangeet lights.',                                            rating: 4.7, reviews: 134, freshness: 'Bestseller' },
  { id: 'p8',  name: 'Bridal Saree — Red Tissue Silk',              category: 'bridal',   price: 12999, unit: 'piece', stock: 14, isOrganic: true,  image: '❤️', description: 'Tissue silk bridal saree in classic Indian red with all-over gold gota work and a 6-inch contrast border. The wedding-day drape.',                                              rating: 4.9, reviews: 76,  freshness: 'Bridal Couture' },
  { id: 'p9',  name: 'Festive Lehenga — Sunset Orange',             category: 'festive',  price:  5499, unit: 'piece', stock: 32, isOrganic: false, image: '🧡', description: 'Georgette lehenga in sunset orange with mirror work and a vibrant printed dupatta. Perfect for Diwali, Karwa Chauth, and family functions.',                                rating: 4.6, reviews: 167, freshness: 'Festive Edit' },
  { id: 'p10', name: 'Anarkali Saree — Mehendi Green',              category: 'festive',  price:  3499, unit: 'piece', stock: 40, isOrganic: false, image: '💚', description: 'Pre-draped Anarkali-style saree in mehendi green with a heavy embellished bodice. Easy to wear; gives the saree silhouette without the pleating fuss.',                       rating: 4.5, reviews: 92,  freshness: 'New Arrival' },
  { id: 'p11', name: 'Designer Saree — Champagne Sequin',           category: 'designer', price:  7499, unit: 'piece', stock: 20, isOrganic: true,  image: '🍾', description: 'Champagne-toned sequin saree with a sweetheart blouse. A red-carpet drape from a Delhi-based designer for cocktail and reception nights.',                                rating: 4.8, reviews: 118, freshness: 'Designer' },
  { id: 'p12', name: 'Heirloom Saree — Pure Tussar with Madhubani', category: 'designer', price:  6499, unit: 'piece', stock: 16, isOrganic: true,  image: '🎨', description: 'Pure Tussar silk hand-painted with Madhubani motifs by Bihar artisans. Numbered and signed — each piece is one-of-one.',                                                   rating: 4.9, reviews: 64,  freshness: 'Heritage' },
];

// ------------------------------------------------------------
// localStorage-backed mock store (users, orders, wishlist)
// ------------------------------------------------------------
const STORE_KEY = 'redlook_store_v1';

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { users: [], pending: [], sessions: {}, orders: {}, wishlists: {} };
    return JSON.parse(raw);
  } catch {
    return { users: [], pending: [], sessions: {}, orders: {}, wishlists: {} };
  }
}

function writeStore(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const delay = (ms = 250) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------
// Mock router — maps endpoint+method to a handler returning {data} or throwing
// ------------------------------------------------------------
async function mockHandler(endpoint, options) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  const store = readStore();

  // Catalog
  if (endpoint === '/products' && method === 'GET') return { data: MOCK_PRODUCTS };
  if (endpoint === '/settings' && method === 'GET') return { data: { min_order_value: 999, min_order_quantity: 1, delivery_charge: 99, free_delivery_over: 1999, delivery_slot_buffer_hours: 5, support_phone: null, support_whatsapp: null, support_email: null, support_message: null, theme: 'emerald', cancellation_cutoff_status: 'Out for Delivery' } };
  // Mock mode has no Razorpay — config always reports disabled so the UPI
  // tile stays hidden in demo builds.
  if (endpoint === '/payments/config' && method === 'GET') return { data: { razorpay_enabled: false, key_id: null } };
  // Mock coupon validation for VITE_USE_MOCK=true demos. Real backend handles
  // the full Coupon table + per-customer "use once" check.
  if (endpoint === '/coupons/validate' && method === 'POST') {
    const code = String(body?.code || '').trim().toUpperCase();
    if (code === 'SAREE10') return { data: { code, type: 'PERCENT', value: 10, discount: Math.round(Number(body.subtotal) * 0.10) } };
    if (code === 'BRIDAL500') return { data: { code, type: 'FLAT', value: 500, discount: Math.min(500, Number(body.subtotal)) } };
    const e = new Error('Invalid coupon'); e.code = 400; throw e;
  }
  if (endpoint === '/categories' && method === 'GET') return { data: MOCK_CATEGORIES };
  if (endpoint.startsWith('/products/') && method === 'GET') {
    const id = endpoint.split('/')[2];
    return { data: MOCK_PRODUCTS.find(p => p.id === id) };
  }

  // Auth
  // Sign-up writes ONLY to store.pending — no Customer row appears in
  // store.users until verify-otp succeeds. Mirrors the real backend's
  // PendingRegistration table introduced 2026-05-10.
  if (endpoint === '/auth/register' && method === 'POST') {
    if (store.users.find(u => u.email === body.email)) {
      const e = new Error('Email already registered'); e.code = 409; throw e;
    }
    if (store.users.find(u => u.phone === body.phone)) {
      const e = new Error('Phone already registered'); e.code = 409; throw e;
    }
    // A second registration attempt with the same email/phone replaces the
    // prior pending row — natural retry semantics.
    store.pending = store.pending.filter(p => p.email !== body.email && p.phone !== body.phone);
    const pending = {
      pending_id: uid(),
      full_name: body.full_name,
      email: body.email,
      phone: body.phone,
      password_hash: `hashed:${body.password}`,
      date_of_birth: body.date_of_birth || null,
      gender: body.gender || null,
      created_at: new Date().toISOString(),
    };
    store.pending.push(pending);
    writeStore(store);
    // `customer_id` here is the pending_id — opaque verification handle.
    return {
      data: {
        user: { customer_id: pending.pending_id, phone: pending.phone, full_name: pending.full_name },
        otp_sent_to: pending.phone,
      },
      dev_otp: '123456',
    };
  }

  // Mock resend — always succeeds, no actual SMS sent (mock mode is demo-only).
  // Same dual-lookup as the real backend: id may match a pending row OR a
  // Customer (the latter only on post-signup phone-change reverify).
  if (endpoint === '/auth/resend-phone-otp' && method === 'POST') {
    const pending = store.pending.find(p => p.pending_id === body.customer_id);
    if (pending) return { data: { ok: true, sent_to: pending.phone }, dev_otp: '123456' };
    const user = store.users.find(u => u.customer_id === body.customer_id);
    if (!user) { const e = new Error('Account not found'); e.code = 404; throw e; }
    return { data: { ok: true, sent_to: user.phone }, dev_otp: '123456' };
  }

  if (endpoint === '/auth/verify-otp' && method === 'POST') {
    // Mock: any 6-digit OTP works. "123456" is the suggested test code.
    if (!/^\d{6}$/.test(body.otp || '')) {
      const e = new Error('OTP must be 6 digits'); e.code = 400; throw e;
    }
    // Branch 1: pending registration → promote to a real user.
    const pending = store.pending.find(p => p.pending_id === body.customer_id);
    if (pending) {
      const user = {
        customer_id: uid(),
        full_name: pending.full_name,
        email: pending.email,
        phone: pending.phone,
        password_hash: pending.password_hash,
        date_of_birth: pending.date_of_birth,
        gender: pending.gender,
        profile_picture_url: null,
        loyalty_points: 0,
        account_status: 'Active',
        email_verified: false,
        phone_verified: true,
        addresses: [],
        notification_prefs: { email: true, sms: true, push: false },
        created_at: pending.created_at,
        last_login: new Date().toISOString(),
      };
      store.users.push(user);
      store.pending = store.pending.filter(p => p.pending_id !== pending.pending_id);
      const token = `mock-jwt-${user.customer_id}-${Date.now()}`;
      store.sessions[token] = user.customer_id;
      writeStore(store);
      return { data: { user, token } };
    }
    // Branch 2: existing Customer (post-signup phone-change reverify).
    const user = store.users.find(u => u.customer_id === body.customer_id);
    if (!user) { const e = new Error('Account not found'); e.code = 404; throw e; }
    user.phone_verified = true;
    const token = `mock-jwt-${user.customer_id}-${Date.now()}`;
    store.sessions[token] = user.customer_id;
    writeStore(store);
    return { data: { user, token } };
  }

  if (endpoint === '/auth/login' && method === 'POST') {
    const user = store.users.find(u => u.email === body.identifier || u.phone === body.identifier);
    if (!user || user.password_hash !== `hashed:${body.password}`) {
      const e = new Error('Invalid email/phone or password'); e.code = 401; throw e;
    }
    // Mirror the real backend: block login until phone is verified. Surface
    // the PHONE_NOT_VERIFIED code + customer_id so the FE can route the
    // user straight to the OTP screen with a Resend CTA.
    if (!user.phone_verified) {
      const e = new Error('Please verify your phone before signing in. We sent a code by SMS.');
      e.code = 403;
      e.details = { code: 'PHONE_NOT_VERIFIED', customer_id: user.customer_id, phone: user.phone };
      throw e;
    }
    user.last_login = new Date().toISOString();
    const token = `mock-jwt-${user.customer_id}-${Date.now()}`;
    store.sessions[token] = user.customer_id;
    writeStore(store);
    return { data: { user, token } };
  }

  if (endpoint === '/auth/logout' && method === 'POST') {
    delete store.sessions[body.token];
    writeStore(store);
    return { data: { ok: true } };
  }

  if (endpoint === '/auth/forgot-password' && method === 'POST') {
    const user = store.users.find(u => u.email === body.email || u.phone === body.email);
    if (!user) { const e = new Error('No account with that email/phone'); e.code = 404; throw e; }
    const m = body.method || 'link';
    if (m === 'link') {
      return { data: { method: m, reset_token: `reset-${user.customer_id}`, sent_to: user.email, masked_to: user.email } };
    }
    // Mock OTP path — stash a fixed code and echo it in the response so the
    // dev UI can show it inline without a real provider.
    const channel = m === 'sms_otp' ? 'sms' : 'email';
    store.mockResetOtps = store.mockResetOtps || {};
    store.mockResetOtps[user.customer_id] = { otp: '123456', channel };
    writeStore(store);
    return {
      data: {
        method: m,
        customer_id: user.customer_id,
        channel,
        masked_to: channel === 'sms' ? user.phone : user.email,
        ttl_minutes: 10,
        otp: '123456', // mock echo
      },
    };
  }

  if (endpoint === '/auth/verify-reset-otp' && method === 'POST') {
    const stash = (store.mockResetOtps || {})[body.customer_id];
    if (!stash) { const e = new Error('No active reset code — please request a new one'); e.code = 400; throw e; }
    if (body.otp !== stash.otp) { const e = new Error('Incorrect code'); e.code = 400; throw e; }
    delete store.mockResetOtps[body.customer_id];
    writeStore(store);
    return { data: { reset_token: `reset-${body.customer_id}` } };
  }

  if (endpoint === '/auth/reset-password' && method === 'POST') {
    const customerId = (body.token || '').replace(/^reset-/, '');
    const user = store.users.find(u => u.customer_id === customerId);
    if (!user) { const e = new Error('Invalid or expired reset token'); e.code = 400; throw e; }
    user.password_hash = `hashed:${body.new_password}`;
    writeStore(store);
    return { data: { ok: true } };
  }

  // Customer profile
  const userMatch = endpoint.match(/^\/users\/([^/]+)$/);
  if (userMatch && method === 'GET') {
    const u = store.users.find(x => x.customer_id === userMatch[1]);
    return { data: u || null };
  }
  if (userMatch && method === 'PUT') {
    const u = store.users.find(x => x.customer_id === userMatch[1]);
    if (!u) { const e = new Error('User not found'); e.code = 404; throw e; }
    // Phone change → mirror the real backend's re-verification reset.
    let phoneChanged = false;
    if (body.phone && body.phone !== u.phone) {
      const taken = store.users.find(x => x.phone === body.phone && x.customer_id !== u.customer_id);
      if (taken) { const e = new Error('That phone number is already registered to another account'); e.code = 409; throw e; }
      u.phone_verified = false;
      phoneChanged = true;
    }
    Object.assign(u, body);
    writeStore(store);
    return phoneChanged ? { data: u, dev_otp: '123456' } : { data: u };
  }
  // Mock anonymize-on-delete — mirrors the real backend semantics so demo
  // mode behaves the same. Validates the password against the mock-hashed
  // form, then scrubs PII fields on the in-memory user record.
  if (userMatch && method === 'DELETE') {
    const u = store.users.find(x => x.customer_id === userMatch[1]);
    if (!u) { const e = new Error('User not found'); e.code = 404; throw e; }
    if (u.account_status === 'Deleted') {
      const e = new Error('This account has already been deleted.'); e.code = 400; throw e;
    }
    if (u.password_hash !== `hashed:${body.password}`) {
      const e = new Error('Password is incorrect'); e.code = 401; throw e;
    }
    const idStub = u.customer_id.replace(/-/g, '').slice(0, 11);
    u.full_name = 'Deleted user';
    u.email = `deleted-${idStub}@redlook.local`;
    u.phone = `del_${idStub}`;
    u.password_hash = `hashed:${Math.random().toString(36).slice(2)}-${Date.now()}`;
    u.date_of_birth = null;
    u.gender = null;
    u.profile_picture_url = null;
    u.loyalty_points = 0;
    u.account_status = 'Deleted';
    u.email_verified = false;
    u.phone_verified = false;
    u.addresses = [];
    delete store.wishlists[u.customer_id];
    delete store.orders[u.customer_id];
    // Revoke every session for this user.
    for (const tok of Object.keys(store.sessions)) {
      if (store.sessions[tok] === u.customer_id) delete store.sessions[tok];
    }
    writeStore(store);
    return { data: { ok: true } };
  }

  // Addresses
  const addrListMatch = endpoint.match(/^\/users\/([^/]+)\/addresses$/);
  if (addrListMatch && method === 'GET') {
    const u = store.users.find(x => x.customer_id === addrListMatch[1]);
    return { data: u?.addresses || [] };
  }
  if (addrListMatch && method === 'POST') {
    const u = store.users.find(x => x.customer_id === addrListMatch[1]);
    if (!u) { const e = new Error('User not found'); e.code = 404; throw e; }
    if ((u.addresses || []).length >= 5) {
      const e = new Error('Maximum 5 addresses allowed'); e.code = 400; throw e;
    }
    const addr = { address_id: uid(), ...body };
    if (addr.is_default || (u.addresses || []).length === 0) {
      u.addresses = (u.addresses || []).map(a => ({ ...a, is_default: false }));
      addr.is_default = true;
    }
    u.addresses = [...(u.addresses || []), addr];
    writeStore(store);
    return { data: addr };
  }
  const addrItemMatch = endpoint.match(/^\/users\/([^/]+)\/addresses\/([^/]+)$/);
  if (addrItemMatch && method === 'PUT') {
    const u = store.users.find(x => x.customer_id === addrItemMatch[1]);
    if (!u) { const e = new Error('User not found'); e.code = 404; throw e; }
    u.addresses = (u.addresses || []).map(a => {
      if (a.address_id !== addrItemMatch[2]) {
        return body.is_default ? { ...a, is_default: false } : a;
      }
      return { ...a, ...body };
    });
    writeStore(store);
    return { data: u.addresses.find(a => a.address_id === addrItemMatch[2]) };
  }
  if (addrItemMatch && method === 'DELETE') {
    const u = store.users.find(x => x.customer_id === addrItemMatch[1]);
    if (!u) { const e = new Error('User not found'); e.code = 404; throw e; }
    const removed = u.addresses.find(a => a.address_id === addrItemMatch[2]);
    u.addresses = u.addresses.filter(a => a.address_id !== addrItemMatch[2]);
    if (removed?.is_default && u.addresses.length > 0) u.addresses[0].is_default = true;
    writeStore(store);
    return { data: { ok: true } };
  }

  // Orders — body shape matches real backend: { address_id, items: [{product_id, qty}],
  // delivery_slot, payment_method, coupon_code? }. Server (mock or real) computes totals.
  if (endpoint === '/orders' && method === 'POST') {
    // Resolve current user from active session (token in body or fall back to single user)
    const customerId = store.sessions[body.token] || body.customer_id || store.users[0]?.customer_id;
    const u = store.users.find(x => x.customer_id === customerId);
    if (!u) { const e = new Error('Not authenticated'); e.code = 401; throw e; }

    if (body.payment_method !== 'COD') {
      const e = new Error('Online payment is not available currently and will be enabled very soon. Please choose Cash on Delivery.');
      e.code = 400;
      throw e;
    }

    const address = (u.addresses || []).find(a => a.address_id === body.address_id);
    if (!address) { const e = new Error('Address not found'); e.code = 404; throw e; }

    const items = body.items.map(i => {
      const p = MOCK_PRODUCTS.find(x => x.id === i.product_id);
      if (!p) { const e = new Error(`Product ${i.product_id} not found`); e.code = 400; throw e; }
      return {
        id: p.id, name: p.name, image: p.image, unit: p.unit,
        qty: i.qty, price: p.price, line_total: p.price * i.qty,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.line_total, 0);
    if (subtotal < 999) { const e = new Error('Minimum order is ₹999'); e.code = 400; throw e; }

    let discount = 0;
    if (body.coupon_code) {
      const code = body.coupon_code.toUpperCase();
      if (code === 'SAREE10') discount = Math.round(subtotal * 0.10);
      else if (code === 'BRIDAL500') discount = Math.min(500, subtotal);
      else { const e = new Error('Invalid coupon'); e.code = 400; throw e; }
    }
    const delivery_charge = subtotal > 1999 ? 0 : 99;
    // Vegetables (HSN 0701–0714) are GST-exempt; mirrors the backend TAX_RATE=0.
    const tax = 0;
    const total_amount = subtotal - discount + delivery_charge + tax;

    // Apply the live-location override to the address snapshot so the
    // mock admin order view shows the Google Maps pin the customer
    // shared at checkout (same shape the real backend produces).
    const snapshotAddress = { ...address };
    if (body.delivery_location) {
      snapshotAddress.latitude = body.delivery_location.latitude;
      snapshotAddress.longitude = body.delivery_location.longitude;
      snapshotAddress.location_source = 'device';
      snapshotAddress.location_accuracy = body.delivery_location.accuracy ?? null;
      snapshotAddress.location_captured_at = new Date().toISOString();
    }
    const order = {
      order_id: `ORD-${Date.now().toString(36).toUpperCase()}`,
      customer_id: customerId,
      address: snapshotAddress, // snapshot
      items,
      delivery_slot: body.delivery_slot,
      payment_method: body.payment_method,
      payment_status: body.payment_method === 'COD' ? 'Pending' : 'Paid',
      order_status: 'Placed',
      subtotal, discount, delivery_charge, tax, total_amount,
      order_date: new Date().toISOString(),
      timeline: [
        { status: 'Placed', at: new Date().toISOString(), note: 'Order placed successfully' },
      ],
    };
    store.orders[customerId] = [...(store.orders[customerId] || []), order];
    writeStore(store);
    return { data: order };
  }
  const ordersListMatch = endpoint.match(/^\/orders\/user\/([^/]+)$/);
  if (ordersListMatch && method === 'GET') {
    const list = store.orders[ordersListMatch[1]] || [];
    return { data: [...list].reverse() }; // newest first
  }
  const orderItemMatch = endpoint.match(/^\/orders\/([^/]+)$/);
  if (orderItemMatch && method === 'GET') {
    for (const list of Object.values(store.orders)) {
      const o = list.find(x => x.order_id === orderItemMatch[1]);
      if (o) return { data: o };
    }
    return { data: null };
  }
  const returnMatch = endpoint.match(/^\/orders\/([^/]+)\/return$/);
  if (returnMatch && method === 'POST') {
    for (const list of Object.values(store.orders)) {
      const o = list.find(x => x.order_id === returnMatch[1]);
      if (o) {
        if (o.order_status !== 'Delivered') {
          const e = new Error('Returns can only be requested on delivered orders'); e.code = 400; throw e;
        }
        const deliveredEntry = (o.timeline || []).find(t => t.status === 'Delivered');
        if (!deliveredEntry) { const e = new Error('Delivery timestamp missing from order history'); e.code = 400; throw e; }
        const hours = (Date.now() - new Date(deliveredEntry.at).getTime()) / 36e5;
        if (hours > 24) { const e = new Error('Return window of 24 hours has expired'); e.code = 400; throw e; }
        o.order_status = 'ReturnRequested';
        o.timeline.push({ status: 'ReturnRequested', at: new Date().toISOString(), note: body?.reason, items: body?.items ?? null });
        writeStore(store);
        return { data: o };
      }
    }
    const e = new Error('Order not found'); e.code = 404; throw e;
  }
  const cancelMatch = endpoint.match(/^\/orders\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'PUT') {
    for (const list of Object.values(store.orders)) {
      const o = list.find(x => x.order_id === cancelMatch[1]);
      if (o) {
        if (!['Placed', 'Confirmed'].includes(o.order_status)) {
          const e = new Error('Order cannot be cancelled at this stage'); e.code = 400; throw e;
        }
        o.order_status = 'Cancelled';
        o.timeline.push({ status: 'Cancelled', at: new Date().toISOString(), note: body?.reason || 'Cancelled by customer' });
        writeStore(store);
        return { data: o };
      }
    }
    const e = new Error('Order not found'); e.code = 404; throw e;
  }

  // Wishlist
  const wishMatch = endpoint.match(/^\/users\/([^/]+)\/wishlist$/);
  if (wishMatch && method === 'GET') {
    return { data: store.wishlists[wishMatch[1]] || [] };
  }
  if (wishMatch && method === 'POST') {
    const list = store.wishlists[wishMatch[1]] || [];
    if (!list.includes(body.product_id)) list.push(body.product_id);
    store.wishlists[wishMatch[1]] = list;
    writeStore(store);
    return { data: list };
  }
  const wishItemMatch = endpoint.match(/^\/users\/([^/]+)\/wishlist\/([^/]+)$/);
  if (wishItemMatch && method === 'DELETE') {
    const list = (store.wishlists[wishItemMatch[1]] || []).filter(id => id !== wishItemMatch[2]);
    store.wishlists[wishItemMatch[1]] = list;
    writeStore(store);
    return { data: list };
  }

  return { data: null };
}

// ------------------------------------------------------------
// Generic fetcher — swaps mock <-> real cleanly
// ------------------------------------------------------------
// Read the active locale from i18next (synchronously) so every API request
// carries an Accept-Language header. Lazy-imported via globalThis to avoid a
// circular dep — i18n.js doesn't import api.js, but api.js loads early so
// referencing the module up-top would race the i18n init.
const currentLanguage = () => {
  try {
    return globalThis?.localStorage?.getItem('redlook.lang') || 'en';
  } catch { return 'en'; }
};

async function apiCall(endpoint, options = {}) {
  if (USE_MOCK) {
    await delay();
    return mockHandler(endpoint, options);
  }
  const token = readToken();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    // Skip the HTTP cache: customer-facing endpoints like /credit return
    // live ledger state that changes the moment an admin records a payment.
    // A stale 304 with an empty body would leave the page showing yesterday's
    // outstanding amount.
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Phase 2 backend reads this to localize product/category/settings
      // serializers; Phase 1 just sets the header so the integration is
      // ready (header is harmless until the backend honors it).
      'Accept-Language': currentLanguage(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `API error ${res.status}`);
    err.code = res.status;
    err.details = json.details;
    throw err;
  }
  return json;
}

const post = (endpoint, body) => apiCall(endpoint, { method: 'POST', body: JSON.stringify(body) });
const put = (endpoint, body) => apiCall(endpoint, { method: 'PUT', body: JSON.stringify(body) });
const del = (endpoint) => apiCall(endpoint, { method: 'DELETE' });

// ------------------------------------------------------------
// Public API service — pages/components import this
// ------------------------------------------------------------
export const api = {
  // Catalog
  getProducts: () => apiCall('/products'),
  getProduct: (id) => apiCall(`/products/${id}`),
  getCategories: () => apiCall('/categories'),
  // Operational thresholds the cart/checkout previews — admin-editable.
  getSettings: () => apiCall('/settings'),

  // Auth
  register: (data) => post('/auth/register', data),
  // verifyOtp validates the phone-OTP — the customer_id + 6-digit code SMS'd
  // at registration (or after a profile phone change). Mock mode still
  // accepts any 6 digits for demos.
  verifyOtp: (customer_id, otp) => post('/auth/verify-otp', { customer_id, otp }),
  resendPhoneOtp: (customer_id) => post('/auth/resend-phone-otp', { customer_id }),
  login: (identifier, password) => post('/auth/login', { identifier, password }),
  logout: (token) => post('/auth/logout', { token }),
  // method ∈ 'link' | 'email_otp' | 'sms_otp' (omitted = 'link' for backward compat).
  // Response for OTP methods carries `customer_id` + `channel` + `masked_to`;
  // the link method carries `reset_token` directly.
  forgotPassword: (email, method) => post('/auth/forgot-password', method ? { email, method } : { email }),
  verifyResetOtp: (customer_id, otp) => post('/auth/verify-reset-otp', { customer_id, otp }),
  resetPassword: (token, new_password) => post('/auth/reset-password', { token, new_password }),

  // Firebase Phone Auth path — only used when VITE_AUTH_PROVIDER=firebase.
  // The frontend pages call sendOtp/verifyOtpAndGetToken in lib/firebase.js
  // to get a verified Firebase ID token, then post that token to the
  // server here. The legacy methods above stay in place for the MSG91
  // path (toggle-controlled in the page components).
  firebaseLogin:         (idToken) => post('/auth/firebase-login', { idToken }),
  firebaseRegister:      (idToken, profile) => post('/auth/firebase-register', { idToken, ...profile }),
  firebaseResetPassword: (idToken, new_password) => post('/auth/firebase-reset-password', { idToken, new_password }),

  // Profile
  getUser: (id) => apiCall(`/users/${id}`),
  updateUser: (id, data) => put(`/users/${id}`, data),

  // Credit / Pay-Later (BRD §4 + §7)
  getCredit: (userId) => apiCall(`/users/${userId}/credit`),
  // Mints (or reuses) a Razorpay payment link for an unpaid DEBIT and
  // returns { payment_link_url, ... } so the page can window.open it.
  getInvoicePaymentLink: (userId, txId) =>
    post(`/users/${userId}/credit/invoices/${txId}/payment-link`, {}),
  // Downloads the PDF receipt for a PaymentReceived row. Used by the
  // payment-history rows on the customer's My Credit page.
  downloadPaymentReceipt: async (userId, paymentId) => {
    if (USE_MOCK) throw new Error('Receipt downloads require backend mode (set VITE_USE_MOCK=false).');
    const token = readToken();
    const url = `${API_BASE_URL}/users/${userId}/credit/payments/${paymentId}/receipt`;
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download receipt (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `receipt_${paymentId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },

  // Addresses
  listAddresses: (userId) => apiCall(`/users/${userId}/addresses`),
  addAddress: (userId, data) => post(`/users/${userId}/addresses`, data),
  updateAddress: (userId, addressId, data) => put(`/users/${userId}/addresses/${addressId}`, data),
  deleteAddress: (userId, addressId) => del(`/users/${userId}/addresses/${addressId}`),

  // Orders. data shape: { address_id, delivery_slot, payment_method, items: [{product_id, qty}], coupon_code? }
  // Coupons — server validates and returns the computed discount + per-customer
  // "use once" gate. Same logic the order placement transaction will run, so
  // the previewed discount and the applied discount can't drift.
  validateCoupon: (code, subtotal) => post('/coupons/validate', { code, subtotal }),

  placeOrder: (data) => post('/orders', { ...data, token: readToken() }),
  listOrders: (userId) => apiCall(`/orders/user/${userId}`),
  getOrder: (id) => apiCall(`/orders/${id}`),
  cancelOrder: (id, reason) => put(`/orders/${id}/cancel`, { reason }),
  requestReturn: (id, reason, items) => post(`/orders/${id}/return`, { reason, items }),

  // Payment / Razorpay (FR-PAY-01..05)
  // getPaymentConfig is called on checkout mount so the UI can hide the UPI
  // tile when keys aren't configured server-side. verifyPayment is called
  // from the Razorpay Checkout success handler — the returned order has
  // payment_status='Paid' if the signature checked out.
  getPaymentConfig: () => apiCall('/payments/config'),
  verifyPayment: (payload) => post('/payments/verify', payload),
  downloadInvoice: async (id) => {
    if (USE_MOCK) throw new Error('Invoice download requires the backend (set VITE_USE_MOCK=false).');
    const token = readToken();
    const res = await fetch(`${API_BASE_URL}/orders/${id}/invoice`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download invoice (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Wishlist
  getWishlist: (userId) => apiCall(`/users/${userId}/wishlist`),
  // Hydrated variant for the wishlist page — drops items whose product was
  // deactivated, sorted by added_at desc.
  getWishlistItems: (userId) => apiCall(`/users/${userId}/wishlist/items`),
  addToWishlist: (userId, productId) => post(`/users/${userId}/wishlist`, { product_id: productId }),
  removeFromWishlist: (userId, productId) => del(`/users/${userId}/wishlist/${productId}`),

  // Reviews (slice 7)
  getReviews: (productId, params) => apiCall(`/products/${productId}/reviews${params ? '?' + new URLSearchParams(params) : ''}`),
  getMyReview: (productId) => apiCall(`/products/${productId}/reviews/me`),
  submitReview: (productId, rating, comment) =>
    put(`/products/${productId}/reviews`, { rating, comment }),
  deleteMyReview: (productId) => del(`/products/${productId}/reviews`),
};

// ------------------------------------------------------------
// Admin API — separate fetcher so admin tokens never leak into customer requests
// (and vice versa). Admin endpoints are real-backend only; mock mode rejects.
// ------------------------------------------------------------
async function adminCall(endpoint, options = {}) {
  if (USE_MOCK) throw new Error('Admin endpoints require backend mode (set VITE_USE_MOCK=false).');
  const token = readAdminToken();
  const res = await fetch(`${API_BASE_URL}/admin${endpoint}`, {
    // Admin data is volatile (orders/credit/inventory). Skip the HTTP cache
    // entirely so a stale 304 with an empty body can't blank out a screen.
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Admin API error ${res.status}`);
    err.code = res.status;
    err.details = json.details;
    throw err;
  }
  return json;
}

const adminPost = (endpoint, body) => adminCall(endpoint, { method: 'POST', body: JSON.stringify(body) });
const adminPut = (endpoint, body) => adminCall(endpoint, { method: 'PUT', body: JSON.stringify(body) });
const adminDel = (endpoint) => adminCall(endpoint, { method: 'DELETE' });

const qs = (params) => {
  const cleaned = Object.entries(params || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (!cleaned.length) return '';
  return '?' + new URLSearchParams(cleaned).toString();
};

export const adminApi = {
  // Auth
  login: (email, password) => adminPost('/login', { email, password }),
  logout: () => adminPost('/logout', {}),
  getMe: () => adminCall('/me'),
  updateMe: (full_name) => adminPut('/me', { full_name }),
  changeOwnPassword: (current_password, new_password) =>
    adminPut('/me/password', { current_password, new_password }),

  // Admin user master (gated on the 'admin-users' permission)
  listUsers: (params) => adminCall('/users' + qs(params)),
  // Minimal B2B-customer list used to populate the "B2B scope" dropdown
  // inside the Add/Edit Admin modal. Lives under /users so it inherits
  // the same admin-users gate the rest of the modal needs.
  listB2BOptions: () => adminCall('/users/b2b-options'),
  createUser: (data) => adminPost('/users', data),
  updateUser: (id, data) => adminPut(`/users/${id}`, data),
  resetUserPassword: (id, password) => adminPut(`/users/${id}/password`, { password }),
  disableUser: (id) => adminDel(`/users/${id}`),

  // Orders (slice 2)
  listOrders: (params) => adminCall('/orders' + qs(params)),
  // body: { status, note?, credit_decision? } — credit_decision only
  // honoured when status === 'Delivered' && order.payment_method === 'COD'
  // (BRD §3, delivery confirmation flow).
  updateOrderStatus: (id, body) => adminPut(`/orders/${id}/status`, body),

  // Products (slice 3)
  listProducts: (params) => adminCall('/products' + qs(params)),
  createProduct: (data) => adminPost('/products', data),
  updateProduct: (id, data) => adminPut(`/products/${id}`, data),
  disableProduct: (id) => adminDel(`/products/${id}`),

  // Colour-variant CRUD nested under a product. Variants are opt-in:
  // a product with zero variants behaves as a single SKU. Adding ≥1
  // switches the storefront to a colour picker and per-variant stock
  // becomes authoritative. Each variant owns its own required photo
  // gallery (no fallback to parent product photos).
  listVariants:  (productId)                  => adminCall(`/products/${productId}/variants`),
  createVariant: (productId, data)            => adminPost(`/products/${productId}/variants`, data),
  updateVariant: (productId, variantId, data) => adminPut(`/products/${productId}/variants/${variantId}`, data),
  deleteVariant: (productId, variantId)       => adminDel(`/products/${productId}/variants/${variantId}`),

  // Product image upload — multipart, returns { url: '/uploads/products/<file>' }.
  // Caller stores the returned `url` in Product.image. Mock mode short-circuits
  // to a transient data: URL so admins can preview locally without a backend.
  uploadProductImage: async (file) => {
    if (USE_MOCK) {
      // FileReader → data URL keeps the picked image visible in the form
      // preview + the products grid for the rest of the session. It won't
      // persist across reload (mock store doesn't carry binary blobs), but
      // demos rarely need that.
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: { url: reader.result, size: file.size, mimetype: file.type } });
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
    }
    const token = readAdminToken();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE_URL}/admin/uploads/product-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form, // intentionally NOT JSON — let the browser set the multipart boundary
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Image upload failed (${res.status})`);
      err.code = res.status;
      throw err;
    }
    return json;
  },

  // Home hero background image — written to /uploads/hero/<uuid>.<ext> on
  // the API server, returned as a relative URL the admin form stores in the
  // home_hero_features background_image entry. Same multipart contract as
  // uploadProductImage; gated on 'settings' permission instead of 'products'.
  uploadHeroImage: async (file) => {
    if (USE_MOCK) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: { url: reader.result, size: file.size, mimetype: file.type } });
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
    }
    const token = readAdminToken();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE_URL}/admin/uploads/hero-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Image upload failed (${res.status})`);
      err.code = res.status;
      throw err;
    }
    return json;
  },

  // Promotion banner image upload — gated on 'settings' permission since
  // the resulting URL is committed to BusinessSettings.category_promotions
  // via the same Settings save. Same multipart contract as the hero
  // upload; returns a relative `/uploads/promos/<uuid>.<ext>` URL.
  uploadPromoImage: async (file) => {
    if (USE_MOCK) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: { url: reader.result, size: file.size, mimetype: file.type } });
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
    }
    const token = readAdminToken();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE_URL}/admin/uploads/promo-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Image upload failed (${res.status})`);
      err.code = res.status;
      throw err;
    }
    return json;
  },

  // Open-box delivery photo upload — uses the same multipart contract as
  // product / hero uploads but gated on 'orders' permission (the same
  // tile that controls the Mark-Delivered flow). Returns a relative
  // `/uploads/delivery/<uuid>.<ext>` URL the caller stages in modal
  // state and submits with the PUT /orders/:id/status payload.
  uploadDeliveryPhoto: async (file) => {
    if (USE_MOCK) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ data: { url: reader.result, size: file.size, mimetype: file.type } });
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
    }
    const token = readAdminToken();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE_URL}/admin/uploads/delivery-photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Image upload failed (${res.status})`);
      err.code = res.status;
      throw err;
    }
    return json;
  },

  // Categories (slice 3)
  listCategories: () => adminCall('/categories'),
  createCategory: (data) => adminPost('/categories', data),
  updateCategory: (id, data) => adminPut(`/categories/${id}`, data),
  deleteCategory: (id) => adminDel(`/categories/${id}`),

  // Coupons (slice 4)
  listCoupons: (params) => adminCall('/coupons' + qs(params)),
  createCoupon: (data) => adminPost('/coupons', data),
  updateCoupon: (id, data) => adminPut(`/coupons/${id}`, data),
  deleteCoupon: (id) => adminDel(`/coupons/${id}`),

  // Customers (slice 5)
  listCustomers: (params) => adminCall('/customers' + qs(params)),
  getCustomer: (id) => adminCall(`/customers/${id}`),
  updateCustomerStatus: (id, status) => adminPut(`/customers/${id}/status`, { status }),
  resetCustomerPassword: (id, password) => adminPut(`/customers/${id}/password`, { password }),
  updateCustomerType: (id, body) => adminPut(`/customers/${id}/type`, body),

  // Credit / Pay-Later (BRD §2, §5, §6, §7)
  getCustomerCredit: (id) => adminCall(`/customers/${id}/credit`),
  updateCustomerCredit: (id, body) => adminPut(`/customers/${id}/credit`, body),
  getCustomerLedger: (id) => adminCall(`/customers/${id}/ledger`),
  recordPayment: (id, body) => adminPost(`/customers/${id}/payments`, body),
  // Admin-side receipt download — same PDF as the customer endpoint,
  // gated on the 'customers' permission so support reps can re-send a
  // receipt to a customer who lost theirs.
  downloadPaymentReceipt: async (customerId, paymentId) => {
    if (USE_MOCK) throw new Error('Receipt downloads require backend mode (set VITE_USE_MOCK=false).');
    const token = readAdminToken();
    const url = `${API_BASE_URL}/admin/customers/${customerId}/payments/${paymentId}/receipt`;
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download receipt (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `receipt_${paymentId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },
  recordCreditAdjustment: (id, body) => adminPost(`/customers/${id}/credit/adjustments`, body),
  getCreditAccounting: (params) => adminCall('/credit/accounting' + qs(params)),
  bulkRemind: () => adminPost('/credit/accounting/bulk-remind', {}),
  // Download a filtered accounting report. report ∈ 'customers' | 'payments',
  // format ∈ 'xlsx' | 'pdf'. Filters are the same shape passed to
  // getCreditAccounting so the file mirrors the on-screen view.
  downloadAccountingReport: async (report, format, filters) => {
    if (USE_MOCK) throw new Error('Exports require backend mode (set VITE_USE_MOCK=false).');
    const token = readAdminToken();
    const params = { ...(filters || {}), report, format };
    const url = `${API_BASE_URL}/admin/credit/accounting/export${qs(params)}`;
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download report (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accounting_${report}_${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },
  // Customer Report — per-customer sales / quantity / outstanding /
  // credit-limit view. Filter shape mirrors the dashboard inputs and is
  // passed through to /api/admin/customer-report.
  getCustomerReport: (params) => adminCall('/customer-report' + qs(params)),
  downloadCustomerReport: async (format, filters) => {
    if (USE_MOCK) throw new Error('Exports require backend mode (set VITE_USE_MOCK=false).');
    const token = readAdminToken();
    const params = { ...(filters || {}), format };
    const url = `${API_BASE_URL}/admin/customer-report/export${qs(params)}`;
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download customer report (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customer_report_${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },
  // My B2B Customers — B2B-only customer extract, filtered by business
  // name + GSTIN, with date-scoped orders count. Mirrors the customer
  // report download dance but hits a separate endpoint.
  getB2BCustomers: (params) => adminCall('/b2b-customers' + qs(params)),
  downloadB2BCustomers: async (format, filters) => {
    if (USE_MOCK) throw new Error('Exports require backend mode (set VITE_USE_MOCK=false).');
    const token = readAdminToken();
    const params = { ...(filters || {}), format };
    const url = `${API_BASE_URL}/admin/b2b-customers/export${qs(params)}`;
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download B2B customers (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `b2b_customers_${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },
  // Ledger export — same blob/download dance as adminApi.downloadExport
  // but for one customer's full credit history. format ∈ 'xlsx' | 'pdf'.
  downloadLedger: async (customerId, format = 'xlsx') => {
    if (USE_MOCK) throw new Error('Exports require backend mode (set VITE_USE_MOCK=false).');
    const token = readAdminToken();
    const url = `${API_BASE_URL}/admin/customers/${customerId}/ledger/export?format=${format}`;
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Could not download ledger (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ledger_${customerId}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },


  // Reports (slice 6)
  reportSales: (params) => adminCall('/reports/sales' + qs(params)),
  reportInventory: (params) => adminCall('/reports/inventory' + qs(params)),
  reportCustomers: (params) => adminCall('/reports/customers' + qs(params)),
  reportRevenue: (params) => adminCall('/reports/revenue' + qs(params)),

  // Reviews moderation (slice 7)
  listReviews: (params) => adminCall('/reviews' + qs(params)),
  deleteReview: (id) => adminDel(`/reviews/${id}`),

  // Operational thresholds — minimum order value/quantity. Read + write
  // both gated on the 'settings' permission.
  getSettings: () => adminCall('/settings'),
  updateSettings: (data) => adminPut('/settings', data),

  // Report exports — Excel + PDF for every record-bearing admin section.
  // resource ∈ orders | products | categories | coupons | customers |
  //            reviews | admin-users | reports
  // format   ∈ 'xlsx' | 'pdf'
  // Triggers a browser download via blob; no return value. Throws on error
  // so callers can toast the failure. Gated server-side by the resource's
  // own permission, so an admin without the matching tile gets a 403.
  downloadExport: async (resource, format) => {
    if (USE_MOCK) throw new Error('Exports require backend mode (set VITE_USE_MOCK=false).');
    const token = readAdminToken();
    const res = await fetch(`${API_BASE_URL}/admin/exports/${resource}?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const err = new Error(j.error || `Could not export ${resource} (${res.status})`);
      err.code = res.status;
      throw err;
    }
    // Filename comes from Content-Disposition the server set; fall back to
    // a sensible default if a proxy strips it.
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^"]+)"?/i.exec(disposition);
    const filename = match?.[1] || `redlook-${resource}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
