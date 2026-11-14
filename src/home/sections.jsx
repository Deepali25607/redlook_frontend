import {
  Truck, RotateCcw, ShieldCheck, Headphones, Camera, Shirt,
  Sparkles, CheckCircle2, ArrowRight, ChevronRight, Gem,
  MapPin, Navigation, Phone, MessageCircle,
} from 'lucide-react';
import { ProductCard } from '../components';
import { resolveImageUrl } from '../api';
import { formatCurrency } from '../lib/format';
import { useSettings } from '../contexts';
import { BUSINESS, MAPS_DIRECTIONS_URL, MAPS_SEARCH_URL, isRealPhone } from '../seo/seoConfig';
import { trackDirections, trackWhatsApp, trackContact } from '../seo/analytics';

// ============================================================
// Shared centered section heading with gold flourishes.
// ============================================================
export function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="text-center mb-10">
      {eyebrow && (
        <div className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-gold)' }}>{eyebrow}</div>
      )}
      <div className="flex items-center justify-center gap-3">
        <span className="rl-flourish-line hidden sm:block" />
        <Gem className="w-4 h-4" style={{ color: 'var(--lux-gold)' }} />
        <h2 className="font-luxury text-3xl sm:text-4xl font-semibold tracking-wide" style={{ color: 'var(--lux-maroon-deep)' }}>{title}</h2>
        <Gem className="w-4 h-4" style={{ color: 'var(--lux-gold)' }} />
        <span className="rl-flourish-line is-right hidden sm:block" />
      </div>
      {subtitle && <p className="mt-3 text-sm sm:text-base text-stone-500 max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
}

function ViewAll({ onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2" style={{ color: 'var(--lux-maroon)' }}>
      View All <ArrowRight className="w-4 h-4" />
    </button>
  );
}

// ============================================================
// SECTION 4 — Decorative arch-shaped category cards.
// Uses real categories; each arch image is the first product image in that
// category (falls back to the category emoji/icon on a maroon gradient).
// ============================================================
export function CategoryArches({ categories = [], products = [], onNavigate }) {
  if (!categories.length) return null;
  const firstImageFor = (catId) => {
    const p = products.find((x) => x.category === catId && resolveImageUrl(x.image));
    return p ? resolveImageUrl(p.image, 500) : null;
  };
  const items = categories.slice(0, 6);
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 sm:gap-6">
        {items.map((c) => {
          const img = firstImageFor(c.id);
          return (
            <button key={c.id} onClick={() => onNavigate('products', { category: c.id })}
              className="group flex flex-col items-center">
              <div className="rl-arch w-full aspect-[3/4] relative">
                {img ? (
                  <img src={img} alt={c.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-5xl">{c.icon || '🧵'}</div>
                )}
              </div>
              <span className="mt-3 text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-center" style={{ color: 'var(--lux-maroon-deep)' }}>
                {c.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// SECTION 5 — Service benefits (4 columns).
// ============================================================
export function ServiceBenefits({ settings }) {
  const freeOver = settings?.free_delivery_over;
  const items = [
    { icon: Truck, title: 'Free Shipping', sub: freeOver ? `On Orders Above ${formatCurrency(freeOver)}` : 'On Qualifying Orders' },
    { icon: RotateCcw, title: 'Easy 7-Day Returns', sub: 'Hassle Free' },
    { icon: ShieldCheck, title: '100% Authentic', sub: 'Handloom & Premium Fabrics' },
    { icon: Headphones, title: 'Concierge Support', sub: 'Personal Styling Assistance' },
  ];
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="rl-benefits rounded-2xl px-4 sm:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-y-6">
        {items.map((it, i) => (
          <div key={i} className={`flex items-center gap-3 justify-center lg:justify-start ${i < 3 ? 'lg:border-r lg:border-amber-300/40' : ''}`}>
            <it.icon className="w-7 h-7 shrink-0" style={{ color: 'var(--lux-gold)' }} />
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--lux-maroon-deep)' }}>{it.title}</div>
              <div className="text-[11px] text-stone-500">{it.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// SECTION 6 — Wedding Occasion Wardrobe (3 editorial arch cards).
// Images sourced from existing product photography where available; else a
// tinted branded panel. No stock URLs.
// ============================================================
export function WeddingWardrobe({ products = [], onNavigate }) {
  const withImg = products.filter((p) => resolveImageUrl(p.image));
  const cards = [
    { title: 'Haldi Collection', desc: 'Vibrant drapes for joyful beginnings', tint: 'rgba(224,176,74,0.45)' },
    { title: 'Wedding Collection', desc: 'Traditional grandeur for the big day', tint: 'rgba(31,122,83,0.45)' },
    { title: 'Party Edit', desc: 'Elegant drapes for every celebration', tint: 'rgba(193,75,106,0.45)' },
  ];
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 relative">
      <SectionHeading title="WEDDING OCCASION WARDROBE" subtitle="Curated drapes & ensembles for your most special celebrations." />
      <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
        {cards.map((card, i) => {
          const img = withImg[i] ? resolveImageUrl(withImg[i].image, 700) : null;
          return (
            <button key={i} onClick={() => onNavigate('products')} className="group text-left">
              <div className="rl-arch rl-arch-lg w-full aspect-[4/5] relative">
                {img && <img src={img} alt={card.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />}
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 35%, rgba(42,8,16,0.82) 100%), ${img ? 'transparent' : `linear-gradient(135deg, ${card.tint}, rgba(74,15,26,0.9))`}` }} />
                <div className="absolute inset-x-0 bottom-0 p-5 text-center">
                  <h3 className="font-luxury text-2xl text-amber-50">{card.title}</h3>
                  <p className="text-xs text-amber-50/80 mt-1">{card.desc}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold mt-2" style={{ color: 'var(--lux-gold-soft)' }}>
                    Explore Now <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// SECTION 7 — Virtual Trial Room promo (maroon). CTA → coming-soon page.
// ============================================================
export function VirtualTrialPromo({ products = [], onNavigate }) {
  const hero = products.find((p) => resolveImageUrl(p.image));
  const heroImg = hero ? resolveImageUrl(hero.image, 600) : null;
  const thumbs = products.filter((p) => resolveImageUrl(p.image)).slice(0, 4);
  const steps = [
    { icon: Camera, label: 'Use Your Webcam' },
    { icon: Shirt, label: 'Select a Saree' },
    { icon: Sparkles, label: 'See Real-Time Look' },
    { icon: CheckCircle2, label: 'Shop with Confidence' },
  ];
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="rl-maroon-stage relative rounded-3xl overflow-hidden px-6 sm:px-10 py-12">
        <div className="relative grid lg:grid-cols-3 gap-8 items-center">
          {/* Laptop mockup */}
          <div className="relative">
            <div className="relative mx-auto max-w-sm">
              <div className="rounded-xl overflow-hidden border-4 border-stone-800 bg-stone-900 aspect-[4/3] relative"
                style={{ boxShadow: '0 18px 40px -16px rgba(0,0,0,0.6)' }}>
                {heroImg ? (
                  <img src={heroImg} alt="Virtual trial preview" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7a1f2a, #4a0f1a)' }}>
                    <span className="font-luxury-italic text-2xl" style={{ color: '#f0d79a' }}>Redlook</span>
                  </div>
                )}
                <span className="absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(253,248,239,0.9)' }}>
                  <Camera className="w-4 h-4" style={{ color: 'var(--lux-maroon)' }} />
                </span>
                <div className="absolute right-2 top-2 bottom-2 flex flex-col gap-1.5 justify-center">
                  {thumbs.map((p, i) => (
                    <img key={i} src={resolveImageUrl(p.image, 120)} alt="" className="w-8 h-8 rounded object-cover border border-amber-200/60" loading="lazy" />
                  ))}
                </div>
              </div>
              <div className="h-2 bg-stone-700 rounded-b-xl mx-6" />
            </div>
          </div>

          {/* Center copy */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--lux-gold-soft)' }}>
              <Gem className="w-3.5 h-3.5" /> Virtual Trial Room <Gem className="w-3.5 h-3.5" />
            </div>
            <h2 className="font-luxury text-3xl sm:text-4xl text-amber-50">Try Before You Buy</h2>
            <p className="mt-3 text-sm text-amber-50/80 max-w-sm mx-auto">
              See how a saree looks on you in real time with our AI-powered Virtual Trial Room.
            </p>
            <button onClick={() => onNavigate('virtual-trial')}
              className="mt-6 inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold text-sm transition"
              style={{ color: '#4a0f1a', background: 'linear-gradient(135deg, #f5e8c7 0%, #e0b04a 100%)', border: '1.5px solid var(--lux-gold)' }}>
              Try Virtual Trial <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(224,176,74,0.16)', border: '1px solid rgba(224,176,74,0.4)' }}>
                  <s.icon className="w-5 h-5" style={{ color: 'var(--lux-gold-soft)' }} />
                </span>
                <span className="text-sm font-medium text-amber-50">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Shared product carousel/grid used by New Arrivals & Best Sellers.
// Reuses the existing ProductCard (wishlist + add-to-cart intact).
// ============================================================
function ProductRow({ products, onNavigate, onAdd, badgeFor }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} badge={badgeFor ? badgeFor(p, i) : undefined}
          onClick={() => onNavigate('product', { id: p.id })} onAdd={onAdd} />
      ))}
    </div>
  );
}

// ============================================================
// SECTION 8 — New Arrivals.
// ============================================================
export function NewArrivals({ products = [], onNavigate, onAdd }) {
  if (!products.length) return null;
  const items = products.slice(0, 6);
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
      <div className="relative">
        <SectionHeading title="NEW ARRIVALS" subtitle="Fresh styles, new weaves and the latest trends in ethnic fashion." />
        <div className="hidden sm:block absolute right-0 top-0"><ViewAll onClick={() => onNavigate('products')} /></div>
      </div>
      <ProductRow products={items} onNavigate={onNavigate} onAdd={onAdd} badgeFor={(_p, i) => (i < 2 ? 'New' : undefined)} />
      <div className="sm:hidden mt-6 text-center"><ViewAll onClick={() => onNavigate('products')} /></div>
    </section>
  );
}

// ============================================================
// LOCAL — "Visit Redlook – Sahatwar, Ballia". Store NAP + Google Maps
// directions + click-to-call / WhatsApp (shown only when a real number is set
// in admin Settings — placeholders are never published). Drives local-SEO
// conversion and feeds the LocalBusiness story.
// ============================================================
export function VisitStore() {
  const settings = useSettings();
  const phone = isRealPhone(settings?.support_phone) ? settings.support_phone : BUSINESS.telephone;
  const wa = isRealPhone(settings?.support_whatsapp) ? settings.support_whatsapp : BUSINESS.whatsapp;
  const waDigits = wa ? wa.replace(/\D/g, '') : '';
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="rl-maroon-stage relative rounded-3xl overflow-hidden px-6 sm:px-10 py-10">
        <div className="relative grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-gold-soft)' }}>Visit our store</div>
            <h2 className="font-luxury text-3xl sm:text-4xl text-amber-50">Visit Redlook — Sahatwar, Ballia</h2>
            <p className="mt-3 text-sm text-amber-50/80 max-w-md">
              Explore our saree, lehenga, suit material and premium shirting &amp; suiting fabric collections in person.
              <span className="block mt-1 font-luxury-italic" style={{ color: '#f0d79a' }}>सहतवार, बलिया में साड़ी, लहंगा और कपड़े की दुकान।</span>
            </p>
            <div className="mt-5 flex items-start gap-3 text-amber-50">
              <MapPin className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--lux-gold-soft)' }} />
              <address className="not-italic text-sm leading-relaxed">
                {BUSINESS.name} — a {BUSINESS.parentOrganization} store<br />
                {BUSINESS.addressLine}
              </address>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={trackDirections}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm" style={{ color: '#4a0f1a', background: 'linear-gradient(135deg,#f5e8c7,#e0b04a)', border: '1.5px solid var(--lux-gold)' }}>
                <Navigation className="w-4 h-4" /> Get Directions
              </a>
              {phone && (
                <a href={`tel:${phone.replace(/\s+/g, '')}`} onClick={trackContact}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-amber-50" style={{ border: '1px solid rgba(224,176,74,0.5)' }}>
                  <Phone className="w-4 h-4" /> Call Us
                </a>
              )}
              {waDigits && (
                <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" onClick={trackWhatsApp}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-amber-50" style={{ border: '1px solid rgba(224,176,74,0.5)' }}>
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              )}
            </div>
          </div>
          {/* Map link card (static, no embed/key) */}
          <a href={MAPS_SEARCH_URL} target="_blank" rel="noreferrer" onClick={trackDirections}
            className="group relative rounded-2xl overflow-hidden min-h-[220px] flex items-center justify-center" style={{ border: '1px solid rgba(224,176,74,0.4)', background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
            <div className="text-center text-amber-50">
              <MapPin className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--lux-gold-soft)' }} />
              <div className="font-luxury text-xl">Find us on Google Maps</div>
              <div className="text-xs text-amber-50/70 mt-1">Purani Bazar · Near Durga Mata Mandir</div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold mt-3" style={{ color: 'var(--lux-gold-soft)' }}>Open map <ArrowRight className="w-3.5 h-3.5" /></span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// SECTION 9 — Best Sellers.
// ============================================================
export function BestSellers({ products = [], onNavigate, onAdd }) {
  if (!products.length) return null;
  const items = products.slice(0, 6);
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
      <div className="relative">
        <SectionHeading title="BEST SELLERS" subtitle="Our most loved sarees, chosen by women like you." />
        <div className="hidden sm:block absolute right-0 top-0"><ViewAll onClick={() => onNavigate('products')} /></div>
      </div>
      <ProductRow products={items} onNavigate={onNavigate} onAdd={onAdd} badgeFor={() => 'Bestseller'} />
      <div className="sm:hidden mt-6 text-center"><ViewAll onClick={() => onNavigate('products')} /></div>
    </section>
  );
}
