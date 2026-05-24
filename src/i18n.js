// i18next bootstrap for the Redlook storefront.
//
// Three locales supported: 'en' (English, default), 'hi' (Hindi), 'bn' (Bengali).
// Resources are bundled — small enough that lazy-loading would just add a
// network round-trip on first render. The customer's choice persists in
// localStorage under `redlook.lang`, and is also synced to Customer.language
// in the backend when they're logged in (see auth flows in pages.jsx).
//
// fallbackLng: 'en' means a missing key in hi.json / bn.json silently falls
// back to the English string rather than rendering the raw key.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi',   native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
];

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      bn: { translation: bn },
    },
    fallbackLng: 'en',
    supportedLngs: LANGUAGE_CODES,
    nonExplicitSupportedLngs: false, // 'en-US' should map to 'en'
    load: 'languageOnly',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'redlook.lang',
      caches: ['localStorage'],
    },
    returnEmptyString: false, // empty translation → fallback to English
  });

// Keep <html lang="…"> in sync so screen readers, Chrome auto-translate, and
// CSS :lang() selectors behave correctly.
const applyHtmlLang = (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
};
applyHtmlLang(i18n.language);
i18n.on('languageChanged', applyHtmlLang);

export default i18n;
