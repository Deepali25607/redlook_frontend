// Locale-aware currency + date formatters. Wraps Intl.* APIs and reads the
// active locale from the i18next instance so call sites don't have to thread
// the locale through every prop. Replaces the inline en-IN-locked helpers
// that used to live at pages.jsx:14–17.
//
// All three locales render currency as ₹120.00 (Indian numbering) — only the
// surrounding decimal/group separators and numeral script differ per locale.

import i18n from '../i18n';

// Map our short locale codes to BCP-47 tags Intl understands.
const intlLocale = (lng) => {
  switch (lng) {
    case 'hi': return 'hi-IN';
    case 'bn': return 'bn-IN';
    case 'en':
    default:   return 'en-IN';
  }
};

const currentLocale = () => intlLocale(i18n.language);

// ₹120.00 — INR symbol stays consistent across locales; only numerals/digits
// change per locale (Hindi / Bengali script). NumberFormat doesn't fall back
// to ASCII digits in hi-IN by default — that's intentional.
export const formatCurrency = (n) => new Intl.NumberFormat(currentLocale(), {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(n) || 0);

// Same options as the legacy formatDate at pages.jsx — keep the look
// consistent across the app.
export const formatDate = (iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(currentLocale(), opts);
};

export const formatDateTime = (iso, opts = {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
}) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(currentLocale(), opts);
};

// Plain integer with locale-appropriate grouping — used for review counts,
// loyalty points, etc.
export const formatNumber = (n) => new Intl.NumberFormat(currentLocale()).format(Number(n) || 0);
