// Central SEO configuration for Redlook. Business facts here are REAL
// (user-provided) — the shop's name, parent company, and street address. We do
// NOT invent phone numbers, coordinates, hours, or ratings; contact details
// flow in from admin Settings at runtime and render only when real.

export const SITE_URL = 'https://redlookstw.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon.svg`;

export const BUSINESS = {
  name: 'Redlook',
  // Verified Google Business Profile lists the store as "Redlook Women's Wear";
  // kept as an alternateName so the site's NAP bridges to the Maps listing.
  alternateName: "Redlook Women's Wear",
  legalName: 'Redlook',
  parentOrganization: 'JP Cloth Store',
  // Real, user-provided public contact. Used as the authoritative fallback when
  // admin Settings still holds the seeded placeholder.
  telephone: '+91 9804522315',
  whatsapp: '+91 9804522315',
  // Full postal address (authorized business info).
  street: 'Purani Bazar, Near Durga Mata Mandir',
  locality: 'Sahatwar',
  region: 'Uttar Pradesh',
  district: 'Ballia',
  postalCode: '277211',
  country: 'IN',
  // Human-readable one-line address for display + Maps.
  addressLine: 'Near Durga Mata Mandir, Purani Bazar, Sahatwar, Ballia, Uttar Pradesh – 277211',
};

// Address-query Maps links (NO invented coordinates — Google resolves the text).
export const MAPS_SEARCH_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${BUSINESS.name}, ${BUSINESS.addressLine}`,
)}`;
export const MAPS_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  `${BUSINESS.name}, ${BUSINESS.addressLine}`,
)}`;

// The stored support contacts are seeded with obvious placeholders; never
// publish those. A value is "real" only if it isn't the placeholder and has
// enough non-zero digits to be a usable phone number.
export function isRealPhone(value) {
  if (!value || typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return false;
  // Reject the seeded placeholder "+91 80000 00000" and all-same-digit numbers.
  const body = digits.slice(-10);
  if (/^(\d)\1{9}$/.test(body)) return false;
  if (digits.endsWith('8000000000')) return false;
  return true;
}
export function isRealEmail(value) {
  return typeof value === 'string' && /.+@.+\..+/.test(value) && !/\.example$/i.test(value) && !value.endsWith('@redlook.example');
}

// Per-surface title/description presets (the brief's approved local copy).
// `t()` builds a full <title> with the brand suffix.
const SUFFIX = 'Redlook – Sahatwar, Ballia';
export const title = (s) => (s ? `${s} | ${SUFFIX}` : 'Redlook – Saree, Lehenga & Suit Shop in Sahatwar, Ballia');

export const SEO = {
  home: {
    title: 'Redlook – Saree, Lehenga & Suit Shop in Sahatwar, Ballia',
    description:
      'Explore beautiful sarees, lehengas, suit materials, shirting and suiting fabrics at Redlook, Purani Bazar, Sahatwar, Ballia, Uttar Pradesh. Discover our textile collection.',
    keywords:
      'saree shop in Sahatwar, saree shop in Ballia, lehenga shop in Ballia, suit material Ballia, textile shop Sahatwar, fabric shop Ballia, साड़ी की दुकान सहतवार, बलिया में साड़ी की दुकान',
  },
  shop: {
    title: title('Shop Sarees, Lehengas & Fabrics'),
    description:
      'Browse Redlook’s textile collection — sarees, lehengas, suit materials, shirting and suiting fabrics — in Sahatwar, Ballia, Uttar Pradesh.',
  },
  virtualTrial: {
    title: title('Virtual Trial Room'),
    description:
      'Try sarees and suits on yourself with Redlook’s Virtual Trial Room, then visit our store in Purani Bazar, Sahatwar, Ballia.',
  },
};
