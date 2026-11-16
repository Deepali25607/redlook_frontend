import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin, Navigation, Phone, MessageCircle, ArrowRight, ChevronRight, ChevronDown,
  Store, Clock, Gem, Heart, IndianRupee, Sparkles, CheckCircle2,
} from 'lucide-react';
import { api } from '../api';
import { ProductCard } from '../components';
import { useCart, useToast, useSuggestions, useSettings } from '../contexts';
import { useSeo, useJsonLd } from './useSeo';
import { breadcrumbLd } from './jsonld';
import { BUSINESS, MAPS_DIRECTIONS_URL, MAPS_SEARCH_URL, isRealPhone } from './seoConfig';
import { track, trackAddToCart } from './analytics';

export { LANDING_PAGES } from './landingRoutes';

const WHY = [
  { icon: Clock, title: 'Legacy since 1986', body: 'A family business — JP Cloth Store since 1986, Redlook Women’s Wear since 2010.' },
  { icon: Gem, title: 'Quality & fair pricing', body: 'We focus on quality products at competitive prices.' },
  { icon: Heart, title: 'Personal service', body: 'Friendly, personal in-store help to find the right look.' },
  { icon: Store, title: 'Convenient store', body: 'Easy to visit in Purani Bazar, Sahatwar, Ballia.' },
];
const WA_TEXT = 'Hello Redlook Women’s Wear, I would like to enquire about your collection.';

// Reusable high-intent local SEO landing page. Driven by a config from
// landingRoutes.js. Shows REAL products (filtered from the live catalog) + unique
// per-page content; shared store info / why-choose / CTA. Fires analytics events.
export function LandingPage({ config, onNavigate }) {
  const { t } = useTranslation();
  const { addItem } = useCart();
  const { triggerSuggestions } = useSuggestions();
  const toast = useToast();
  const settings = useSettings();
  const [products, setProducts] = useState([]);
  const [openFaq, setOpenFaq] = useState(0);
  const galleryFired = useRef(false);

  const phone = isRealPhone(settings?.support_phone) ? settings.support_phone : BUSINESS.telephone;
  const wa = isRealPhone(settings?.support_whatsapp) ? settings.support_whatsapp : BUSINESS.whatsapp;
  const waDigits = wa ? wa.replace(/\D/g, '') : '';
  const waHref = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(WA_TEXT)}` : null;

  useEffect(() => { api.getProducts().then((r) => setProducts(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { track('landing_page_view', { page: config.path }); }, [config.path]);

  useSeo({ title: config.metaTitle, description: config.metaDescription, canonicalPath: config.path });
  useJsonLd([
    breadcrumbLd([{ name: 'Home', path: '/' }, { name: config.h1, path: config.path }]),
    config.faqs?.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: config.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : null,
  ].filter(Boolean));

  const match = config.match || [];
  const matched = products.filter((p) => {
    if (!match.length) return true;
    const hay = `${p.name} ${p.category}`.toLowerCase();
    return match.some((m) => hay.includes(m.toLowerCase()));
  });
  const shown = (matched.length ? matched : products).slice(0, 8);
  if (shown.length && !galleryFired.current) { galleryFired.current = true; track('collection_gallery_view', { page: config.path, count: shown.length }); }

  const onAdd = (p) => { addItem(p); trackAddToCart(p); toast.push(t('products.addedToCart', { name: p.name })); triggerSuggestions(p); };

  const ctaBtns = (dark) => (
    <div className="flex flex-wrap gap-3">
      <button onClick={() => onNavigate('products')} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm" style={{ color: '#4a0f1a', background: 'linear-gradient(135deg,#f5e8c7,#e0b04a)' }}>
        Explore Collection <ArrowRight className="w-4 h-4" />
      </button>
      {waHref && (
        <a href={waHref} target="_blank" rel="noreferrer" onClick={() => track('click_whatsapp', { page: config.path })}
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm ${dark ? 'text-amber-50' : ''}`}
          style={dark ? { border: '1px solid rgba(224,176,74,0.5)' } : { border: '1.5px solid #1f7a53', color: '#1f7a53' }}>
          <MessageCircle className="w-4 h-4" /> WhatsApp Enquiry
        </a>
      )}
      <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={() => track('click_directions', { page: config.path })}
        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm ${dark ? 'text-amber-50' : ''}`}
        style={dark ? { border: '1px solid rgba(224,176,74,0.5)' } : { border: '1.5px solid var(--lux-gold)', color: 'var(--lux-maroon)' }}>
        <Navigation className="w-4 h-4" /> Visit Our Store
      </a>
    </div>
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 text-sm text-stone-500 flex items-center gap-2">
        <button onClick={() => onNavigate('home')} className="hover:text-amber-700">Home</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-stone-900 font-medium truncate">{config.h1}</span>
      </div>

      {/* A. Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="rl-maroon-stage relative rounded-3xl overflow-hidden px-6 sm:px-10 py-12">
          <div className="relative max-w-3xl">
            <h1 className="font-luxury text-3xl sm:text-4xl font-semibold text-amber-50 leading-tight">{config.h1}</h1>
            <p className="mt-3 text-sm sm:text-base text-amber-50/85 leading-relaxed">{config.intro}</p>
            {config.bullets?.length > 0 && (
              <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {config.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-amber-50/90"><CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--lux-gold-soft)' }} /> {b}</li>
                ))}
              </ul>
            )}
            <div className="mt-6">{ctaBtns(true)}</div>
          </div>
        </div>
      </section>

      {/* B. Collection gallery (real products) */}
      {shown.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
          <h2 className="font-luxury text-2xl mb-5" style={{ color: 'var(--lux-maroon-deep)' }}>From Our Collection</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {shown.map((p) => <ProductCard key={p.id} product={p} onClick={() => onNavigate('product', { id: p.id })} onAdd={onAdd} />)}
          </div>
        </section>
      )}

      {/* C. Why choose Redlook */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h2 className="font-luxury text-2xl sm:text-3xl text-center mb-8" style={{ color: 'var(--lux-maroon-deep)' }}>Why Choose Redlook?</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {WHY.map((w, i) => (
            <div key={i} className="text-center p-4 rounded-2xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700">
              <span className="inline-flex w-11 h-11 rounded-full items-center justify-center mb-2" style={{ background: 'rgba(200,155,60,0.12)' }}>
                <w.icon className="w-5 h-5" style={{ color: 'var(--lux-gold)' }} />
              </span>
              <div className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>{w.title}</div>
              <p className="text-xs text-stone-500 mt-1">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* D. Collection information (unique content) */}
      {config.collection?.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="space-y-3 text-stone-700 dark:text-slate-300 leading-relaxed text-[15px]">
            {config.collection.map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </section>
      )}

      {/* E. Local store info + map */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6">
            <h2 className="font-luxury text-2xl mb-3" style={{ color: 'var(--lux-maroon-deep)' }}>Visit Our Store</h2>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--lux-gold)' }} />
              <address className="not-italic text-sm text-stone-700 dark:text-slate-300 leading-relaxed">
                <strong>Redlook Women’s Wear</strong><br />By JP Cloth Store<br />
                Purani Bazar, Near Durga Mata Mandir<br />Sahatwar, District Ballia<br />Uttar Pradesh – 277211, India
              </address>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={() => track('click_directions', { page: config.path })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
                <Navigation className="w-4 h-4" /> Get Directions
              </a>
              {phone && (
                <a href={`tel:${phone.replace(/\s+/g, '')}`} onClick={() => track('click_call', { page: config.path })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold" style={{ border: '1.5px solid var(--lux-gold)', color: 'var(--lux-maroon)' }}>
                  <Phone className="w-4 h-4" /> Call Us
                </a>
              )}
              <button onClick={() => { track('click_contact', { page: config.path }); onNavigate('contact'); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold" style={{ border: '1.5px solid var(--lux-gold)', color: 'var(--lux-maroon)' }}>
                Contact Us
              </button>
            </div>
          </div>
          <a href={MAPS_SEARCH_URL} target="_blank" rel="noreferrer" onClick={() => track('click_directions', { page: config.path })}
            className="rounded-2xl overflow-hidden border border-stone-200 dark:border-slate-700 min-h-[220px] flex items-center justify-center group" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
            <div className="text-center text-amber-50">
              <MapPin className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--lux-gold-soft)' }} />
              <div className="font-luxury text-xl">Find us on Google Maps</div>
              <div className="text-xs text-amber-50/70 mt-1">Purani Bazar · Near Durga Mata Mandir</div>
            </div>
          </a>
        </div>
      </section>

      {/* F. FAQ */}
      {config.faqs?.length > 0 && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <h2 className="font-luxury text-2xl sm:text-3xl text-center mb-6" style={{ color: 'var(--lux-maroon-deep)' }}>Frequently Asked Questions</h2>
          <div className="space-y-3">
            {config.faqs.map((f, i) => (
              <div key={i} className="rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                  <span className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>{f.q}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} style={{ color: 'var(--lux-gold)' }} />
                </button>
                {openFaq === i && <div className="px-4 pb-4 text-sm text-stone-600 dark:text-slate-300 leading-relaxed">{f.a}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* G. Final conversion */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="rl-maroon-stage relative rounded-3xl overflow-hidden px-6 sm:px-10 py-10 text-center">
          <div className="relative">
            <h2 className="font-luxury text-2xl sm:text-3xl text-amber-50 flex items-center justify-center gap-2"><Sparkles className="w-5 h-5" style={{ color: 'var(--lux-gold-soft)' }} /> Looking for Your Perfect Collection?</h2>
            <p className="mt-3 text-sm text-amber-50/85 max-w-xl mx-auto">Visit Redlook Women’s Wear in Sahatwar and explore our clothing and textile collections.</p>
            <div className="mt-6 flex justify-center">{ctaBtns(true)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
