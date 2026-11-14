import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { resolveImageUrl } from '../api';

// ============================================================
// HERO SLIDER — premium maroon fashion banner (homepage section 3).
// Left-aligned serif copy over a decorative maroon stage, a model/image
// panel on the right, prev/next controls, autoplay, and dot indicators.
//
// `slides`: [{ eyebrow, title, titleItalic, subtitle, ctaLabel, ctaRoute,
//              ctaParams, image }]. `image` may be null → a branded panel
// renders instead (no external/stock URLs are ever baked in). Imagery is
// sourced upstream from admin-managed/existing assets (see HomePage).
// ============================================================
export function HeroSlider({ slides = [], onNavigate }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const reduceMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  const go = useCallback((n) => setIndex((i) => (count ? (n + count) % count : 0)), [count]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Autoplay (6s), paused on hover/focus and under reduced-motion.
  useEffect(() => {
    if (count <= 1 || paused || reduceMotion.current) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(id);
  }, [count, paused]);

  if (!count) return null;

  return (
    <section
      className="rl-maroon-stage relative overflow-hidden"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative max-w-7xl mx-auto px-6 sm:px-10">
        {slides.map((s, i) => {
          const img = resolveImageUrl(s.image, 1100);
          const active = i === index;
          return (
            <div
              key={i}
              className={`rl-slide ${active ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none'}`}
              aria-hidden={!active}
            >
              <div className="grid md:grid-cols-2 gap-8 items-center min-h-[460px] md:min-h-[540px] py-12 md:py-0">
                {/* Copy */}
                <div className="order-2 md:order-1 text-center md:text-left">
                  {s.eyebrow && (
                    <span className="inline-block text-[11px] sm:text-xs font-semibold tracking-[0.3em] uppercase mb-4"
                      style={{ color: 'var(--lux-gold-soft)' }}>
                      {s.eyebrow}
                    </span>
                  )}
                  {(i === 0) ? (
                    <h1 className="font-luxury text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] text-amber-50">
                      {s.title}
                      {s.titleItalic && (
                        <span className="block font-luxury-italic font-medium" style={{ color: '#f0d79a' }}>{s.titleItalic}</span>
                      )}
                    </h1>
                  ) : (
                    <div className="font-luxury text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] text-amber-50">
                      {s.title}
                      {s.titleItalic && (
                        <span className="block font-luxury-italic font-medium" style={{ color: '#f0d79a' }}>{s.titleItalic}</span>
                      )}
                    </div>
                  )}
                  {s.subtitle && (
                    <p className="mt-5 text-sm sm:text-base text-amber-50/80 leading-relaxed max-w-md mx-auto md:mx-0">
                      {s.subtitle}
                    </p>
                  )}
                  <button
                    onClick={() => onNavigate(s.ctaRoute || 'products', s.ctaParams || null)}
                    className="mt-8 inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold text-sm tracking-wide transition"
                    style={{ border: '1.5px solid var(--lux-gold)', color: '#4a0f1a', background: 'linear-gradient(135deg, #f5e8c7 0%, #e0b04a 100%)' }}
                  >
                    {s.ctaLabel || 'Shop the Collection'} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Image panel */}
                <div className="order-1 md:order-2 relative">
                  <div className="relative mx-auto w-full max-w-md md:max-w-none aspect-[4/5] md:aspect-[5/6] rounded-2xl overflow-hidden"
                    style={{ boxShadow: '0 20px 50px -20px rgba(0,0,0,0.55)', border: '1px solid rgba(224,176,74,0.35)' }}>
                    {img ? (
                      <img
                        src={img}
                        alt={s.title || 'Featured collection'}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading={i === 0 ? 'eager' : 'lazy'}
                        fetchPriority={i === 0 ? 'high' : 'auto'}
                        decoding="async"
                      />
                    ) : (
                      // Branded fallback — no stock URL. Decorative only.
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'radial-gradient(circle at 50% 35%, rgba(224,176,74,0.35), transparent 60%), linear-gradient(135deg, #7a1f2a, #4a0f1a)' }}>
                        <span className="font-luxury-italic text-3xl" style={{ color: '#f0d79a' }}>Redlook</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      {count > 1 && (
        <>
          <button onClick={prev} aria-label="Previous slide"
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur transition"
            style={{ background: 'rgba(253,248,239,0.14)', border: '1px solid rgba(224,176,74,0.4)', color: '#f7ecd8' }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={next} aria-label="Next slide"
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur transition"
            style={{ background: 'rgba(253,248,239,0.14)', border: '1px solid rgba(224,176,74,0.4)', color: '#f7ecd8' }}>
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {slides.map((_, i) => (
              <button key={i} aria-label={`Go to slide ${i + 1}`}
                className={`rl-dot ${i === index ? 'is-active' : ''}`} onClick={() => go(i)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
