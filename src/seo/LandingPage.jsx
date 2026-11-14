import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Navigation, Check, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { ProductCard } from '../components';
import { useCart, useToast, useSuggestions } from '../contexts';
import { useSeo, useJsonLd } from './useSeo';
import { breadcrumbLd } from './jsonld';
import { BUSINESS, MAPS_DIRECTIONS_URL } from './seoConfig';
import { trackAddToCart, trackDirections } from './analytics';

export { LANDING_PAGES } from './landingRoutes';

// Reusable local-SEO landing page. Driven by a config from landingRoutes.js;
// shows a grid of REAL products (filtered from the live catalog) so the page
// carries genuine value, plus local copy, address, directions, and its own
// metadata + breadcrumb structured data.
export function LandingPage({ config, onNavigate }) {
  const { t } = useTranslation();
  const { addItem } = useCart();
  const { triggerSuggestions } = useSuggestions();
  const toast = useToast();
  const [products, setProducts] = useState([]);

  useEffect(() => { api.getProducts().then((r) => setProducts(r.data || [])).catch(() => {}); }, []);

  useSeo({ title: config.metaTitle, description: config.metaDescription, canonicalPath: config.path });
  useJsonLd(breadcrumbLd([{ name: 'Home', path: '/' }, { name: config.h1, path: config.path }]));

  const match = config.match || [];
  const matched = products.filter((p) => {
    if (!match.length) return true;
    const hay = `${p.name} ${p.category}`.toLowerCase();
    return match.some((m) => hay.includes(m.toLowerCase()));
  });
  const shown = (matched.length ? matched : products).slice(0, 12);

  const onAdd = (p) => { addItem(p); trackAddToCart(p); toast.push(t('products.addedToCart', { name: p.name })); triggerSuggestions(p); };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 text-sm text-stone-500 flex items-center gap-2">
        <button onClick={() => onNavigate('home')} className="hover:text-amber-700">Home</button>
        <ArrowRight className="w-3 h-3" />
        <span className="text-stone-900 font-medium">{config.h1}</span>
      </div>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="rl-maroon-stage relative rounded-3xl overflow-hidden px-6 sm:px-10 py-10">
          <div className="relative max-w-3xl">
            <h1 className="font-luxury text-3xl sm:text-4xl text-amber-50">{config.h1}</h1>
            <p className="mt-3 text-sm sm:text-base text-amber-50/85 leading-relaxed">{config.intro}</p>
            {config.bullets?.length > 0 && (
              <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {config.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-amber-50/90">
                    <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--lux-gold-soft)' }} /> {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => onNavigate('products')} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm" style={{ color: '#4a0f1a', background: 'linear-gradient(135deg,#f5e8c7,#e0b04a)' }}>
                Browse the Collection <ArrowRight className="w-4 h-4" />
              </button>
              <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={trackDirections}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm text-amber-50" style={{ border: '1px solid rgba(224,176,74,0.5)' }}>
                <Navigation className="w-4 h-4" /> Get Directions
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Real products */}
      {shown.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
          <h2 className="font-luxury text-2xl mb-5" style={{ color: 'var(--lux-maroon-deep)' }}>Featured at Redlook</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} onClick={() => onNavigate('product', { id: p.id })} onAdd={onAdd} />
            ))}
          </div>
        </section>
      )}

      {/* Visit block */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
        <div className="rl-benefits rounded-2xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-6 h-6 shrink-0 mt-0.5" style={{ color: 'var(--lux-gold)' }} />
            <div>
              <div className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>Visit {BUSINESS.name} — {BUSINESS.parentOrganization}</div>
              <address className="not-italic text-xs text-stone-600">{BUSINESS.addressLine}</address>
            </div>
          </div>
          <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={trackDirections}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-semibold text-sm" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
            <Navigation className="w-4 h-4" /> Get Directions
          </a>
        </div>
      </section>
    </div>
  );
}
