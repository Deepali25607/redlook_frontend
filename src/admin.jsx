// Admin portal — slice 2.5 of Phase 4. All admin pages, layout, and auth
// context live in this single module to keep the flat src/ layout the rest
// of the app uses. Routes from App.jsx are dispatched here when the route
// name starts with 'admin-'.
//
// Visual design intentionally diverges from the customer storefront — slate
// chrome instead of emerald — so the user can never confuse which "side"
// of the app they're operating in.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Users, User, Package, LogOut, Leaf, Menu, X,
  UserPlus, Edit2, Key, UserX, Shield, ChevronLeft,
  Tag, AlertTriangle, AlertCircle, PackageX, CheckCircle2, Plus, Trash2,
  Ticket, Power, UserCheck, ShoppingBag, MapPin, Mail, Phone, IndianRupee,
  BarChart3, TrendingUp, CreditCard, Star, MessageSquare, Settings, Save,
  FileSpreadsheet, FileText, Loader2, ImagePlus, ClipboardList,
  Building2, Truck, Headphones, Palette, ClipboardCheck, BadgeCheck,
  RotateCcw, Clock, Zap, Megaphone, Heading, AlignLeft, Image as ImageIcon,
  Sparkles, Globe, Camera,
} from 'lucide-react';
import { adminApi, ADMIN_AUTH_KEY, api } from './api';
import { Field, TextInput, SelectInput, ProductImage } from './components';
import {
  useToast, useTheme, useSettings, THEMES, CANCEL_CUTOFF_OPTIONS,
  DEFAULT_PRODUCT_DETAIL_BADGES, DEFAULT_HOME_HERO_FEATURES,
} from './contexts';
import { resolveImageUrl } from './api';

// ============================================================
// AUTH CONTEXT — admin-specific, isolated from customer AuthContext
// ============================================================
const AdminAuthContext = createContext(null);
export const useAdminAuth = () => useContext(AdminAuthContext);

// Authorization helper used throughout the portal. Backend returns
// AdminUser.permissions as a string[] of tile keys; an admin "has" a
// permission if it appears anywhere in their set. Variadic so call sites
// can ask "any of these tiles" in a single check.
//   hasPermission(admin, 'orders')
//   hasPermission(admin, 'products', 'categories')
const hasPermission = (admin, ...allowed) => {
  const held = admin?.permissions;
  if (!Array.isArray(held)) return false;
  return held.some((p) => allowed.includes(p));
};

// Mirror of backend middleware/adminAuth.js: an empty/missing array means
// the admin is unrestricted (returns null). A populated array is the
// category_id whitelist for the Products + Categories tiles.
const getCategoryScope = (admin) => {
  const scope = admin?.category_scope;
  if (!Array.isArray(scope) || scope.length === 0) return null;
  return scope;
};

const isCategoryInScope = (admin, categoryId) => {
  const scope = getCategoryScope(admin);
  if (scope === null) return true;
  return scope.includes(categoryId);
};

// Permission catalog — one entry per dashboard tile a SuperAdmin can grant.
// Mirrors ADMIN_PERMISSIONS in backend middleware/adminAuth.js. The order
// here is the order shown in the create/edit form. `nav` is what appears
// in the sidebar / dashboard tile; `hint` is the short description shown
// next to the checkbox so a non-technical SuperAdmin can pick the right
// tiles without guessing.
export const PERMISSION_DEFINITIONS = [
  { id: 'orders',          nav: 'Orders',           hint: 'View orders and update status (Confirmed, Packed, Out for Delivery, Delivered, Cancelled).' },
  { id: 'products',        nav: 'Products',         hint: 'Add / edit / disable products and adjust stock.' },
  { id: 'categories',      nav: 'Categories',       hint: 'Add / edit / delete vegetable categories.' },
  { id: 'coupons',         nav: 'Coupons',          hint: 'Create discount codes and toggle their active state.' },
  { id: 'customers',       nav: 'Customers',        hint: 'View customer profiles, addresses, order history; suspend accounts.' },
  { id: 'reviews',         nav: 'Reviews',          hint: 'Read product reviews and remove inappropriate ones.' },
  { id: 'reports',         nav: 'Reports',          hint: 'Main reports dashboard: sales, inventory, customers, revenue.' },
  // The four report-family tiles each have their own permission so they
  // can be granted independently. Anyone migrating from before the
  // 20260518100000_split_reports_permission migration already holds all
  // four if they previously had `reports`.
  { id: 'accounting',      nav: 'Accounting',       hint: 'Credit outstanding, ageing, payment trends (BRD §6).' },
  { id: 'customer-report', nav: 'Customer Report',  hint: 'Per-customer sales, quantity, outstanding, credit-limit view with Excel/PDF download.' },
  { id: 'b2b-customers',   nav: 'My B2B Customers', hint: 'B2B-only customer extract filtered by business name + GSTIN, with date-scoped orders count.' },
  { id: 'settings',        nav: 'Settings',         hint: 'Update minimum order value, delivery charges, support contacts.' },
  { id: 'admin-users',     nav: 'Admin Users',      hint: 'Create / edit / disable admin accounts. Also gates customer password reset. Treat as the most privileged tile.' },
];

// Quick lookup by id for badge labels and the like.
const PERMISSION_LABEL = Object.fromEntries(PERMISSION_DEFINITIONS.map((p) => [p.id, p.nav]));

// Route name → permission required to render that page. Pages mapped to null
// are always reachable (Dashboard and My Profile). Used both for dashboard
// tile filtering and for the AdminApp render gate so a user can never land
// on a page their permissions don't allow — even via direct URL.
const PAGE_PERMISSION_MAP = {
  'admin-dashboard': null,
  'admin-me':        null,
  'admin-orders':     'orders',
  'admin-products':   'products',
  'admin-categories': 'categories',
  'admin-coupons':    'coupons',
  'admin-customers':  'customers',
  'admin-reviews':    'reviews',
  'admin-reports':    'reports',
  'admin-accounting': 'accounting',
  'admin-customer-report': 'customer-report',
  'admin-b2b-customers': 'b2b-customers',
  'admin-settings':   'settings',
  'admin-users':      'admin-users',
};

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // On mount: rehydrate from localStorage and verify with /me. A 401 here
  // means the token was revoked (admin disabled, password reset, logout
  // from another tab) so we silently clear it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = localStorage.getItem(ADMIN_AUTH_KEY);
      if (!stored) { setHydrated(true); return; }
      try {
        const r = await adminApi.getMe();
        if (!cancelled) setAdmin(r.data.admin);
      } catch {
        localStorage.removeItem(ADMIN_AUTH_KEY);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await adminApi.login(email, password);
    localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify({ token: r.data.token }));
    setAdmin(r.data.admin);
    return r.data.admin;
  }, []);

  const logout = useCallback(async () => {
    try { await adminApi.logout(); } catch { /* token may already be invalid; clear locally anyway */ }
    localStorage.removeItem(ADMIN_AUTH_KEY);
    setAdmin(null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await adminApi.getMe();
    setAdmin(r.data.admin);
    return r.data.admin;
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, hydrated, isAuthenticated: !!admin, login, logout, refresh, setAdmin }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

// ============================================================
// TOP-LEVEL DISPATCHER — picks which admin page to render
// ============================================================
const ADMIN_PAGES = ['admin-dashboard', 'admin-users', 'admin-me', 'admin-products', 'admin-categories', 'admin-coupons', 'admin-customers', 'admin-orders', 'admin-reports', 'admin-reviews', 'admin-accounting', 'admin-customer-report', 'admin-b2b-customers', 'admin-settings'];

export function AdminApp({ route, navigate }) {
  const auth = useAdminAuth();

  if (!auth.hydrated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated: only the login page is reachable.
  if (!auth.isAuthenticated) {
    return <AdminLoginPage navigate={navigate} />;
  }

  // Authenticated but on the login route: bounce to Dashboard, which is the
  // one page every authenticated admin can see regardless of permissions.
  if (route.name === 'admin-login') {
    setTimeout(() => navigate('admin-dashboard'), 0);
    return null;
  }

  // Render the requested admin page, default to dashboard for unknown routes.
  const pageName = ADMIN_PAGES.includes(route.name) ? route.name : 'admin-dashboard';

  // Gate the page on the admin's permissions. Pages mapped to null in
  // PAGE_PERMISSION_MAP are always allowed (Dashboard, My Profile). Anything
  // else requires the matching tile permission. We render an in-app "not
  // authorized" panel rather than letting the page mount and call the
  // backend, which would just 403 with a developer-flavored error message.
  const requiredPermission = PAGE_PERMISSION_MAP[pageName];
  const pageAllowed = requiredPermission == null || hasPermission(auth.admin, requiredPermission);

  return (
    <AdminLayout currentPage={pageName} navigate={navigate}>
      {!pageAllowed && <NoPermissionPage tile={requiredPermission} navigate={navigate} />}
      {pageAllowed && pageName === 'admin-dashboard' && <AdminDashboardPage navigate={navigate} />}
      {pageAllowed && pageName === 'admin-users' && <AdminUsersPage />}
      {pageAllowed && pageName === 'admin-products' && <AdminProductsPage />}
      {pageAllowed && pageName === 'admin-categories' && <AdminCategoriesPage />}
      {pageAllowed && pageName === 'admin-coupons' && <AdminCouponsPage />}
      {pageAllowed && pageName === 'admin-customers' && <AdminCustomersPage />}
      {pageAllowed && pageName === 'admin-orders' && <AdminOrdersPage />}
      {pageAllowed && pageName === 'admin-reports' && <AdminReportsPage />}
      {pageAllowed && pageName === 'admin-reviews' && <AdminReviewsPage />}
      {pageAllowed && pageName === 'admin-accounting' && <AdminAccountingPage />}
      {pageAllowed && pageName === 'admin-customer-report' && <AdminCustomerReportPage />}
      {pageAllowed && pageName === 'admin-b2b-customers' && <AdminB2BCustomersPage />}
      {pageAllowed && pageName === 'admin-settings' && <AdminSettingsPage route={route} navigate={navigate} />}
      {pageAllowed && pageName === 'admin-me' && <AdminMyProfilePage />}
    </AdminLayout>
  );
}

// Friendly 403 panel shown when an admin lands on a page they don't have
// the matching tile permission for. Replaces the previous experience where
// the page would mount, fire a backend request, get a raw "Requires
// permission: X / 403 Forbidden" toast, and leave the user staring at an
// empty broken screen.
function NoPermissionPage({ tile, navigate }) {
  const tileLabel = PERMISSION_LABEL[tile] || tile;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center max-w-xl mx-auto">
      <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-700 font-semibold">You don&apos;t have access to {tileLabel}</p>
      <p className="text-slate-500 text-sm mt-1">
        Ask an admin who manages admin accounts to grant you the &quot;{tileLabel}&quot; tile if you need it.
      </p>
      <button onClick={() => navigate('admin-dashboard')}
        className="mt-4 inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2 rounded-xl transition">
        Back to Dashboard
      </button>
    </div>
  );
}

// Export buttons rendered in every admin page header. Hits the unified
// /api/admin/exports/:resource endpoint which returns the FULL table for
// the resource (filters in the page do NOT narrow the export — product
// decision: "give me everything, I'll filter in Excel"). Backend gates each
// resource on the same per-tile permission as the listing endpoint, so an
// admin who can see the page can also export it.
//
// Disabled state: while one of the two buttons is mid-download we disable
// both so a double-click can't fire two big queries in parallel.
function ExportButtons({ resource, label = 'Export' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null); // 'xlsx' | 'pdf' | null

  const run = async (format) => {
    if (busy) return;
    setBusy(format);
    try {
      await adminApi.downloadExport(resource, format);
      toast.push(`${label} ${format === 'xlsx' ? 'Excel' : 'PDF'} ready`, 'success');
    } catch (err) {
      toast.push(err.message || `Could not export ${resource}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const btn = 'inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg transition';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => run('xlsx')} disabled={!!busy} className={btn}>
        {busy === 'xlsx'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
        Excel
      </button>
      <button type="button" onClick={() => run('pdf')} disabled={!!busy} className={btn}>
        {busy === 'pdf'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <FileText className="w-3.5 h-3.5 text-rose-600" />}
        PDF
      </button>
    </div>
  );
}

// ============================================================
// LAYOUT — sidebar + content. Per-permission nav (each tile shows up only
// for admins whose permission set grants that tile).
// ============================================================
function AdminLayout({ currentPage, navigate, children }) {
  const auth = useAdminAuth();
  const toast = useToast();
  const settings = useSettings();
  const companyName = settings?.company_name || 'Redlook';
  const [mobileOpen, setMobileOpen] = useState(false);

  // Each tile is gated on its matching permission. Dashboard and My Profile
  // are always visible — the dashboard itself respects permissions for the
  // tile cards inside it, and every admin can manage their own profile.
  // The `color` here mirrors DASHBOARD_TILES so the sidebar icon for each
  // route uses the same hue as that route's dashboard tile.
  const navItems = [
    { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'indigo',  show: true },
    { id: 'admin-orders', label: 'Orders', icon: ShoppingBag,           color: 'emerald', show: hasPermission(auth.admin, 'orders') },
    { id: 'admin-products', label: 'Products', icon: Package,           color: 'sky',     show: hasPermission(auth.admin, 'products') },
    { id: 'admin-categories', label: 'Categories', icon: Tag,           color: 'violet',  show: hasPermission(auth.admin, 'categories') },
    { id: 'admin-coupons', label: 'Coupons', icon: Ticket,              color: 'rose',    show: hasPermission(auth.admin, 'coupons') },
    { id: 'admin-customers', label: 'Customers', icon: UserCheck,       color: 'amber',   show: hasPermission(auth.admin, 'customers') },
    { id: 'admin-reviews', label: 'Reviews', icon: MessageSquare,       color: 'fuchsia', show: hasPermission(auth.admin, 'reviews') },
    { id: 'admin-reports', label: 'Reports', icon: BarChart3,           color: 'indigo',  show: hasPermission(auth.admin, 'reports') },
    { id: 'admin-accounting', label: 'Accounting', icon: IndianRupee,   color: 'emerald', show: hasPermission(auth.admin, 'accounting') },
    { id: 'admin-customer-report', label: 'Customer Report', icon: ClipboardList, color: 'teal', show: hasPermission(auth.admin, 'customer-report') },
    { id: 'admin-b2b-customers', label: 'My B2B Customers', icon: Building2, color: 'indigo', show: hasPermission(auth.admin, 'b2b-customers') },
    { id: 'admin-settings', label: 'Settings', icon: Settings,          color: 'teal',    show: hasPermission(auth.admin, 'settings') },
    { id: 'admin-users', label: 'Admin Users', icon: Users,             color: 'orange',  show: hasPermission(auth.admin, 'admin-users') },
    { id: 'admin-me', label: 'My Profile', icon: User,                  color: 'slate',   show: true },
  ].filter((i) => i.show);

  // Sidebar runs on a dark slate panel, so a soft 400-shade text reads
  // well without screaming. Matches the hues used by the dashboard tiles
  // for visual continuity. Hardcoded so Tailwind's JIT keeps every class.
  const NAV_ICON_COLORS = {
    indigo:  'text-indigo-400',
    emerald: 'text-emerald-400',
    sky:     'text-sky-400',
    violet:  'text-violet-400',
    rose:    'text-rose-400',
    amber:   'text-amber-400',
    fuchsia: 'text-fuchsia-400',
    teal:    'text-teal-400',
    orange:  'text-orange-400',
    slate:   'text-slate-400',
  };

  const onLogout = async () => {
    await auth.logout();
    toast.push('Signed out');
    navigate('admin-login');
  };

  const Sidebar = (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center ring-1 ring-slate-600">
            <Leaf className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">{companyName}</div>
            <div className="text-[10px] text-slate-400 tracking-widest uppercase">Admin Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
        {navItems.map((it) => {
          const active = currentPage === it.id;
          const iconColor = NAV_ICON_COLORS[it.color] || 'text-slate-400';
          return (
            <button key={it.id}
              onClick={() => { setMobileOpen(false); navigate(it.id); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 theme-hover-dark'
              }`}>
              <it.icon className={`w-4 h-4 ${iconColor}`} />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <div className="px-3 py-2 mb-1">
          <div className="text-xs text-slate-400">Signed in as</div>
          <div className="text-sm font-semibold text-white truncate">{auth.admin.full_name}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-medium">{
              (auth.admin.permissions || []).length === PERMISSION_DEFINITIONS.length
                ? 'Full access'
                : `${(auth.admin.permissions || []).length} of ${PERMISSION_DEFINITIONS.length} tiles`
            }</span>
          </div>
          {(auth.admin.category_scope?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              <Tag className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] text-amber-400 font-medium">
                {auth.admin.category_scope.length} categor{auth.admin.category_scope.length === 1 ? 'y' : 'ies'}
              </span>
            </div>
          )}
          {auth.admin.scoped_business_name && (
            <div className="flex items-center gap-1.5 mt-1">
              <Building2 className="w-3 h-3 text-indigo-400" />
              <span className="text-[11px] text-indigo-400 font-medium truncate" title={auth.admin.scoped_business_name}>
                {auth.admin.scoped_business_name}
              </span>
            </div>
          )}
        </div>
        <button onClick={() => navigate('home')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 theme-hover-dark">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to storefront
        </button>
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/30 transition mt-1">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar — sticky to the viewport so it stays put while
          the main content scrolls. self-start prevents the flex parent
          from stretching it to the full document height (which would
          break sticky positioning). */}
      <div className="hidden md:block sticky top-0 h-screen self-start">{Sidebar}</div>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <div className="relative">{Sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)} className="p-2 hover:bg-slate-100 rounded">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-semibold text-sm text-slate-800">{companyName} Admin</div>
          <div className="w-9" />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

// ============================================================
// LOGIN PAGE
// ============================================================
function AdminLoginPage({ navigate }) {
  const auth = useAdminAuth();
  const toast = useToast();
  const settings = useSettings();
  const companyName = settings?.company_name || 'Redlook';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.login(email.trim(), password);
      toast.push('Welcome back');
      navigate('admin-users');
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 ring-1 ring-slate-700">
            <Leaf className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">{companyName} Admin Portal</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Sign in</h1>
          <p className="text-sm text-slate-500 mb-6">Authorized personnel only.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@redlook.com" autoComplete="username" />
            </Field>
            <Field label="Password">
              <TextInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" />
            </Field>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold py-3 rounded-xl transition">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <button onClick={() => navigate('home')}
            className="w-full mt-4 text-xs text-slate-500 hover:text-slate-700 transition">
            ← Back to {companyName} storefront
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD — placeholder for now; replaced with real KPIs in slice 6
// ============================================================

// Palette per tile — each entry hardcodes the full Tailwind class strings
// so the JIT picks them up. A `bg-${color}-50` template would silently
// produce no styles. Shared by both DASHBOARD_TILES and SETTINGS_SECTIONS
// so the two grids feel like part of the same colourful catalog.
const TILE_PALETTES = {
  indigo:  { gradient: 'from-indigo-500 to-blue-500',     iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600',  ring: 'group-hover:ring-indigo-200' },
  emerald: { gradient: 'from-emerald-500 to-teal-500',    iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', ring: 'group-hover:ring-emerald-200' },
  amber:   { gradient: 'from-amber-500 to-orange-500',    iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   ring: 'group-hover:ring-amber-200' },
  sky:     { gradient: 'from-sky-500 to-cyan-500',        iconBg: 'bg-sky-50',     iconText: 'text-sky-600',     ring: 'group-hover:ring-sky-200' },
  rose:    { gradient: 'from-rose-500 to-pink-500',       iconBg: 'bg-rose-50',    iconText: 'text-rose-600',    ring: 'group-hover:ring-rose-200' },
  violet:  { gradient: 'from-violet-500 to-purple-500',   iconBg: 'bg-violet-50',  iconText: 'text-violet-600',  ring: 'group-hover:ring-violet-200' },
  fuchsia: { gradient: 'from-fuchsia-500 to-pink-500',    iconBg: 'bg-fuchsia-50', iconText: 'text-fuchsia-600', ring: 'group-hover:ring-fuchsia-200' },
  teal:    { gradient: 'from-teal-500 to-cyan-500',       iconBg: 'bg-teal-50',    iconText: 'text-teal-600',    ring: 'group-hover:ring-teal-200' },
  orange:  { gradient: 'from-orange-500 to-red-500',      iconBg: 'bg-orange-50',  iconText: 'text-orange-600',  ring: 'group-hover:ring-orange-200' },
  slate:   { gradient: 'from-slate-600 to-slate-800',     iconBg: 'bg-slate-100',  iconText: 'text-slate-700',   ring: 'group-hover:ring-slate-200' },
};

// Tile catalog for the dashboard landing grid. Each entry maps to a sidebar
// route AND the permission required to see it. Data-driven so adding a new
// tile is one entry — and so the dashboard can never drift out of sync with
// the sidebar's permission gating again. `color` keys into TILE_PALETTES.
const DASHBOARD_TILES = [
  { route: 'admin-orders',     permission: 'orders',      icon: ShoppingBag,    title: 'Orders',      color: 'emerald', blurb: 'Track, confirm, pack, dispatch and deliver' },
  { route: 'admin-products',   permission: 'products',    icon: Package,        title: 'Products',    color: 'sky',     blurb: 'Catalog, pricing, stock, low-stock alerts' },
  { route: 'admin-categories', permission: 'categories',  icon: Tag,            title: 'Categories',  color: 'violet',  blurb: 'Manage product groupings' },
  { route: 'admin-coupons',    permission: 'coupons',     icon: Ticket,         title: 'Coupons',     color: 'rose',    blurb: 'Discount codes and promo limits' },
  { route: 'admin-customers',  permission: 'customers',   icon: UserCheck,      title: 'Customers',   color: 'amber',   blurb: 'Lookup, history, suspend / reactivate' },
  { route: 'admin-reports',    permission: 'reports',     icon: BarChart3,      title: 'Reports',     color: 'indigo',  blurb: 'Sales, inventory, customers, revenue' },
  { route: 'admin-accounting', permission: 'accounting',  icon: IndianRupee,    title: 'Accounting',  color: 'emerald', blurb: 'Credit outstanding, ageing, payment trends' },
  { route: 'admin-customer-report', permission: 'customer-report', icon: ClipboardList, title: 'Customer Report', color: 'teal', blurb: 'Per-customer sales, quantity, outstanding, credit limit' },
  { route: 'admin-b2b-customers', permission: 'b2b-customers', icon: Building2, title: 'My B2B Customers', color: 'indigo', blurb: 'B2B-only extract by business name + GSTIN with date-scoped orders count' },
  { route: 'admin-reviews',    permission: 'reviews',     icon: MessageSquare,  title: 'Reviews',     color: 'fuchsia', blurb: 'Moderate ratings and comments' },
  { route: 'admin-settings',   permission: 'settings',    icon: Settings,       title: 'Settings',    color: 'teal',    blurb: 'Minimum order value, delivery, support contacts' },
  { route: 'admin-users',      permission: 'admin-users', icon: Users,          title: 'Admin Users', color: 'orange',  blurb: 'Manage who can access this portal' },
  { route: 'admin-me',         permission: null,          icon: User,           title: 'My Profile',  color: 'slate',   blurb: 'Update your name or change password' },
];

function AdminDashboardPage({ navigate }) {
  const auth = useAdminAuth();
  // Filter tiles to only those the admin's permission set actually allows.
  // null permission → always shown (My Profile). Backend gating is the
  // ultimate source of truth — this just keeps the UI in sync so the user
  // never sees a tile that would 403 on click.
  const visibleTiles = DASHBOARD_TILES.filter((t) =>
    t.permission == null || hasPermission(auth.admin, t.permission));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome, {auth.admin.full_name.split(' ')[0]}</h1>
      <p className="text-slate-600 mb-6">
        {visibleTiles.length <= 1
          ? "You don't currently have any dashboard tiles assigned. Ask an admin to grant you access."
          : 'Reports and KPIs land in a later slice. For now, jump to one of the modules below.'}
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleTiles.map((t) => {
          const palette = TILE_PALETTES[t.color] || TILE_PALETTES.slate;
          return (
            <button key={t.route} onClick={() => navigate(t.route)}
              className={`relative overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 text-left group transition hover:shadow-lg hover:-translate-y-0.5 ring-1 ring-transparent ${palette.ring}`}>
              {/* Top accent stripe — same pattern as Settings tiles so the
                  two grids read as one consistent colourful catalog. */}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.gradient}`} />
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-11 h-11 rounded-lg ${palette.iconBg} flex items-center justify-center transition`}>
                  <t.icon className={`w-5 h-5 ${palette.iconText}`} />
                </div>
                <div className="font-semibold text-slate-900">{t.title}</div>
              </div>
              <div className="text-xs text-slate-500 leading-relaxed">{t.blurb}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ADMIN USERS — master list. Gated on the 'admin-users' permission.
// ============================================================
function AdminUsersPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', permission: '', status: '', page: 1, limit: 20 });
  // Categories feed the CategoryScopePicker in both modals. Use the public
  // /api/categories endpoint so an admin-users holder without the
  // `categories` tile (or with a category scope of their own) can still
  // see every category when granting scope to others.
  const [categories, setCategories] = useState([]);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [pwdTarget, setPwdTarget] = useState(null);

  const canManageAdmins = hasPermission(auth.admin, 'admin-users');

  useEffect(() => {
    // The public /api/categories serializer returns { id, name, icon } — note
    // `id` not `category_id`. The picker (and our scope storage) keys on
    // `category_id`, so we normalize here. Without this, every button's id
    // would be undefined, and a single click would mark every row "checked"
    // because value.includes(undefined) returns true for all rows.
    api.getCategories()
      .then((r) => setCategories((r.data || []).map((c) => ({
        ...c,
        category_id: c.category_id ?? c.id,
      }))))
      .catch(() => { /* picker degrades gracefully to "no categories" empty state */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listUsers(filters);
      setUsers(r.data);
      setMeta(r.meta);
    } catch (err) {
      toast.push(err.message || 'Could not load admins', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  if (!canManageAdmins) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
        <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold">Admin Users access required</p>
        <p className="text-slate-500 text-sm mt-1">Only admins with the &quot;Admin Users&quot; permission can manage admin accounts.</p>
      </div>
    );
  }

  const onDisable = async (u) => {
    if (!confirm(`Disable ${u.full_name} (${u.email})? Their sessions will be ended immediately.`)) return;
    try {
      await adminApi.disableUser(u.admin_id);
      toast.push(`${u.email} disabled`);
      load();
    } catch (err) {
      toast.push(err.message || 'Could not disable admin', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Users</h1>
          <p className="text-sm text-slate-500 mt-1">Master list of accounts with portal access.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButtons resource="admin-users" label="Admin Users" />
          <button onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
            <UserPlus className="w-4 h-4" /> Add admin
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
          placeholder="Search name or email…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
        <select value={filters.permission} onChange={(e) => setFilters((f) => ({ ...f, permission: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All permissions</option>
          {PERMISSION_DEFINITIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.nav}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All status</option>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No admins match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Permissions</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Last login</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isMe = u.admin_id === auth.admin.admin_id;
                return (
                  <tr key={u.admin_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{u.full_name}</div>
                      {isMe && <div className="text-[10px] text-emerald-600 font-semibold">YOU</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3"><PermissionBadges permissions={u.permissions} /></td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.last_login ? new Date(u.last_login).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn label="Edit" onClick={() => setEditTarget(u)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn label="Reset password" onClick={() => setPwdTarget(u)}>
                          <Key className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn label={isMe ? 'Cannot disable yourself' : 'Disable'}
                          disabled={isMe || u.status === 'Disabled'}
                          onClick={() => onDisable(u)} variant="danger">
                          <UserX className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>Page {meta.page} of {meta.totalPages} · {meta.total} total</div>
            <div className="flex gap-1">
              <button disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Prev</button>
              <button disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      <CreateAdminModal open={createOpen} categories={categories} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      <EditAdminModal target={editTarget} categories={categories} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      <ResetPasswordModal target={pwdTarget} onClose={() => setPwdTarget(null)} onDone={() => { setPwdTarget(null); load(); }} />
    </div>
  );
}

// ----- small presentation helpers -----
// Per-tile chip color. The privileged 'admin-users' tile gets emerald to
// stand out from the workflow tiles, mirroring the convention from the
// previous role-based display where SuperAdmin was emerald.
const PERMISSION_BADGE_COLORS = {
  'admin-users': 'bg-emerald-100 text-emerald-700',
  'orders':      'bg-blue-100 text-blue-700',
  'products':    'bg-blue-100 text-blue-700',
  'categories':  'bg-blue-100 text-blue-700',
  'coupons':     'bg-blue-100 text-blue-700',
  'customers':   'bg-amber-100 text-amber-700',
  'reviews':     'bg-amber-100 text-amber-700',
  'reports':     'bg-violet-100 text-violet-700',
  'settings':    'bg-slate-200 text-slate-700',
};

function PermissionBadge({ permission }) {
  const cls = PERMISSION_BADGE_COLORS[permission] || 'bg-slate-100 text-slate-700';
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{PERMISSION_LABEL[permission] || permission}</span>;
}

// Row of small chips, one per granted permission. Falls back to a neutral
// "—" when the array is empty (shouldn't happen post-migration but keeps
// the UI safe against a malformed payload).
function PermissionBadges({ permissions }) {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {permissions.map((p) => <PermissionBadge key={p} permission={p} />)}
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
      status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-600'
    }`}>{status}</span>
  );
}

function IconBtn({ children, onClick, label, disabled, variant }) {
  const base = 'p-1.5 rounded-md transition';
  const cls = disabled
    ? 'text-slate-300 cursor-not-allowed'
    : variant === 'danger'
      ? 'text-slate-500 hover:text-red-700 hover:bg-red-50'
      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100';
  return (
    <button title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className={`${base} ${cls}`}>{children}</button>
  );
}

// ============================================================
// MODALS
// ============================================================
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  // Backdrop click closes the modal. Guard with target===currentTarget so
  // clicks inside the white card bubble up but don't trigger close.
  const onBackdropClick = (e) => { if (e.target === e.currentTarget) onClose(); };
  return (
    <div onClick={onBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const PASSWORD_HINT = 'Min 8 chars, with uppercase, number, and special character.';

// Reusable multi-permission checkbox group. Used by both Create and Edit
// modals. Pure controlled — caller owns the array. Each tile shows its nav
// label, the badge color it'll use elsewhere in the portal, and a one-line
// description so a non-technical SuperAdmin can pick the right tiles
// without guessing.
//
// Includes "Select all" / "Clear" shortcuts at the top — the most common
// flows (give a new admin everything; revoke everything to start fresh)
// shouldn't require ticking nine boxes by hand.
function PermissionsCheckboxGroup({ value, onChange, disabled, error, hint }) {
  const toggle = (id) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((p) => p !== id) : [...value, id]);
  };
  const allIds = PERMISSION_DEFINITIONS.map((p) => p.id);
  const allSelected = allIds.every((id) => value.includes(id));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{value.length} of {allIds.length} selected</span>
        <div className="flex gap-2">
          <button type="button" disabled={disabled || allSelected}
            onClick={() => onChange(allIds)}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:text-slate-300">
            Select all
          </button>
          <span className="text-slate-300 text-xs">·</span>
          <button type="button" disabled={disabled || value.length === 0}
            onClick={() => onChange([])}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:text-slate-300">
            Clear
          </button>
        </div>
      </div>
      <div className={`space-y-2 ${error ? 'ring-2 ring-red-200 rounded-lg p-2 -m-2' : ''}`}>
        {PERMISSION_DEFINITIONS.map((p) => {
          const checked = value.includes(p.id);
          return (
            <label key={p.id}
              className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 transition ${
                checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-slate-400'}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(p.id)}
                className="mt-0.5 w-4 h-4 rounded text-slate-900 focus:ring-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  {p.nav}
                  <PermissionBadge permission={p.id} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{p.hint}</div>
              </div>
            </label>
          );
        })}
      </div>
      {hint && !error && <div className="text-xs text-slate-500 mt-1.5">{hint}</div>}
      {error && <div className="text-xs text-red-600 mt-1.5">{error}</div>}
    </div>
  );
}

// Per-admin category whitelist for the Products + Categories tiles. Empty
// selection = unrestricted ("All categories"); ticking specific ones narrows
// the admin to those categories only.
//
// Why no `<input type="checkbox">` or `<label>`: this picker lives inside a
// modal `<form>` which renders other labels and form controls. Native
// checkboxes + nested labels triggered cross-firing in earlier iterations
// (selecting one row also activated "Select all" or other rows). Each row
// is now a self-contained `<button type="button">` with a visual-only check
// indicator — pure React state, zero browser form semantics to fight.
function CategoryScopePicker({ value, onChange, categories, disabled, hint }) {
  const toggle = (id) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);
  };
  const allIds = categories.map((c) => c.category_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => value.includes(id));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">
          {value.length === 0
            ? `All categories (no restriction)`
            : `${value.length} of ${allIds.length} categories`}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={disabled || allSelected || allIds.length === 0}
            onClick={() => onChange(allIds)}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:text-slate-300">
            Select all
          </button>
          <span className="text-slate-300 text-xs">·</span>
          <button type="button" disabled={disabled || value.length === 0}
            onClick={() => onChange([])}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:text-slate-300">
            Clear
          </button>
        </div>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {categories.length === 0 ? (
          <div className="text-xs text-slate-400 italic px-3 py-2.5">No categories yet — admin will be unrestricted.</div>
        ) : categories.map((c) => {
          const checked = value.includes(c.category_id);
          return (
            <button
              key={c.category_id}
              type="button"
              disabled={disabled}
              aria-pressed={checked}
              onClick={() => toggle(c.category_id)}
              className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2.5 transition text-left ${
                checked
                  ? 'border-emerald-500 bg-emerald-50/60'
                  : 'border-slate-200 hover:border-slate-400 bg-white'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              {/* Visual-only check indicator. State is driven entirely by
                  React via the `checked` boolean — no native checkbox. */}
              <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                checked ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
              }`}>
                {checked && (
                  <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5">
                    <path d="M5 10.5l3 3 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-lg shrink-0">{c.icon}</span>
              <span className="text-sm font-semibold text-slate-900 flex-1 truncate">{c.name}</span>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">{c.category_id}</span>
            </button>
          );
        })}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1.5">{hint}</div>}
    </div>
  );
}

function CreateAdminModal({ open, onClose, onCreated, categories }) {
  const toast = useToast();
  // permissions starts empty so the SuperAdmin must consciously pick at
  // least one — less surprising than a hidden default that ships with the
  // request. category_scope starts empty = "unrestricted" (all categories).
  // scoped_business_name '' = "no B2B restriction" (default for staff).
  const [form, setForm] = useState({ full_name: '', email: '', password: '', permissions: [], category_scope: [], scoped_business_name: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // Lazy-loaded list of distinct B2B business names for the scope dropdown.
  // Each row is one company (deduplicated across multi-contact accounts).
  const [b2bOptions, setB2bOptions] = useState([]);

  // Reset form whenever the modal is reopened
  useEffect(() => {
    if (open) {
      setForm({ full_name: '', email: '', password: '', permissions: [], category_scope: [], scoped_business_name: '' });
      setErrors({});
      adminApi.listB2BOptions()
        .then((r) => setB2bOptions(r.data || []))
        .catch(() => setB2bOptions([]));
    }
  }, [open]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (form.permissions.length === 0) {
      setErrors({ permissions: 'Pick at least one tile' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form, scoped_business_name: form.scoped_business_name.trim() || null };
      await adminApi.createUser(payload);
      toast.push(`${form.email} created`);
      onCreated();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add admin">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" error={errors.full_name}>
          <TextInput required value={form.full_name} error={errors.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </Field>
        <Field label="Email" error={errors.email}>
          <TextInput type="email" required value={form.email} error={errors.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Initial password" hint={PASSWORD_HINT} error={errors.password}>
          <TextInput type="text" required value={form.password} error={errors.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </Field>
        <Field label="Dashboard tiles">
          <PermissionsCheckboxGroup
            value={form.permissions}
            onChange={(permissions) => setForm((f) => ({ ...f, permissions }))}
            error={errors.permissions}
            hint="Pick every dashboard tile this admin should be able to see and act on."
          />
        </Field>
        {/* Category scope is only meaningful when products or categories
            are granted; otherwise it has nothing to narrow. Plain <div> rather
            than <Field> because Field uses a <label> element and we have nested
            row controls inside the picker — see CategoryScopePicker comment. */}
        {(form.permissions.includes('products') || form.permissions.includes('categories')) && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3">
            <div className="text-sm font-semibold text-slate-900 mb-1">Category scope</div>
            <div className="text-xs text-slate-600 mb-2.5">
              You granted <span className="font-semibold">Products</span>{form.permissions.includes('categories') ? ' and Categories' : ''} access. Pick the categories this admin should manage, or leave empty for full access.
            </div>
            <CategoryScopePicker
              value={form.category_scope}
              onChange={(category_scope) => setForm((f) => ({ ...f, category_scope }))}
              categories={categories}
            />
          </div>
        )}
        {/* B2B scope — independent of the per-tile permissions. Picking
            a business here restricts every customer/order-bearing page
            this admin sees to that company's rows only. The dropdown
            lists distinct business names + GSTINs; multiple login users
            under one business all collapse into a single option. */}
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-3">
          <div className="text-sm font-semibold text-slate-900 mb-1">B2B scope (optional)</div>
          <div className="text-xs text-slate-600 mb-2.5">
            Link this admin to a B2B company so they can only view records, orders, and customer data for that business. Leave blank for internal staff who should see all customers.
          </div>
          <select value={form.scoped_business_name}
            onChange={(e) => setForm((f) => ({ ...f, scoped_business_name: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="">— No B2B scope (full access) —</option>
            {b2bOptions.map((c) => (
              <option key={`${c.business_name}__${c.gstin || ''}`} value={c.business_name}>
                {c.business_name}{c.gstin ? ` · GSTIN ${c.gstin}` : ''}{c.contact_count > 1 ? ` · ${c.contact_count} contacts` : ''}
              </option>
            ))}
          </select>
          {b2bOptions.length === 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5 italic">No active B2B customers found — the dropdown will populate once at least one B2B account exists.</p>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Creating…' : 'Create admin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Compares two permission arrays as sets (order-independent).
const samePermissionSet = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
};

function EditAdminModal({ target, onClose, onSaved, categories }) {
  const toast = useToast();
  const auth = useAdminAuth();
  const [form, setForm] = useState({ full_name: '', permissions: [], category_scope: [], status: '', scoped_business_name: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // Lazy-loaded distinct B2B business names for the scope dropdown.
  const [b2bOptions, setB2bOptions] = useState([]);

  useEffect(() => {
    if (target) {
      setForm({
        full_name: target.full_name,
        permissions: target.permissions || [],
        category_scope: target.category_scope || [],
        status: target.status,
        scoped_business_name: target.scoped_business_name || '',
      });
      setErrors({});
      adminApi.listB2BOptions()
        .then((r) => setB2bOptions(r.data || []))
        .catch(() => setB2bOptions([]));
    }
  }, [target]);

  if (!target) return null;
  const isSelf = target.admin_id === auth.admin.admin_id;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (form.permissions.length === 0) {
      setErrors({ permissions: 'Pick at least one tile' });
      return;
    }
    setSubmitting(true);
    // Only send fields that actually changed.
    const changes = {};
    if (form.full_name !== target.full_name) changes.full_name = form.full_name;
    if (!samePermissionSet(form.permissions, target.permissions || [])) changes.permissions = form.permissions;
    if (!samePermissionSet(form.category_scope, target.category_scope || [])) changes.category_scope = form.category_scope;
    if (form.status !== target.status) changes.status = form.status;
    const newScope = form.scoped_business_name.trim() || null;
    const oldScope = target.scoped_business_name || null;
    if (newScope !== oldScope) changes.scoped_business_name = newScope;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    try {
      await adminApi.updateUser(target.admin_id, changes);
      toast.push('Admin updated');
      onSaved();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${target.email}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" error={errors.full_name}>
          <TextInput required value={form.full_name} error={errors.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </Field>
        <Field label="Dashboard tiles">
          <PermissionsCheckboxGroup
            value={form.permissions}
            onChange={(permissions) => setForm((f) => ({ ...f, permissions }))}
            disabled={isSelf}
            error={errors.permissions}
            hint={isSelf ? 'You cannot change your own permissions.' : 'Tick every dashboard tile this admin should see.'}
          />
        </Field>
        {(form.permissions.includes('products') || form.permissions.includes('categories')) && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3">
            <div className="text-sm font-semibold text-slate-900 mb-1">Category scope</div>
            <div className="text-xs text-slate-600 mb-2.5">
              {isSelf
                ? 'You cannot change your own category scope.'
                : <>Pick the categories this admin should manage, or leave empty for full access.</>}
            </div>
            <CategoryScopePicker
              value={form.category_scope}
              onChange={(category_scope) => setForm((f) => ({ ...f, category_scope }))}
              categories={categories}
              disabled={isSelf}
            />
          </div>
        )}
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-3">
          <div className="text-sm font-semibold text-slate-900 mb-1">B2B scope (optional)</div>
          <div className="text-xs text-slate-600 mb-2.5">
            {isSelf
              ? 'You cannot change your own B2B scope.'
              : <>Link this admin to a B2B company so they can only view records, orders, and customer data for that business. Leave blank for internal staff who should see all customers.</>}
          </div>
          <select value={form.scoped_business_name} disabled={isSelf}
            onChange={(e) => setForm((f) => ({ ...f, scoped_business_name: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-100">
            <option value="">— No B2B scope (full access) —</option>
            {/* Preserve the currently-saved business name even if no live
                B2B customer rows carry it anymore (e.g. all contacts under
                that business were renamed). Admin can then re-pick. */}
            {form.scoped_business_name && !b2bOptions.some((c) => c.business_name === form.scoped_business_name) && (
              <option value={form.scoped_business_name}>
                {form.scoped_business_name} (no live customers)
              </option>
            )}
            {b2bOptions.map((c) => (
              <option key={`${c.business_name}__${c.gstin || ''}`} value={c.business_name}>
                {c.business_name}{c.gstin ? ` · GSTIN ${c.gstin}` : ''}{c.contact_count > 1 ? ` · ${c.contact_count} contacts` : ''}
              </option>
            ))}
          </select>
          {target.scoped_business_name && (
            <p className="text-[11px] text-indigo-700 mt-1.5 font-semibold">Currently scoped to: {target.scoped_business_name}</p>
          )}
        </div>
        <Field label="Status"
          hint={isSelf ? 'You cannot disable yourself.' : undefined}>
          <SelectInput value={form.status} disabled={isSelf}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </SelectInput>
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ target, onClose, onDone }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (target) { setPassword(''); setErrors({}); } }, [target]);

  if (!target) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      await adminApi.resetUserPassword(target.admin_id, password);
      toast.push(`Password reset for ${target.email}. Their sessions have been ended.`);
      onDone();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password for ${target.email}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3">
          This admin's existing sessions will be revoked immediately. Share the new password through a secure channel.
        </div>
        <Field label="New password" hint={PASSWORD_HINT} error={errors.password}>
          <TextInput type="text" required value={password} error={errors.password}
            onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Zod's flatten() returns { formErrors, fieldErrors: { [field]: [msg, ...] } }.
// Collapse fieldErrors to { field: firstMessage } for our Field component.
function flatFieldErrors(fieldErrors) {
  return Object.fromEntries(Object.entries(fieldErrors || {}).map(([k, v]) => [k, v?.[0] || 'Invalid']));
}

// ============================================================
// MY PROFILE — name edit + password change
// ============================================================
function AdminMyProfilePage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [name, setName] = useState(auth.admin.full_name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});
  const [savingPwd, setSavingPwd] = useState(false);

  const onSaveName = async (e) => {
    e.preventDefault();
    setNameError(null);
    setSavingName(true);
    try {
      const r = await adminApi.updateMe(name.trim());
      auth.setAdmin(r.data.admin);
      toast.push('Name updated');
    } catch (err) {
      setNameError(err.message);
    } finally {
      setSavingName(false);
    }
  };

  const onChangePwd = async (e) => {
    e.preventDefault();
    setPwdErrors({});
    if (pwd.next !== pwd.confirm) {
      setPwdErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setSavingPwd(true);
    try {
      await adminApi.changeOwnPassword(pwd.current, pwd.next);
      toast.push('Password changed. Other sessions signed out.');
      setPwd({ current: '', next: '', confirm: '' });
    } catch (err) {
      if (err.details?.fieldErrors) setPwdErrors(flatFieldErrors(err.details.fieldErrors));
      else if (err.code === 401) setPwdErrors({ current: err.message || 'Current password is incorrect' });
      else toast.push(err.message, 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">My Profile</h1>
      <p className="text-sm text-slate-500 mb-6">Edit your display name or change your password.</p>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Read-only summary */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Account</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-medium">{auth.admin.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500 shrink-0">Permissions</dt><dd className="text-right"><PermissionBadges permissions={auth.admin.permissions} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge status={auth.admin.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Member since</dt>
              <dd className="text-slate-700">{new Date(auth.admin.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Last login</dt>
              <dd className="text-slate-700">{auth.admin.last_login ? new Date(auth.admin.last_login).toLocaleString('en-IN') : '—'}</dd></div>
          </dl>
          <p className="text-xs text-slate-500 mt-4">Email and permissions are managed by an admin who holds the &quot;Admin Users&quot; permission.</p>
        </div>

        {/* Editable name */}
        <form onSubmit={onSaveName} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Display name</h2>
          <Field label="Full name" error={nameError}>
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button type="submit" disabled={savingName || name.trim() === auth.admin.full_name}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {savingName ? 'Saving…' : 'Save name'}
          </button>
        </form>

        {/* Password change — full width */}
        <form onSubmit={onChangePwd} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Change password</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Current password" error={pwdErrors.current_password || pwdErrors.current}>
              <TextInput type="password" required value={pwd.current} error={pwdErrors.current_password || pwdErrors.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} />
            </Field>
            <Field label="New password" hint={PASSWORD_HINT} error={pwdErrors.new_password}>
              <TextInput type="password" required value={pwd.next} error={pwdErrors.new_password}
                onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} />
            </Field>
            <Field label="Confirm new password" error={pwdErrors.confirm}>
              <TextInput type="password" required value={pwd.confirm} error={pwdErrors.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} />
            </Field>
          </div>
          <button type="submit" disabled={savingPwd}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {savingPwd ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// TRANSLATED TEXT FIELD (Phase 2 i18n)
// ============================================================
// Renders the canonical English input plus a "+ Translations" disclosure that
// expands to per-language inputs (हिन्दी, বাংলা). The component is generic
// over single-line / multi-line: pass `multiline` for textarea.
//
// `translations` is the JSON object stored on the entity:
//   { name: { hi: "...", bn: "..." } }
// `field` is the canonical column name (e.g. "name") — the component reads
// translations[field][hi] / [bn] and writes back via onTranslationsChange,
// merging into the existing translations shape.
//
// Empty translation values get pruned so the JSON column doesn't accumulate
// blank keys. Customer-facing serializer falls back to the canonical column
// per-field when a translation is missing — so partial fills work cleanly.
function TranslatedTextField({
  label,
  field,
  value,
  onChange,
  translations,
  onTranslationsChange,
  error,
  hint,
  multiline = false,
  rows = 2,
  ...inputProps
}) {
  const [open, setOpen] = useState(false);
  const fieldTrans = (translations && translations[field]) || {};
  const hi = fieldTrans.hi || '';
  const bn = fieldTrans.bn || '';
  const filledCount = (hi ? 1 : 0) + (bn ? 1 : 0);

  const updateOne = (locale, next) => {
    const cur = { ...((translations && translations[field]) || {}) };
    if (next && next.trim()) cur[locale] = next;
    else delete cur[locale];
    // If both locales are blank after this edit, drop the field key entirely
    // so the JSON stays tidy (`{}` rather than `{ name: {} }`).
    const nextField = Object.keys(cur).length === 0 ? undefined : cur;
    const nextTranslations = { ...(translations || {}) };
    if (nextField === undefined) delete nextTranslations[field];
    else nextTranslations[field] = nextField;
    onTranslationsChange(nextTranslations);
  };

  const InputCmp = multiline ? 'textarea' : TextInput;
  const baseProps = multiline
    ? { rows, value, onChange, className: 'w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 text-sm', ...inputProps }
    : { value, onChange, error, ...inputProps };

  return (
    <Field label={label} error={error} hint={hint}>
      <InputCmp {...baseProps} />
      <button type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
        {open ? '− Hide translations' : `+ Translations${filledCount > 0 ? ` (${filledCount}/2)` : ''}`}
      </button>
      {open && (
        <div className="mt-2 space-y-2 pl-3 border-l-2 border-amber-200">
          <div>
            <div className="text-xs text-slate-500 mb-0.5 flex items-center gap-1.5">
              <span className="font-mono">hi</span>
              <span>हिन्दी</span>
              {!hi && <span className="text-[10px] text-slate-400 italic">— falls back to English when empty</span>}
            </div>
            {multiline ? (
              <textarea rows={rows} value={hi}
                onChange={(e) => updateOne('hi', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 text-sm" />
            ) : (
              <TextInput value={hi} onChange={(e) => updateOne('hi', e.target.value)} />
            )}
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5 flex items-center gap-1.5">
              <span className="font-mono">bn</span>
              <span>বাংলা</span>
              {!bn && <span className="text-[10px] text-slate-400 italic">— falls back to English when empty</span>}
            </div>
            {multiline ? (
              <textarea rows={rows} value={bn}
                onChange={(e) => updateOne('bn', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 text-sm" />
            ) : (
              <TextInput value={bn} onChange={(e) => updateOne('bn', e.target.value)} />
            )}
          </div>
        </div>
      )}
    </Field>
  );
}

// ============================================================
// PRODUCTS — master list with filters, low-stock summary, CRUD modals
// ============================================================
const UNITS = ['kg', 'piece', 'bunch', 'gram', 'liter'];

function AdminProductsPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  // Filters: lowStock and outOfStock are mutually exclusive — set by the
  // summary cards, cleared by clicking "Active products". Backend defaults
  // its threshold to 10 when none is supplied.
  const [filters, setFilters] = useState({ q: '', category: '', status: '', organic: '', lowStock: '', outOfStock: '', page: 1, limit: 20 });
  const [editTarget, setEditTarget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const canWrite = hasPermission(auth.admin, 'products');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listProducts(filters);
      setRows(r.data);
      setMeta(r.meta);
      setSummary(r.summary);
    } catch (err) {
      toast.push(err.message || 'Could not load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  // Categories needed by the filter dropdown and the product form
  useEffect(() => {
    adminApi.listCategories()
      .then((r) => setCategories(r.data))
      .catch((err) => toast.push(err.message || 'Could not load categories', 'error'));
  }, [toast]);

  const onDisable = async (p) => {
    if (!confirm(`Disable "${p.name}"? It will be hidden from customers but historical orders still resolve.`)) return;
    try {
      await adminApi.disableProduct(p.product_id);
      toast.push(`${p.name} disabled`);
      load();
    } catch (err) {
      toast.push(err.message || 'Could not disable product', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500 mt-1">Catalog, pricing, stock levels.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButtons resource="products" label="Products" />
          {canWrite && (
            <button onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
              <Plus className="w-4 h-4" /> Add product
            </button>
          )}
        </div>
      </div>

      {/* Inventory summary cards (FR-ADM-03). Clicking a card filters the
          table; clicking "Active products" returns to the unfiltered view. */}
      {summary && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <SummaryCard
            icon={CheckCircle2} tone="emerald"
            active={filters.lowStock !== 'true' && filters.outOfStock !== 'true'}
            label="Active products" value={summary.totalActive}
            onClick={() => setFilters((f) => ({ ...f, lowStock: '', outOfStock: '', page: 1 }))} />
          <SummaryCard
            icon={AlertTriangle} tone="amber"
            active={filters.lowStock === 'true'}
            label={`Low stock (≤ ${summary.threshold})`} value={summary.lowStockCount}
            onClick={() => setFilters((f) => ({ ...f, lowStock: 'true', outOfStock: '', page: 1 }))} />
          <SummaryCard
            icon={PackageX} tone="red"
            active={filters.outOfStock === 'true'}
            label="Out of stock" value={summary.outOfStockCount}
            onClick={() => setFilters((f) => ({ ...f, lowStock: '', outOfStock: 'true', page: 1 }))} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
          placeholder="Search by name…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
        <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.icon} {c.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select value={filters.organic} onChange={(e) => setFilters((f) => ({ ...f, organic: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">Any</option>
          <option value="true">Organic only</option>
          <option value="false">Non-organic</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No products match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Product</th>
                <th className="px-4 py-3 text-left font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Price</th>
                <th className="px-4 py-3 text-right font-semibold">Discount</th>
                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const stockClass = p.stock_quantity === 0
                  ? 'text-red-600 font-semibold'
                  : p.stock_quantity <= (summary?.threshold || 10)
                    ? 'text-amber-600 font-semibold'
                    : 'text-slate-700';
                return (
                  <tr key={p.product_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-2xl overflow-hidden shrink-0">
                          <ProductImage src={p.image} alt={p.name} />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{p.name}</div>
                          {p.is_organic && <span className="text-[10px] text-emerald-700 font-semibold">ORGANIC</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.category_name || p.category_id}</td>
                    <td className="px-4 py-3 text-right font-medium">₹{p.price_per_unit.toFixed(2)} <span className="text-xs text-slate-500">/ {p.unit}</span></td>
                    <td className="px-4 py-3 text-right">
                      {/* Product-level markdown wins display priority; the
                          category column shows up as a fainter chip below it
                          when present, so the admin can see at a glance which
                          tier each SKU is actually getting. */}
                      {p.discount_percent > 0 ? (
                        <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs px-2 py-0.5 rounded-md">
                          {Number(p.discount_percent).toFixed(0)}%
                        </span>
                      ) : p.category_discount_percent > 0 ? (
                        <span className="inline-block bg-violet-50 text-violet-700 border border-violet-200 font-semibold text-xs px-2 py-0.5 rounded-md" title="From category">
                          {Number(p.category_discount_percent).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right ${stockClass}`}>{p.stock_quantity} {p.unit}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn label="Edit" onClick={() => setEditTarget(p)} disabled={!canWrite}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn label={p.status === 'Inactive' ? 'Already disabled' : 'Disable'}
                          variant="danger" disabled={!canWrite || p.status === 'Inactive'}
                          onClick={() => onDisable(p)}>
                          <UserX className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>Page {meta.page} of {meta.totalPages} · {meta.total} total</div>
            <div className="flex gap-1">
              <button disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Prev</button>
              <button disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      <ProductFormModal open={createOpen} categories={categories} onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); load(); }} />
      <ProductFormModal target={editTarget} categories={categories} onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); load(); }} />
    </div>
  );
}

function SummaryCard({ icon: Icon, tone, label, value, onClick, active }) {
  const palette = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[tone] || 'bg-slate-50 text-slate-700 border-slate-200';
  // Selected card gets a strong slate ring so the user can see at a glance
  // which filter the table is currently reflecting.
  const ring = active ? 'ring-2 ring-offset-2 ring-slate-900 shadow-sm' : '';
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`text-left border rounded-xl p-4 ${palette} ${ring} ${onClick ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'} transition`}>
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5" />
        <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </button>
  );
}

// Colour-variant editor — rendered inside ProductFormModal on edit mode
// only. Variants are saved through their own /admin/products/:id/variants
// endpoints, NOT batched with the parent product POST/PUT. This means
// each variant edit is committed independently and the rest of the form
// is unaffected if a single variant fails to save. New products: create
// the base product first, reopen as edit, then add colours.
function VariantEditor({ productId }) {
  const toast = useToast();
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  // null when not editing; an object {variant_id?, color, color_hex,
  // stock, images} when the inline form is open. Existing variant has
  // variant_id; new variant doesn't.
  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listVariants(productId);
      setVariants(r.data || []);
    } catch (err) {
      toast.push(err.message || 'Could not load colour variants', 'error');
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => { reload(); }, [reload]);

  const onSave = async (data) => {
    if (editing.variant_id) {
      await adminApi.updateVariant(productId, editing.variant_id, data);
      toast.push('Colour updated');
    } else {
      await adminApi.createVariant(productId, data);
      toast.push('Colour added');
    }
    setEditing(null);
    await reload();
  };

  const onDelete = async (variant) => {
    if (!window.confirm(`Delete colour "${variant.color}"? Customers will no longer see it.`)) return;
    try {
      const r = await adminApi.deleteVariant(productId, variant.variant_id);
      toast.push(r.data?.soft_deleted ? 'Colour disabled (in past orders)' : 'Colour removed');
      reload();
    } catch (err) {
      toast.push(err.message || 'Could not delete colour', 'error');
    }
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Colour variants (optional)</h3>
          <p className="text-xs text-slate-500 mt-0.5">When this product has 1+ colours, customers must pick one. Each colour has its own stock and photos.</p>
        </div>
        {!editing && (
          <button type="button"
            onClick={() => setEditing({ color: '', color_hex: '#cccccc', stock: 0, images: [] })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add colour
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 py-3">Loading colours…</p>
      ) : variants.length === 0 && !editing ? (
        <p className="text-xs text-slate-500 py-3 italic">No colour variants. Customers will use the product's main stock count above.</p>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => (
            <div key={v.variant_id} className="flex items-center gap-3 p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
              <span className="w-9 h-9 rounded-full border-2 border-white shadow-sm shrink-0 ring-1 ring-slate-200" style={{ background: v.color_hex }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{v.color}</div>
                <div className="text-xs text-slate-500">Stock: {v.stock} · {v.images.length} photo{v.images.length === 1 ? '' : 's'}</div>
              </div>
              <button type="button" onClick={() => setEditing({ ...v })}
                className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900">Edit</button>
              <button type="button" onClick={() => onDelete(v)}
                className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <VariantInlineForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={onSave} />
      )}
    </div>
  );
}

// Inline editor for one variant. Used both for creating a new colour
// and editing an existing one (initial.variant_id distinguishes).
function VariantInlineForm({ initial, onCancel, onSave }) {
  const toast = useToast();
  const [color, setColor] = useState(initial.color || '');
  const [hex, setHex] = useState(initial.color_hex || '#cccccc');
  const [stock, setStock] = useState(String(initial.stock ?? 0));
  const [images, setImages] = useState(Array.isArray(initial.images) ? initial.images : []);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const submit = async () => {
    if (!color.trim()) return toast.push('Colour name is required', 'error');
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return toast.push('Hex colour must be #RRGGBB', 'error');
    if (images.length === 0) return toast.push('At least one photo is required for this colour', 'error');
    setSubmitting(true);
    try {
      await onSave({
        color: color.trim(),
        color_hex: hex.toLowerCase(),
        stock: Number(stock) || 0,
        images,
      });
    } catch (err) {
      toast.push(err.message || 'Save failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 p-3 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-emerald-50/50 dark:bg-slate-800 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Colour name">
          <TextInput value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Crimson Red" />
        </Field>
        <Field label="Swatch (hex)">
          <div className="flex items-center gap-2">
            <input type="color" value={hex} onChange={(e) => setHex(e.target.value)}
              className="w-12 h-10 rounded border border-slate-200 cursor-pointer shrink-0" />
            <TextInput value={hex} onChange={(e) => setHex(e.target.value)} />
          </div>
        </Field>
        <Field label="Stock for this colour">
          <TextInput type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
        </Field>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Photos for this colour ({images.length}/5) <span className="text-slate-400 font-normal">— at least one required</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => {
            const url = images[i];
            const slotDisabled = submitting || uploading;
            return (
              <div key={i} className="relative aspect-[3/4] rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 overflow-hidden group">
                {url ? (
                  <>
                    <ProductImage src={url} alt={`Photo ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute top-1 left-1 inline-flex items-center gap-1 bg-emerald-600 text-white text-[9px] font-bold px-1 py-0.5 rounded">PRIMARY</span>
                    )}
                    <button type="button"
                      onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      disabled={slotDisabled}
                      className="absolute top-1 right-1 bg-white/95 hover:bg-red-50 text-red-600 rounded-full w-6 h-6 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <input id={`variant-img-upload-${i}`} type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden" disabled={slotDisabled}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const r = await adminApi.uploadProductImage(file);
                          setImages(prev => [...prev, r.data.url].slice(0, 5));
                        } catch (err) {
                          toast.push(err.message || 'Upload failed', 'error');
                        } finally {
                          setUploading(false);
                          e.target.value = '';
                        }
                      }} />
                    <label htmlFor={`variant-img-upload-${i}`}
                      className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition ${
                        slotDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}>
                      {uploading ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <ImagePlus className="w-4 h-4 text-slate-400" />}
                      <span className="text-[10px] text-slate-500">Add</span>
                    </label>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} disabled={submitting}
          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-xs font-semibold">Cancel</button>
        <button type="button" onClick={submit} disabled={submitting || uploading}
          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-semibold">
          {submitting ? 'Saving…' : (initial.variant_id ? 'Update colour' : 'Add colour')}
        </button>
      </div>
    </div>
  );
}

// Single modal handles both create (no target) and edit (target supplied).
// Keeps the form fields and validation in one place.
function ProductFormModal({ open, target, categories, onClose, onSaved }) {
  const toast = useToast();
  const auth = useAdminAuth();
  const isEdit = !!target;
  const visible = open || isEdit;

  // Restrict the category dropdown to whatever the current admin is scoped to.
  // In edit mode, if the product's current category is out of scope (a fluke
  // — backend would have already rejected the edit), still include it so the
  // dropdown isn't blank.
  const scopedCategories = (() => {
    const scope = getCategoryScope(auth?.admin);
    if (scope === null) return categories;
    const inScope = categories.filter((c) => scope.includes(c.category_id));
    if (isEdit && target && !inScope.some((c) => c.category_id === target.category_id)) {
      const cur = categories.find((c) => c.category_id === target.category_id);
      if (cur) return [cur, ...inScope];
    }
    return inScope;
  })();

  // image starts empty — admin must pick a file. (Edit mode populates from
  // target.image which may be the legacy emoji string or a /uploads URL.)
  // `translations` is the JSON shape stored on Product.translations — the
  // TranslatedTextField components read+write into it directly.
  const blank = {
    name: '', category_id: scopedCategories[0]?.category_id || '', description: '',
    price_per_unit: '', unit: 'kg', stock_quantity: '', is_organic: false,
    // Gallery of up to 5 photos. images[0] is the primary shown in list
    // cards / cart / order summaries — the backend re-derives the legacy
    // `image` column from it on every write.
    images: [], freshness: '', status: 'Active', is_returnable: true,
    discount_percent: '0', translations: {},
  };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (isEdit) {
      setForm({
        name: target.name,
        category_id: target.category_id,
        description: target.description || '',
        price_per_unit: String(target.price_per_unit),
        unit: target.unit,
        stock_quantity: String(target.stock_quantity),
        is_organic: target.is_organic,
        // Prefer the new gallery field; fall back to wrapping the legacy
        // single image so admins editing pre-migration rows still see
        // their photo in the first slot.
        images: Array.isArray(target.images) && target.images.length > 0
          ? target.images
          : (target.image ? [target.image] : []),
        freshness: target.freshness || '',
        status: target.status,
        is_returnable: target.is_returnable !== false, // default true if missing
        discount_percent: String(target.discount_percent ?? 0),
        translations: target.translations || {},
      });
    } else {
      setForm({ ...blank, category_id: scopedCategories[0]?.category_id || '' });
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, target?.product_id, categories.length]);

  if (!visible) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (!form.images || form.images.length === 0) {
      // At least one photo required (Product.image is non-null server-side).
      // Surface a friendly error instead of a generic backend Zod failure.
      setErrors({ images: 'Please upload at least one product photo' });
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      category_id: form.category_id,
      description: form.description.trim() || null,
      price_per_unit: Number(form.price_per_unit),
      unit: form.unit,
      stock_quantity: Number(form.stock_quantity),
      is_organic: form.is_organic,
      // Send both fields so older backend deploys (single `image` only)
      // still accept the create — the multi-image normalizer is the
      // source of truth on backends that have the migration applied.
      image: form.images[0],
      images: form.images,
      freshness: form.freshness.trim() || null,
      status: form.status,
      is_returnable: form.is_returnable,
      // Treat blank/non-numeric as 0 so an admin who clears the field gets
      // no discount rather than a Zod failure. The slider tier resolver on
      // the backend already caps to [0, 100].
      discount_percent: Number(form.discount_percent) || 0,
      // Phase 2 — per-field translations. Null clears entirely (handy when
      // the admin wipes both languages on every field).
      translations: Object.keys(form.translations || {}).length === 0 ? null : form.translations,
    };
    try {
      if (isEdit) await adminApi.updateProduct(target.product_id, payload);
      else await adminApi.createProduct(payload);
      toast.push(isEdit ? 'Product updated' : 'Product created');
      onSaved();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${target.name}` : 'Add product'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <TranslatedTextField
            label="Name"
            field="name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            translations={form.translations}
            onTranslationsChange={(translations) => setForm((f) => ({ ...f, translations }))}
            error={errors.name} />
          <Field label="Category" error={errors.category_id}>
            <SelectInput value={form.category_id} error={errors.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
              {scopedCategories.map((c) => <option key={c.category_id} value={c.category_id}>{c.icon} {c.name}</option>)}
            </SelectInput>
          </Field>
        </div>

        <TranslatedTextField
          label="Description"
          field="description"
          multiline
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          translations={form.translations}
          onTranslationsChange={(translations) => setForm((f) => ({ ...f, translations }))}
          error={errors.description} />

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Price (₹)" error={errors.price_per_unit}>
            <TextInput type="number" step="0.01" min="0" required value={form.price_per_unit} error={errors.price_per_unit}
              onChange={(e) => setForm((f) => ({ ...f, price_per_unit: e.target.value }))} />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <SelectInput value={form.unit} error={errors.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </SelectInput>
          </Field>
          <Field label="Stock" error={errors.stock_quantity}>
            <TextInput type="number" step="0.01" min="0" required value={form.stock_quantity} error={errors.stock_quantity}
              onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))} />
          </Field>
        </div>

        <Field label="Discount (%)" error={errors.discount_percent}
          hint="0-100. Stacks with category and platform-wide discounts — the customer pays the lowest of the three. Leave at 0 for no per-product discount.">
          <TextInput type="number" step="1" min="0" max="100" value={form.discount_percent} error={errors.discount_percent}
            onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))} />
        </Field>

        <Field label={`Product photos (${form.images.length}/5)`} error={errors.images || errors.image}
          hint="Up to 5 photos — front / back / detail / draped / styled. The first photo is the primary shown in product lists and the cart. JPEG, PNG, WEBP or GIF up to 5 MB each.">
          {/* Five-slot gallery uploader. Each filled slot can be set as
              primary (moves it to position 0) or removed. Empty slots
              accept a new upload via a hidden <input type="file">. We
              cap at 5 client-side; the backend Zod schema enforces the
              same cap server-side. */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map((i) => {
              const url = form.images[i];
              const slotDisabled = uploading || submitting;
              return (
                <div key={i} className="relative aspect-[3/4] rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 overflow-hidden group">
                  {url ? (
                    <>
                      <ProductImage src={url} alt={`Photo ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                          <Star className="w-2.5 h-2.5 fill-current" /> PRIMARY
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5 p-2">
                        {i > 0 && (
                          <button type="button"
                            onClick={() => setForm((f) => {
                              const next = [...f.images];
                              const [moved] = next.splice(i, 1);
                              next.unshift(moved);
                              return { ...f, images: next };
                            })}
                            disabled={slotDisabled}
                            className="w-full inline-flex items-center justify-center gap-1 bg-white/95 hover:bg-white text-slate-900 text-[10px] font-semibold px-2 py-1 rounded transition">
                            <Star className="w-3 h-3" /> Set primary
                          </button>
                        )}
                        <button type="button"
                          onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}
                          disabled={slotDisabled}
                          className="w-full inline-flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold px-2 py-1 rounded transition">
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input id={`product-image-upload-${i}`} type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={slotDisabled}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true);
                          try {
                            const r = await adminApi.uploadProductImage(file);
                            setForm((f) => ({ ...f, images: [...f.images, r.data.url].slice(0, 5) }));
                            setErrors((er) => ({ ...er, images: undefined, image: undefined }));
                            toast.push('Photo added');
                          } catch (err) {
                            toast.push(err.message || 'Upload failed', 'error');
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }} />
                      <label htmlFor={`product-image-upload-${i}`}
                        className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition ${
                          slotDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600'
                        }`}>
                        {uploading
                          ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                          : <ImagePlus className="w-5 h-5 text-slate-400" />}
                        <span className="text-[10px] font-medium text-slate-500">
                          {i === 0 && form.images.length === 0 ? 'Primary' : 'Add photo'}
                        </span>
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Field>

        <TranslatedTextField
          label="Freshness label"
          field="freshness"
          hint='e.g. "Harvested today"'
          value={form.freshness}
          onChange={(e) => setForm((f) => ({ ...f, freshness: e.target.value }))}
          translations={form.translations}
          onTranslationsChange={(translations) => setForm((f) => ({ ...f, translations }))}
          error={errors.freshness} />

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Status">
            <SelectInput value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive (hidden from customers)</option>
            </SelectInput>
          </Field>
          <div className="flex items-end gap-4 pb-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_organic}
                onChange={(e) => setForm((f) => ({ ...f, is_organic: e.target.checked }))}
                className="w-4 h-4" />
              <span className="text-sm text-slate-700">Organic</span>
            </label>
            {/* Per-product return policy. Defaults to returnable. Disabling
                hides the item from the customer return-request form and
                rejects any return that includes it server-side. */}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_returnable}
                onChange={(e) => setForm((f) => ({ ...f, is_returnable: e.target.checked }))}
                className="w-4 h-4" />
              <span className="text-sm text-slate-700">Returnable</span>
            </label>
          </div>
        </div>

        {isEdit && <VariantEditor productId={target.product_id} />}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Create product')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// CATEGORIES — list + create/edit/delete with safety guard
// ============================================================
function AdminCategoriesPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const canWrite = hasPermission(auth.admin, 'categories');
  // Scoped admins cannot create new categories (a freshly-created row
  // wouldn't be in their whitelist) — backend rejects too.
  const canCreate = canWrite && getCategoryScope(auth.admin) === null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listCategories();
      setCats(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load categories', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (c) => {
    if (c.product_count > 0) {
      toast.push(`Reassign or disable the ${c.product_count} products in "${c.name}" before deleting it.`, 'error');
      return;
    }
    if (!confirm(`Delete category "${c.name}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteCategory(c.category_id);
      toast.push(`${c.name} deleted`);
      load();
    } catch (err) {
      toast.push(err.message || 'Could not delete category', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">Group products for browsing and filtering.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButtons resource="categories" label="Categories" />
          {canCreate && (
            <button onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
              <Plus className="w-4 h-4" /> Add category
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : cats.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No categories yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Icon</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Slug</th>
                <th className="px-4 py-3 text-left font-semibold">Parent</th>
                <th className="px-4 py-3 text-right font-semibold">Discount</th>
                <th className="px-4 py-3 text-right font-semibold">Products</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cats.map((c) => (
                <tr key={c.category_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-2xl">{c.icon}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.category_id}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{c.parent_category_id || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {Number(c.discount_percent) > 0 ? (
                      <span className="inline-block bg-violet-50 text-violet-700 border border-violet-200 font-semibold text-xs px-2 py-0.5 rounded-md">
                        {Number(c.discount_percent).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.product_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn label="Edit" onClick={() => setEditTarget(c)} disabled={!canWrite}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn label={c.product_count > 0 ? `${c.product_count} products still reference this — cannot delete` : 'Delete'}
                        variant="danger" disabled={!canWrite || c.product_count > 0}
                        onClick={() => onDelete(c)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <CategoryFormModal open={createOpen} categories={cats} onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); load(); }} />
      <CategoryFormModal target={editTarget} categories={cats} onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); load(); }} />
    </div>
  );
}

function CategoryFormModal({ open, target, categories, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!target;
  const visible = open || isEdit;

  const [form, setForm] = useState({ category_id: '', name: '', icon: '🥬', parent_category_id: '', discount_percent: '0', translations: {} });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (isEdit) {
      setForm({
        category_id: target.category_id,
        name: target.name,
        icon: target.icon,
        parent_category_id: target.parent_category_id || '',
        discount_percent: String(target.discount_percent ?? 0),
        translations: target.translations || {},
      });
    } else {
      setForm({ category_id: '', name: '', icon: '🥬', parent_category_id: '', discount_percent: '0', translations: {} });
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, target?.category_id]);

  if (!visible) return null;

  // Set-equality for the JSON translations shape — only PUT it when something
  // actually changed. Stringified compare is fine for the tiny payloads here.
  const sameTrans = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      if (isEdit) {
        const changes = {};
        if (form.name !== target.name) changes.name = form.name;
        if (form.icon !== target.icon) changes.icon = form.icon;
        const newParent = form.parent_category_id || null;
        if (newParent !== (target.parent_category_id || null)) changes.parent_category_id = newParent;
        const newDiscount = Number(form.discount_percent) || 0;
        if (newDiscount !== Number(target.discount_percent ?? 0)) changes.discount_percent = newDiscount;
        if (!sameTrans(form.translations, target.translations)) {
          changes.translations = Object.keys(form.translations || {}).length === 0 ? null : form.translations;
        }
        if (Object.keys(changes).length === 0) { onClose(); return; }
        await adminApi.updateCategory(target.category_id, changes);
      } else {
        const payload = {
          name: form.name,
          icon: form.icon,
          parent_category_id: form.parent_category_id || null,
          discount_percent: Number(form.discount_percent) || 0,
          translations: Object.keys(form.translations || {}).length === 0 ? null : form.translations,
        };
        if (form.category_id.trim()) payload.category_id = form.category_id.trim();
        await adminApi.createCategory(payload);
      }
      toast.push(isEdit ? 'Category updated' : 'Category created');
      onSaved();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Parents: every category except the one being edited (avoid self-parent).
  const parentOptions = categories.filter((c) => !isEdit || c.category_id !== target.category_id);

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${target.name}` : 'Add category'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <TranslatedTextField
            label="Name"
            field="name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            translations={form.translations}
            onTranslationsChange={(translations) => setForm((f) => ({ ...f, translations }))}
            error={errors.name} />
          <Field label="Icon (emoji)" error={errors.icon}>
            <TextInput required value={form.icon} error={errors.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
          </Field>
        </div>

        {!isEdit && (
          <Field label="Slug (optional)" hint='Auto-generated from name if blank. Lowercase letters, digits and hyphens.' error={errors.category_id}>
            <TextInput value={form.category_id} error={errors.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} />
          </Field>
        )}

        <Field label="Parent category" hint="Optional — for nested groupings.">
          <SelectInput value={form.parent_category_id}
            onChange={(e) => setForm((f) => ({ ...f, parent_category_id: e.target.value }))}>
            <option value="">— None —</option>
            {parentOptions.map((c) => <option key={c.category_id} value={c.category_id}>{c.icon} {c.name}</option>)}
          </SelectInput>
        </Field>

        <Field label="Discount (%)" error={errors.discount_percent}
          hint="0-100. Applied to every product in this category. Combined with per-product and platform-wide discounts — the largest of the three wins for each SKU.">
          <TextInput type="number" step="1" min="0" max="100" value={form.discount_percent} error={errors.discount_percent}
            onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))} />
        </Field>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Create category')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// COUPONS — master list + create/edit modal
// ============================================================
const COUPON_STATUS_FILTERS = ['Active', 'Inactive', 'Upcoming', 'Expired', 'Exhausted'];

function AdminCouponsPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', type: '', status: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const canWrite = hasPermission(auth.admin, 'coupons');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listCoupons(filters);
      setRows(r.data);
      setSummary(r.summary);
    } catch (err) {
      toast.push(err.message || 'Could not load coupons', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  const onToggleActive = async (c) => {
    try {
      await adminApi.updateCoupon(c.coupon_id, { is_active: !c.is_active });
      toast.push(`${c.code} ${c.is_active ? 'paused' : 'activated'}`);
      load();
    } catch (err) {
      toast.push(err.message || 'Could not toggle coupon', 'error');
    }
  };

  const onDelete = async (c) => {
    if (c.used_count > 0) {
      toast.push(`${c.code} has been redeemed ${c.used_count} time(s). Set it Inactive instead.`, 'error');
      return;
    }
    if (!confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
    try {
      await adminApi.deleteCoupon(c.coupon_id);
      toast.push(`${c.code} deleted`);
      load();
    } catch (err) {
      toast.push(err.message || 'Could not delete coupon', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Coupons</h1>
          <p className="text-sm text-slate-500 mt-1">Promo codes redeemed at cart checkout.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButtons resource="coupons" label="Coupons" />
          {canWrite && (
            <button onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
              <Plus className="w-4 h-4" /> Create coupon
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid sm:grid-cols-4 gap-3 mb-4">
          <SummaryCard icon={Ticket} tone="emerald" label="All coupons" value={summary.total}
            active={!filters.status}
            onClick={() => setFilters((f) => ({ ...f, status: '' }))} />
          <SummaryCard icon={CheckCircle2} tone="emerald" label="Active" value={summary.active}
            active={filters.status === 'Active'}
            onClick={() => setFilters((f) => ({ ...f, status: 'Active' }))} />
          <SummaryCard icon={AlertTriangle} tone="amber" label="Expired" value={summary.expired}
            active={filters.status === 'Expired'}
            onClick={() => setFilters((f) => ({ ...f, status: 'Expired' }))} />
          <SummaryCard icon={PackageX} tone="red" label="Exhausted" value={summary.exhausted}
            active={filters.status === 'Exhausted'}
            onClick={() => setFilters((f) => ({ ...f, status: 'Exhausted' }))} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Search code…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400 uppercase placeholder:normal-case" />
        <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All types</option>
          <option value="PERCENT">Percent</option>
          <option value="FLAT">Flat</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All status</option>
          {COUPON_STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No coupons match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-left font-semibold">Discount</th>
                <th className="px-4 py-3 text-right font-semibold">Min order</th>
                <th className="px-4 py-3 text-right font-semibold">Used</th>
                <th className="px-4 py-3 text-left font-semibold">Validity</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.coupon_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900">{c.code}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {c.type === 'PERCENT' ? `${c.value}% off` : `₹${c.value.toFixed(2)} off`}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {c.min_order > 0 ? `₹${c.min_order.toFixed(0)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {c.used_count}{c.max_uses != null ? <span className="text-slate-400"> / {c.max_uses}</span> : ''}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>{shortDate(c.valid_from)}</div>
                    <div>{c.valid_until ? `→ ${shortDate(c.valid_until)}` : '→ no expiry'}</div>
                  </td>
                  <td className="px-4 py-3"><CouponStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn label={c.is_active ? 'Pause' : 'Activate'}
                        onClick={() => onToggleActive(c)} disabled={!canWrite}>
                        <Power className={`w-3.5 h-3.5 ${c.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
                      </IconBtn>
                      <IconBtn label="Edit" onClick={() => setEditTarget(c)} disabled={!canWrite}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn label={c.used_count > 0 ? 'Already redeemed — set Inactive instead' : 'Delete'}
                        variant="danger" disabled={!canWrite || c.used_count > 0}
                        onClick={() => onDelete(c)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <CouponFormModal open={createOpen} onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); load(); }} />
      <CouponFormModal target={editTarget} onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); load(); }} />
    </div>
  );
}

function CouponStatusBadge({ status }) {
  const map = {
    Active: 'bg-emerald-100 text-emerald-700',
    Inactive: 'bg-stone-200 text-stone-600',
    Upcoming: 'bg-blue-100 text-blue-700',
    Expired: 'bg-amber-100 text-amber-700',
    Exhausted: 'bg-purple-100 text-purple-700',
  };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>;
}

const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// HTML datetime-local needs "yyyy-MM-ddTHH:mm" without the Z. Browser interprets
// the value in local time; we send full ISO back to the server.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => v ? new Date(v).toISOString() : null;

function CouponFormModal({ open, target, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!target;
  const visible = open || isEdit;

  const blank = {
    code: '', type: 'PERCENT', value: '', min_order: '0',
    max_uses: '', valid_from: '', valid_until: '', is_active: true,
  };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (isEdit) {
      setForm({
        code: target.code,
        type: target.type,
        value: String(target.value),
        min_order: String(target.min_order),
        max_uses: target.max_uses != null ? String(target.max_uses) : '',
        valid_from: toLocalInput(target.valid_from),
        valid_until: toLocalInput(target.valid_until),
        is_active: target.is_active,
      });
    } else {
      setForm(blank);
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, target?.coupon_id]);

  if (!visible) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value),
      min_order: Number(form.min_order || 0),
      max_uses: form.max_uses === '' ? null : Number(form.max_uses),
      valid_from: fromLocalInput(form.valid_from),
      valid_until: fromLocalInput(form.valid_until),
      is_active: form.is_active,
    };
    try {
      if (isEdit) await adminApi.updateCoupon(target.coupon_id, payload);
      else await adminApi.createCoupon(payload);
      toast.push(isEdit ? 'Coupon updated' : `${payload.code} created`);
      onSaved();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${target.code}` : 'Create coupon'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Code" hint="A-Z, 0-9, hyphen, underscore." error={errors.code}>
            <TextInput required value={form.code} error={errors.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="font-mono" />
          </Field>
          <Field label="Type" error={errors.type}>
            <SelectInput value={form.type} error={errors.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">Flat amount off</option>
            </SelectInput>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={form.type === 'PERCENT' ? 'Value (%)' : 'Value (₹)'} error={errors.value}
            hint={form.type === 'PERCENT' ? 'Between 1 and 100.' : 'Flat amount in rupees.'}>
            <TextInput type="number" step="0.01" min="0" required value={form.value} error={errors.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </Field>
          <Field label="Min order (₹)" error={errors.min_order} hint="0 = no minimum.">
            <TextInput type="number" step="0.01" min="0" value={form.min_order} error={errors.min_order}
              onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))} />
          </Field>
        </div>

        <Field label="Max redemptions" error={errors.max_uses} hint="Leave blank for unlimited.">
          <TextInput type="number" min="1" step="1" value={form.max_uses} error={errors.max_uses}
            onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Valid from" error={errors.valid_from} hint="Defaults to now if blank.">
            <TextInput type="datetime-local" value={form.valid_from} error={errors.valid_from}
              onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
          </Field>
          <Field label="Valid until" error={errors.valid_until} hint="Blank = never expires.">
            <TextInput type="datetime-local" value={form.valid_until} error={errors.valid_until}
              onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="w-4 h-4" />
          Active (customers can redeem)
        </label>

        {isEdit && target.used_count > 0 && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg p-3">
            This coupon has already been redeemed {target.used_count} time(s). Editing the value or limits won't affect past orders.
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Create coupon')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// CUSTOMERS — master list + detail drawer + admin status actions
// ============================================================
function CustomerStatusBadge({ status }) {
  const map = {
    Active: 'bg-emerald-100 text-emerald-700',
    Suspended: 'bg-amber-100 text-amber-700',
    Inactive: 'bg-stone-200 text-stone-600',
    Deleted: 'bg-red-100 text-red-700',
  };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>;
}

const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function AdminCustomersPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', status: '', page: 1, limit: 20 });
  const [detailId, setDetailId] = useState(null);

  const canWrite = hasPermission(auth.admin, 'customers');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listCustomers(filters);
      setRows(r.data);
      setMeta(r.meta);
      setSummary(r.summary);
    } catch (err) {
      toast.push(err.message || 'Could not load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">Lookup, order history, account status.</p>
        </div>
        <ExportButtons resource="customers" label="Customers" />
      </div>

      {summary && (() => {
        const isAll = !filters.status;
        return (
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <SummaryCard icon={Users} tone="emerald" active={isAll}
              label="All customers" value={summary.total}
              onClick={() => setFilters((f) => ({ ...f, status: '', page: 1 }))} />
            <SummaryCard icon={CheckCircle2} tone="emerald" active={filters.status === 'Active'}
              label="Active" value={summary.Active}
              onClick={() => setFilters((f) => ({ ...f, status: 'Active', page: 1 }))} />
            <SummaryCard icon={AlertTriangle} tone="amber" active={filters.status === 'Suspended'}
              label="Suspended" value={summary.Suspended}
              onClick={() => setFilters((f) => ({ ...f, status: 'Suspended', page: 1 }))} />
            <SummaryCard icon={UserX} tone="red" active={filters.status === 'Deleted'}
              label="Deleted" value={summary.Deleted}
              onClick={() => setFilters((f) => ({ ...f, status: 'Deleted', page: 1 }))} />
          </div>
        );
      })()}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
          placeholder="Search name, email or phone…"
          className="flex-1 min-w-[260px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All status</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Deleted">Deleted</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No customers match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Contact</th>
                <th className="px-4 py-3 text-left font-semibold">Verified</th>
                <th className="px-4 py-3 text-right font-semibold">Loyalty</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.customer_id} className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setDetailId(c.customer_id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white text-xs font-semibold">
                        {c.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="font-medium text-slate-900">{c.full_name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="text-xs">{c.email}</div>
                    <div className="text-xs text-slate-500">{c.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.email_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>email</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.phone_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>phone</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.loyalty_points}</td>
                  <td className="px-4 py-3"><CustomerStatusBadge status={c.account_status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{shortDate(c.created_at)}</td>
                  <td className="px-4 py-3 text-right text-xs text-emerald-700 font-medium">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>Page {meta.page} of {meta.totalPages} · {meta.total} total</div>
            <div className="flex gap-1">
              <button disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Prev</button>
              <button disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      <CustomerDetailModal customerId={detailId} onClose={() => setDetailId(null)}
        onChanged={() => load()} canWrite={canWrite} />
    </div>
  );
}

function CustomerDetailModal({ customerId, onClose, onChanged, canWrite }) {
  const auth = useAdminAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // The customer-password-reset endpoint is gated to admins who hold the
  // 'admin-users' permission (mirrors backend adminCustomers.js).
  const canResetCustomerPassword = hasPermission(auth.admin, 'admin-users');

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const r = await adminApi.getCustomer(customerId);
      setData(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load customer', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [customerId, toast, onClose]);

  useEffect(() => { load(); }, [load]);

  if (!customerId) return null;

  const onStatusChange = async (newStatus) => {
    if (!confirm(`Change ${data.customer.full_name}'s status to ${newStatus}? ${newStatus !== 'Active' ? 'Their active sessions will be revoked.' : ''}`)) return;
    try {
      await adminApi.updateCustomerStatus(customerId, newStatus);
      toast.push(`Status updated to ${newStatus}`);
      load();
      onChanged();
    } catch (err) {
      toast.push(err.message || 'Could not update status', 'error');
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/60">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Customer details</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {loading || !data ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header card */}
            <div className="bg-slate-50 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xl font-bold">
                  {data.customer.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg text-slate-900 truncate">{data.customer.full_name}</h3>
                    <CustomerStatusBadge status={data.customer.account_status} />
                  </div>
                  <div className="text-sm text-slate-600 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {data.customer.email}</div>
                  <div className="text-sm text-slate-600 flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5" /> {data.customer.phone}</div>
                  <div className="text-xs text-slate-500 mt-2">
                    Joined {shortDate(data.customer.created_at)} · Last login {data.customer.last_login ? shortDate(data.customer.last_login) : 'never'}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase font-semibold">
                  <ShoppingBag className="w-3.5 h-3.5" /> Orders
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{data.stats.total_orders}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase font-semibold">
                  <IndianRupee className="w-3.5 h-3.5" /> Lifetime
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{formatINR(data.stats.lifetime_spend)}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase font-semibold">
                  <IndianRupee className="w-3.5 h-3.5" /> Avg order
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{formatINR(data.stats.avg_order_value)}</div>
              </div>
            </div>

            {/* Status actions */}
            {canWrite && (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Account actions</div>
                <div className="flex flex-wrap gap-2">
                  {data.customer.account_status !== 'Active' && (
                    <button onClick={() => onStatusChange('Active')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                    </button>
                  )}
                  {data.customer.account_status === 'Active' && (
                    <button onClick={() => onStatusChange('Suspended')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100">
                      <AlertTriangle className="w-3.5 h-3.5" /> Suspend
                    </button>
                  )}
                  {data.customer.account_status !== 'Deleted' && (
                    <button onClick={() => onStatusChange('Deleted')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">
                      <UserX className="w-3.5 h-3.5" /> Mark deleted
                    </button>
                  )}
                  {canResetCustomerPassword && (
                    <button onClick={() => setResetOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
                      <Key className="w-3.5 h-3.5" /> Reset password
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Suspending or deleting revokes the customer's active sessions.</p>
              </div>
            )}

            {/* Addresses */}
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                <MapPin className="w-3.5 h-3.5" /> Saved addresses ({data.addresses.length})
              </div>
              {data.addresses.length === 0 ? (
                <div className="text-sm text-slate-500 italic px-3 py-2">No saved addresses.</div>
              ) : (
                <div className="space-y-2">
                  {data.addresses.map((a) => (
                    <div key={a.address_id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">{a.label}</span>
                        {a.is_default && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">DEFAULT</span>}
                      </div>
                      <div className="text-slate-700">{a.recipient_name} · {a.recipient_phone}</div>
                      <div className="text-xs text-slate-500">
                        {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''} · {a.city}, {a.state} - {a.pincode}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Customer type + Credit / Ledger (BRD §1, §2, §5) */}
            <CustomerTypeAndCreditSection
              customer={data.customer}
              canWrite={canWrite}
              onCustomerUpdated={(updated) => setData((d) => ({ ...d, customer: updated }))} />

            {/* Recent orders */}
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                <ShoppingBag className="w-3.5 h-3.5" /> Recent orders ({data.orders.length})
              </div>
              {data.orders.length === 0 ? (
                <div className="text-sm text-slate-500 italic px-3 py-2">No orders placed yet.</div>
              ) : (
                <div className="space-y-2">
                  {data.orders.map((o) => (
                    <div key={o.order_id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-slate-500">{o.order_id}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{o.order_status}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>{shortDate(o.order_date)} · {o.items.length} {o.items.length === 1 ? 'item' : 'items'}</span>
                        <span className="font-semibold text-slate-900">{formatINR(o.total_amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {data && (
        <ResetCustomerPasswordModal open={resetOpen} customer={data.customer}
          onClose={() => setResetOpen(false)}
          onDone={() => { setResetOpen(false); toast.push(`Password reset for ${data.customer.email}`); }} />
      )}
    </div>
  );
}

// ============================================================
// CUSTOMER TYPE + CREDIT (BRD §1, §2, §5, §7)
// Composite section rendered inside the customer detail drawer. Lets the
// admin flip B2C ↔ B2B, configure credit, view the live ledger, and
// record a payment — all of which roll up into the same /credit GET so a
// post-save the section re-renders with fresh state in one round-trip.
// ============================================================
function CustomerTypeAndCreditSection({ customer, canWrite, onCustomerUpdated }) {
  const toast = useToast();
  const [creditData, setCreditData] = useState(null); // { config, state, customer_type }
  const [loading, setLoading] = useState(true);
  const [showLedger, setShowLedger] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.getCustomerCredit(customer.customer_id);
      setCreditData(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load credit', 'error');
    } finally {
      setLoading(false);
    }
  }, [customer.customer_id, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading || !creditData) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 animate-pulse h-32" />
    );
  }

  return (
    <div className="space-y-4">
      <CustomerTypeRow customer={customer} canWrite={canWrite} onUpdated={onCustomerUpdated} />
      <CreditConfigCard customer={customer} canWrite={canWrite}
        creditData={creditData} onChanged={setCreditData} />
      {creditData.state?.enabled && (
        <PendingPaymentsCard
          customerId={customer.customer_id}
          pending={creditData.pending_invoices || []}
          recentPayments={creditData.recent_payments || []} />
      )}
      <CreditLedgerCard customer={customer} canWrite={canWrite}
        expanded={showLedger} onToggle={() => setShowLedger((v) => !v)}
        onChanged={() => load()} />
    </div>
  );
}

// Always-visible summary of pending invoices + recent payments. Lives
// between the credit-config card and the (collapsed) ledger so admins
// can see the customer's outstanding picture without expanding history.
// Mirrors the customer-facing /account/credit view.
function PendingPaymentsCard({ customerId, pending, recentPayments }) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(null);
  const totalPending = pending.reduce(
    (acc, t) => acc + (Number(t.amount) - Number(t.amount_paid)), 0,
  );

  const onReceipt = async (paymentId) => {
    setDownloading(paymentId);
    try {
      await adminApi.downloadPaymentReceipt(customerId, paymentId);
    } catch (err) {
      toast.push(err.message || 'Could not download receipt', 'error');
    } finally {
      setDownloading(null);
    }
  };
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">
          Pending payments ({pending.length})
        </div>
        {pending.length > 0 && (
          <div className="text-sm font-bold text-slate-900">₹{totalPending.toFixed(0)} owed</div>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          All caught up — no pending invoices.
        </div>
      ) : (
        <div className="space-y-1.5">
          {pending.map((inv) => {
            const owed = Number(inv.amount) - Number(inv.amount_paid);
            return (
              <div key={inv.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs ${
                inv.is_overdue ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-slate-50/50'
              }`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-slate-500">{inv.order_id || inv.id.slice(0, 8)}</span>
                    {inv.is_overdue ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                        OVERDUE · {inv.days_overdue}d
                      </span>
                    ) : inv.status === 'PARTIALLY_PAID' ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        PARTIAL
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        PENDING
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    {Number(inv.amount_paid) > 0 && (
                      <span className="text-slate-500"> · paid ₹{Number(inv.amount_paid).toFixed(0)} of ₹{Number(inv.amount).toFixed(0)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold ${inv.is_overdue ? 'text-rose-700' : 'text-slate-900'}`}>
                    ₹{owed.toFixed(0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recentPayments.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
            Recent payments received
          </div>
          <div className="space-y-1">
            {recentPayments.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 min-w-0 flex-1 truncate">
                  {new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  <span className="text-slate-400"> · {p.mode.replace('_', ' ').toLowerCase()}</span>
                  {p.reference_no && <span className="text-slate-400 font-mono"> · {p.reference_no}</span>}
                </span>
                <span className="font-semibold text-emerald-700">₹{Number(p.amount).toFixed(0)}</span>
                <button onClick={() => onReceipt(p.id)} disabled={downloading === p.id}
                  className="text-emerald-700 hover:text-emerald-800 disabled:opacity-50 inline-flex items-center"
                  title="Download PDF receipt">
                  {downloading === p.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileText className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerTypeRow({ customer, canWrite, onUpdated }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(customer.customer_type || 'B2C');
  const [bizName, setBizName] = useState(customer.business_name || '');
  const [gstin, setGstin] = useState(customer.gstin || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminApi.updateCustomerType(customer.customer_id, {
        customer_type: type,
        business_name: type === 'B2B' ? (bizName.trim() || null) : null,
        gstin: type === 'B2B' ? (gstin.trim() || null) : null,
      });
      onUpdated?.(r.data);
      toast.push('Customer type updated');
      setEditing(false);
    } catch (err) {
      toast.push(err.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Customer type</div>
        {canWrite && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">Edit</button>
        )}
      </div>
      {!editing ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-1 rounded ${customer.customer_type === 'B2B' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {customer.customer_type || 'B2C'}
          </span>
          {customer.customer_type === 'B2B' && customer.business_name && (
            <span className="text-sm text-slate-700">· {customer.business_name}</span>
          )}
          {customer.customer_type === 'B2B' && customer.gstin && (
            <span className="text-xs text-slate-500 font-mono">· GSTIN {customer.gstin}</span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setType('B2C')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border-2 ${type === 'B2C' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'}`}>
              B2C — Individual
            </button>
            <button onClick={() => setType('B2B')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border-2 ${type === 'B2B' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>
              B2B — Business
            </button>
          </div>
          {type === 'B2B' && (
            <>
              <input value={bizName} onChange={(e) => setBizName(e.target.value)} maxLength={150}
                placeholder="Business name"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15}
                placeholder="GSTIN (15 chars)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
            </>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreditConfigCard({ customer, canWrite, creditData, onChanged }) {
  const toast = useToast();
  const { config, state } = creditData;
  const [draft, setDraft] = useState({
    credit_enabled: config.credit_enabled,
    credit_limit: String(config.credit_limit || 0),
    payment_terms_days: String(config.payment_terms_days || 30),
    terms_start_from: config.terms_start_from || 'delivery',
    status: config.status === 'inactive' ? 'active' : config.status,
    notes: config.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminApi.updateCustomerCredit(customer.customer_id, {
        credit_enabled: draft.credit_enabled,
        credit_limit: Number(draft.credit_limit),
        payment_terms_days: Number(draft.payment_terms_days),
        terms_start_from: draft.terms_start_from,
        status: draft.status,
        notes: draft.notes.trim() || null,
      });
      onChanged({ ...creditData, config: r.data.config, state: r.data.state });
      toast.push('Credit settings saved');
    } catch (err) {
      toast.push(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Utilisation bar tone: emerald < 70%, amber 70–90%, rose 90%+.
  const used = state.outstanding;
  const limit = state.limit || 1; // avoid div/0
  const pct = Math.min(100, (used / limit) * 100);
  const barTone = pct < 70 ? 'bg-emerald-500' : pct < 90 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Credit / Pay-Later</div>
        {state.enabled && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${state.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {state.status === 'blocked' ? 'BLOCKED' : 'ACTIVE'}
          </span>
        )}
      </div>

      {state.enabled && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-50 rounded p-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Outstanding</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">₹{state.outstanding.toFixed(0)}</div>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Available</div>
              <div className="text-base font-bold text-emerald-700 mt-0.5">₹{state.available.toFixed(0)}</div>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Overdue</div>
              <div className={`text-base font-bold mt-0.5 ${state.overdueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {state.overdueCount > 0 ? `₹${state.overdueAmount.toFixed(0)}` : '—'}
              </div>
              {state.overdueCount > 0 && (
                <div className="text-[10px] text-rose-600 mt-0.5">{state.oldestOverdueDays}d oldest</div>
              )}
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${barTone} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500">
            ₹{state.outstanding.toFixed(0)} of ₹{state.limit.toFixed(0)} ({pct.toFixed(0)}%)
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.credit_enabled} disabled={!canWrite}
            onChange={(e) => setDraft((d) => ({ ...d, credit_enabled: e.target.checked }))}
            className="w-4 h-4" />
          Credit enabled
        </label>

        {draft.credit_enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Credit limit (₹)</label>
                <input type="number" min="0" step="100" value={draft.credit_limit} disabled={!canWrite}
                  onChange={(e) => setDraft((d) => ({ ...d, credit_limit: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Net days</label>
                <input type="number" min="0" max="365" step="1" value={draft.payment_terms_days} disabled={!canWrite}
                  onChange={(e) => setDraft((d) => ({ ...d, payment_terms_days: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Terms start from</label>
              <select value={draft.terms_start_from} disabled={!canWrite}
                onChange={(e) => setDraft((d) => ({ ...d, terms_start_from: e.target.value }))}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                <option value="delivery">Delivery date</option>
                <option value="invoice">Invoice / order date</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select value={draft.status} disabled={!canWrite}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                <option value="active">Active — accepting credit orders</option>
                <option value="blocked">Blocked — no new credit orders</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Internal notes</label>
              <textarea value={draft.notes} disabled={!canWrite} rows={2} maxLength={1000}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder='e.g. "Approved by CFO on 12-May-2026"'
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" />
            </div>
          </>
        )}

        {canWrite && (
          <button onClick={save} disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold">
            {saving ? 'Saving…' : 'Save credit settings'}
          </button>
        )}
      </div>
    </div>
  );
}

function CreditLedgerCard({ customer, canWrite, expanded, onToggle, onChanged }) {
  const toast = useToast();
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    adminApi.getCustomerLedger(customer.customer_id)
      .then((r) => setLedger(r.data))
      .catch((err) => toast.push(err.message || 'Could not load ledger', 'error'))
      .finally(() => setLoading(false));
  }, [expanded, customer.customer_id, toast]);

  const reload = () => {
    setLoading(true);
    adminApi.getCustomerLedger(customer.customer_id)
      .then((r) => setLedger(r.data))
      .finally(() => setLoading(false));
    onChanged?.();
  };

  const onExport = async (format) => {
    setExporting(true);
    try {
      await adminApi.downloadLedger(customer.customer_id, format);
    } catch (err) {
      toast.push(err.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Ledger</div>
        <button onClick={onToggle} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
          {expanded ? 'Hide ledger' : 'Show ledger'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3">
          {loading ? (
            <div className="h-24 bg-slate-100 rounded animate-pulse" />
          ) : ledger ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {canWrite && ledger.state.enabled && (
                  <button onClick={() => setPaymentOpen(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
                    + Record payment
                  </button>
                )}
                {canWrite && (
                  <button onClick={() => setAdjustmentOpen(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">
                    + Adjustment
                  </button>
                )}
                {ledger.transactions.length > 0 && (
                  <>
                    <button onClick={() => onExport('xlsx')} disabled={exporting}
                      className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button onClick={() => onExport('pdf')} disabled={exporting}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                      <FileText className="w-3.5 h-3.5" /> PDF
                    </button>
                  </>
                )}
              </div>

              {ledger.transactions.length === 0 ? (
                <div className="text-xs text-slate-500 italic px-2 py-3">No credit activity yet.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-left">
                        <th className="px-2 py-1.5 font-semibold text-slate-600">Date</th>
                        <th className="px-2 py-1.5 font-semibold text-slate-600">Type</th>
                        <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Amount</th>
                        <th className="px-2 py-1.5 font-semibold text-slate-600 text-right">Balance</th>
                        <th className="px-2 py-1.5 font-semibold text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ledger.transactions].reverse().map((t) => (
                        <tr key={t.id} className={`border-t border-slate-100 ${t.is_overdue ? 'bg-rose-50/40' : ''}`}>
                          <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">
                            {shortDate(t.created_at)}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              t.type === 'DEBIT' ? 'bg-rose-100 text-rose-700'
                                : t.type === 'CREDIT' ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>{t.type}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-slate-900">
                            {t.type === 'CREDIT' ? '−' : ''}₹{Number(t.amount).toFixed(0)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-700">
                            ₹{Number(t.running_balance).toFixed(0)}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`text-[10px] ${t.is_overdue ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>
                              {t.is_overdue ? `OVERDUE ${t.days_overdue}d` : t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {paymentOpen && (
        <RecordPaymentModal
          customer={customer}
          pendingInvoices={(ledger?.transactions || []).filter((t) => t.type === 'DEBIT' && t.status !== 'PAID')}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => { setPaymentOpen(false); reload(); }} />
      )}
      {adjustmentOpen && (
        <CreditAdjustmentModal
          customer={customer}
          onClose={() => setAdjustmentOpen(false)}
          onSaved={() => { setAdjustmentOpen(false); reload(); }} />
      )}
    </div>
  );
}

// BRD §5 — manual ledger adjustments. Direction toggle keeps the API
// signed-amount contract simple: positive raises outstanding (extra
// charge), negative lowers it (write-off / discount / return credit).
function CreditAdjustmentModal({ customer, onClose, onSaved }) {
  const toast = useToast();
  const [direction, setDirection] = useState('credit'); // 'credit' = lower, 'debit' = raise
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.push('Enter a positive amount', 'error'); return; }
    if (!reason.trim()) { toast.push('A reason is required', 'error'); return; }
    setSubmitting(true);
    try {
      const signed = direction === 'credit' ? -value : value;
      await adminApi.recordCreditAdjustment(customer.customer_id, { amount: signed, reason: reason.trim() });
      toast.push('Adjustment recorded');
      onSaved();
    } catch (err) {
      toast.push(err.message || 'Could not record adjustment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-900">Manual adjustment</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded p-3 text-xs text-slate-700 leading-relaxed">
            Adjustments are append-only ledger entries with an audit trail. Use these for write-offs, return credits, opening-balance corrections, or one-off charges that don't tie to an order.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Direction</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDirection('credit')}
                className={`text-left rounded-lg p-2 border-2 ${direction === 'credit' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="text-xs font-bold text-slate-900">Credit (lower balance)</div>
                <div className="text-[10px] text-slate-600">Write-off, discount, return credit</div>
              </button>
              <button type="button" onClick={() => setDirection('debit')}
                className={`text-left rounded-lg p-2 border-2 ${direction === 'debit' ? 'border-rose-500 bg-rose-50' : 'border-slate-200'}`}>
                <div className="text-xs font-bold text-slate-900">Debit (raise balance)</div>
                <div className="text-[10px] text-slate-600">One-off charge, opening balance</div>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹)</label>
            <input type="number" min="0" step="0.01" value={amount} required
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason (required)</label>
            <textarea value={reason} rows={2} maxLength={500} required
              onChange={(e) => setReason(e.target.value)}
              placeholder='e.g. "Goodwill discount per CFO approval"'
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={submitting}
            className={`px-3 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
              direction === 'credit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}>
            {submitting ? 'Saving…' : 'Record adjustment'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecordPaymentModal({ customer, pendingInvoices, onClose, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.push('Enter a positive amount', 'error'); return; }
    setSubmitting(true);
    try {
      const r = await adminApi.recordPayment(customer.customer_id, {
        amount: value,
        payment_date: paymentDate,
        mode,
        reference_no: referenceNo.trim() || null,
        notes: notes.trim() || null,
      });
      const allocCount = (r.data.allocations || []).length;
      const unalloc = r.data.unallocated || 0;
      toast.push(
        unalloc > 0
          ? `Payment recorded. Applied to ${allocCount} invoice${allocCount === 1 ? '' : 's'}; ₹${unalloc.toFixed(0)} unallocated.`
          : `Payment recorded. Applied to ${allocCount} invoice${allocCount === 1 ? '' : 's'}.`,
      );
      onSaved();
    } catch (err) {
      toast.push(err.message || 'Could not record payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalOutstanding = pendingInvoices.reduce(
    (acc, t) => acc + (Number(t.amount) - Number(t.amount_paid)),
    0,
  );

  return (
    <div onClick={onBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-900">Record payment</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded p-3 text-xs text-slate-700">
            Outstanding: <span className="font-bold">₹{totalOutstanding.toFixed(0)}</span> across {pendingInvoices.length} invoice{pendingInvoices.length === 1 ? '' : 's'}.
            Payment will be applied FIFO (oldest due first).
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹)</label>
            <input type="number" min="0" step="0.01" value={amount} required
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input type="date" value={paymentDate} required
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference no. (optional)</label>
            <input type="text" value={referenceNo} maxLength={100}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="UTR / cheque no. / transaction id"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (optional)</label>
            <textarea value={notes} rows={2} maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={submitting}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold">
            {submitting ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetCustomerPasswordModal({ open, customer, onClose, onDone }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setPassword(''); setErrors({}); } }, [open]);
  if (!open) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      await adminApi.resetCustomerPassword(customer.customer_id, password);
      onDone();
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password — ${customer.email}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3">
          The customer's existing sessions will be revoked. Share the new password through a secure channel; the customer should change it on next login.
        </div>
        <Field label="New password" hint={PASSWORD_HINT} error={errors.password}>
          <TextInput type="text" required value={password} error={errors.password}
            onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm">
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// ORDERS — admin order management (slice 9, FR-ADM-04)
// ============================================================

const ORDER_STATUSES = ['Placed', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled', 'ReturnRequested'];
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Refunded'];

// Mirrors backend LEGAL_TRANSITIONS in adminOrders.js. The server is the source
// of truth — this is just to hide buttons the API would reject anyway.
const LEGAL_TRANSITIONS = {
  'Placed':           ['Confirmed', 'Cancelled'],
  'Confirmed':        ['Packed', 'Cancelled'],
  'Packed':           ['Out for Delivery', 'Cancelled'],
  'Out for Delivery': ['Delivered'],
  'Delivered':        [],
  'Cancelled':        [],
  'ReturnRequested':  [],
};

function OrderStatusBadge({ status }) {
  const tone = {
    'Placed':           'bg-blue-100 text-blue-700',
    'Confirmed':        'bg-cyan-100 text-cyan-700',
    'Packed':           'bg-violet-100 text-violet-700',
    'Out for Delivery': 'bg-amber-100 text-amber-700',
    'Delivered':        'bg-emerald-100 text-emerald-700',
    'Cancelled':        'bg-red-100 text-red-700',
    'ReturnRequested':  'bg-orange-100 text-orange-700',
  }[status] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}>{status}</span>
  );
}

function PaymentStatusBadge({ status }) {
  const tone = {
    'Paid':     'bg-emerald-100 text-emerald-700',
    'Pending':  'bg-amber-100 text-amber-700',
    'Failed':   'bg-red-100 text-red-700',
    'Refunded': 'bg-slate-200 text-slate-700',
  }[status] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>{status}</span>
  );
}

function AdminOrdersPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: '', status: '', payment_status: '', customer_email: '',
    from: '', to: '', page: 1, limit: 20,
  });
  const [detailOrder, setDetailOrder] = useState(null);

  const canWrite = hasPermission(auth.admin, 'orders');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Drop empty filters before sending — they generate noise in query strings.
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
      const r = await adminApi.listOrders(params);
      setOrders(r.data);
      setMeta(r.meta);
    } catch (err) {
      toast.push(err.message || 'Could not load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  // Any filter change resets to page 1 — staying on page 5 of a now-3-page result is confusing.
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  const clearFilters = () => setFilters({
    q: '', status: '', payment_status: '', customer_email: '',
    from: '', to: '', page: 1, limit: 20,
  });

  // After a status flip, splice the updated row in place so filters/pagination don't reset.
  const onOrderUpdated = (updated) => {
    setOrders((prev) => prev.map((o) => o.order_id === updated.order_id ? updated : o));
    setDetailOrder(updated);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="text-sm text-slate-600">
            Track and update order status.
            {!canWrite && <span className="text-amber-700"> Read-only — only Super/Operations roles can transition status.</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {meta && <div className="text-xs text-slate-500 self-center">Showing {orders.length} of {meta.total}</div>}
          <ExportButtons resource="orders" label="Orders" />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Order ID contains</label>
          <input value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="e.g. ORD-2024"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Customer email contains</label>
          <input value={filters.customer_email} onChange={(e) => setFilter('customer_email', e.target.value)} placeholder="e.g. ravi@"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Order status</label>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white">
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Payment status</label>
          <select value={filters.payment_status} onChange={(e) => setFilter('payment_status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white">
            <option value="">All</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">From date</label>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">To date</label>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
          <button onClick={clearFilters} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
            Clear filters
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-100 animate-pulse">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))}
              {!loading && orders.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No orders match the current filters.</td></tr>
              )}
              {!loading && orders.map((o) => (
                <tr key={o.order_id} className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => setDetailOrder(o)}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.order_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 truncate max-w-[14rem]">{o.customer?.full_name || '—'}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[14rem]">{o.customer?.email || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{shortDate(o.order_date)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{o.items.length}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatINR(o.total_amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <PaymentStatusBadge status={o.payment_status} />
                      <span className="text-[10px] text-slate-500">{o.payment_method}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><OrderStatusBadge status={o.order_status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); setDetailOrder(o); }}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-50 hover:bg-slate-50 font-semibold">
                Previous
              </button>
              <button disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-50 hover:bg-slate-50 font-semibold">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <OrderDetailDrawer order={detailOrder} onClose={() => setDetailOrder(null)}
        canWrite={canWrite} onUpdated={onOrderUpdated} />
    </div>
  );
}

function OrderDetailDrawer({ order, onClose, canWrite, onUpdated }) {
  const toast = useToast();
  const [transitionTo, setTransitionTo] = useState(null);

  if (!order) return null;

  const allowed = LEGAL_TRANSITIONS[order.order_status] || [];

  // Tax row only renders when the order actually had tax — vegetables are
  // GST-exempt today, but historical orders from the 5% window still show
  // their CGST/SGST so the drawer matches the printed invoice.
  const totals = [
    ['Subtotal', order.subtotal],
    ['Discount', -order.discount],
    ['Delivery', order.delivery_charge],
    ...(Number(order.tax) > 0 ? [['Tax', order.tax]] : []),
  ];

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/60">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900">Order details</h2>
            <p className="text-xs text-slate-500 font-mono truncate">{order.order_id}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded shrink-0">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <OrderStatusBadge status={order.order_status} />
              <PaymentStatusBadge status={order.payment_status} />
              <span className="text-xs text-slate-500">{order.payment_method}</span>
            </div>
            <div className="text-xs text-slate-500">Placed {shortDate(order.order_date)} · {order.delivery_slot}</div>
          </div>

          {canWrite && allowed.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Move to next status</div>
              <div className="flex flex-wrap gap-2">
                {allowed.map((s) => (
                  <button key={s} onClick={() => setTransitionTo(s)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                      s === 'Cancelled'
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}>
                    {s === 'Cancelled' ? 'Cancel order' : `Mark ${s}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Cancelling restores stock for every line item. The customer is notified by email/SMS for every transition.
              </p>
            </div>
          )}
          {canWrite && allowed.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
              This order is in a terminal state — no further status changes are allowed from the admin portal.
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Customer</div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
              <div className="font-semibold text-slate-900">{order.customer?.full_name || '—'}</div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5"><Mail className="w-3.5 h-3.5" /> {order.customer?.email || '—'}</div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5"><Phone className="w-3.5 h-3.5" /> {order.customer?.phone || '—'}</div>
            </div>
          </div>

          {order.address && (
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                <MapPin className="w-3.5 h-3.5" /> Delivery address
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm">
                <div className="font-semibold text-slate-900">{order.address.recipient_name} · {order.address.recipient_phone}</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {order.address.address_line1}{order.address.address_line2 ? `, ${order.address.address_line2}` : ''} · {order.address.city}, {order.address.state} - {order.address.pincode}
                </div>
                {order.address.landmark && (
                  <div className="text-xs text-slate-500 mt-0.5 italic">Landmark: {order.address.landmark}</div>
                )}
                {/* Map pin captured at checkout — the customer either
                    granted browser GPS or had a saved device pin. Tap-
                    targets a deep link the delivery person can open in
                    Google Maps on their phone (handles both web and
                    native maps app). Source label tells staff whether
                    to trust the pin precisely or treat it as an
                    approximate (pincode-centroid) hint. */}
                {order.address.latitude != null && order.address.longitude != null && (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
                    <a
                      href={`https://www.google.com/maps?q=${order.address.latitude},${order.address.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Open in Google Maps
                    </a>
                    {order.address.location_source === 'device' ? (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        Live GPS{order.address.location_accuracy ? ` ±${Math.round(order.address.location_accuracy)} m` : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        Approx. from address
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Items ({order.items.length})</div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100">
              {order.items.map((i) => (
                <div key={i.id} className="px-3 py-2 flex items-center justify-between text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {i.image && (
                      <span className="w-7 h-7 rounded bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                        <ProductImage src={i.image} alt={i.name} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{i.name}</div>
                      <div className="text-xs text-slate-500">{i.qty} × {formatINR(i.price)} · per {i.unit}</div>
                    </div>
                  </div>
                  <div className="font-semibold text-slate-900 whitespace-nowrap">{formatINR(i.line_total)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Open-box delivery photos — admin-only proof of delivery
              snapped at the customer's door. Hidden when none captured
              so unloaded / pre-delivery orders don't show a stub. */}
          {Array.isArray(order.delivery_photos) && order.delivery_photos.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                <Camera className="w-3.5 h-3.5" /> Open-box photos ({order.delivery_photos.length})
              </div>
              <div className="grid grid-cols-4 gap-2">
                {order.delivery_photos.map((p, idx) => {
                  const resolved = resolveImageUrl(p.url) || p.url;
                  return (
                    <a key={idx} href={resolved} target="_blank" rel="noopener noreferrer"
                      className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 group block">
                      <img src={resolved} alt={`Open-box ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    </a>
                  );
                })}
              </div>
              {order.delivery_photos[0]?.uploaded_by && (
                <div className="mt-1.5 text-[10px] text-slate-500">
                  Uploaded by {order.delivery_photos[0].uploaded_by}
                  {order.delivery_photos[0].uploaded_at && ` · ${new Date(order.delivery_photos[0].uploaded_at).toLocaleString('en-IN')}`}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Totals</div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm space-y-1.5">
              {totals.map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-600">{label}</span>
                  <span className={`font-medium ${val < 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                    {val < 0 ? `- ${formatINR(-val)}` : formatINR(val)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-bold text-slate-900">{formatINR(order.total_amount)}</span>
              </div>
            </div>
          </div>

          {order.timeline?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Activity ({order.timeline.length})</div>
              <ul className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100">
                {[...order.timeline].reverse().map((t, i) => (
                  <li key={i} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-800">{t.status}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(t.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    {t.note && <div className="text-xs text-slate-600 mt-0.5">{t.note}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <StatusTransitionModal
        order={transitionTo ? order : null}
        target={transitionTo}
        onClose={() => setTransitionTo(null)}
        onDone={(updated) => {
          setTransitionTo(null);
          onUpdated(updated);
          toast.push(`Order moved to ${updated.order_status}`);
        }} />
    </div>
  );
}

function StatusTransitionModal({ order, target, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // BRD §3 — admin's choice when marking a COD order Delivered. 'pay_now'
  // preserves the prior auto-Paid behaviour; 'pay_on_credit' creates a
  // CreditTransaction and leaves payment_status Pending. We pre-fetch the
  // customer's credit state to know whether to even surface the choice.
  const [creditDecision, setCreditDecision] = useState('pay_now');
  const [customerCreditState, setCustomerCreditState] = useState(null);
  // Open-box delivery photos staged for this transition. Each photo is
  // uploaded immediately on file pick so the rider sees the thumbnail
  // and can retry/remove before committing; the URL list is sent with
  // the PUT /:id/status payload so the photos are persisted atomically
  // with the Delivered transition.
  const [deliveryPhotos, setDeliveryPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const MAX_DELIVERY_PHOTOS = 8;
  const isDelivered = target === 'Delivered';

  useEffect(() => {
    if (!order) return;
    setNote('');
    setCreditDecision('pay_now');
    setCustomerCreditState(null);
    setDeliveryPhotos([]);
    setUploadingPhoto(false);
    // Only worth fetching when the choice could matter — Delivered + COD.
    if (target === 'Delivered' && order.payment_method === 'COD' && order.payment_status === 'Pending') {
      adminApi.getCustomerCredit(order.customer_id)
        .then((r) => setCustomerCreditState(r.data?.state || null))
        .catch(() => setCustomerCreditState(null));
    }
  }, [order, target]);

  const onPickDeliveryPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a remove
    if (!file) return;
    if (deliveryPhotos.length >= MAX_DELIVERY_PHOTOS) {
      toast.push(`Maximum ${MAX_DELIVERY_PHOTOS} photos per delivery`, 'error');
      return;
    }
    setUploadingPhoto(true);
    try {
      const r = await adminApi.uploadDeliveryPhoto(file);
      setDeliveryPhotos((prev) => [...prev, { url: r.data.url }]);
    } catch (err) {
      toast.push(err.message || 'Could not upload photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeDeliveryPhoto = (idx) => {
    setDeliveryPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!order || !target) return null;

  const isCancel = target === 'Cancelled';
  const isDeliveredCOD = target === 'Delivered'
    && order.payment_method === 'COD'
    && order.payment_status === 'Pending';
  const creditEligible = customerCreditState?.enabled
    && customerCreditState?.status === 'active'
    && customerCreditState?.available >= Number(order.total_amount);
  const willCollectCod = isDeliveredCOD && creditDecision === 'pay_now';
  const willFlipToCredit = isDeliveredCOD && creditDecision === 'pay_on_credit';

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        status: target,
        ...(note ? { note } : {}),
        ...(isDeliveredCOD ? { credit_decision: creditDecision } : {}),
        // Only send the photo list on the Delivered transition — the
        // backend ignores it for other targets, but skipping here keeps
        // the request payload minimal and the audit trail cleaner.
        ...(isDelivered && deliveryPhotos.length > 0 ? { delivery_photos: deliveryPhotos } : {}),
      };
      const r = await adminApi.updateOrderStatus(order.order_id, body);
      onDone(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not update status', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isCancel ? 'Cancel order' : `Move to "${target}"`}>
      <form onSubmit={onSubmit} className="space-y-4">
        {isCancel && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg p-3">
            Cancelling restores stock for every line item and notifies the customer. This cannot be undone.
          </div>
        )}

        {/* BRD §3 — payment-mode chooser at delivery confirmation. Only
            renders for COD-Delivered transitions (UPI orders are already
            paid; CREDIT orders carry their commitment from placement). */}
        {isDeliveredCOD && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Payment at delivery</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCreditDecision('pay_now')}
                className={`text-left rounded-xl p-3 border-2 ${creditDecision === 'pay_now' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="text-sm font-bold text-slate-900">Pay now</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Collected ₹{Number(order.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} on delivery.
                </div>
              </button>
              <button type="button" onClick={() => setCreditDecision('pay_on_credit')}
                disabled={!creditEligible}
                className={`text-left rounded-xl p-3 border-2 ${
                  creditDecision === 'pay_on_credit' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'
                } ${!creditEligible ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="text-sm font-bold text-slate-900">Pay on credit</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  {customerCreditState === null
                    ? 'Checking eligibility…'
                    : !customerCreditState.enabled
                      ? 'Credit not enabled for this customer.'
                      : customerCreditState.status !== 'active'
                        ? 'Credit blocked.'
                        : customerCreditState.available < Number(order.total_amount)
                          ? `Limit short (₹${customerCreditState.available.toFixed(0)} available).`
                          : `Net ${customerCreditState.paymentTermsDays} terms, ₹${customerCreditState.available.toFixed(0)} available.`}
                </div>
              </button>
            </div>
          </div>
        )}

        {willCollectCod && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg p-3">
            <span className="font-semibold">Cash on delivery</span> — confirm only after the rider has collected ₹{Number(order.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} from the customer. Payment status will move to <span className="font-semibold">Paid</span> automatically.
          </div>
        )}
        {willFlipToCredit && (
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs rounded-lg p-3">
            <span className="font-semibold">Pay on credit</span> — invoice for ₹{Number(order.total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} will be added to the customer's ledger with a {customerCreditState?.paymentTermsDays}-day due date. Payment status stays Pending.
          </div>
        )}

        {/* Open-box delivery photos — captured by the rider at the
            customer's door. Optional; the Mark-Delivered button still
            works without any photos so a low-network situation can't
            block delivery confirmation. Photos are admin-internal proof
            of delivery; not shown to the customer. */}
        {isDelivered && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open-box photos</div>
              <span className="text-[10px] text-slate-400 font-medium">{deliveryPhotos.length}/{MAX_DELIVERY_PHOTOS} · optional</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
              Open the box at the customer's door and snap a photo of the items. Helps resolve any missing-item or quality dispute later.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {deliveryPhotos.map((p, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
                  <img src={resolveImageUrl(p.url) || p.url} alt={`Open-box ${idx + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeDeliveryPhoto(idx)}
                    aria-label="Remove photo"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/70 hover:bg-red-600 text-white flex items-center justify-center transition">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {deliveryPhotos.length < MAX_DELIVERY_PHOTOS && (
                <label className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs font-semibold transition cursor-pointer ${
                  uploadingPhoto
                    ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-wait'
                    : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50'
                }`}>
                  {/* capture="environment" prompts the rear camera on a phone
                      so the rider snaps the box directly; on desktop the
                      same input falls back to a normal file picker. */}
                  <input type="file" accept="image/*" capture="environment"
                    disabled={uploadingPhoto}
                    onChange={onPickDeliveryPhoto}
                    className="sr-only" />
                  {uploadingPhoto ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Uploading…</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      <span>Add photo</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>
        )}

        <div className="text-sm text-slate-700">
          <div className="font-mono text-xs text-slate-500">{order.order_id}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500">From</span>
            <OrderStatusBadge status={order.order_status} />
            <span className="text-slate-500">to</span>
            <OrderStatusBadge status={target} />
          </div>
        </div>
        <Field label="Note (optional)" hint="Stored on the order timeline.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
            placeholder={isCancel ? 'e.g. customer requested cancellation' : 'e.g. packed and ready for pickup'}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">Back</button>
          <button type="submit" disabled={submitting}
            className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm text-white ${
              isCancel
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
                : 'bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400'
            }`}>
            {submitting ? 'Saving…' : (isCancel ? 'Cancel order' : `Mark ${target}`)}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// REPORTS — tabbed dashboard with sales / inventory / customers / revenue
// ============================================================

// Date helpers — input[type=date] gives "YYYY-MM-DD"; the API expects ISO.
const toDateInput = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// Lightweight visualizations: pure CSS bars sized off the max value. Avoids
// pulling in a charting library for what is essentially "show numbers next
// to bars" — we can graduate to recharts later if the BA wants smooth
// curves or tooltips.
function HBar({ value, max, tone = 'slate' }) {
  const palette = {
    slate: 'bg-slate-700',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-400',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
  }[tone] || 'bg-slate-500';
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${palette} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DailyBarChart({ data, valueKey, label, tone = 'emerald' }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">{label}</div>
      <div className="flex items-end gap-0.5 h-32">
        {data.map((d) => {
          const h = Math.max(1, Math.round((d[valueKey] / max) * 100));
          const palette = { emerald: 'bg-emerald-400', blue: 'bg-blue-400', amber: 'bg-amber-400' }[tone];
          return (
            <div key={d.date} title={`${d.date} · ${d[valueKey]}`}
              className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
              <div className={`w-full ${palette} rounded-sm`} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-2">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function ReportNumber({ label, value, hint, tone = 'slate' }) {
  const accent = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
  }[tone];
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

const REPORT_TABS = [
  { id: 'sales', label: 'Sales', icon: ShoppingBag },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'revenue', label: 'Revenue', icon: IndianRupee },
];

function AdminReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('sales');
  // Range only applies to non-inventory tabs; inventory is point-in-time.
  const [range, setRange] = useState({ preset: '30d', from: toDateInput(daysAgo(30)), to: toDateInput(new Date()) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const setPreset = (preset) => {
    if (preset === 'custom') { setRange((r) => ({ ...r, preset })); return; }
    const days = { '7d': 7, '30d': 30, '90d': 90 }[preset];
    setRange({ preset, from: toDateInput(daysAgo(days)), to: toDateInput(new Date()) });
  };

  // Clear data synchronously when switching tabs so the new tab's component
  // never renders with the previous tab's data shape (e.g. InventoryReport
  // crashing on data.byCategory because the previous fetch returned sales).
  const onTabChange = (newTab) => {
    if (newTab === tab) return;
    setData(null);
    setLoading(true);
    setTab(newTab);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const params = tab === 'inventory'
        ? {}
        : { from: new Date(range.from).toISOString(), to: new Date(range.to + 'T23:59:59').toISOString() };
      const fn = {
        sales: adminApi.reportSales,
        inventory: adminApi.reportInventory,
        customers: adminApi.reportCustomers,
        revenue: adminApi.reportRevenue,
      }[tab];
      const r = await fn(params);
      setData(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load report', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, range.from, range.to, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Sales, inventory, customers, and revenue analytics.</p>
        </div>
        <ExportButtons resource="reports" label="Reports" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        {REPORT_TABS.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Date range — hidden for inventory which is point-in-time */}
      {tab !== 'inventory' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            {['7d', '30d', '90d', 'custom'].map((p) => (
              <button key={p} onClick={() => setPreset(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  range.preset === p ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300'
                }`}>
                {p === 'custom' ? 'Custom' : `Last ${p}`}
              </button>
            ))}
          </div>
          {range.preset === 'custom' && (
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="px-2 py-1 border border-slate-200 rounded-lg" />
              <span className="text-slate-500">→</span>
              <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="px-2 py-1 border border-slate-200 rounded-lg" />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center text-slate-400">Loading…</div>
      ) : !data ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center text-slate-500">No data.</div>
      ) : (
        <>
          {tab === 'sales' && <SalesReport data={data} />}
          {tab === 'inventory' && <InventoryReport data={data} />}
          {tab === 'customers' && <CustomersReport data={data} />}
          {tab === 'revenue' && <RevenueReport data={data} />}
        </>
      )}
    </div>
  );
}

function SalesReport({ data }) {
  const { totals, daily, topProducts, topCustomers, byStatus } = data;
  const maxProductRevenue = Math.max(1, ...topProducts.map((p) => p.revenue));
  const maxCustomerSpend = Math.max(1, ...topCustomers.map((c) => c.spend));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportNumber label="Total orders" value={totals.order_count} hint={`${totals.cancelled_order_count} cancelled`} />
        <ReportNumber label="Completed orders" value={totals.completed_order_count} tone="emerald" />
        <ReportNumber label="Revenue" value={formatINR(totals.revenue)} tone="emerald" />
        <ReportNumber label="Avg order value" value={formatINR(totals.avg_order_value)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <DailyBarChart data={daily} valueKey="orders" label="Orders per day" tone="blue" />
        <DailyBarChart data={daily} valueKey="revenue" label="Revenue per day" tone="emerald" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Top products by revenue</div>
          {topProducts.length === 0 ? <div className="text-sm text-slate-400">No sales in this window.</div> : (
            <div className="space-y-3">
              {topProducts.map((p) => (
                <div key={p.product_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700 inline-flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded bg-slate-50 dark:bg-slate-700 inline-flex items-center justify-center text-base overflow-hidden">
                        <ProductImage src={p.image} alt={p.name} />
                      </span>
                      {p.name}
                    </span>
                    <span className="font-semibold text-slate-900">{formatINR(p.revenue)}</span>
                  </div>
                  <HBar value={p.revenue} max={maxProductRevenue} tone="emerald" />
                  <div className="text-[11px] text-slate-500 mt-0.5">{p.units} units sold</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Top customers by spend</div>
          {topCustomers.length === 0 ? <div className="text-sm text-slate-400">No customer activity.</div> : (
            <div className="space-y-3">
              {topCustomers.map((c) => (
                <div key={c.customer_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{c.full_name || c.email}</span>
                    <span className="font-semibold text-slate-900">{formatINR(c.spend)}</span>
                  </div>
                  <HBar value={c.spend} max={maxCustomerSpend} tone="slate" />
                  <div className="text-[11px] text-slate-500 mt-0.5">{c.orders} {c.orders === 1 ? 'order' : 'orders'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Order status breakdown</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500">{status}</div>
              <div className="text-xl font-bold text-slate-900">{count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InventoryReport({ data }) {
  const { totals, byCategory, lowStockItems } = data;
  const maxCategoryValue = Math.max(1, ...byCategory.map((c) => c.stock_value));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ReportNumber label="Active products" value={totals.active_count} tone="emerald" hint={`${totals.inactive_count} inactive`} />
        <ReportNumber label={`Low stock (≤ ${totals.threshold})`} value={totals.low_stock_count} tone="amber" />
        <ReportNumber label="Out of stock" value={totals.out_of_stock_count} tone="red" />
        <ReportNumber label="Stock value" value={formatINR(totals.stock_value)} tone="emerald" hint="active products only" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Stock value by category</div>
          {byCategory.length === 0 ? <div className="text-sm text-slate-400">No active products.</div> : (
            <div className="space-y-3">
              {byCategory.map((c) => (
                <div key={c.category_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700"><span className="text-lg mr-1">{c.icon}</span>{c.category_name}</span>
                    <span className="font-semibold text-slate-900">{formatINR(c.stock_value)}</span>
                  </div>
                  <HBar value={c.stock_value} max={maxCategoryValue} tone="emerald" />
                  <div className="text-[11px] text-slate-500 mt-0.5">{c.product_count} {c.product_count === 1 ? 'product' : 'products'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Restock priority</div>
          {lowStockItems.length === 0 ? (
            <div className="text-sm text-slate-400">All active products above the {totals.threshold}-unit threshold.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left py-1 font-semibold">Product</th>
                  <th className="text-left py-1 font-semibold">Category</th>
                  <th className="text-right py-1 font-semibold">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStockItems.map((p) => (
                  <tr key={p.product_id}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded bg-slate-50 dark:bg-slate-700 inline-flex items-center justify-center text-base overflow-hidden">
                          <ProductImage src={p.image} alt={p.name} />
                        </span>
                        {p.name}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-slate-500">{p.category_name}</td>
                    <td className={`py-2 text-right font-semibold ${p.stock_quantity === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {p.stock_quantity} {p.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomersReport({ data }) {
  const { totals, dailySignups, verification, statusBreakdown } = data;
  const verifPct = (n) => verification.total ? Math.round((n / verification.total) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <ReportNumber label="Total customers" value={totals.total_customers} tone="emerald" />
        <ReportNumber label="New in window" value={totals.new_in_window} tone="blue" hint="signups" />
        <ReportNumber label="Active in window" value={totals.active_in_window} tone="emerald" hint="placed at least one order" />
      </div>

      <DailyBarChart data={dailySignups} valueKey="signups" label="Daily signups" tone="blue" />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Verification</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">Email verified</span>
                <span className="font-semibold text-slate-900">{verification.email_verified} / {verification.total} ({verifPct(verification.email_verified)}%)</span>
              </div>
              <HBar value={verification.email_verified} max={verification.total} tone="emerald" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">Phone verified</span>
                <span className="font-semibold text-slate-900">{verification.phone_verified} / {verification.total} ({verifPct(verification.phone_verified)}%)</span>
              </div>
              <HBar value={verification.phone_verified} max={verification.total} tone="emerald" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">Both</span>
                <span className="font-semibold text-slate-900">{verification.both_verified} / {verification.total} ({verifPct(verification.both_verified)}%)</span>
              </div>
              <HBar value={verification.both_verified} max={verification.total} tone="slate" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Account status</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(statusBreakdown).map(([status, count]) => (
              <div key={status} className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">{status}</div>
                <div className="text-xl font-bold text-slate-900">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueReport({ data }) {
  const { totals, byPaymentMethod, couponRedemptions } = data;
  const maxMethodRev = Math.max(1, ...byPaymentMethod.map((m) => m.revenue));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <ReportNumber label="Gross subtotal" value={formatINR(totals.gross)} hint={`${totals.orders} orders`} />
        <ReportNumber label="Discount given" value={`- ${formatINR(totals.discount)}`} tone="amber" />
        <ReportNumber label="Tax collected" value={formatINR(totals.tax)} />
        <ReportNumber label="Delivery charges" value={formatINR(totals.delivery)} />
        <ReportNumber label="Net revenue" value={formatINR(totals.net)} tone="emerald" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">By payment method</div>
          {byPaymentMethod.length === 0 ? <div className="text-sm text-slate-400">No transactions.</div> : (
            <div className="space-y-3">
              {byPaymentMethod.map((m) => (
                <div key={m.method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700 inline-flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> {m.method}</span>
                    <span className="font-semibold text-slate-900">{formatINR(m.revenue)}</span>
                  </div>
                  <HBar value={m.revenue} max={maxMethodRev} tone="slate" />
                  <div className="text-[11px] text-slate-500 mt-0.5">{m.count} {m.count === 1 ? 'order' : 'orders'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Coupon redemption</div>
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500">Orders with a coupon</div>
              <div className="text-2xl font-bold text-slate-900">{couponRedemptions.redeemed_orders}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500">Total discount given</div>
              <div className="text-2xl font-bold text-amber-700">{formatINR(couponRedemptions.total_discount_given)}</div>
            </div>
            <p className="text-[11px] text-slate-500">
              Per-coupon attribution will surface here once coupon_id is stored on the Order row.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REVIEWS — admin moderation (slice 7)
// ============================================================
function AdminStarRating({ value, size = 'sm' }) {
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n}
          className={`${cls} ${value >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
      ))}
    </div>
  );
}

function AdminReviewsPage() {
  const auth = useAdminAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', rating: '', customer_email: '', page: 1, limit: 20 });

  const canDelete = hasPermission(auth.admin, 'reviews');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listReviews(filters);
      setRows(r.data);
      setMeta(r.meta);
      setSummary(r.summary);
    } catch (err) {
      toast.push(err.message || 'Could not load reviews', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (r) => {
    if (!confirm(`Delete this ${r.rating}-star review by ${r.customer_name}? The product's rating will be recomputed.`)) return;
    try {
      await adminApi.deleteReview(r.review_id);
      toast.push('Review removed');
      load();
    } catch (err) {
      toast.push(err.message || 'Could not delete review', 'error');
    }
  };

  const maxDist = summary ? Math.max(1, ...Object.values(summary.distribution)) : 1;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reviews</h1>
          <p className="text-sm text-slate-500 mt-1">Moderate customer ratings and comments. Deletes recompute the product's average.</p>
        </div>
        <ExportButtons resource="reviews" label="Reviews" />
      </div>

      {summary && (
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 lg:col-span-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average rating</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-3xl font-bold text-slate-900">{summary.avg_rating.toFixed(1)}</div>
              <AdminStarRating value={Math.round(summary.avg_rating)} size="lg" />
            </div>
            <div className="text-xs text-slate-500 mt-1">{summary.total} reviews total</div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 lg:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Rating distribution</div>
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((r) => (
                <div key={r} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-slate-700 font-semibold">{r}</span>
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <div className="flex-1"><HBar value={summary.distribution[r]} max={maxDist} tone="amber" /></div>
                  <span className="w-8 text-right text-slate-700">{summary.distribution[r]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
          placeholder="Search comment text…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
        <input
          value={filters.customer_email}
          onChange={(e) => setFilters((f) => ({ ...f, customer_email: e.target.value, page: 1 }))}
          placeholder="Customer email…"
          className="min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
        <select value={filters.rating}
          onChange={(e) => setFilters((f) => ({ ...f, rating: e.target.value, page: 1 }))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} stars</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No reviews match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Product</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Rating</th>
                <th className="px-4 py-3 text-left font-semibold">Comment</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.review_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded bg-slate-50 dark:bg-slate-700 inline-flex items-center justify-center text-xl overflow-hidden">
                        <ProductImage src={r.product_image} alt={r.product_name} />
                      </span>
                      <span className="font-medium text-slate-900 text-xs">{r.product_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-900">{r.customer_name}</div>
                    <div className="text-[11px] text-slate-500">{r.customer_email}</div>
                  </td>
                  <td className="px-4 py-3"><AdminStarRating value={r.rating} /></td>
                  <td className="px-4 py-3 text-slate-700 text-xs max-w-md">
                    {r.comment ? (
                      <span className="line-clamp-3" title={r.comment}>{r.comment}</span>
                    ) : (
                      <span className="text-slate-400 italic">No comment</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{shortDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <IconBtn label={canDelete ? 'Delete review' : 'Read-only role'}
                      variant="danger" disabled={!canDelete}
                      onClick={() => onDelete(r)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>Page {meta.page} of {meta.totalPages} · {meta.total} total</div>
            <div className="flex gap-1">
              <button disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Prev</button>
              <button disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS — operational thresholds (BRD §11.7)
// Minimum order value (₹) and minimum order quantity. Read by everyone in
// the admin role set, written by Super/Operations only.
// ============================================================
//
// The settings page is structured as a tile catalog: the landing view shows
// every category as a tile, clicking one drills into that category's form
// fields. All edits live in a single shared `draft` so the user can flip
// between tiles without losing edits, and Save/Reset always apply to the
// whole draft (matches the single PUT /api/settings contract).
//
// Each entry: id (matches the sub-form's render gate), title, blurb (short
// one-liner for the tile body), icon, and a `summary(data)` that renders a
// small status preview directly on the tile so the admin can see the
// current value without entering the section.
// (TILE_PALETTES moved up near the top of the file; see the shared
// declaration above DASHBOARD_TILES so both grids use the same lookup.)

const SETTINGS_SECTIONS = [
  {
    id: 'branding',
    title: 'Company branding',
    blurb: 'Name, tagline, and address shown across the site and on invoices',
    icon: Building2,
    color: 'indigo',
    summary: (d) => d?.company_name || 'Redlook',
  },
  {
    id: 'orders',
    title: 'Order thresholds',
    blurb: 'Minimum cart value and quantity required at checkout',
    icon: ShoppingBag,
    color: 'emerald',
    summary: (d) => d ? `₹${Number(d.min_order_value).toFixed(0)} / ${d.min_order_quantity} item${d.min_order_quantity === 1 ? '' : 's'}` : '—',
  },
  {
    id: 'delivery',
    title: 'Delivery & charges',
    blurb: 'Delivery fee, free-delivery threshold, slot lead time, and the delivery-slot catalog',
    icon: Truck,
    color: 'amber',
    summary: (d) => {
      if (!d) return '—';
      const slots = Array.isArray(d.delivery_slots) ? d.delivery_slots.filter((s) => s.enabled).length : 0;
      return `₹${Number(d.delivery_charge).toFixed(0)} · free over ₹${Number(d.free_delivery_over).toFixed(0)} · ${slots} slot${slots === 1 ? '' : 's'}`;
    },
  },
  {
    id: 'area',
    title: 'Delivery area',
    blurb: 'Firm location and the radius (km) you deliver within',
    icon: MapPin,
    color: 'sky',
    summary: (d) => {
      if (!d) return '—';
      const configured = d.firm_latitude != null && d.firm_longitude != null;
      return configured ? `${Number(d.delivery_radius_km).toFixed(1)} km radius` : 'Not configured';
    },
  },
  {
    id: 'support',
    title: 'Customer support',
    blurb: 'Phone, WhatsApp, email, and the message shown in the help popover',
    icon: Headphones,
    color: 'rose',
    summary: (d) => {
      if (!d) return '—';
      const channels = [d.support_phone && 'Phone', d.support_whatsapp && 'WhatsApp', d.support_email && 'Email'].filter(Boolean);
      return channels.length ? channels.join(' · ') : 'No channels set';
    },
  },
  {
    id: 'policy',
    title: 'Order policy',
    blurb: 'Cancellation cutoff and the post-delivery return window',
    icon: ClipboardCheck,
    color: 'violet',
    summary: (d) => {
      const cutoff = d?.cancellation_cutoff_status || 'Out for Delivery';
      const window = d?.return_window_hours;
      const returnPart = window == null
        ? ''
        : window === 0
          ? ' · Returns disabled'
          : ` · ${window}h returns`;
      return `${cutoff}${returnPart}`;
    },
  },
  {
    id: 'appearance',
    title: 'Appearance',
    blurb: 'Site-wide theme used by both the storefront and this admin shell',
    icon: Palette,
    color: 'fuchsia',
    summary: (d) => d?.theme ? d.theme.charAt(0).toUpperCase() + d.theme.slice(1) : 'Emerald',
  },
  {
    id: 'product_details',
    title: 'Product details',
    blurb: 'Edit and toggle the four-badge row below the buy buttons on each product page',
    icon: BadgeCheck,
    color: 'teal',
    summary: (d) => {
      const pdpOn = (d?.product_detail_badges || []).filter((b) => b.enabled).length;
      return `${pdpOn}/4 badges shown`;
    },
  },
  {
    id: 'hero_features',
    title: 'Home hero trust pills',
    blurb: 'Announcement pill, headline, subheadline, background image, and the trust pills on the home hero',
    icon: Sparkles,
    color: 'amber',
    summary: (d) => {
      const heroOn = (d?.home_hero_features || []).filter((b) => b.enabled).length;
      const total = (d?.home_hero_features || []).length || 8;
      return `${heroOn}/${total} shown`;
    },
  },
  {
    id: 'price_filter',
    title: 'Shop price filter',
    blurb: 'Upper bound of the "Max price" slider on the storefront shop page',
    icon: IndianRupee,
    color: 'emerald',
    summary: (d) => {
      if (!d) return '—';
      return d.max_price_filter_auto
        ? 'Auto · catalog max'
        : `Manual · ₹${Number(d.max_price_filter_cap).toFixed(0)}`;
    },
  },
  {
    id: 'discounts',
    title: 'Discounts',
    blurb: 'Platform-wide bulk discount applied across every product. Per-product and per-category discounts live on those pages.',
    icon: Ticket,
    color: 'rose',
    summary: (d) => {
      if (!d) return '—';
      return d.global_discount_enabled
        ? `On · ${Number(d.global_discount_percent).toFixed(0)}% off everything`
        : 'Off';
    },
  },
  {
    id: 'category_promotions',
    title: 'Categorywise Promotion',
    blurb: 'Sale banners that scroll across the top of the storefront. Each image links to a category page.',
    icon: Megaphone,
    color: 'rose',
    summary: (d) => {
      const promos = Array.isArray(d?.category_promotions) ? d.category_promotions : [];
      if (promos.length === 0) return 'No promos configured';
      const on = promos.filter((p) => p.enabled).length;
      return `${on}/${promos.length} live`;
    },
  },
  {
    id: 'translations',
    title: 'Storefront copy translations',
    blurb: 'Hindi + Bengali translations for company branding, support copy, hero pills and product-detail badges. Empty fields fall back to English.',
    icon: Globe,
    color: 'emerald',
    summary: (d) => {
      const t = d?.translations || {};
      const filled = Object.keys(t).reduce((n, k) => n + Object.values(t[k] || {}).filter((v) => v && v.trim()).length, 0);
      return filled === 0 ? 'None added yet' : `${filled} translation${filled === 1 ? '' : 's'} added`;
    },
  },
];

// Static catalog used by the admin form: maps each badge/pill key to its
// icon and a friendly label shown above each editable card. The storefront
// has the same key→icon mapping in pages.jsx — keep them in sync if you
// add new badges.
const PDP_BADGE_META = {
  delivery:  { icon: Truck,    label: 'Free delivery' },
  returns:   { icon: RotateCcw, label: 'Return policy (auto-flips for non-returnable items)' },
  freshness: { icon: Shield,   label: 'Fresh guarantee' },
  slot:      { icon: Clock,    label: 'Next delivery slot' },
};
const HERO_FEATURE_META = {
  // Listed top-to-bottom in the same order they appear on the storefront.
  announcement:     { icon: Megaphone, label: 'Top announcement pill',
                      hint: 'Pulsing-dot pill above the headline. Good for offers like the free-delivery threshold.' },
  headline_top:     { icon: Heading,   label: 'Headline — top line (plain)',
                      hint: 'First line of the big h1. Plain weight.' },
  headline_bottom:  { icon: Heading,   label: 'Headline — bottom line (gradient)',
                      hint: 'Second line of the big h1. Rendered with the emerald → green gradient.' },
  subheadline:      { icon: AlignLeft, label: 'Subheadline paragraph',
                      hint: 'Two-sentence pitch under the headline.' },
  background_image: { icon: ImageIcon, label: 'Background image URL',
                      hint: 'Optional. Paste a full URL (https://…) or an uploaded path (/uploads/…). Disabled = fall back to the emerald gradient.' },
  delivery:  { icon: Truck,  label: 'Trust pill — Delivery promise' },
  freshness: { icon: Shield, label: 'Trust pill — Freshness promise' },
  speed:     { icon: Zap,    label: 'Trust pill — Ordering speed' },
};

// Walks the catalog `defaults` in order and overlays each entry with the
// matching key from `incoming` (an array from the API). Keeps the catalog
// order canonical and fills in missing fields with defaults so the editor
// never renders an empty input.
function mergeBadges(defaults, incoming) {
  const byKey = Object.fromEntries((Array.isArray(incoming) ? incoming : []).map((b) => [b.key, b]));
  return defaults.map((d) => ({ ...d, ...(byKey[d.key] || {}) }));
}

// ============================================================
// DeliverySlotsEditor — manages the BusinessSettings.delivery_slots catalog
// edited under Settings → Delivery & Charges.
// ============================================================
// Row shape (mirrors backend Zod):
//   { id, day_offset (0=today / 1=tomorrow / …), start_hour 0–23,
//     end_hour 1–24, label "4 PM – 7 PM", enabled bool }
// The storefront prefixes the label with "Today" / "Tomorrow" / a date,
// applies the buffer-hours availability rule, and hides disabled rows.
const DAY_OFFSET_OPTIONS = [
  { value: 0, label: 'Today' },
  { value: 1, label: 'Tomorrow' },
  { value: 2, label: 'In 2 days' },
  { value: 3, label: 'In 3 days' },
  { value: 7, label: 'Next week' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  // 0 → "12 AM" / 12 → "12 PM" / 17 → "5 PM"
  label: `${((h % 12) || 12)} ${h < 12 ? 'AM' : 'PM'}`,
}));

// 1..24 — end hour can be 24 (i.e. midnight tomorrow) to express a
// late-evening window that runs to the end of the day.
const END_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i + 1;
  return { value: h, label: h === 24 ? '12 AM (next day)' : `${((h % 12) || 12)} ${h < 12 ? 'AM' : 'PM'}` };
});

function DeliverySlotsEditor({ draft, setDraft, errors, canWrite }) {
  const slots = draft.delivery_slots || [];

  const update = (next) => setDraft((d) => ({ ...d, delivery_slots: next }));

  const setOne = (idx, patch) => {
    update(slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeOne = (idx) => update(slots.filter((_, i) => i !== idx));
  const moveOne = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[idx], next[j]] = [next[j], next[idx]];
    update(next);
  };
  const addOne = () => {
    // Pick a sensible default that doesn't collide with existing rows. The
    // id is admin-stable (round-trips through future order rows) so we
    // synthesize a slug-like value that's still readable in the JSON.
    const newId = `slot-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    update([
      ...slots,
      { id: newId, day_offset: 1, start_hour: 10, end_hour: 13, label: '10 AM – 1 PM', enabled: true },
    ]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-semibold text-slate-700">Delivery slots</label>
        <span className="text-xs text-slate-500">{slots.filter((s) => s.enabled).length} of {slots.length} enabled</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Add the time windows customers can choose at checkout. The buffer above applies to "Today" slots so the kitchen has lead time to pack. Disable a row to hide it without losing the configuration.</p>

      <div className="space-y-2">
        {slots.length === 0 && (
          <div className="text-xs text-slate-400 italic px-3 py-2.5 border border-dashed border-slate-200 rounded-lg">
            No slots configured. Customers won't be able to place orders until you add at least one.
          </div>
        )}
        {slots.map((s, i) => {
          const idErr  = errors[`delivery_slot_${i}_id`];
          const lblErr = errors[`delivery_slot_${i}_label`];
          const shErr  = errors[`delivery_slot_${i}_start_hour`];
          const ehErr  = errors[`delivery_slot_${i}_end_hour`];
          const doErr  = errors[`delivery_slot_${i}_day_offset`];
          return (
            <div key={s.id + '_' + i} className={`border rounded-xl p-3 ${s.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex flex-col text-xs flex-1 min-w-[120px]">
                  <span className="text-slate-500 mb-0.5">Day</span>
                  <select value={Number(s.day_offset)} disabled={!canWrite}
                    onChange={(e) => setOne(i, { day_offset: Number(e.target.value) })}
                    className={`px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 ${doErr ? 'border-red-300' : 'border-slate-200'}`}>
                    {DAY_OFFSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    {/* Allow values outside the preset list — preserves a custom day_offset
                        from earlier edits without forcing it onto the preset list. */}
                    {!DAY_OFFSET_OPTIONS.some((o) => o.value === Number(s.day_offset)) && (
                      <option value={Number(s.day_offset)}>+{s.day_offset} days</option>
                    )}
                  </select>
                </label>
                <label className="flex flex-col text-xs w-32">
                  <span className="text-slate-500 mb-0.5">Start</span>
                  <select value={Number(s.start_hour)} disabled={!canWrite}
                    onChange={(e) => setOne(i, { start_hour: Number(e.target.value) })}
                    className={`px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 ${shErr ? 'border-red-300' : 'border-slate-200'}`}>
                    {HOUR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col text-xs w-36">
                  <span className="text-slate-500 mb-0.5">End</span>
                  <select value={Number(s.end_hour)} disabled={!canWrite}
                    onChange={(e) => setOne(i, { end_hour: Number(e.target.value) })}
                    className={`px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 ${ehErr ? 'border-red-300' : 'border-slate-200'}`}>
                    {END_HOUR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col text-xs flex-1 min-w-[160px]">
                  <span className="text-slate-500 mb-0.5">Label (shown to customer)</span>
                  <input type="text" value={s.label} disabled={!canWrite}
                    onChange={(e) => setOne(i, { label: e.target.value })}
                    placeholder="4 PM – 7 PM"
                    className={`px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 ${lblErr ? 'border-red-300' : 'border-slate-200'}`} />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 self-center pt-3">
                  <input type="checkbox" checked={!!s.enabled} disabled={!canWrite}
                    onChange={(e) => setOne(i, { enabled: e.target.checked })}
                    className="w-4 h-4" />
                  Enabled
                </label>
                <div className="flex items-center gap-1 self-center pt-3">
                  <button type="button" disabled={!canWrite || i === 0}
                    onClick={() => moveOne(i, -1)}
                    className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                    aria-label="Move up">▲</button>
                  <button type="button" disabled={!canWrite || i === slots.length - 1}
                    onClick={() => moveOne(i, 1)}
                    className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                    aria-label="Move down">▼</button>
                  <button type="button" disabled={!canWrite}
                    onClick={() => removeOne(i)}
                    className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-slate-300">
                    Remove
                  </button>
                </div>
              </div>
              {(idErr || lblErr || shErr || ehErr || doErr) && (
                <div className="text-xs text-red-600 mt-1.5 space-y-0.5">
                  {idErr  && <div>{idErr}</div>}
                  {doErr  && <div>{doErr}</div>}
                  {shErr  && <div>{shErr}</div>}
                  {ehErr  && <div>{ehErr}</div>}
                  {lblErr && <div>{lblErr}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <button type="button" onClick={addOne}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700">
          <Plus className="w-3.5 h-3.5" /> Add delivery slot
        </button>
      )}
    </div>
  );
}

// ============================================================
// CategoryPromotionsEditor — manages the BusinessSettings.category_promotions
// marquee shown above the storefront hero. Each row: image upload, target
// category, alt text, enabled toggle, up/down reorder, remove.
// ============================================================
function CategoryPromotionsEditor({ draft, setDraft, errors, canWrite }) {
  const promos = draft.category_promotions || [];
  const [categories, setCategories] = useState([]);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const toast = useToast();

  // Categories are needed to render the dropdown; loaded once on mount.
  // Failure is non-fatal — the admin can still type a category_id by
  // hand (though the picker is the supported UX).
  useEffect(() => {
    adminApi.listCategories()
      .then((r) => setCategories(r.data || []))
      .catch(() => setCategories([]));
  }, []);

  const update = (next) => setDraft((d) => ({ ...d, category_promotions: next }));
  const setOne = (idx, patch) => {
    update(promos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };
  const removeOne = (idx) => update(promos.filter((_, i) => i !== idx));
  const moveOne = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= promos.length) return;
    const next = [...promos];
    [next[idx], next[j]] = [next[j], next[idx]];
    update(next);
  };
  const addOne = () => {
    const newId = `promo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    update([
      ...promos,
      {
        id: newId, image_url: '', category_id: categories[0]?.id || '', alt: '', enabled: true,
        // null = "inherit storefront default"; admin can override per-row.
        height_mobile_px: null, height_desktop_px: null,
        width_mobile_px: null, width_desktop_px: null,
      },
    ]);
  };

  const onPick = async (idx, file) => {
    if (!file) return;
    setUploadingIdx(idx);
    try {
      const r = await adminApi.uploadPromoImage(file);
      setOne(idx, { image_url: r.data.url });
      toast.push('Promo image uploaded');
    } catch (err) {
      toast.push(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-semibold text-slate-700">Sale promotions</label>
        <span className="text-xs text-slate-500">{promos.filter((p) => p.enabled).length} of {promos.length} live</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Each image scrolls across the top of the home page and links to a category. Disable a row to hide it without losing the upload — handy for ending a sale on schedule.
      </p>

      <div className="space-y-2">
        {promos.length === 0 && (
          <div className="text-xs text-slate-400 italic px-3 py-2.5 border border-dashed border-slate-200 rounded-lg">
            No promotions configured. The marquee row stays hidden on the storefront until you add one.
          </div>
        )}
        {promos.map((p, i) => {
          const idErr   = errors[`category_promo_${i}_id`];
          const imgErr  = errors[`category_promo_${i}_image_url`];
          const catErr  = errors[`category_promo_${i}_category_id`];
          const previewSrc = p.image_url ? (resolveImageUrl(p.image_url) || p.image_url) : null;
          return (
            <div key={p.id + '_' + i} className={`border rounded-xl p-3 ${p.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
              <div className="flex flex-wrap gap-3 items-start">
                {/* Preview / upload tile */}
                <div className="shrink-0">
                  <label className={`block w-32 h-20 rounded-lg overflow-hidden border-2 border-dashed flex items-center justify-center text-xs font-semibold transition cursor-pointer ${
                    uploadingIdx === i
                      ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-wait'
                      : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50'
                  } ${previewSrc ? 'border-solid border-slate-200' : ''}`}>
                    {previewSrc ? (
                      <img src={previewSrc} alt="Promo preview" className="w-full h-full object-cover" />
                    ) : uploadingIdx === i ? (
                      <span className="inline-flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><ImagePlus className="w-4 h-4" /> Upload</span>
                    )}
                    <input type="file" accept="image/*" className="sr-only"
                      disabled={!canWrite || uploadingIdx === i}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        onPick(i, file);
                      }} />
                  </label>
                  {previewSrc && (
                    <button type="button" disabled={!canWrite || uploadingIdx === i}
                      onClick={() => setOne(i, { image_url: '' })}
                      className="mt-1 text-[11px] text-slate-500 hover:text-red-600 underline">
                      Replace
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="flex flex-col text-xs">
                    <span className="text-slate-500 mb-0.5">Links to category</span>
                    <select value={p.category_id || ''} disabled={!canWrite}
                      onChange={(e) => setOne(i, { category_id: e.target.value })}
                      className={`px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 ${catErr ? 'border-red-300' : 'border-slate-200'}`}>
                      <option value="">— pick a category —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                      ))}
                      {/* Preserve a saved value that no longer matches any category
                          (e.g. category was renamed) — admin can re-pick. */}
                      {p.category_id && !categories.some((c) => c.id === p.category_id) && (
                        <option value={p.category_id}>{p.category_id} (missing)</option>
                      )}
                    </select>
                    {/* Inline warning when the saved value doesn't resolve to a
                        live category. We only show this after the category list
                        has loaded (categories.length > 0) so the row doesn't
                        false-flag during the initial fetch. The storefront
                        marquee falls back to "show all products" in this
                        state, so it's a soft warning, not a save-blocking error. */}
                    {p.category_id && categories.length > 0 && !categories.some((c) => c.id === p.category_id) && (
                      <div className="mt-1 inline-flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                          “{p.category_id}” isn’t in your category catalog. Banner clicks will fall back to “All products” until you pick a current category.
                        </span>
                      </div>
                    )}
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="text-slate-500 mb-0.5">Image alt text (accessibility)</span>
                    <input type="text" value={p.alt || ''} disabled={!canWrite} maxLength={150}
                      onChange={(e) => setOne(i, { alt: e.target.value })}
                      placeholder="e.g. Diwali sale 30% off leafy greens"
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                  </label>
                  {/* Per-promo size overrides. Blank fields = use storefront
                      defaults (h-24 on mobile, h-32 on desktop, width auto).
                      Width is intentionally optional so admins who only need
                      to tweak the height can leave aspect ratio alone. */}
                  <div>
                    <div className="text-[11px] text-slate-500 mb-1">Banner size (px) — leave blank for auto</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col text-[11px]">
                        <span className="text-slate-500 mb-0.5">Mobile height</span>
                        <input type="number" min="20" max="800" step="1" disabled={!canWrite}
                          value={p.height_mobile_px ?? ''}
                          onChange={(e) => setOne(i, { height_mobile_px: e.target.value === '' ? null : Number(e.target.value) })}
                          placeholder="96"
                          className="px-2 py-1 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                      </label>
                      <label className="flex flex-col text-[11px]">
                        <span className="text-slate-500 mb-0.5">Desktop height</span>
                        <input type="number" min="20" max="800" step="1" disabled={!canWrite}
                          value={p.height_desktop_px ?? ''}
                          onChange={(e) => setOne(i, { height_desktop_px: e.target.value === '' ? null : Number(e.target.value) })}
                          placeholder="128"
                          className="px-2 py-1 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                      </label>
                      <label className="flex flex-col text-[11px]">
                        <span className="text-slate-500 mb-0.5">Mobile width</span>
                        <input type="number" min="20" max="800" step="1" disabled={!canWrite}
                          value={p.width_mobile_px ?? ''}
                          onChange={(e) => setOne(i, { width_mobile_px: e.target.value === '' ? null : Number(e.target.value) })}
                          placeholder="auto"
                          className="px-2 py-1 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                      </label>
                      <label className="flex flex-col text-[11px]">
                        <span className="text-slate-500 mb-0.5">Desktop width</span>
                        <input type="number" min="20" max="800" step="1" disabled={!canWrite}
                          value={p.width_desktop_px ?? ''}
                          onChange={(e) => setOne(i, { width_desktop_px: e.target.value === '' ? null : Number(e.target.value) })}
                          placeholder="auto"
                          className="px-2 py-1 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 self-stretch">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 whitespace-nowrap">
                    <input type="checkbox" checked={!!p.enabled} disabled={!canWrite}
                      onChange={(e) => setOne(i, { enabled: e.target.checked })}
                      className="w-4 h-4" />
                    Enabled
                  </label>
                  <div className="flex items-center gap-1 mt-auto">
                    <button type="button" disabled={!canWrite || i === 0}
                      onClick={() => moveOne(i, -1)}
                      className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                      aria-label="Move up">▲</button>
                    <button type="button" disabled={!canWrite || i === promos.length - 1}
                      onClick={() => moveOne(i, 1)}
                      className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                      aria-label="Move down">▼</button>
                    <button type="button" disabled={!canWrite}
                      onClick={() => removeOne(i)}
                      className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-slate-300">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
              {(idErr || imgErr || catErr) && (
                <div className="text-xs text-red-600 mt-1.5 space-y-0.5">
                  {idErr  && <div>{idErr}</div>}
                  {imgErr && <div>{imgErr}</div>}
                  {catErr && <div>{catErr}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canWrite && promos.length < 12 && (
        <button type="button" onClick={addOne}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700">
          <Plus className="w-3.5 h-3.5" /> Add promotion
        </button>
      )}
      {promos.length >= 12 && (
        <p className="mt-2 text-[11px] text-slate-400">Maximum 12 promotions per marquee.</p>
      )}
    </div>
  );
}

// ============================================================
// SettingsTranslationsPanel (Phase 2 i18n)
// ============================================================
// Generic flat-key editor for `BusinessSettings.translations`. Lists every
// translatable copy field with a small h1 group, then `hi` + `bn` inputs.
// Empty values get pruned from the JSON so the column stays tidy.
//
// The list of keys is built dynamically from the draft's other fields:
// - branding: company_name / company_tagline / company_address (when set)
// - support: support_message (when set)
// - policy: return_window_message (when set)
// - hero pills: hero_<key> for each non-empty entry in home_hero_features
// - PDP badges: badge_<key>_title / badge_<key>_subtitle (+ alt variants for
//   the returns badge) for each non-empty entry in product_detail_badges
//
// This means the admin only sees translation slots for copy they've actually
// filled in — no clutter from disabled badges or empty subtitles.
function SettingsTranslationsPanel({ draft, setDraft, canWrite }) {
  const translations = draft.translations || {};

  const setOne = (key, locale, value) => {
    const cur = { ...(translations[key] || {}) };
    if (value && value.trim()) cur[locale] = value;
    else delete cur[locale];
    const next = { ...translations };
    if (Object.keys(cur).length === 0) delete next[key];
    else next[key] = cur;
    setDraft((d) => ({ ...d, translations: next }));
  };

  // Build the row catalog from the canonical English values in the draft.
  // Rows for empty English values are skipped — translating nothing into
  // Hindi makes no sense.
  const rows = [];
  if (draft.company_name && draft.company_name.trim())     rows.push({ group: 'Company', key: 'company_name',     label: 'Company name',    en: draft.company_name });
  if (draft.company_tagline && draft.company_tagline.trim()) rows.push({ group: 'Company', key: 'company_tagline',  label: 'Tagline',         en: draft.company_tagline });
  if (draft.company_address && draft.company_address.trim()) rows.push({ group: 'Company', key: 'company_address',  label: 'Address',         en: draft.company_address, multiline: true });
  if (draft.support_message && draft.support_message.trim()) rows.push({ group: 'Support', key: 'support_message',  label: 'Support message', en: draft.support_message, multiline: true });
  if (draft.return_window_message && draft.return_window_message.trim()) rows.push({ group: 'Policy', key: 'return_window_message', label: 'Return window message', en: draft.return_window_message, multiline: true });
  (draft.home_hero_features || []).forEach((f) => {
    if (f.title && f.title.trim()) rows.push({ group: 'Home hero', key: `hero_${f.key}`, label: `Hero · ${f.key}`, en: f.title });
  });
  (draft.product_detail_badges || []).forEach((b) => {
    if (b.title && b.title.trim()) rows.push({ group: 'Product badges', key: `badge_${b.key}_title`, label: `Badge · ${b.key} · title`, en: b.title });
    if (b.subtitle && b.subtitle.trim()) rows.push({ group: 'Product badges', key: `badge_${b.key}_subtitle`, label: `Badge · ${b.key} · subtitle`, en: b.subtitle });
    if (b.title_alt && b.title_alt.trim()) rows.push({ group: 'Product badges', key: `badge_${b.key}_title_alt`, label: `Badge · ${b.key} · title (alt)`, en: b.title_alt });
    if (b.subtitle_alt && b.subtitle_alt.trim()) rows.push({ group: 'Product badges', key: `badge_${b.key}_subtitle_alt`, label: `Badge · ${b.key} · subtitle (alt)`, en: b.subtitle_alt });
  });

  // Group rows by `group` for visual separation.
  const groups = rows.reduce((acc, r) => {
    (acc[r.group] = acc[r.group] || []).push(r);
    return acc;
  }, {});

  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic px-1">
        Fill in some English copy on the other Settings tiles first — those values appear here for translation once saved.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([groupName, groupRows]) => (
        <div key={groupName}>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{groupName}</div>
          <div className="space-y-3">
            {groupRows.map((r) => {
              const hi = translations[r.key]?.hi || '';
              const bn = translations[r.key]?.bn || '';
              return (
                <div key={r.key} className="border border-slate-200 rounded-xl p-3 bg-white">
                  <div className="text-sm font-semibold text-slate-900 mb-1">{r.label}</div>
                  <div className="text-xs text-slate-500 mb-2 whitespace-pre-line">
                    <span className="font-mono text-[10px] text-slate-400 mr-1">en</span>{r.en}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">
                        <span className="font-mono">hi</span> · हिन्दी
                      </div>
                      {r.multiline ? (
                        <textarea rows={2} value={hi} disabled={!canWrite}
                          onChange={(e) => setOne(r.key, 'hi', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
                      ) : (
                        <input value={hi} disabled={!canWrite}
                          onChange={(e) => setOne(r.key, 'hi', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">
                        <span className="font-mono">bn</span> · বাংলা
                      </div>
                      {r.multiline ? (
                        <textarea rows={2} value={bn} disabled={!canWrite}
                          onChange={(e) => setOne(r.key, 'bn', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
                      ) : (
                        <input value={bn} disabled={!canWrite}
                          onChange={(e) => setOne(r.key, 'bn', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// ACCOUNTING — credit aggregate dashboard (BRD §6)
// Total outstanding (B2B vs B2C), ageing buckets, customer-wise summary,
// alerts, daily disbursed-vs-collected trend, and a bulk reminder action.
// Read-only; one round-trip to /api/admin/credit/accounting populates
// everything.
// ============================================================
// Filter-bar component. Lifts UI out of the page body so the page itself
// stays focused on data rendering.
function AccountingFilterBar({ draft, onChange, onApply, onReset, applied, hasActive, loading, onExport, exporting }) {
  const set = (k, v) => onChange({ ...draft, [k]: v });
  const isExporting = exporting != null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Filters</div>
        {hasActive && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">FILTERED</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-1">
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">From</label>
          <input type="date" value={draft.from} onChange={(e) => set('from', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div className="lg:col-span-1">
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">To</label>
          <input type="date" value={draft.to} onChange={(e) => set('to', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Customer type</label>
          <select value={draft.customer_type} onChange={(e) => set('customer_type', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="">All types</option>
            <option value="B2B">B2B</option>
            <option value="B2C">B2C</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Status</label>
          <select value={draft.status_filter} onChange={(e) => set('status_filter', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="all">All customers</option>
            <option value="with_outstanding">With outstanding</option>
            <option value="overdue_only">Overdue only</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Payment mode</label>
          <select value={draft.payment_mode} onChange={(e) => set('payment_mode', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="">All modes</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Search</label>
          <input type="text" placeholder="Name, business, email"
            value={draft.search} onChange={(e) => set('search', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApply(); }}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={onApply} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold">
          {loading ? 'Loading…' : 'Apply filters'}
        </button>
        <button onClick={onReset} disabled={!hasActive && JSON.stringify(draft) === JSON.stringify(EMPTY_ACCOUNTING_FILTERS)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700">
          Reset
        </button>

        {/* Export buttons — operate on the *applied* filters so the file
            mirrors what's on screen. Two reports × two formats = four
            buttons, grouped under labels for clarity. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Customers:</span>
          <button onClick={() => onExport('customers', 'xlsx')} disabled={isExporting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 text-xs font-semibold">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            {exporting === 'customers-xlsx' ? '…' : 'Excel'}
          </button>
          <button onClick={() => onExport('customers', 'pdf')} disabled={isExporting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 text-xs font-semibold">
            <FileText className="w-3.5 h-3.5 text-rose-700" />
            {exporting === 'customers-pdf' ? '…' : 'PDF'}
          </button>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide ml-2">Payments:</span>
          <button onClick={() => onExport('payments', 'xlsx')} disabled={isExporting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 text-xs font-semibold">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            {exporting === 'payments-xlsx' ? '…' : 'Excel'}
          </button>
          <button onClick={() => onExport('payments', 'pdf')} disabled={isExporting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 text-xs font-semibold">
            <FileText className="w-3.5 h-3.5 text-rose-700" />
            {exporting === 'payments-pdf' ? '…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Tiny preview of what the server actually filtered on, so it's
          obvious when a user has typed but not yet hit "Apply". */}
      {hasActive && (
        <div className="text-[11px] text-slate-500 leading-relaxed">
          Active:
          {applied.from && <span> · From {applied.from}</span>}
          {applied.to && <span> · To {applied.to}</span>}
          {applied.customer_type && <span> · {applied.customer_type}</span>}
          {applied.status_filter && applied.status_filter !== 'all' && <span> · {applied.status_filter.replace('_', ' ')}</span>}
          {applied.payment_mode && <span> · {applied.payment_mode.replace('_', ' ').toLowerCase()}</span>}
          {applied.search && <span> · "{applied.search}"</span>}
        </div>
      )}
    </div>
  );
}

// Empty-state filter object. Empty strings = "no filter for that field"
// — kept as strings (not nulls) so the inputs stay controlled.
const EMPTY_ACCOUNTING_FILTERS = {
  from: '', to: '', customer_type: '', payment_mode: '',
  search: '', status_filter: 'all',
};

// Strip empty values so the URL query string stays tidy ("/accounting?from=…"
// instead of "/accounting?from=&to=&customer_type=…"). Also drops the
// no-op status_filter='all'.
function buildAccountingParams(filters) {
  const out = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === '') continue;
    if (k === 'status_filter' && v === 'all') continue;
    out[k] = v;
  }
  return out;
}

// Sales summary block — total sales, order count, B2B / B2C split, and a
// thin breakdown by payment method so the admin can see the revenue mix.
// `sales_scope` is set by the backend to 'date_range' when the page is
// scoped to a window, otherwise 'all_time'; we surface it as a chip so a
// figure can never be mistaken for "today" or "this month" by default.
const PAYMENT_METHOD_LABEL = {
  COD: 'COD',
  UPI: 'UPI',
  CARD: 'Card',
  NETBANKING: 'Net banking',
  CREDIT: 'Credit',
  OTHER: 'Other',
};
// Pretty-print a unit token. Plural-friendly for "pc" and bunch-like
// units. Defaults to the raw token uppercased for unrecognised units.
function formatUnitLabel(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'kg') return 'kg';
  if (u === 'g') return 'g';
  if (u === 'l') return 'L';
  if (u === 'ml') return 'ml';
  if (u === 'pc' || u === 'pcs' || u === 'piece') return 'pcs';
  if (u === 'bunch' || u === 'bundle') return u;
  return u || 'unit';
}
function formatQty(q) {
  const n = Number(q || 0);
  // Drop the decimal when the value is a whole number, otherwise keep
  // two places so 1.5 kg doesn't render as "2 kg".
  return Number.isInteger(n)
    ? n.toLocaleString('en-IN')
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function AccountingSalesSummary({ summary }) {
  const total = Number(summary.total_sales || 0);
  const orders = Number(summary.total_orders || 0);
  const b2b = Number(summary.sales_b2b || 0);
  const b2c = Number(summary.sales_b2c || 0);
  const byMethod = summary.sales_by_payment_method || {};
  const methodEntries = Object.entries(byMethod)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const quantityByUnit = summary.quantity_by_unit || {};
  const quantityEntries = Object.entries(quantityByUnit)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const lineItems = Number(summary.total_line_items || 0);
  const scopeLabel = summary.sales_scope === 'date_range' ? 'For selected range' : 'All-time';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total sales</div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wide">{scopeLabel}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative overflow-hidden bg-emerald-50/40 border border-emerald-200 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Gross sales</div>
          <div className="text-2xl font-bold text-emerald-800 mt-1">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">Excludes cancelled</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Orders</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{orders.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {orders > 0 ? `Avg ₹${Math.round(total / orders).toLocaleString('en-IN')}` : ' '}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">B2B sales</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">₹{b2b.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {total > 0 ? `${Math.round((b2b / total) * 100)}% of sales` : ' '}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">B2C sales</div>
          <div className="text-2xl font-bold text-sky-700 mt-1">₹{b2c.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {total > 0 ? `${Math.round((b2c / total) * 100)}% of sales` : ' '}
          </div>
        </div>
      </div>

      {methodEntries.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">By payment method</div>
          <div className="flex flex-wrap gap-2">
            {methodEntries.map(([method, amount]) => {
              const amt = Number(amount);
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
              return (
                <div key={method} className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600">{PAYMENT_METHOD_LABEL[method] || method}</span>
                  <span className="text-sm font-bold text-slate-900">₹{amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px] text-slate-500">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity sold — kept as a per-unit breakdown because kg + pcs
          can't be merged into one accountability figure. The line-items
          count sits next to it so the admin can see "how many things did
          we ship" without needing to drill into orders. */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Quantity sold</div>
          <div className="text-[11px] text-slate-500">
            {lineItems.toLocaleString('en-IN')} line item{lineItems === 1 ? '' : 's'}
          </div>
        </div>
        {quantityEntries.length === 0 ? (
          <div className="text-[12px] text-slate-400 italic">No items sold in this scope.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {quantityEntries.map(([unit, qty]) => (
              <div key={unit} className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/60 border border-emerald-200">
                <span className="text-sm font-bold text-emerald-800">{formatQty(qty)}</span>
                <span className="text-[11px] font-semibold text-emerald-700">{formatUnitLabel(unit)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminAccountingPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bulking, setBulking] = useState(false);
  // Two pieces of filter state: `draft` is what the user is typing,
  // `applied` is what the server actually filtered on. Loading/exports
  // use `applied` so the "Apply" button is the moment the report changes.
  const [draftFilters, setDraftFilters] = useState(EMPTY_ACCOUNTING_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_ACCOUNTING_FILTERS);
  const [exporting, setExporting] = useState(null); // 'customers-xlsx' | 'customers-pdf' | 'payments-xlsx' | 'payments-pdf' | null

  const load = useCallback(async (filters) => {
    setLoading(true);
    try {
      const r = await adminApi.getCreditAccounting(buildAccountingParams(filters));
      setData(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load accounting', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(appliedFilters); }, [load, appliedFilters]);

  const onApplyFilters = () => setAppliedFilters(draftFilters);
  const onResetFilters = () => {
    setDraftFilters(EMPTY_ACCOUNTING_FILTERS);
    setAppliedFilters(EMPTY_ACCOUNTING_FILTERS);
  };

  const onExport = async (report, format) => {
    const key = `${report}-${format}`;
    setExporting(key);
    try {
      await adminApi.downloadAccountingReport(report, format, buildAccountingParams(appliedFilters));
    } catch (err) {
      toast.push(err.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };

  const onBulkRemind = async () => {
    if (!confirm('Send overdue reminders to every customer with at least one past-due invoice?')) return;
    setBulking(true);
    try {
      const r = await adminApi.bulkRemind();
      toast.push(`Reminders sent to ${r.data.customers_notified} customer${r.data.customers_notified === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.push(err.message || 'Could not send reminders', 'error');
    } finally {
      setBulking(false);
    }
  };

  // True when at least one filter is non-default.
  const hasActiveFilters = JSON.stringify(appliedFilters) !== JSON.stringify(EMPTY_ACCOUNTING_FILTERS);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-32" />
        <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-64" />
      </div>
    );
  }
  if (!data) return null;

  const { summary, ageing, customers, alerts, trend, recent_payments = [] } = data;

  // Headline cards. Each one keys off TILE_PALETTES so the card visuals
  // match the admin shell's hue treatment elsewhere.
  const headlineCards = [
    { label: 'Total outstanding', value: summary.total_outstanding, palette: 'emerald', sub: `${summary.total_credit_customers} credit customer${summary.total_credit_customers === 1 ? '' : 's'}` },
    { label: 'B2B outstanding', value: summary.outstanding_b2b, palette: 'indigo' },
    { label: 'B2C outstanding', value: summary.outstanding_b2c, palette: 'sky' },
    { label: 'Total overdue', value: summary.total_overdue, palette: 'rose', sub: summary.total_overdue > 0 ? 'past due date' : 'all current' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounting</h1>
          <p className="text-sm text-slate-600">Total sales, credit outstanding across all customers, ageing buckets, and payment trends.</p>
        </div>
        <button onClick={onBulkRemind} disabled={bulking || summary.total_overdue === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold">
          <AlertCircle className="w-4 h-4" />
          {bulking ? 'Sending…' : 'Send overdue reminders'}
        </button>
      </div>

      {/* Filters + downloads. Filters are intentionally on a separate
          "Apply" gesture so toggling several values doesn't refire the
          backend on every keystroke. */}
      <AccountingFilterBar
        draft={draftFilters}
        onChange={setDraftFilters}
        onApply={onApplyFilters}
        onReset={onResetFilters}
        applied={appliedFilters}
        hasActive={hasActiveFilters}
        loading={loading}
        onExport={onExport}
        exporting={exporting}
      />

      {/* Sales summary — gross sales for the active scope, alongside the
          credit headline so the page reads as a single accountability view. */}
      <AccountingSalesSummary summary={summary} />

      {/* Headline cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {headlineCards.map((c) => {
          const palette = TILE_PALETTES[c.palette] || TILE_PALETTES.slate;
          return (
            <div key={c.label} className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.gradient}`} />
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{c.label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">₹{Number(c.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              {c.sub && <div className="text-[11px] text-slate-500 mt-0.5">{c.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Ageing buckets */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Overdue ageing</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Current', value: ageing.current, tone: 'emerald' },
            { label: '0–30 days', value: ageing['0-30'], tone: 'amber' },
            { label: '31–60 days', value: ageing['31-60'], tone: 'orange' },
            { label: '61–90 days', value: ageing['61-90'], tone: 'rose' },
            { label: '90+ days', value: ageing['90+'], tone: 'rose' },
          ].map((b) => (
            <div key={b.label} className="rounded-lg border border-slate-200 p-3">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">{b.label}</div>
              <div className={`text-lg font-bold mt-1 ${b.tone === 'rose' ? 'text-rose-700' : b.tone === 'orange' ? 'text-orange-700' : b.tone === 'amber' ? 'text-amber-700' : 'text-emerald-700'}`}>
                ₹{Number(b.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {(alerts.high_utilisation.length > 0 || alerts.long_overdue.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-3">
          {alerts.high_utilisation.length > 0 && (
            <AlertList title="80%+ of credit limit"
              tone="amber" rows={alerts.high_utilisation}
              renderRow={(c) => `${c.full_name} · ${c.utilisation_pct}% used (₹${Number(c.outstanding).toFixed(0)} of ₹${Number(c.credit_limit).toFixed(0)})`} />
          )}
          {alerts.long_overdue.length > 0 && (
            <AlertList title="Overdue 30+ days"
              tone="rose" rows={alerts.long_overdue}
              renderRow={(c) => `${c.full_name} · ${c.oldest_overdue_days}d oldest, ₹${Number(c.overdue_amount).toFixed(0)} owed`} />
          )}
        </div>
      )}

      {/* 30-day trend */}
      {trend?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credit disbursed vs collected — last 30 days</div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Disbursed</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" />Collected</span>
            </div>
          </div>
          <CreditTrendChart trend={trend} />
        </div>
      )}

      {/* Payments received — date-wise list of every recorded payment.
          Grouped under day headers so the admin can scan "what came in
          today / yesterday / last Monday" without scrolling a flat list. */}
      <PaymentsReceivedSection payments={recent_payments} />

      {/* Customer-wise summary table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer-wise credit ({customers.length})</div>
        </div>
        {customers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No credit-enabled customers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Customer</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Type</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Limit</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Used</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Available</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Overdue</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Oldest overdue</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.customer_id} className={`border-t border-slate-100 ${c.oldest_overdue_days > 30 ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900 truncate max-w-xs">{c.full_name}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{c.email}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.customer_type === 'B2B' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {c.customer_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">₹{Number(c.credit_limit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="text-slate-900 font-semibold">₹{Number(c.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                      {c.utilisation_pct != null && (
                        <div className={`text-[10px] ${c.utilisation_pct >= 80 ? 'text-rose-600' : 'text-slate-500'}`}>{c.utilisation_pct}%</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700 font-semibold">₹{Number(c.available).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2 text-right">
                      {c.overdue_amount > 0 ? (
                        <span className="text-rose-700 font-semibold">₹{Number(c.overdue_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {c.oldest_overdue_days > 0 ? (
                        <span className="text-rose-700 font-bold">{c.oldest_overdue_days}d</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CUSTOMER REPORT — per-customer accountability
// One row per customer with: total sales, total quantity sold,
// outstanding balance, credit limit (for B2B) and credit utilisation.
// Filters + Excel/PDF export. Gated on the 'reports' permission.
// ============================================================
const EMPTY_CUSTOMER_REPORT_FILTERS = {
  from: '', to: '', customer_type: '', search: '',
  has_outstanding: false, has_credit_limit: false, sort: 'sales',
};
function buildCustomerReportParams(f) {
  const out = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.customer_type) out.customer_type = f.customer_type;
  if (f.search) out.search = f.search;
  if (f.has_outstanding) out.has_outstanding = '1';
  if (f.has_credit_limit) out.has_credit_limit = '1';
  if (f.sort && f.sort !== 'sales') out.sort = f.sort;
  return out;
}

// Format the per-unit map for display in a table cell. Mirrors the
// backend `quantity_display` field for parity with exports.
function formatQuantityMap(map) {
  const entries = Object.entries(map || {}).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return '—';
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries
    .map(([u, q]) => `${formatQty(q)} ${formatUnitLabel(u)}`)
    .join(' · ');
}

function AdminCustomerReportPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(EMPTY_CUSTOMER_REPORT_FILTERS);
  const [applied, setApplied] = useState(EMPTY_CUSTOMER_REPORT_FILTERS);
  const [exporting, setExporting] = useState(null); // 'xlsx' | 'pdf' | null

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const r = await adminApi.getCustomerReport(buildCustomerReportParams(f));
      setData(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load customer report', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(applied); }, [load, applied]);

  const onApply = () => setApplied(draft);
  const onReset = () => { setDraft(EMPTY_CUSTOMER_REPORT_FILTERS); setApplied(EMPTY_CUSTOMER_REPORT_FILTERS); };
  const onExport = async (format) => {
    setExporting(format);
    try {
      await adminApi.downloadCustomerReport(format, buildCustomerReportParams(applied));
    } catch (err) {
      toast.push(err.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };

  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const hasActive = JSON.stringify(applied) !== JSON.stringify(EMPTY_CUSTOMER_REPORT_FILTERS);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-32" />
        <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-64" />
      </div>
    );
  }
  if (!data) return null;

  const { rows = [], totals = {} } = data;
  const scopeLabel = (applied.from || applied.to) ? 'For selected range' : 'All-time';
  const summaryCards = [
    { label: 'Customers', value: totals.customers, palette: 'indigo', isCount: true },
    { label: 'Total sales', value: totals.total_sales, palette: 'emerald' },
    { label: 'Total outstanding', value: totals.total_outstanding, palette: 'rose' },
    { label: 'Total credit limit', value: totals.total_credit_limit, palette: 'teal',
      sub: `${totals.customers_with_credit || 0} customer${(totals.customers_with_credit || 0) === 1 ? '' : 's'} assigned` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Report</h1>
          <p className="text-sm text-slate-600">Per-customer total sales, quantity sold, outstanding balance and assigned credit limit (B2B) — for accountability and downloads.</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wide">{scopeLabel}</span>
      </div>

      {/* Filters + downloads */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Filters</div>
          {hasActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">FILTERED</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">From</label>
            <input type="date" value={draft.from} onChange={(e) => set('from', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">To</label>
            <input type="date" value={draft.to} onChange={(e) => set('to', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Customer type</label>
            <select value={draft.customer_type} onChange={(e) => set('customer_type', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="">All types</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Sort by</label>
            <select value={draft.sort} onChange={(e) => set('sort', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="sales">Total sales (high → low)</option>
              <option value="outstanding">Outstanding (high → low)</option>
              <option value="orders">Order count (high → low)</option>
              <option value="name">Customer name (A → Z)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Search</label>
            <input type="text" placeholder="Name, business, email, phone"
              value={draft.search} onChange={(e) => set('search', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onApply(); }}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={draft.has_outstanding}
              onChange={(e) => set('has_outstanding', e.target.checked)}
              className="rounded border-slate-300" />
            With outstanding only
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={draft.has_credit_limit}
              onChange={(e) => set('has_credit_limit', e.target.checked)}
              className="rounded border-slate-300" />
            Credit-limit assigned only (B2B)
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={onApply} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold">
            {loading ? 'Loading…' : 'Apply filters'}
          </button>
          <button onClick={onReset} disabled={!hasActive && JSON.stringify(draft) === JSON.stringify(EMPTY_CUSTOMER_REPORT_FILTERS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700">
            Reset
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Download:</span>
            <button onClick={() => onExport('xlsx')} disabled={exporting != null}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 text-xs font-semibold">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              {exporting === 'xlsx' ? '…' : 'Excel'}
            </button>
            <button onClick={() => onExport('pdf')} disabled={exporting != null}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 text-xs font-semibold">
              <FileText className="w-3.5 h-3.5 text-rose-700" />
              {exporting === 'pdf' ? '…' : 'PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => {
          const palette = TILE_PALETTES[c.palette] || TILE_PALETTES.slate;
          return (
            <div key={c.label} className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.gradient}`} />
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{c.label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {c.isCount
                  ? Number(c.value || 0).toLocaleString('en-IN')
                  : `₹${Number(c.value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              </div>
              {c.sub && <div className="text-[11px] text-slate-500 mt-0.5">{c.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Aggregate quantity sold across all matched customers */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Total quantity sold</div>
        <div className="text-sm text-slate-800">{formatQuantityMap(totals.quantity_by_unit)}</div>
      </div>

      {/* Customer-wise table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customers ({rows.length})</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No customers match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Customer</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Type</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Orders</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Total sales</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Quantity sold</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Outstanding</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Credit limit</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Used %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id} className={`border-t border-slate-100 ${r.outstanding > 0 && (r.utilisation_pct ?? 0) >= 80 ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900 truncate max-w-xs">
                        {r.customer_type === 'B2B' && r.business_name ? r.business_name : r.full_name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {r.customer_type === 'B2B' && r.business_name
                          ? `${r.full_name} · ${r.email}`
                          : r.email}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.customer_type === 'B2B' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {r.customer_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">{Number(r.total_orders).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">
                      ₹{Number(r.total_sales).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2 text-slate-700 text-xs">{formatQuantityMap(r.quantity_by_unit)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.outstanding > 0 ? (
                        <span className="text-rose-700 font-semibold">₹{Number(r.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.credit_assigned ? (
                        <div>
                          <div className="text-slate-900 font-semibold">₹{Number(r.credit_limit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                          {r.payment_terms_days != null && (
                            <div className="text-[10px] text-slate-500">{r.payment_terms_days}d terms</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">— not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.utilisation_pct == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={`font-semibold ${r.utilisation_pct >= 80 ? 'text-rose-700' : r.utilisation_pct >= 50 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {r.utilisation_pct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Date-grouped list of payments received. Each day gets a header row with
// a daily total; individual payments hang underneath. Driven by the
// `recent_payments` array from /admin/credit/accounting (latest 50).
function PaymentsReceivedSection({ payments }) {
  const grouped = (() => {
    const m = new Map();
    for (const p of payments) {
      const key = new Date(p.payment_date).toISOString().slice(0, 10);
      if (!m.has(key)) m.set(key, { total: 0, items: [] });
      const row = m.get(key);
      row.total += Number(p.amount);
      row.items.push(p);
    }
    return [...m.entries()];
  })();

  const grandTotal = payments.reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Payments received ({payments.length})
        </div>
        {payments.length > 0 && (
          <div className="text-xs text-slate-600">
            Latest {payments.length} · <span className="font-semibold text-emerald-700">₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> total
          </div>
        )}
      </div>
      {payments.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">No payments recorded yet.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {grouped.map(([date, group]) => (
            <div key={date}>
              <div className="px-5 py-2 bg-slate-50 flex items-center justify-between text-xs">
                <div className="font-semibold text-slate-700">
                  {new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div className="text-slate-600">
                  {group.items.length} payment{group.items.length === 1 ? '' : 's'} ·
                  <span className="font-semibold text-emerald-700 ml-1">
                    ₹{group.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {group.items.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-2">
                        <div className="font-semibold text-slate-900 text-sm truncate">
                          {p.customer_type === 'B2B' && p.business_name ? p.business_name : p.customer_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.customer_type === 'B2B' && p.business_name ? `${p.customer_name} · ` : ''}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.customer_type === 'B2B' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {p.customer_type || 'B2C'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {p.mode.replace('_', ' ').toLowerCase()}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-500 truncate max-w-[140px]">
                        {p.reference_no || '—'}
                      </td>
                      <td className="px-5 py-2 text-right whitespace-nowrap">
                        <span className="font-bold text-emerald-700">
                          ₹{Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertList({ title, tone, rows, renderRow }) {
  const palette = tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-rose-200 bg-rose-50 text-rose-900';
  return (
    <div className={`border rounded-xl p-4 ${palette}`}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> {title} ({rows.length})
      </div>
      <ul className="space-y-1 text-xs max-h-40 overflow-y-auto">
        {rows.slice(0, 10).map((r) => (
          <li key={r.customer_id} className="leading-relaxed">{renderRow(r)}</li>
        ))}
        {rows.length > 10 && (
          <li className="italic opacity-70">…and {rows.length - 10} more</li>
        )}
      </ul>
    </div>
  );
}

// 30-day disbursed-vs-collected pure-CSS chart. Two stacked rows of bars
// keyed off the daily max. Same approach as AdminReportsPage so we don't
// pull in a charting library for what is effectively "show a sparkline".
function CreditTrendChart({ trend }) {
  const max = Math.max(1, ...trend.map((d) => Math.max(d.disbursed, d.collected)));
  return (
    <div className="flex items-end gap-1 h-28">
      {trend.map((d, i) => {
        const dh = (d.disbursed / max) * 100;
        const ch = (d.collected / max) * 100;
        const date = new Date(d.date);
        const isMonthStart = date.getDate() === 1 || i === 0;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-px relative group">
            <div className="w-full flex items-end gap-px h-24">
              <div className="flex-1 bg-emerald-500 rounded-t-sm transition-all hover:bg-emerald-600"
                style={{ height: `${dh}%`, minHeight: d.disbursed > 0 ? '2px' : '0' }} />
              <div className="flex-1 bg-sky-500 rounded-t-sm transition-all hover:bg-sky-600"
                style={{ height: `${ch}%`, minHeight: d.collected > 0 ? '2px' : '0' }} />
            </div>
            {isMonthStart && (
              <div className="text-[9px] text-slate-500 mt-1">
                {date.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' })}
              </div>
            )}
            {/* Hover tooltip — pure CSS, no JS state */}
            <div className="hidden group-hover:block absolute bottom-full mb-1 z-10 bg-slate-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
              {date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              {' · '}
              D ₹{d.disbursed.toFixed(0)} · C ₹{d.collected.toFixed(0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// AdminB2BCustomersPage — "My B2B Customers" report tile.
// Extracts B2B-only customers with separate business-name / GSTIN
// filters and a date range that scopes the orders count (the
// customer list itself stays full so 0-order customers are visible
// for churn analysis). Excel + PDF download via /b2b-customers/export.
// Gated on the 'reports' permission.
// ============================================================
const EMPTY_B2B_FILTERS = {
  from: '', to: '', business_name: '', gstin: '', sort: 'total_sales',
};
function buildB2BParams(f) {
  const out = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.business_name) out.business_name = f.business_name.trim();
  if (f.gstin) out.gstin = f.gstin.trim();
  if (f.sort) out.sort = f.sort;
  return out;
}

function AdminB2BCustomersPage() {
  const toast = useToast();
  const auth = useAdminAuth();
  // When the logged-in admin is B2B-scoped, both the input and the
  // backend query are pinned to their company. The dropdown UI tells
  // them the lock is in effect rather than letting them type a
  // different name and wonder why nothing else appears.
  const lockedScope = auth.admin?.scoped_business_name || null;
  const initialFilters = lockedScope
    ? { ...EMPTY_B2B_FILTERS, business_name: lockedScope }
    : EMPTY_B2B_FILTERS;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [exporting, setExporting] = useState(null); // 'xlsx' | 'pdf' | null

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const r = await adminApi.getB2BCustomers(buildB2BParams(f));
      setData(r.data);
    } catch (err) {
      toast.push(err.message || 'Could not load B2B customers', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(applied); }, [load, applied]);

  const onApply = () => setApplied(draft);
  const onReset = () => {
    // Reset preserves the scoped business name — a scoped admin can't
    // "reset away" their lock, only clear other fields.
    const base = lockedScope
      ? { ...EMPTY_B2B_FILTERS, business_name: lockedScope }
      : EMPTY_B2B_FILTERS;
    setDraft(base);
    setApplied(base);
  };
  const onExport = async (format) => {
    setExporting(format);
    try {
      await adminApi.downloadB2BCustomers(format, buildB2BParams(applied));
    } catch (err) {
      toast.push(err.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };

  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const hasActive = JSON.stringify(applied) !== JSON.stringify(EMPTY_B2B_FILTERS);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-32" />
        <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-64" />
      </div>
    );
  }
  if (!data) return null;

  const { rows = [], totals = {}, date_range_active: rangeActive = false } = data;
  const scopeLabel = rangeActive ? 'Orders within range' : 'All-time orders';
  // When a date range is active, the "in range" totals are the orders-count
  // signal the admin cares about. Otherwise those values mirror lifetime —
  // so we surface lifetime explicitly in the second card to avoid implying
  // there's a filter when there isn't one.
  const summaryCards = [
    { label: 'B2B customers', value: totals.customers, palette: 'indigo', isCount: true },
    { label: rangeActive ? 'Orders in range' : 'Lifetime orders', value: totals.orders_in_range, palette: 'emerald', isCount: true },
    { label: rangeActive ? 'Sales in range' : 'Lifetime sales', value: totals.sales_in_range, palette: 'amber' },
    { label: 'Lifetime sales', value: totals.total_sales, palette: 'teal',
      sub: rangeActive ? `${Number(totals.total_orders || 0).toLocaleString('en-IN')} lifetime orders` : null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My B2B Customers</h1>
          <p className="text-sm text-slate-600">Extract your B2B customer list by business name and GSTIN. Use the date range to count orders placed in a specific window.</p>
          {lockedScope && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800">
              <Shield className="w-3 h-3" />
              Showing data scoped to <span className="font-bold">{lockedScope}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wide">{scopeLabel}</span>
      </div>

      {/* Filters + downloads */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Filters</div>
          {hasActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">FILTERED</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Orders from</label>
            <input type="date" value={draft.from} onChange={(e) => set('from', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Orders to</label>
            <input type="date" value={draft.to} onChange={(e) => set('to', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Business name {lockedScope && <span className="ml-1 text-indigo-700 normal-case font-bold">· locked to your company</span>}
            </label>
            <input type="text" placeholder="e.g. Sharma Traders" value={draft.business_name}
              disabled={!!lockedScope}
              onChange={(e) => set('business_name', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onApply(); }}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:bg-indigo-50 disabled:border-indigo-200 disabled:text-indigo-900 disabled:font-semibold" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">GSTIN</label>
            <input type="text" placeholder="15-char GSTIN" value={draft.gstin}
              onChange={(e) => set('gstin', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onApply(); }}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm uppercase" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Sort by</label>
            <select value={draft.sort} onChange={(e) => set('sort', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
              <option value="total_sales">Lifetime sales (high → low)</option>
              <option value="orders_in_range">Orders in range (high → low)</option>
              <option value="total_orders">Lifetime orders (high → low)</option>
              <option value="business_name">Business name (A → Z)</option>
              <option value="gstin">GSTIN (A → Z)</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={onApply} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold">
            {loading ? 'Loading…' : 'Apply filters'}
          </button>
          <button onClick={onReset} disabled={!hasActive && JSON.stringify(draft) === JSON.stringify(EMPTY_B2B_FILTERS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700">
            Reset
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Download:</span>
            <button onClick={() => onExport('xlsx')} disabled={exporting != null}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40 text-xs font-semibold">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              {exporting === 'xlsx' ? '…' : 'Excel'}
            </button>
            <button onClick={() => onExport('pdf')} disabled={exporting != null}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 text-xs font-semibold">
              <FileText className="w-3.5 h-3.5 text-rose-700" />
              {exporting === 'pdf' ? '…' : 'PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => {
          const palette = TILE_PALETTES[c.palette] || TILE_PALETTES.slate;
          return (
            <div key={c.label} className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.gradient}`} />
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{c.label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {c.isCount
                  ? Number(c.value || 0).toLocaleString('en-IN')
                  : `₹${Number(c.value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              </div>
              {c.sub && <div className="text-[11px] text-slate-500 mt-0.5">{c.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Customer-wise table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">B2B customers ({rows.length})</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No B2B customers match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Business</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">GSTIN</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Contact</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">
                    {rangeActive ? 'Orders in range' : 'Orders (lifetime)'}
                  </th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Lifetime orders</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs text-right">Lifetime sales</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900 truncate max-w-xs">
                        {r.business_name || <span className="italic text-slate-500">(no business name)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">
                      {r.gstin || <span className="font-sans italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-slate-800 truncate max-w-xs">{r.full_name}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {[r.email, r.phone].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right ${rangeActive && r.orders_in_range === 0 ? 'text-slate-400' : 'text-slate-900 font-semibold'}`}>
                      {Number(r.orders_in_range).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">{Number(r.total_orders).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">
                      ₹{Number(r.total_sales).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.account_status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {r.account_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminSettingsPage({ route, navigate }) {
  const auth = useAdminAuth();
  const toast = useToast();
  const { setTheme } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  // null = tile landing view; otherwise one of SETTINGS_SECTIONS[].id.
  // Driven by the `section` query param so a refresh / shared link keeps
  // the admin on the same sub-tile instead of bouncing to the landing.
  // Initial value comes from the URL; subsequent changes go through
  // openSection() / closeSection() which navigate() the URL — the
  // useEffect below then syncs local state from the new route.
  const routeSection = route?.params?.section || null;
  const validInitialSection = SETTINGS_SECTIONS.some((s) => s.id === routeSection) ? routeSection : null;
  const [activeSection, setActiveSection] = useState(validInitialSection);
  const activeMeta = SETTINGS_SECTIONS.find((s) => s.id === activeSection);

  // Sync activeSection with the URL's section query param on every route
  // change. Three cases:
  //   - Initial mount: hook fires once, picks up ?section= from refresh.
  //   - Re-click of "Settings" sidebar: navigate('admin-settings') clears the
  //     param → activeSection drops to null → tile landing renders. (This
  //     preserves the prior behaviour where re-clicking the sidebar returns
  //     to the landing grid.)
  //   - Tile click / back button: openSection / closeSection push a new URL
  //     and this hook reflects it into local state.
  // Unknown / removed section ids fall back to null so a stale shared link
  // doesn't render an empty editor with no way back to the tile grid.
  useEffect(() => {
    const next = route?.params?.section || null;
    const valid = next && SETTINGS_SECTIONS.some((s) => s.id === next) ? next : null;
    setActiveSection(valid);
    setErrors({});
  }, [route]);

  const openSection = (id) => navigate('admin-settings', { section: id });
  const closeSection = () => navigate('admin-settings');
  // Tracks the in-flight hero background upload so the file picker can show
  // "Uploading…" and disable itself. Lives at the section level (not per
  // map() iteration) because only one entry — background_image — uses it.
  const [heroUploading, setHeroUploading] = useState(false);
  const [draft, setDraft] = useState({
    min_order_value: '', min_order_quantity: '',
    delivery_charge: '', free_delivery_over: '',
    delivery_slot_buffer_hours: '',
    support_phone: '', support_whatsapp: '', support_email: '', support_message: '',
    theme: 'emerald',
    cancellation_cutoff_status: 'Out for Delivery',
    return_window_hours: '24',
    return_window_message: '',
    // Empty strings = "not configured". The backend treats null lat/lng as
    // disabled-radius-check, so leaving these blank is a valid state.
    firm_latitude: '', firm_longitude: '', delivery_radius_km: '9',
    company_name: 'Redlook', company_tagline: 'Curated style, delivered.', company_address: '',
    product_detail_badges: DEFAULT_PRODUCT_DETAIL_BADGES,
    home_hero_features: DEFAULT_HOME_HERO_FEATURES,
    delivery_slots: [],
    category_promotions: [],
    max_price_filter_auto: true,
    max_price_filter_cap: '150',
    global_discount_enabled: false,
    global_discount_percent: '0',
    // Phase 2 i18n — admin-edited per-language overlays. Flat key shape
    // matches the backend storage exactly (see SettingsTranslationsPanel).
    translations: {},
  });

  const canWrite = hasPermission(auth.admin, 'settings');

  const draftFromData = (d) => ({
    min_order_value: String(d.min_order_value),
    min_order_quantity: String(d.min_order_quantity),
    delivery_charge: String(d.delivery_charge),
    free_delivery_over: String(d.free_delivery_over),
    delivery_slot_buffer_hours: String(d.delivery_slot_buffer_hours),
    support_phone: d.support_phone || '',
    support_whatsapp: d.support_whatsapp || '',
    support_email: d.support_email || '',
    support_message: d.support_message || '',
    theme: d.theme || 'emerald',
    cancellation_cutoff_status: d.cancellation_cutoff_status || 'Out for Delivery',
    return_window_hours: String(d.return_window_hours ?? 24),
    return_window_message: d.return_window_message || '',
    firm_latitude: d.firm_latitude == null ? '' : String(d.firm_latitude),
    firm_longitude: d.firm_longitude == null ? '' : String(d.firm_longitude),
    delivery_radius_km: String(d.delivery_radius_km ?? 9),
    company_name: d.company_name || 'Redlook',
    company_tagline: d.company_tagline || '',
    company_address: d.company_address || '',
    // Defensive merge: if the API drops a key (older deployment), fall back
    // to the catalog default so the editor still renders all four/three
    // entries. Order is enforced by the catalog, not the server response.
    product_detail_badges: mergeBadges(DEFAULT_PRODUCT_DETAIL_BADGES, d.product_detail_badges),
    home_hero_features: mergeBadges(DEFAULT_HOME_HERO_FEATURES, d.home_hero_features),
    delivery_slots: Array.isArray(d.delivery_slots) ? d.delivery_slots : [],
    category_promotions: Array.isArray(d.category_promotions) ? d.category_promotions : [],
    max_price_filter_auto: d.max_price_filter_auto ?? true,
    max_price_filter_cap: String(d.max_price_filter_cap ?? 150),
    global_discount_enabled: !!d.global_discount_enabled,
    global_discount_percent: String(d.global_discount_percent ?? 0),
    translations: d.translations || {},
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.getSettings();
      setData(r.data);
      setDraft(draftFromData(r.data));
    } catch (err) {
      toast.push(err.message || 'Could not load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Buttons stay disabled until the draft differs from what's saved — saves a
  // pointless write and makes "did anything change?" visible at a glance.
  const dirty = data && (
    Number(draft.min_order_value) !== Number(data.min_order_value)
    || Number(draft.min_order_quantity) !== Number(data.min_order_quantity)
    || Number(draft.delivery_charge) !== Number(data.delivery_charge)
    || Number(draft.free_delivery_over) !== Number(data.free_delivery_over)
    || Number(draft.delivery_slot_buffer_hours) !== Number(data.delivery_slot_buffer_hours)
    || draft.support_phone !== (data.support_phone || '')
    || draft.support_whatsapp !== (data.support_whatsapp || '')
    || draft.support_email !== (data.support_email || '')
    || draft.support_message !== (data.support_message || '')
    || draft.theme !== (data.theme || 'emerald')
    || draft.cancellation_cutoff_status !== (data.cancellation_cutoff_status || 'Out for Delivery')
    || Number(draft.return_window_hours) !== Number(data.return_window_hours ?? 24)
    || draft.return_window_message !== (data.return_window_message || '')
    || draft.firm_latitude !== (data.firm_latitude == null ? '' : String(data.firm_latitude))
    || draft.firm_longitude !== (data.firm_longitude == null ? '' : String(data.firm_longitude))
    || Number(draft.delivery_radius_km) !== Number(data.delivery_radius_km ?? 9)
    || draft.company_name !== (data.company_name || 'Redlook')
    || draft.company_tagline !== (data.company_tagline || '')
    || draft.company_address !== (data.company_address || '')
    || JSON.stringify(draft.product_detail_badges)
       !== JSON.stringify(mergeBadges(DEFAULT_PRODUCT_DETAIL_BADGES, data.product_detail_badges))
    || JSON.stringify(draft.home_hero_features)
       !== JSON.stringify(mergeBadges(DEFAULT_HOME_HERO_FEATURES, data.home_hero_features))
    || JSON.stringify(draft.delivery_slots || []) !== JSON.stringify(data.delivery_slots || [])
    || JSON.stringify(draft.category_promotions || []) !== JSON.stringify(data.category_promotions || [])
    || !!draft.max_price_filter_auto !== !!data.max_price_filter_auto
    || Number(draft.max_price_filter_cap) !== Number(data.max_price_filter_cap ?? 150)
    || !!draft.global_discount_enabled !== !!data.global_discount_enabled
    || Number(draft.global_discount_percent) !== Number(data.global_discount_percent ?? 0)
    || JSON.stringify(draft.translations || {}) !== JSON.stringify(data.translations || {})
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    const value = Number(draft.min_order_value);
    const qty = Number(draft.min_order_quantity);
    const charge = Number(draft.delivery_charge);
    const freeOver = Number(draft.free_delivery_over);
    const bufferHours = Number(draft.delivery_slot_buffer_hours);
    const fieldErrors = {};
    if (!Number.isFinite(value) || value < 0) fieldErrors.min_order_value = 'Must be 0 or more';
    if (!Number.isInteger(qty) || qty < 1) fieldErrors.min_order_quantity = 'Must be a whole number, 1 or more';
    if (!Number.isFinite(charge) || charge < 0) fieldErrors.delivery_charge = 'Must be 0 or more';
    if (!Number.isFinite(freeOver) || freeOver < 0) fieldErrors.free_delivery_over = 'Must be 0 or more';
    if (!Number.isInteger(bufferHours) || bufferHours < 0 || bufferHours > 24) {
      fieldErrors.delivery_slot_buffer_hours = 'Whole number from 0 to 24';
    }
    // Return window — 0 disables returns; 168h (1 week) is the upper bound
    // enforced by the backend Zod schema. Anything longer than that is
    // almost certainly a typo.
    const returnWindow = Number(draft.return_window_hours);
    if (!Number.isInteger(returnWindow) || returnWindow < 0 || returnWindow > 168) {
      fieldErrors.return_window_hours = 'Whole number from 0 to 168';
    }

    // Geofence: lat/lng must be set together or both blank. A half-set
    // pair would silently disable the radius check (null lat OR null lng
    // = "not configured" on the backend), which is almost certainly a
    // mistake.
    const latStr = draft.firm_latitude.trim();
    const lngStr = draft.firm_longitude.trim();
    const lat = latStr === '' ? null : Number(latStr);
    const lng = lngStr === '' ? null : Number(lngStr);
    if ((lat === null) !== (lng === null)) {
      const empty = lat === null ? 'firm_latitude' : 'firm_longitude';
      fieldErrors[empty] = 'Set both latitude and longitude, or clear both to disable the geofence';
    } else {
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
        fieldErrors.firm_latitude = 'Latitude must be between -90 and 90';
      }
      if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
        fieldErrors.firm_longitude = 'Longitude must be between -180 and 180';
      }
    }
    const radius = Number(draft.delivery_radius_km);
    if (!Number.isFinite(radius) || radius < 0.1) {
      fieldErrors.delivery_radius_km = 'Radius must be at least 0.1 km';
    }

    // Company name is required; tagline + address are free-form (length
    // capped on the backend at 100 / 500 chars respectively).
    if (!draft.company_name.trim()) {
      fieldErrors.company_name = 'Company name is required';
    }

    // Manual price-filter cap must be a positive number. Only validated
    // when the admin is in manual mode — in auto mode the stored value is
    // a fallback the backend ignores, so leaving it stale is fine.
    const priceCap = Number(draft.max_price_filter_cap);
    if (!draft.max_price_filter_auto) {
      if (!Number.isFinite(priceCap) || priceCap < 1) {
        fieldErrors.max_price_filter_cap = 'Enter a positive amount in rupees';
      }
    }

    // Global discount % is only enforced when the toggle is on; we still
    // persist the value when off so flipping back on restores it.
    const globalDiscount = Number(draft.global_discount_percent);
    if (draft.global_discount_enabled) {
      if (!Number.isFinite(globalDiscount) || globalDiscount <= 0 || globalDiscount > 100) {
        fieldErrors.global_discount_percent = 'Enter a percentage between 1 and 100';
      }
    }

    // Badge / hero pill titles must be non-empty when the entry is enabled.
    // A disabled entry isn't shown on the storefront, so blank titles are
    // fine to save (they just stay hidden).
    draft.product_detail_badges.forEach((b, i) => {
      if (b.enabled && !b.title.trim()) {
        fieldErrors[`pdp_badge_${i}_title`] = 'Title is required when the badge is shown';
      }
      if (b.key === 'returns' && b.enabled && !(b.title_alt || '').trim()) {
        fieldErrors[`pdp_badge_${i}_title_alt`] = 'Non-returnable title is required when the badge is shown';
      }
    });
    draft.home_hero_features.forEach((f, i) => {
      // Background image is allowed to be enabled with an empty URL — the
      // storefront treats that as "no image" and falls back to the gradient.
      if (f.enabled && f.key !== 'background_image' && !f.title.trim()) {
        fieldErrors[`hero_feature_${i}_title`] = 'This field is required when the entry is shown';
      }
    });

    // Delivery slot catalog. Per-row: label is non-empty when enabled,
    // start < end, hours in 0..23 / 1..24, day_offset in 0..30. Ids must
    // be unique (admin form auto-generates them, but a user could collide
    // by hand-editing two new rows quickly).
    const seenSlotIds = new Set();
    (draft.delivery_slots || []).forEach((s, i) => {
      if (!s.id || !s.id.trim()) fieldErrors[`delivery_slot_${i}_id`] = 'Slot id is required';
      else if (seenSlotIds.has(s.id)) fieldErrors[`delivery_slot_${i}_id`] = 'Duplicate slot id';
      seenSlotIds.add(s.id);
      if (s.enabled && !String(s.label || '').trim()) {
        fieldErrors[`delivery_slot_${i}_label`] = 'Label is required when the slot is enabled';
      }
      const sh = Number(s.start_hour), eh = Number(s.end_hour);
      if (!Number.isInteger(sh) || sh < 0 || sh > 23) {
        fieldErrors[`delivery_slot_${i}_start_hour`] = 'Whole hour from 0 to 23';
      }
      if (!Number.isInteger(eh) || eh < 1 || eh > 24) {
        fieldErrors[`delivery_slot_${i}_end_hour`] = 'Whole hour from 1 to 24';
      }
      if (Number.isInteger(sh) && Number.isInteger(eh) && eh <= sh) {
        fieldErrors[`delivery_slot_${i}_end_hour`] = 'End hour must be after start hour';
      }
      const dayOff = Number(s.day_offset);
      if (!Number.isInteger(dayOff) || dayOff < 0 || dayOff > 30) {
        fieldErrors[`delivery_slot_${i}_day_offset`] = 'Whole number from 0 to 30';
      }
    });

    // Category promotion marquee: each enabled row needs an image_url
    // and a category_id; ids are unique (admin form auto-generates them
    // but a save-then-edit could theoretically duplicate one).
    const seenPromoIds = new Set();
    (draft.category_promotions || []).forEach((p, i) => {
      if (!p.id || !String(p.id).trim()) fieldErrors[`category_promo_${i}_id`] = 'Promo id is required';
      else if (seenPromoIds.has(p.id)) fieldErrors[`category_promo_${i}_id`] = 'Duplicate promo id';
      seenPromoIds.add(p.id);
      if (p.enabled && !String(p.image_url || '').trim()) {
        fieldErrors[`category_promo_${i}_image_url`] = 'Upload an image (or disable this promo)';
      }
      if (p.enabled && !String(p.category_id || '').trim()) {
        fieldErrors[`category_promo_${i}_category_id`] = 'Pick a category to link to';
      }
    });

    if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return; }

    setSubmitting(true);
    try {
      const r = await adminApi.updateSettings({
        min_order_value: value, min_order_quantity: qty,
        delivery_charge: charge, free_delivery_over: freeOver,
        delivery_slot_buffer_hours: bufferHours,
        support_phone: draft.support_phone.trim(),
        support_whatsapp: draft.support_whatsapp.trim(),
        support_email: draft.support_email.trim(),
        support_message: draft.support_message.trim(),
        theme: draft.theme,
        cancellation_cutoff_status: draft.cancellation_cutoff_status,
        return_window_hours: returnWindow,
        return_window_message: draft.return_window_message.trim(),
        firm_latitude: lat,
        firm_longitude: lng,
        delivery_radius_km: radius,
        company_name: draft.company_name.trim(),
        company_tagline: draft.company_tagline.trim(),
        company_address: draft.company_address.trim(),
        product_detail_badges: draft.product_detail_badges.map((b) => ({
          key: b.key,
          enabled: !!b.enabled,
          title: b.title.trim(),
          subtitle: (b.subtitle || '').trim(),
          ...(b.key === 'returns' ? {
            title_alt: (b.title_alt || '').trim(),
            subtitle_alt: (b.subtitle_alt || '').trim(),
          } : {}),
        })),
        home_hero_features: draft.home_hero_features.map((f) => ({
          key: f.key,
          enabled: !!f.enabled,
          title: f.title.trim(),
        })),
        delivery_slots: (draft.delivery_slots || []).map((s) => ({
          id: String(s.id).trim(),
          day_offset: Number(s.day_offset),
          start_hour: Number(s.start_hour),
          end_hour: Number(s.end_hour),
          label: String(s.label || '').trim(),
          enabled: !!s.enabled,
        })),
        category_promotions: (draft.category_promotions || []).map((p) => {
          // Coerce blank/invalid dimensions to null so the backend stores
          // "inherit default" rather than NaN. Integer rounding keeps the
          // type check happy even if a paste pulls in a decimal.
          const dim = (v) => {
            if (v === '' || v == null) return null;
            const n = Number(v);
            return Number.isFinite(n) ? Math.round(n) : null;
          };
          return {
            id: String(p.id).trim(),
            image_url: String(p.image_url || '').trim(),
            category_id: String(p.category_id || '').trim(),
            alt: String(p.alt || '').trim(),
            enabled: !!p.enabled,
            height_mobile_px: dim(p.height_mobile_px),
            height_desktop_px: dim(p.height_desktop_px),
            width_mobile_px: dim(p.width_mobile_px),
            width_desktop_px: dim(p.width_desktop_px),
          };
        }),
        max_price_filter_auto: !!draft.max_price_filter_auto,
        // Send a sane fallback when the field is blank/invalid in auto
        // mode so the backend Zod schema (min(1)) doesn't reject the
        // whole save. In manual mode validation above already gated this.
        max_price_filter_cap: Number.isFinite(priceCap) && priceCap >= 1 ? priceCap : 150,
        global_discount_enabled: !!draft.global_discount_enabled,
        global_discount_percent: Number.isFinite(globalDiscount) && globalDiscount >= 0 ? globalDiscount : 0,
        // Phase 2 i18n — flat-keyed per-language overlays. Null clears.
        translations: Object.keys(draft.translations || {}).length === 0 ? null : draft.translations,
      });
      setData(r.data);
      // Reflect the saved theme immediately on the admin's own session —
      // applyTheme() flips <html data-theme> + the .dark class so the new
      // look engages without a reload.
      setTheme(r.data.theme);
      toast.push('Settings saved');
    } catch (err) {
      if (err.details?.fieldErrors) setErrors(flatFieldErrors(err.details.fieldErrors));
      else toast.push(err.message || 'Could not save settings', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    if (!data) return;
    setDraft(draftFromData(data));
    setErrors({});
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">
          Operational thresholds for checkout. Changes apply to orders placed after save.
          {!canWrite && <span className="text-amber-700"> Read-only — only Super/Operations roles can edit.</span>}
        </p>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
          <div className="h-10 bg-slate-100 rounded w-1/2" />
        </div>
      ) : !activeSection ? (
        // Landing tile grid. Each tile maps to a SETTINGS_SECTIONS entry;
        // tapping one drills into that section's form fields. The "Unsaved
        // changes" pill pokes the admin if they walk away from a section
        // mid-edit without saving.
        <div>
          {dirty && (
            <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl text-sm">
              <span>You have unsaved changes.</span>
              {canWrite && (
                <div className="flex gap-2">
                  <button type="button" onClick={onSubmit} disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold text-xs">
                    <Save className="w-3.5 h-3.5" />
                    {submitting ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={reset} disabled={submitting}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 hover:bg-amber-100 disabled:opacity-50 font-semibold text-xs">
                    Discard
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SETTINGS_SECTIONS.map((s) => {
              const palette = TILE_PALETTES[s.color] || TILE_PALETTES.indigo;
              return (
                <button key={s.id} type="button" onClick={() => openSection(s.id)}
                  className={`relative overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 text-left group transition hover:shadow-lg hover:-translate-y-0.5 ring-1 ring-transparent ${palette.ring}`}>
                  {/* Top accent stripe — uses the section's hue so the grid
                      reads as a colourful catalog at a glance. */}
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.gradient}`} />
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg ${palette.iconBg} flex items-center justify-center transition`}>
                      <s.icon className={`w-5 h-5 ${palette.iconText}`} />
                    </div>
                    <div className="font-semibold text-slate-900">{s.title}</div>
                  </div>
                  <div className="text-xs text-slate-500 mb-3 leading-relaxed">{s.blurb}</div>
                  <div className={`inline-block text-xs font-semibold px-2 py-1 rounded-md ${palette.iconBg} ${palette.iconText} max-w-full truncate`}>
                    {s.summary(data)}
                  </div>
                </button>
              );
            })}
          </div>
          {data?.updated_at && (
            <div className="text-xs text-slate-500 mt-6">
              Last updated {new Date(data.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {data.updated_by ? ` by ${data.updated_by}` : ''}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 max-w-2xl space-y-5">
          {/* Back-to-tiles header. Title pulls from SETTINGS_SECTIONS so it
              stays in lockstep with the tile catalog. */}
          <div className="flex items-center gap-3 -mt-1 mb-1">
            <button type="button" onClick={closeSection}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition">
              <ChevronLeft className="w-4 h-4" />
              All settings
            </button>
            <span className="text-slate-300">/</span>
            <h2 className="font-bold text-slate-900">{activeMeta?.title}</h2>
          </div>

          {activeSection === 'branding' && (
          <div>
            <p className="text-xs text-slate-500 mb-4">Replaces "Redlook" / "Curated style, delivered." across the storefront, admin shell, and printed invoices.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Company name</label>
                <input type="text" maxLength={100} value={draft.company_name}
                  onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="Redlook"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                    errors.company_name ? 'border-red-300' : 'border-slate-200'
                  }`} />
                {errors.company_name && <div className="text-xs text-red-600 mt-1">{errors.company_name}</div>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tagline</label>
                <p className="text-xs text-slate-500 mb-2">Shown under the company name in the navbar and admin sidebar. Leave blank to hide.</p>
                <input type="text" maxLength={100} value={draft.company_tagline}
                  onChange={(e) => setDraft((d) => ({ ...d, company_tagline: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="Curated style, delivered."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Company address</label>
                <p className="text-xs text-slate-500 mb-2">Free-form, multi-line. Printed on tax invoices as the seller block; one line per text line.</p>
                <textarea rows={3} maxLength={500} value={draft.company_address}
                  onChange={(e) => setDraft((d) => ({ ...d, company_address: e.target.value }))}
                  disabled={!canWrite}
                  placeholder={'Plot 14, Sector 62\nNoida, Uttar Pradesh - 201309'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>
            </div>
          </div>
          )}

          {activeSection === 'orders' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum order value (₹)</label>
              <p className="text-xs text-slate-500 mb-2">The smallest order subtotal a customer can checkout. Used by cart and checkout to gate the place-order button.</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                <input type="number" min="0" step="0.01" value={draft.min_order_value}
                  onChange={(e) => setDraft((d) => ({ ...d, min_order_value: e.target.value }))}
                  disabled={!canWrite}
                  className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                    errors.min_order_value ? 'border-red-300' : 'border-slate-200'
                  }`} />
              </div>
              {errors.min_order_value && <div className="text-xs text-red-600 mt-1">{errors.min_order_value}</div>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum order quantity</label>
              <p className="text-xs text-slate-500 mb-2">The smallest total item count an order can contain. Set to 1 to effectively disable this gate.</p>
              <input type="number" min="1" step="1" value={draft.min_order_quantity}
                onChange={(e) => setDraft((d) => ({ ...d, min_order_quantity: e.target.value }))}
                disabled={!canWrite}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                  errors.min_order_quantity ? 'border-red-300' : 'border-slate-200'
                }`} />
              {errors.min_order_quantity && <div className="text-xs text-red-600 mt-1">{errors.min_order_quantity}</div>}
            </div>
          </div>
          )}

          {activeSection === 'delivery' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Delivery charge (₹)</label>
            <p className="text-xs text-slate-500 mb-2">Flat fee added at checkout when the cart subtotal is at or below the free-delivery threshold. Set to 0 to never charge for delivery.</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <input type="number" min="0" step="0.01" value={draft.delivery_charge}
                onChange={(e) => setDraft((d) => ({ ...d, delivery_charge: e.target.value }))}
                disabled={!canWrite}
                className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                  errors.delivery_charge ? 'border-red-300' : 'border-slate-200'
                }`} />
            </div>
            {errors.delivery_charge && <div className="text-xs text-red-600 mt-1">{errors.delivery_charge}</div>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Free delivery over (₹)</label>
            <p className="text-xs text-slate-500 mb-2">Cart subtotal that earns free delivery. Cart shows an "Add ₹X more for free delivery" hint until reached. Set very high to disable free delivery entirely.</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <input type="number" min="0" step="0.01" value={draft.free_delivery_over}
                onChange={(e) => setDraft((d) => ({ ...d, free_delivery_over: e.target.value }))}
                disabled={!canWrite}
                className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                  errors.free_delivery_over ? 'border-red-300' : 'border-slate-200'
                }`} />
            </div>
            {errors.free_delivery_over && <div className="text-xs text-red-600 mt-1">{errors.free_delivery_over}</div>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Delivery slot buffer (hours)</label>
            <p className="text-xs text-slate-500 mb-2">How many hours before a slot starts the cutoff falls. Default 5 — a customer can book the 4 PM – 7 PM slot only until 11 AM. Lower values give later cutoffs at the cost of less prep time.</p>
            <div className="relative">
              <input type="number" min="0" max="24" step="1" value={draft.delivery_slot_buffer_hours}
                onChange={(e) => setDraft((d) => ({ ...d, delivery_slot_buffer_hours: e.target.value }))}
                disabled={!canWrite}
                className={`w-full pr-12 pl-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                  errors.delivery_slot_buffer_hours ? 'border-red-300' : 'border-slate-200'
                }`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">hrs</span>
            </div>
            {errors.delivery_slot_buffer_hours && <div className="text-xs text-red-600 mt-1">{errors.delivery_slot_buffer_hours}</div>}
          </div>

          <DeliverySlotsEditor draft={draft} setDraft={setDraft} errors={errors} canWrite={canWrite} />
          </div>
          )}

          {activeSection === 'area' && (
          <div>
            <p className="text-xs text-slate-500 mb-4">
              Customers can only place orders to addresses within the delivery radius (km) of the firm/company location.
              Leave latitude and longitude blank to disable the radius check entirely.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Firm latitude</label>
                <input type="number" step="0.0000001" min="-90" max="90"
                  value={draft.firm_latitude}
                  onChange={(e) => setDraft((d) => ({ ...d, firm_latitude: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="e.g. 28.6139"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                    errors.firm_latitude ? 'border-red-300' : 'border-slate-200'
                  }`} />
                {errors.firm_latitude && <div className="text-xs text-red-600 mt-1">{errors.firm_latitude}</div>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Firm longitude</label>
                <input type="number" step="0.0000001" min="-180" max="180"
                  value={draft.firm_longitude}
                  onChange={(e) => setDraft((d) => ({ ...d, firm_longitude: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="e.g. 77.2090"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                    errors.firm_longitude ? 'border-red-300' : 'border-slate-200'
                  }`} />
                {errors.firm_longitude && <div className="text-xs text-red-600 mt-1">{errors.firm_longitude}</div>}
              </div>
            </div>

            {canWrite && 'geolocation' in navigator && (
              <button type="button"
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setDraft((d) => ({
                      ...d,
                      firm_latitude: pos.coords.latitude.toFixed(7),
                      firm_longitude: pos.coords.longitude.toFixed(7),
                    })),
                    (err) => toast.push(err.message || 'Could not read location', 'error'),
                    { enableHighAccuracy: true, timeout: 10000 },
                  );
                }}
                className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                Use my current location
              </button>
            )}

            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Delivery radius (km)</label>
              <p className="text-xs text-slate-500 mb-2">Maximum distance from the firm location at which the app accepts orders. Default is 9 km — set any value the business needs.</p>
              <div className="relative max-w-xs">
                <input type="number" min="0.1" step="0.1"
                  value={draft.delivery_radius_km}
                  onChange={(e) => setDraft((d) => ({ ...d, delivery_radius_km: e.target.value }))}
                  disabled={!canWrite}
                  className={`w-full pr-12 pl-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                    errors.delivery_radius_km ? 'border-red-300' : 'border-slate-200'
                  }`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">km</span>
              </div>
              {errors.delivery_radius_km && <div className="text-xs text-red-600 mt-1">{errors.delivery_radius_km}</div>}
            </div>
          </div>
          )}

          {activeSection === 'support' && (
          <div>
            <p className="text-xs text-slate-500 mb-4">Surfaced on the storefront's floating Help button and in the footer. Leave any field blank to hide that channel from customers.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Support phone (Call)</label>
                <input type="tel" value={draft.support_phone} maxLength={20}
                  onChange={(e) => setDraft((d) => ({ ...d, support_phone: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="+91 80000 00000"
                  className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">WhatsApp number (Chat)</label>
                <input type="tel" value={draft.support_whatsapp} maxLength={20}
                  onChange={(e) => setDraft((d) => ({ ...d, support_whatsapp: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="+91 80000 00000"
                  className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
                <p className="text-[11px] text-slate-500 mt-1">Used to build a wa.me link. Include country code; spaces and dashes are fine.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Support email</label>
                <input type="email" value={draft.support_email} maxLength={150}
                  onChange={(e) => setDraft((d) => ({ ...d, support_email: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="support@redlook.example"
                  className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Message shown to customers</label>
                <p className="text-xs text-slate-500 mb-2">A short note in the help popover — mention hours, response times, or anything you want customers to see before they reach out.</p>
                <textarea value={draft.support_message} maxLength={500} rows={3}
                  onChange={(e) => setDraft((d) => ({ ...d, support_message: e.target.value }))}
                  disabled={!canWrite}
                  placeholder="Our team is online from 7 AM to 9 PM, every day."
                  className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
                <div className="text-[11px] text-slate-400 mt-1 text-right">{draft.support_message.length} / 500</div>
              </div>
            </div>
          </div>
          )}

          {activeSection === 'policy' && (
          <div className="space-y-6">
            <div>
              {/* Cancellation cutoff — first lifecycle status at which cancel
                  becomes blocked. Customer-facing UI hides the Cancel CTA past
                  this point and shows the policy text instead. Admins also can't
                  cancel orders past this status (kept consistent on purpose). */}
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cancellation cutoff</label>
              <p className="text-xs text-slate-500 mb-2">
                The first status at which an order can no longer be cancelled. Default
                "Out for Delivery" means a customer can cancel right up to (but not
                including) the moment their order leaves the warehouse.
              </p>
              <SelectInput value={draft.cancellation_cutoff_status} disabled={!canWrite}
                onChange={(e) => setDraft((d) => ({ ...d, cancellation_cutoff_status: e.target.value }))}>
                {CANCEL_CUTOFF_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} — {o.hint}
                  </option>
                ))}
              </SelectInput>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Applies to both customer-driven cancellations and admin-driven status transitions.
              </p>
            </div>

            <div>
              {/* Return window — hours after delivery during which a return
                  request is still accepted. 0 disables returns entirely; the
                  customer-facing "Request return" CTA hides itself once the
                  elapsed time exceeds this value. */}
              <label className="block text-sm font-semibold text-slate-700 mb-1">Return window (hours after delivery)</label>
              <p className="text-xs text-slate-500 mb-2">
                How long after the delivery timestamp a customer can still file a return.
                Default 24 hours. Set to 0 to disable returns entirely.
              </p>
              <input type="number" min={0} max={168} step={1}
                value={draft.return_window_hours} disabled={!canWrite}
                onChange={(e) => setDraft((d) => ({ ...d, return_window_hours: e.target.value }))}
                className={`w-32 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                  errors.return_window_hours ? 'border-rose-400' : 'border-slate-200'
                }`} />
              {errors.return_window_hours && (
                <p className="text-[11px] text-rose-600 mt-1">{errors.return_window_hours}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1.5">
                Whole number from 0 to 168 (one week). The backend enforces this on the
                Request Return endpoint; the storefront hides the CTA past the window.
              </p>

              {/* Customer-facing policy copy. Shown verbatim on the order
                  tracking page beneath the Request Return button. Leaving
                  it blank hides the policy line entirely. */}
              <label className="block text-sm font-semibold text-slate-700 mb-1 mt-5">Return policy message (shown to customers)</label>
              <p className="text-xs text-slate-500 mb-2">
                Free-form copy displayed under the Request Return button on the order tracking page.
                Leave blank to hide the policy line.
              </p>
              <textarea value={draft.return_window_message} maxLength={500} rows={3}
                onChange={(e) => setDraft((d) => ({ ...d, return_window_message: e.target.value }))}
                disabled={!canWrite}
                placeholder="Returns accepted within 24 hours of delivery for damaged or unsatisfactory items."
                className="w-full px-3 py-2 border rounded-lg border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500" />
              <div className="text-[11px] text-slate-400 mt-1 text-right">{draft.return_window_message.length} / 500</div>
            </div>
          </div>
          )}

          {activeSection === 'appearance' && (
          <div>
            {/* Theme picker — site-wide branding. Active theme applies to both
                the customer storefront and admin portal on next page load (and
                instantly on the admin's own session via setTheme below). */}
            <p className="text-xs text-slate-500 mb-4">Applies site-wide to the storefront and admin portal. Customers see the new theme on their next page load.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {THEMES.map((t) => {
                const active = draft.theme === t.id;
                return (
                  <button key={t.id} type="button"
                    onClick={() => canWrite && setDraft((d) => ({ ...d, theme: t.id }))}
                    disabled={!canWrite}
                    className={`text-left rounded-xl border-2 p-3 transition disabled:cursor-not-allowed ${
                      active
                        ? 'border-slate-900 ring-2 ring-slate-200 bg-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}>
                    <div className="h-10 rounded-lg mb-2 shadow-inner" style={{ background: t.preview }} />
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      {t.label}
                      {active && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{t.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {activeSection === 'product_details' && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-slate-500 mb-3">
                The four-badge row below the buy buttons. Type the title and subtitle exactly as you want them to appear on the storefront. The <span className="font-semibold">Next slot</span> badge's subtitle is filled in automatically with the live next-available delivery slot — you only edit its title.
              </p>
              <div className="space-y-3">
                {draft.product_detail_badges.map((b, i) => {
                  const meta = PDP_BADGE_META[b.key];
                  const Icon = meta?.icon;
                  const updateBadge = (patch) => setDraft((d) => ({
                    ...d,
                    product_detail_badges: d.product_detail_badges.map((x, idx) => idx === i ? { ...x, ...patch } : x),
                  }));
                  return (
                    <div key={b.key} className={`rounded-xl border p-3 ${b.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {Icon && <Icon className="w-4 h-4 text-emerald-600" />}
                          <span className="text-sm font-semibold text-slate-900">{meta?.label || b.key}</span>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={b.enabled} disabled={!canWrite}
                            onChange={(e) => updateBadge({ enabled: e.target.checked })}
                            className="w-4 h-4" />
                          Show on product page
                        </label>
                      </div>
                      <div className={`grid ${b.key === 'returns' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-3`}>
                        <div>
                          <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                            {b.key === 'returns' ? 'Returnable title' : 'Title'}
                          </label>
                          <input type="text" maxLength={50} value={b.title}
                            onChange={(e) => updateBadge({ title: e.target.value })}
                            disabled={!canWrite || !b.enabled}
                            className={`w-full px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500 ${
                              errors[`pdp_badge_${i}_title`] ? 'border-red-300' : 'border-slate-200'
                            }`} />
                          {errors[`pdp_badge_${i}_title`] && <div className="text-xs text-red-600 mt-1">{errors[`pdp_badge_${i}_title`]}</div>}
                        </div>
                        <div>
                          <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                            {b.key === 'returns' ? 'Returnable subtitle' : 'Subtitle'}
                          </label>
                          <input type="text" maxLength={100}
                            value={b.key === 'slot' ? 'Auto-filled with next delivery slot' : (b.subtitle || '')}
                            onChange={(e) => updateBadge({ subtitle: e.target.value })}
                            disabled={!canWrite || !b.enabled || b.key === 'slot'}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500 disabled:italic" />
                        </div>
                        {b.key === 'returns' && (
                          <>
                            <div>
                              <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Non-returnable title</label>
                              <input type="text" maxLength={50} value={b.title_alt || ''}
                                onChange={(e) => updateBadge({ title_alt: e.target.value })}
                                disabled={!canWrite || !b.enabled}
                                className={`w-full px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500 ${
                                  errors[`pdp_badge_${i}_title_alt`] ? 'border-red-300' : 'border-slate-200'
                                }`} />
                              {errors[`pdp_badge_${i}_title_alt`] && <div className="text-xs text-red-600 mt-1">{errors[`pdp_badge_${i}_title_alt`]}</div>}
                            </div>
                            <div>
                              <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Non-returnable subtitle</label>
                              <input type="text" maxLength={100} value={b.subtitle_alt || ''}
                                onChange={(e) => updateBadge({ subtitle_alt: e.target.value })}
                                disabled={!canWrite || !b.enabled}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500" />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {activeSection === 'hero_features' && (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-slate-500 mb-3">
                All copy on the home page hero — announcement pill, headline, subheadline, optional background image, and the three trust pills under the buttons — managed in one place. The list below is in the same top-to-bottom order it renders on the storefront.
              </p>
              <div className="space-y-3">
                {draft.home_hero_features.map((f, i) => {
                  const meta = HERO_FEATURE_META[f.key];
                  const Icon = meta?.icon;
                  const isMultiline = f.key === 'subheadline';
                  // The background-image entry's `title` holds a URL, not a
                  // visible label — its toggle drives whether the image is
                  // used at all, not whether the field is "shown". Empty
                  // URL with toggle on still falls back to the gradient.
                  const allowEmpty = f.key === 'background_image';
                  const inputLabel = f.key === 'background_image' ? 'Image URL'
                    : f.key === 'subheadline' ? 'Paragraph text'
                    : f.key === 'announcement' ? 'Announcement text'
                    : (f.key === 'headline_top' || f.key === 'headline_bottom') ? 'Heading text'
                    : 'Label';
                  const toggleLabel = f.key === 'background_image' ? 'Use background image' : 'Show on home page';
                  const updateFeature = (patch) => setDraft((d) => ({
                    ...d,
                    home_hero_features: d.home_hero_features.map((x, idx) => idx === i ? { ...x, ...patch } : x),
                  }));
                  return (
                    <div key={f.key} className={`rounded-xl border p-3 ${f.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between mb-2 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {Icon && <Icon className="w-4 h-4 text-emerald-600 shrink-0" />}
                          <span className="text-sm font-semibold text-slate-900 truncate">{meta?.label || f.key}</span>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={f.enabled} disabled={!canWrite}
                            onChange={(e) => updateFeature({ enabled: e.target.checked })}
                            className="w-4 h-4" />
                          {toggleLabel}
                        </label>
                      </div>
                      {meta?.hint && (
                        <p className="text-[11px] text-slate-500 mb-2">{meta.hint}</p>
                      )}
                      <div>
                        <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">{inputLabel}</label>
                        {isMultiline ? (
                          <textarea rows={3} maxLength={500} value={f.title}
                            onChange={(e) => updateFeature({ title: e.target.value })}
                            disabled={!canWrite || !f.enabled}
                            className={`w-full px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500 ${
                              errors[`hero_feature_${i}_title`] ? 'border-red-300' : 'border-slate-200'
                            }`} />
                        ) : (
                          <input type="text" maxLength={500} value={f.title}
                            onChange={(e) => updateFeature({ title: e.target.value })}
                            disabled={!canWrite || !f.enabled}
                            placeholder={allowEmpty ? 'https://… or /uploads/hero/…' : undefined}
                            className={`w-full px-2 py-1.5 border rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500 ${
                              errors[`hero_feature_${i}_title`] ? 'border-red-300' : 'border-slate-200'
                            }`} />
                        )}
                        {errors[`hero_feature_${i}_title`] && <div className="text-xs text-red-600 mt-1">{errors[`hero_feature_${i}_title`]}</div>}
                      </div>

                      {/* Background image only: a file picker that uploads
                          to /uploads/hero and writes the returned URL into
                          this entry's title. Either path — URL paste or
                          file upload — ends up writing the same string. */}
                      {f.key === 'background_image' && (
                        <div className="mt-3 flex items-start gap-3">
                          <div className="flex-1">
                            <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                              Or upload from your computer
                            </label>
                            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold ${
                              !canWrite || heroUploading ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-slate-50'
                            }`}>
                              <ImagePlus className="w-3.5 h-3.5" />
                              {heroUploading ? 'Uploading…' : (f.title ? 'Replace image' : 'Upload image')}
                              <input type="file" accept="image/*" className="hidden"
                                disabled={!canWrite || heroUploading}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  // Reset the input so picking the same file
                                  // twice in a row still triggers change.
                                  e.target.value = '';
                                  if (!file) return;
                                  setHeroUploading(true);
                                  try {
                                    const r = await adminApi.uploadHeroImage(file);
                                    // Auto-enable the toggle on first upload —
                                    // an admin who picks a file clearly wants
                                    // to use it.
                                    updateFeature({ title: r.data.url, enabled: true });
                                    toast.push('Background image uploaded');
                                  } catch (err) {
                                    toast.push(err.message || 'Upload failed', 'error');
                                  } finally {
                                    setHeroUploading(false);
                                  }
                                }} />
                            </label>
                            <p className="text-[11px] text-slate-500 mt-1.5">JPEG / PNG / WEBP / GIF. Max 8 MB.</p>
                          </div>
                          {f.title && (
                            <div className="shrink-0">
                              <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Preview</label>
                              <div className="w-24 h-16 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                                <img src={resolveImageUrl(f.title) || f.title} alt="Hero preview" className="w-full h-full object-cover" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {activeSection === 'price_filter' && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500">
              Controls the upper bound of the "Max price" slider customers see on the shop page. In auto mode the cap follows the most expensive Active product in your catalog, so the slider always covers everything for sale. Switch to manual to clamp it lower (useful for a promo run or to hide an outlier SKU from the slider).
            </p>

            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="max_price_filter_auto" checked={!!draft.max_price_filter_auto}
                  onChange={() => setDraft((d) => ({ ...d, max_price_filter_auto: true }))}
                  disabled={!canWrite}
                  className="mt-1 w-4 h-4" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Auto · track catalog maximum</div>
                  <div className="text-xs text-slate-500">Slider cap = highest price among Active products. Recommended — needs no upkeep as you add or reprice items.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="max_price_filter_auto" checked={!draft.max_price_filter_auto}
                  onChange={() => setDraft((d) => ({ ...d, max_price_filter_auto: false }))}
                  disabled={!canWrite}
                  className="mt-1 w-4 h-4" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">Manual · fixed cap (₹)</div>
                  <div className="text-xs text-slate-500 mb-2">Use a fixed upper bound. Products priced above this still appear on the page; they just sit outside the slider's reach until a customer drags it all the way up.</div>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                    <input type="number" min="1" step="1" value={draft.max_price_filter_cap}
                      onChange={(e) => setDraft((d) => ({ ...d, max_price_filter_cap: e.target.value }))}
                      disabled={!canWrite || draft.max_price_filter_auto}
                      className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                        errors.max_price_filter_cap ? 'border-red-300' : 'border-slate-200'
                      }`} />
                  </div>
                  {errors.max_price_filter_cap && <div className="text-xs text-red-600 mt-1">{errors.max_price_filter_cap}</div>}
                </div>
              </label>
            </div>
          </div>
          )}

          {activeSection === 'discounts' && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500">
              Markdown applied to every Active product in the catalog. Per-product discounts (Products page) and per-category discounts (Categories page) are configured separately — when a product has more than one, the customer pays the lowest of the three.
            </p>

            <div className="rounded-xl border border-slate-200 p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={!!draft.global_discount_enabled}
                  onChange={(e) => setDraft((d) => ({ ...d, global_discount_enabled: e.target.checked }))}
                  disabled={!canWrite}
                  className="mt-1 w-4 h-4" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">Site-wide discount</div>
                  <div className="text-xs text-slate-500 mb-2">Apply a flat percentage off every product. Useful for festival sales or clearance — toggle off to revert with one click (the percent below is kept).</div>
                  <div className="relative max-w-xs">
                    <input type="number" min="0" max="100" step="1" value={draft.global_discount_percent}
                      onChange={(e) => setDraft((d) => ({ ...d, global_discount_percent: e.target.value }))}
                      disabled={!canWrite || !draft.global_discount_enabled}
                      className={`w-full pl-3 pr-8 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                        errors.global_discount_percent ? 'border-red-300' : 'border-slate-200'
                      }`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {errors.global_discount_percent && <div className="text-xs text-red-600 mt-1">{errors.global_discount_percent}</div>}
                </div>
              </label>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2.5 rounded-lg text-xs leading-relaxed">
              <strong>How tiered discounts combine:</strong> for each product the storefront takes the largest of the three percentages — product, category, and this site-wide setting. So a 30% category sale on top of a 10% site-wide sale shows as 30% off (not 40% off, and not 37% off compounded). This prevents accidental giveaways when promotions overlap.
            </div>
          </div>
          )}

          {activeSection === 'category_promotions' && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500">
              Upload sale-banner images and link each one to a category. The marquee scrolls across the top of the home page; tapping an image opens that category's product listing. Reorder with the ▲ ▼ controls — the on-screen order matches the list below.
            </p>
            <CategoryPromotionsEditor draft={draft} setDraft={setDraft} errors={errors} canWrite={canWrite} />
          </div>
          )}

          {activeSection === 'translations' && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500">
              Hindi (हिन्दी) + Bengali (বাংলা) translations for every customer-facing copy field across Settings. Leave a field empty to fall back to the English value automatically — no broken UI. Storefront picks the active customer's language via the Accept-Language header.
            </p>
            <SettingsTranslationsPanel draft={draft} setDraft={setDraft} canWrite={canWrite} />
          </div>
          )}

          {data?.updated_at && activeSection && (
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              Last updated {new Date(data.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {data.updated_by ? ` by ${data.updated_by}` : ''}
            </div>
          )}

          {canWrite && (
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={!dirty || submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold text-sm">
                <Save className="w-4 h-4" />
                {submitting ? 'Saving…' : 'Save settings'}
              </button>
              <button type="button" onClick={reset} disabled={!dirty || submitting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm">
                Reset
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
