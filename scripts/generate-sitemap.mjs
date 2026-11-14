// Build-time sitemap generator. Fetches the live catalog and writes
// public/sitemap.xml (core routes + landing pages + categories + products).
// Runs as the `prebuild` npm hook. Fully graceful: if the catalog fetch fails
// (backend down, offline), it writes the core routes only so a build NEVER
// breaks. Point SITEMAP_API_BASE at the production API if the default changes.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDING_PAGES } from '../src/seo/landingRoutes.js';

const SITE = 'https://redlookstw.com';
const API = process.env.SITEMAP_API_BASE || 'https://redlook-backend.onrender.com/api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'sitemap.xml');

const CORE = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/products', changefreq: 'daily', priority: '0.9' },
  { loc: '/virtual-trial', changefreq: 'monthly', priority: '0.6' },
  ...LANDING_PAGES.map((c) => ({ loc: c.path, changefreq: 'weekly', priority: '0.8' })),
];

const tag = (loc, changefreq, priority) =>
  `  <url><loc>${SITE}${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

async function fetchJson(url) {
  // 12s cap so a cold/slow backend can't stall the build.
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function main() {
  const urls = CORE.map((c) => tag(c.loc, c.changefreq, c.priority));
  try {
    const [cats, prods] = await Promise.all([
      fetchJson(`${API}/categories`).then((d) => d.data || []),
      fetchJson(`${API}/products`).then((d) => d.data || []),
    ]);
    for (const c of cats) urls.push(tag(`/products?category=${encodeURIComponent(c.id)}`, 'weekly', '0.7'));
    for (const p of prods) urls.push(tag(`/products/${encodeURIComponent(p.id)}`, 'weekly', '0.6'));
    console.log(`[sitemap] ${cats.length} categories, ${prods.length} products from ${API}`);
  } catch (e) {
    console.warn(`[sitemap] live catalog unavailable (${e.message}) — writing core routes only.`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  await fs.writeFile(OUT, xml, 'utf8');
  console.log(`[sitemap] wrote ${OUT} (${urls.length} URLs)`);
}

main().catch((e) => { console.warn('[sitemap] skipped:', e.message); });
