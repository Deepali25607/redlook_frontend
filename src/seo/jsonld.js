// JSON-LD builders (schema.org) using REAL data only. Organization / WebSite /
// ClothingStore live statically in index.html (site-wide); these runtime
// builders produce Product + BreadcrumbList for deep pages, plus an optional
// ClothingStore enriched with a real phone/email from admin Settings for the
// local landing pages. No invented geo/hours/ratings.

import { SITE_URL, BUSINESS } from './seoConfig';

const postalAddress = () => ({
  '@type': 'PostalAddress',
  streetAddress: BUSINESS.street,
  addressLocality: BUSINESS.locality,
  addressRegion: BUSINESS.region,
  postalCode: BUSINESS.postalCode,
  addressCountry: BUSINESS.country,
});

export function clothingStoreLd({ telephone, email } = {}) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    name: BUSINESS.name,
    parentOrganization: { '@type': 'Organization', name: BUSINESS.parentOrganization },
    url: SITE_URL,
    address: postalAddress(),
    areaServed: ['Sahatwar', 'Ballia', 'Uttar Pradesh'],
  };
  if (telephone) node.telephone = telephone;
  if (email) node.email = email;
  return node;
}

export function productLd(product, { imageUrl, canonicalUrl, inStock }) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.id,
    url: canonicalUrl,
    brand: { '@type': 'Brand', name: BUSINESS.name },
  };
  if (product.description) node.description = product.description;
  if (imageUrl) node.image = imageUrl;
  if (product.category) node.category = product.category;
  if (product.price != null) {
    node.offers = {
      '@type': 'Offer',
      price: Number(product.price).toFixed(2),
      priceCurrency: 'INR',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonicalUrl,
    };
  }
  return node;
}

// items: [{ name, path }]  (path relative to SITE_URL; last item is the current page)
export function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
