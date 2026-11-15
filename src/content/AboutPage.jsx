import { ArrowRight, Sparkles, Heart, IndianRupee, Gem, Store, Phone } from 'lucide-react';
import { useSeo, useJsonLd } from '../seo/useSeo';
import { breadcrumbLd } from '../seo/jsonld';
import { BUSINESS, SITE_URL } from '../seo/seoConfig';

const TIMELINE = [
  { year: '1986', title: 'The first shop', body: 'Jawaharlal Prasad starts the business from a 10×10 sq. ft. shop, selling wool.' },
  { year: '1988', title: 'JP Cloth Store', body: 'The store becomes a readymade fashion store and is named JP Cloth Store.' },
  { year: '1991', title: 'Sarees, suits & lehengas', body: 'The range expands into sarees, suits and lehengas, building a strong local reputation.' },
  { year: '2008', title: 'A new generation', body: 'Rahul Gupta, youngest son of Jawaharlal Prasad, joins the family business at 14.' },
  { year: '2010', title: 'Redlook Women’s Wear', body: 'Rahul launches Redlook — a dedicated destination for women’s fashion.' },
  { year: '2027', title: 'Going online', body: 'The planned launch of our online retail platform — bringing Redlook to your screen.' },
];

const VALUES = [
  { icon: Gem, title: 'Quality First', body: 'We focus on providing quality products that meet customer expectations.' },
  { icon: Heart, title: 'Customer Happiness', body: 'Our customers are the foundation of our journey.' },
  { icon: IndianRupee, title: 'Fair Pricing', body: 'We aim to deliver quality and value at competitive prices.' },
  { icon: Sparkles, title: 'Continuous Innovation', body: 'We continuously adapt to changing fashion and customer preferences.' },
];

function Story({ eyebrow, title, children }) {
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {eyebrow && <div className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-gold)' }}>{eyebrow}</div>}
      <h2 className="font-luxury text-2xl sm:text-3xl mb-4" style={{ color: 'var(--lux-maroon-deep)' }}>{title}</h2>
      <div className="space-y-3 text-stone-700 dark:text-slate-300 leading-relaxed text-[15px]">{children}</div>
    </section>
  );
}

export function AboutPage({ onNavigate }) {
  useSeo({
    title: 'About Redlook Women’s Wear | Our Journey Since 1986',
    description: 'Discover the story of Redlook Women’s Wear and JP Cloth Store, a family business built on trust since 1986 in Sahatwar, Ballia, Uttar Pradesh.',
    canonicalPath: '/about-us',
  });
  useJsonLd([
    breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'About Us', path: '/about-us' }]),
    {
      '@context': 'https://schema.org', '@type': 'Organization',
      name: BUSINESS.name, alternateName: BUSINESS.alternateName, url: `${SITE_URL}/about-us`,
      foundingDate: '1986', founder: { '@type': 'Person', name: 'Jawaharlal Prasad' },
      parentOrganization: { '@type': 'Organization', name: BUSINESS.parentOrganization },
    },
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="rl-maroon-stage relative overflow-hidden">
        <div className="relative max-w-4xl mx-auto px-6 py-20 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--lux-gold-soft)' }}>
            <Gem className="w-3.5 h-3.5" /> Our Story <Gem className="w-3.5 h-3.5" />
          </div>
          <h1 className="font-luxury text-3xl sm:text-5xl font-semibold text-amber-50 leading-tight">
            A Legacy of Trust, Fashion &amp; Family Values <span className="font-luxury-italic" style={{ color: '#f0d79a' }}>Since 1986</span>
          </h1>
          <p className="mt-5 text-sm sm:text-base text-amber-50/80 max-w-2xl mx-auto leading-relaxed">
            From a small 10×10 sq. ft. shop to a growing fashion destination, our journey has always been driven by quality, customer happiness and trust.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <button onClick={() => onNavigate('products')} className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm" style={{ color: '#4a0f1a', background: 'linear-gradient(135deg,#f5e8c7,#e0b04a)' }}>
              Explore Our Collection <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => onNavigate('contact')} className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm text-amber-50" style={{ border: '1px solid rgba(224,176,74,0.5)' }}>
              <Phone className="w-4 h-4" /> Contact Us
            </button>
          </div>
        </div>
      </section>

      {/* Story sections */}
      <Story eyebrow="1986" title="Our Journey Began With a Small Dream">
        <p>The story of JP Cloth Store began in 1986 when our founder, Jawaharlal Prasad, started his business from a small 10×10 sq. ft. shop by selling wool.</p>
        <p>With dedication, hard work and a commitment to serving customers, the business gradually evolved. In 1988 the store transformed into a readymade fashion store and was given the name <strong>JP Cloth Store</strong>.</p>
        <p>After three years, we expanded our product range by introducing sarees, suits and lehengas. This expansion helped us establish a strong reputation in our town — earning the trust, love and recognition of customers through our commitment to quality, pricing and personal relationships.</p>
      </Story>

      <Story eyebrow="2008" title="A New Generation. A New Vision. A Stronger Future.">
        <p>In 2008, Rahul Gupta, the youngest son of Jawaharlal Prasad, joined the family business at the age of 14. He brought a fresh perspective and a vision to transform the traditional retail business according to changing customer expectations and fashion trends.</p>
        <p className="font-luxury-italic text-lg" style={{ color: 'var(--lux-maroon)' }}>“Make customers happy with our products, not just with our words.”</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 list-disc pl-5 marker:text-amber-500">
          <li>Modernizing the shopping experience</li>
          <li>Introducing new fashion trends and collections</li>
          <li>Offering quality products at competitive prices</li>
          <li>Recruiting young and energetic employees</li>
          <li>Building a customer-friendly shopping environment</li>
          <li>Treating every customer with respect and warmth</li>
        </ul>
      </Story>

      <Story eyebrow="2010" title="Redlook Women’s Wear — Fashion With Trust">
        <p>In 2010, Rahul Gupta started a new venture under the name <strong>Redlook Women’s Wear</strong> — a dedicated destination for women’s fashion, offering beautiful collections of sarees, lehengas, suits and other textile products.</p>
        <p>While fashion trends continue to change, our commitment remains the same: providing quality products, fair pricing and a welcoming shopping experience. Even today, Rahul actively works to understand changing fashion trends and bring relevant collections to customers in our town of Sahatwar.</p>
      </Story>

      {/* Timeline */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="font-luxury text-2xl sm:text-3xl text-center mb-10" style={{ color: 'var(--lux-maroon-deep)' }}>Four Decades of Our Story</h2>
        <ol className="relative border-l-2 ml-3 sm:ml-6" style={{ borderColor: 'rgba(200,155,60,0.5)' }}>
          {TIMELINE.map((t, i) => (
            <li key={i} className="mb-8 ml-6">
              <span className="absolute -left-[11px] w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)', boxShadow: '0 0 0 3px rgba(224,176,74,0.35)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--lux-gold-soft)' }} />
              </span>
              <div className="font-luxury text-xl" style={{ color: 'var(--lux-gold)' }}>{t.year}</div>
              <div className="font-semibold text-stone-900 dark:text-slate-100">{t.title}</div>
              <p className="text-sm text-stone-600 dark:text-slate-400 mt-0.5">{t.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Business today */}
      <Story eyebrow="Today" title="Tradition Meets Modern Fashion">
        <p>Today, Redlook Women’s Wear represents the continuation of a family business that began in 1986. We continue to focus on:</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 list-disc pl-5 marker:text-amber-500">
          <li><strong>Sarees</strong> — traditional and contemporary collections</li>
          <li><strong>Lehengas</strong> — beautiful collections for special occasions</li>
          <li><strong>Suits</strong> — elegant designs for everyday and festive wear</li>
          <li><strong>Shirting &amp; Suiting</strong> — quality fabrics and textile collections</li>
          <li><strong>Other textile products</strong> — selected to meet customer needs</li>
        </ul>
        <p>Our aim is to offer quality, variety and value while maintaining the personal connection that has defined our business for decades.</p>
      </Story>

      {/* Digital transformation */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="rl-maroon-stage relative rounded-3xl overflow-hidden px-6 sm:px-10 py-12 text-center">
          <div className="relative">
            <div className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-gold-soft)' }}>The next chapter · 2027</div>
            <h2 className="font-luxury text-2xl sm:text-3xl text-amber-50">From Our Store to Your Screen</h2>
            <p className="mt-4 text-sm text-amber-50/85 max-w-2xl mx-auto leading-relaxed">
              Many customers can’t easily reach our physical store in Sahatwar because of distance, time or other commitments. With that in mind, we’re building a modern online retail platform where customers can explore our collections from wherever they are — targeting launch in 2027.
            </p>
            <p className="mt-5 font-luxury-italic text-base sm:text-lg" style={{ color: '#f0d79a' }}>
              “Four decades of trust built the foundation. Your love inspires our future. We are taking the next step to bring Redlook closer to you.”
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <button onClick={() => onNavigate('products')} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm" style={{ color: '#4a0f1a', background: 'linear-gradient(135deg,#f5e8c7,#e0b04a)' }}>Explore Redlook <ArrowRight className="w-4 h-4" /></button>
              <button onClick={() => onNavigate('contact')} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm text-amber-50" style={{ border: '1px solid rgba(224,176,74,0.5)' }}>Stay Connected</button>
            </div>
          </div>
        </div>
      </section>

      {/* Core values */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="font-luxury text-2xl sm:text-3xl text-center mb-10" style={{ color: 'var(--lux-maroon-deep)' }}>Our Core Values</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {VALUES.map((v, i) => (
            <div key={i} className="text-center p-5 rounded-2xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="inline-flex w-12 h-12 rounded-full items-center justify-center mb-3" style={{ background: 'rgba(200,155,60,0.12)' }}>
                <v.icon className="w-6 h-6" style={{ color: 'var(--lux-gold)' }} />
              </span>
              <div className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>{v.title}</div>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <button onClick={() => onNavigate('contact')} className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold text-sm" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
            <Store className="w-4 h-4" /> Visit or Contact Us
          </button>
        </div>
      </section>
    </div>
  );
}
