import { useState, useRef, useEffect } from 'react';
import {
  ShoppingCart, Search, Leaf, Plus, Star, Heart, User, Menu, X,
  Package, MapPin, LogOut, ChevronDown, Headphones, Phone, Mail, MessageCircle,
  Globe, Sparkles, Share2, Send, Link as LinkIcon, Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCart, useAuth, useWishlist, useToast, useSettings } from './contexts';
import { resolveImageUrl } from './api';
import { routeToPath } from './router';
import { SUPPORTED_LANGUAGES } from './i18n';
import { formatCurrency } from './lib/format';

// Renders a product image. The Product.image column is a string that can be
// either a legacy emoji (e.g. "🥬") or a path/URL from a real image upload
// ("/uploads/products/<uuid>.jpg"). resolveImageUrl returns a usable URL for
// the URL form and null for emojis — we branch on that:
//   - URL  → <img> filling the parent (parent should be a sized container)
//   - else → render the value as-is so the parent's text-* size + bg gradient
//     show through (the existing emoji styling stays intact)
//
// `size` is appended to the className when rendering the <img> so cards can
// cap the image height; it's ignored for emojis since text-Nxl on the parent
// already controls glyph size.
export function ProductImage({ src, alt, className = 'w-full h-full object-cover' }) {
  const url = resolveImageUrl(src);
  if (url) return <img src={url} alt={alt || ''} className={className} loading="lazy" />;
  return <>{src}</>;
}

// ============================================================
// LANGUAGE SWITCHER — compact dropdown in the navbar.
// Persists via i18next's LanguageDetector (localStorage key redlook.lang),
// also fires PUT /users/:id when the customer is logged in so the choice
// syncs across devices.
// ============================================================
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const { isAuthenticated, syncLanguage } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)
    || SUPPORTED_LANGUAGES[0];

  const choose = async (code) => {
    setOpen(false);
    if (code === i18n.language) return;
    await i18n.changeLanguage(code);
    // Fire-and-forget sync to the server for logged-in users so their
    // choice follows them across devices.
    if (isAuthenticated && syncLanguage) syncLanguage(code);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('nav.switchLanguage')}
        className="flex items-center gap-1 px-2 py-2 rounded-lg theme-hover text-stone-700">
        <Globe className="w-4 h-4" />
        <span className="text-xs font-semibold hidden sm:inline">{current.native}</span>
        <ChevronDown className="w-3 h-3 text-stone-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-sm z-50">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button key={lang.code} onClick={() => choose(lang.code)}
              className={`w-full text-left px-4 py-2 flex items-center justify-between gap-2 hover:bg-stone-50 dark:hover:bg-slate-700 ${
                lang.code === i18n.language ? 'text-emerald-700 font-semibold' : 'text-stone-700'
              }`}>
              <span>{lang.native}</span>
              <span className="text-[10px] text-stone-400 uppercase">{lang.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// NAVBAR — responsive, auth-aware
// ============================================================
export function Navbar({ currentPage, onNavigate }) {
  const { t } = useTranslation();
  const { itemCount } = useCart();
  const { isAuthenticated, user, logout } = useAuth();
  const settings = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // Global search: a slide-down bar beneath the navbar, reachable from every
  // page. Submitting routes to the shop pre-filtered via ?q=.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const accountRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const mobileMenuToggleRef = useRef(null);
  const searchRef = useRef(null);
  const searchToggleRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
      // Mobile menu uses two refs (panel + hamburger) so clicking the
      // hamburger to toggle doesn't get treated as an outside click.
      if (
        menuOpen &&
        !mobileMenuRef.current?.contains(e.target) &&
        !mobileMenuToggleRef.current?.contains(e.target)
      ) {
        setMenuOpen(false);
      }
      // Same two-ref guard for the search bar so clicking the search icon to
      // close it isn't double-counted as an outside click.
      if (
        searchOpen &&
        !searchRef.current?.contains(e.target) &&
        !searchToggleRef.current?.contains(e.target)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen, searchOpen]);

  // Focus the field as soon as the bar opens so the user can type immediately.
  useEffect(() => { if (searchOpen) searchInputRef.current?.focus(); }, [searchOpen]);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = searchTerm.trim();
    setSearchOpen(false);
    onNavigate('products', q ? { q } : null);
  };

  const navLinks = [
    { id: 'home', label: t('nav.home') },
    { id: 'products', label: t('nav.shop') },
  ];

  return (
    <header className="luxury-navbar sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand mark — sparkling gold-on-maroon medallion with the
            company_name (from admin Settings) in luxury serif, plus
            a gold italic tagline. Three twinkling sparkle stars hover
            around the medallion on slightly staggered timings. */}
        <button onClick={() => onNavigate('home')} className="luxury-brand-wrap flex items-center gap-3 group min-w-0">
          <div className="relative shrink-0">
            <div className="luxury-brand-mark w-11 h-11 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-100" />
            </div>
            <Sparkles aria-hidden="true" className="sparkle-star sparkle-1" />
            <Sparkles aria-hidden="true" className="sparkle-star sparkle-2" />
            <Sparkles aria-hidden="true" className="sparkle-star sparkle-3" />
          </div>
          {/* Brand text. min-w-0 + truncate keeps a long custom
              company_name from pushing icons off-screen on phones. */}
          <div className="block text-left min-w-0">
            <div className="font-luxury text-lg sm:text-2xl leading-none truncate" style={{ color: '#4a0f1a' }}>
              {settings?.company_name || 'Redlook'}
            </div>
            {settings?.company_tagline && (
              <div className="luxury-brand-tagline text-[10px] mt-1 truncate">{settings.company_tagline}</div>
            )}
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <button key={link.id} onClick={() => onNavigate(link.id)}
              className={`luxury-nav-tab ${currentPage === link.id ? 'is-active' : ''}`}>
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button ref={searchToggleRef} onClick={() => setSearchOpen(o => !o)}
            className="luxury-icon-btn p-2" aria-label={t('common.search')} aria-expanded={searchOpen}>
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
          <LanguageSwitcher />
          {isAuthenticated && (
            <button onClick={() => onNavigate('wishlist')} className="luxury-icon-btn hidden sm:block p-2" aria-label={t('nav.wishlist')}>
              <Heart className="w-5 h-5" />
            </button>
          )}
          <button onClick={() => onNavigate('cart')} className="luxury-icon-btn relative p-2" aria-label={t('nav.cart')}>
            <ShoppingCart className="w-5 h-5" />
            {itemCount > 0 && (
              <span className="luxury-cart-badge absolute -top-1 -right-1 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>

          {isAuthenticated ? (
            <div ref={accountRef} className="relative">
              <button onClick={() => setAccountOpen(o => !o)}
                className="luxury-icon-btn flex items-center gap-2 pl-3 pr-2 py-1.5">
                <div className="luxury-avatar w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold">
                  {user.full_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <ChevronDown className="w-3 h-3" style={{ color: '#a47820' }} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl shadow-xl py-2 text-sm">
                  <div className="px-4 py-2 border-b border-stone-100">
                    <div className="font-semibold text-stone-900 truncate">{user.full_name}</div>
                    <div className="text-xs text-stone-500 truncate">{user.email}</div>
                  </div>
                  {[
                    { id: 'profile', label: t('profile.title'), icon: User },
                    { id: 'addresses', label: t('addresses.title'), icon: MapPin },
                    { id: 'orders', label: t('orders.title'), icon: Package },
                    { id: 'wishlist', label: t('wishlist.title'), icon: Heart },
                  ].map(item => (
                    <button key={item.id}
                      onClick={() => { setAccountOpen(false); onNavigate(item.id); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-stone-700 theme-hover">
                      <item.icon className="w-4 h-4" /> {item.label}
                    </button>
                  ))}
                  <div className="border-t border-stone-100 mt-1 pt-1">
                    <button
                      onClick={async () => { setAccountOpen(false); await logout(); onNavigate('home'); }}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-red-50 transition text-red-600">
                      <LogOut className="w-4 h-4" /> {t('auth.signOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-3 ml-3">
              <button onClick={() => onNavigate('login')}
                className="luxury-link-login px-2 py-1.5 text-sm font-medium tracking-wide">
                {t('nav.login')}
              </button>
              <button onClick={() => onNavigate('register')}
                className="luxury-cta px-5 py-2 text-sm font-semibold rounded-full tracking-wide">
                {t('nav.register')}
              </button>
            </div>
          )}

          <button ref={mobileMenuToggleRef} onClick={() => setMenuOpen(o => !o)} className="luxury-icon-btn md:hidden p-2" aria-label={t('nav.menu')}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div ref={searchRef} className="border-t border-stone-200/70 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <form onSubmit={submitSearch} className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }}
                placeholder={t('products.searchPlaceholder')}
                aria-label={t('common.search')}
                className="w-full pl-10 pr-4 py-2.5 border border-stone-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <button type="submit" className="luxury-cta px-5 py-2.5 text-sm font-semibold rounded-xl tracking-wide shrink-0">
              {t('common.search')}
            </button>
          </form>
        </div>
      )}

      {menuOpen && (
        <div ref={mobileMenuRef} className="luxury-mobile-menu md:hidden">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navLinks.map(link => (
              <button key={link.id} onClick={() => { setMenuOpen(false); onNavigate(link.id); }}
                className={`luxury-nav-tab text-left !rounded-lg ${currentPage === link.id ? 'is-active' : ''}`}>
                {link.label}
              </button>
            ))}
            {!isAuthenticated && (
              <>
                <button onClick={() => { setMenuOpen(false); onNavigate('login'); }}
                  className="luxury-nav-tab text-left !rounded-lg">{t('nav.login')}</button>
                <button onClick={() => { setMenuOpen(false); onNavigate('register'); }}
                  className="luxury-cta text-left px-4 py-2 rounded-full font-semibold mt-1">{t('nav.register')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

// ============================================================
// FOOTER
// ============================================================
export function Footer({ onNavigate }) {
  const { t } = useTranslation();
  // Support contacts come from the SettingsContext (admin-editable). Each
  // channel that's actually configured renders as a clickable link; channels
  // the admin left blank are simply omitted.
  const settings = useSettings();
  const phone = settings?.support_phone;
  const whatsapp = settings?.support_whatsapp;
  const email = settings?.support_email;
  // wa.me wants a digits-only number with country code.
  const waDigits = whatsapp ? whatsapp.replace(/\D+/g, '') : '';

  return (
    <footer className="bg-stone-900 text-stone-300 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-white text-lg">{settings?.company_name || 'Redlook'}</span>
          </div>
          <p className="text-sm text-stone-400 leading-relaxed">{t('footer.tagline')}</p>
          {settings?.company_address && (
            <p className="mt-3 text-xs text-stone-500 whitespace-pre-line leading-relaxed">{settings.company_address}</p>
          )}
        </div>
        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">{t('nav.shop')}</h4>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => onNavigate('products')} className="hover:text-white">{t('products.allVegetables')}</button></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">{t('footer.support')}</h4>
          <ul className="space-y-2 text-sm">
            {phone && (
              <li>
                <a href={`tel:${phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-white">
                  <Phone className="w-3.5 h-3.5" /> {phone}
                </a>
              </li>
            )}
            {waDigits && (
              <li>
                <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-white">
                  <MessageCircle className="w-3.5 h-3.5" /> {t('support.whatsappUs')}
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 hover:text-white">
                  <Mail className="w-3.5 h-3.5" /> {email}
                </a>
              </li>
            )}
            <li><button onClick={() => onNavigate('orders')} className="hover:text-white">{t('orders.trackOrder')}</button></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-3 text-sm">{t('footer.company')}</h4>
          <ul className="space-y-2 text-sm">
            <li>{t('footer.about')}</li><li>{t('footer.careers')}</li><li>{t('footer.privacy')}</li><li>{t('footer.terms')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-stone-800 py-4 text-center text-xs text-stone-500">
        {t('footer.rights', { year: new Date().getFullYear(), name: settings?.company_name || 'Redlook' })}
      </div>
    </footer>
  );
}

// ============================================================
// SUPPORT WIDGET — floating Help button visible on every customer page.
// Pulls phone / WhatsApp / email + message from admin settings; channels
// the admin hasn't configured are omitted. If nothing's configured at all,
// the widget hides itself.
// ============================================================
export function SupportWidget() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const toggleRef = useRef(null);

  // Close on outside click. Two refs so clicks on the toggle button itself
  // don't fire "outside" (the button's own onClick handles open/close).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (toggleRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const phone = settings?.support_phone;
  const whatsapp = settings?.support_whatsapp;
  const email = settings?.support_email;
  const message = settings?.support_message;
  const waDigits = whatsapp ? whatsapp.replace(/\D+/g, '') : '';
  const hasAny = !!(phone || waDigits || email);

  if (!hasAny) return null;

  return (
    <>
      {open && (
        <div ref={panelRef} className="fixed bottom-24 right-4 sm:right-6 z-40 w-[19rem] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="w-5 h-5" />
              <h3 className="font-bold text-sm">{t('support.needHelp')}</h3>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t('common.close')}
              className="p-1 hover:bg-emerald-700 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          {message && (
            <p className="px-5 pt-4 text-xs text-stone-600 leading-relaxed">{message}</p>
          )}
          <div className="p-3 space-y-2">
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, '')}`} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 transition">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-900">{t('support.callUs')}</div>
                  <div className="text-xs text-stone-600 truncate">{phone}</div>
                </div>
              </a>
            )}
            {waDigits && (
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 transition">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-900">{t('support.whatsappUs')}</div>
                  <div className="text-xs text-stone-600 truncate">{whatsapp}</div>
                </div>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 transition">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-900">{t('support.emailUs')}</div>
                  <div className="text-xs text-stone-600 truncate">{email}</div>
                </div>
              </a>
            )}
          </div>
        </div>
      )}

      <button ref={toggleRef} onClick={() => setOpen((o) => !o)}
        aria-label={open ? t('common.close') : t('support.needHelp')}
        className="fixed bottom-6 right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center transition">
        {open ? <X className="w-6 h-6" /> : <Headphones className="w-6 h-6" />}
      </button>
    </>
  );
}

// ============================================================
// SHARE MENU — share a product link to WhatsApp / social / email.
// On devices that support the native Web Share API (mostly mobile) the
// trigger opens the OS share sheet directly. Elsewhere it falls back to a
// dropdown of explicit targets plus a copy-link action. The shared URL is an
// absolute link to the product detail page so it opens correctly from any app.
// ============================================================
export function ShareMenu({ product, className = '' }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // routeToPath gives the in-app path ("/products/:id"); prefix the current
  // origin so the link resolves when opened outside the app (WhatsApp, mail…).
  const path = routeToPath('product', { id: product.id });
  const url = typeof window !== 'undefined' ? window.location.origin + path : path;
  const title = product.name;
  const text = t('share.message', { name: product.name });

  const eUrl = encodeURIComponent(url);
  const eText = encodeURIComponent(text);
  const eTitle = encodeURIComponent(title);

  // Web-intent links — each opens that platform's share dialog in a new tab.
  // WhatsApp's wa.me carries the message + link together as one text blob.
  const targets = [
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#25D366',
      href: `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}` },
    { key: 'facebook', label: 'Facebook', icon: Globe, color: '#1877F2',
      href: `https://www.facebook.com/sharer/sharer.php?u=${eUrl}` },
    { key: 'x', label: 'X', icon: X, color: '#0f1419',
      href: `https://twitter.com/intent/tweet?url=${eUrl}&text=${eText}` },
    { key: 'telegram', label: 'Telegram', icon: Send, color: '#229ED9',
      href: `https://t.me/share/url?url=${eUrl}&text=${eText}` },
    { key: 'email', label: t('share.email'), icon: Mail, color: '#6b7280',
      href: `mailto:?subject=${eTitle}&body=${encodeURIComponent(text + '\n\n' + url)}` },
  ];

  const onTrigger = async () => {
    // Native share sheet first: one tap → OS picker of every installed app.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title, text, url }); return; }
      catch { return; /* user dismissed the sheet — leave the menu closed */ }
    }
    setOpen((o) => !o);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.push(t('share.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push(t('share.copyFailed'), 'error');
    }
  };

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button type="button" onClick={onTrigger} aria-label={t('share.label')} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 text-stone-600 hover:text-emerald-700 hover:border-emerald-300 transition text-sm font-medium">
        <Share2 className="w-4 h-4" /> {t('share.label')}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-sm z-50">
          {targets.map((s) => (
            <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" role="menuitem"
              onClick={() => setOpen(false)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-slate-700 text-stone-700 dark:text-stone-200">
              <s.icon className="w-4 h-4" style={{ color: s.color }} /> {s.label}
            </a>
          ))}
          <button type="button" onClick={copyLink} role="menuitem"
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-slate-700 text-stone-700 dark:text-stone-200 border-t border-stone-100 dark:border-slate-700">
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <LinkIcon className="w-4 h-4 text-stone-500" />}
            {copied ? t('share.copied') : t('share.copyLink')}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PRODUCT CARD
// ============================================================
export function ProductCard({ product, onClick, onAdd }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const wishlist = useWishlist();
  const toast = useToast();
  const isWished = isAuthenticated && wishlist.has(product.id);

  const onHeart = async (e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.push(t('auth.signInRequired'), 'info');
      return;
    }
    try { await wishlist.toggle(product.id); }
    catch { toast.push(t('errors.couldNotSave', { name: t('wishlist.title') }), 'error'); }
  };

  return (
    <div onClick={onClick} className="luxury-card group bg-white rounded-2xl cursor-pointer overflow-hidden">
      <div className="luxury-card-image relative aspect-[3/4] bg-gradient-to-br from-amber-50 via-rose-50 to-amber-100 flex items-center justify-center text-7xl">
        <ProductImage src={product.image} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
        {product.isOrganic && (
          // Repurposed as the "Premium / Heritage" tag for sarees & lehengas
          // (locale key `products.organic` now renders "PREMIUM").
          <span className="luxury-badge absolute top-3 left-3">{t('products.organic')}</span>
        )}
        {/* Savings badge — top-left on non-premium, stacked below the
            PREMIUM pill when both apply. Hidden when there's no effective
            discount. Rose accent keeps it on-brand with the luxury palette. */}
        {product.discount_percent > 0 && (
          <span className={`absolute ${product.isOrganic ? 'top-12' : 'top-3'} left-3 text-white text-[10px] font-bold px-2 py-1 rounded-full`} style={{ background: 'linear-gradient(135deg, #c14b6a 0%, #7a1f2a 100%)' }}>
            {t('common.off', { percent: Math.round(product.discount_percent) })}
          </span>
        )}
        {product.stock === 0 && (
          <span className="absolute inset-0 bg-stone-900/40 flex items-center justify-center">
            <span className="bg-white text-stone-900 text-xs font-bold px-3 py-1 rounded-full">{t('common.outOfStock')}</span>
          </span>
        )}
        <button onClick={onHeart}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition shadow-sm ${isWished ? 'text-white' : 'bg-white/95 text-stone-600 hover:bg-white'}`}
          style={isWished ? { background: 'linear-gradient(135deg, #c14b6a 0%, #7a1f2a 100%)' } : undefined}>
          <Heart className={`w-4 h-4 ${isWished ? 'fill-current' : ''}`} />
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1 text-xs mb-2" style={{ color: '#c89b3c' }}>
          <Star className="w-3 h-3 fill-current" />
          <span className="font-semibold">{product.rating}</span>
          <span className="text-stone-400">({product.reviews})</span>
        </div>
        <h3 className="font-luxury text-lg leading-snug text-stone-900 mb-1 transition">{product.name}</h3>
        <p className="text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-3">{product.freshness}</p>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-bold" style={{ color: '#4a0f1a' }}>{formatCurrency(product.price)}</span>
            {/* Strikethrough MRP appears only when discounted. mrp comes from
                the backend serializer alongside price; equal values mean
                "no discount" — keep the field hidden so the card stays clean. */}
            {product.mrp != null && product.mrp > product.price && (
              <span className="text-xs text-stone-400 line-through ml-1.5">{formatCurrency(product.mrp)}</span>
            )}
            <span className="text-xs text-stone-500">/{product.unit}</span>
          </div>
          <button
            disabled={product.stock === 0}
            onClick={(e) => { e.stopPropagation(); onAdd(product); }}
            className="luxury-cta disabled:!bg-stone-300 disabled:!cursor-not-allowed disabled:!shadow-none p-2.5 rounded-full">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FORM FIELD — labelled input with inline error
// ============================================================
export function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-700 mb-1.5 block">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
      {!error && hint && <span className="text-xs text-stone-500 mt-1 block">{hint}</span>}
    </label>
  );
}

const inputClass = (error) =>
  `w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition ${
    error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
      : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-100'
  }`;

export function TextInput({ error, ...props }) {
  return <input {...props} className={inputClass(error)} />;
}

export function SelectInput({ error, children, ...props }) {
  return <select {...props} className={`${inputClass(error)} bg-white`}>{children}</select>;
}

export function TextArea({ error, ...props }) {
  return <textarea {...props} className={inputClass(error)} />;
}
