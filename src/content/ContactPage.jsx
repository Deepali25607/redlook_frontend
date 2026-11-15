import { useState } from 'react';
import {
  MapPin, Phone, MessageCircle, Mail, Navigation, Store, Send,
  Building2, Clock, Gem, ChevronDown, CheckCircle2, Loader2,
} from 'lucide-react';
import { api } from '../api';
import { useToast, useSettings } from '../contexts';
import { useSeo, useJsonLd } from '../seo/useSeo';
import { breadcrumbLd } from '../seo/jsonld';
import { BUSINESS, MAPS_DIRECTIONS_URL, MAPS_SEARCH_URL, isRealPhone, isRealEmail } from '../seo/seoConfig';
import { trackContact, trackWhatsApp, trackDirections } from '../seo/analytics';

const ENQUIRY_TYPES = ['Saree Collection', 'Lehenga Collection', 'Suit Collection', 'Shirting & Suiting', 'General Enquiry'];
const WA_MESSAGE = 'Hello Redlook Women’s Wear, I would like to enquire about your collection.';
const MAP_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(`${BUSINESS.name}, ${BUSINESS.addressLine}`)}&output=embed`;

const FAQS = [
  { q: 'Where is Redlook Women’s Wear located?', a: 'We are at Purani Bazar, Near Durga Mata Mandir, Sahatwar, District Ballia, Uttar Pradesh – 277211, India.' },
  { q: 'What products are available at Redlook?', a: 'Sarees, lehengas, suits, shirting & suiting fabrics, and other textile products — traditional and contemporary.' },
  { q: 'Is Redlook a family-owned business?', a: 'Yes. Redlook Women’s Wear is part of JP Cloth Store, a family business run by Rahul Gupta.' },
  { q: 'When was JP Cloth Store established?', a: 'The family business began in 1986; it was named JP Cloth Store in 1988. Redlook Women’s Wear was established in 2010.' },
  { q: 'Can customers enquire about collections online?', a: 'Yes — use the enquiry form on this page, or call/WhatsApp us, and our team will help you.' },
  { q: 'When is the online retail platform expected to launch?', a: 'We are targeting the launch of our online retail platform in 2027.' },
];

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 flex items-start gap-3">
      <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0" style={{ background: 'rgba(200,155,60,0.12)' }}>
        <Icon className="w-5 h-5" style={{ color: 'var(--lux-gold)' }} />
      </span>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
        <div className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>{value}</div>
      </div>
    </div>
  );
}

export function ContactPage({ onNavigate }) {
  const toast = useToast();
  const settings = useSettings();
  const phone = isRealPhone(settings?.support_phone) ? settings.support_phone : BUSINESS.telephone;
  const wa = isRealPhone(settings?.support_whatsapp) ? settings.support_whatsapp : BUSINESS.whatsapp;
  const waDigits = wa ? wa.replace(/\D/g, '') : '';
  const email = isRealEmail(settings?.support_email) ? settings.support_email : null;

  const [form, setForm] = useState({ name: '', mobile: '', email: '', enquiry_type: 'General Enquiry', message: '', company: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useSeo({
    title: 'Contact Redlook Women’s Wear | Sahatwar, Ballia',
    description: 'Visit Redlook Women’s Wear at Purani Bazar, Near Durga Mata Mandir, Sahatwar, Ballia, Uttar Pradesh 277211. Contact us for sarees, lehengas and suits.',
    canonicalPath: '/contact-us',
  });
  useJsonLd([
    breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Contact Us', path: '/contact-us' }]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ]);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (form.name.trim().length < 2) { toast.push('Please enter your name.', 'error'); return; }
    if (!/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, '').slice(-10))) { toast.push('Please enter a valid 10-digit Indian mobile number.', 'error'); return; }
    if (form.message.trim().length < 5) { toast.push('Please enter your message.', 'error'); return; }
    setSubmitting(true);
    try {
      await api.submitContact(form);
      setDone(true);
      setForm({ name: '', mobile: '', email: '', enquiry_type: 'General Enquiry', message: '', company: '' });
      toast.push('Thank you! Your enquiry has been sent.', 'success');
    } catch (err) {
      toast.push(err.message || 'Could not send your enquiry. Please WhatsApp or call us instead.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400';

  return (
    <div>
      {/* Hero */}
      <section className="rl-maroon-stage relative overflow-hidden">
        <div className="relative max-w-3xl mx-auto px-6 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--lux-gold-soft)' }}>
            <Gem className="w-3.5 h-3.5" /> Get in touch <Gem className="w-3.5 h-3.5" />
          </div>
          <h1 className="font-luxury text-3xl sm:text-4xl font-semibold text-amber-50">We Would Love to Hear From You!</h1>
          <p className="mt-4 text-sm sm:text-base text-amber-50/80 max-w-xl mx-auto">
            Have a question about our collections or planning to visit our store? Get in touch with Redlook Women’s Wear.
          </p>
        </div>
      </section>

      {/* Business info */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoCard icon={Store} label="Business Name" value="Redlook Women’s Wear" />
          <InfoCard icon={Building2} label="Parent Company" value="JP Cloth Store" />
          <InfoCard icon={Gem} label="Business Type" value="Retail Textile & Women’s Wear" />
          <InfoCard icon={Clock} label="Established" value="2010 (Redlook Women’s Wear)" />
          <InfoCard icon={Clock} label="Family Legacy" value="Since 1986" />
          <InfoCard icon={MapPin} label="Location" value="Sahatwar, Ballia, U.P." />
        </div>
      </section>

      {/* Address + contact cards + map */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: address + contact actions */}
          <div className="space-y-5">
            <div>
              <h2 className="font-luxury text-2xl mb-3" style={{ color: 'var(--lux-maroon-deep)' }}>Visit Our Store</h2>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--lux-gold)' }} />
                <address className="not-italic text-sm text-stone-700 dark:text-slate-300 leading-relaxed">
                  <strong>Redlook Women’s Wear</strong><br />
                  By JP Cloth Store<br />
                  Purani Bazar, Near Durga Mata Mandir<br />
                  Sahatwar, District Ballia<br />
                  Uttar Pradesh – 277211, India
                </address>
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={trackDirections}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-white" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
                  <Navigation className="w-4 h-4" /> Get Directions
                </a>
                <a href={MAPS_SEARCH_URL} target="_blank" rel="noreferrer" onClick={trackDirections}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm" style={{ border: '1.5px solid var(--lux-gold)', color: 'var(--lux-maroon)' }}>
                  Open in Google Maps
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {phone && (
                <a href={`tel:${phone.replace(/\s+/g, '')}`} onClick={trackContact} className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:-translate-y-0.5 transition">
                  <Phone className="w-5 h-5 mb-1.5" style={{ color: 'var(--lux-gold)' }} />
                  <div className="text-xs text-stone-500">Call Us</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--lux-maroon-deep)' }}>{phone}</div>
                </a>
              )}
              {waDigits && (
                <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(WA_MESSAGE)}`} target="_blank" rel="noreferrer" onClick={trackWhatsApp} className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:-translate-y-0.5 transition">
                  <MessageCircle className="w-5 h-5 mb-1.5" style={{ color: '#1f7a53' }} />
                  <div className="text-xs text-stone-500">WhatsApp Us</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--lux-maroon-deep)' }}>Chat with us</div>
                </a>
              )}
              {email ? (
                <a href={`mailto:${email}`} onClick={trackContact} className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:-translate-y-0.5 transition">
                  <Mail className="w-5 h-5 mb-1.5" style={{ color: 'var(--lux-gold)' }} />
                  <div className="text-xs text-stone-500">Email Us</div>
                  <div className="text-sm font-semibold break-all" style={{ color: 'var(--lux-maroon-deep)' }}>{email}</div>
                </a>
              ) : (
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-slate-900/40 border border-dashed border-stone-200 dark:border-slate-700">
                  <Mail className="w-5 h-5 mb-1.5 text-stone-400" />
                  <div className="text-xs text-stone-500">Email Us</div>
                  <div className="text-sm font-semibold text-stone-400">Coming soon</div>
                </div>
              )}
              <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noreferrer" onClick={trackDirections} className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 hover:-translate-y-0.5 transition">
                <Store className="w-5 h-5 mb-1.5" style={{ color: 'var(--lux-gold)' }} />
                <div className="text-xs text-stone-500">Visit Our Store</div>
                <div className="text-sm font-semibold" style={{ color: 'var(--lux-maroon-deep)' }}>Purani Bazar, Sahatwar</div>
              </a>
            </div>
          </div>

          {/* Right: map embed */}
          <div className="rounded-2xl overflow-hidden border border-stone-200 dark:border-slate-700 min-h-[320px]">
            <iframe title="Redlook Women’s Wear location" src={MAP_EMBED} loading="lazy"
              className="w-full h-full min-h-[320px]" style={{ border: 0 }} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
      </section>

      {/* Enquiry form */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="font-luxury text-2xl sm:text-3xl text-center mb-2" style={{ color: 'var(--lux-maroon-deep)' }}>Send Us an Enquiry</h2>
        <p className="text-center text-sm text-stone-500 mb-6">We’ll get back to you about our collections. You can also WhatsApp us anytime.</p>
        {done ? (
          <div className="text-center bg-emerald-50 border border-emerald-200 rounded-2xl p-8">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-600" />
            <div className="font-semibold text-emerald-900">Thank you — your enquiry has been sent.</div>
            <p className="text-sm text-emerald-800/80 mt-1">Our team will reach out soon. For anything urgent, please call or WhatsApp us.</p>
            <button onClick={() => setDone(false)} className="mt-4 text-sm font-semibold" style={{ color: 'var(--lux-maroon)' }}>Send another enquiry</button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 space-y-4">
            {/* Honeypot (hidden from users; bots fill it) */}
            <input type="text" name="company" value={form.company} onChange={set('company')} tabIndex="-1" autoComplete="off" className="hidden" aria-hidden="true" />
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-stone-700 dark:text-slate-200 mb-1">Full Name <span className="text-rose-500">*</span></span>
                <input className={inputCls} value={form.name} onChange={set('name')} required placeholder="Your name" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-stone-700 dark:text-slate-200 mb-1">Mobile Number <span className="text-rose-500">*</span></span>
                <input className={inputCls} value={form.mobile} onChange={set('mobile')} required inputMode="numeric" placeholder="10-digit mobile" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-stone-700 dark:text-slate-200 mb-1">Email <span className="text-stone-400 font-normal">(optional)</span></span>
                <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-stone-700 dark:text-slate-200 mb-1">Enquiry Type</span>
                <select className={inputCls} value={form.enquiry_type} onChange={set('enquiry_type')}>
                  {ENQUIRY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-stone-700 dark:text-slate-200 mb-1">Message <span className="text-rose-500">*</span></span>
              <textarea className={inputCls} rows={4} value={form.message} onChange={set('message')} required placeholder="How can we help you?" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-white font-semibold text-sm disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {submitting ? 'Sending…' : 'Submit Enquiry'}
              </button>
              {waDigits && (
                <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(WA_MESSAGE)}`} target="_blank" rel="noreferrer" onClick={trackWhatsApp}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm" style={{ border: '1.5px solid #1f7a53', color: '#1f7a53' }}>
                  <MessageCircle className="w-4 h-4" /> Or chat on WhatsApp
                </a>
              )}
            </div>
          </form>
        )}
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h2 className="font-luxury text-2xl sm:text-3xl text-center mb-8" style={{ color: 'var(--lux-maroon-deep)' }}>Frequently Asked Questions</h2>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <div key={i} className="rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>{f.q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} style={{ color: 'var(--lux-gold)' }} />
              </button>
              {openFaq === i && <div className="px-4 pb-4 text-sm text-stone-600 dark:text-slate-300 leading-relaxed">{f.a}</div>}
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <button onClick={() => onNavigate('about')} className="text-sm font-semibold" style={{ color: 'var(--lux-maroon)' }}>Read our story →</button>
        </div>
      </section>
    </div>
  );
}
