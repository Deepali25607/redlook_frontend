import { useEffect } from 'react';
import { SITE_URL, DEFAULT_OG_IMAGE } from './seoConfig';

// Imperative <head> management for the SPA. Googlebot renders JS and reads
// these; the static index.html baseline covers non-JS crawlers for the
// homepage + brand/local schema. Tags are updated in place (not removed) so
// navigation overwrites them cleanly.

function upsertMeta(attr, key, content) {
  if (content == null || content === '') return;
  let el = document.head.querySelector(`meta[${attr}="${CSS.escape(key)}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el); }
  el.setAttribute('href', href);
}

export function useSeo({ title, description, canonicalPath, image, robots, type = 'website' } = {}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) upsertMeta('name', 'description', description);
    const url = canonicalPath
      ? `${SITE_URL}${canonicalPath}`
      : (typeof window !== 'undefined' ? SITE_URL + window.location.pathname + window.location.search : SITE_URL);
    upsertCanonical(url);
    upsertMeta('name', 'robots', robots || 'index,follow');
    const img = image || DEFAULT_OG_IMAGE;
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:site_name', 'Redlook');
    upsertMeta('property', 'og:image', img);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', img);
  }, [title, description, canonicalPath, image, robots, type]);
}

// Inject one or more JSON-LD blocks for the current route; removed on unmount so
// routes never accumulate duplicate/conflicting structured data.
export function useJsonLd(data) {
  const serialized = data ? JSON.stringify(data) : '';
  useEffect(() => {
    if (!serialized) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-route', '1');
    script.text = serialized;
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [serialized]);
}
