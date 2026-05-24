// Decorative motion layer for the saree/lehenga storefront hero.
// Pure presentation — no props, no state, no fetches — so it can be
// dropped inside any positioned container as the first child and
// only paints behind content (pointer-events: none on every layer).
//
// All animation is CSS-driven (see index.css §LUXURY STOREFRONT).
// `prefers-reduced-motion: reduce` is honoured automatically: the
// shimmer streak + floating particles freeze, the layered gradients
// stay (they're decorative but not animated).
//
// IMPORTANT: only used by the customer-facing HomePage hero. The
// admin shell never imports this — the rebrand contract is that
// /admin keeps its existing system-sans, no-decoration look.

import React from 'react';

// Six floating gold particles. Hand-tuned positions/sizes/timings
// so the eye never picks out a pattern, but the silhouette stays
// balanced left/right.
const PARTICLES = [
  { x: '12%', size: 8,  duration: 14, delay: 0,   drift:  20, opacity: 0.75 },
  { x: '28%', size: 5,  duration: 18, delay: 3,   drift: -16, opacity: 0.55 },
  { x: '44%', size: 7,  duration: 12, delay: 6,   drift:  28, opacity: 0.70 },
  { x: '62%', size: 4,  duration: 16, delay: 1,   drift: -22, opacity: 0.50 },
  { x: '78%', size: 9,  duration: 13, delay: 4,   drift:  18, opacity: 0.80 },
  { x: '90%', size: 5,  duration: 17, delay: 7,   drift: -14, opacity: 0.60 },
];

export function LuxuryBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Layer 1: silk-shimmer diagonal streak. */}
      <div className="luxury-shimmer" aria-hidden="true" />

      {/* Layer 2: six floating gold particles. Each gets its own
          animation params via custom properties so a single class
          handles all of them without per-dot keyframes. */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="luxury-particle"
          aria-hidden="true"
          style={{
            '--lp-x':        p.x,
            '--lp-size':     `${p.size}px`,
            '--lp-duration': `${p.duration}s`,
            '--lp-delay':    `${p.delay}s`,
            '--lp-drift':    `${p.drift}px`,
            '--lp-opacity':  p.opacity,
          }}
        />
      ))}

      {/* Layer 3: subtle bottom-edge gold mist so the hero sells
          into the next section without a hard line. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-32"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(224,176,74,0.10) 60%, rgba(253,248,239,0.30) 100%)',
        }}
      />
    </div>
  );
}

export default LuxuryBackground;
