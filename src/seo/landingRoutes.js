// Local SEO landing pages — genuine, product-backed pages for high-intent local
// searches. Plain data (no React) so the router, App, and the LandingPage
// component can all share it. Each page filters the REAL catalog by `match`
// (category-name/keyword contains); empty match = whole catalog.

export const LANDING_PAGES = [
  {
    name: 'lp-saree',
    path: '/saree-shop-sahatwar-ballia',
    h1: 'Saree Shop in Sahatwar, Ballia',
    metaTitle: 'Saree Shop in Sahatwar, Ballia | Redlook',
    metaDescription: 'Redlook is a trusted saree shop in Sahatwar, Ballia — Banarasi, wedding, party wear and traditional sarees. Visit us at Purani Bazar, near Durga Mata Mandir.',
    intro: 'Looking for a saree shop in Sahatwar or Ballia? Redlook, from JP Cloth Store, offers a handpicked saree collection — Banarasi, wedding, party wear and everyday drapes — at Purani Bazar, near Durga Mata Mandir.',
    match: ['saree'],
    bullets: ['Banarasi & silk sarees', 'Wedding & bridal sarees', 'Party wear sarees', 'Traditional & daily-wear sarees'],
  },
  {
    name: 'lp-lehenga',
    path: '/lehenga-collection-ballia',
    h1: 'Lehenga Collection in Ballia',
    metaTitle: 'Lehenga Shop & Collection in Ballia | Redlook',
    metaDescription: 'Explore Redlook’s lehenga collection in Ballia — bridal, wedding-occasion and party wear lehengas. Visit our store in Sahatwar, Purani Bazar.',
    intro: 'Discover Redlook’s lehenga collection in Ballia — bridal lehengas, wedding-occasion ensembles and party wear, selected for the region’s celebrations.',
    match: ['lehenga'],
    bullets: ['Bridal lehengas', 'Wedding-occasion lehengas', 'Party wear lehengas'],
  },
  {
    name: 'lp-suit',
    path: '/suit-material-shop-ballia',
    h1: 'Suit Material Shop in Ballia',
    metaTitle: 'Suit Material Shop in Ballia | Ladies Suit Materials | Redlook',
    metaDescription: 'Redlook offers ladies suit materials and dress materials in Ballia — designer, cotton and traditional suit materials. Visit our Sahatwar store.',
    intro: 'Redlook stocks a wide range of ladies suit materials and dress materials in Ballia — designer, cotton and traditional options for every occasion.',
    match: ['suit', 'dress material'],
    bullets: ['Ladies suit materials', 'Designer suit materials', 'Cotton suit materials', 'Dress materials'],
  },
  {
    name: 'lp-textile',
    path: '/textile-fabric-shop-sahatwar',
    h1: 'Textile & Fabric Shop in Sahatwar, Ballia',
    metaTitle: 'Textile & Fabric Shop in Sahatwar, Ballia | Redlook',
    metaDescription: 'Redlook (JP Cloth Store) is a textile and fabric shop in Sahatwar, Ballia — sarees, lehengas, suit materials, shirting and suiting fabrics.',
    intro: 'Redlook, a textile and fabric shop in Sahatwar from JP Cloth Store, brings together sarees, lehengas, suit materials and premium shirting & suiting fabrics under one roof at Purani Bazar.',
    match: [],
    bullets: ['Sarees & lehengas', 'Suit & dress materials', 'Shirting & suiting fabrics', 'Premium textile collections'],
  },
  {
    name: 'lp-shirting',
    path: '/shirting-suiting-fabric-ballia',
    h1: 'Shirting & Suiting Fabric Collection in Ballia',
    metaTitle: 'Premium Shirting & Suiting Fabric in Ballia | Redlook',
    metaDescription: 'Shop premium shirting and suiting fabrics in Ballia at Redlook — formal-wear fabrics and men’s fabric collections. Visit our Sahatwar store.',
    intro: 'Redlook offers premium shirting and suiting fabrics in Ballia — formal-wear fabrics and men’s fabric collections, selected for quality and finish.',
    match: ['shirt', 'suiting', 'fabric'],
    bullets: ['Premium shirting fabrics', 'Suiting fabrics', 'Formal-wear fabrics', 'Men’s fabric collections'],
  },
];
