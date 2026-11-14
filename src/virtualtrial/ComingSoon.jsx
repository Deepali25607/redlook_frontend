import { Camera, Shirt, Sparkles, CheckCircle2, Gem } from 'lucide-react';

// Shown on /virtual-trial when the admin has turned the Virtual Trial Room OFF
// (BusinessSettings.virtual_trial.enabled = false). Premium, on-brand, honest.
export function ComingSoon({ onNavigate }) {
  const steps = [
    { icon: Camera, label: 'Use Your Webcam' },
    { icon: Shirt, label: 'Select a Saree' },
    { icon: Sparkles, label: 'See Real-Time Look' },
    { icon: CheckCircle2, label: 'Shop with Confidence' },
  ];
  return (
    <div>
      <section className="rl-maroon-stage relative overflow-hidden">
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--lux-gold-soft)' }}>
            <Gem className="w-3.5 h-3.5" /> Virtual Trial Room <Gem className="w-3.5 h-3.5" />
          </div>
          <h1 className="font-luxury text-4xl sm:text-5xl font-semibold text-amber-50">Try Before You Buy</h1>
          <p className="mt-4 text-amber-50/80 max-w-xl mx-auto">
            Our AI-powered Virtual Trial Room lets you see how a saree looks on you in real time. It&rsquo;ll be live here very soon.
          </p>
          <span className="inline-block mt-6 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide"
            style={{ background: 'rgba(224,176,74,0.16)', border: '1px solid rgba(224,176,74,0.45)', color: '#f0d79a' }}>
            Coming Soon
          </span>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div key={i} className="text-center p-5 rounded-2xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700">
              <span className="inline-flex w-12 h-12 rounded-full items-center justify-center mb-3" style={{ background: 'rgba(200,155,60,0.12)' }}>
                <s.icon className="w-6 h-6" style={{ color: 'var(--lux-gold)' }} />
              </span>
              <div className="font-semibold text-sm" style={{ color: 'var(--lux-maroon-deep)' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <button onClick={() => onNavigate('products')}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #7a1f2a, #4a0f1a)' }}>
            Browse the Collection
          </button>
        </div>
      </section>
    </div>
  );
}
