import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, CartProvider, WishlistProvider, ToastProvider, SettingsProvider, ThemeProvider, SuggestionsProvider } from './contexts';
import { Navbar, Footer, SupportWidget, AppDownloadBanner, PullToRefresh, FrequentlyBoughtModal } from './components';
import {
  HomePage, ProductListPage, ProductDetailsPage, CartPage,
  LoginPage, RegisterPage, OtpVerifyPage, ForgotPasswordPage, ResetOtpPage, ResetPasswordPage,
  ProfilePage, AddressesPage, CheckoutPage, OrderConfirmationPage,
  OrdersPage, OrderTrackingPage, WishlistPage, MyCreditPage, NotFoundPage,
} from './pages';
import { pathToRoute, routeToPath } from './router';

// Admin portal is code-split: React.lazy defers loading the ~8.7k-line admin
// bundle until an /admin route is actually visited, keeping it out of the
// storefront's initial download. See AdminPortal.jsx.
const AdminPortal = lazy(() => import('./AdminPortal'));

const ROUTES = {
  'home': HomePage,
  'products': ProductListPage,
  'product': ProductDetailsPage,
  'cart': CartPage,
  'login': LoginPage,
  'register': RegisterPage,
  'verify-otp': OtpVerifyPage,
  'forgot-password': ForgotPasswordPage,
  'reset-otp': ResetOtpPage,
  'reset-password': ResetPasswordPage,
  'profile': ProfilePage,
  'addresses': AddressesPage,
  'checkout': CheckoutPage,
  'order-confirmation': OrderConfirmationPage,
  'orders': OrdersPage,
  'order-tracking': OrderTrackingPage,
  'credit': MyCreditPage,
  'wishlist': WishlistPage,
};

const isAdminRoute = (name) => name?.startsWith('admin-');

// Initial route is read from the actual browser URL so refreshes land back on
// whatever page the customer was on. Legacy `?admin=1` on the root path still
// drops admins on the portal login (kept so existing bookmarks don't break).
function readInitialRoute() {
  if (typeof window === 'undefined') return { name: 'home', params: null };
  const search = new URLSearchParams(window.location.search);
  if (search.get('admin') === '1' && window.location.pathname === '/') {
    return { name: 'admin-login', params: null };
  }
  return pathToRoute(window.location.pathname, window.location.search);
}

export default function App() {
  const [route, setRoute] = useState(readInitialRoute);

  // Browser back/forward changes the URL without us calling navigate(). Keep
  // the React state in sync by listening for popstate.
  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Android hardware back button. With no listener registered, Capacitor's
  // default is to close the app on the very first back press. Instead we walk
  // the in-app history (driven by the pushState/popstate routing above) and
  // only exit the app when the user is already on the home screen. Guarded to
  // native so the web build is unaffected (browsers handle back natively).
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    let handle;
    import('@capacitor/app').then(({ App: CapacitorApp }) => {
      handle = CapacitorApp.addListener('backButton', () => {
        if (window.location.pathname !== '/') {
          window.history.back();
        } else {
          CapacitorApp.exitApp();
        }
      });
    });
    return () => { handle?.then?.((h) => h.remove()); };
  }, []);

  const navigate = (name, params = null) => {
    const path = routeToPath(name, params);
    const current = window.location.pathname + window.location.search;
    if (path !== current) {
      // pushState updates the URL bar without a server round-trip; refresh now
      // hits the same path and Vite/the SPA host serves index.html so we
      // re-hydrate at the same route.
      window.history.pushState({ name, params }, '', path);
    }
    setRoute({ name, params });
    window.scrollTo(0, 0);
  };

  // Admin chrome: no customer Navbar/Footer/Cart/Wishlist providers — admins
  // shouldn't even pay the cost of hydrating those.
  if (isAdminRoute(route.name)) {
    return (
      <ToastProvider>
        <ThemeProvider>
          {/* Blank full-height fallback while the admin chunk streams in —
              avoids a spinner flash and keeps the dark theme background. */}
          <Suspense fallback={<div className="min-h-screen" />}>
            <AdminPortal route={route} navigate={navigate} />
          </Suspense>
        </ThemeProvider>
      </ToastProvider>
    );
  }

  const PageComponent = ROUTES[route.name] || NotFoundPage;

  return (
    <ToastProvider>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
               <SuggestionsProvider>
                {/* Background colour now comes from the active theme on <html>
                    (see index.css). The wrapper just lets the gradient show
                    through and provides the column flex layout.

                    `min-h-screen` lives on <main> (not the wrapper) so that
                    short pages — or pages still in their loading state — keep
                    the footer just below the viewport instead of pinning it
                    to the bottom edge. Otherwise, every navigation between
                    pages with different heights makes the footer briefly
                    slide up/down for a frame, which reads as a "shake". */}
                <div className="font-sans flex flex-col text-stone-900 dark:text-slate-100">
                  <PullToRefresh />
                  <Navbar currentPage={route.name} onNavigate={navigate} />
                  <main className="flex-1 min-h-screen">
                    <PageComponent params={route.params} onNavigate={navigate} />
                  </main>
                  <Footer onNavigate={navigate} />
                  <SupportWidget />
                  <AppDownloadBanner />
                  <FrequentlyBoughtModal onNavigate={navigate} />
                </div>
               </SuggestionsProvider>
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
