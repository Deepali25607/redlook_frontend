import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, ArrowLeft, Star, Truck, Shield, Clock,
  ChevronLeft, ChevronRight, Heart, MapPin, Package, Edit2, Check, AlertCircle, Eye, EyeOff,
  CreditCard, Wallet, Smartphone, Banknote, CheckCircle2, Circle, X, User, RotateCcw, Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, resolveImageUrl } from './api';
import { ProductCard, ProductImage, Field, TextInput, SelectInput, ShareMenu } from './components';
import { useCart, useAuth, useWishlist, useToast, useSettings, canCancelOrderClient, cartLineKey } from './contexts';
import { formatCurrency, formatDateTime } from './lib/format';
import { LuxuryBackground } from './LuxuryBackground';
import { firebaseAuthEnabled, setupRecaptcha, sendOtp, verifyOtpAndGetToken, toE164 } from './lib/firebase';

// ============================================================
// Helpers — locale-aware via src/lib/format.js. Kept as thin aliases so
// existing call sites don't have to rename — they automatically pick up the
// active i18n language at render time.
// ============================================================
const formatINR = (n) => formatCurrency(n);
const formatDate = (iso) => formatDateTime(iso, {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

const ORDER_STAGES = ['Placed', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];

// Strength labels live in the locale files at validation.strength.0..5.
function passwordStrength(p, t) {
  if (!p) return { score: 0, label: '' };
  let score = 0;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return { score, label: t ? t(`validation.strength.${score}`) : '' };
}

// Returns a translation KEY rather than a string so callers can pass it
// through t() with the active i18n instance (the password validator is
// shared by Register + Reset pages, neither of which can hand `t` down).
function validatePasswordKey(p) {
  if (!p) return 'validation.passwordRequired';
  if (p.length < 8) return 'validation.min8Chars';
  if (!/[A-Z]/.test(p)) return 'validation.needsUppercase';
  if (!/\d/.test(p)) return 'validation.needsNumber';
  if (!/[^A-Za-z0-9]/.test(p)) return 'validation.needsSpecial';
  return null;
}

function RequireAuth({ user, onNavigate, children }) {
  const { t } = useTranslation();
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-stone-900 mb-2">{t('auth.signInRequired')}</h2>
        <p className="text-stone-600 mb-6">{t('auth.pleaseLogIn')}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => onNavigate('login')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold">{t('auth.logIn')}</button>
          <button onClick={() => onNavigate('register')} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:border-emerald-300 px-6 py-3 rounded-xl font-semibold">{t('auth.createAccount')}</button>
        </div>
      </div>
    );
  }
  return children;
}

// ============================================================
// HOME
// ============================================================
// Static key→icon map for the home hero trust pills. Mirrors the admin
// settings page so changing the labels there is reflected here without
// touching the icon choices.
const HERO_FEATURE_ICONS = { delivery: Truck, freshness: Shield, speed: Clock };

// Strip leading emoji/symbol characters + surrounding whitespace from a
// label so "🛍️ SALE" / "🥬 Leafy greens" match a category whose name is
// just "SALE" or "Leafy greens". The regex covers the common Unicode
// emoji ranges (Symbols & Pictographs, Misc Symbols, Dingbats,
// Supplementary Symbols, Variation Selectors) — overkill for this use
// case but cheap and well-defined.
const stripEmoji = (s) =>
  String(s || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .trim();

// Resolve a saved category_id (from BusinessSettings.category_promotions)
// against the live category list. Admins occasionally save the display
// label ("🛍️ SALE") instead of the slug; this lets us still navigate
// to the right category page. Returns the resolved category_id, or null
// when no match — caller decides whether to filter or show everything.
function resolveCategoryId(savedId, categories) {
  if (!savedId) return null;
  const lst = categories || [];
  // 1. Direct id hit — most common path; saved value is a valid slug.
  if (lst.some((c) => c.id === savedId)) return savedId;
  // 2. Case-insensitive name match — saved value is the display name.
  const lowered = String(savedId).toLowerCase().trim();
  const byName = lst.find((c) => (c.name || '').toLowerCase().trim() === lowered);
  if (byName) return byName.id;
  // 3. Strip emoji and retry against both id and name. Handles
  //    "🛍️ SALE" → "SALE" → matches a category named "Sale" or with id "sale".
  const cleaned = stripEmoji(savedId).toLowerCase();
  if (!cleaned) return null;
  const byCleaned = lst.find((c) =>
    (c.id || '').toLowerCase() === cleaned
    || (c.name || '').toLowerCase().trim() === cleaned
  );
  return byCleaned ? byCleaned.id : null;
}

// Admin-managed sale-promo marquee shown above the home hero. Reads the
// catalog from BusinessSettings.category_promotions via /api/settings —
// each enabled entry becomes a clickable banner that deep-links to the
// linked category page. Empty/all-disabled → component renders nothing
// so the page collapses to just the hero.
function PromoMarquee({ promos, categories, onNavigate, toast }) {
  // Banners whose image fails to load (404, network error, deleted file)
  // are added to brokenIds so they're filtered out of the marquee. This
  // matters on Render's ephemeral disk: redeploys wipe /uploads, leaving
  // saved URLs pointing at nothing — without this, the marquee renders
  // thin ghost strips (just the button border, no image).
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const enabled = (promos || []).filter((p) => p.enabled && p.image_url && !brokenIds.has(p.id));
  if (enabled.length === 0) return null;
  // ~6s per item feels about right — long enough to read a banner, short
  // enough to keep things lively. Floor at 18s so a single-entry marquee
  // doesn't whip across the screen.
  const duration = `${Math.max(18, enabled.length * 6)}s`;

  const onBannerClick = (p) => {
    const resolved = resolveCategoryId(p.category_id, categories);
    if (resolved) {
      onNavigate('products', { category: resolved });
      return;
    }
    // Saved value doesn't match any current category — show all products
    // instead of an empty filtered page, and flag it so the admin notices.
    // The toast is informational; navigation still happens.
    if (toast) toast.push('Showing all products — the linked category isn’t available.', 'info');
    onNavigate('products');
  };

  // Two identical copies of the list make the -50% translate a seamless
  // loop. aria-hidden the second copy so screen readers don't read each
  // banner twice. Key prefix differentiates so React doesn't reuse nodes.
  // Per-promo dimensions ride on CSS custom properties so the responsive
  // mobile/desktop split happens in CSS — inline `style` can't hold media
  // queries. Blanks omit the variable, letting the .promo-banner-img
  // fallback (h-24 / sm:h-32 / w-auto) take effect.
  const sizeVars = (p) => {
    const v = {};
    if (Number.isFinite(p.height_mobile_px)) v['--promo-h-mobile'] = `${p.height_mobile_px}px`;
    if (Number.isFinite(p.height_desktop_px)) v['--promo-h-desktop'] = `${p.height_desktop_px}px`;
    if (Number.isFinite(p.width_mobile_px)) v['--promo-w-mobile'] = `${p.width_mobile_px}px`;
    if (Number.isFinite(p.width_desktop_px)) v['--promo-w-desktop'] = `${p.width_desktop_px}px`;
    return v;
  };
  const renderBanner = (p, copy) => (
    <button
      key={`${copy}-${p.id}`}
      type="button"
      onClick={() => onBannerClick(p)}
      aria-label={p.alt || `Open ${p.category_id} category`}
      className="shrink-0 mx-2 my-0 rounded-2xl overflow-hidden border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-transform"
    >
      <img
        src={resolveImageUrl(p.image_url) || p.image_url}
        alt={p.alt || ''}
        className="promo-banner-img block object-cover"
        style={sizeVars(p)}
        loading="lazy"
        draggable="false"
        onError={() => setBrokenIds((prev) => {
          if (prev.has(p.id)) return prev;
          const next = new Set(prev);
          next.add(p.id);
          return next;
        })}
      />
    </button>
  );
  return (
    <section className="bg-gradient-to-r from-emerald-50 via-amber-50 to-rose-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border-y border-stone-200/70 dark:border-slate-700 overflow-hidden">
      <div className="relative max-w-full">
        <div
          className="promo-marquee-track flex w-max items-center py-3"
          style={{ '--promo-marquee-duration': duration }}
        >
          {enabled.map((p) => renderBanner(p, 'a'))}
          {/* Second copy keeps the scroll seamless — aria-hidden so screen
              readers don't announce the same banner twice. */}
          <div aria-hidden="true" className="flex">
            {enabled.map((p) => renderBanner(p, 'b'))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// HOMEPAGE — editorial saree & lehenga storefront
//
// Structure (top to bottom):
//   1. PromoMarquee           — admin-managed promo banners (untouched)
//   2. CinematicHero          — full-bleed dark hero with silk motion
//   3. CollectionMosaic       — asymmetric 4-tile collection showcase
//   4. TheEdit                — horizontal scroll-snap product carousel
//   5. BrandStoryBand         — typography-heavy ivory band with pillars
//   6. EditorsPick            — single hero product, "Edit of the week"
//   7. WeaveTrail             — three-step "From loom to door" timeline
//   8. AtelierNewsletter      — maroon footer band with concierge CTA
//
// Every dynamic data source (api.getProducts, api.getCategories,
// settings.home_hero_features, settings.category_promotions) is the
// SAME as before — no backend/admin contracts change. The admin's
// Settings → Home hero editor still drives the headline/subheadline/
// announcement/trust pills exactly like it did.
// ============================================================

// Light-touch scroll reveal. Adds `is-visible` to children once they
// enter the viewport so the CSS `.reveal-up` transition fires. Uses
// IntersectionObserver — no library, no polyfill required for modern
// evergreen browsers (covers everything we ship to).
function useScrollReveal(deps = []) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const targets = document.querySelectorAll('.reveal-up:not(.is-visible)');
    if (!targets.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Maps a category id from the seeded saree/lehenga catalog to a
// custom-styled mosaic tile. Falls back to a neutral maroon tile if a
// category has been added by the admin that we don't have a recipe for
// — so the homepage never breaks when the catalog grows.
const COLLECTION_TILE_STYLES = {
  sarees:   { gradient: 'linear-gradient(135deg, #c14b6a 0%, #7a1f2a 100%)', accent: '#f5e8c7', kicker: 'The drape',     subtitle: 'Banarasi, Kanjeevaram, Chiffon & more' },
  lehengas: { gradient: 'linear-gradient(135deg, #b07423 0%, #7a4a16 100%)', accent: '#fdf8ef', kicker: 'For occasions', subtitle: 'From sangeet to cocktail' },
  bridal:   { gradient: 'linear-gradient(135deg, #4a0f1a 0%, #1a0508 100%)', accent: '#e0b04a', kicker: 'For your day',   subtitle: 'Hand-finished bridal couture' },
  festive:  { gradient: 'linear-gradient(135deg, #c14b6a 0%, #8b1d3a 100%)', accent: '#ffd57a', kicker: 'Festive edit',  subtitle: 'Diwali, Karva Chauth & more' },
  designer: { gradient: 'linear-gradient(135deg, #5a2a4a 0%, #2a0810 100%)', accent: '#f5e8c7', kicker: 'Atelier',       subtitle: 'Signed by emerging designers' },
};
const DEFAULT_TILE_STYLE = { gradient: 'linear-gradient(135deg, #7a1f2a 0%, #2a0810 100%)', accent: '#f5e8c7', kicker: 'Collection', subtitle: '' };

export function HomePage({ onNavigate }) {
  const { t } = useTranslation();
  const { addItem } = useCart();
  const toast = useToast();
  const settings = useSettings();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  // All eight home-hero entries are managed in one JSONB array via admin
  // Settings → Product details → Home hero trust pills. The keys drive
  // distinct render paths below.
  const heroByKey = Object.fromEntries((settings.home_hero_features || []).map((f) => [f.key, f]));
  const announcement = heroByKey.announcement;
  const headlineTop = heroByKey.headline_top;
  const headlineBottom = heroByKey.headline_bottom;
  const subheadline = heroByKey.subheadline;
  const backgroundImage = heroByKey.background_image;
  const trustPills = ['delivery', 'freshness', 'speed']
    .map((k) => heroByKey[k])
    .filter((f) => f?.enabled);
  // Resolve the hero image so /uploads/… paths get the API host prefix, and
  // skip it entirely when the toggle is off or the URL field is empty.
  const heroBgUrl = backgroundImage?.enabled && backgroundImage?.title?.trim()
    ? resolveImageUrl(backgroundImage.title.trim())
    : null;

  useEffect(() => {
    Promise.all([api.getProducts(), api.getCategories()])
      .then(([p, c]) => {
        setProducts(p.data.slice(0, 8));
        setCategories(c.data);
        setLoading(false);
      });
  }, []);

  // Re-run the reveal-up observer once data finishes loading — the
  // section markup that depends on products/categories only exists
  // after that paint, so we need a second pass.
  useScrollReveal([loading]);

  const onAdd = (p) => { addItem(p); toast.push(t('products.addedToCart', { name: p.name })); };

  // Editor's Pick = the highest-priced item we've fetched (the bridal
  // tier). Falls back to first product if pricing is uniform.
  const editorsPick = (products.length
    ? [...products].sort((a, b) => (b.price || 0) - (a.price || 0))[0]
    : null);

  return (
    <div>
      <PromoMarquee promos={settings.category_promotions} categories={categories} onNavigate={onNavigate} toast={toast} />

      {/* ── 1. CINEMATIC HERO ────────────────────────────────────
          Full-bleed dark stage with a slow animated silk-flow
          overlay, big serif headline center-aligned, and a slim
          house-name marquee scrolling on the right edge. The
          admin's uploaded background image (if set) overrides the
          cinematic backdrop with a scrim, same as before. */}
      <section
        className={`relative overflow-hidden ${heroBgUrl ? 'bg-stone-900' : 'editorial-hero'}`}
        style={heroBgUrl ? { backgroundImage: `url(${heroBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {heroBgUrl ? (
          <div className="absolute inset-0 bg-black/45"></div>
        ) : (
          <>
            <div className="editorial-silk" aria-hidden="true" />
            <LuxuryBackground />
          </>
        )}

        {/* Vertical house-name marquee, faint, behind copy. */}
        {!heroBgUrl && (
          <div aria-hidden="true" className="absolute top-0 bottom-0 right-2 sm:right-6 w-[160px] overflow-hidden opacity-20 hidden md:block">
            <div className="editorial-house-marquee font-luxury-italic text-amber-200 text-2xl leading-[3.5rem] tracking-widest text-right">
              {[...Array(2)].map((_, copy) => (
                <div key={copy}>
                  <div>Banarasi</div>
                  <div>Kanjeevaram</div>
                  <div>Chanderi</div>
                  <div>Tussar</div>
                  <div>Patola</div>
                  <div>Bandhani</div>
                  <div>Mysore Silk</div>
                  <div>Paithani</div>
                  <div>Dabka</div>
                  <div>Zardozi</div>
                  <div>Gota Patti</div>
                  <div>Mirror Work</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative max-w-5xl mx-auto px-6 py-24 sm:py-32 md:py-40 text-center">
          {announcement?.enabled && announcement?.title && (
            <span className="inline-flex items-center gap-2 bg-white/8 backdrop-blur border border-amber-300/40 px-5 py-1.5 rounded-full text-[11px] uppercase font-medium text-amber-100 mb-8 tracking-[0.18em]">
              <span className="w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse"></span>
              {announcement.title}
            </span>
          )}

          {(headlineTop?.enabled && headlineTop?.title) || (headlineBottom?.enabled && headlineBottom?.title) ? (
            <h1 className="font-luxury text-5xl sm:text-7xl md:text-[5.5rem] font-semibold leading-[1.03] text-amber-50">
              {headlineTop?.enabled && headlineTop?.title && (
                <span className="block reveal-up">{headlineTop.title}</span>
              )}
              {headlineBottom?.enabled && headlineBottom?.title && (
                <span
                  className="block font-luxury-italic font-medium reveal-up mt-1"
                  style={{
                    transitionDelay: '120ms',
                    background: 'linear-gradient(135deg, #f5e8c7 0%, #e0b04a 45%, #c89b3c 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {headlineBottom.title}
                </span>
              )}
            </h1>
          ) : null}

          {subheadline?.enabled && subheadline?.title && (
            <p className="reveal-up mt-7 text-base sm:text-lg text-amber-50/80 leading-relaxed max-w-2xl mx-auto" style={{ transitionDelay: '220ms' }}>
              {subheadline.title}
            </p>
          )}

          <div className="reveal-up mt-10 flex flex-wrap justify-center gap-3" style={{ transitionDelay: '320ms' }}>
            <button onClick={() => onNavigate('products')}
              className="luxury-cta px-8 py-3.5 rounded-full font-semibold tracking-wide flex items-center gap-2">
              {t('home.shopNow')} <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => onNavigate('products', { category: 'bridal' })}
              className="luxury-cta-ghost px-8 py-3.5 rounded-full font-semibold tracking-wide">
              Bridal Couture
            </button>
          </div>

          <div className="reveal-up mt-14 flex flex-wrap justify-center items-center gap-x-8 gap-y-3" style={{ transitionDelay: '420ms' }}>
            {trustPills.map((f) => {
              const Icon = HERO_FEATURE_ICONS[f.key] || Shield;
              return (
                <div key={f.key} className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-amber-100/70">
                  <Icon className="w-4 h-4 text-amber-300" />
                  <span>{f.title}</span>
                </div>
              );
            })}
          </div>

          {/* Bouncing chevron scroll cue. */}
          <div aria-hidden="true" className="hidden md:flex flex-col items-center mt-20 text-amber-100/40">
            <span className="text-[10px] tracking-[0.3em] uppercase mb-2">Scroll</span>
            <ChevronRight className="w-4 h-4 rotate-90 editorial-scroll-cue" />
          </div>
        </div>
      </section>

      {/* ── 2. COLLECTION MOSAIC ─────────────────────────────────
          Asymmetric editorial layout — one anchor tile on the
          left (first category), three smaller tiles on the right.
          Each tile is clickable and routes into the matching
          category. Hover: tile lifts, gold border, art zooms. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="reveal-up text-center mb-12">
          <p className="text-[11px] uppercase tracking-[0.32em] font-semibold mb-3" style={{ color: '#c89b3c' }}>The Collections</p>
          <h2 className="font-luxury text-4xl sm:text-5xl font-semibold text-stone-900 dark:text-amber-50">
            Worlds within Redlook
          </h2>
          <div aria-hidden="true" className="editorial-hairline mx-auto w-32 mt-5" />
        </div>

        {(() => {
          if (!categories.length) {
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-[28rem]">
                {[...Array(3)].map((_, i) => <div key={i} className="bg-stone-100 animate-pulse rounded-3xl" />)}
              </div>
            );
          }
          const [anchor, ...rest] = categories;
          const anchorStyle = COLLECTION_TILE_STYLES[anchor.id] || DEFAULT_TILE_STYLE;
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Anchor — large square on the left */}
              <button
                onClick={() => onNavigate('products', { category: anchor.id })}
                className="editorial-tile reveal-up text-left h-[28rem] md:h-[34rem]"
                style={{ background: anchorStyle.gradient }}>
                <div className="absolute inset-0 flex items-end p-8">
                  <div className="relative z-10">
                    <p className="text-[11px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: anchorStyle.accent }}>
                      {anchorStyle.kicker}
                    </p>
                    <div className="font-luxury text-4xl sm:text-5xl font-semibold text-amber-50 mb-2">{anchor.name}</div>
                    <p className="text-sm text-amber-50/75 max-w-xs">{anchorStyle.subtitle}</p>
                    <div className="editorial-tile-arrow mt-5 inline-flex items-center gap-2 text-amber-200 font-semibold text-sm">
                      Explore the edit <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <div className="editorial-tile-art absolute top-1/2 right-6 -translate-y-1/2 text-[10rem] sm:text-[12rem] opacity-90" style={{ filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.4))' }} aria-hidden="true">
                  {anchor.icon}
                </div>
              </button>

              {/* 4 smaller tiles stacked on the right in a 2x2 grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {rest.slice(0, 4).map((c, idx) => {
                  const s = COLLECTION_TILE_STYLES[c.id] || DEFAULT_TILE_STYLE;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onNavigate('products', { category: c.id })}
                      className="editorial-tile reveal-up text-left h-[13.5rem] md:h-[16.4rem]"
                      style={{ background: s.gradient, transitionDelay: `${(idx + 1) * 80}ms` }}>
                      <div className="absolute inset-0 flex items-end p-5">
                        <div className="relative z-10">
                          <p className="text-[10px] uppercase tracking-[0.24em] font-semibold mb-2" style={{ color: s.accent }}>
                            {s.kicker}
                          </p>
                          <div className="font-luxury text-xl sm:text-2xl font-semibold text-amber-50">{c.name}</div>
                          <p className="text-xs text-amber-50/70 mt-1 hidden sm:block">{s.subtitle}</p>
                        </div>
                      </div>
                      <div className="editorial-tile-art absolute top-1/2 right-4 -translate-y-1/2 text-[5rem] opacity-90" aria-hidden="true">
                        {c.icon}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </section>

      {/* ── 3. THE EDIT — horizontal product scroller ──────────── */}
      <section className="py-16" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(245,232,199,0.20) 50%, transparent 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-8 reveal-up">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] font-semibold mb-3" style={{ color: '#c89b3c' }}>The Edit</p>
              <h2 className="font-luxury text-3xl sm:text-4xl font-semibold text-stone-900 dark:text-amber-50">
                {t('home.freshToday')}
              </h2>
              <div aria-hidden="true" className="editorial-hairline w-24 mt-3" />
            </div>
            <button onClick={() => onNavigate('products')} className="font-semibold text-sm flex items-center gap-1 transition group" style={{ color: '#7a1f2a' }}>
              {t('common.viewAll')}
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          {loading ? (
            <div className="flex gap-5 overflow-hidden">
              {[...Array(5)].map((_, i) => <div key={i} className="bg-stone-100 animate-pulse rounded-2xl w-[260px] aspect-[3/4] flex-shrink-0" />)}
            </div>
          ) : (
            <div className="editorial-scroller -mx-4 sm:-mx-6 px-4 sm:px-6">
              {products.map((p) => (
                <article
                  key={p.id}
                  className="editorial-product-card reveal-up"
                  onClick={() => onNavigate('product', { id: p.id })}>
                  <div className="epc-frame">
                    {resolveImageUrl(p.image)
                      ? <img src={resolveImageUrl(p.image)} alt={p.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      : <span aria-hidden="true" style={{ filter: 'drop-shadow(0 8px 18px rgba(74,15,26,0.25))' }}>{p.image}</span>}
                    {p.isOrganic && (
                      <span className="luxury-badge absolute top-3 left-3">{t('products.organic')}</span>
                    )}
                  </div>
                  <div className="mt-4 px-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-1.5" style={{ color: '#c89b3c' }}>{p.freshness}</p>
                    <h3 className="font-luxury text-lg text-stone-900 dark:text-amber-50 leading-snug">{p.name}</h3>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-base font-semibold" style={{ color: '#4a0f1a' }}>{formatINR(p.price)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onAdd(p); }}
                        className="luxury-cta px-3 py-1.5 rounded-full text-xs font-semibold">
                        Add
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <p className="text-center text-xs text-stone-500 dark:text-amber-100/60 mt-4 hidden md:block">Swipe or scroll horizontally to explore the edit →</p>
        </div>
      </section>

      {/* ── 4. BRAND STORY BAND ──────────────────────────────────
          Ivory band with a centred drop-cap paragraph and three
          gold-framed pillars below. Pure typography — no images. */}
      <section className="editorial-band py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="reveal-up text-[11px] uppercase tracking-[0.32em] font-semibold mb-3" style={{ color: '#c89b3c' }}>
            Our craft
          </p>
          <h2 className="reveal-up font-luxury text-3xl sm:text-5xl font-semibold leading-tight text-stone-900" style={{ transitionDelay: '80ms' }}>
            {settings?.company_tagline || 'Heritage drapes, modern grace.'}
          </h2>
          <div aria-hidden="true" className="editorial-hairline mx-auto w-36 mt-6 mb-8" />
          <p className="reveal-up editorial-dropcap font-luxury-italic text-lg sm:text-xl text-stone-700 leading-relaxed text-left" style={{ transitionDelay: '180ms' }}>
            Every Redlook drape begins on a wooden loom in a village where weaving has been a vocation for generations.
            We work directly with master weavers from Varanasi, Kanchipuram, Chanderi, and Bhagalpur — paying fair wages,
            preserving signature motifs, and bringing each piece into your wardrobe with the care of a private atelier.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-14">
            {[
              { title: 'Hand-loomed', body: 'Made on traditional pit looms, never powered or mass-produced.' },
              { title: 'Naturally dyed', body: 'Plant and mineral dyes wherever the weave allows — kinder to skin and the river.' },
              { title: 'Verified authentic', body: 'Each saree is inspected, tagged, and numbered before it ships.' },
            ].map((pillar, i) => (
              <div key={pillar.title} className="reveal-up" style={{ transitionDelay: `${280 + i * 80}ms` }}>
                <div aria-hidden="true" className="mx-auto w-10 editorial-hairline mb-4" />
                <div className="font-luxury text-xl font-semibold text-stone-900 mb-2">{pillar.title}</div>
                <p className="text-sm text-stone-700 leading-relaxed">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. EDITOR'S PICK ─────────────────────────────────────
          A single oversized hero product card — image left, copy
          right (alternates on mobile). Gives one drape the runway
          treatment per visit. */}
      {editorsPick && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div
              className="reveal-up relative aspect-[3/4] rounded-3xl flex items-center justify-center text-[15rem] cursor-pointer overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #f5e8c7 0%, #fdf8ef 60%, #f5e8c7 100%)', border: '1px solid rgba(200,155,60,0.35)' }}
              onClick={() => onNavigate('product', { id: editorsPick.id })}>
              {resolveImageUrl(editorsPick.image)
                ? <img src={resolveImageUrl(editorsPick.image)} alt={editorsPick.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                : <span aria-hidden="true" style={{ filter: 'drop-shadow(0 14px 32px rgba(74,15,26,0.35))' }}>{editorsPick.image}</span>}
              <span className="luxury-badge absolute top-5 left-5">Editor's Pick</span>
            </div>
            <div className="reveal-up" style={{ transitionDelay: '120ms' }}>
              <p className="text-[11px] uppercase tracking-[0.32em] font-semibold mb-3" style={{ color: '#c89b3c' }}>Drape of the week</p>
              <h2 className="font-luxury text-4xl sm:text-5xl font-semibold text-stone-900 dark:text-amber-50 leading-tight mb-5">
                {editorsPick.name}
              </h2>
              <div aria-hidden="true" className="editorial-hairline w-20 mb-6" />
              <p className="text-base sm:text-lg text-stone-700 dark:text-amber-100/80 leading-relaxed mb-8">
                {editorsPick.description}
              </p>
              <div className="flex items-baseline gap-3 mb-8">
                <span className="font-luxury text-3xl font-semibold" style={{ color: '#4a0f1a' }}>{formatINR(editorsPick.price)}</span>
                {editorsPick.mrp != null && editorsPick.mrp > editorsPick.price && (
                  <span className="text-sm text-stone-400 line-through">{formatINR(editorsPick.mrp)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onNavigate('product', { id: editorsPick.id })}
                  className="luxury-cta px-7 py-3 rounded-full font-semibold tracking-wide flex items-center gap-2">
                  View this drape <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { onAdd(editorsPick); }}
                  className="px-7 py-3 rounded-full font-semibold tracking-wide border transition"
                  style={{ borderColor: '#7a1f2a', color: '#7a1f2a' }}>
                  Add to bag
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 6. WEAVE TRAIL — three-step "loom to door" ──────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="reveal-up text-center mb-12">
          <p className="text-[11px] uppercase tracking-[0.32em] font-semibold mb-3" style={{ color: '#c89b3c' }}>How it travels</p>
          <h2 className="font-luxury text-3xl sm:text-4xl font-semibold text-stone-900 dark:text-amber-50">
            From the loom to your door
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 relative">
          {[
            { step: '01', title: 'Curated by hand', body: 'Our drape consultants visit weaver families and select the season\'s edit, piece by piece.' },
            { step: '02', title: 'Verified & tagged', body: 'Each saree is inspected, numbered, and sealed with a Redlook authenticity tag.' },
            { step: '03', title: 'Concierge delivery', body: 'Insured, tracked shipping with optional white-glove try-on for bridal couture.' },
          ].map((s, i) => (
            <div key={s.step} className="reveal-up relative pl-6" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="absolute left-0 top-0 h-full w-px" style={{ background: 'linear-gradient(180deg, rgba(200,155,60,0.85) 0%, transparent 100%)' }} />
              <p className="font-luxury-italic text-2xl mb-2" style={{ color: '#c89b3c' }}>{s.step}</p>
              <h3 className="font-luxury text-xl font-semibold text-stone-900 dark:text-amber-50 mb-2">{s.title}</h3>
              <p className="text-sm text-stone-700 dark:text-amber-100/70 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 7. ATELIER NEWSLETTER — concierge CTA ──────────────── */}
      <section className="editorial-atelier py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="luxury-shimmer" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <p className="reveal-up text-[11px] uppercase tracking-[0.32em] font-semibold mb-4 text-amber-300">
            The Atelier
          </p>
          <h2 className="reveal-up font-luxury text-4xl sm:text-5xl font-semibold text-amber-50 leading-tight" style={{ transitionDelay: '80ms' }}>
            Join our private list
          </h2>
          <div aria-hidden="true" className="editorial-hairline mx-auto w-24 mt-5 mb-6" />
          <p className="reveal-up text-amber-100/80 leading-relaxed mb-8" style={{ transitionDelay: '160ms' }}>
            Be first to see new drops from emerging Indian designers, private bridal previews, and concierge styling notes — once a fortnight, never more.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              toast.push('Thank you — we\'ve added you to the atelier list.', 'success');
              e.currentTarget.reset();
            }}
            className="reveal-up flex flex-col sm:flex-row gap-3 max-w-xl mx-auto"
            style={{ transitionDelay: '220ms' }}>
            <input
              type="email"
              required
              placeholder="your@email.com"
              aria-label="Email address"
              className="editorial-atelier-input flex-1 px-5 py-3.5 rounded-full text-sm"
            />
            <button type="submit" className="luxury-cta px-7 py-3.5 rounded-full font-semibold tracking-wide whitespace-nowrap">
              Join the list
            </button>
          </form>
          <p className="text-[11px] text-amber-100/50 mt-4 tracking-wide">No spam, ever. Unsubscribe in one click.</p>
        </div>
      </section>
    </div>
  );
}

// ============================================================
// PRODUCT LISTING
// ============================================================
export function ProductListPage({ onNavigate, params }) {
  const { t } = useTranslation();
  const { addItem } = useCart();
  const toast = useToast();
  const settings = useSettings();
  // Slider cap is admin-driven via BusinessSettings.max_price_filter_cap.
  // In auto mode the backend resolves it to the live catalog max so the
  // slider always covers every Active SKU. Coerced to a sane minimum so
  // the slider never collapses if settings come back empty.
  const priceCap = Math.max(20, Math.round(Number(settings?.max_price_filter_cap) || 150));
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(params?.category || 'all');
  // Seed the search box from the URL's ?q= so the global navbar search (and
  // shared/bookmarked search URLs) land here pre-filtered.
  const [search, setSearch] = useState(params?.q || '');
  const [sortBy, setSortBy] = useState('popular');
  const [organicOnly, setOrganicOnly] = useState(false);
  // null = "no upper limit set yet", which we treat as priceCap (the
  // admin-configured maximum). Stored as null instead of priceCap so the
  // slider auto-tracks when the cap moves between renders (e.g., settings
  // arrive after first paint, or a new pricey SKU bumps the catalog max).
  const [maxPrice, setMaxPrice] = useState(null);
  const effectiveMaxPrice = maxPrice == null ? priceCap : Math.min(maxPrice, priceCap);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProducts(), api.getCategories()]).then(([p, c]) => {
      setProducts(p.data);
      setCategories(c.data);
      setLoading(false);
    });
  }, []);

  // Re-running a navbar search while already on this page only changes the URL
  // param (the component stays mounted, so the useState seed above won't fire
  // again). Mirror ?q= / ?category= into local state when they change.
  useEffect(() => { setSearch(params?.q || ''); }, [params?.q]);
  useEffect(() => { if (params?.category) setActiveCategory(params.category); }, [params?.category]);

  let filtered = products;
  if (activeCategory !== 'all') filtered = filtered.filter(p => p.category === activeCategory);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (organicOnly) filtered = filtered.filter(p => p.isOrganic);
  filtered = filtered.filter(p => p.price <= effectiveMaxPrice);
  if (sortBy === 'price-low') filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sortBy === 'price-high') filtered = [...filtered].sort((a, b) => b.price - a.price);
  if (sortBy === 'rating') filtered = [...filtered].sort((a, b) => b.rating - a.rating);

  const onAdd = (p) => { addItem(p); toast.push(t('products.addedToCart', { name: p.name })); };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-stone-500 mb-4">
        <button onClick={() => onNavigate('home')} className="hover:text-emerald-700">{t('nav.home')}</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-stone-900 font-medium">{t('nav.shop')}</span>
      </div>
      <h1 className="text-3xl font-bold text-stone-900 mb-6">{t('products.allVegetables')}</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('products.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-4 py-3 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 bg-white">
          <option value="popular">{t('products.sortMostPopular')}</option>
          <option value="price-low">{t('products.sortPriceLow')}</option>
          <option value="price-high">{t('products.sortPriceHigh')}</option>
          <option value="rating">{t('products.sortTopRated')}</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        <button onClick={() => setActiveCategory('all')}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${activeCategory === 'all' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-stone-700 hover:border-emerald-300'}`}>
          {t('common.all')}
        </button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setActiveCategory(c.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${activeCategory === c.id ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-stone-700 hover:border-emerald-300'}`}>
            <span>{c.icon}</span> {c.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-center mb-6 text-sm">
        <label className="flex items-center gap-2 text-stone-700">
          <input type="checkbox" checked={organicOnly} onChange={e => setOrganicOnly(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
          {t('products.organicOnly')}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-stone-700">{t('products.maxPrice')}: <strong>₹{effectiveMaxPrice}</strong></span>
          <input type="range" min="20" max={priceCap} step="5" value={effectiveMaxPrice}
            onChange={e => setMaxPrice(+e.target.value)}
            className="accent-emerald-600 w-32" />
        </div>
      </div>

      <p className="text-sm text-stone-500 mb-4">{t('products.productCount', { count: filtered.length })}</p>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="bg-stone-100 animate-pulse rounded-2xl aspect-[3/4]"></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-stone-600 mb-4">{t('products.noResults')}</p>
          <button onClick={() => { setSearch(''); setActiveCategory('all'); setOrganicOnly(false); setMaxPrice(null); }}
            className="text-emerald-700 font-semibold hover:text-emerald-800">{t('products.resetFilters')}</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p}
              onClick={() => onNavigate('product', { id: p.id })}
              onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  );
}

// Static key→icon map for the product-detail badge row. Mirrors the icons
// the admin sees in /admin/settings/product_details. Keep these in sync if
// new badge keys are introduced.
const PDP_BADGE_ICONS = { delivery: Truck, returns: RotateCcw, freshness: Shield, slot: Clock };

// Resolves the admin-edited badge catalog into the array the product page
// renders. Two things the admin can't express in plain strings:
//   - the returns badge swapping to its non-returnable variant + rose tone
//     when the product is flagged is_returnable=false
//   - the slot subtitle is always the live next-slot label, regardless of
//     what's saved — admins can't outdate it (it changes through the day)
//
// Older saved subtitles may still contain {free_delivery_over} / {next_slot}
// placeholder tokens from an earlier templating attempt. We strip them on
// render so a half-edited subtitle like "On orders ₹300{free_delivery_over}+"
// reads cleanly as "On orders ₹300+" instead of "On orders ₹300299+".
const LEGACY_TOKEN_RE = /\{free_delivery_over\}|\{next_slot\}/g;
const stripTokens = (str) => (str || '').replace(LEGACY_TOKEN_RE, '');

function buildProductBadges(settings, product, nextSlot) {
  return (settings.product_detail_badges || [])
    .filter((b) => b.enabled)
    .map((b) => {
      if (b.key === 'returns' && product.is_returnable === false) {
        // Non-returnable variant — rose tone reads as a warning so the
        // customer notices before adding to cart.
        return { icon: X, title: stripTokens(b.title_alt || b.title), sub: stripTokens(b.subtitle_alt || b.subtitle), tone: 'rose' };
      }
      const Icon = PDP_BADGE_ICONS[b.key] || Shield;
      const sub = b.key === 'slot' ? nextSlot.label : stripTokens(b.subtitle);
      return { icon: Icon, title: stripTokens(b.title), sub, tone: 'emerald' };
    });
}

// ============================================================
// PRODUCT DETAILS
// ============================================================
export function ProductDetailsPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const { addItem } = useCart();
  const toast = useToast();
  const settings = useSettings();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  // Index into product.images for the gallery's "currently showing" photo.
  // Reset whenever the visitor navigates to a different SKU so we never
  // show product B's 4th photo because product A had 5 and B has 2.
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  // Currently picked colour variant. Null when the product has no
  // variants (single-SKU mode) or before the product has loaded. When
  // set, the gallery swaps to that variant's photos and the stock /
  // add-to-cart use the variant's inventory.
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  // X coordinate where the current touch-drag on the gallery began, so
  // touchEnd can measure swipe direction/distance. Null when no drag is active.
  const touchStartX = useRef(null);

  // Compute the next available slot at render time. Cheap (5-entry array
  // scan) and the customer's clock advancing across a cutoff while sitting
  // on the page would otherwise show a stale label. The slot label round-
  // trips into Order.delivery_slot via checkout, so the format stays
  // consistent with the value the admin sees on the order detail page.
  // settings.delivery_slots may be undefined on first paint (before /api/settings
  // resolves) — getNextAvailableSlot falls back to DEFAULT_DELIVERY_SLOTS internally.
  const nextSlot = getNextAvailableSlot(new Date(), settings.delivery_slot_buffer_hours ?? 5, settings.delivery_slots);

  useEffect(() => {
    setActiveImageIndex(0);
    setSelectedVariantId(null);
    Promise.all([api.getProduct(params.id), api.getProducts()]).then(([r, all]) => {
      setProduct(r.data);
      if (r.data) {
        setRelated(all.data.filter(p => p.category === r.data.category && p.id !== r.data.id).slice(0, 4));
        // Default to the first in-stock variant so the gallery has
        // something to show; falls back to the first variant if all
        // are out of stock so the swatch row still renders.
        if (Array.isArray(r.data.variants) && r.data.variants.length > 0) {
          const firstInStock = r.data.variants.find((v) => v.stock > 0) || r.data.variants[0];
          setSelectedVariantId(firstInStock.variant_id);
        }
      }
      setLoading(false);
    });
  }, [params.id]);

  if (loading) return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16"><div className="bg-stone-100 animate-pulse h-96 rounded-2xl"></div></div>;
  if (!product) return (
    <div className="text-center py-16">
      <div className="text-6xl mb-4">🥲</div>
      <p className="text-stone-600 mb-4">{t('products.productNotFound')}</p>
      <button onClick={() => onNavigate('products')} className="text-emerald-700 font-semibold">{t('products.backToShop')}</button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => onNavigate('products')} className="flex items-center gap-2 text-sm text-stone-600 hover:text-emerald-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> {t('products.backToShop')}
      </button>

      {/* Compute variant-aware view once and reuse below for the
          gallery, swatch row, stock badge, and add-to-cart payload. */}
      {(() => null)()}
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Gallery — when the product has colour variants, the gallery
            shows the SELECTED variant's photos (each variant carries
            its own required photo set). Otherwise falls back to the
            product's own images array (multi-image v1). */}
        {(() => {
          const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
          const selectedVariant = hasVariants
            ? product.variants.find((v) => v.variant_id === selectedVariantId) || product.variants[0]
            : null;
          const gallery = selectedVariant
            ? (selectedVariant.images || [])
            : ((product.images && product.images.length > 0) ? product.images : (product.image ? [product.image] : []));
          const safeIndex = Math.min(activeImageIndex, Math.max(0, gallery.length - 1));
          const activeImage = gallery[safeIndex] || (selectedVariant?.images?.[0]) || product.image;
          const multi = gallery.length > 1;
          // Step the active photo by +1/-1, wrapping around the ends so the
          // arrows/swipe loop the gallery instead of dead-ending.
          const go = (dir) => {
            if (!multi) return;
            setActiveImageIndex((prev) => {
              const cur = Math.min(prev, gallery.length - 1);
              return (cur + dir + gallery.length) % gallery.length;
            });
          };
          // Horizontal swipe on the image: record where the finger lands, then
          // on lift compare X — a move past the threshold pages left/right.
          const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
          const onTouchEnd = (e) => {
            if (touchStartX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          };
          return (
            <div>
              <div
                className="relative bg-gradient-to-br from-stone-50 to-emerald-50 rounded-3xl aspect-[3/4] flex items-center justify-center text-[200px] shadow-inner overflow-hidden touch-pan-y select-none"
                onTouchStart={multi ? onTouchStart : undefined}
                onTouchEnd={multi ? onTouchEnd : undefined}>
                <ProductImage src={activeImage} alt={product.name} className="absolute inset-0 w-full h-full object-cover rounded-3xl" />
                {product.isOrganic && (
                  <span className="absolute top-4 left-4 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">{t('products.organic')}</span>
                )}
                {multi && (
                  <>
                    <button
                      type="button"
                      onClick={() => go(-1)}
                      aria-label={t('products.prevPhoto')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur text-stone-700 shadow-md flex items-center justify-center hover:bg-white transition">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => go(1)}
                      aria-label={t('products.nextPhoto')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur text-stone-700 shadow-md flex items-center justify-center hover:bg-white transition">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {gallery.map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-5 bg-emerald-600' : 'w-1.5 bg-white/80'}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {gallery.length > 1 && (
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {gallery.map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      onClick={() => setActiveImageIndex(i)}
                      aria-label={`Show photo ${i + 1} of ${gallery.length}`}
                      aria-pressed={i === safeIndex}
                      className={`flex-shrink-0 w-20 h-24 rounded-xl overflow-hidden border-2 transition relative bg-gradient-to-br from-stone-50 to-emerald-50 ${
                        i === safeIndex
                          ? 'border-emerald-600 ring-2 ring-emerald-200'
                          : 'border-stone-200 hover:border-stone-400'
                      }`}>
                      <ProductImage src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Star className="w-4 h-4 fill-current" />
              <span className="font-medium">{product.rating}</span>
              <span className="text-stone-400">· {t('products.reviewsCount', { count: product.reviews })}</span>
            </div>
            <ShareMenu product={product} />
          </div>
          <h1 className="text-4xl font-bold text-stone-900 mb-2">{product.name}</h1>
          {product.freshness && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                {product.freshness}
              </span>
            </div>
          )}
          <p className="text-stone-600 leading-relaxed mb-6">{product.description}</p>

          <div className="flex flex-wrap items-baseline gap-2 mb-6">
            <span className="text-4xl font-bold text-stone-900">{formatINR(product.price)}</span>
            {/* Show the MRP strikethrough + savings pill only when an effective
                discount applies. mrp/discount_percent come from the backend
                pricing resolver; equal mrp/price means "no discount". */}
            {product.mrp != null && product.mrp > product.price && (
              <>
                <span className="text-lg text-stone-400 line-through">{formatINR(product.mrp)}</span>
                <span className="inline-flex items-center bg-rose-50 text-rose-700 text-xs font-bold px-2 py-1 rounded-full">
                  {t('common.off', { percent: Math.round(product.discount_percent) })}
                </span>
              </>
            )}
            <span className="text-stone-500">{t('common.perUnit', { unit: product.unit })}</span>
          </div>

          {/* Colour-variant picker — only rendered when the product
              has 1+ variants. Each swatch shows the colour name on
              hover/below; out-of-stock variants get a slash overlay
              and can't be selected. Stock + add-to-cart below derive
              their numbers from whichever variant is selected. */}
          {(() => {
            const variants = Array.isArray(product.variants) ? product.variants : [];
            if (variants.length === 0) return null;
            const selected = variants.find((v) => v.variant_id === selectedVariantId) || variants[0];
            return (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-stone-700">Colour: <span className="text-stone-900">{selected.color}</span></span>
                  <span className="text-xs text-stone-500">{variants.length} option{variants.length === 1 ? '' : 's'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = v.variant_id === selected.variant_id;
                    const isOut = Number(v.stock) <= 0;
                    return (
                      <button
                        key={v.variant_id}
                        type="button"
                        disabled={isOut}
                        onClick={() => { setSelectedVariantId(v.variant_id); setActiveImageIndex(0); }}
                        title={v.color + (isOut ? ' (out of stock)' : '')}
                        aria-label={`Select colour ${v.color}`}
                        aria-pressed={isSelected}
                        className={`relative w-11 h-11 rounded-full border-2 transition shrink-0 ${
                          isSelected ? 'border-emerald-600 ring-2 ring-emerald-200 ring-offset-2' : 'border-white shadow ring-1 ring-stone-200 hover:ring-stone-400'
                        } ${isOut ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        style={{ background: v.color_hex }}>
                        {isOut && (
                          <span className="absolute inset-0 flex items-center justify-center text-stone-700 font-bold text-lg">/</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {(() => {
            // Effective stock / variant-aware add-to-cart. When the
            // product has variants, the chosen variant's stock and
            // variant_id flow into addItem; otherwise the legacy single-
            // SKU path runs unchanged.
            const variants = Array.isArray(product.variants) ? product.variants : [];
            const selectedVariant = variants.length > 0
              ? (variants.find((v) => v.variant_id === selectedVariantId) || variants[0])
              : null;
            const effectiveStock = selectedVariant ? Number(selectedVariant.stock) : product.stock;

            if (effectiveStock === 0) {
              return (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {selectedVariant
                    ? `${selectedVariant.color} is currently out of stock`
                    : t('products.currentlyOutOfStock')}
                </div>
              );
            }

            const handleAdd = (navigateAfter = false) => {
              addItem(product, qty, selectedVariant);
              if (navigateAfter) onNavigate('cart');
              else toast.push(t('products.qtyAdded', { qty, name: product.name }));
            };

            return (
              <>
                <div className="mb-6">
                  <label className="text-sm font-medium text-stone-700 mb-2 block">{t('products.quantity')}</label>
                  <div className="inline-flex items-center bg-stone-100 rounded-xl">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-3 hover:bg-stone-200 rounded-l-xl transition"><Minus className="w-4 h-4" /></button>
                    <span className="px-6 font-semibold">{qty}</span>
                    <button onClick={() => setQty(qty + 1)} className="p-3 hover:bg-stone-200 rounded-r-xl transition"><Plus className="w-4 h-4" /></button>
                  </div>
                  {selectedVariant && (
                    <p className="text-xs text-stone-500 mt-1.5">{effectiveStock} in stock for {selectedVariant.color}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 mb-8">
                  <button onClick={() => handleAdd(false)}
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2">
                    <ShoppingCart className="w-4 h-4" /> {t('products.addToCartWithPrice', { price: formatINR(product.price * qty) })}
                  </button>
                  <button onClick={() => handleAdd(true)}
                    className="bg-stone-900 hover:bg-stone-800 text-white px-8 py-4 rounded-xl font-semibold transition">
                    {t('products.buyNow')}
                  </button>
                </div>
              </>
            );
          })()}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-stone-200">
            {buildProductBadges(settings, product, nextSlot).map((b, i) => (
              <div key={i} className="text-center">
                <b.icon className={`w-5 h-5 mx-auto mb-1 ${b.tone === 'rose' ? 'text-rose-600' : 'text-emerald-600'}`} />
                <div className="text-xs font-semibold text-stone-900">{b.title}</div>
                <div className="text-[10px] text-stone-500">{b.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ReviewsSection productId={product.id} onNavigate={onNavigate} />

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-stone-900 mb-6">{t('products.youMightAlsoLike')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map(p => (
              <ProductCard key={p.id} product={p}
                onClick={() => { onNavigate('product', { id: p.id }); }}
                onAdd={(prod) => { addItem(prod); toast.push(t('products.addedToCart', { name: prod.name })); }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// REVIEWS SECTION (slice 7) — public list + customer's own form
// Eligibility is enforced server-side; the form only renders when /me
// reports `eligible:true` (= customer has a Delivered order with this product).
// ============================================================
function ReviewsSection({ productId, onNavigate }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [reviews, setReviews] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [my, setMy] = useState({ review: null, eligible: false });

  // Reviews are public; "my review" needs auth. Fetch in parallel.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, mine] = await Promise.all([
        api.getReviews(productId, { page: 1, limit: 10 }),
        user ? api.getMyReview(productId).catch(() => ({ data: { review: null, eligible: false } })) : Promise.resolve({ data: { review: null, eligible: false } }),
      ]);
      setReviews(list.data);
      setMeta(list.meta);
      setMy(mine.data);
    } catch (err) {
      toast.push(err.message || t('reviews.couldNotLoad'), 'error');
    } finally {
      setLoading(false);
    }
  }, [productId, user, toast, t]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold text-stone-900 mb-6">{t('reviews.title')}</h2>

      {/* Self-service: write/edit/delete your own review */}
      {user ? (
        <ReviewForm productId={productId} my={my} eligible={my.eligible}
          onChanged={load} />
      ) : (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-6 text-sm">
          <button onClick={() => onNavigate('login')} className="text-emerald-700 font-semibold">{t('reviews.signInPrefix')}</button>
          <span className="text-stone-600">{t('reviews.signInSuffix')}</span>
        </div>
      )}

      {/* Public list */}
      {loading ? (
        <div className="bg-stone-100 animate-pulse h-32 rounded-xl" />
      ) : reviews.length === 0 ? (
        <div className="text-stone-500 text-sm py-4">{t('reviews.noneYet')}</div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => <ReviewCard key={r.review_id} review={r} />)}
          {meta && meta.total > reviews.length && (
            <p className="text-xs text-stone-500 text-center pt-2">{t('reviews.showingOf', { shown: reviews.length, total: meta.total })}</p>
          )}
        </div>
      )}
    </section>
  );
}

function StarRating({ value, onChange, size = 4, readOnly }) {
  // Controlled when onChange given; otherwise display-only.
  const [hover, setHover] = useState(0);
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        const Cls = `w-${size} h-${size} ${filled ? 'fill-amber-400 text-amber-400' : 'text-stone-300'} ${readOnly ? '' : 'cursor-pointer'}`;
        return readOnly ? (
          <Star key={n} className={Cls} />
        ) : (
          <button key={n} type="button"
            onClick={() => onChange?.(n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className="leading-none">
            <Star className={Cls} />
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({ review }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-xs font-semibold">
            {review.customer_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="font-semibold text-sm text-stone-900">{review.customer_name}</div>
            <div className="text-[11px] text-stone-500">{formatDate(review.created_at)}</div>
          </div>
        </div>
        <StarRating value={review.rating} readOnly />
      </div>
      {review.comment && <p className="text-sm text-stone-700 leading-relaxed">{review.comment}</p>}
    </div>
  );
}

// Compact inline rating used on the order tracking page. Fetches the
// customer's existing review for this product so it can render in three
// states: empty (click a star to start), editing (rating + optional comment +
// submit/cancel), or saved (display with Edit affordance). Self-contained so
// the tracking page just drops one per delivered item.
function InlineProductRating({ productId }) {
  const toast = useToast();
  const [my, setMy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getMyReview(productId)
      .then((r) => {
        if (cancelled) return;
        setMy(r.data.review);
        if (r.data.review) {
          setRating(r.data.review.rating);
          setComment(r.data.review.comment || '');
        }
      })
      .catch(() => { /* If /me fails, treat as no review yet — submit will surface the real error. */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const startEditing = (initialRating) => {
    if (initialRating) setRating(initialRating);
    setEditing(true);
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (rating < 1) { toast.push('Pick a star rating', 'error'); return; }
    setSubmitting(true);
    try {
      await api.submitReview(productId, rating, comment.trim() || null);
      const fresh = await api.getMyReview(productId);
      setMy(fresh.data.review);
      setEditing(false);
      toast.push(my ? 'Review updated' : 'Thanks for the rating!');
    } catch (err) {
      toast.push(err.message || 'Could not save rating', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    if (my) { setRating(my.rating); setComment(my.comment || ''); }
    else { setRating(0); setComment(''); }
  };

  if (loading) return <div className="h-6 w-24 bg-stone-100 rounded animate-pulse" />;

  if (editing) {
    return (
      <form onSubmit={submit} className="bg-white border border-emerald-200 rounded-xl p-3 mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <StarRating value={rating} onChange={setRating} size={5} />
          <span className="text-xs text-stone-500">{rating > 0 ? `${rating} / 5` : 'Tap a star'}</span>
        </div>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
          maxLength={2000} placeholder="Optional — share what you thought"
          className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-500" />
        <div className="flex gap-2 items-center">
          <button type="submit" disabled={rating < 1 || submitting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
            {submitting ? 'Saving…' : my ? 'Update' : 'Submit'}
          </button>
          <button type="button" onClick={cancelEdit}
            className="text-xs text-stone-500 hover:text-stone-700 font-semibold">Cancel</button>
        </div>
      </form>
    );
  }

  if (my) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <StarRating value={my.rating} readOnly size={4} />
        <span className="text-xs text-emerald-700 font-semibold">Rated</span>
        <button onClick={() => startEditing()} className="text-xs text-stone-500 hover:text-emerald-700 font-semibold underline">
          Edit
        </button>
      </div>
    );
  }

  // No review yet — clicking a star jumps straight into the form pre-set to that rating.
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-stone-500">Rate:</span>
      <StarRating value={0} onChange={(n) => startEditing(n)} size={4} />
    </div>
  );
}

function ReviewForm({ productId, my, eligible, onChanged }) {
  const toast = useToast();
  const editing = !!my.review;
  const [rating, setRating] = useState(my.review?.rating || 0);
  const [comment, setComment] = useState(my.review?.comment || '');
  const [submitting, setSubmitting] = useState(false);

  // When `my` updates after a successful save, sync local state.
  useEffect(() => {
    setRating(my.review?.rating || 0);
    setComment(my.review?.comment || '');
  }, [my.review?.review_id, my.review?.rating, my.review?.comment]);

  if (!eligible && !editing) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-6 text-sm text-stone-600">
        You can rate this product after it's been delivered to you.
      </div>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1) return toast.push('Pick a star rating', 'error');
    setSubmitting(true);
    try {
      await api.submitReview(productId, rating, comment.trim() || null);
      toast.push(editing ? 'Review updated' : 'Thanks for the review!');
      onChanged();
    } catch (err) {
      toast.push(err.message || 'Could not save review', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!confirm('Remove your review?')) return;
    try {
      await api.deleteMyReview(productId);
      toast.push('Review removed');
      onChanged();
    } catch (err) {
      toast.push(err.message || 'Could not delete review', 'error');
    }
  };

  return (
    <form onSubmit={onSubmit} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-5 mb-6">
      <h3 className="font-semibold text-stone-900 mb-3">
        {editing ? 'Your review' : 'Write a review'}
      </h3>
      <div className="mb-3">
        <label className="text-xs uppercase tracking-wide text-stone-500 font-semibold block mb-1.5">Your rating</label>
        <StarRating value={rating} onChange={setRating} size={6} />
      </div>
      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-stone-500 font-semibold block mb-1.5">Comment (optional)</label>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
          maxLength={2000} placeholder="What did you think?"
          className="w-full px-3 py-2 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-500 text-sm" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white px-5 py-2 rounded-xl font-semibold text-sm">
          {submitting ? 'Saving…' : editing ? 'Update review' : 'Post review'}
        </button>
        {editing && (
          <button type="button" onClick={onDelete}
            className="text-red-600 hover:text-red-700 px-3 py-2 text-sm font-semibold">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

// ============================================================
// CART
// ============================================================
export function CartPage({ onNavigate }) {
  const { t } = useTranslation();
  const { items, updateQty, removeItem, subtotal, refreshPrices } = useCart();
  // Pull current prices on every cart visit so admin-side discount changes
  // are reflected the moment the customer opens the cart, instead of using
  // the stale snapshot localStorage captured at add-time. refreshPrices is
  // stable (empty deps) so this only fires once per mount.
  useEffect(() => { refreshPrices(); }, [refreshPrices]);
  // Sum of (mrp - price) * qty across the cart. Skipped per-line when mrp
  // is missing or already <= price (no discount), so this naturally hits
  // 0 for a cart of full-price items.
  const totalSavings = items.reduce((s, i) => {
    const mrp = Number(i.mrp ?? 0);
    return s + (mrp > i.price ? (mrp - i.price) * i.qty : 0);
  }, 0);
  const mrpSubtotal = subtotal + totalSavings;
  // Live thresholds from /api/settings — admin-editable. Falls back to the
  // historical defaults if the request fails so the cart never blocks loading.
  const [thresholds, setThresholds] = useState({ min_order_value: 150, min_order_quantity: 1, delivery_charge: 40, free_delivery_over: 299 });
  useEffect(() => { api.getSettings().then(r => r.data && setThresholds(r.data)).catch(() => {}); }, []);

  const deliveryCharge = subtotal === 0
    ? 0
    : (subtotal > thresholds.free_delivery_over ? 0 : thresholds.delivery_charge);
  const total = subtotal + deliveryCharge;
  const minOrder = thresholds.min_order_value;
  const minQty = thresholds.min_order_quantity;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const belowMinValue = subtotal > 0 && subtotal < minOrder;
  const belowMinQty = items.length > 0 && totalQty < minQty;
  const belowMin = belowMinValue || belowMinQty;

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-7xl mb-4">🛒</div>
        <h1 className="text-3xl font-bold text-stone-900 mb-2">{t('cart.empty')}</h1>
        <p className="text-stone-600 mb-8">{t('cart.emptyHint')}</p>
        <button onClick={() => onNavigate('products')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold transition">
          {t('cart.startShopping')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">{t('cart.yourCart')}</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-3">
          {items.map(item => (
            <div key={cartLineKey(item)} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4 flex gap-4 items-center">
              <div className="w-20 h-20 bg-gradient-to-br from-stone-50 to-emerald-50 rounded-xl flex items-center justify-center text-4xl shrink-0 overflow-hidden">
                <ProductImage src={item.image} alt={item.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-stone-900 truncate">{item.name}</h3>
                {/* Show the colour name (with a swatch dot) under the
                    product name when this line is for a variant. The
                    label is the snapshot taken at add-to-cart time, so
                    it never changes if the admin later renames it. */}
                {item.variant_color && (
                  <p className="text-xs text-stone-500 mt-0.5 inline-flex items-center gap-1.5">
                    {item.variant_color_hex && (
                      <span className="w-3 h-3 rounded-full border border-white shadow-sm ring-1 ring-stone-200" style={{ background: item.variant_color_hex }} />
                    )}
                    Colour: <span className="text-stone-700 font-medium">{item.variant_color}</span>
                  </p>
                )}
                {/* Per-unit price: MRP strikethrough + discounted price when
                    item carries a discount, plain price otherwise. mrp may
                    be missing on cart items added before refreshPrices ran;
                    treat absence as "no discount" so we never show a phantom
                    strikethrough. */}
                <p className="text-sm text-stone-500">
                  {item.mrp != null && item.mrp > item.price ? (
                    <>
                      <span className="line-through text-stone-400">{formatINR(item.mrp)}</span>{' '}
                      <span className="text-stone-900 font-semibold">{formatINR(item.price)}</span>
                    </>
                  ) : (
                    <>{formatINR(item.price)}</>
                  )}
                  {' '}{t('common.perUnit', { unit: item.unit })}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="inline-flex items-center bg-stone-100 rounded-lg">
                    <button onClick={() => updateQty(cartLineKey(item), item.qty - 1)} className="p-2 hover:bg-stone-200 rounded-l-lg transition"><Minus className="w-3 h-3" /></button>
                    <span className="px-3 text-sm font-semibold">{item.qty}</span>
                    <button onClick={() => updateQty(cartLineKey(item), item.qty + 1)} className="p-2 hover:bg-stone-200 rounded-r-lg transition"><Plus className="w-3 h-3" /></button>
                  </div>
                  <button onClick={() => removeItem(cartLineKey(item))} className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> {t('common.remove')}
                  </button>
                </div>
              </div>
              <div className="text-right">
                {/* Line total mirrors the per-unit treatment: strikethrough
                    MRP × qty above the discounted line total when applicable. */}
                {item.mrp != null && item.mrp > item.price && (
                  <div className="text-xs text-stone-400 line-through">{formatINR(item.mrp * item.qty)}</div>
                )}
                <div className="font-bold text-stone-900">{formatINR(item.price * item.qty)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:sticky lg:top-24 self-start">
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
            <h2 className="font-bold text-stone-900 mb-4">{t('cart.orderSummary')}</h2>
            <div className="space-y-3 text-sm">
              {/* When any line in the cart has a discount, surface the
                  MRP→savings→subtotal breakdown so the customer sees the
                  math behind the discount. With no discounts in play we
                  collapse back to the original single Subtotal row. */}
              {totalSavings > 0 ? (
                <>
                  <div className="flex justify-between"><span className="text-stone-600">{t('cart.itemTotalMrp')}</span><span className="font-medium">{formatINR(mrpSubtotal)}</span></div>
                  <div className="flex justify-between text-emerald-700"><span>{t('cart.productSavings')}</span><span className="font-semibold">- {formatINR(totalSavings)}</span></div>
                  <div className="flex justify-between"><span className="text-stone-600">{t('cart.subtotal')}</span><span className="font-medium">{formatINR(subtotal)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-stone-600">{t('cart.subtotal')}</span><span className="font-medium">{formatINR(subtotal)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-stone-600">{t('cart.delivery')}</span><span className="font-medium">{deliveryCharge === 0 ? <span className="text-emerald-600">{t('common.free')}</span> : formatINR(deliveryCharge)}</span></div>
              {subtotal < thresholds.free_delivery_over && subtotal >= minOrder && !belowMinQty && deliveryCharge > 0 && (
                <div className="bg-amber-50 text-amber-800 text-xs p-2 rounded-lg">{t('cart.addMoreForFreeDelivery', { amount: formatINR(thresholds.free_delivery_over - subtotal) })}</div>
              )}
              {belowMinQty && (
                <div className="bg-red-50 text-red-700 text-xs p-2 rounded-lg flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {t('cart.minimumQtyHint', { count: minQty, remaining: minQty - totalQty })}
                </div>
              )}
              {belowMinValue && (
                <div className="bg-red-50 text-red-700 text-xs p-2 rounded-lg flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {t('cart.minimumValueHint', { min: formatINR(minOrder), remaining: formatINR(minOrder - subtotal) })}
                </div>
              )}
              <div className="border-t border-stone-200 pt-3 flex justify-between text-lg font-bold">
                <span>{t('cart.total')}</span><span>{formatINR(total)}</span>
              </div>
            </div>
            {/* Celebratory savings banner. Only when there's something to
                celebrate — keeps the cart clean for full-price baskets. */}
            {totalSavings > 0 && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-2.5 text-sm font-semibold text-center">
                {t('common.youAreSaving', { amount: formatINR(totalSavings) })}
              </div>
            )}
            <button
              disabled={belowMin}
              onClick={() => onNavigate('checkout')}
              className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition">
              {t('cart.proceedToCheckout')}
            </button>
            <button onClick={() => onNavigate('products')} className="w-full mt-2 text-stone-600 hover:text-stone-900 py-2 text-sm transition">
              {t('cart.continueShopping')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AUTH PAGES — Login, Register, OTP, Forgot, Reset
// ============================================================
function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-stone-900 mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-stone-600 mb-6">{subtitle}</p>}
          {children}
        </div>
        {footer && <div className="text-center mt-4 text-sm text-stone-600">{footer}</div>}
      </div>
    </div>
  );
}

export function LoginPage({ onNavigate }) {
  // When the storefront is in Firebase-auth mode, swap the entire
  // login UI for the passwordless phone-OTP flow. Legacy email-or-
  // phone + password kept below for the MSG91 path so a flag flip
  // back doesn't need a code change.
  if (firebaseAuthEnabled) return <FirebaseLoginPage onNavigate={onNavigate} />;

  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!identifier) errs.identifier = t('validation.emailOrPhoneRequired');
    if (!password) errs.password = t('validation.passwordRequired');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const u = await auth.login(identifier.trim(), password);
      toast.push(t('auth.welcomeBackName', { name: u.full_name.split(' ')[0] }));
      onNavigate('home');
    } catch (err) {
      // Phone not verified — route the user to the OTP screen with their
      // customer_id + phone pre-filled. They can punch in the SMS code we
      // already sent (or hit Resend) without having to register again.
      if (err.details?.code === 'PHONE_NOT_VERIFIED') {
        toast.push(t('auth.phoneNotVerified'), 'error');
        onNavigate('verify-otp', {
          customerId: err.details.customer_id,
          phone: err.details.phone,
        });
        return;
      }
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.welcomeBack')} subtitle={t('auth.signInToContinue')}
      footer={<>{t('auth.noAccount')} <button onClick={() => onNavigate('register')} className="text-emerald-700 font-semibold hover:underline">{t('nav.register')}</button></>}>
      <form onSubmit={submit} className="space-y-4">
        {errors.form && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errors.form}
          </div>
        )}
        <Field label={t('auth.emailOrPhone')} error={errors.identifier}>
          <TextInput value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={t('auth.emailPlaceholder')} error={errors.identifier} autoFocus />
        </Field>
        <Field label={t('auth.password')} error={errors.password}>
          <div className="relative">
            <TextInput type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.yourPassword')} error={errors.password} />
            <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600" tabIndex={-1}>
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-between items-center text-sm">
          <label className="flex items-center gap-2 text-stone-600">
            <input type="checkbox" className="w-4 h-4 rounded text-emerald-600" /> {t('auth.rememberMe')}
          </label>
          <button type="button" onClick={() => onNavigate('forgot-password')} className="text-emerald-700 hover:underline">{t('auth.forgotPassword')}</button>
        </div>
        <button type="submit" disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
          {submitting ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </AuthShell>
  );
}

// Firebase Phone Auth variant of the login page. Mounted only when
// VITE_AUTH_PROVIDER=firebase. Two-step: enter phone → Firebase sends
// SMS via Google → enter the 6-digit code → backend verifies the
// resulting ID token and issues our JWT.
//
// reCAPTCHA: Firebase requires an anti-abuse gate on web. We attach
// it invisibly to the "Send code" button — 99% of customers never see
// a challenge; Firebase only puts up a puzzle when it suspects a bot.
function FirebaseLoginPage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('phone'); // 'phone' → 'otp'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // Throttle "Resend code" so we don't burn the Firebase quota on
  // panic-clickers. Matches the 60s window the backend used for MSG91.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const tid = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(tid);
  }, [resendIn]);

  const sendCode = async () => {
    const e164 = toE164(phone);
    if (!e164) {
      setErrors({ phone: 'Enter a valid 10-digit Indian mobile.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setupRecaptcha('firebase-send-otp-btn');
      const conf = await sendOtp(e164);
      setConfirmation(conf);
      setStep('otp');
      setResendIn(60);
      toast.push('Code sent — check your SMS.');
    } catch (err) {
      // Firebase surfaces typed errors like auth/invalid-phone-number,
      // auth/too-many-requests, auth/quota-exceeded. Surface a clean
      // message and re-arm the form so the user can retry.
      setErrors({ form: friendlyFirebaseError(err) });
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e?.preventDefault?.();
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: 'Enter the 6-digit code.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const idToken = await verifyOtpAndGetToken(confirmation, otp);
      const { data } = await api.firebaseLogin(idToken);
      auth.completeRegistration(data.user, data.token);
      toast.push(t('auth.welcomeBackName', { name: data.user.full_name.split(' ')[0] }));
      onNavigate('home');
    } catch (err) {
      // 404 from /auth/firebase-login means "no account for this
      // phone" → bounce to the register flow with the phone pre-filled
      // so the customer doesn't retype it.
      if (err.code === 404 || err.status === 404) {
        toast.push('No account found — please create one.');
        onNavigate('register', { phone });
        return;
      }
      setErrors({ form: friendlyFirebaseError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.welcomeBack')} subtitle="Sign in with your phone number"
      footer={<>{t('auth.noAccount')} <button onClick={() => onNavigate('register')} className="text-emerald-700 font-semibold hover:underline">{t('nav.register')}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); step === 'phone' ? sendCode() : verifyCode(); }} className="space-y-4">
        {errors.form && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errors.form}
          </div>
        )}

        {step === 'phone' ? (
          <>
            <Field label="Mobile number" error={errors.phone}>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-stone-300 bg-stone-50 text-stone-600 text-sm">+91</span>
                <TextInput
                  type="tel" inputMode="numeric" maxLength={10}
                  className="rounded-l-none"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  error={errors.phone}
                  autoFocus />
              </div>
            </Field>
            <button id="firebase-send-otp-btn" type="submit" disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
              {busy ? 'Sending code…' : 'Send OTP'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              Code sent to <span className="font-semibold text-stone-900">+91 {phone}</span>.
              <button type="button" onClick={() => { setStep('phone'); setOtp(''); setConfirmation(null); }}
                className="ml-2 text-emerald-700 hover:underline text-xs font-semibold">Change</button>
            </p>
            <Field label="6-digit code" error={errors.otp}>
              <TextInput
                type="tel" inputMode="numeric" maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                error={errors.otp}
                autoFocus />
            </Field>
            <button type="submit" disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button type="button" onClick={sendCode} disabled={busy || resendIn > 0}
              className="w-full text-sm text-emerald-700 hover:underline disabled:text-stone-400 disabled:no-underline">
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}

// Map common Firebase auth/* error codes to copy a customer can act on.
// Anything we don't recognise falls back to the raw message — that's
// usually still readable enough ("Firebase: Error (auth/...)").
function friendlyFirebaseError(err) {
  const code = err?.code || err?.details?.code;
  if (code === 'auth/invalid-phone-number')      return 'That phone number doesn\'t look valid.';
  if (code === 'auth/invalid-verification-code') return 'The code you entered is incorrect.';
  if (code === 'auth/code-expired')              return 'That code has expired — please request a new one.';
  if (code === 'auth/too-many-requests')         return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'auth/quota-exceeded')            return 'SMS service is temporarily unavailable. Please try again shortly.';
  if (code === 'auth/captcha-check-failed')      return 'reCAPTCHA check failed — please retry.';
  return err?.message || 'Sign-in failed. Please try again.';
}

export function RegisterPage({ params, onNavigate }) {
  // Firebase variant: passwordless phone-verify-first registration.
  // Legacy MSG91 form below stays as the fallback path.
  if (firebaseAuthEnabled) return <FirebaseRegisterPage params={params} onNavigate={onNavigate} />;

  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', accept: false });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const strength = passwordStrength(form.password, t);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.full_name || form.full_name.trim().length < 2) errs.full_name = t('validation.enterFullName');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t('validation.enterValidEmail');
    if (!/^[6-9]\d{9}$/.test(form.phone)) errs.phone = t('validation.enterIndianMobile');
    const pErrKey = validatePasswordKey(form.password);
    if (pErrKey) errs.password = t(pErrKey);
    if (!form.accept) errs.accept = t('validation.acceptTermsRequired');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const response = await api.register({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      });
      const { data } = response;
      toast.push(t('auth.accountCreated'));
      // Dev convenience while real SMS isn't wired: backend echoes the OTP
      // in `response.dev_otp` when MSG91 isn't configured. Disappears the
      // moment MSG91 credentials land in .env.
      if (response.dev_otp) {
        toast.push(t('auth.devOtp', { code: response.dev_otp }), 'info', 12000);
      }
      onNavigate('verify-otp', { customerId: data.user.customer_id, phone: data.user.phone });
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.createYourAccount')} subtitle={t('auth.startOrdering')}
      footer={<>{t('auth.haveAccount')} <button onClick={() => onNavigate('login')} className="text-emerald-700 font-semibold hover:underline">{t('auth.logIn')}</button></>}>
      <form onSubmit={submit} className="space-y-4">
        {errors.form && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errors.form}
          </div>
        )}
        <Field label={t('auth.fullName')} error={errors.full_name}>
          <TextInput value={form.full_name} onChange={set('full_name')} placeholder={t('auth.fullNamePlaceholder')} error={errors.full_name} autoFocus />
        </Field>
        <Field label={t('auth.email')} error={errors.email}>
          <TextInput type="email" value={form.email} onChange={set('email')} placeholder={t('auth.emailPlaceholder')} error={errors.email} />
        </Field>
        <Field label={t('auth.phone')} error={errors.phone} hint={t('auth.phoneHint')}>
          <TextInput value={form.phone} onChange={set('phone')} placeholder={t('auth.phonePlaceholder')} inputMode="numeric" maxLength={10} error={errors.phone} />
        </Field>
        <Field label={t('auth.password')} error={errors.password}>
          <div className="relative">
            <TextInput type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder={t('auth.passwordHint')} error={errors.password} />
            <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600" tabIndex={-1}>
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.password && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${
                  strength.score <= 2 ? 'bg-red-500' : strength.score <= 3 ? 'bg-amber-500' : 'bg-emerald-500'
                }`} style={{ width: `${(strength.score / 5) * 100}%` }} />
              </div>
              <span className="text-xs text-stone-600">{strength.label}</span>
            </div>
          )}
        </Field>
        <label className="flex items-start gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={form.accept} onChange={set('accept')} className="w-4 h-4 mt-0.5 rounded text-emerald-600" />
          <span>{t('auth.acceptTerms')}</span>
        </label>
        {errors.accept && <span className="text-xs text-red-600 -mt-2 block">{errors.accept}</span>}
        <button type="submit" disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
          {submitting ? t('auth.creatingAccount') : t('auth.createAccount')}
        </button>
      </form>
    </AuthShell>
  );
}

// Firebase Phone Auth variant of registration. The legacy MSG91 path
// is a 3-step dance (POST /register → SMS → POST /verify-otp); with
// Firebase we collapse it to two screens: fill profile + verify phone,
// then one backend call creates the Customer atomically.
function FirebaseRegisterPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('form');   // 'form' → 'otp'
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    // Pre-filled when the FirebaseLoginPage bounced an unknown phone
    // here so the customer doesn't retype what they just typed.
    phone: (params?.phone || '').replace(/\D/g, '').slice(0, 10),
    password: '',
    accept: false,
  });
  const [showPwd, setShowPwd] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const tid = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(tid);
  }, [resendIn]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const strength = passwordStrength(form.password, t);

  // Validate profile fields client-side BEFORE sending the OTP so we
  // don't burn Firebase quota on a form that's going to be rejected
  // server-side anyway.
  const validateProfile = () => {
    const errs = {};
    if (!form.full_name || form.full_name.trim().length < 2) errs.full_name = t('validation.enterFullName');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = t('validation.enterValidEmail');
    if (!/^[6-9]\d{9}$/.test(form.phone)) errs.phone = t('validation.enterIndianMobile');
    const pErrKey = validatePasswordKey(form.password);
    if (pErrKey) errs.password = t(pErrKey);
    if (!form.accept) errs.accept = t('validation.acceptTermsRequired');
    return errs;
  };

  const sendCode = async () => {
    const errs = validateProfile();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const e164 = toE164(form.phone);
    if (!e164) { setErrors({ phone: t('validation.enterIndianMobile') }); return; }

    setBusy(true);
    try {
      setupRecaptcha('firebase-register-otp-btn');
      const conf = await sendOtp(e164);
      setConfirmation(conf);
      setStep('otp');
      setResendIn(60);
      toast.push('Code sent — check your SMS.');
    } catch (err) {
      setErrors({ form: friendlyFirebaseError(err) });
    } finally {
      setBusy(false);
    }
  };

  const verifyAndRegister = async (e) => {
    e?.preventDefault?.();
    if (!/^\d{6}$/.test(otp)) { setErrors({ otp: 'Enter the 6-digit code.' }); return; }
    setErrors({});
    setBusy(true);
    try {
      const idToken = await verifyOtpAndGetToken(confirmation, otp);
      const { data } = await api.firebaseRegister(idToken, {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      auth.completeRegistration(data.user, data.token);
      toast.push(t('auth.accountCreated'));
      onNavigate('home');
    } catch (err) {
      // 409 Conflict from backend → email or phone already used.
      // Bounce to login with the phone pre-filled (existing customer
      // can just verify and sign in instead).
      if (err.code === 409 || err.status === 409) {
        toast.push(err.message || 'Already registered — please log in.', 'info');
        onNavigate('login');
        return;
      }
      setErrors({ form: friendlyFirebaseError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.createYourAccount')} subtitle={t('auth.startOrdering')}
      footer={<>{t('auth.haveAccount')} <button onClick={() => onNavigate('login')} className="text-emerald-700 font-semibold hover:underline">{t('auth.logIn')}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); step === 'form' ? sendCode() : verifyAndRegister(); }} className="space-y-4">
        {errors.form && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errors.form}
          </div>
        )}

        {step === 'form' ? (
          <>
            <Field label={t('auth.fullName')} error={errors.full_name}>
              <TextInput value={form.full_name} onChange={set('full_name')} placeholder={t('auth.fullNamePlaceholder')} error={errors.full_name} autoFocus />
            </Field>
            <Field label={t('auth.email')} error={errors.email}>
              <TextInput type="email" value={form.email} onChange={set('email')} placeholder={t('auth.emailPlaceholder')} error={errors.email} />
            </Field>
            <Field label="Mobile number" error={errors.phone} hint={t('auth.phoneHint')}>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-stone-300 bg-stone-50 text-stone-600 text-sm">+91</span>
                <TextInput
                  type="tel" inputMode="numeric" maxLength={10}
                  className="rounded-l-none"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="9876543210"
                  error={errors.phone} />
              </div>
            </Field>
            <Field label={t('auth.password')} error={errors.password}>
              <div className="relative">
                <TextInput type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder={t('auth.passwordPlaceholder')} error={errors.password} />
                <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600" tabIndex={-1}>
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <p className={`text-xs mt-1 ${strength.tone === 'strong' ? 'text-emerald-700' : strength.tone === 'okay' ? 'text-amber-600' : 'text-red-600'}`}>{strength.label}</p>
              )}
            </Field>
            <label className="flex items-start gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={form.accept} onChange={set('accept')} className="w-4 h-4 mt-0.5 rounded text-emerald-600" />
              <span>{t('auth.acceptTerms')}</span>
            </label>
            {errors.accept && <p className="text-red-600 text-xs">{errors.accept}</p>}
            <button id="firebase-register-otp-btn" type="submit" disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
              {busy ? 'Sending code…' : 'Send verification code'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              Code sent to <span className="font-semibold text-stone-900">+91 {form.phone}</span>.
              <button type="button" onClick={() => { setStep('form'); setOtp(''); setConfirmation(null); }}
                className="ml-2 text-emerald-700 hover:underline text-xs font-semibold">Change</button>
            </p>
            <Field label="6-digit code" error={errors.otp}>
              <TextInput
                type="tel" inputMode="numeric" maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                error={errors.otp}
                autoFocus />
            </Field>
            <button type="submit" disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
              {busy ? 'Creating account…' : 'Verify & create account'}
            </button>
            <button type="button" onClick={sendCode} disabled={busy || resendIn > 0}
              className="w-full text-sm text-emerald-700 hover:underline disabled:text-stone-400 disabled:no-underline">
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}

export function OtpVerifyPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const settings = useSettings();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  if (!params?.customerId) {
    return (
      <AuthShell title={t('auth.verifyPhone')}>
        <p className="text-sm text-stone-600 mb-4">{t('auth.verifyPhoneNoContext')}</p>
        <button onClick={() => onNavigate('register')} className="text-emerald-700 font-semibold">{t('auth.goToSignUp')}</button>
      </AuthShell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) { setError(t('validation.enter6DigitCode')); return; }
    setSubmitting(true);
    try {
      const { data } = await api.verifyOtp(params.customerId, otp);
      auth.completeRegistration(data.user, data.token);
      toast.push(t('auth.phoneVerifiedWelcome', { name: settings?.company_name || 'Redlook' }));
      onNavigate('home');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const response = await api.resendPhoneOtp(params.customerId);
      toast.push(params.phone
        ? t('auth.newCodeSent', { phone: params.phone })
        : t('auth.newCodeSentNoPhone'));
      if (response.dev_otp) {
        toast.push(t('auth.devOtp', { code: response.dev_otp }), 'info', 12000);
      }
    } catch (err) {
      // 429 throttle / 404 / etc. — surface the server's friendly message.
      toast.push(err.message, 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.verifyPhone')}
      subtitle={params.phone
        ? t('auth.verifyPhoneSubtitle', { phone: params.phone })
        : t('auth.verifyPhoneSubtitleNoPhone')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.verificationCode')} error={error}>
          <TextInput
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className="text-center text-2xl tracking-[0.5em] font-mono"
            error={error}
            autoFocus
          />
        </Field>
        <button type="submit" disabled={submitting || otp.length !== 6}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
          {submitting ? t('auth.verifying') : t('auth.verifyAndContinue')}
        </button>
        <button type="button" onClick={resend} disabled={resending}
          className="w-full text-sm text-stone-600 hover:text-stone-900 disabled:text-stone-400">
          {resending ? t('auth.sending') : t('auth.didntGetCode')}
        </button>
      </form>
    </AuthShell>
  );
}

// Reset-method picker — three paths converge on /reset-password:
//   - 'link'      → emails a one-tap reset link (legacy, default selection)
//   - 'email_otp' → emails a 6-digit code, verified on the next screen
//   - 'sms_otp'   → SMS's the same code to the phone on file
const RESET_METHODS = [
  { id: 'link',      label: 'Email me a reset link',         hint: 'One-tap link sent to the email on your account.' },
  { id: 'email_otp', label: 'Email me a 6-digit code',       hint: 'For when you prefer entering a short code over clicking a link.' },
  { id: 'sms_otp',   label: 'Text me a 6-digit code on SMS', hint: 'Code goes to the mobile number on your account.' },
];

export function ForgotPasswordPage({ onNavigate }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState('link');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const resetMethods = [
    { id: 'link',      label: t('auth.resetByLink'),     hint: t('auth.resetByLinkHint') },
    { id: 'email_otp', label: t('auth.resetByEmailOtp'), hint: t('auth.resetByEmailOtpHint') },
    { id: 'sms_otp',   label: t('auth.resetBySmsOtp'),   hint: t('auth.resetBySmsOtpHint') },
  ];

  const submit = async (e) => {
    e.preventDefault();
    if (!email) { setError(t('validation.enterEmailOrPhone')); return; }
    setSubmitting(true);
    try {
      const { data } = await api.forgotPassword(email.trim(), method);
      if (data.method === 'link' || !data.method) {
        toast.push(t('auth.resetLinkSent', { recipient: data.masked_to || data.sent_to }));
        onNavigate('reset-password', { token: data.reset_token });
      } else {
        // OTP path — hand the customer_id + channel context to the next page.
        toast.push(t('auth.codeSent', { recipient: data.masked_to }));
        onNavigate('reset-otp', {
          customer_id: data.customer_id,
          channel: data.channel,
          masked_to: data.masked_to,
          // Dev convenience: when the backend is in console mode it echoes
          // the OTP back so the demo flow doesn't need a real provider.
          // Production responses never include `otp`.
          dev_otp: data.otp || '',
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.resetPassword')} subtitle={t('auth.pickResetMethod')}
      footer={<button onClick={() => onNavigate('login')} className="text-emerald-700 font-semibold hover:underline">{t('auth.backToLogin')}</button>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.emailOrPhone')} error={error}>
          <TextInput value={email} onChange={e => setEmail(e.target.value)} error={error} autoFocus placeholder={t('auth.emailOrPhonePlaceholder')} />
        </Field>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{t('auth.resetSendVia')}</div>
          {resetMethods.map((m) => (
            <label key={m.id}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                method === m.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <input
                type="radio"
                name="reset-method"
                value={m.id}
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{m.label}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
        <button type="submit" disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
          {submitting
            ? t('auth.sending')
            : method === 'link' ? t('auth.sendResetLink') : method === 'sms_otp' ? t('auth.sendCodeSms') : t('auth.sendCodeEmail')}
        </button>
      </form>
    </AuthShell>
  );
}

// Step 2 of the OTP path. Customer entered email/phone on the previous
// screen and picked email_otp or sms_otp; this page collects the 6-digit
// code, exchanges it for a reset JWT, and forwards to the same
// ResetPasswordPage the link flow uses.
export function ResetOtpPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [otp, setOtp] = useState(params?.dev_otp || '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // If we somehow landed here without a customer_id (deep-link, refresh),
  // shove the user back to the first step rather than letting them stare
  // at a broken form.
  useEffect(() => {
    if (!params?.customer_id) onNavigate('forgot-password');
  }, [params, onNavigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      setError(t('validation.enter6DigitCode'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.verifyResetOtp(params.customer_id, otp.trim());
      toast.push(t('auth.codeVerified'));
      onNavigate('reset-password', { token: data.reset_token });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Lets the user re-trigger the same method without retyping email/phone.
  // Best-effort: if the server-side rate limit kicks in, surface the error.
  const resend = async () => {
    if (!params?.customer_id) return;
    setResending(true);
    try {
      onNavigate('forgot-password');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.verifyPhone')}
      subtitle={params?.masked_to
        ? t('auth.codeSent', { recipient: params.masked_to })
        : t('auth.verifyPhoneSubtitleNoPhone')}
      footer={<button onClick={() => onNavigate('forgot-password')} className="text-emerald-700 font-semibold hover:underline">{t('auth.backToLogin')}</button>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.verificationCode')} error={error}>
          <TextInput
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={error}
            autoFocus
            placeholder="123456"
          />
        </Field>
        {params?.dev_otp && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded-lg">
            {t('auth.devOtp', { code: params.dev_otp })}
          </div>
        )}
        <button type="submit" disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
          {submitting ? t('auth.verifying') : t('auth.verifyAndContinue')}
        </button>
        <button type="button" onClick={resend} disabled={resending}
          className="w-full text-emerald-700 text-sm font-semibold hover:underline disabled:opacity-50">
          {t('auth.didntGetCode')}
        </button>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const pErrKey = validatePasswordKey(pwd);
    if (pErrKey) errs.pwd = t(pErrKey);
    if (pwd !== confirm) errs.confirm = t('errors.generic');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      await api.resetPassword(params?.token, pwd);
      toast.push('Password updated. Please sign in.');
      onNavigate('login');
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={t('auth.newPassword')} subtitle={t('auth.newPasswordSubtitle')}>
      <form onSubmit={submit} className="space-y-4">
        {errors.form && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errors.form}</div>}
        <Field label={t('auth.newPassword')} error={errors.pwd}>
          <TextInput type="password" value={pwd} onChange={e => setPwd(e.target.value)} error={errors.pwd} autoFocus />
        </Field>
        <Field label={t('auth.password')} error={errors.confirm}>
          <TextInput type="password" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} />
        </Field>
        <button type="submit" disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white py-3 rounded-xl font-semibold transition">
          {submitting ? t('common.saving') : t('common.update')}
        </button>
      </form>
    </AuthShell>
  );
}

// ============================================================
// PROFILE
// ============================================================
export function ProfilePage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (auth.user) setForm({
      full_name: auth.user.full_name || '',
      email: auth.user.email || '',
      phone: auth.user.phone || '',
      // Backend stores DOB as a DateTime, so the API returns an ISO
      // timestamp ("2000-05-11T00:00:00.000Z"). <input type="date">
      // only accepts "YYYY-MM-DD" — slice off the time portion so the
      // picker round-trips correctly.
      date_of_birth: (auth.user.date_of_birth || '').slice(0, 10),
      gender: auth.user.gender || '',
    });
  }, [auth.user]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.full_name || form.full_name.trim().length < 2) errs.full_name = t('validation.required');
    if (!/^[6-9]\d{9}$/.test(form.phone)) errs.phone = t('validation.enterIndianMobile');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const response = await auth.updateUser(form);
      const updated = response.data;
      setEditing(false);
      // If the phone was changed, the backend reset phone_verified=false
      // and SMS'd a fresh OTP to the new number. Surface that and route
      // straight to the verify-otp screen — checkout is now blocked until
      // the customer enters that code.
      if (updated && updated.phone_verified === false) {
        toast.push(t('auth.phoneNotVerified'), 'error');
        if (response.dev_otp) {
          toast.push(t('auth.devOtp', { code: response.dev_otp }), 'info', 12000);
        }
        onNavigate('verify-otp', {
          customerId: updated.customer_id,
          phone: updated.phone,
        });
        return;
      }
      toast.push(t('profile.saved'));
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-2">{t('profile.title')}</h1>

      <AccountSidebarLayout active="profile" onNavigate={onNavigate}>
       <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-3xl font-bold">
              {auth.user.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">{auth.user.full_name}</h2>
              <p className="text-sm text-stone-600">{t('profile.memberSince', { date: new Date(auth.user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}</p>
              <div className="flex gap-2 mt-1">
                {auth.user.phone_verified
                  ? <span className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">{t('profile.phone')} ✓</span>
                  : <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">{t('profile.phoneUnverified')}</span>}
              </div>
            </div>
          </div>

          {!editing ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <Info label={t('profile.fullName')} value={auth.user.full_name} />
                <Info label={t('profile.email')} value={auth.user.email} />
                <Info label={t('profile.phone')} value={auth.user.phone} />
                <Info label={t('profile.dateOfBirth')} value={auth.user.date_of_birth
                  ? formatDateTime(auth.user.date_of_birth, { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'} />
                <Info label={t('profile.gender')} value={auth.user.gender || '—'} />
              </div>
              <button onClick={() => setEditing(true)} className="bg-stone-900 hover:bg-stone-800 text-white px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4" /> {t('profile.editProfile')}
              </button>
            </>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={t('profile.fullName')} error={errors.full_name}>
                  <TextInput value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
                </Field>
                <Field label={t('profile.phone')} error={errors.phone}>
                  <TextInput value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={10} />
                </Field>
                <Field label={t('profile.email')} hint={t('profile.emailLocked')}>
                  <TextInput value={form.email} onChange={set('email')} disabled />
                </Field>
                <Field label={t('profile.dateOfBirth')}>
                  <TextInput type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
                </Field>
                <Field label={t('profile.gender')}>
                  <SelectInput value={form.gender} onChange={set('gender')}>
                    <option value="">{t('profile.preferNotToSay')}</option>
                    <option value="Male">{t('profile.male')}</option>
                    <option value="Female">{t('profile.female')}</option>
                    <option value="Other">{t('profile.other')}</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl font-semibold text-sm">
                  {saving ? t('common.saving') : t('profile.saveChanges')}
                </button>
                <button type="button" onClick={() => setEditing(false)}
                  className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 px-5 py-2.5 rounded-xl font-semibold text-sm">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
        </div>

       </div>
      </AccountSidebarLayout>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-1">{label}</div>
      <div className="text-stone-900">{value}</div>
    </div>
  );
}

function AccountSidebarLayout({ active, onNavigate, children }) {
  const { t } = useTranslation();
  const items = [
    { id: 'profile', label: t('nav.profile'), icon: User },
    { id: 'addresses', label: t('nav.addresses'), icon: MapPin },
    { id: 'orders', label: t('nav.orders'), icon: Package },
    { id: 'credit', label: t('nav.credit'), icon: Wallet },
    { id: 'wishlist', label: t('nav.wishlist'), icon: Heart },
  ];
  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6">
      <nav className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-2 h-fit">
        {items.map(it => (
          <button key={it.id} onClick={() => onNavigate(it.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
              active === it.id ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-stone-600 hover:bg-stone-50'
            }`}>
            <it.icon className="w-4 h-4" /> {it.label}
          </button>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
// ADDRESSES
// ============================================================
const emptyAddr = {
  label: 'Home', recipient_name: '', recipient_phone: '',
  address_line1: '', address_line2: '', landmark: '',
  city: '', state: '', pincode: '', is_default: false,
  latitude: null, longitude: null,
  // null source = "no coords captured yet"; backend will geocode from
  // the address text on save. Flips to 'device' as soon as the customer
  // grants location permission.
  location_source: null, location_accuracy: null,
};

export function AddressesPage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | addressId
  const [draft, setDraft] = useState(emptyAddr);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // Banner-level form error for save failures the user can't fix by tweaking
  // a single field (e.g. "outside delivery area"). Cleared on edit-cancel
  // and on the next save attempt.
  const [formError, setFormError] = useState(null);
  // Pincode → city/state auto-detect status: 'idle' | 'loading' | 'found' | 'invalid' | 'error'.
  // Drives the small hint line under the Pincode field.
  const [pincodeLookup, setPincodeLookup] = useState({ status: 'idle' });
  // 'idle' | 'locating' | 'reverse' | 'done' — shown next to the
  // "Use my current location" button so the user knows we're waiting on
  // them (browser permission), the GPS, or the reverse-geocode call.
  const [locating, setLocating] = useState('idle');

  const load = () => {
    if (!auth.user) return;
    setLoading(true);
    api.listAddresses(auth.user.customer_id).then(r => { setList(r.data); setLoading(false); });
  };
  useEffect(load, [auth.user]);

  // postalpincode.in is the free India Post API — no auth, returns city
  // (District) and state for any valid 6-digit pincode. Fires when the
  // pincode field reaches exactly 6 digits; cancels on unmount or pincode
  // change so a fast typist's stale request can't overwrite a newer one.
  useEffect(() => {
    if (!editing) return;
    if (!/^\d{6}$/.test(draft.pincode)) {
      setPincodeLookup({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setPincodeLookup({ status: 'loading' });
    fetch(`https://api.postalpincode.in/pincode/${draft.pincode}`)
      .then((r) => r.json())
      .then((arr) => {
        if (cancelled) return;
        const entry = Array.isArray(arr) ? arr[0] : null;
        const po = entry?.PostOffice?.[0];
        if (!po || entry.Status !== 'Success') {
          setPincodeLookup({ status: 'invalid' });
          return;
        }
        const city = po.District || po.Block || po.Region || '';
        const state = po.State || '';
        // Always overwrite — pincode is the source of truth. The user can
        // still edit city/state by hand afterwards if they want a different
        // locality name, since changing those fields doesn't trigger the
        // lookup again.
        setDraft((d) => ({ ...d, city, state }));
        setPincodeLookup({ status: 'found', city, state });
      })
      .catch(() => { if (!cancelled) setPincodeLookup({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [draft.pincode, editing]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;

  const startNew = () => {
    if (list.length >= 5) { toast.push('Maximum 5 addresses', 'error'); return; }
    setDraft({ ...emptyAddr, recipient_name: auth.user.full_name, recipient_phone: auth.user.phone });
    setErrors({});
    setEditing('new');
  };
  const startEdit = (a) => { setDraft(a); setErrors({}); setFormError(null); setEditing(a.address_id); };
  const cancel = () => { setEditing(null); setDraft(emptyAddr); setErrors({}); setFormError(null); };
  const set = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // "Use my current location" — browser geolocation prompt, then a Nominatim
  // reverse-geocode to translate lat/lng into the human-readable fields the
  // form needs (address line, pincode, city, state). The customer can edit
  // every field after; this just gives them a head-start instead of typing
  // their full address from scratch.
  //
  // Nominatim is rate-limited to ~1 req/sec but a one-shot user click is
  // well within fair use. Browsers don't allow a custom User-Agent header
  // on fetch, so we just rely on the default UA — accepted but not ideal
  // for high-volume use.
  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.push('Your browser does not support location access', 'error');
      return;
    }
    setLocating('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocating('reverse');
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
          const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
          if (!res.ok) throw new Error('Reverse-geocode failed');
          const json = await res.json();
          const a = json.address || {};
          // Compose line 1 from the parts that are normally on a building's
          // signboard. Fall back gracefully so a partial match still beats
          // an empty line.
          const line1 = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
          const line2 = [a.neighbourhood, a.suburb].filter(Boolean).join(', ');
          const city = a.city || a.town || a.village || a.municipality || a.county || '';
          const state = a.state || '';
          const pincode = a.postcode || '';
          setDraft((d) => ({
            ...d,
            // Only overwrite fields we got values for so a partially-typed
            // form doesn't lose the customer's edits.
            address_line1: line1 || d.address_line1,
            address_line2: line2 || d.address_line2,
            city: city || d.city,
            state: state || d.state,
            pincode: /^\d{6}$/.test(pincode) ? pincode : d.pincode,
            latitude,
            longitude,
            // Marks these coords as the customer's actual device GPS so the
            // backend uses them as-is for the snapshot and delivery view,
            // rather than re-geocoding the address text on save.
            location_source: 'device',
            location_accuracy: accuracy ?? null,
          }));
          setLocating('done');
          toast.push('Location detected — please review and edit if needed.');
        } catch (err) {
          // Reverse-geocode failed but we still have the GPS pin —
          // keep it so the delivery person gets the precise map even if
          // the customer types the rest of the address by hand.
          setDraft((d) => ({
            ...d,
            latitude,
            longitude,
            location_source: 'device',
            location_accuracy: accuracy ?? null,
          }));
          setLocating('idle');
          toast.push('Got your location, but we could not look up the address. Please type it in — your map pin is saved.', 'error');
        }
      },
      (err) => {
        setLocating('idle');
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Please allow location access in your browser to use this feature.'
          : err.message || 'Could not read your location';
        toast.push(msg, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const validate = () => {
    const errs = {};
    if (!draft.recipient_name) errs.recipient_name = 'Required';
    if (!/^[6-9]\d{9}$/.test(draft.recipient_phone)) errs.recipient_phone = 'Invalid phone';
    if (!draft.address_line1) errs.address_line1 = 'Required';
    if (!draft.city) errs.city = 'Required';
    if (!draft.state) errs.state = 'Required';
    if (!/^\d{6}$/.test(draft.pincode)) errs.pincode = '6-digit pincode';
    return errs;
  };

  const save = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      // The backend now saves any geocodable address and returns the
      // deliverability flag instead of rejecting. Save succeeds → if the
      // row came back undeliverable we toast a heads-up so the customer
      // knows it'll be greyed out at checkout, but the row is theirs.
      const verb = editing === 'new' ? 'added' : 'updated';
      const r = editing === 'new'
        ? await api.addAddress(auth.user.customer_id, draft)
        : await api.updateAddress(auth.user.customer_id, editing, draft);
      if (r?.data?.is_deliverable === false) {
        const distance = r.data.distance_km;
        toast.push(
          distance != null
            ? `Address ${verb}, but it's ${distance} km from our store — outside the delivery area.`
            : `Address ${verb}, but we could not locate it on the map — orders to it will be blocked.`,
          'error',
        );
      } else {
        toast.push(`Address ${verb}`);
      }
      cancel();
      load();
    } catch (err) {
      toast.push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (a) => {
    try {
      await api.updateAddress(auth.user.customer_id, a.address_id, { ...a, is_default: true });
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  const remove = async (a) => {
    if (!confirm('Delete this address?')) return;
    try { await api.deleteAddress(auth.user.customer_id, a.address_id); toast.push('Address removed'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">{t('addresses.title')}</h1>

      <AccountSidebarLayout active="addresses" onNavigate={onNavigate}>
        {editing && (
          <form onSubmit={save} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="font-bold text-stone-900">{editing === 'new' ? t('addresses.newAddressTitle') : t('addresses.editAddressTitle')}</h2>
              <button type="button" onClick={useMyLocation} disabled={locating === 'locating' || locating === 'reverse'}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-stone-400 disabled:cursor-not-allowed">
                <MapPin className="w-4 h-4" />
                {locating === 'locating' && 'Reading location…'}
                {locating === 'reverse' && 'Looking up address…'}
                {(locating === 'idle' || locating === 'done') && 'Use my current location'}
              </button>
            </div>
            {draft.location_source === 'device' && draft.latitude != null && draft.longitude != null && (
              <div className="mb-4 inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <MapPin className="w-3 h-3" />
                <span>Live GPS pin saved{draft.location_accuracy ? ` (±${Math.round(draft.location_accuracy)} m)` : ''} — will be shared with the delivery person.</span>
              </div>
            )}
            {formError && (
              <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Label">
                <SelectInput value={draft.label} onChange={set('label')}>
                  <option>Home</option><option>Office</option><option>Other</option>
                </SelectInput>
              </Field>
              <div />
              <Field label="Recipient name" error={errors.recipient_name}>
                <TextInput value={draft.recipient_name} onChange={set('recipient_name')} error={errors.recipient_name} />
              </Field>
              <Field label="Recipient phone" error={errors.recipient_phone}>
                <TextInput value={draft.recipient_phone} onChange={set('recipient_phone')} maxLength={10} error={errors.recipient_phone} />
              </Field>
              <Field label="Address line 1" error={errors.address_line1}>
                <TextInput value={draft.address_line1} onChange={set('address_line1')} placeholder="House / Flat / Building" error={errors.address_line1} />
              </Field>
              <Field label="Address line 2 (optional)">
                <TextInput value={draft.address_line2} onChange={set('address_line2')} placeholder="Street / Locality" />
              </Field>
              <Field label="Landmark (optional)">
                <TextInput value={draft.landmark} onChange={set('landmark')} placeholder="Near Mall / Park" />
              </Field>
              <Field label="Pincode" error={errors.pincode}>
                <TextInput value={draft.pincode} onChange={set('pincode')} maxLength={6} error={errors.pincode} />
                {pincodeLookup.status === 'loading' && (
                  <p className="mt-1 text-xs text-stone-500">Looking up city &amp; state…</p>
                )}
                {pincodeLookup.status === 'found' && (
                  <p className="mt-1 text-xs text-emerald-700">✓ Detected {pincodeLookup.city}, {pincodeLookup.state}</p>
                )}
                {pincodeLookup.status === 'invalid' && (
                  <p className="mt-1 text-xs text-amber-700">Couldn&apos;t find this pincode. Please enter city &amp; state manually.</p>
                )}
                {pincodeLookup.status === 'error' && (
                  <p className="mt-1 text-xs text-amber-700">Auto-detect unavailable. Please enter city &amp; state manually.</p>
                )}
              </Field>
              <Field label="City" error={errors.city}>
                <TextInput value={draft.city} onChange={set('city')} error={errors.city} />
              </Field>
              <Field label="State" error={errors.state}>
                <TextInput value={draft.state} onChange={set('state')} error={errors.state} />
              </Field>
            </div>
            <label className="flex items-center gap-2 mt-4 text-sm text-stone-700">
              <input type="checkbox" checked={draft.is_default} onChange={set('is_default')} className="w-4 h-4 rounded text-emerald-600" />
              Set as default delivery address
            </label>
            <div className="flex gap-3 mt-6">
              <button type="submit" disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-5 py-2.5 rounded-xl font-semibold text-sm">
                {saving ? 'Saving…' : 'Save address'}
              </button>
              <button type="button" onClick={cancel} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 px-5 py-2.5 rounded-xl font-semibold text-sm">
                Cancel
              </button>
            </div>
          </form>
        )}

        {!editing && (
          <button onClick={startNew} disabled={list.length >= 5}
            className="mb-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add new address
          </button>
        )}

        {loading ? (
          <div className="bg-stone-100 animate-pulse h-32 rounded-2xl" />
        ) : list.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-12 text-center">
            <MapPin className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-600">No saved addresses yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {list.map(a => {
              // is_deliverable comes from the backend based on the firm
              // location + delivery radius. Out-of-area or ungeocodable
              // addresses still appear in the list but are visually
              // muted and can't be made default (since defaults flow
              // straight into checkout).
              const undeliverable = a.is_deliverable === false;
              return (
                <div key={a.address_id}
                  className={`bg-white dark:bg-slate-800 border rounded-2xl p-5 transition ${
                    undeliverable
                      ? 'border-stone-200 dark:border-slate-700 opacity-60 grayscale'
                      : 'border-stone-200 dark:border-slate-700'
                  }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-stone-100 text-stone-700 text-xs font-semibold px-2 py-1 rounded">{a.label}</span>
                      {a.is_default && <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1 rounded">Default</span>}
                      {undeliverable && (
                        <span className="bg-stone-200 text-stone-700 text-xs font-semibold px-2 py-1 rounded inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Not deliverable
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold text-stone-900">{a.recipient_name}</div>
                  <div className="text-sm text-stone-600 mt-1">{a.recipient_phone}</div>
                  <div className="text-sm text-stone-600 mt-2">
                    {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''}<br />
                    {a.landmark && <>Near {a.landmark}<br /></>}
                    {a.city}, {a.state} - {a.pincode}
                  </div>
                  {undeliverable && (
                    <div className="text-xs text-stone-500 mt-2">
                      {a.distance_km != null
                        ? `This address is ${a.distance_km} km from our store and outside the current delivery area.`
                        : 'We could not locate this address on the map. Edit to add a landmark or correct the pincode.'}
                    </div>
                  )}
                  <div className="flex gap-2 mt-4 text-xs">
                    <button onClick={() => startEdit(a)} className="text-stone-700 hover:text-emerald-700 font-medium flex items-center gap-1">
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                    {!a.is_default && !undeliverable && (
                      <button onClick={() => setDefault(a)} className="text-stone-700 hover:text-emerald-700 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" /> Set default
                      </button>
                    )}
                    <button onClick={() => remove(a)} className="text-red-600 hover:text-red-700 font-medium flex items-center gap-1 ml-auto">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AccountSidebarLayout>
    </div>
  );
}

// ============================================================
// CHECKOUT
// ============================================================
// Delivery slots are anchored to the local clock. Today's slots are disabled
// once the cutoff has passed (slot start - bufferHours) so the kitchen has
// at least that long to pack and dispatch. Tomorrow's slots are always open
// — they always have at least a full night of lead time.
// `label` round-trips into the order row; the rest is UI-only.
// Buffer hours come from /api/settings (admin-editable, default 5).
// Fallback catalog mirroring the original hardcoded list — only used when the
// admin-edited catalog from /api/settings hasn't arrived yet (mock mode, or a
// fresh install before the migration runs). Real catalog lives on
// `BusinessSettings.delivery_slots` and is edited under Admin → Settings →
// Delivery & Charges.
const DEFAULT_DELIVERY_SLOTS = [
  { id: 'slot-today-4pm',     day_offset: 0, start_hour: 16, end_hour: 19, label: '4 PM – 7 PM',  enabled: true },
  { id: 'slot-today-7pm',     day_offset: 0, start_hour: 19, end_hour: 22, label: '7 PM – 10 PM', enabled: true },
  { id: 'slot-tomorrow-7am',  day_offset: 1, start_hour: 7,  end_hour: 10, label: '7 AM – 10 AM', enabled: true },
  { id: 'slot-tomorrow-10am', day_offset: 1, start_hour: 10, end_hour: 13, label: '10 AM – 1 PM', enabled: true },
  { id: 'slot-tomorrow-4pm',  day_offset: 1, start_hour: 16, end_hour: 19, label: '4 PM – 7 PM',  enabled: true },
];

// "Today" / "Tomorrow" / "Wed, 14 May" — the storefront-facing day chip for a
// slot. day_offset 0/1 get the friendly names; further out, locale-aware
// short weekday + date so admins can pre-publish a holiday schedule without
// the picker looking weird.
function dayPrefix(offset, now) {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Compose the human label as <day>, <time-range>. Round-trips into the
// order row's Order.delivery_slot for receipts; the backend soft-matches
// against the trailing time-range portion against the admin catalog.
function slotDisplayLabel(slot, now) {
  return `${dayPrefix(slot.day_offset, now)}, ${slot.label}`;
}

function isSlotAvailable(slot, now, bufferHours) {
  if (slot.day_offset !== 0) return true;
  const nowHours = now.getHours() + now.getMinutes() / 60;
  return nowHours < slot.start_hour - bufferHours;
}

// Returns { slot, label } for the first ENABLED slot that's still bookable
// right now under the buffer-hours policy. Used by the product detail page
// to surface the actual next available slot ("Tomorrow, 7 AM – 10 AM")
// instead of a hardcoded "Order before 4 PM". Falls back to the last
// enabled slot if every entry is somehow unavailable — that path means
// the customer is viewing the page after the last delivery cutoff of the
// day, in which case showing the earliest tomorrow slot is still the
// correct hint.
function getNextAvailableSlot(now, bufferHours, catalog) {
  const enabled = (catalog && catalog.length ? catalog : DEFAULT_DELIVERY_SLOTS)
    .filter((s) => s.enabled !== false);
  const slot = enabled.find((s) => isSlotAvailable(s, now, bufferHours))
    || enabled[enabled.length - 1]
    || null;
  if (!slot) return { slot: null, label: '' };
  return { slot, label: slotDisplayLabel(slot, now) };
}

// UPI is gated on whether the backend has Razorpay keys configured (see
// /api/payments/config) — when keys are absent, the UPI tile is shown
// disabled with a "coming soon" badge so we never offer a method the BE
// would reject. CARD and NETBANKING stay disabled until Razorpay UAT signs
// off on their fee structure separately.
const PAYMENT_METHODS_BASE = [
  { id: 'UPI', label: 'UPI', sub: 'Paytm, PhonePe, GPay', icon: Smartphone, requiresRazorpay: true },
  { id: 'CARD', label: 'Credit / Debit Card', sub: 'Visa, Mastercard, RuPay', icon: CreditCard, alwaysDisabled: true },
  { id: 'NETBANKING', label: 'Net Banking', sub: 'All major banks', icon: Wallet, alwaysDisabled: true },
  { id: 'COD', label: 'Cash on Delivery', sub: 'Pay when you receive', icon: Banknote },
  // BRD §3 — only rendered when the customer has credit enabled + active.
  // Eligibility (limit, overdue) is rechecked server-side at place-order
  // time; this flag just keeps the tile out of view for non-credit users.
  { id: 'CREDIT', label: 'Pay on Credit', sub: 'Net terms — pay later', icon: Wallet, requiresCredit: true },
];
const PAYMENT_COMING_SOON_MSG = 'This payment method is not available currently and will be enabled very soon. Please choose Cash on Delivery.';

// Razorpay Checkout SDK is loaded lazily — only when the customer actually
// places a UPI order. Returns the global Razorpay constructor; resolves the
// existing one on subsequent calls so we don't re-inject the script tag.
const RAZORPAY_SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let _razorpayScriptPromise = null;
function loadRazorpayCheckout() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (_razorpayScriptPromise) return _razorpayScriptPromise;
  _razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      _razorpayScriptPromise = null;
      reject(new Error('Could not load Razorpay Checkout. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return _razorpayScriptPromise;
}

export function CheckoutPage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const cart = useCart();
  const toast = useToast();
  const settings = useSettings();
  // Same rationale as CartPage: re-sync cart item prices on mount so any
  // discount change the admin made between adding-to-cart and reaching
  // checkout shows the right total here. Backend recomputes authoritatively
  // at order placement, but the customer should also see it pre-submit.
  useEffect(() => { cart.refreshPrices(); }, [cart.refreshPrices]);
  // ---- state ----
  const [addresses, setAddresses] = useState([]);
  const [addrId, setAddrId] = useState(null);
  // Live thresholds — same source as the cart page so the messaging matches.
  // delivery_slots arrives once /api/settings resolves; until then we use the
  // bundled fallback so the picker isn't empty on first paint.
  const [thresholds, setThresholds] = useState({ min_order_value: 150, min_order_quantity: 1, delivery_charge: 40, free_delivery_over: 299, delivery_slot_buffer_hours: 5, delivery_slots: DEFAULT_DELIVERY_SLOTS });
  // Re-evaluated every minute below so a user lingering on checkout across a
  // cutoff sees the disabled state flip without a refresh.
  const [now, setNow] = useState(() => new Date());
  // Initial slot: the first one bookable right now under the default buffer.
  // The slot-bumper effect below will switch this to a still-open slot if the
  // real buffer (after settings load) renders the initial pick unavailable.
  const [slot, setSlot] = useState(() => {
    const initial = getNextAvailableSlot(new Date(), 5, DEFAULT_DELIVERY_SLOTS);
    return initial.label;
  });
  const [payment, setPayment] = useState('COD');
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [placing, setPlacing] = useState(false);
  // Banner error kept above the place-order button when the order is
  // refused for a reason the user has to act on (e.g. address outside
  // the delivery radius). Cleared when they switch address or retry.
  const [placeError, setPlaceError] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [appliedCode, setAppliedCode] = useState('');
  // Razorpay availability — fetched once on mount. Null while loading; the
  // UPI tile renders disabled until this resolves so we never offer a method
  // the backend would reject. { razorpay_enabled, key_id }.
  const [paymentConfig, setPaymentConfig] = useState(null);
  // creditState: null = unknown / not eligible / unauthenticated; populated
  // object = customer has credit set up (enabled or not). The CREDIT tile
  // only renders when state.enabled && state.status === 'active'.
  const [creditState, setCreditState] = useState(null);
  // Live-location override for this delivery. Customer taps "Share live
  // location" inside the address section; this stores a one-shot GPS reading
  // that travels with the order's address_snapshot, overriding whatever was
  // saved on the address. Helpful when the saved address is approximate
  // (landmark-only) or when the customer is physically at a slightly
  // different spot than the saved address. null = no override; the saved
  // address's coords are snapshotted as-is.
  const [liveLocation, setLiveLocation] = useState(null);
  // 'idle' | 'locating' | 'denied' — drives the share-live-location tile
  // copy. We keep the button enabled in 'denied' so the customer can retry
  // after granting permission in the browser address bar.
  const [liveLocationState, setLiveLocationState] = useState('idle');

  // ---- effects ----
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { api.getSettings().then(r => r.data && setThresholds(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.getPaymentConfig().then(r => r.data && setPaymentConfig(r.data)).catch(() => setPaymentConfig({ razorpay_enabled: false, key_id: null })); }, []);
  useEffect(() => {
    if (!auth.user) return;
    api.getCredit(auth.user.customer_id)
      .then((r) => setCreditState(r.data?.state || null))
      .catch(() => setCreditState(null));
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    api.listAddresses(auth.user.customer_id).then(r => {
      setAddresses(r.data);
      // Prefer the default among deliverable addresses; fall back to
      // the first deliverable; only fall back to *any* address if the
      // customer has none in range (so they at least see something
      // selected, but the radio will still be disabled and the place-
      // order button blocked).
      const deliverable = r.data.filter(a => a.is_deliverable !== false);
      const def = deliverable.find(a => a.is_default) || deliverable[0] || r.data[0];
      if (def && def.is_deliverable !== false) setAddrId(def.address_id);
    });
  }, [auth.user]);

  // ---- derived values ----
  const bufferHours = thresholds.delivery_slot_buffer_hours;
  // Admin-configured slot catalog (falls back to bundled defaults until the
  // /api/settings request resolves). Disabled rows are filtered out — they
  // stay in the DB for the admin to re-enable later without losing config.
  const slotCatalog = (thresholds.delivery_slots && thresholds.delivery_slots.length
    ? thresholds.delivery_slots
    : DEFAULT_DELIVERY_SLOTS
  ).filter((s) => s.enabled !== false);

  // If the currently chosen slot becomes unavailable while the page is open
  // (page open across a cutoff boundary, admin tightens the buffer mid-
  // session, or admin disables the slot), bump to the next open slot so
  // the customer can't accidentally place an unfulfillable order.
  useEffect(() => {
    const current = slotCatalog.find((s) => slotDisplayLabel(s, now) === slot);
    if (!current || !isSlotAvailable(current, now, bufferHours)) {
      const next = slotCatalog.find((s) => isSlotAvailable(s, now, bufferHours));
      if (next) setSlot(slotDisplayLabel(next, now));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, slot, bufferHours, thresholds.delivery_slots]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;
  if (cart.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <p className="text-stone-600 mb-4">Your cart is empty.</p>
        <button onClick={() => onNavigate('products')} className="text-emerald-700 font-semibold">Go shopping</button>
      </div>
    );
  }

  const subtotal = cart.subtotal;
  // Aggregate MRP-vs-paid savings across the cart so the summary block can
  // show "you're saving Rs. X" alongside the totals. Mirrors the same
  // logic CartPage uses; backend re-derives at order placement so this is
  // display-only.
  const totalSavings = cart.items.reduce((s, i) => {
    const mrp = Number(i.mrp ?? 0);
    return s + (mrp > i.price ? (mrp - i.price) * i.qty : 0);
  }, 0);
  const mrpSubtotal = subtotal + totalSavings;
  const deliveryCharge = subtotal > thresholds.free_delivery_over ? 0 : thresholds.delivery_charge;
  const total = subtotal - discount + deliveryCharge;
  const totalQty = cart.items.reduce((s, i) => s + i.qty, 0);
  const belowMinValue = subtotal < thresholds.min_order_value;
  const belowMinQty = totalQty < thresholds.min_order_quantity;
  const placeDisabled = placing || !addrId || belowMinValue || belowMinQty;

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) { toast.push('Enter a coupon code', 'error'); return; }
    setApplyingCoupon(true);
    try {
      // Server-side validation against the live Coupon table — knows about
      // any coupon the admin has created, and rejects per-customer reuse.
      const r = await api.validateCoupon(code, subtotal);
      setDiscount(r.data.discount);
      setAppliedCode(r.data.code);
      toast.push(`Coupon applied: ${formatINR(r.data.discount)} off`);
    } catch (err) {
      setDiscount(0);
      setAppliedCode('');
      toast.push(err.message || 'Could not apply coupon', 'error');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCoupon('');
    setDiscount(0);
    setAppliedCode('');
  };

  const shareLiveLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.push('Your browser does not support location access', 'error');
      return;
    }
    setLiveLocationState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
        setLiveLocationState('idle');
        toast.push('Live location captured for this delivery.');
      },
      (err) => {
        setLiveLocationState(err.code === err.PERMISSION_DENIED ? 'denied' : 'idle');
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Allow location access in your browser to share your live pin.'
          : err.message || 'Could not read your location';
        toast.push(msg, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const clearLiveLocation = () => { setLiveLocation(null); setLiveLocationState('idle'); };

  const placeOrder = async () => {
    if (!addrId) { toast.push('Select a delivery address', 'error'); return; }
    setPlacing(true);
    setPlaceError(null);
    try {
      // Server computes authoritative totals — we just send the cart contents.
      const response = await api.placeOrder({
        address_id: addrId,
        delivery_slot: slot,
        payment_method: payment,
        items: cart.items.map(i => ({
          product_id: i.id,
          // Send variant_id when the cart line was added with a colour.
          // Backend rejects unknown variant_ids and requires one for
          // products that have variants, so this is authoritative.
          ...(i.variant_id ? { variant_id: i.variant_id } : {}),
          qty: i.qty,
        })),
        coupon_code: coupon.trim() || undefined,
        // Live-pin override (optional). Null when the customer didn't tap
        // the "Share live location" tile — order falls back to the saved
        // address's coords.
        delivery_location: liveLocation || undefined,
      });
      const order = response.data;

      // For UPI, the BE returns a `checkout` block alongside the (Pending)
      // order. Hand it to Razorpay Checkout, then verify on success.
      if (response.checkout?.provider === 'razorpay') {
        await runRazorpayCheckout(response.checkout, order);
        // runRazorpayCheckout navigates on success or surfaces a toast on
        // dismiss/failure. Either way we don't fall through to the COD path.
        return;
      }

      // COD path — order is already Placed/Pending, just confirm to the user.
      cart.clearCart();
      onNavigate('order-confirmation', { orderId: order.order_id });
    } catch (err) {
      // Phone not verified (typically because the user just changed their
      // number on the profile page) — route to the OTP screen with their
      // context so they can verify and come back to checkout.
      if (err.details?.code === 'PHONE_NOT_VERIFIED') {
        toast.push('Please verify your phone before placing the order.', 'error');
        onNavigate('verify-otp', {
          customerId: err.details.customer_id,
          phone: err.details.phone,
        });
        return;
      }
      // Address outside the firm's delivery radius — show inline so the
      // customer can switch addresses without losing the cart.
      if (err.details?.code === 'OUTSIDE_DELIVERY_AREA') {
        setPlaceError(err.message);
        return;
      }
      // Credit gate failures — also surface as inline so the customer
      // can switch payment method without losing the cart.
      if (['CREDIT_LIMIT_EXCEEDED', 'CREDIT_BLOCKED', 'CREDIT_OVERDUE_BLOCK', 'CREDIT_NOT_ENABLED'].includes(err.details?.code)) {
        setPlaceError(err.message);
        return;
      }
      toast.push(err.message, 'error');
    } finally {
      setPlacing(false);
    }
  };

  // Razorpay Checkout flow. Pulled out of placeOrder so the COD path stays
  // readable. Resolves when the user pays + verify succeeds (and we've
  // navigated). Resolves silently if the user dismisses the modal — the
  // local order stays in Pending so admin can clean up if needed.
  const runRazorpayCheckout = async (checkout, order) => {
    let Razorpay;
    try {
      Razorpay = await loadRazorpayCheckout();
    } catch (err) {
      toast.push(err.message, 'error');
      return;
    }

    return new Promise((resolve) => {
      const rzp = new Razorpay({
        key: checkout.key_id,
        order_id: checkout.razorpay_order_id,
        amount: checkout.amount_paise,
        currency: checkout.currency || 'INR',
        name: settings?.company_name || 'Redlook',
        description: `Order ${order.order_id}`,
        prefill: {
          name: auth.user?.full_name || '',
          email: auth.user?.email || '',
          contact: auth.user?.phone || '',
        },
        theme: { color: '#059669' }, // matches emerald-600 on the rest of the storefront
        notes: { internal_order_id: order.order_id },
        handler: async (rzpResponse) => {
          try {
            await api.verifyPayment({
              order_id: order.order_id,
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
            });
            cart.clearCart();
            onNavigate('order-confirmation', { orderId: order.order_id });
          } catch (err) {
            // Signature verification failed server-side — extremely rare
            // (typically only if the page was tampered with). Tell the user
            // and leave the order in Pending; the webhook is a backstop.
            toast.push(err.message || 'Payment verification failed. If money was deducted, it will be refunded automatically.', 'error');
          } finally {
            resolve();
          }
        },
        modal: {
          ondismiss: () => {
            toast.push('Payment cancelled. Your order is on hold — pay now or it will be auto-cancelled.', 'error');
            resolve();
          },
        },
      });
      rzp.on('payment.failed', (resp) => {
        toast.push(resp?.error?.description || 'Payment failed. Please try again.', 'error');
      });
      rzp.open();
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">{t('checkout.title')}</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Address */}
          <section className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-stone-900 flex items-center gap-2"><MapPin className="w-4 h-4" /> Delivery address</h2>
              <button onClick={() => onNavigate('addresses')} className="text-sm text-emerald-700 hover:underline font-medium">Manage</button>
            </div>
            {addresses.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-stone-600 mb-3">No saved addresses.</p>
                <button onClick={() => onNavigate('addresses')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">Add address</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {addresses.map(a => {
                  // Saved-but-undeliverable addresses still appear in the
                  // checkout list (so the customer sees the full picture)
                  // but the radio is disabled and the tile is muted —
                  // matching the addresses page styling and preventing
                  // a place-order attempt that the backend would reject.
                  const undeliverable = a.is_deliverable === false;
                  const selected = addrId === a.address_id;
                  return (
                    <label key={a.address_id}
                      className={`border-2 rounded-xl p-4 transition ${
                        undeliverable
                          ? 'border-stone-200 bg-stone-50 opacity-60 cursor-not-allowed'
                          : selected
                            ? 'border-emerald-500 bg-emerald-50/40 cursor-pointer'
                            : 'border-stone-200 hover:border-stone-300 cursor-pointer'
                      }`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="addr"
                          disabled={undeliverable}
                          checked={selected}
                          onChange={() => { setAddrId(a.address_id); setPlaceError(null); }}
                          className="mt-1 w-4 h-4 text-emerald-600 disabled:cursor-not-allowed" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-stone-900 text-sm">{a.label}</span>
                            {a.is_default && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Default</span>}
                            {undeliverable && (
                              <span className="text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Not deliverable
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-700 mt-1">{a.recipient_name} · {a.recipient_phone}</div>
                          <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                            {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''}, {a.city}, {a.state} - {a.pincode}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Live-location share — overrides the saved address's coords
                for this order's snapshot. Useful when the saved address
                is approximate or the customer is at a slightly different
                spot. Hidden when no address is selected (radio off). */}
            {addrId && (() => {
              const selectedAddr = addresses.find((a) => a.address_id === addrId);
              const hasSavedPin = selectedAddr && selectedAddr.latitude != null && selectedAddr.longitude != null;
              const savedIsDevice = selectedAddr && selectedAddr.location_source === 'device';
              return (
                <div className="mt-4 border border-emerald-200 bg-emerald-50/50 rounded-xl p-4">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-emerald-900">
                        {liveLocation ? 'Live location shared for this delivery' : 'Help the delivery person find you'}
                      </div>
                      <p className="text-xs text-emerald-800/80 mt-0.5 leading-relaxed">
                        {liveLocation
                          ? `Captured ±${liveLocation.accuracy ? Math.round(liveLocation.accuracy) : '?'} m — your delivery partner will get this exact map pin.`
                          : hasSavedPin
                            ? (savedIsDevice
                              ? 'Your saved address has a GPS pin. Tap below to refresh it with your current location for this delivery.'
                              : 'We located your saved address on the map. For a more precise pin, share your live location with the delivery person.')
                            : 'Share your live location so the delivery person reaches you faster than typing the address into Maps.'}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {liveLocation ? (
                          <>
                            <a
                              href={`https://www.google.com/maps?q=${liveLocation.latitude},${liveLocation.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
                            >
                              Preview on Google Maps
                            </a>
                            <button type="button" onClick={clearLiveLocation}
                              className="text-xs font-semibold text-stone-600 hover:text-stone-800">
                              Use saved address instead
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={shareLiveLocation}
                            disabled={liveLocationState === 'locating'}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            {liveLocationState === 'locating' ? 'Reading location…' : 'Share my live location'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Slot */}
          <section className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
            <h2 className="font-bold text-stone-900 mb-1 flex items-center gap-2"><Clock className="w-4 h-4" /> Delivery slot</h2>
            <p className="text-xs text-stone-500 mb-4">Slots open up to {bufferHours} hour{bufferHours === 1 ? '' : 's'} before the start time so we can pack and dispatch in time.</p>
            {slotCatalog.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg">
                No delivery slots are currently configured. Please check back shortly or contact support.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {slotCatalog.map((s) => {
                  const displayLabel = slotDisplayLabel(s, now);
                  const available = isSlotAvailable(s, now, bufferHours);
                  const selected = slot === displayLabel;
                  const cls = !available
                    ? 'border-stone-100 bg-stone-50 text-stone-400 cursor-not-allowed'
                    : selected
                      ? 'border-emerald-500 bg-emerald-50/40 font-semibold text-emerald-900 cursor-pointer'
                      : 'border-stone-200 hover:border-stone-300 text-stone-700 cursor-pointer';
                  return (
                    <label key={s.id} className={`border-2 rounded-xl px-4 py-3 transition flex items-center gap-2 text-sm ${cls}`}>
                      <input type="radio" name="slot" checked={selected} disabled={!available}
                        onChange={() => available && setSlot(displayLabel)}
                        className="w-4 h-4 text-emerald-600 disabled:opacity-40" />
                      <span className="flex-1">{displayLabel}</span>
                      {!available && <span className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">Closed</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Payment */}
          <section className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
            <h2 className="font-bold text-stone-900 mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment method</h2>
            <div className="space-y-2">
              {PAYMENT_METHODS_BASE.filter((pm) => {
                // CREDIT tile is gated on customer's actual credit state —
                // hide entirely for users who don't have credit set up. Server
                // re-checks at place-order, so this is purely cosmetic.
                if (pm.requiresCredit) {
                  return creditState?.enabled && creditState?.status === 'active';
                }
                return true;
              }).map(pm => {
                const enabled = pm.alwaysDisabled
                  ? false
                  : pm.requiresRazorpay
                    ? Boolean(paymentConfig?.razorpay_enabled)
                    : true;
                const selected = payment === pm.id;
                const handleSelect = () => {
                  if (enabled) {
                    setPayment(pm.id);
                  } else {
                    toast.push(PAYMENT_COMING_SOON_MSG, 'error');
                  }
                };
                // For CREDIT, decorate with available credit so the customer
                // sees their headroom on the tile itself.
                const creditSub = pm.id === 'CREDIT' && creditState
                  ? `${pm.sub} · ₹${Number(creditState.available).toFixed(0)} available`
                  : pm.sub;
                return (
                  <label
                    key={pm.id}
                    onClick={(e) => { if (!enabled) { e.preventDefault(); handleSelect(); } }}
                    className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3 transition ${
                      selected ? 'border-emerald-500 bg-emerald-50/40' : 'border-stone-200 hover:border-stone-300'
                    } ${enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  >
                    <input
                      type="radio"
                      name="pay"
                      checked={selected}
                      onChange={handleSelect}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <pm.icon className="w-5 h-5 text-stone-700" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-stone-900 flex items-center gap-2">
                        {pm.label}
                        {pm.id === 'CREDIT' && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                            Net {creditState?.paymentTermsDays || 30}
                          </span>
                        )}
                        {!enabled && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">Coming soon</span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500">{creditSub}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-stone-500 mt-3">
              {paymentConfig?.razorpay_enabled
                ? 'UPI and Cash on Delivery are available. Card and Net Banking are coming soon.'
                : 'Cash on Delivery is available. UPI, Card, and Net Banking are coming soon.'}
            </p>
          </section>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 self-start">
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
            <h2 className="font-bold text-stone-900 mb-4">Order summary</h2>
            <div className="space-y-2 text-sm mb-4 max-h-48 overflow-auto">
              {cart.items.map(i => (
                <div key={i.id} className="flex justify-between gap-2">
                  <span className="text-stone-700 truncate inline-flex items-center gap-1.5">
                    <span className="w-5 h-5 inline-flex items-center justify-center overflow-hidden">
                      <ProductImage src={i.image} alt="" />
                    </span>
                    {i.name} × {i.qty}
                  </span>
                  <span className="shrink-0 text-right">
                    {/* Per-line strikethrough when discounted; plain price
                        otherwise. Keeps the dense item summary readable. */}
                    {i.mrp != null && i.mrp > i.price && (
                      <span className="text-xs text-stone-400 line-through mr-1">{formatINR(i.mrp * i.qty)}</span>
                    )}
                    <span className="font-medium">{formatINR(i.price * i.qty)}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-stone-100 pt-4 mb-4">
              <div className="flex gap-2 mb-2">
                <input value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value);
                    // Drop a previously-applied discount when the user edits
                    // the code so a stale discount can't ride along under a
                    // new code without re-validating.
                    if (appliedCode && e.target.value.trim().toUpperCase() !== appliedCode) {
                      setDiscount(0);
                      setAppliedCode('');
                    }
                  }}
                  placeholder="Coupon code"
                  disabled={applyingCoupon}
                  className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 disabled:bg-stone-50" />
                {appliedCode ? (
                  <button onClick={removeCoupon}
                    className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 text-stone-700 px-4 py-2 rounded-lg text-sm font-semibold">
                    Remove
                  </button>
                ) : (
                  <button onClick={applyCoupon} disabled={applyingCoupon}
                    className="bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                    {applyingCoupon ? '…' : 'Apply'}
                  </button>
                )}
              </div>
              {appliedCode && (
                <p className="text-xs text-emerald-700 font-semibold">✓ {appliedCode} applied · −{formatINR(discount)}</p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {/* MRP → product savings → subtotal only when there are
                  product-level discounts. Coupon discount stays as a
                  separate line below — both can be present together. */}
              {totalSavings > 0 ? (
                <>
                  <div className="flex justify-between"><span className="text-stone-600">Item total (MRP)</span><span>{formatINR(mrpSubtotal)}</span></div>
                  <div className="flex justify-between text-emerald-700"><span>Product savings</span><span className="font-semibold">−{formatINR(totalSavings)}</span></div>
                  <div className="flex justify-between"><span className="text-stone-600">Subtotal</span><span>{formatINR(subtotal)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-stone-600">Subtotal</span><span>{formatINR(subtotal)}</span></div>
              )}
              {discount > 0 && <div className="flex justify-between text-emerald-700"><span>Coupon discount</span><span>−{formatINR(discount)}</span></div>}
              <div className="flex justify-between"><span className="text-stone-600">Delivery</span><span>{deliveryCharge === 0 ? <span className="text-emerald-600">FREE</span> : formatINR(deliveryCharge)}</span></div>
              <div className="border-t border-stone-200 pt-3 flex justify-between text-lg font-bold">
                <span>Total</span><span>{formatINR(total)}</span>
              </div>
              {(totalSavings + discount) > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-xs font-semibold text-center mt-1">
                  You're saving {formatINR(totalSavings + discount)} on this order
                </div>
              )}
              {belowMinQty && (
                <div className="bg-red-50 text-red-700 text-xs p-2 rounded-lg flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Minimum {thresholds.min_order_quantity} item{thresholds.min_order_quantity === 1 ? '' : 's'} per order.
                </div>
              )}
              {belowMinValue && (
                <div className="bg-red-50 text-red-700 text-xs p-2 rounded-lg flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Add {formatINR(thresholds.min_order_value - subtotal)} more to meet the {formatINR(thresholds.min_order_value)} minimum.
                </div>
              )}
            </div>

            {placeError && (
              <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div>{placeError}</div>
                  <button type="button" onClick={() => onNavigate('addresses')}
                    className="mt-1 underline font-semibold hover:text-red-900">
                    Manage addresses
                  </button>
                </div>
              </div>
            )}
            <button onClick={placeOrder} disabled={placeDisabled}
              className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition">
              {placing ? 'Placing order…' : `Place order · ${formatINR(total)}`}
            </button>
            <p className="text-xs text-stone-500 text-center mt-3">By placing this order you agree to our Terms.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ORDER CONFIRMATION
// ============================================================
export function OrderConfirmationPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const toast = useToast();
  const settings = useSettings();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.orderId) { setLoading(false); return; }
    api.getOrder(params.orderId).then(r => { setOrder(r.data); setLoading(false); });
  }, [params?.orderId]);

  const downloadInvoice = async () => {
    try { await api.downloadInvoice(order.order_id); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-16"><div className="bg-stone-100 animate-pulse h-64 rounded-2xl" /></div>;
  if (!order) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-stone-600">Order not found.</p>
      <button onClick={() => onNavigate('home')} className="text-emerald-700 font-semibold mt-3">Go home</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-8 text-center mb-6">
        <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-bold text-stone-900 mb-2">{t('checkout.orderPlaced')}</h1>
        <p className="text-stone-600 mb-1">Thank you for shopping with {settings?.company_name || 'Redlook'}.</p>
        <p className="text-sm text-stone-500">Order ID: <span className="font-mono font-semibold text-stone-900">{order.order_id}</span></p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-stone-900 mb-4">Delivery details</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-stone-500 font-semibold mb-1">Delivering to</div>
            <div className="text-stone-700">
              <div className="font-semibold">{order.address.recipient_name}</div>
              {order.address.address_line1}, {order.address.city} - {order.address.pincode}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-stone-500 font-semibold mb-1">Slot</div>
            <div className="text-stone-700">{order.delivery_slot}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-stone-500 font-semibold mb-1">Payment</div>
            <div className="text-stone-700">{order.payment_method} — <span className={order.payment_status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}>{order.payment_status}</span></div>
          </div>
          <div>
            <div className="text-xs uppercase text-stone-500 font-semibold mb-1">Total</div>
            <div className="text-stone-900 font-bold">{formatINR(order.total_amount)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-stone-900 mb-4">Items ({order.items.length})</h2>
        <div className="space-y-2">
          {order.items.map(i => {
            const hadDiscount = i.mrp != null && Number(i.mrp) > Number(i.price);
            return (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-stone-700 inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 inline-flex items-center justify-center overflow-hidden">
                    <ProductImage src={i.image} alt="" />
                  </span>
                  {i.name} × {i.qty}
                </span>
                <span className="text-right">
                  {hadDiscount && (
                    <span className="text-xs text-stone-400 line-through mr-1.5">{formatINR(Number(i.mrp) * Number(i.qty))}</span>
                  )}
                  <span className="font-medium">{formatINR(i.price * i.qty)}</span>
                </span>
              </div>
            );
          })}
        </div>

        {(Number(order.product_savings ?? 0) > 0 || Number(order.discount ?? 0) > 0) && (
          <div className="mt-4 pt-4 border-t border-stone-100 space-y-1.5 text-sm">
            {Number(order.product_savings ?? 0) > 0 && (
              <>
                <div className="flex justify-between text-stone-600">
                  <span>Item total (MRP)</span>
                  <span>{formatINR(Number(order.subtotal) + Number(order.product_savings))}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Product savings</span>
                  <span className="font-semibold">−{formatINR(order.product_savings)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>{formatINR(order.subtotal)}</span>
            </div>
            {Number(order.discount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Coupon discount</span>
                <span className="font-semibold">−{formatINR(order.discount)}</span>
              </div>
            )}
            {Number(order.delivery_charge ?? 0) > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Delivery</span>
                <span>{formatINR(order.delivery_charge)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-stone-900 pt-1.5 border-t border-stone-100 mt-1.5">
              <span>Total paid</span>
              <span>{formatINR(order.total_amount)}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-xs font-semibold text-center mt-2">
              You saved {formatINR(Number(order.product_savings ?? 0) + Number(order.discount ?? 0))} on this order
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={() => onNavigate('order-tracking', { orderId: order.order_id })}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold">Track order</button>
        <button onClick={downloadInvoice}
          className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 px-6 py-3 rounded-xl font-semibold">
          <Download className="w-4 h-4" /> Invoice
        </button>
        <button onClick={() => onNavigate('orders')}
          className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 px-6 py-3 rounded-xl font-semibold">View all orders</button>
        <button onClick={() => onNavigate('home')}
          className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:bg-stone-50 px-6 py-3 rounded-xl font-semibold">Continue shopping</button>
      </div>
    </div>
  );
}

// ============================================================
// MY ORDERS
// ============================================================
export function OrdersPage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.user) return;
    api.listOrders(auth.user.customer_id).then(r => { setOrders(r.data); setLoading(false); });
  }, [auth.user]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;

  const filtered = filter === 'all' ? orders : orders.filter(o => o.order_status === filter);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">{t('orders.title')}</h1>

      <AccountSidebarLayout active="orders" onNavigate={onNavigate}>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {['all', 'Placed', 'Confirmed', 'Out for Delivery', 'Delivered', 'Cancelled'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${filter === f ? 'bg-stone-900 text-white' : 'bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-stone-700 hover:border-stone-300'}`}>
              {f === 'all' ? t('common.all') : t(`orders.stage.${f}`, { defaultValue: f })}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-stone-100 animate-pulse h-32 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-12 text-center">
            <Package className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-600 mb-3">{t('orders.empty')}</p>
            <p className="text-xs text-stone-500 mb-4">{t('orders.emptyHint')}</p>
            <button onClick={() => onNavigate('products')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-semibold text-sm">
              {t('cart.startShopping')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(o => (
              <div key={o.order_id} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-mono text-xs text-stone-500">{o.order_id}</div>
                    <div className="text-sm text-stone-700 mt-0.5">{t('orders.placedOn', { date: formatDate(o.order_date) })}</div>
                  </div>
                  <StatusBadge status={o.order_status} />
                </div>
                <div className="text-sm text-stone-600 mb-3">
                  {t('orders.items', { count: o.items.length })} · {formatINR(o.total_amount)} · {o.payment_method}
                </div>
                <div className="flex gap-3 -ml-1">
                  {o.items.slice(0, 5).map(i => (
                    <div key={i.id} className="w-10 h-10 bg-gradient-to-br from-stone-50 to-emerald-50 rounded-lg flex items-center justify-center text-xl overflow-hidden">
                      <ProductImage src={i.image} alt={i.name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {o.items.length > 5 && <div className="text-xs text-stone-500 self-center ml-1">+{o.items.length - 5}</div>}
                </div>
                <div className="flex gap-3 mt-4 text-sm">
                  <button onClick={() => onNavigate('order-tracking', { orderId: o.order_id })}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold">{t('orders.trackOrder')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AccountSidebarLayout>
    </div>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const map = {
    'Placed': 'bg-blue-100 text-blue-700',
    'Confirmed': 'bg-indigo-100 text-indigo-700',
    'Packed': 'bg-purple-100 text-purple-700',
    'Out for Delivery': 'bg-amber-100 text-amber-700',
    'Delivered': 'bg-emerald-100 text-emerald-700',
    'Cancelled': 'bg-red-100 text-red-700',
    'ReturnRequested': 'bg-orange-100 text-orange-700',
  };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${map[status] || 'bg-stone-100 text-stone-700'}`}>{t(`orders.stage.${status}`, { defaultValue: status })}</span>;
}

// ============================================================
// ORDER TRACKING
// ============================================================
export function OrderTrackingPage({ params, onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const settings = useSettings();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!params?.orderId) { setLoading(false); return; }
    setLoading(true);
    api.getOrder(params.orderId).then(r => { setOrder(r.data); setLoading(false); });
  };
  useEffect(load, [params?.orderId]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;
  // Initial-load skeleton: shaped like the real page so the layout doesn't
  // jump when data arrives. Only renders when `order` is still null —
  // reloads triggered by Cancel / Return / etc. keep the current page
  // visible and update in place, so action clicks no longer feel like the
  // whole page is flashing.
  if (!order) {
    if (loading) return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
        <div className="h-5 w-32 bg-stone-100 rounded" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-stone-100 rounded" />
            <div className="h-4 w-32 bg-stone-100 rounded" />
          </div>
          <div className="h-6 w-20 bg-stone-100 rounded-full" />
        </div>
        <div className="h-56 bg-stone-100 rounded-2xl" />
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="h-32 bg-stone-100 rounded-2xl" />
          <div className="h-32 bg-stone-100 rounded-2xl" />
        </div>
        <div className="h-40 bg-stone-100 rounded-2xl" />
      </div>
    );
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-stone-600">Order not found.</div>;
  }

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return;
    try { await api.cancelOrder(order.order_id); toast.push('Order cancelled'); load(); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  const requestReturn = async () => {
    // Filter the order's items to only those flagged returnable today. The
    // customer never sees the non-returnable ones in the form (per product
    // decision), but we still surface a small note so they know SOMETHING
    // was excluded if the order was mixed.
    const eligibleItems = (order.items || []).filter((i) => i.is_returnable !== false);
    if (eligibleItems.length === 0) {
      toast.push('None of the items in this order are eligible for return.', 'error');
      return;
    }
    const reason = prompt('Reason for return (e.g. damaged, wrong item, quality issue):');
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) toast.push('Please describe the reason in at least 5 characters', 'error');
      return;
    }
    // Pass eligible items only — backend re-validates server-side, so
    // tampering with this list still gets rejected.
    const items = eligibleItems.map((i) => ({ product_id: i.id, qty: i.qty }));
    try {
      await api.requestReturn(order.order_id, reason.trim(), items);
      const skipped = (order.items || []).length - eligibleItems.length;
      toast.push(skipped > 0
        ? `Return request submitted for ${eligibleItems.length} item${eligibleItems.length === 1 ? '' : 's'}. ${skipped} non-returnable item${skipped === 1 ? '' : 's'} excluded.`
        : 'Return request submitted');
      load();
    } catch (err) { toast.push(err.message, 'error'); }
  };

  const downloadInvoice = async () => {
    try { await api.downloadInvoice(order.order_id); }
    catch (err) { toast.push(err.message, 'error'); }
  };

  const isCancelled = order.order_status === 'Cancelled';
  const isReturnRequested = order.order_status === 'ReturnRequested';
  // Treat ReturnRequested as past-Delivered so the progress bar still reads "complete"
  const currentIdx = isCancelled
    ? -1
    : isReturnRequested
      ? ORDER_STAGES.length - 1
      : ORDER_STAGES.indexOf(order.order_status);
  // Cancellation policy is admin-configured (BusinessSettings.cancellation_cutoff_status,
  // surfaced via the public /api/settings endpoint as settings.cancellation_cutoff_status).
  // canCancelOrderClient mirrors the backend's canCancelOrder helper so the
  // UI hides the CTA exactly when the API would reject it.
  const cancelCutoff = settings.cancellation_cutoff_status || 'Out for Delivery';
  const canCancel = canCancelOrderClient(order.order_status, cancelCutoff);
  // Show the policy line on every active (not-cancelled, not-delivered) order
  // so customers know up-front when the window closes.
  const showCancelPolicy = !isCancelled && !isReturnRequested && order.order_status !== 'Delivered';
  // Return is allowed only on Delivered orders and only within the
  // admin-configured window of the delivery timestamp (FR-ORD-05). The
  // backend re-validates so this is purely a CTA-hiding heuristic.
  // Additionally — at least one line item must be currently returnable
  // (admin-toggled per product), otherwise the CTA is hidden because
  // there's nothing the customer could submit.
  const deliveredAt = order.timeline?.find(t => t.status === 'Delivered')?.at;
  const hasReturnableItem = (order.items || []).some((i) => i.is_returnable !== false);
  const returnWindowHours = settings.return_window_hours ?? 24;
  const canReturn = order.order_status === 'Delivered'
    && deliveredAt
    && returnWindowHours > 0
    && (Date.now() - new Date(deliveredAt).getTime()) / 36e5 <= returnWindowHours
    && hasReturnableItem;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => onNavigate('orders')} className="flex items-center gap-2 text-sm text-stone-600 hover:text-emerald-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </button>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{t('orders.trackingTitle')}</h1>
          <p className="text-sm font-mono text-stone-500 mt-1">{order.order_id}</p>
        </div>
        <StatusBadge status={order.order_status} />
      </div>

      <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 mb-6">
        {isCancelled ? (
          <div className="flex items-center gap-3 text-red-700">
            <X className="w-6 h-6" />
            <div>
              <div className="font-semibold">Order cancelled</div>
              <div className="text-sm text-red-600/80">Refund (if any) will be processed in 5–7 business days.</div>
            </div>
          </div>
        ) : isReturnRequested ? (
          <div className="flex items-center gap-3 text-orange-700">
            <RotateCcw className="w-6 h-6" />
            <div>
              <div className="font-semibold">Return requested</div>
              <div className="text-sm text-orange-600/80">Our team will review and contact you within 24 hours. Refund (if approved) takes 5–7 business days.</div>
            </div>
          </div>
        ) : (
          <ol className="relative">
            {ORDER_STAGES.map((stage, i) => {
              const reached = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <li key={stage} className="flex gap-4 pb-6 last:pb-0 relative">
                  {i < ORDER_STAGES.length - 1 && (
                    <div className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${i < currentIdx ? 'bg-emerald-500' : 'bg-stone-200'}`} />
                  )}
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${reached ? 'bg-emerald-500' : 'bg-stone-200'}`}>
                    {reached ? <Check className="w-3.5 h-3.5 text-white" /> : <Circle className="w-3 h-3 text-stone-400" />}
                  </div>
                  <div>
                    <div className={`font-semibold ${reached ? 'text-stone-900' : 'text-stone-500'}`}>{stage}</div>
                    {isCurrent && <div className="text-xs text-emerald-700 mt-0.5">Current status</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-5">
          <h3 className="font-semibold text-stone-900 mb-2 text-sm">Delivering to</h3>
          <p className="text-sm text-stone-700">{order.address.recipient_name}</p>
          <p className="text-xs text-stone-600 mt-1">{order.address.address_line1}, {order.address.city} - {order.address.pincode}</p>
          <p className="text-xs text-stone-500 mt-2">Slot: {order.delivery_slot}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-5">
          <h3 className="font-semibold text-stone-900 mb-2 text-sm">Payment</h3>
          <p className="text-sm text-stone-700">{order.payment_method} · <span className={order.payment_status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}>{order.payment_status}</span></p>
          <p className="text-xl font-bold text-stone-900 mt-2">{formatINR(order.total_amount)}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-5 mb-6">
        <h3 className="font-semibold text-stone-900 mb-3 text-sm">Items</h3>
        <div className="space-y-2">
          {order.items.map(i => {
            // MRP captured at order time (added in 20260512150000_order_item_mrp).
            // Orders placed before that migration have mrp=0 → fall through to
            // the no-discount branch and show only the paid price.
            const hadDiscount = i.mrp != null && Number(i.mrp) > Number(i.price);
            return (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-stone-700 inline-flex items-center gap-1.5">
                  <span className="w-5 h-5 inline-flex items-center justify-center overflow-hidden">
                    <ProductImage src={i.image} alt="" />
                  </span>
                  {i.name} × {i.qty}
                </span>
                <span className="text-right">
                  {hadDiscount && (
                    <span className="text-xs text-stone-400 line-through mr-1.5">{formatINR(Number(i.mrp) * Number(i.qty))}</span>
                  )}
                  <span className="font-medium">{formatINR(i.price * i.qty)}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Totals breakdown — only rendered when the order carried product-
            level savings or a coupon discount. Mirrors the cart/checkout
            layout so the same numbers the customer saw pre-submit appear
            here post-submit. product_savings comes from serializeOrder;
            for legacy orders without snapshotted MRP it resolves to 0. */}
        {(Number(order.product_savings ?? 0) > 0 || Number(order.discount ?? 0) > 0) && (
          <div className="mt-4 pt-4 border-t border-stone-100 space-y-1.5 text-sm">
            {Number(order.product_savings ?? 0) > 0 && (
              <>
                <div className="flex justify-between text-stone-600">
                  <span>Item total (MRP)</span>
                  <span>{formatINR(Number(order.subtotal) + Number(order.product_savings))}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Product savings</span>
                  <span className="font-semibold">−{formatINR(order.product_savings)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>{formatINR(order.subtotal)}</span>
            </div>
            {Number(order.discount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Coupon discount</span>
                <span className="font-semibold">−{formatINR(order.discount)}</span>
              </div>
            )}
            {Number(order.delivery_charge ?? 0) > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Delivery</span>
                <span>{formatINR(order.delivery_charge)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-stone-900 pt-1.5 border-t border-stone-100 mt-1.5">
              <span>Total paid</span>
              <span>{formatINR(order.total_amount)}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-xs font-semibold text-center mt-2">
              You saved {formatINR(Number(order.product_savings ?? 0) + Number(order.discount ?? 0))} on this order
            </div>
          </div>
        )}
      </div>

      {/* Post-delivery: prompt the customer to rate each item right where they
          land after the "Order delivered" notification — saves them from
          having to dig back to each product detail page. Eligibility is
          enforced server-side anyway (canReview in routes/reviews.js). */}
      {order.order_status === 'Delivered' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <h3 className="font-semibold text-stone-900">How was your order?</h3>
          </div>
          <p className="text-xs text-stone-600 mb-4">Tap a star to rate the items you received. Helps other shoppers find the freshest picks.</p>
          <div className="space-y-3">
            {order.items.map(i => (
              <div key={i.id} className="flex items-start justify-between gap-3 flex-wrap">
                <div className="text-sm text-stone-700 min-w-0">
                  <span className="w-6 h-6 inline-flex items-center justify-center text-lg overflow-hidden mr-1">
                    <ProductImage src={i.image} alt="" />
                  </span>
                  {i.name}
                </div>
                <InlineProductRating productId={i.id} />
              </div>
            ))}
          </div>
        </div>
      )}

      {order.timeline?.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-5 mb-6">
          <h3 className="font-semibold text-stone-900 mb-3 text-sm">Activity</h3>
          <ul className="space-y-2 text-sm">
            {order.timeline.map((t, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-stone-700">{t.note}</span>
                <span className="text-stone-500 text-xs whitespace-nowrap">{formatDate(t.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isCancelled && (
        <div className="text-center mb-4">
          <button onClick={downloadInvoice}
            className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:border-stone-300 text-stone-800 px-4 py-2 rounded-xl text-sm font-semibold">
            <Download className="w-4 h-4" /> Download invoice (PDF)
          </button>
        </div>
      )}

      {showCancelPolicy && (
        <div className="text-center mb-2">
          {canCancel ? (
            <>
              <button onClick={cancel} className="text-red-600 hover:text-red-700 text-sm font-semibold">
                Cancel this order
              </button>
              <p className="text-xs text-stone-500 mt-1">
                Cancellation closes once the order reaches "{cancelCutoff}".
              </p>
            </>
          ) : (
            <p className="text-xs text-stone-500">
              This order can no longer be cancelled — it has already reached "{order.order_status}".
            </p>
          )}
        </div>
      )}
      {canReturn && (
        <div className="text-center">
          <button onClick={requestReturn} className="inline-flex items-center gap-1.5 text-orange-600 hover:text-orange-700 text-sm font-semibold">
            <RotateCcw className="w-4 h-4" /> Request return / refund
          </button>
          {/* Policy line: prefer the admin-authored message; otherwise fall
              back to a sentence that mirrors the configured hour count so
              the line stays accurate even when the admin hasn't customised
              the copy. */}
          {(settings.return_window_message?.trim() || returnWindowHours > 0) && (
            <p className="text-xs text-stone-500 mt-1 whitespace-pre-line">
              {settings.return_window_message?.trim()
                || `Return window closes ${returnWindowHours} hour${returnWindowHours === 1 ? '' : 's'} after delivery.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// WISHLIST
// ============================================================
export function WishlistPage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const wishlist = useWishlist();
  const cart = useCart();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const idsKey = wishlist.ids.join(',');
  useEffect(() => {
    if (!auth.user) return;
    let cancelled = false;
    setLoading(true);
    api.getWishlistItems(auth.user.customer_id)
      .then((r) => { if (!cancelled) setItems(r.data || []); })
      .catch((err) => { if (!cancelled) toast.push(err.message || t('errors.couldNotLoad', { name: t('wishlist.title') }), 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auth.user, idsKey, toast, t]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">{t('wishlist.title')}</h1>

      <AccountSidebarLayout active="wishlist" onNavigate={onNavigate}>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-stone-100 animate-pulse h-56 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-12 text-center">
            <Heart className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-600 mb-3">{t('wishlist.empty')}</p>
            <p className="text-xs text-stone-500 mb-4">{t('wishlist.emptyHint')}</p>
            <button onClick={() => onNavigate('products')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-semibold text-sm">
              {t('wishlist.browseCatalog')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {items.map(p => (
              <ProductCard key={p.id} product={p}
                onClick={() => onNavigate('product', { id: p.id })}
                onAdd={(prod) => { cart.addItem(prod); toast.push(t('products.addedToCart', { name: prod.name })); }} />
            ))}
          </div>
        )}
      </AccountSidebarLayout>
    </div>
  );
}

// ============================================================
// MY CREDIT (BRD §4 — customer-facing pending invoices view)
// Outstanding total, available credit, list of pending invoices with
// per-invoice Pay Now, and payment history. Hidden no-op when the
// customer has never had credit set up.
// ============================================================
export function MyCreditPage({ onNavigate }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.user) return;
    setLoading(true);
    api.getCredit(auth.user.customer_id)
      .then((r) => setData(r.data))
      .catch((err) => toast.push(err.message || 'Could not load credit', 'error'))
      .finally(() => setLoading(false));
  }, [auth.user, toast]);

  if (!auth.user) return <RequireAuth user={null} onNavigate={onNavigate} />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-2">{t('credit.title')}</h1>
      <p className="text-stone-600 mb-8">Pay-later invoices, available credit, and payment history.</p>

      <AccountSidebarLayout active="credit" onNavigate={onNavigate}>
        {loading ? (
          <div className="bg-stone-100 animate-pulse h-32 rounded-2xl" />
        ) : !data?.config?.credit_enabled ? (
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-8 text-center">
            <Wallet className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-700 font-semibold mb-1">Credit isn't enabled on this account.</p>
            <p className="text-sm text-stone-500">
              Pay-later (Net 15 / Net 30) is available to approved business and trusted retail
              customers. Contact us to apply.
            </p>
          </div>
        ) : (
          <CreditDashboard data={data} userId={auth.user.customer_id} onChanged={(d) => setData(d)} />
        )}
      </AccountSidebarLayout>
    </div>
  );
}

function CreditDashboard({ data, userId }) {
  const { state, pending_invoices, payments, razorpay_enabled } = data;
  const toast = useToast();
  // Per-row "minting payment link" state — keyed by transaction id so two
  // rapid clicks on different rows don't share one spinner.
  const [paying, setPaying] = useState(null);
  const [receiptingId, setReceiptingId] = useState(null);

  const onPay = async (invoice) => {
    setPaying(invoice.id);
    try {
      const r = await api.getInvoicePaymentLink(userId, invoice.id);
      const url = r?.data?.payment_link_url;
      if (!url) throw new Error('Could not get payment link');
      // Open the Razorpay-hosted page in a new tab. Customer completes
      // payment there; the webhook updates this invoice in the background
      // — they'll see it move to PAID on next page load.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.push(err.message || 'Could not start payment', 'error');
    } finally {
      setPaying(null);
    }
  };

  const onReceipt = async (paymentId) => {
    setReceiptingId(paymentId);
    try {
      await api.downloadPaymentReceipt(userId, paymentId);
    } catch (err) {
      toast.push(err.message || 'Could not download receipt', 'error');
    } finally {
      setReceiptingId(null);
    }
  };
  const used = state.outstanding;
  const limit = state.limit || 1;
  const pct = Math.min(100, (used / limit) * 100);
  const barTone = pct < 70 ? 'bg-emerald-500' : pct < 90 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="space-y-6">
      {state.status === 'blocked' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Your credit is temporarily blocked. Please contact us to clear pending invoices and resume credit orders.</span>
        </div>
      )}

      {/* Headline cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Outstanding</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">{formatINR(state.outstanding)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Available credit</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(state.available)}</div>
          <div className="text-[11px] text-stone-500 mt-0.5">of {formatINR(state.limit)} limit</div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Overdue</div>
          <div className={`text-2xl font-bold mt-1 ${state.overdueCount > 0 ? 'text-rose-600' : 'text-stone-900'}`}>
            {state.overdueCount > 0 ? formatINR(state.overdueAmount) : '—'}
          </div>
          {state.overdueCount > 0 && (
            <div className="text-[11px] text-rose-600 mt-0.5">{state.oldestOverdueDays}d oldest</div>
          )}
        </div>
      </div>

      {/* Utilisation bar */}
      <div>
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div className={`h-full ${barTone} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-stone-500 mt-1">
          {formatINR(state.outstanding)} of {formatINR(state.limit)} used ({pct.toFixed(0)}%)
        </div>
      </div>

      {/* Pending invoices */}
      <div>
        <h2 className="font-bold text-stone-900 mb-3">Pending invoices</h2>
        {pending_invoices.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 text-center text-sm text-stone-500">
            All caught up — nothing pending.
          </div>
        ) : (
          <div className="space-y-2">
            {pending_invoices.map((inv) => (
              <PendingInvoiceRow key={inv.id} invoice={inv}
                razorpayEnabled={razorpay_enabled}
                paying={paying === inv.id}
                onPay={() => onPay(inv)} />
            ))}
          </div>
        )}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <h2 className="font-bold text-stone-900 mb-3">Payment history</h2>
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-stone-600 text-xs">Date</th>
                  <th className="px-4 py-2 font-semibold text-stone-600 text-xs">Mode</th>
                  <th className="px-4 py-2 font-semibold text-stone-600 text-xs">Reference</th>
                  <th className="px-4 py-2 font-semibold text-stone-600 text-xs text-right">Amount</th>
                  <th className="px-4 py-2 font-semibold text-stone-600 text-xs text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="px-4 py-2 text-stone-700">
                      {new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-stone-700 text-xs">{p.mode.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-stone-500 text-xs font-mono">{p.reference_no || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{formatINR(p.amount)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => onReceipt(p.id)} disabled={receiptingId === p.id}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50 inline-flex items-center gap-1">
                        {receiptingId === p.id ? '…' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingInvoiceRow({ invoice, razorpayEnabled, paying, onPay }) {
  const owed = Number(invoice.amount) - Number(invoice.amount_paid);
  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap ${
      invoice.is_overdue ? 'border-rose-200 bg-rose-50/40' : 'border-stone-200 dark:border-slate-700'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-stone-500">{invoice.order_id || invoice.id.slice(0, 8)}</span>
          {invoice.is_overdue ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
              OVERDUE · {invoice.days_overdue}d
            </span>
          ) : invoice.status === 'PARTIALLY_PAID' ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">PARTIALLY PAID</span>
          ) : (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">PENDING</span>
          )}
        </div>
        <div className="text-sm text-stone-700 mt-1">
          Due {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          {!invoice.is_overdue && invoice.due_date && (
            <span className="text-xs text-stone-500 ml-2">
              · {Math.max(0, Math.ceil((new Date(invoice.due_date) - new Date()) / 86_400_000))}d remaining
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-stone-900">{formatINR(owed)}</div>
        {Number(invoice.amount_paid) > 0 && (
          <div className="text-[11px] text-stone-500">of {formatINR(invoice.amount)}</div>
        )}
      </div>
      {/* Pay-now mints a Razorpay payment link on demand and opens the
          hosted page in a new tab. Backend keeps the link idempotent —
          re-clicks before expiry reuse the same URL. The button is shown
          disabled with a "coming soon" hint when Razorpay credentials
          aren't configured (RAZORPAY_KEY_ID/SECRET in the .env). */}
      <button type="button" onClick={onPay}
        disabled={!razorpayEnabled || paying}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
          razorpayEnabled
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-300 disabled:cursor-wait'
            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
        }`}
        title={razorpayEnabled ? 'Pay this invoice online' : 'Online payment is not configured yet'}>
        {paying ? 'Opening…' : razorpayEnabled ? 'Pay now' : 'Pay now (offline)'}
      </button>
    </div>
  );
}

// ============================================================
// 404
// ============================================================
export function NotFoundPage({ onNavigate }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="text-6xl mb-4">🥬</div>
      <h1 className="text-3xl font-bold text-stone-900 mb-2">Page not found</h1>
      <p className="text-stone-600 mb-6">The page you're looking for doesn't exist.</p>
      <button onClick={() => onNavigate('home')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold">Go home</button>
    </div>
  );
}
