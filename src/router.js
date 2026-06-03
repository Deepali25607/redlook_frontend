// URL <-> route mapping for Redlook's state-based router.
//
// The app uses a single `route` state object ({ name, params }). This module
// translates between that shape and a real browser URL so refreshes preserve
// location and back/forward buttons work.
//
// Each entry: [routeName, pathPattern, pathParamKeys, queryParamKeys].
// pathPattern uses :foo for path params; queryParamKeys round-trip through ?foo=…
//
// Order matters when patterns overlap: register the more specific path first.
// e.g. '/admin/login' must be registered before '/admin' would have mattered,
// though the regex anchors ($) keep them disjoint regardless. Same for
// '/orders' vs '/orders/:orderId'.

const ROUTES = [
  ['home',                '/',                              [],            []],
  ['products',            '/products',                      [],            ['category', 'q']],
  ['product',             '/products/:id',                  ['id'],        []],
  ['cart',                '/cart',                          [],            []],
  ['login',               '/login',                         [],            []],
  ['register',            '/register',                      [],            []],
  ['verify-otp',          '/verify-otp',                    [],            ['customerId', 'phone']],
  ['forgot-password',     '/forgot-password',               [],            []],
  ['reset-otp',           '/reset-otp',                     [],            ['customer_id', 'channel', 'masked_to', 'dev_otp']],
  ['reset-password',      '/reset-password',                [],            ['token']],
  ['profile',             '/account/profile',               [],            []],
  ['addresses',           '/account/addresses',             [],            []],
  ['checkout',            '/checkout',                      [],            []],
  ['order-confirmation',  '/order-confirmation/:orderId',   ['orderId'],   []],
  ['orders',              '/orders',                        [],            []],
  // Tracking is registered last among /orders/* patterns so a literal /orders
  // matches the list page instead of being treated as orderId='' (the regex
  // requires at least one char, but listing /orders first is still clearer).
  ['order-tracking',      '/orders/:orderId',               ['orderId'],   []],
  ['credit',              '/account/credit',                [],            []],
  ['wishlist',            '/wishlist',                      [],            []],

  // Admin portal
  ['admin-login',         '/admin/login',                   [],            []],
  ['admin-dashboard',     '/admin',                         [],            []],
  ['admin-users',         '/admin/users',                   [],            []],
  ['admin-me',            '/admin/profile',                 [],            []],
  ['admin-orders',        '/admin/orders',                  [],            []],
  ['admin-products',      '/admin/products',                [],            []],
  ['admin-categories',    '/admin/categories',              [],            []],
  ['admin-coupons',       '/admin/coupons',                 [],            []],
  ['admin-customers',     '/admin/customers',               [],            []],
  ['admin-reports',       '/admin/reports',                 [],            []],
  ['admin-accounting',    '/admin/accounting',              [],            []],
  ['admin-reviews',       '/admin/reviews',                 [],            []],
  // `section` round-trips the active sub-tile (branding / orders / delivery /
  // … / category_promotions / translations) so a browser refresh keeps the
  // admin on the same Settings sub-page instead of bouncing to the tile grid.
  ['admin-settings',      '/admin/settings',                [],            ['section']],
];

const compiled = ROUTES.map(([name, pattern, pathParams, queryParams]) => {
  const re = new RegExp('^' + pattern.replace(/:[a-zA-Z_]+/g, '([^/]+)') + '$');
  return { name, pattern, pathParams, queryParams, re };
});

export function pathToRoute(pathname, search) {
  // Normalize trailing slash so /cart and /cart/ both match.
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const queryParams = new URLSearchParams(search || '');

  for (const r of compiled) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.pathParams.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    r.queryParams.forEach((k) => { if (queryParams.has(k)) params[k] = queryParams.get(k); });
    return { name: r.name, params: Object.keys(params).length ? params : null };
  }
  return { name: 'not-found', params: null };
}

export function routeToPath(name, params) {
  const r = compiled.find((c) => c.name === name);
  if (!r) return '/';
  let path = r.pattern;
  if (params) {
    for (const k of r.pathParams) {
      if (params[k] != null) path = path.replace(':' + k, encodeURIComponent(params[k]));
    }
    const q = [];
    for (const k of r.queryParams) {
      if (params[k] != null && params[k] !== '') q.push(`${k}=${encodeURIComponent(params[k])}`);
    }
    if (q.length) path += '?' + q.join('&');
  }
  return path;
}
